// GPU state: one RGBA32F texture holding `steps` positions for each of
// `particles` trajectories, advanced with 4th-order Runge-Kutta -- or, for a
// discrete map, iterated.
//
// Layout: texel (column, row) = state of particle `row` at trail slot
// `column`. Columns are a ring buffer; `head` is the newest sample. A texel has
// four channels, so a system may have two, three or four dimensions; unused
// channels are held at zero.

import { program, floatTarget, fullscreenTriangle, FULLSCREEN_VERT } from './glutil.js';
import { splitComponents } from './format.js';

// Which channels are state, for a system of `dim` dimensions.
const maskOf = dim => [0, 1, 2, 3].map(i => (i < dim ? 1 : 0));
const vec4 = v => `vec4(${v.map(n => n.toFixed(1)).join(', ')})`;

const QUASIRANDOM = `
// http://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/
vec3 quasirandom (float n) {
  const float g = 1.22074408460575947536;
  return fract(0.5 + n * vec3(1.0 / g, 1.0 / (g * g), 1.0 / (g * g * g))).zyx;
}
vec3 sphericalRandom (float n) {
  vec3 r = quasirandom(n);
  float u = r.x * 2.0 - 1.0;
  float theta = 6.283185307179586 * r.y;
  return vec3(sqrt(1.0 - u * u) * vec2(cos(theta), sin(theta)), u) * sqrt(r.z);
}`;

const INIT_FRAG = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec4 uOrigin, uMask;
uniform float uScale, uPhase;
out vec4 fragColor;
${QUASIRANDOM}
void main () {
  // gl_FragCoord carries a half-texel offset, which is welcome here: exactly
  // zero states tend to stick to unstable axes and fly off to infinity.
  float particle = gl_FragCoord.y;
  vec4 blob = vec4(sphericalRandom(particle), 2.0 * fract(particle * 0.7548776662) - 1.0);
  fragColor = uOrigin + uScale * blob * uMask;
  // A sliver of variation along each trail so there is something to see on
  // the very first frame.
  fragColor.z -= gl_FragCoord.x / uResolution.x * 0.001 * uMask.z;
  // A forced system's clock: every starting phase is a valid initial state, and
  // starting them all at one phase sends the whole swarm round the torus in a
  // clump. Spread evenly, they fill the ring from the first frame.
  if (uPhase > 0.5) fragColor.z = 6.283185307179586 * fract(particle * 0.6180339887);
}`;

const COPY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
out vec4 fragColor;
void main () {
  fragColor = texelFetch(uSrc, ivec2(0, int(gl_FragCoord.y)), 0);
}`;

// The integrator is compiled per system with its shape baked in: how many
// dimensions, whether it is a flow or a map, and which coordinates wrap.
//
// `phase` systems (from dysts) carry a forcing clock in z. It is unbounded, so it
// is kept to [0, 2pi), which is safe because the equations only see it through
// sines and cosines; the renderer draws it as the angle round a torus, so the
// wrap never shows. `wrap` maps live on the 2pi torus in every coordinate.
function integrateFrag(attractor) {
  const params = attractor.params || {};
  const names = Object.keys(params);
  const decls = names.length ? names.map(n => `uniform float ${n};`).join('\n') : '';
  const dim = attractor.dim || 3;
  const parts = splitComponents(attractor.deriv);
  while (parts.length < 4) parts.push('0.0');
  const deriv = parts.map(l => '    ' + l).join(',\n');
  const isMap = attractor.kind === 'map';
  const phase = !!attractor.torus;
  // The escape test measures distance in the bounded coordinates only.
  const bounded = maskOf(dim);
  if (phase) bounded[2] = 0;
  const TAU = '6.283185307179586';
  return `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform float uDt, uT, uReseed, uEscape;
uniform int uColumn, uSubsteps;
uniform vec4 uOrigin;
out vec4 fragColor;
${decls}
${QUASIRANDOM}

const vec4 MASK = ${vec4(maskOf(dim))};
const vec4 BOUNDED = ${vec4(bounded)};

vec4 derivative (float x, float y, float z, float w, float t) {
  return vec4(
${deriv}
  );
}

vec4 D (vec4 p, float t) { return derivative(p.x, p.y, p.z, p.w, t); }

vec4 reseed (float n) {
  return uOrigin + uReseed * vec4(sphericalRandom(n), 2.0 * fract(n * 0.7548776662) - 1.0) * MASK;
}

void main () {
  int row = int(gl_FragCoord.y);
  vec4 p = texelFetch(uSrc, ivec2(uColumn, row), 0);
  float t = uT;
  float dt = uDt;

  for (int i = 0; i < uSubsteps; i++) {
${isMap ? `    p = D(p, t) * MASK;` : `    vec4 k1 = D(p, t);
    vec4 k2 = D(p + (0.5 * dt) * k1, t + 0.5 * dt);
    vec4 k3 = D(p + (0.5 * dt) * k2, t + 0.5 * dt);
    vec4 k4 = D(p + dt * k3, t + dt);
    p += (dt / 6.0) * (k1 + k4 + 2.0 * (k2 + k3));`}
    t += dt;
${phase ? `    p.z = mod(p.z, ${TAU});\n` : ''}${attractor.wrap ? `    p = mod(p, ${TAU}) * MASK;\n` : ''}
    // Trajectories that escape get pulled back toward the origin along the
    // same ray; ones that go non-finite are re-seeded from scratch. A map has
    // no ray to pull back along -- its next iterate is anywhere -- so an
    // escaping orbit is re-seeded too.
    vec4 q = p * BOUNDED;
    float m = dot(q, q);
    if (!(m < uEscape * 1e6)) p = reseed(float(row) + 0.5 + t);
    else if (m > uEscape) ${isMap ? 'p = reseed(float(row) + 0.5 + t)' : 'p *= 0.0001'};
  }
  fragColor = p;
}`;
}

