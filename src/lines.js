// Trail renderer. Every visible segment is an instanced capsule whose corners
// are placed in screen space by the vertex shader, so line width is in pixels
// and independent of depth. The round ends come from an SDF the fragment shader
// turns into alpha, resolved by alpha-to-coverage against a multisampled target
// -- that keeps the pass opaque, so trails depth-test against each other
// without any sorting.

import { program } from './glutil.js';

const VERT = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 corner;   // (0..1, 0..1)

uniform mat4 uProjView, uTransform;
uniform sampler2D uState;
uniform ivec4 uRing;      // steps, particles, head, filled
uniform int uSegsPerTrail, uShadow, uBlend;
uniform vec2 uResolution; // device pixels
uniform float uWidth, uFade, uTailFade, uColorMode, uFloorY;
uniform vec3 uColor1, uColor2, uBackground, uShadowColor;

out vec3 vCapsule;   // (pixels along from A, pixels across, segment length)
out vec2 vRadius;    // radius at A and at B, pixels
out vec4 vColor;

vec3 quasirandom (float n) {
  const float g = 1.22074408460575947536;
  return fract(0.5 + n * vec3(1.0 / g, 1.0 / (g * g), 1.0 / (g * g * g))).zyx;
}

vec4 clipOf (int particle, int slot) {
  int column = (uRing.z + 1 + slot) % uRing.x;
  vec4 world = uTransform * vec4(texelFetch(uState, ivec2(column, particle), 0).xyz, 1.0);
  if (uShadow == 1) world.y = uFloorY;
  return uProjView * world;
}

// The simulation writes w = 0 into a sample it had to re-seed rather than
// integrate, so the segment arriving at it is a jump, not a piece of trail.
bool reseeded (int particle, int slot) {
  int column = (uRing.z + 1 + slot) % uRing.x;
  return texelFetch(uState, ivec2(column, particle), 0).w < 0.5;
}

float widthAt (float param) {
  return uWidth * exp(-3.0 * uFade * (1.0 - param));
}

void main () {
  int steps = uRing.x;
  int particle = gl_InstanceID / uSegsPerTrail;
  int slot = gl_InstanceID - particle * uSegsPerTrail;

  // Slots older than what has actually been simulated are collapsed away.
  bool alive = slot >= steps - uRing.w;
  if (reseeded(particle, slot + 1)) alive = false;

  float denom = float(steps - 1);
  float paramA = float(slot) / denom;
  float paramB = float(slot + 1) / denom;
  float pn = (float(particle) + 0.5) / float(uRing.y);

  vec4 clipA = clipOf(particle, slot);
  vec4 clipB = clipOf(particle, slot + 1);

  if (!alive || clipA.w <= 0.0 || clipB.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);  // behind the far plane: clipped
    vCapsule = vec3(0.0);
    vRadius = vec2(1.0);
    vColor = vec4(0.0);
    return;
  }

  vec2 halfRes = 0.5 * uResolution;
  vec2 pxA = (clipA.xy / clipA.w) * halfRes;
  vec2 pxB = (clipB.xy / clipB.w) * halfRes;
  float zA = clipA.z / clipA.w;
  float zB = clipB.z / clipB.w;

  // Each segment is a capsule: the quad runs a radius past both ends and the
  // fragment shader rounds them off. Consecutive capsules overlap at the
  // joint at the same depth, so a bend gets a round join with no second pass.
  // (Joints used to be separate discs pushed just behind the segments, and
  // wherever another trail sat at nearly the same depth it won inside the
  // wedge, which with wide strokes read as teeth down every trail.)
  float rA = 0.5 * widthAt(paramA);
  float rB = 0.5 * widthAt(paramB);
  float r = max(rA, rB);
  vec2 d = pxB - pxA;
  float len = length(d);
  vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float along = mix(-r, len + r, corner.x);
  float across = (corner.y * 2.0 - 1.0) * r;
  vec2 px = pxA + dir * along + nrm * across;
  float t = len > 1e-5 ? clamp(along / len, 0.0, 1.0) : 0.0;
  float z = mix(zA, zB, t);
  float param = mix(paramA, paramB, t);
  vCapsule = vec3(along, across, len);
  vRadius = vec2(rA, rB);

  // Per-trail depth nudge, so trails that overlap exactly do not z-fight.
  z -= 0.0001 * abs(pn - 0.5);

  gl_Position = vec4(px / halfRes, z, 1.0);

  if (uShadow == 1) {
    vColor = vec4(uShadowColor, 1.0);
  } else {
    // uColorMode weighs the particle's seed radius against its index. The
    // notebook offers the same two ends of this and nothing between; a value
    // in between is the one thing here it cannot do.
    float coord = mix(quasirandom(float(particle) + 0.5).z, pn, uColorMode);
    vec3 rgb = mix(uColor1, uColor2, coord);
    // The tail fade stays in the colour rather than moving into alpha. Carrying
    // it in alpha reads better in theory and is what the notebook does, but the
    // joints here are separate discs drawn under the segments, and that only
    // hides them while the segments are opaque. A translucent stroke lets every
    // disc show through and the trail turns into a chain of beads.
    vColor = vec4(mix(rgb, uBackground, uTailFade * pow(1.0 - param, 0.7)), 1.0);
  }
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;

