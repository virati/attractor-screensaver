"""Generate src/dysts.js from the dysts catalogue of chaotic systems.

    uv venv .venv && uv pip install --python .venv/bin/python dysts sympy
    .venv/bin/python tools/gen-dysts.py

dysts (Gilpin, https://github.com/williamgilpin/dysts) writes each system as a
Python right-hand side plus a JSON record of parameters, initial conditions and a
characteristic period. This script turns those into entries in the same shape as
src/attractors.js:

  1. Trace. Each `_rhs` is called with sympy symbols in place of numbers, with
     `np` swapped for a shim that answers in sympy, which recovers the equations
     as expressions. They are checked against dysts's own `rhs` at random points
     before anything else happens.
  2. Print. The expressions are printed as GLSL, with integer powers written out
     as products: GLSL's pow() is undefined for a negative base.
  3. Settle. A float32 RK4 that mirrors the shader runs a batch of particles to
     pick a step size and a substep count that keep them bounded, and to find
     where they settle, which sets the view.

What is left out, and why, is printed at the end and written into the module
header. Systems already in Reusser's set are skipped in favour of his tuned
versions. 1D maps, delay equations and flows of more than four dimensions do
not fit the renderer: the state is one RGBA texel.
"""

import inspect
import json
import math
import sys
import types
import warnings
from pathlib import Path

warnings.filterwarnings('ignore')

import numpy as np
import sympy as sp
from sympy.printing.glsl import GLSLPrinter

import dysts
import dysts.flows as FLOWS
import dysts.maps as MAPS
from dysts.base import DynMap, DynSys, DynSysDelay

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'dysts.js'
CHECK = ROOT / 'tools' / 'dysts-check.json'   # test vectors for check-dysts.mjs

# dysts name -> Reusser name, for systems both sets carry. Reusser's versions
# win: their views are hand-tuned and the history panel has notes on them.
DUPLICATES = {
    'Aizawa': 'Aizawa', 'AnishchenkoAstakhov': 'Anishchenko-Astakhov',
    'Arneodo': 'Arneodo', 'Bouali': 'Bouali', 'Bouali2': 'Bouali 2',
    'BurkeShaw': 'Burke-Shaw', 'Chen': 'Chen', 'ChenLee': 'Chen-Lee',
    'Coullet': 'Coullet', 'Dadras': 'Dadras', 'Duffing': 'Duffing',
    'Finance': 'Finance', 'GenesioTesi': 'Genesio-Tesi', 'Hadley': 'Hadley',
    'Halvorsen': 'Halvorsen', 'LiuChen': 'Liu-Chen', 'Lorenz': 'Lorenz',
    'Lorenz84': 'Lorenz 1984', 'LuChen': 'Lü-Chen',
    'NewtonLiepnik': 'Newton-Leipnik', 'NoseHoover': 'Nosé-Hoover',
    'QiChen': 'Qi-Chen', 'RabinovichFabrikant': 'Rabinovich-Fabrikant',
    'RayleighBenard': 'Rayleigh-Benard', 'Rossler': 'Rössler',
    'Rucklidge': 'Rucklidge', 'Sakarya': 'Sakarya', 'Thomas': 'Thomas',
    'Tsucs2': 'TSUCS2', 'WangSun': 'Wang-Sun', 'YuWang': 'Yu-Wang',
}

STATE = ['x', 'y', 'z', 'w']
TAU = 2 * math.pi

# Frames of trail per characteristic period. Reusser's hand-picked steps work
# out to a median of ~295 frames per dysts period over the 23 shared systems.
FRAMES_PER_PERIOD = 300
BURN_IN = 600          # frames, as Simulation.spinUp
TRAIL = 180            # frames, the default `steps`
SUBSTEPS = [1, 2, 3, 4, 6, 8, 12, 16]

