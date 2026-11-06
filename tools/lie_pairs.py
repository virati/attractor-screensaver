#!/usr/bin/env python3
"""Lie-bracket attractors: [f, g] for pairs of dysts systems, computed with autoLie.

For two flows f and g from dysts, the bracket

    [f, g](x) = (df/dx) g(x) - (dg/dx) f(x)          (autoLie's convention)

is itself a vector field on R^3, and sometimes it has a strange attractor of
its own. This tool builds that field, checks it, and writes it out as an entry
the screensaver can integrate on the GPU like any other system.

  * The bracket is traced to a closed form with autolie.symbolics.codegen and
    printed as GLSL, and the closed form is checked against autoLie's
    autograd bracket (lie_lib.bracket_field) on the attractor itself. A pair
    whose two answers disagree is not written.
  * The field is then run through the same fixed-step RK4 the shader uses,
    from several seeds, to find a dt, a seed and a view where it is bounded,
    does not collapse to a point, and (for `search`) is chaotic. [g, f] is the
    same field run backwards, so when [f, g] escapes the reverse is tried.
  * The shader is compiled with glslangValidator when it is installed.

Kept pairs live in tools/lie-pairs.json; src/lie-attractors.js is generated
from it. Usage, from the repo root with the venv that has autoLie installed:

    python tools/lie_pairs.py add Lorenz Rossler     # build [Lorenz, Rossler] and keep it
    python tools/lie_pairs.py search --count 20      # screen random pairs, keep the chaotic ones
    python tools/lie_pairs.py list                   # what dysts systems can be paired
    python tools/lie_pairs.py render                 # regenerate the JS from the JSON
    python tools/lie_pairs.py remove Lorenz Rossler
"""

import argparse
import json
import math
import random
import shutil
import subprocess
import sys
import tempfile
import types
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", message="Numba not installed")

import autograd.numpy as anp  # noqa: E402
import dysts.flows  # noqa: E402
import numpy as onp  # noqa: E402
import sympy as sym  # noqa: E402
from autolie.lie_lib import bracket_field  # noqa: E402
from autolie.op_plus import operable  # noqa: E402
from autolie.symbolics.codegen import bracket, glsl, symbolize  # noqa: E402
from dysts.systems import get_attractor_list  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / "tools" / "lie-pairs.json"
OUT = ROOT / "src" / "lie-attractors.js"
X = sym.symbols("x y z")

# The renderer takes 60 RK4 steps a second. Reusser's Lorenz (dt 0.005) moves
# about this fraction of the attractor's width per step; giving every bracket
# the same pace keeps them from crawling or strobing. See `calibrate`.
PACE = 0.012
ESCAPE = 1e3          # the shader starts pulling particles back at |p| = 1000
PARTICLES = 96


# --- systems -----------------------------------------------------------------

class System:
    """One dysts flow, as sympy expressions and as an autograd operable."""

    def __init__(self, name):
        cls = getattr(dysts.flows, name)
        inst = cls()
        md = inst.metadata
        if inst.dimension != 3:
            raise ValueError(f"{name} is {inst.dimension}-dimensional")
        if md.get("nonautonomous") or md.get("delay"):
            raise ValueError(f"{name} is not an autonomous ODE")
        params = {k: v for k, v in inst.params.items()}
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in params.values()):
            raise ValueError(f"{name} has non-scalar parameters")

        rhs = getattr(cls._rhs, "py_func", cls._rhs)
        self.name = name
        self.params = params
        self.description = md.get("description", "")
        self.citation = md.get("citation", "")
        self.ic = onp.asarray(inst.ic, dtype=float)
        self.mean = onp.asarray(md.get("mean", [0, 0, 0]), dtype=float)
        self.std = onp.asarray(md.get("std", [1, 1, 1]), dtype=float)

        exprs = symbolize(rhs)(*X, sym.Integer(0), **params)
        self.exprs = [sym.sympify(e) for e in exprs]
        if any(e.free_symbols - set(X) for e in self.exprs):
            raise ValueError(f"{name} depends on something other than x, y, z")

        ag = types.FunctionType(rhs.__code__, {**rhs.__globals__, "np": anp}, rhs.__name__)
        self.field = operable(lambda p, args: anp.array(list(ag(p[0], p[1], p[2], 0.0, **params))))