const origin4 = a => {
  const o = a.initOrigin || [];
  return [0, 1, 2, 3].map(i => o[i] ?? 0);
};

export class Simulation {
  constructor(gl, { particles, steps }) {
    this.gl = gl;
    this.particles = particles;
    this.steps = steps;
    this.head = 0;
    this.t = 0;
    this.filled = 0;

    this.state = floatTarget(gl, steps, particles);
    this.tmp = floatTarget(gl, 1, particles);
    this.quad = fullscreenTriangle(gl);
    this.init = program(gl, FULLSCREEN_VERT, INIT_FRAG);
    this.copy = program(gl, FULLSCREEN_VERT, COPY_FRAG);
    this.programs = new Map(); // attractor name -> compiled integrator
    this.attractor = null;
    this.params = {};
  }

  integrator(attractor) {
    let p = this.programs.get(attractor.name);
    if (!p) {
      p = program(this.gl, FULLSCREEN_VERT, integrateFrag(attractor));
      this.programs.set(attractor.name, p);
    }
    return p;
  }

  // Seed every trail slot with a quasirandom blob and reset the clock.
  reset(attractor) {
    const gl = this.gl;
    this.attractor = attractor;
    this.params = { ...(attractor.params || {}) };
    this.head = 0;
    this.t = 0;
    this.filled = 1;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.fbo);
    gl.viewport(0, 0, this.state.width, this.state.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.init.program);
    gl.uniform2f(this.init.u.uResolution, this.state.width, this.state.height);
    gl.uniform4fv(this.init.u.uOrigin, origin4(attractor));
    gl.uniform4fv(this.init.u.uMask, maskOf(attractor.dim || 3));
    gl.uniform1f(this.init.u.uPhase, attractor.torus ? 1 : 0);
    gl.uniform1f(this.init.u.uScale, attractor.initScale ?? 1);
    gl.bindVertexArray(this.quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // One advance of `substeps` internal steps, appended to the ring buffer. A
  // system may ask for more internal steps per advance than it is given here:
  // the dysts ones are paced in frames per period and then subdivided until
  // float32 RK4 holds them, so `a.substeps` multiplies.
  step(substeps = 1) {
    const gl = this.gl;
    const a = this.attractor;
    if (!a) return;
    const prog = this.integrator(a);
    substeps *= a.substeps || 1;

    // Integrate the head column into the scratch target.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tmp.fbo);
    gl.viewport(0, 0, 1, this.particles);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state.tex);
    gl.uniform1i(prog.u.uSrc, 0);
    gl.uniform1f(prog.u.uDt, a.dt);
    gl.uniform1f(prog.u.uT, this.t);
    gl.uniform1i(prog.u.uColumn, this.head);
    gl.uniform1i(prog.u.uSubsteps, substeps);
    gl.uniform4fv(prog.u.uOrigin, origin4(a));
    // Reusser's systems re-seed in a unit ball and pull back past |p| = 1000,
    // as the notebook does; the dysts ones carry a scale of their own.
    gl.uniform1f(prog.u.uReseed, a.dysts ? a.initScale : 1);
    gl.uniform1f(prog.u.uEscape, a.escape ?? 1e6);
    for (const [name, value] of Object.entries(this.params)) {
      if (prog.u[name]) gl.uniform1f(prog.u[name], value);
    }
    gl.bindVertexArray(this.quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.t += a.dt * substeps;
    this.head = (this.head + 1) % this.steps;
    this.filled = Math.min(this.filled + 1, this.steps);

    // Blit the scratch column back into the ring buffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.fbo);
    gl.viewport(this.head, 0, 1, this.particles);
    gl.useProgram(this.copy.program);
    gl.bindTexture(gl.TEXTURE_2D, this.tmp.tex);
    gl.uniform1i(this.copy.u.uSrc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Run the system far enough that the transient has died and the trail is
  // full of on-attractor samples. Chunked so no single draw runs long.
  spinUp(burnIn = 600, chunk = 24) {
    const passes = Math.ceil(burnIn / chunk);
    for (let i = 0; i < passes; i++) this.step(chunk);
    for (let i = 0; i < this.steps; i++) this.step(1);
  }

  // Pull the trail buffer back to the CPU so the camera can frame the shape
  // it actually settled into, rather than the notebook's hand-tuned guess.
  //
  // `maxRows` reads only the first few trajectories. The full readback is a few
  // megabytes and costs a visible hitch, which is fine between shots but not
  // during one; --continuous mode reframes on the move and asks for a slice.
  readPositions(maxRows = this.particles) {
    const gl = this.gl;
    const rows = Math.max(1, Math.min(this.particles, Math.floor(maxRows)));
    const out = new Float32Array(this.steps * rows * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.fbo);
    gl.readPixels(0, 0, this.steps, rows, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  resize({ particles, steps }) {
    if (particles === this.particles && steps === this.steps) return;
    this.state.destroy();
    this.tmp.destroy();
    this.particles = particles;
    this.steps = steps;
    this.state = floatTarget(this.gl, steps, particles);
    this.tmp = floatTarget(this.gl, 1, particles);
  }

  destroy() {
    this.state.destroy();
    this.tmp.destroy();
    this.quad.destroy();
    this.init.destroy();
    this.copy.destroy();
    for (const p of this.programs.values()) p.destroy();
    this.programs.clear();
  }
}