# Identifiers a parameter may not take: GLSL keywords and built-ins, the
# integrator's own names, and the state and time arguments of derivative().
GLSL_TAKEN = set("""
attribute const uniform varying layout centroid flat smooth noperspective break
continue do for while switch case default if else in out inout float int void
bool true false invariant discard return mat2 mat3 mat4 vec2 vec3 vec4 ivec2
ivec3 ivec4 bvec2 bvec3 bvec4 uint uvec2 uvec3 uvec4 lowp mediump highp
precision sampler2D sampler3D struct asm class union enum typedef template this
goto inline noinline volatile public static extern external interface long
short double half fixed unsigned superp input output sizeof cast namespace using
filter common partition active sample patch radians degrees sin cos tan asin acos
atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt abs
sign floor trunc round ceil fract mod min max clamp mix step smoothstep length
distance dot cross normalize reflect refract isnan isinf main derivative D F p
row dt k1 k2 k3 k4 m quasirandom sphericalRandom fragColor
""".split()) | set(STATE) | {'t'}


def safe_name(name):
    taken = name in GLSL_TAKEN or (name.startswith('u') and name[1:2].isupper())
    return name + '0' if taken else name


# Where splitting the class name on capitals reads wrong.
NAMES = {
    'ForcedFitzHughNagumo': 'Forced FitzHugh-Nagumo',
    'ForcedVanDerPol': 'Forced Van der Pol',
    'CaTwoPlus': 'Ca2+ Oscillation',
    'CaTwoPlusQuasiperiodic': 'Ca2+ Quasiperiodic',
    'YuWang2': 'Yu Wang 2',
}


def display_name(cls_name, is_map):
    if cls_name in NAMES:
        return NAMES[cls_name]
    words, cur = [], ''
    for i, ch in enumerate(cls_name):
        if ch.isupper() and cur and not (cur[-1].isupper() and (i + 1 == len(cls_name) or cls_name[i + 1].isupper())):
            words.append(cur)
            cur = ch
        else:
            cur += ch
    words.append(cur)
    name = ' '.join(words)
    return name + ' map' if is_map else name


# --- tracing -------------------------------------------------------------------

def _heaviside(u, h0=0):
    return sp.Piecewise((0, u < 0), (h0, sp.Eq(u, 0)), (1, True))


SHIM = types.SimpleNamespace(
    sin=sp.sin, cos=sp.cos, tan=sp.tan, exp=sp.exp, sqrt=sp.sqrt, tanh=sp.tanh,
    sinh=sp.sinh, cosh=sp.cosh, abs=sp.Abs, sign=sp.sign, arctan=sp.atan,
    arctan2=sp.atan2, arcsin=sp.asin, arccos=sp.acos, log=sp.log, pi=sp.pi,
    e=sp.E, floor=sp.floor, power=sp.Pow, heaviside=_heaviside,
)


def rebind(fn):
    g = dict(fn.__globals__)
    g['np'] = SHIM
    return types.FunctionType(fn.__code__, g, fn.__name__, fn.__defaults__, fn.__closure__)


def find_rhs(cls):
    for klass in cls.__mro__:
        if '_rhs' in klass.__dict__:
            f = klass.__dict__['_rhs']
            f = f.__func__ if isinstance(f, staticmethod) else f
            return 'static', getattr(f, 'py_func', f)
        if 'rhs' in klass.__dict__ and klass not in (DynSys, DynMap):
            return 'method', klass.__dict__['rhs']
    raise LookupError('no rhs')


def trace(cls, inst, is_map):
    """Return (state names, param names, expressions) in the system's own names."""
    kind, fn = find_rhs(cls)
    fn = rebind(fn)
    params = list(inst.params.keys())
    if kind == 'static':
        args = list(inspect.signature(fn).parameters)
        n = len(args) - len(params) - (0 if is_map else 1)
        state = args[:n]
        if args[n:] != (params if is_map else ['t'] + params):
            # dysts passes parameters in sorted order; trust the signature.
            params = args[n + (0 if is_map else 1):]
        syms = [sp.Symbol(a) for a in args]
        out = fn(*syms)
    else:
        n = len(inst.ic)
        state = [f's{i}' for i in range(n)]
        fake = types.SimpleNamespace(**{k: sp.Symbol(k) for k in params})
        out = fn(fake, [sp.Symbol(s) for s in state], sp.Symbol('t'))
    if not isinstance(out, (tuple, list)):
        raise TypeError('scalar map (1D)')
    return state, params, [sp.sympify(e) for e in out]