def eligible():
    names = []
    for name in get_attractor_list():
        try:
            System(name)
            names.append(name)
        except Exception:
            pass
    return names


# --- the bracket ---------------------------------------------------------------

class Bracket:
    def __init__(self, f: System, g: System):
        self.f, self.g = f, g
        self.exprs = bracket(f.exprs, g.exprs, X)
        self.glsl = [glsl(e) for e in self.exprs]  # raises on DiracDelta and friends
        fn = sym.lambdify([X], self.exprs, "numpy")

        def vec(P):  # P: (3, N)
            out = fn(P)
            return onp.stack([onp.broadcast_to(onp.asarray(c, dtype=float), P.shape[1:]) for c in out])

        self.vec = vec
        self.autolie = bracket_field(f.field, g.field)

    def check_against_autolie(self, points, rtol=1e-6):
        """The closed form must agree with autoLie's autograd bracket."""
        worst = 0.0
        for p in points:
            a = onp.asarray(self.autolie(anp.array(p), None), dtype=float)
            b = self.vec(p.reshape(3, 1))[:, 0]
            worst = max(worst, onp.linalg.norm(a - b) / max(onp.linalg.norm(a), 1e-12))
        return worst <= rtol, worst


# --- screening -----------------------------------------------------------------

def sphere(n, rng):
    v = rng.normal(size=(3, n))
    v /= onp.linalg.norm(v, axis=0)
    return v * rng.uniform(size=n) ** (1 / 3)


def rk4(V, P, dt):
    k1 = V(P)
    k2 = V(P + 0.5 * dt * k1)
    k3 = V(P + 0.5 * dt * k2)
    k4 = V(P + dt * k3)
    return P + dt / 6 * (k1 + 2 * (k2 + k3) + k4)


def spread(P):
    lo, hi = onp.percentile(P, [5, 95], axis=1)
    return float(onp.max(hi - lo))


