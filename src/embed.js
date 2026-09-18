// Mounts the attractor renderer into a page, rather than owning the screen.
// Same simulation and director as the screensaver; the difference is that the
// host page supplies the canvas, the overlay elements and the controls, and
// the loop idles whenever nobody is looking at it.

import { createContext } from './glutil.js';
import { Scene } from './scene.js';
import { Director } from './director.js';
import { equations, parameterLine, reference } from './format.js';
import { HISTORY } from './history.js';
import { Drift } from './drift.js';

export function mount({
  canvas,
  duration = 30,
  particles = 1024,
  steps = 160,
  maxPixelRatio = 1.6,
  theme = 'dark',
  continuous = false,
  onChange = () => {},
  onVeil = () => {}
}) {
  const gl = createContext(canvas, { antialias: true });

  const LADDER = [
    { particles: 256, steps: 90 },
    { particles: 512, steps: 120 },
    { particles: 768, steps: 140 },
    { particles, steps },
    { particles: Math.min(2048, particles * 2), steps: Math.min(280, steps * 1.4 | 0) }
  ];
  let pendingRung = 3;
  let ceilingRung = LADDER.length - 1;

  const scene = new Scene(gl, LADDER[3]);
  const director = new Director(scene, {
    duration,
    fadeTime: 1.2,
    theme,
    drift: continuous ? new Drift() : null,
    quality: () => LADDER[pendingRung],
    onChange: (attractor, style, dir) => onChange({
      name: attractor.name,
      equations: equations(attractor),
      parameters: parameterLine(attractor),
      reference: reference(attractor),
      // Background notes, for a host page that wants to show them: `origin`,
      // `text` (2-3 paragraphs), `sources`, and `caveat` where the attribution
      // is shakier than the rest.
      history: HISTORY[attractor.name] || null,
      palette: style.palette.name,
      index: dir.index,
      total: dir.playlist.length
    })
  });

  // --- sizing ------------------------------------------------------------
  let pixelRatio = 1;
  function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
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
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // --- loop --------------------------------------------------------------
  let raf = 0;
  let last = 0;
  let accumulator = 0;
  let smoothDt = 1 / 60;
  let sinceCheck = 0;
  let wanted = false;     // what the viewer asked for
  let onScreen = true;
  let alive = true;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (scene.style) scene.style.pixelRatio = pixelRatio;

    if (!director.paused) {
      accumulator += dt * 60;
      let n = Math.min(4, Math.floor(accumulator));
      accumulator -= n;
      while (n-- > 0) scene.sim.step(1);
    } else {
      accumulator = 0;
    }

    scene.camera.update(dt);
    const veil = director.advance(dt);
    scene.render({ veil });
    onVeil(veil);

    if (dt < 0.05) smoothDt += (dt - smoothDt) * 0.05;
    sinceCheck += dt;
    if (sinceCheck > 4) {
      sinceCheck = 0;
      if (smoothDt > 0.0215 && pendingRung > 0) ceilingRung = --pendingRung;
      else if (smoothDt < 0.0125 && pendingRung < ceilingRung) pendingRung++;
    }
  }

  function sync() {
    const should = alive && wanted && onScreen && !document.hidden;
    if (should && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const io = new IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting;
    sync();
  }, { threshold: 0.05 });
  io.observe(canvas);

  const onVisibility = () => sync();
  document.addEventListener('visibilitychange', onVisibility);

  // --- orbit by hand -----------------------------------------------------
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
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    scene.camera.zoomBy(e.deltaY);
  }, { passive: false });

  // Open on a composed frame instead of fading up from the background: the
  // first still frame is what a thumbnail, a shared link and a reader who
  // never scrolls all get. Transitions after this one still cross-fade.
  director.veil = 0;
  director.phase = 'hold';
  scene.camera.update(0);
  scene.render({ veil: 0 });
  onVeil(0);

  return {
    play() { wanted = true; sync(); },
    pause() { wanted = false; sync(); },
    get playing() { return wanted; },
    next() { director.jump(1); },
    previous() { director.jump(-1); },
    goTo(name) { director.goTo(name); },
    reroll() { director.reshuffleLook(); },
    hold(on) { director.paused = on; },
    get held() { return director.paused; },
    setTheme(next) {
      if (director.theme === next) return;
      director.theme = next;
      director.reshuffleLook();
    },
    destroy() {
      alive = false;
      sync();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      scene.destroy();
    }
  };
}
