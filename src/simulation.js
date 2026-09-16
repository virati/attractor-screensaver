// GPU state: one RGBA32F texture holding `steps` positions for each of
// `particles` trajectories, advanced with 4th-order Runge-Kutta.
//
// Layout: texel (column, row) = position of particle `row` at trail slot
// `column`. Columns are a ring buffer; `head` is the newest sample.

import { program, floatTarget, fullscreenTriangle, FULLSCREEN_VERT } from './glutil.js';

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
uniform vec3 uOrigin;
uniform float uScale;
out vec4 fragColor;
${QUASIRANDOM}
void main () {
  // gl_FragCoord carries a half-texel offset, which is welcome here: exactly
  // zero states tend to stick to unstable axes and fly off to infinity.
  float particle = gl_FragCoord.y;
  fragColor = vec4(uOrigin + uScale * sphericalRandom(particle), 1.0);
  // A sliver of variation along each trail so there is something to see on
  // the very first frame.
  fragColor.z -= gl_FragCoord.x / uResolution.x * 0.001;
}`;

const COPY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
out vec4 fragColor;
void main () {
  fragColor = texelFetch(uSrc, ivec2(0, int(gl_FragCoord.y)), 0);
}`;

function integrateFrag(attractor) {
  const params = attractor.params || {};
  const names = Object.keys(params);
  const decls = names.length ? names.map(n => `uniform float ${n};`).join('\n') : '';
  const deriv = attractor.deriv.trim().split('\n').map(l => '    ' + l.trim()).join('\n');
  return `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform float uDt, uT;
uniform int uColumn, uSubsteps;
uniform vec3 uOrigin;
out vec4 fragColor;
${decls}
${QUASIRANDOM}

vec3 derivative (float x, float y, float z, float t) {
  return vec3(
${deriv}
  );
}

vec3 D (vec3 p, float t) { return derivative(p.x, p.y, p.z, t); }

void main () {
  int row = int(gl_FragCoord.y);
  vec3 p = texelFetch(uSrc, ivec2(uColumn, row), 0).xyz;
  float t = uT;
  float dt = uDt;

  for (int i = 0; i < uSubsteps; i++) {
    vec3 k1 = D(p, t);
    vec3 k2 = D(p + (0.5 * dt) * k1, t + 0.5 * dt);
    vec3 k3 = D(p + (0.5 * dt) * k2, t + 0.5 * dt);
    vec3 k4 = D(p + dt * k3, t + dt);
    p += (dt / 6.0) * (k1 + k4 + 2.0 * (k2 + k3));
    t += dt;

    // Trajectories that escape get pulled back toward the origin along the
    // same ray; ones that go non-finite are re-seeded from scratch.
    float m = dot(p, p);
    if (!(m < 1e12)) p = uOrigin + sphericalRandom(float(row) + 0.5 + t);
    else if (m > 1e6) p *= 0.0001;
  }
  fragColor = vec4(p, 1.0);
}`;
}

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

    const origin = attractor.initOrigin || [0, 0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.fbo);
    gl.viewport(0, 0, this.state.width, this.state.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.init.program);
    gl.uniform2f(this.init.u.uResolution, this.state.width, this.state.height);
    gl.uniform3fv(this.init.u.uOrigin, origin);
    gl.uniform1f(this.init.u.uScale, attractor.initScale ?? 1);
    gl.bindVertexArray(this.quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // One RK4 advance of `substeps` internal steps, appended to the ring buffer.
  step(substeps = 1) {
    const gl = this.gl;
    const a = this.attractor;
    if (!a) return;
    const prog = this.integrator(a);

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
    gl.uniform3fv(prog.u.uOrigin, a.initOrigin || [0, 0, 0]);
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
  readPositions() {
    const gl = this.gl;
    const out = new Float32Array(this.steps * this.particles * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.fbo);
    gl.readPixels(0, 0, this.steps, this.particles, gl.RGBA, gl.FLOAT, out);
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