# --- printing ------------------------------------------------------------------

def f(v):
    s = repr(float(v))
    if 'e' in s:
        mant, exp = s.split('e')
        s = (mant if '.' in mant else mant + '.0') + 'e' + exp
    return s if ('.' in s or 'e' in s or 'inf' in s or 'nan' in s) else s + '.0'


class Printer(GLSLPrinter):
    _kf = dict(GLSLPrinter._kf if hasattr(GLSLPrinter, '_kf') else {})
    for _n in ['sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'log', 'floor']:
        _kf[_n] = _n

    def __init__(self, settings=None):
        super().__init__(settings)
        self.known_functions.update({n: n for n in ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'log', 'floor', 'sqrt']})

    def _print_Integer(self, e):
        return f(int(e))

    def _print_Float(self, e):
        return f(float(e))

    def _print_Rational(self, e):
        return f'({f(e.p)} / {f(e.q)})'

    def _print_NumberSymbol(self, e):
        return f(float(e))

    def _print_Pi(self, e):
        return f(math.pi)

    def _print_Exp1(self, e):
        return f(math.e)

    def _print_Pow(self, e):
        b, x = e.as_base_exp()
        base = self.parenthesize(b, 100)
        if x.is_Integer and 1 <= abs(int(x)) <= 6:
            # Always parenthesised: the Mul printer thinks a Pow binds tighter
            # than '*', and 'b / x * x' is not b / x².
            prod = ' * '.join([base] * abs(int(x)))
            return f'({prod})' if x > 0 else f'(1.0 / ({prod}))'
        if x == sp.S.Half:
            return f'sqrt({self._print(b)})'
        if x == -sp.S.Half:
            return f'inversesqrt({self._print(b)})'
        return f'pow({self._print(b)}, {self._print(x)})'

    def _print_Abs(self, e):
        return f'abs({self._print(e.args[0])})'

    def _print_sign(self, e):
        return f'sign({self._print(e.args[0])})'

    def _print_atan2(self, e):
        return f'atan({self._print(e.args[0])}, {self._print(e.args[1])})'

    def _print_Piecewise(self, e):
        out = self._print(e.args[-1][0])
        for expr, cond in reversed(e.args[:-1]):
            out = f'(({self._print(cond)}) ? ({self._print(expr)}) : ({out}))'
        return out

    def _print_Equality(self, e):
        return f'{self._print(e.lhs)} == {self._print(e.rhs)}'

    def _print_Relational(self, e):
        return f'{self._print(e.lhs)} {e.rel_op} {self._print(e.rhs)}'

    def _print_BooleanTrue(self, e):
        return 'true'


PRINTER = Printer({'contract': False})


def glsl(expr):
    return PRINTER.doprint(expr)


# --- numerics ------------------------------------------------------------------

class System:
    def __init__(self, exprs, params, dim, is_map, phase):
        self.dim = dim
        self.is_map = is_map
        self.phase = phase
        self.wrap = False   # maps on the 2π torus: every coordinate taken mod 2π
        syms = [sp.Symbol(s) for s in STATE[:dim]] + [sp.Symbol('t')] + [sp.Symbol(p) for p in params]
        self.fn = sp.lambdify(syms, exprs, modules='numpy')

    def F(self, p, t, pv):
        out = self.fn(*[p[:, i] for i in range(self.dim)], np.float32(t), *pv)
        return np.stack([np.broadcast_to(np.asarray(o, dtype=np.float32), p.shape[:1]) for o in out], axis=1).astype(np.float32)


