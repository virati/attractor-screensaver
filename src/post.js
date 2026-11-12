// Post-processing: the scene is drawn into an offscreen multisample target,
// resolved, given a bloom, and composited onto the canvas.
//
// The multisample target is the antialiasing. Trails resolve their soft edge
// with alpha-to-coverage, and coverage has only as many levels as the buffer
// has samples. The canvas's own buffer gets whatever the browser picks, usually
// four; an offscreen renderbuffer can ask for the GPU's maximum, typically 8 or
// 16, which is two to four times the edge resolution with the pass still
// opaque and still depth-sorted for free. It is also half-float, so the dark
// end of a tail fade is not already quantised to 8 bits before the bloom and
// the final dither see it.
//
// The bloom is the usual mip chain (Jimenez, "Next Generation Post Processing
// in Call of Duty: Advanced Warfare", 2014): a soft-thresholded prefilter at
// half resolution, a 13-tap downsample to each smaller level, then a tent
// upsample added back up the chain. It is skipped on light palettes, where a
// glow only greys out the paper.

import { program, fullscreenTriangle, FULLSCREEN_VERT } from './glutil.js';

const HEADER = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;   // 1 / source size
`;

// Luminance above uThreshold passes, with a quadratic knee below it so the
// cut-off is not a visible edge on a gradient.
const PREFILTER = HEADER + `
uniform float uThreshold, uKnee;
void main () {
  vec3 c = texture(uSrc, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  fragColor = vec4(c * w, 1.0);
}`;

const DOWN = HEADER + `
vec3 at (vec2 o) { return texture(uSrc, uv + o * uTexel).rgb; }
void main () {
  vec3 a = at(vec2(-2, 2)), b = at(vec2(0, 2)), c = at(vec2(2, 2));
  vec3 d = at(vec2(-2, 0)), e = at(vec2(0, 0)), f = at(vec2(2, 0));
  vec3 g = at(vec2(-2, -2)), h = at(vec2(0, -2)), i = at(vec2(2, -2));
  vec3 j = at(vec2(-1, 1)), k = at(vec2(1, 1)), l = at(vec2(-1, -1)), m = at(vec2(1, -1));
  vec3 s = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  fragColor = vec4(s, 1.0);
}`;

const UP = HEADER + `
uniform float uRadius;
vec3 at (vec2 o) { return texture(uSrc, uv + o * uTexel * uRadius).rgb; }
void main () {
  vec3 s = at(vec2(0, 0)) * 4.0
    + (at(vec2(-1, 0)) + at(vec2(1, 0)) + at(vec2(0, -1)) + at(vec2(0, 1))) * 2.0
    + at(vec2(-1, -1)) + at(vec2(1, -1)) + at(vec2(-1, 1)) + at(vec2(1, 1));
  fragColor = vec4(s / 16.0, 1.0);
}`;

const COMPOSITE = HEADER + `
uniform sampler2D uBloom;
uniform float uStrength;
// Interleaved gradient noise, under half a step of 8-bit colour: this is the
// pass that finally quantises to the canvas, so it is the one that dithers.
float dither (vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) - 0.5;
}
void main () {
  vec3 c = texture(uSrc, uv).rgb + uStrength * texture(uBloom, uv).rgb;
  fragColor = vec4(c + dither(gl_FragCoord.xy) / 255.0, 1.0);
}`;

function texture(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h, destroy() { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); } };
}

export class PostFX {
  // `samples`: multisample count, clamped to what the GPU allows (0 = its max).
  // `bloom`: strength, 0 for none. `threshold`: brightness where glow starts.
  constructor(gl, { samples = 0, bloom = 0.55, threshold = 0.3, radius = 1, levels = 6 } = {}) {
    this.gl = gl;
    const max = gl.getParameter(gl.MAX_SAMPLES);
    this.samples = Math.max(1, Math.min(max, samples > 0 ? samples : max));
    this.bloom = bloom;
    this.threshold = threshold;
    this.radius = radius;
    this.levels = levels;
    this.quad = fullscreenTriangle(gl);
    this.prefilter = program(gl, FULLSCREEN_VERT, PREFILTER);
    this.down = program(gl, FULLSCREEN_VERT, DOWN);
    this.up = program(gl, FULLSCREEN_VERT, UP);
    this.composite = program(gl, FULLSCREEN_VERT, COMPOSITE);
    this.width = 0;
    this.height = 0;
    this.targets = null;
  }

  allocate(w, h) {
    const gl = this.gl;
    this.release();
    const color = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.RGBA16F, w, h);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH_COMPONENT24, w, h);
    const msaa = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Incomplete MSAA framebuffer: 0x${status.toString(16)}`);

    const resolved = texture(gl, w, h);
    const chain = [];
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(1, cw >> 1);
      ch = Math.max(1, ch >> 1);
      chain.push(texture(gl, cw, ch));
      if (cw === 1 && ch === 1) break;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.targets = { color, depth, msaa, resolved, chain };
    this.width = w;
    this.height = h;
  }

  release() {
    const t = this.targets;
    if (!t) return;
    const gl = this.gl;
    gl.deleteRenderbuffer(t.color);
    gl.deleteRenderbuffer(t.depth);
    gl.deleteFramebuffer(t.msaa);
    t.resolved.destroy();
    for (const c of t.chain) c.destroy();
    this.targets = null;
  }

  // Bind the multisample target; the scene draws into it as if it were the canvas.
  begin() {
    const gl = this.gl;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (w !== this.width || h !== this.height || !this.targets) this.allocate(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.msaa);
    gl.viewport(0, 0, w, h);
  }

  pass(prog, src, dst, uniforms = {}) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
    gl.viewport(0, 0, dst ? dst.w : this.width, dst ? dst.h : this.height);
    gl.useProgram(prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(prog.u.uSrc, 0);
    gl.uniform2f(prog.u.uTexel, 1 / src.w, 1 / src.h);
    for (const [k, v] of Object.entries(uniforms)) if (prog.u[k]) gl.uniform1f(prog.u[k], v);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Resolve, bloom, and composite onto the canvas.
  end({ glow = true } = {}) {
    const gl = this.gl;
    const { msaa, resolved, chain } = this.targets;
    const w = this.width, h = this.height;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaa);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolved.fbo);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    gl.bindVertexArray(this.quad.vao);
    const strength = glow ? this.bloom : 0;
    if (strength > 0) {
      this.pass(this.prefilter, resolved, chain[0],
        { uThreshold: this.threshold, uKnee: Math.max(0.05, this.threshold * 0.5) });
      for (let i = 1; i < chain.length; i++) this.pass(this.down, chain[i - 1], chain[i]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = chain.length - 1; i > 0; i--) {
        this.pass(this.up, chain[i], chain[i - 1], { uRadius: this.radius });
      }
      gl.disable(gl.BLEND);
    }

    gl.useProgram(this.composite.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, chain[0].tex);
    gl.uniform1i(this.composite.u.uBloom, 1);
    // Each level was added in at full weight on the way up; divide that back out.
    this.pass(this.composite, resolved, null, { uStrength: strength / chain.length });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  destroy() {
    this.release();
    this.quad.destroy();
    for (const p of [this.prefilter, this.down, this.up, this.composite]) p.destroy();
  }
}
