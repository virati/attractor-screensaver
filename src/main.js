// Entry point: wiring, the frame loop, quality adaptation and input.

import { createContext } from './glutil.js';
import { Scene } from './scene.js';
import { Director } from './director.js';
import { Drift } from './drift.js';
import { HistoryPanel } from './history-panel.js';
import { JacobianPanel, jacobianSupport } from './jacobian.js';
import { equations, parameterLine, parameterValues, reference } from './format.js';

const params = new URLSearchParams(location.search);
const num = (key, fallback) => {
  const v = parseFloat(params.get(key));
  return Number.isFinite(v) ? v : fallback;
};
const flag = key => params.has(key) && params.get(key) !== '0' && params.get(key) !== 'false';

// Named looks: a palette, a framing, a particle count and a set of pinned trail
// settings. Anything given explicitly on the query string still wins.
//
// `notebook` is Part 1 of Reusser's notebook, value for value: 20 particles
// with 100-sample tracks on white, a constant 5 px stroke coloured by particle
// index from mint to blue, and an edge that fades to white from half the
// radius out, so a line in front is parted from whatever it crosses. No
// taper, shading, tail fade, room or shadow.
const LOOKS = {
  notebook: {
    palette: 'Reusser',
    oled: false,
    particles: 20,
    steps: 100,
    trail: {
      width: 5, fade: 0, tailFade: 0, colorBy: 1,
      shading: 0, borderOpacity: 1, borderWidth: 0.9, gridOpacity: 0, shadow: false
    }
  }
};
const LOOK = LOOKS[params.get('look')] || {};

const OPTS = {
  idle: flag('idle'),
  duration: num('duration', 300),
  fadeTime: num('fade', 1.4),
  continuous: flag('continuous'),
  sweep: num('sweep', 0.12),
  sweepPeriod: Math.max(4, num('sweepPeriod', 55)),
  particles: Math.max(1, Math.min(4096, num('particles', LOOK.particles ?? 384))),
  // A count that was asked for (by a look or particles=) is held; otherwise the
  // quality ladder scales it with the frame rate.
  pinParticles: params.has('particles') || LOOK.particles !== undefined,
  // Two samples is one segment, which is the shortest a trail can be and still
  // have a direction; one sample would divide by zero working out where along
  // the trail a vertex sits.
  steps: Math.max(2, Math.min(512, num('steps', LOOK.steps ?? 50))),
  speed: num('speed', 1),
  theme: params.get('theme') || 'any',
  attractor: params.get('attractor'),
  // Which systems to cycle: `classic` (Reusser's), `lie` (Lie brackets of
  // dysts pairs, built by tools/lie_pairs.py) or `all`.
  set: params.get('set') || 'classic',
  // The notebook renders at the full devicePixelRatio; 1.75 clipped that on a
  // panel scaled past it, costing resolution to save fill rate the quality
  // ladder is already there to manage.
  maxPixelRatio: num('dpr', 2),
  hud: params.get('hud') !== '0',
  history: params.get('history') !== '0',
  // Off by default: a glass 3×3 grid of which ∂fᵢ/∂xⱼ are nonzero. J toggles it.
  jacobian: flag('jacobian'),
  // On by default: true-black grounds, and dark palettes only unless a light
  // one was asked for outright. `oled=0` restores the designed backgrounds.
  oled: params.has('oled') ? params.get('oled') !== '0' : LOOK.oled ?? true,
  // Pin one palette by name (see src/palettes.js), and frame tighter (>1) or
  // looser (<1) than the director would.
  palette: params.get('palette') || LOOK.palette || null,
  zoom: Math.max(0.2, num('zoom', LOOK.zoom ?? 1)),
  // Multi-display: `label` names the window so the compositor can place it,
  // and `slice=i/n` gives each instance a disjoint share of the systems.
  label: params.get('label'),
  slice: params.get('slice'),
  // Off by default. Blending resolves the soft edge at full precision instead
  // of quantising it to a handful of coverage levels, which should look better
  // and does not: the joints are separate discs drawn under the segments, and
  // that only stays invisible while the segments are painted over them
  // opaquely. Blended, every disc shows through and the trails read as chains
  // of beads. `blend=1` if you want to see it.
  blend: flag('blend'),
  // The scene is drawn offscreen at the GPU's highest multisample count (msaa=
  // to cap it), then bloomed. post=0 draws straight to the canvas as before;
  // bloom=0 keeps the antialiasing and drops the glow.
  post: params.get('post') !== '0',
  msaa: Math.max(0, num('msaa', 0)),
  bloom: Math.max(0, num('bloom', 0.55)),
  bloomThreshold: Math.max(0, num('bloomThreshold', 0.3)),
  seed: params.has('seed') ? num('seed', 1) : null,
  // Seconds to ignore input for after loading. With one window a moment is
  // plenty; with several, the later ones are still being mapped and placed
  // while the earlier ones are already listening, and that was enough to
  // dismiss them.
  arm: Math.max(0, num('arm', 0.7))
};

