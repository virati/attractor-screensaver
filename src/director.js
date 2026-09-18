// Runs the show: shuffles through the attractors, dresses each one in a
// different palette and camera move, and cross-fades between them.

import { ATTRACTORS, byName } from './attractors.js';
import { PALETTES } from './palettes.js';
import { viewTransform } from './mat4.js';

const shuffle = (arr, rng) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const lerp = (a, b, t) => a + (b - a) * t;

// Where the trajectory actually lives, in view coordinates: the radius of the
// ball about `target` holding all but the wildest 1.5% of it, and the height
// its underside reaches. Stragglers are excluded so one escaping particle
// cannot push the camera into the next county.
function occupancy(positions, m, target, maxSamples = 24000) {
  const count = positions.length / 4;
  const stride = Math.max(1, Math.ceil(count / maxSamples));
  const radii = [];
  const heights = [];
  for (let i = 0; i < count; i += stride) {
    const x = positions[i * 4], y = positions[i * 4 + 1], z = positions[i * 4 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    radii.push(Math.hypot(wx - target[0], wy - target[1], wz - target[2]));
    heights.push(wy);
  }
  if (!radii.length) return { radius: 0.7, bottom: 0 };
  radii.sort((a, b) => a - b);
  heights.sort((a, b) => a - b);
  const at = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
  return { radius: at(radii, 0.985) || 0.7, bottom: at(heights, 0.015) };
}

const transforms = new Map();
function transformFor(attractor) {
  let t = transforms.get(attractor.name);
  if (!t) {
    t = viewTransform(attractor.view);
    transforms.set(attractor.name, t);
  }
  return t;
}

export class Director {
  constructor(scene, {
    duration = 45,
    fadeTime = 1.4,
    rng = Math.random,
    theme = 'any',
    pinned = null,
    quality = null,
    drift = null,
    trail = null,
    onChange = () => {}
  } = {}) {
    this.scene = scene;
    this.duration = duration;
    this.fadeTime = fadeTime;
    this.rng = rng;
    this.theme = theme;
    this.quality = quality;
    this.drift = drift;
    this.trail = trail;
    this.onChange = onChange;
    this.paused = false;
    this.margin = 1.35;
    this.sinceReframe = 0;

    const start = pinned ? byName(pinned) : null;
    this.playlist = shuffle(ATTRACTORS, rng);
    if (start) this.playlist = [start, ...this.playlist.filter(a => a !== start)];
    this.index = 0;

    this.veil = 1;
    this.phase = 'in';
    this.held = 0;
    this.load(this.playlist[0]);
  }

  get current() { return this.playlist[this.index]; }

  palettePool() {
    if (this.theme === 'dark') return PALETTES.filter(p => p.dark);
    if (this.theme === 'paper') return PALETTES.filter(p => !p.dark);
    return PALETTES;
  }

  dress(attractor) {
    const r = this.rng;
    const pool = this.palettePool();
    const palette = pool[Math.floor(r() * pool.length)];
    const flip = r() < 0.5;

    // `this.trail` pins whichever of width/fade/tailFade were asked for. The
    // random values are still drawn either way, so pinning one does not shift
    // the sequence the others come from.
    return Object.assign({
      palette,
      transform: transformFor(attractor),
      background: palette.background,
      color1: flip ? palette.color2 : palette.color1,
      color2: flip ? palette.color1 : palette.color2,
      borderColor: palette.borderColor,
      borderOpacity: lerp(0.5, 0.95, r()),
      borderWidth: lerp(0.3, 0.9, r()),
      gridColor: palette.gridColor,
      gridOpacity: r() < 0.18 ? 0 : palette.gridOpacity * lerp(0.45, 1.0, r()),
      shadowColor: palette.shadowColor,
      shadow: r() < 0.7,
      shading: lerp(0.05, 0.3, r()),
      width: lerp(4, 11, r() ** 1.5),
      fade: lerp(0.1, 0.6, r()),
      tailFade: lerp(0.08, 0.42, r()),
      colorBy: r() < 0.7 ? 'radius' : 'random',
      floorY: -0.5,
      roomHalf: 2,
      pixelRatio: 1
    }, this.trail);
  }

  load(attractor) {
    // Resolution changes land here, between shots, where they are invisible.
    if (this.quality) this.scene.sim.resize(this.quality());
    const style = this.dress(attractor);
    style.pixelRatio = this.scene.style ? this.scene.style.pixelRatio : 1;
    this.scene.style = style;
    this.scene.camera.randomize(this.rng);
    this.scene.sim.reset(attractor);
    this.scene.sim.spinUp();

    const { radius, bottom } = occupancy(
      this.scene.sim.readPositions(), style.transform, this.scene.camera.target);
    this.margin = lerp(1.22, 1.55, this.rng());
    this.scene.camera.frameRadius(radius, this.margin);

    // Keep the floor just under the subject and grow the room to match, so a
    // sprawling system gets a hall and a compact one gets a room.
    style.floorY = Math.min(-0.5, bottom - 0.08 * radius);
    style.roomHalf = Math.max(2, radius * 2.2);

    this.held = 0;
    this.sinceReframe = 0;
    if (this.drift) this.drift.reset(attractor);
    this.onChange(attractor, style, this);
  }

  // Drifting parameters change the size of the attractor as well as its shape,
  // so the framing has to follow. The correction is slewed in over seconds
  // rather than applied outright: a camera that snapped to each new radius
  // would read as a jolt, which is exactly what --continuous mode is avoiding.
  reframe(blend) {
    const style = this.scene.style;
    const camera = this.scene.camera;
    if (!style || camera.drag) return;

    const { radius, bottom } = occupancy(
      this.scene.sim.readPositions(128), style.transform, camera.target);
    if (!(radius > 0)) return;

    const before = camera.distance;
    camera.frameRadius(radius, this.margin);
    camera.distance = lerp(before, camera.distance, blend);

    const floor = Math.min(-0.5, bottom - 0.08 * radius);
    style.floorY = lerp(style.floorY, floor, blend);
    style.roomHalf = lerp(style.roomHalf, Math.max(2, radius * 2.2), blend);
  }

  cut(index) {
    this.index = (index + this.playlist.length) % this.playlist.length;
    this.load(this.current);
    this.veil = Math.max(this.veil, 0.85);
    this.phase = 'in';
  }

  jump(delta) { this.cut(this.index + delta); }

  goTo(name) {
    const i = this.playlist.findIndex(a => a.name === name);
    if (i >= 0) this.cut(i);
  }

  reshuffleLook() {
    const style = this.dress(this.current);
    style.pixelRatio = this.scene.style.pixelRatio;
    this.scene.style = style;
    this.onChange(this.current, style, this);
  }

  advance(dt) {
    if (this.drift && !this.paused) {
      this.drift.advance(dt, this.scene.sim);
      this.sinceReframe += dt;
      if (this.sinceReframe >= 4) {
        this.sinceReframe = 0;
        this.reframe(0.5);
      }
    }
    if (this.phase === 'in') {
      this.veil -= dt / this.fadeTime;
      if (this.veil <= 0) { this.veil = 0; this.phase = 'hold'; }
    } else if (this.phase === 'hold') {
      if (!this.paused) this.held += dt;
      if (this.duration > 0 && this.held >= this.duration) this.phase = 'out';
    } else {
      this.veil += dt / this.fadeTime;
      if (this.veil >= 1) {
        this.veil = 1;
        this.index = (this.index + 1) % this.playlist.length;
        this.load(this.current);
        this.phase = 'in';
      }
    }
    return this.veil;
  }
}