in vec3 vCapsule;
in vec2 vRadius;
in vec4 vColor;

uniform int uShadow, uBlend;
uniform float uShading, uDither;
uniform vec2 uBorderWidth;
uniform vec4 uBorderColor;

out vec4 fragColor;

float linearstep (float a, float b, float x) { return clamp((x - a) / (b - a), 0.0, 1.0); }

// Interleaved gradient noise, under half a step of 8-bit colour. The tail fade
// walks a long, low-contrast ramp into the background, and against a true-black
// ground the dark end of that ramp has very few values left, so it bands in
// visible rings. Dithering turns the step into noise below the eye's threshold.
float dither (vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) - 0.5;
}

void main () {
  float along = vCapsule.x, across = vCapsule.y, len = vCapsule.z;
  float r = mix(vRadius.x, vRadius.y, len > 1e-5 ? clamp(along / len, 0.0, 1.0) : 0.0);
  float beyond = max(-along, along - len);       // > 0 inside the round ends
  float sdf = length(vec2(max(beyond, 0.0), across)) / r;

  // A pixel-wide feather, resolved by alpha-to-coverage.
  float edge = linearstep(1.0, 1.0 - 1.0 / r, sdf) * vColor.a;
  // Nothing invisible should reach the depth buffer and block what is behind it.
  if (edge < 0.004) discard;

  if (uShadow == 1) {
    fragColor = vec4(vColor.rgb, edge);
    return;
  }

  // A cheap cylindrical highlight across the width of the stroke.
  float shade01 = across / r;
  float highlight = 1.0 - shade01 * shade01;
  float shade = mix(1.0, highlight, uShading);
  shade = mix(shade, 1.0, uShading * highlight * 0.7);

  vec2 threshold = 1.0 - uBorderWidth / (2.0 * r);
  float isBorder = linearstep(threshold.x, threshold.y, sdf);
  // Ink the sides only. A cap mostly lies over the neighbouring segment, and
  // inked it would draw a ring across the stroke at every sample.
  float sides = 1.0 - linearstep(0.0, 0.5 * r, beyond);

  vec3 rgb = mix(vColor.rgb * shade, uBorderColor.rgb, isBorder * uBorderColor.a * sides);
  fragColor = vec4(rgb + uDither * dither(gl_FragCoord.xy) / 255.0, edge);
}`;

export class TrailRenderer {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, VERT, FRAG);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindVertexArray(null);
  }

  // `dither`: off when drawing into the post-processing target, which dithers
  // once, at the point it actually quantises to 8 bits.
  draw(sim, camera, style, { shadow = false, dither = true } = {}) {
    const gl = this.gl;
    const { u, program: p } = this.prog;
    const dpr = style.pixelRatio;
    const width = Math.max(0.5, style.width * dpr);

    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sim.state.tex);

    gl.uniform1i(u.uState, 0);
    gl.uniformMatrix4fv(u.uProjView, false, camera.projView);
    gl.uniformMatrix4fv(u.uTransform, false, style.transform);
    gl.uniform4i(u.uRing, sim.steps, sim.particles, sim.head, sim.filled);
    gl.uniform2f(u.uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.uWidth, shadow ? width * 1.05 : width);
    gl.uniform1f(u.uFade, style.fade);
    gl.uniform1f(u.uTailFade, shadow ? 0 : style.tailFade);
    gl.uniform1f(u.uColorMode, style.colorBy);
    gl.uniform1i(u.uBlend, style.blend ? 1 : 0);
    gl.uniform1f(u.uFloorY, style.floorY);
    gl.uniform3fv(u.uColor1, style.color1);
    gl.uniform3fv(u.uColor2, style.color2);
    gl.uniform3fv(u.uBackground, style.background);
    gl.uniform3fv(u.uShadowColor, style.shadowColor);
    gl.uniform1i(u.uShadow, shadow ? 1 : 0);
    gl.uniform1f(u.uShading, style.shading);
    gl.uniform1f(u.uDither, dither ? 1 : 0);
    gl.uniform2f(u.uBorderWidth,
      2.0 * style.borderWidth * dpr + 0.75,
      2.0 * style.borderWidth * dpr - 0.75);
    gl.uniform4f(u.uBorderColor, ...style.borderColor, style.borderOpacity);

    gl.uniform1i(u.uSegsPerTrail, sim.steps - 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sim.particles * (sim.steps - 1));

    gl.bindVertexArray(null);
  }

  destroy() {
    this.prog.destroy();
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.buf);
  }
}