function sliceOf(spec) {
  if (!spec) return null;
  const [i, n] = spec.split('/').map(v => parseInt(v, 10));
  if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 0 || i >= n) return null;
  return { index: i, count: n };
}

// The look of the trail is rerolled per shot unless it is pinned here. Only the
// keys actually given are overridden, so `width=2` still gets a random taper.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TRAIL = { ...(LOOK.trail || {}) };
if (params.has('width')) TRAIL.width = clamp(num('width', 7), 0.5, 40);
if (params.has('taper')) TRAIL.fade = clamp(num('taper', 0.35), 0, 2);
if (params.has('tailFade')) TRAIL.tailFade = clamp(num('tailFade', 0.25), 0, 1);
if (params.has('colorBy')) TRAIL.colorBy = clamp(num('colorBy', 1), 0, 1);
// Curve pieces drawn per integration step; 1 draws straight chords as before.
if (params.has('smooth')) TRAIL.subdivisions = Math.round(clamp(num('smooth', 4), 1, 16));

const el = id => document.getElementById(id);

// `seed` makes a run repeatable: same palette, same camera move, same playlist.
// Without it two runs cannot be compared, which is what shots of "before" and
// "after" need.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export async function boot() {
  // The title is how a Wayland compositor tells one instance from another —
  // clients cannot place themselves, so the window rule matches on this.
  if (OPTS.label) document.title = `Attractors ${OPTS.label}`;

  const canvas = el('gl');
  // With post-processing the canvas is only ever a fullscreen copy target, so
  // its own multisample buffer would be memory spent on nothing.
  const gl = createContext(canvas, { antialias: !OPTS.post });

  // Quality ladder, walked only between shots so changes are never visible.
  //
  // Every rung holds `steps` at whatever was asked for and sheds work by
  // dropping trajectories instead. Trail length is a decision about how the
  // thing looks; particle count mostly is not. The rungs used to carry their own
  // step counts, which meant a request for short tails was quietly overruled the
  // first time a frame ran long — and since a rung once lost is never climbed
  // back to, overruled for the rest of the session.
  const LADDER = [0.25, 0.5, 0.75, 1, 2].map(scale => ({
    particles: OPTS.pinParticles
      ? OPTS.particles
      : Math.max(64, Math.min(4096, Math.round(OPTS.particles * scale))),
    steps: OPTS.steps
  }));
  let rung = 3;
  let pendingRung = 3;
  let ceilingRung = LADDER.length - 1;
  let chosen = null;

  const scene = new Scene(gl, {
    ...LADDER[rung],
    post: OPTS.post ? { samples: OPTS.msaa, bloom: OPTS.bloom, threshold: OPTS.bloomThreshold } : null
  });

  // --continuous: walk the parameters instead of holding them fixed.
  const drift = OPTS.continuous
    ? new Drift({ amplitude: OPTS.sweep, period: OPTS.sweepPeriod })
    : null;

  // With the panel off there is no show() to fill it, so the static heading in
  // the markup would otherwise sit there on its own.
  const history = OPTS.history ? new HistoryPanel(el('history')) : null;
  if (!history) el('history').classList.add('hidden');

  const jacobian = new JacobianPanel(el('jacobian'));
  if (!OPTS.jacobian) el('jacobian').classList.add('hidden');
  let support = null;
  const updateJacobian = (positions = scene.sim.readPositions(64)) => {
    support = jacobianSupport(director.current, scene.sim.params, positions);
    jacobian.show(support);
  };

  const director = new Director(scene, {
    duration: OPTS.duration,
    fadeTime: OPTS.fadeTime,
    theme: OPTS.theme,
    rng: OPTS.seed === null ? Math.random : mulberry32(OPTS.seed),
    pinned: OPTS.attractor,
    set: OPTS.set,
    drift,
    trail: Object.keys(TRAIL).length ? TRAIL : null,
    oled: OPTS.oled,
    palette: OPTS.palette,
    zoom: OPTS.zoom,
    blend: OPTS.blend,
    slice: sliceOf(OPTS.slice),
    // A count set with the arrow keys outranks the ladder for the session.
    quality: () => {
      rung = pendingRung;
      return chosen === null ? LADDER[rung] : { ...LADDER[rung], particles: chosen };
    },
    onChange: describe
  });

  function describe(attractor, style, dir) {
    document.documentElement.style.setProperty('--bg', style.palette.css.background);
    document.documentElement.style.setProperty('--fg', style.palette.css.foreground);
    document.documentElement.style.setProperty('--accent', style.palette.css.accent);
    document.body.classList.toggle('paper', !style.palette.dark);
    el('name').textContent = attractor.name;
    el('eq').textContent = equations(attractor).join('\n');
    el('params').textContent = parameterLine(attractor);
    el('ref').textContent = reference(attractor);
    el('counter').textContent =
      `${String(dir.index + 1).padStart(2, '0')} / ${dir.playlist.length}`;
    el('palette').textContent = style.palette.name;
    if (history) history.show(attractor);
    // describe() runs from inside the Director's constructor too, before
    // `director` is assigned, so the attractor is passed in rather than looked up.
    support = jacobianSupport(attractor, scene.sim.params, scene.sim.readPositions(64));
    jacobian.show(support);
  }

  // --- sizing --------------------------------------------------------------
  let pixelRatio = 1;
  function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, OPTS.maxPixelRatio);
    const w = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
    const h = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    scene.camera.aspect = w / h;
    if (scene.style) scene.style.pixelRatio = pixelRatio;
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  // --- frame loop ----------------------------------------------------------
  let last = performance.now();
  let accumulator = 0;
  let smoothDt = 1 / 60;
  let sinceCheck = 0;
  let sinceReadout = 0;
  let sinceJacobian = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);

    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (scene.style) scene.style.pixelRatio = pixelRatio;

    // Integration is pinned to 60 steps/second so the motion looks the same
    // on a 60Hz panel and a 165Hz one.
    if (!director.paused) {
      accumulator += dt * 60 * OPTS.speed;
      let steps = Math.min(4, Math.floor(accumulator));
      accumulator -= steps;
      while (steps-- > 0) scene.sim.step(1);
    } else {
      accumulator = 0;
    }

    scene.sim.fizzle(dt);
    scene.camera.update(dt);
    const veil = director.advance(dt);
    scene.render({ veil });

    if (history) history.advance(dt);

    // With the parameters moving, the line under the title is a live readout
    // rather than a caption, so it has to be rewritten — but four times a
    // second, not sixty, or the digits are a blur.
    if (drift && !director.paused) {
      sinceReadout += dt;
      if (sinceReadout > 0.25) {
        sinceReadout = 0;
        el('params').textContent = parameterValues(scene.sim.params);
      }
      // A coefficient drifting through zero switches a coupling off.
      sinceJacobian += dt;
      if (sinceJacobian > 2) { sinceJacobian = 0; updateJacobian(); }
    }

    const hud = OPTS.hud ? Math.max(0, 1 - veil * 1.6) : 0;
    document.documentElement.style.setProperty('--hud', hud.toFixed(3));

    // Frame-to-frame interval is the only honest signal here: CPU timings say
    // nothing about a GPU-bound draw. Anything past ~46fps costs a rung, and a
    // rung we have already fallen off is never climbed back to.
    if (dt < 0.05) smoothDt += (dt - smoothDt) * 0.05;
    sinceCheck += dt;
    if (sinceCheck > 4) {
      sinceCheck = 0;
      if (smoothDt > 0.0215 && pendingRung > 0) {
        pendingRung--;
        ceilingRung = pendingRung;
      } else if (smoothDt < 0.0125 && pendingRung < ceilingRung) {
        pendingRung++;
      }
    }
  }
  requestAnimationFrame(frame);

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    running = false;
    el('error').textContent = 'WebGL context lost. Reload to restart.';
    el('error').classList.add('show');
  });

  // --- flagging -------------------------------------------------------------
  // `c` writes everything needed to come back to this system later — the
  // field as GLSL, the parameters as they are right now (drifted ones
  // included), the Jacobian support and how it was being shown — to the flag
  // file via the launcher's server. Opened as a bare file there is no server,
  // so the record is kept in localStorage instead and the toast says so.
  const flagToast = el('flagged');
  let toastTimer = null;
  const toast = (text, ok) => {
    flagToast.textContent = text;
    flagToast.classList.toggle('bad', !ok);
    flagToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => flagToast.classList.remove('show'), 3200);
  };
  async function flagCurrent() {
    const a = director.current;
    const record = {
      flaggedAt: new Date().toISOString(),
      name: a.name,
      set: SETS_OF(a),
      f: a.f, g: a.g,
      deriv: a.deriv.trim().split('\n').map(l => l.trim()).join('\n'),
      params: { ...scene.sim.params },
      publishedParams: { ...(a.params || {}) },
      jacobianSupport: support,
      dt: a.dt,
      initScale: a.initScale,
      initOrigin: a.initOrigin,
      view: a.view,
      lie: a.lie,
      respawn: a.respawn,
      simTime: scene.sim.t,
      secondsOnScreen: director.held,
      palette: scene.style.palette.name,
      continuous: !!drift,
      seed: OPTS.seed,
      query: location.search
    };
    try {
      const res = await fetch('/__flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || res.status);
      toast(`⚑ ${a.name} flagged (${body.count}) → ${body.path}`, true);
    } catch (err) {
      try {
        const kept = JSON.parse(localStorage.getItem('attractors.flagged') || '[]');
        kept.push(record);
        localStorage.setItem('attractors.flagged', JSON.stringify(kept));
        toast(`⚑ ${a.name}: no server, kept in browser storage only (${err.message})`, false);
      } catch (e) {
        toast(`⚑ ${a.name} NOT saved: ${err.message}`, false);
      }
    }
  }

  // --- input ---------------------------------------------------------------
  if (OPTS.idle) {
    document.body.classList.add('idle');
    armIdleExit(OPTS.arm * 1000, flagCurrent);
  } else {
    // Up/down step the count in quarter-octaves, so a held key sweeps
    // 1 → 4096 in about four seconds at the usual key-repeat rate.
    const nudgeParticles = dir => {
      const now = scene.sim.particles;
      let next = Math.round(now * 2 ** (dir / 4));
      if (next === now) next += dir;
      chosen = Math.max(1, Math.min(scene.sim.capacity, next));
      scene.sim.setCount(chosen);
      toast(`${chosen} particles`, true);
    };
    armControls(canvas, director, scene, history, flagCurrent, () => {
      const panel = el('jacobian');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) updateJacobian();
    }, nudgeParticles);
  }

  return { scene, director, history, drift };
}

