// Trail renderer. Every visible segment and every joint is an instanced quad
// whose corners are placed in screen space by the vertex shader, so line width
// is in pixels and independent of depth. Round joints come from an SDF the
// fragment shader turns into alpha, resolved by alpha-to-coverage against the
// multisampled default framebuffer -- that keeps the pass opaque, so trails can
// depth-test against each other without any sorting.

import { program } from './glutil.js';

const VERT = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 corner;   // (0..1, 0..1)

uniform mat4 uProjView, uTransform;
uniform sampler2D uState;
uniform ivec4 uRing;      // steps, particles, head, filled
uniform int uSegsPerTrail, uMode, uShadow, uBlend;
uniform vec2 uResolution; // device pixels
uniform float uWidth, uFade, uTailFade, uColorMode, uFloorY;
uniform vec3 uColor1, uColor2, uBackground, uShadowColor;

out vec2 vLineCoord;
out float vWidth, vShade, vBorderMix;
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

float widthAt (float param) {
  return uWidth * exp(-3.0 * uFade * (1.0 - param));
}

void main () {
  int steps = uRing.x;
  int particle = gl_InstanceID / uSegsPerTrail;
  int slot = gl_InstanceID - particle * uSegsPerTrail;

  // Slots older than what has actually been simulated are collapsed away.
  bool alive = slot >= steps - uRing.w;

  float denom = float(steps - 1);
  float paramA = float(slot) / denom;
  float paramB = float(slot + 1) / denom;
  float pn = (float(particle) + 0.5) / float(uRing.y);

  vec4 clipA = clipOf(particle, slot);
  vec4 clipB = uMode == 0 ? clipOf(particle, slot + 1) : clipA;

  if (!alive || clipA.w <= 0.0 || clipB.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);  // behind the far plane: clipped
    vLineCoord = vec2(0.0);
    vWidth = 1.0;
    vShade = 0.0;
    vColor = vec4(0.0);
    return;
  }

  vec2 halfRes = 0.5 * uResolution;
  vec2 pxA = (clipA.xy / clipA.w) * halfRes;
  vec2 pxB = (clipB.xy / clipB.w) * halfRes;
  float zA = clipA.z / clipA.w;
  float zB = clipB.z / clipB.w;

  float along, across, param, z;
  vec2 px;

  if (uMode == 0) {
    along = corner.x;
    across = corner.y * 2.0 - 1.0;
    param = mix(paramA, paramB, along);
    vWidth = widthAt(param);
    vec2 d = pxB - pxA;
    float len = length(d);
    vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
    px = mix(pxA, pxB, along) + vec2(-dir.y, dir.x) * across * (0.5 * vWidth);
    z = mix(zA, zB, along);
    vLineCoord = vec2(0.0, across);
    vShade = across;
    vBorderMix = 1.0;
  } else {
    vec2 c = corner * 2.0 - 1.0;
    param = paramA;
    vWidth = widthAt(param);
    px = pxA + c * (0.5 * vWidth);
    // Nudged away from the eye so the segments drawn afterwards win wherever
    // they overlap, leaving only the part of the disc that is a real joint.
    z = zA + 1e-5;
    vLineCoord = c;

    // Shade the disc across the stroke, not radially, so a joint does not
    // read as a bead threaded onto the line.
    int neighbour = slot < steps - 1 ? slot + 1 : slot - 1;
    vec4 clipN = clipOf(particle, neighbour);
    vec2 tangent = vec2(1.0, 0.0);
    if (clipN.w > 0.0) {
      vec2 delta = (clipN.xy / clipN.w) * halfRes - pxA;
      if (length(delta) > 1e-5) tangent = normalize(delta);
    }
    vShade = dot(c, vec2(-tangent.y, tangent.x));

    // The border ink is drawn at the edge of whatever primitive is being
    // rasterised, and a joint is a whole disc, so it was getting a complete
    // dark ring -- one per trail sample, which reads as a black seam chopping
    // the trail into segments. The ink is wanted where the disc forms the side
    // of the stroke and not where it butts up against the segments either side,
    // so it fades out along the direction of travel.
    vBorderMix = clamp(1.0 - abs(dot(c, tangent)) * 1.7, 0.0, 1.0);
  }

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

in vec2 vLineCoord;
in float vWidth, vShade, vBorderMix;
in vec4 vColor;

uniform int uShadow, uBlend;
uniform float uShading;
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
  float sdf = length(vLineCoord);

  float edge = linearstep(1.0, 1.0 - 2.0 / vWidth, sdf) * vColor.a;
  // Nothing invisible should reach the depth buffer and block what is behind it.
  if (uBlend == 1 && edge < 0.004) discard;

  if (uShadow == 1) {
    fragColor = vec4(vColor.rgb, edge);
    return;
  }

  // A cheap cylindrical highlight across the width of the stroke.
  float highlight = 1.0 - vShade * vShade;
  float shade = mix(1.0, highlight, uShading);
  shade = mix(shade, 1.0, uShading * highlight * 0.7);

  vec2 threshold = 1.0 - uBorderWidth / vWidth;
  float isBorder = linearstep(threshold.x, threshold.y, sdf);

  vec3 rgb = mix(vColor.rgb * shade, uBorderColor.rgb, isBorder * uBorderColor.a * vBorderMix);
  fragColor = vec4(rgb + dither(gl_FragCoord.xy) / 255.0, edge);
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

  draw(sim, camera, style, { shadow = false } = {}) {
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
    gl.uniform2f(u.uBorderWidth,
      2.0 * style.borderWidth * dpr + 0.75,
      2.0 * style.borderWidth * dpr - 0.75);
    gl.uniform4f(u.uBorderColor, ...style.borderColor, style.borderOpacity);

    // Joints first, segments over them: what remains of a disc is exactly the
    // wedge a corner needs, plus the round caps at either end of a trail.
    gl.uniform1i(u.uSegsPerTrail, sim.steps);
    gl.uniform1i(u.uMode, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sim.particles * sim.steps);

    gl.uniform1i(u.uSegsPerTrail, sim.steps - 1);
    gl.uniform1i(u.uMode, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sim.particles * (sim.steps - 1));

    gl.bindVertexArray(null);
  }

  destroy() {
    this.prog.destroy();
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.buf);
  }
}