def screen(V, origin, scale, rng, steps=4000):
    """Run the field like the shader would and measure what it settles into."""
    with onp.errstate(all="ignore"):
        P = origin[:, None] + scale * sphere(PARTICLES, rng)
        speed = onp.median(onp.linalg.norm(V(P), axis=0))
        if not (speed > 0 and onp.isfinite(speed)):
            return None
        dt = PACE * max(scale, 1e-3) / speed

        # Burn in, retuning dt to the cloud's current size and speed so the pace
        # tracks the attractor rather than the seed blob.
        for _ in range(8):
            for _ in range(steps // 8):
                P = rk4(V, P, dt)
            alive = onp.all(onp.isfinite(P), axis=0) & (onp.linalg.norm(P, axis=0) < ESCAPE)
            if alive.mean() < 0.5:
                return None
            Q = P[:, alive]
            ext = spread(Q)
            sp = onp.median(onp.linalg.norm(V(Q), axis=0))
            if not (ext > 1e-6 and sp > 1e-12):
                return None
            dt = float(onp.clip(PACE * ext / sp, dt / 4, dt * 4))

        # Measure, with a twin of each particle for a Lyapunov estimate.
        P = P[:, alive]
        T = P + 1e-7 * ext * sphere(P.shape[1], rng)
        trail, logs = [], 0.0
        renorm = 10
        for i in range(steps):
            P, T = rk4(V, P, dt), rk4(V, T, dt)
            if i % renorm == renorm - 1:
                d = onp.linalg.norm(T - P, axis=0)
                d0 = 1e-7 * ext
                ok = d > 0
                logs += onp.mean(onp.log(d[ok] / d0)) if ok.any() else 0.0
                T = P + (T - P) * (d0 / onp.where(d > 0, d, 1))
            if i % 4 == 0:
                trail.append(P.copy())
        trail = onp.stack(trail)  # (S, 3, N)

        final = onp.all(onp.isfinite(P), axis=0) & (onp.linalg.norm(P, axis=0) < ESCAPE)
        if final.mean() < 0.8:
            return None
        trail = trail[:, :, final]
        cloud = trail.transpose(1, 0, 2).reshape(3, -1)
        ext = spread(cloud)
        if not ext > 1e-6:
            return None
        # A particle that has stopped moving has found a fixed point.
        moving = onp.std(trail, axis=0).max(axis=0) > 0.02 * ext
        if moving.mean() < 0.5:
            return None
        sp = onp.median(onp.linalg.norm(V(cloud), axis=0))
        # Lyapunov exponent in units of attractor crossings: > 0 means chaos.
        lyap = logs / (steps * dt) * (ext / sp)

        lo, hi = onp.percentile(cloud, [2, 98], axis=1)
        return {
            "dt": float(dt),
            "extent": ext,
            "lyapunov": float(lyap),
            "center": ((lo + hi) / 2).tolist(),
            "size": float(onp.max(hi - lo)),
            "origin": [float(v) for v in origin],
            "scale": float(scale),
            "samples": cloud[:, rng.choice(cloud.shape[1], 12, replace=False)].T,
        }


def seeds(f, g):
    out = [(onp.zeros(3), 1.0)]
    for s in (f, g):
        out.append((s.ic, max(0.1, float(onp.linalg.norm(s.std)) / 4)))
        out.append((s.mean, max(0.1, float(onp.linalg.norm(s.std)) / 2)))
    return out


def best_run(br, f, g, rng):
    runs = [r for o, s in seeds(f, g) if (r := screen(br.vec, onp.asarray(o, float), s, rng))]
    return max(runs, key=lambda r: r["lyapunov"]) if runs else None


def compile_check(entry):
    """Compile the integrator's derivative with glslangValidator, if it is here."""
    tool = shutil.which("glslangValidator")
    if not tool:
        return True, "glslangValidator not installed; skipped"
    src = (
        "#version 300 es\nprecision highp float;\nout vec4 o;\n"
        "vec3 derivative (float x, float y, float z, float t) {\n  return vec3(\n"
        + entry["deriv"] + "\n  );\n}\nvoid main () { o = vec4(derivative(1.0, 2.0, 3.0, 0.0), 1.0); }\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".frag", delete=False) as fh:
        fh.write(src)
    r = subprocess.run([tool, fh.name], capture_output=True, text=True)
    Path(fh.name).unlink()
    return r.returncode == 0, (r.stdout + r.stderr).strip()


# --- building an entry -----------------------------------------------------------

def try_pair(fname, gname, rng, want_chaos=False, keep_anyway=False, log=print):
    try:
        f, g = System(fname), System(gname)
    except Exception as e:
        log(f"  skip: {e}")
        return None
    for a, b in ((f, g), (g, f)):
        label = f"[{a.name}, {b.name}]"
        try:
            br = Bracket(a, b)
        except Exception as e:
            log(f"  {label}: no closed form ({e})")
            return None
        run = best_run(br, a, b, rng)
        if not run:
            log(f"  {label}: escapes or collapses")
            continue
        ok, worst = br.check_against_autolie(run["samples"])
        if not ok:
            log(f"  {label}: closed form disagrees with autoLie (rel. error {worst:.2e}); not kept")
            return None
        kind = "chaotic" if run["lyapunov"] > 0.02 else "regular"
        log(f"  {label}: bounded, {kind} (lyapunov {run['lyapunov']:.3f}/crossing), "
            f"matches autoLie to {worst:.1e}")
        if want_chaos and kind != "chaotic":
            return None
        entry = make_entry(a, b, br, run, worst)
        ok, msg = compile_check(entry)
        if not ok:
            log(f"  {label}: GLSL does not compile:\n{msg}")
            return None
        return entry
    if not keep_anyway:
        return None
    # Asked for by name, so show it even though neither order has a bounded
    # attractor: seed it where f lives and let the renderer's own framing cope.
    br = Bracket(f, g)
    run = fallback_run(br, f)
    if not run:
        log(f"  [{f.name}, {g.name}]: zero or non-finite everywhere it was seeded; nothing to draw")
        return None
    ok, worst = br.check_against_autolie(run["samples"])
    if not ok:
        log(f"  closed form disagrees with autoLie (rel. error {worst:.2e}); not kept")
        return None
    log(f"  keeping [{f.name}, {g.name}] anyway, unbounded: expect particles to fly off and be re-seeded")
    entry = make_entry(f, g, br, run, worst)
    ok, msg = compile_check(entry)
    if not ok:
        log(f"  GLSL does not compile:\n{msg}")
        return None
    return entry


def fallback_run(br, f):
    origin = f.mean
    scale = max(0.1, float(onp.linalg.norm(f.std)) / 2)
    rng = onp.random.default_rng(0)
    P = origin[:, None] + scale * sphere(PARTICLES, rng)
    with onp.errstate(all="ignore"):
        speed = onp.median(onp.linalg.norm(br.vec(P), axis=0))
    if not (speed > 0 and onp.isfinite(speed)):
        return None
    return {
        "dt": float(PACE * scale / speed),
        "lyapunov": float("nan"),
        "center": origin.tolist(),
        "size": 4 * scale,
        "origin": origin.tolist(),
        "scale": scale,
        "samples": P[:, :12].T,
        "unbounded": True,
        # Re-seed particles that wander past twice the view's half-width.
        "respawn": 4 * scale,
    }


def make_entry(f, g, br, run, err):
    lyap = run["lyapunov"]
    if run.get("unbounded"):
        behaviour = (
            "Neither [f, g] nor [g, f] has a bounded attractor at these "
            "parameters: from every seed tried, particles either escape to "
            "infinity or stall at a fixed point. What you see is the field's "
            "flow near f's attractor, each particle re-seeded there once it "
            "runs away. When f and g both have constant divergence, as Lorenz "
            "and most of Sprott's systems do, the bracket is volume-preserving "
            "and cannot have an attractor at all."
        )
    elif lyap > 0.02:
        behaviour = (
            "Its own flow is chaotic: nearby particles separate at roughly "
            f"e^{lyap:.2f} per crossing of the attractor."
        )
    else:
        behaviour = (
            "Its own flow settles onto something regular rather than chaotic: "
            "the particles trace closed or quasi-periodic loops."
        )
    return {
        "name": f"[{f.name}, {g.name}]",
        "f": f.name,
        "g": g.name,
        "deriv": ",\n".join("    " + c for c in br.glsl),
        "params": {},
        **({"respawn": float(f"{run['respawn']:.4g}")} if run.get("respawn") else {}),
        "dt": float(f"{run['dt']:.4g}"),
        "initScale": float(f"{run['scale']:.4g}"),
        "initOrigin": [float(f"{v:.4g}") for v in run["origin"]],
        "view": {
            "center": [float(f"{v:.4g}") for v in run["center"]],
            "size": [float(f"{run['size']:.4g}")] * 3,
            "rotation": [1.5707963268, 0, 0],
        },
        "refs": [{
            "title": f"Lie bracket of {f.name} and {g.name}, by autoLie",
            "authors": ["dysts", "autoLie"],
        }],
        "history": {
            "origin": f"[{f.name}, {g.name}] · a Lie bracket of two dysts systems",
            "text": [
                f"This is neither system. It is the Lie bracket of two of them, "
                f"[f, g] = (∂f/∂x) g − (∂g/∂x) f, with f the {f.name} flow and g "
                f"the {g.name} flow, at their published parameters. The bracket "
                "measures how far the two flows fail to commute: follow f then g "
                "for a moment, then f and g backwards, and you miss where you "
                "started by an amount proportional to [f, g].",
                f"f — {f.name}: {f.description} {f.citation}".strip(),
                f"g — {g.name}: {g.description} {g.citation}".strip(),
                behaviour,
                "The bracket was traced to closed form, printed as GLSL, and "
                f"checked against autoLie's autograd bracket on the attractor "
                f"(agreement to {err:.0e}). [g, f] is the same field reversed: "
                "the same curves, run backwards, so its attractors are this "
                "one's repellers.",
            ],
            "sources": ["https://github.com/williamgilpin/dysts", "https://github.com/virati/autoLie"],
        },
        "lie": {
            "lyapunov": None if math.isnan(lyap) else float(f"{lyap:.4g}"),
            "bounded": not run.get("unbounded", False),
            "autolieError": float(f"{err:.2e}"),
        },
    }


# --- storage and output ----------------------------------------------------------

def load():
    return json.loads(STORE.read_text()) if STORE.exists() else []


def save(entries):
    entries = sorted(entries, key=lambda e: e["name"])
    STORE.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n")
    render(entries)


def render(entries=None):
    entries = load() if entries is None else entries
    lines = [
        "// Generated by tools/lie_pairs.py from tools/lie-pairs.json. Do not edit.",
        "// Each entry is the Lie bracket [f, g] = (df/dx) g - (dg/dx) f of two dysts",
        "// systems, computed with autoLie. Regenerate: python tools/lie_pairs.py render",
        "",
        "export const LIE_ATTRACTORS = [",
    ]
    for e in entries:
        lines.append("  {")
        for key, value in e.items():
            if key == "deriv":
                lines.append(f"    deriv: `\n{value}`,")
            else:
                lines.append(f"    {key}: {json.dumps(value, ensure_ascii=False)},")
        lines.append("  },")
    lines.append("];")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(entries)} brackets)")