def shader_seed(particles, dim, origin, scale, phase):
    """The INIT_FRAG blob in simulation.js, point for point. Systems with more
    than one attractor (Gumowski-Mira) settle wherever their seeds start, so a
    mirror that seeds differently can pass a system the GPU then gets wrong."""
    n = np.arange(particles, dtype=np.float64) + 0.5   # gl_FragCoord.y
    g = 1.22074408460575947536
    r = np.mod(0.5 + n[:, None] * np.array([1 / g, 1 / g ** 2, 1 / g ** 3]), 1.0)[:, ::-1]
    u = r[:, 0] * 2 - 1
    th = TAU * r[:, 1]
    s = np.sqrt(1 - u * u)
    ball = np.stack([s * np.cos(th), s * np.sin(th), u], axis=1) * np.sqrt(r[:, 2:3])
    blob = np.concatenate([ball, (2 * np.mod(n * 0.7548776662, 1.0) - 1)[:, None]], axis=1)[:, :dim]
    p = origin[None, :dim] + scale * blob
    if phase is not None:
        p[:, phase] = TAU * np.mod(n * 0.6180339887, 1.0)
    return p.astype(np.float32)


def settle(sysm, pv, origin, scale, dt, substeps, particles=256, seed=0, escape=1e6):
    """Mirror the shader: burn in, then record the trail. Returns (trail, resets)."""
    rng = np.random.default_rng(seed)
    dim = sysm.dim
    blob = lambda n: (origin + scale * rng.uniform(-1, 1, (n, dim))).astype(np.float32)
    p = shader_seed(particles, dim, origin, scale, sysm.phase)
    t = 0.0
    resets = 0
    trail = []
    h = np.float32(dt)
    with np.errstate(all='ignore'):
        for frame in range(BURN_IN + TRAIL):
            for _ in range(substeps):
                if sysm.is_map:
                    p = sysm.F(p, t, pv)
                    t += 1.0
                else:
                    k1 = sysm.F(p, t, pv)
                    k2 = sysm.F(p + 0.5 * h * k1, t + 0.5 * dt, pv)
                    k3 = sysm.F(p + 0.5 * h * k2, t + 0.5 * dt, pv)
                    k4 = sysm.F(p + h * k3, t + dt, pv)
                    p = (p + (h / 6) * (k1 + k4 + 2 * (k2 + k3))).astype(np.float32)
                    t += dt
                if sysm.phase is not None:
                    p[:, sysm.phase] = np.mod(p[:, sysm.phase], TAU)
                if sysm.wrap:
                    p = np.mod(p, TAU).astype(np.float32)
                m = np.sum(np.where(np.arange(dim) == sysm.phase, 0, p) ** 2, axis=1)
                bad = ~(m < escape * 1e6)
                far = (m > escape) & ~bad
                if sysm.is_map:
                    bad |= far
                elif far.any():
                    p[far] *= 1e-4
                if bad.any() or far.any():
                    resets += int(bad.sum() + far.sum()) if frame >= BURN_IN else 0
                if bad.any():
                    p[bad] = blob(int(bad.sum()))
            if frame >= BURN_IN:
                trail.append(p.copy())
    return np.stack(trail), resets


def spread(trail, phase):
    pts = trail.reshape(-1, trail.shape[-1]).astype(np.float64)
    lo = np.percentile(pts, 1.5, axis=0)
    hi = np.percentile(pts, 98.5, axis=0)
    return pts, lo, hi


# --- main ----------------------------------------------------------------------

def collect():
    out = []
    for mod, base, is_map in [(FLOWS, DynSys, False), (MAPS, DynMap, True)]:
        for name, cls in inspect.getmembers(mod, inspect.isclass):
            if cls.__module__ != mod.__name__ or not issubclass(cls, base) or cls is base:
                continue
            out.append((name, cls, is_map))
    return out


