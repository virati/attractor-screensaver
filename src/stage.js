// The room the attractor sits in: a box of faint grid paper, drawn only on the
// far side of the camera so it reads as a backdrop and floor rather than a cage.
// Ported from the notebook's "fancy axes" cell.

import { program } from './glutil.js';
import * as mat4 from './mat4.js';

const VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec3 tangent;
layout(location = 3) in vec3 bitangent;

uniform mat4 uProjView, uModel;
uniform mat3 uNormalMatrix;

out vec2 vCoord;
out vec3 vPos, vNormal;

void main () {
  vPos = (uModel * vec4(position, 1.0)).xyz;
  vNormal = uNormalMatrix * normal;
  vCoord = vec2(dot(position, bitangent), dot(position, tangent));
  gl_Position = uProjView * vec4(vPos, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 vCoord;
in vec3 vPos, vNormal;

uniform vec3 uEye, uGridColor;
uniform float uOpacity, uGridScale;

out vec4 fragColor;

float gridFactor (vec2 parameter, float width) {
  vec2 d = fwidth(parameter);
  vec2 looped = 0.5 - abs(mod(parameter, 1.0) - 0.5);
  vec2 a2 = smoothstep(d * (width + 0.5), d * (width - 0.5), looped);
  return max(a2.x, a2.y);
}

void main () {
  vec3 n = normalize(vNormal);
  float vDotN = dot(normalize(vPos - uEye), n);

  // Only the walls behind the subject; the ones between us and it are dropped.
  if (vDotN < 0.0) discard;

  float fade = smoothstep(0.02, 0.25, vDotN);
  // Cell size stays fixed in world units however large the room gets.
  float alpha = fade * uOpacity * (
    gridFactor(vCoord * 4.0 * uGridScale, 0.5) +
    0.2 * gridFactor(vCoord * 40.0 * uGridScale, 0.5)
  );
  if (alpha < 0.002) discard;
  fragColor = vec4(uGridColor, alpha);
}`;

function boxGeometry() {
  const position = [], normal = [], tangent = [], bitangent = [], index = [];
  const basis = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
  for (let axis = 0; axis < 3; axis++) {
    const n = basis[axis];
    const t = basis[(axis + 1) % 3];
    const b = basis[(axis + 2) % 3];
    for (const sign of [1, -1]) {
      const base = position.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        position.push(
          sign * n[0] + su * t[0] + sv * b[0],
          sign * n[1] + su * t[1] + sv * b[1],
          sign * n[2] + su * t[2] + sv * b[2]
        );
        normal.push(sign * n[0], sign * n[1], sign * n[2]);
        tangent.push(...t);
        bitangent.push(...b);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { position, normal, tangent, bitangent, index };
}

export class Stage {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, VERT, FRAG);

    const g = boxGeometry();
    this.count = g.index.length;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffers = [];
    [g.position, g.normal, g.tangent, g.bitangent].forEach((data, loc) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      this.buffers.push(buf);
    });
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.index), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.model = mat4.create();
    this.normalMatrix = new Float32Array(9);
    this.shaped = null;
  }

  // A cube of half-extent `half` whose underside rests on `floorY`.
  shape(half, floorY) {
    const key = `${half}:${floorY}`;
    if (this.shaped === key) return;
    this.shaped = key;
    mat4.scale(this.model, mat4.fromTranslation(mat4.create(), [0, floorY + half, 0]), [half, half, half]);
    mat4.normalFromMat4(this.normalMatrix, this.model);
  }

  draw(camera, style) {
    const gl = this.gl;
    const { u, program: p } = this.prog;
    this.shape(style.roomHalf, style.floorY);
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(u.uProjView, false, camera.projView);
    gl.uniformMatrix4fv(u.uModel, false, this.model);
    gl.uniformMatrix3fv(u.uNormalMatrix, false, this.normalMatrix);
    gl.uniform3fv(u.uEye, camera.eye);
    gl.uniform3fv(u.uGridColor, style.gridColor);
    gl.uniform1f(u.uOpacity, style.gridOpacity);
    gl.uniform1f(u.uGridScale, style.roomHalf / 2);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  destroy() {
    this.prog.destroy();
    this.gl.deleteVertexArray(this.vao);
    this.buffers.forEach(b => this.gl.deleteBuffer(b));
    this.gl.deleteBuffer(this.ibo);
  }
}