# --- commands ----------------------------------------------------------------------

def cmd_add(args):
    rng = onp.random.default_rng(args.seed)
    entries = load()
    print(f"[{args.f}, {args.g}]")
    entry = try_pair(args.f, args.g, rng, keep_anyway=not args.strict)
    if not entry:
        print("not kept")
        return 1
    entries = [e for e in entries if {e["f"], e["g"]} != {entry["f"], entry["g"]}] + [entry]
    save(entries)
    return 0


def cmd_search(args):
    rng = onp.random.default_rng(args.seed)
    pick = random.Random(args.seed)
    names = eligible()
    entries = load()
    have = {frozenset((e["f"], e["g"])) for e in entries}
    kept = tried = 0
    while kept < args.count and tried < args.tries:
        a, b = pick.sample(names, 2)
        if frozenset((a, b)) in have:
            continue
        tried += 1
        have.add(frozenset((a, b)))
        print(f"{tried:3d}. [{a}, {b}]")
        entry = try_pair(a, b, rng, want_chaos=True)
        if entry:
            entries.append(entry)
            kept += 1
            save(entries)
    print(f"kept {kept} of {tried} pairs tried")
    return 0


def cmd_remove(args):
    entries = load()
    left = [e for e in entries if {e["f"], e["g"]} != {args.f, args.g}]
    if len(left) == len(entries):
        print("no such pair")
        return 1
    save(left)
    return 0