def main():
    entries, skipped = [], []
    skip = lambda name, why: skipped.append((name, why))

    for cls_name, cls, is_map in collect():
        if not is_map and cls_name in DUPLICATES:
            skip(cls_name, f'already in the set as "{DUPLICATES[cls_name]}"')
            continue
        if issubclass(cls, DynSysDelay):
            skip(cls_name, 'delay equation')
            continue
        try:
            inst = cls()
        except Exception as e:
            skip(cls_name, f'cannot instantiate ({type(e).__name__})')
            continue
        dim = len(np.atleast_1d(inst.ic))
        if dim == 1:
            skip(cls_name, '1D map')
            continue
        if dim > 4:
            skip(cls_name, f'{dim}D, more than one RGBA texel holds')
            continue
        try:
            state, params, exprs = trace(cls, inst, is_map)
        except Exception as e:
            skip(cls_name, f'equations not traceable ({type(e).__name__}: {str(e)[:60]})')
            continue
        if len(exprs) != dim:
            skip(cls_name, 'rhs length does not match the state')
            continue

        # Rename state to x, y, z, w and parameters to GLSL-safe names.
        sub = {sp.Symbol(s): sp.Symbol(STATE[i]) for i, s in enumerate(state)}
        pnames = [safe_name(p) for p in params]
        sub.update({sp.Symbol(p): sp.Symbol(q) for p, q in zip(params, pnames)})
        exprs = [e.xreplace(sub) for e in exprs]
        pv = [float(inst.params[p]) for p in params]
        ic = np.asarray(inst.ic, dtype=np.float64)
        free = set().union(*[e.free_symbols for e in exprs])
        allowed = {sp.Symbol(s) for s in STATE[:dim]} | {sp.Symbol('t')} | {sp.Symbol(q) for q in pnames}
        if not free <= allowed:
            skip(cls_name, f'stray symbols {sorted(map(str, free - allowed))}')
            continue

        # Check the traced equations against dysts's own rhs.
        sysm = System(exprs, pnames, dim, is_map, None)
        rng = np.random.default_rng(1)
        X = ic + 0.3 * (np.abs(ic) + 0.5) * rng.uniform(-1, 1, (6, dim))
        try:
            with np.errstate(all='ignore'):
                ref = np.array([np.asarray(inst.rhs(x) if is_map else inst.rhs(x, 0.7), dtype=float).reshape(-1) for x in X])
                got = np.array([np.asarray(sysm.fn(*x, 0.7, *pv), dtype=float) for x in X])
            ok = np.allclose(ref, got, rtol=1e-6, atol=1e-8, equal_nan=True)
        except Exception as e:
            ok, ref, got = False, None, None
        if not ok:
            skip(cls_name, 'traced equations disagree with dysts rhs')
            continue

        # Unbounded coordinates: a single phase clock is wrapped to [0, 2π) and
        # drawn as the angle round a torus. Anything else is skipped.
        unbounded = list(getattr(inst, 'unbounded_indices', None) or [])
        phase = None
        if unbounded:
            if len(unbounded) != 1 or dim != 3:
                skip(cls_name, f'unbounded coordinates {unbounded}')
                continue
            i = unbounded[0]
            zi = sp.Symbol(STATE[i])
            periodic = all(
                np.allclose(*[np.asarray(sysm.fn(*[(x[j] + (TAU if (j == i and k) else 0)) for j in range(dim)], 0.7, *pv), dtype=float) for k in (0, 1)], rtol=1e-6, atol=1e-8)
                for x in X)
            clock = zi not in exprs[i].free_symbols
            if not (periodic and clock):
                skip(cls_name, f'unbounded coordinate {i} is not a 2π phase clock')
                continue
            # Put the clock in z, so the shader always wraps and wraps z.
            if i != 2:
                order = [j for j in range(3) if j != i] + [i]
                swap = {sp.Symbol(STATE[j]): sp.Symbol('_' + STATE[k]) for k, j in enumerate(order)}
                exprs = [exprs[j].xreplace(swap).xreplace({sp.Symbol('_' + s): sp.Symbol(s) for s in STATE}) for j in order]
                ic = ic[order]
            phase = 2
            sysm = System(exprs, pnames, dim, is_map, phase)

        # A map that is 2π-periodic in every coordinate (the standard map) lives
        # on a torus and is drawn there, every coordinate taken mod 2π.
        if is_map:
            def torus_map(x):
                a = np.asarray(sysm.fn(*x, 0.0, *pv), dtype=float)
                for j in range(dim):
                    b = np.asarray(sysm.fn(*[x[k] + (TAU if k == j else 0) for k in range(dim)], 0.0, *pv), dtype=float)
                    d = (b - a) / TAU
                    if not np.allclose(d, np.round(d), atol=1e-6):
                        return False
                return True
            with np.errstate(all='ignore'):
                sysm.wrap = all(torus_map(x) for x in X)

        # Step size: maps take one iteration per frame. Flows take 1/300 of the
        # characteristic period per frame, split into as many substeps as it
        # needs before the settled spread stops changing.
        period = float(getattr(inst, 'period', None) or 1.0)
        frame_dt = 1.0 if is_map else period / FRAMES_PER_PERIOD
        std = getattr(inst, 'std', None)
        std = np.asarray(np.abs(ic) + 1.0 if std is None else std, dtype=float)[:dim]
        if phase is not None:
            std[2] = 1.0
        bounded_std = np.where(np.arange(dim) == phase, 0, std)
        extent = float(np.max(bounded_std))
        escape = max(1e6, (1000 * extent) ** 2)
        conservative = bool(getattr(inst, 'hamiltonian', False)) or is_map
        scale = float(0.5 * extent if conservative else 0.05 * extent)
        origin = ic.astype(np.float32)

        chosen, trail, prev = None, None, None
        for n in ([1] if is_map else SUBSTEPS):
            tr, resets = settle(sysm, pv, origin, scale, frame_dt / n, n, escape=escape)
            # Reusser's systems lose the odd trajectory out of the basin too, and
            # the shader re-seeds it; only a steady leak is disqualifying.
            leak = resets / (256 * TRAIL)
            if not np.isfinite(tr).all() or leak > (0.05 if is_map else 0.02):
                prev = None
                continue
            pts, lo, hi = spread(tr, phase)
            width = hi - lo
            if prev is not None and np.all(np.abs(width - prev[1]) <= 0.12 * np.maximum(prev[1], 1e-9)):
                chosen, trail = prev[0], prev[2]
                break
            prev = (n, width, tr)
        else:
            if is_map and prev is not None:
                chosen, trail = prev[0], prev[2]
        if chosen is None:
            skip(cls_name, 'no stable float32 step found')
            continue

        pts, lo, hi = spread(trail, phase)
        width = hi - lo
        # Stragglers: trajectories far outside the body of the attractor, which
        # the shader keeps pulling back and which then streak across the frame.
        span = np.max(np.abs(pts - (lo + hi) / 2), axis=0)
        wild = [j for j in range(min(dim, 3)) if j != phase and span[j] > 10 * max(width[j], 1e-12)]
        if wild:
            skip(cls_name, f'stragglers far outside the attractor in coordinate {wild}')
            continue
        # A map that has fallen onto a periodic orbit (Gumowski-Mira from these
        # seeds finds a 2-cycle) leaves a handful of dots.
        if is_map:
            q = np.round((pts - lo) / np.maximum(width, 1e-12), 4)
            distinct = len(np.unique(q, axis=0))
            if distinct < 2000:
                skip(cls_name, f'settles onto a periodic orbit ({distinct} distinct points)')
                continue
        if phase is None and np.max(width[:min(dim, 3)]) < 1e-6 * max(extent, 1e-9):
            skip(cls_name, 'collapsed to a point')
            continue

        entry = {
            'name': display_name(cls_name, is_map),
            'dysts': cls_name,
            'kind': 'map' if is_map else 'flow',
            'dim': dim,
            'deriv': ',\n'.join(glsl(e) for e in exprs),
            'params': {q: v for q, v in zip(pnames, pv)},
            'dt': frame_dt / chosen,
            'substeps': chosen,
            'initScale': scale,
            'initOrigin': [float(v) for v in origin],
            'escape': escape,
        }
        if sysm.wrap:
            entry['wrap'] = True
        mid = (lo + hi) / 2

        if phase is not None:
            # Torus: x is the radial offset about R, y the height, z the angle.
            R = 1.6 * max(width[0], 1e-6)
            entry['torus'] = [R, float(mid[0])]
            size = 2 * (R + width[0] / 2)
            entry['view'] = {'center': [0, float(mid[1]), 0], 'size': [size] * 3, 'rotation': [0, 0, 0]}
        elif is_map or dim == 2:
            # Flat: lay the map on the floor, the camera looks down on it.
            size = float(max(width[0], width[1]) * 1.15)
            entry['view'] = {'center': [float(mid[0]), float(mid[1]), 0], 'size': [size] * 3, 'rotation': [math.pi / 2, 0, 0]}
            entry['flat'] = True
        else:
            # Each axis scaled on its own: dysts flows mix units (a voltage
            # against a gating variable) and one axis can be a thousand times
            # the others, which draws a line. Capped at 8x, so nothing is
            # stretched out of a coordinate that barely moves.
            top = float(max(width[:3]))
            size = [float(max(w, top / 8) * 1.15) for w in width[:3]]
            entry['view'] = {'center': [float(v) for v in mid[:3]], 'size': size, 'rotation': [math.pi / 2, 0, 0]}

        if phase is not None:
            entry['initOrigin'][2] = float(np.mod(entry['initOrigin'][2], TAU))
        cite = (getattr(inst, 'citation', None) or '').strip()
        if len(cite) < 8:
            cite = ''
        desc = (getattr(inst, 'description', None) or '').strip()
        if cite:
            entry['refs'] = [{'title': cite}]
        entry['history'] = {
            'origin': cite or 'From the dysts catalogue',
            'text': [t for t in [desc, f'Equations, parameters and initial conditions from the dysts catalogue (class {cls_name}, dysts {dysts_version()}).'] if t],
            'sources': ['https://github.com/williamgilpin/dysts'],
        }
        with np.errstate(all='ignore'):
            pts = [trail[-1][k].astype(float) for k in (0, 7, 19)]
            entry['_check'] = [[list(map(float, x)), list(map(float, np.asarray(sysm.fn(*x, 0.7, *pv), dtype=float).reshape(-1)))] for x in pts]
        entries.append(entry)
        print(f'  {cls_name:28s} {entry["kind"]:4s} {dim}D  substeps {chosen:2d}', file=sys.stderr)

    write(entries, skipped)
    print(f'\n{len(entries)} systems written to {OUT.relative_to(ROOT)}; {len(skipped)} skipped:', file=sys.stderr)
    for n, why in skipped:
        print(f'  {n:28s} {why}', file=sys.stderr)


def dysts_version():
    from importlib.metadata import version
    return version('dysts')


def js(v):
    return json.dumps(v, ensure_ascii=False)


def write(entries, skipped):
    lines = [
        '// Generated from the dysts catalogue of chaotic systems (William Gilpin).',
        '// https://github.com/williamgilpin/dysts',
        f'// dysts {dysts_version()}. Regenerate with: .venv/bin/python tools/gen-dysts.py (see README).',
        '//',
        f'// {len(entries)} systems. Skipped, with the reason:',
    ]
    lines += [f'//   {n}: {why}' for n, why in skipped]
    lines += ['', 'export const DYSTS = [']
    for e in entries:
        lines.append('  {')
        for k, v in e.items():
            if k.startswith('_'):
                continue
            if k == 'deriv':
                body = '\n'.join('    ' + l for l in v.split('\n'))
                lines.append(f'    deriv: `\n{body}`,')
            else:
                lines.append(f'    {k}: {js(v)},')
        lines.append('  },')
    lines.append('];')
    OUT.write_text('\n'.join(lines) + '\n')
    CHECK.write_text(json.dumps({e['name']: e['_check'] for e in entries}))


if __name__ == '__main__':
    main()
