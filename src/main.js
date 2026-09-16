// Entry point: wiring, the frame loop, quality adaptation and input.

import { createContext } from './glutil.js';
import { Scene } from './scene.js';
import { Director } from './director.js';
import { ATTRACTORS } from './attractors.js';
import { equations, parameterLine, reference } from './format.js';

const params = new URLSearchParams(location.search);
const num = (key, fallback) => {
  const v = parseFloat(params.get(key));
  return Number.isFinite(v) ? v : fallback;
};
const flag = key => params.has(key) && params.get(key) !== '0' && params.get(key) !== 'false';

const OPTS = {
  idle: flag('idle'),
  duration: num('duration', 45),
  fadeTime: num('fade', 1.4),
  particles: Math.max(64, Math.min(4096, num('particles', 1024))),
  steps: Math.max(8, Math.min(512, num('steps', 180))),
  speed: num('speed', 1),
  theme: params.get('theme') || 'any',
  attractor: params.get('attractor'),
  maxPixelRatio: num('dpr', 1.75),
  hud: params.get('hud') !== '0'
};

const el = id => document.getElementById(id);

export async function boot() {
  const canvas = el('gl');
  const gl = createContext(canvas, { antialias: true });

  // Quality ladder, walked only between shots so changes are never visible.
  const LADDER = [
    { particles: 256, steps: 90 },
    { particles: 512, steps: 120 },
    { particles: 768, steps: 150 },
    { particles: OPTS.particles, steps: OPTS.steps },
    { particles: Math.min(2048, OPTS.particles * 2), steps: Math.min(320, OPTS.steps * 1.5 | 0) }
  ];
  let rung = 3;
  let pendingRung = 3;
  let ceilingRung = LADDER.length - 1;

  const scene = new Scene(gl, LADDER[rung]);

  const director = new Director(scene, {
    duration: OPTS.duration,
    fadeTime: OPTS.fadeTime,
    theme: OPTS.theme,
    pinned: OPTS.attractor,
    quality: () => { rung = pendingRung; return LADDER[rung]; },
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
      `${String(dir.index + 1).padStart(2, '0')} / ${ATTRACTORS.length}`;
    el('palette').textContent = style.palette.name;
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

    scene.camera.update(dt);
    const veil = director.advance(dt);
    scene.render({ veil });

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

  // --- input ---------------------------------------------------------------
  if (OPTS.idle) {
    document.body.classList.add('idle');
    armIdleExit();
  } else {
    armControls(canvas, director, scene);
  }

  return { scene, director };
}

// Screensaver mode: the first real sign of life dismisses the window.
function armIdleExit() {
  const armedAt = performance.now();
  let origin = null;
  let quitting = false;
  const quit = () => {
    if (quitting || performance.now() - armedAt < 700) return;
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
  for (const type of ['keydown', 'mousedown', 'wheel', 'touchstart', 'pointerdown']) {
    window.addEventListener(type, quit, { passive: true });
  }
}

function armControls(canvas, director, scene) {
  const help = el('help');
  let helpTimer = null;
  const flashHelp = () => {
    help.classList.add('show');
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => help.classList.remove('show'), 3200);
  };
  flashHelp();

  window.addEventListener('keydown', e => {
    switch (e.key) {
      case 'ArrowRight': case 'n': director.jump(1); break;
      case 'ArrowLeft': case 'p': director.jump(-1); break;
      case 'r': case 'R': director.reshuffleLook(); break;
      case ' ': director.paused = !director.paused; e.preventDefault(); break;
      case 'h': case 'H':
        el('hud').classList.toggle('hidden');
        el('meta').classList.toggle('hidden');
        break;
      case 'f': case 'F':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
        break;
      case '?': flashHelp(); break;
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
}