def cmd_name(args):
    """Print the entry name a pair is stored under ([f, g] or [g, f]), if any."""
    for e in load():
        if {e["f"], e["g"]} == {args.f, args.g}:
            print(e["name"])
            return 0
    return 1


def cmd_list(args):
    print(" ".join(eligible()))
    return 0


def cmd_render(args):
    render()
    return 0


def cmd_calibrate(args):
    """Where PACE comes from: the classic Lorenz's step as a fraction of its width."""
    s = System("Lorenz")
    fn = sym.lambdify([X], s.exprs, "numpy")
    V = lambda P: onp.stack([onp.broadcast_to(onp.asarray(c, float), P.shape[1:]) for c in fn(P)])  # noqa: E731
    P = s.ic[:, None] + sphere(64, onp.random.default_rng(0))
    for _ in range(4000):
        P = rk4(V, P, 0.005)
    trail = []
    for _ in range(2000):
        P = rk4(V, P, 0.005)
        trail.append(P.copy())
    cloud = onp.concatenate(trail, axis=1)
    sp = onp.median(onp.linalg.norm(V(cloud), axis=0))
    print(f"Lorenz at dt 0.005: pace = dt * speed / width = {0.005 * sp / spread(cloud):.4f}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("add", help="screen one ordered pair and keep it if it works")
    p.add_argument("f")
    p.add_argument("g")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--strict", action="store_true",
                   help="only keep the pair if [f, g] or [g, f] has a bounded attractor")
    p.set_defaults(fn=cmd_add)
    p = sub.add_parser("search", help="screen random pairs and keep the chaotic ones")
    p.add_argument("--count", type=int, default=10, help="how many to keep")
    p.add_argument("--tries", type=int, default=200, help="give up after this many pairs")
    p.add_argument("--seed", type=int, default=0)
    p.set_defaults(fn=cmd_search)
    p = sub.add_parser("remove", help="drop a kept pair")
    p.add_argument("f")
    p.add_argument("g")
    p.set_defaults(fn=cmd_remove)
    sub.add_parser("list", help="dysts systems that can be paired").set_defaults(fn=cmd_list)
    p = sub.add_parser("name", help="the stored entry name for a pair, if kept")
    p.add_argument("f")
    p.add_argument("g")
    p.set_defaults(fn=cmd_name)
    sub.add_parser("render", help="regenerate src/lie-attractors.js").set_defaults(fn=cmd_render)
    sub.add_parser("calibrate", help=argparse.SUPPRESS).set_defaults(fn=cmd_calibrate)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