const SETS_OF = a => (a.f ? 'lie' : 'classic');

// Screensaver mode: the first real sign of life dismisses the window — except
// `c`, which flags the system on screen and leaves the screensaver running.
function armIdleExit(holdOff = 700, onFlag = () => {}) {
  const armedAt = performance.now();
  let origin = null;
  let quitting = false;
  const quit = () => {
    if (quitting || performance.now() - armedAt < holdOff) return;
    quitting = true;
    // The launcher's static server shuts down on /__quit and takes the browser
    // with it; window.close() covers the case where the page is run standalone.
    fetch('/__quit').catch(() => {});
    window.close();
    document.body.classList.remove('idle');
  };
  const moved = e => {
    if (!origin) { origin = [e.clientX, e.clientY]; return; }
    if (Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) > 12) quit();
  };
  window.addEventListener('mousemove', moved, { passive: true });
  window.addEventListener('keydown', e => {
    if (e.key === 'c' || e.key === 'C') {
      if (!e.repeat && performance.now() - armedAt >= holdOff) onFlag();
      return;
    }
    quit();
  });
  for (const type of ['mousedown', 'wheel', 'touchstart', 'pointerdown']) {
    window.addEventListener(type, quit, { passive: true });
  }
}

function armControls(canvas, director, scene, history, onFlag, toggleJacobian, nudgeParticles) {
  // The key list shows for a while at start, then folds down to a dim "? keys"
  // hint; `?` brings it back and it stays until `?` is pressed again.
  const help = el('help');
  const hint = el('help-hint');
  const showHelp = on => {
    help.classList.toggle('show', on);
    hint.classList.toggle('show', !on);
  };
  let helpTimer = setTimeout(() => showHelp(false), 10000);
  showHelp(true);

  window.addEventListener('keydown', e => {
    switch (e.key) {
      case 'ArrowRight': case 'n': director.jump(1); break;
      case 'ArrowLeft': case 'p': director.jump(-1); break;
      case 'ArrowUp': nudgeParticles(1); e.preventDefault(); break;
      case 'ArrowDown': nudgeParticles(-1); e.preventDefault(); break;
      case 'r': case 'R': director.reshuffleLook(); break;
      case ' ': director.paused = !director.paused; e.preventDefault(); break;
      case 'h': case 'H':
        el('hud').classList.toggle('hidden');
        el('meta').classList.toggle('hidden');
        el('history').classList.toggle('hidden');
        hint.classList.toggle('hidden');
        break;
      case 'i': case 'I': el('history').classList.toggle('hidden'); break;
      case 'c': case 'C': if (!e.repeat) onFlag(); break;
      case 'j': case 'J': toggleJacobian(); break;
      case 'f': case 'F':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
        break;
      case '?':
        clearTimeout(helpTimer);
        showHelp(!help.classList.contains('show'));
        break;
      default: return;
    }
  });

  let dragging = null;
  canvas.addEventListener('pointerdown', e => {
    dragging = [e.clientX, e.clientY];
    scene.camera.drag = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    scene.camera.orbitBy(e.clientX - dragging[0], e.clientY - dragging[1]);
    dragging = [e.clientX, e.clientY];
  });
  const release = e => {
    dragging = null;
    scene.camera.drag = false;
    if (e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    scene.camera.zoomBy(e.deltaY);
  }, { passive: false });

  // A wheel over the history panel scrolls the text rather than the camera,
  // and holds the automatic scroll off for a few seconds afterwards.
  if (history) {
    el('history').addEventListener('wheel', e => {
      e.preventDefault();
      history.nudge(e.deltaY * 0.6);
    }, { passive: false });
  }
}
