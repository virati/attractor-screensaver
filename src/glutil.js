// Thin WebGL2 helpers: programs with cached uniform locations, float FBOs.

export function createContext(canvas, { antialias = true } = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias,
    alpha: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    desynchronized: true
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('EXT_color_buffer_float is required (float render targets).');
  }
  return gl;
}

function compile(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const numbered = source.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed:\n${log}\n${numbered}`);
  }
  return sh;
}

export function program(gl, vert, frag) {
  const p = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vert);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`Program link failed:\n${log}`);
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { program: p, u, destroy: () => gl.deleteProgram(p) };
}

// RGBA32F render target. NEAREST filtering; we only ever texelFetch it.
export function floatTarget(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Incomplete framebuffer: 0x${status.toString(16)}`);

  return {
    tex, fbo, width, height,
    destroy() { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); }
  };
}

// A single oversized triangle covering the viewport, for fullscreen passes.
export function fullscreenTriangle(gl) {
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-4, -4, 0, 4, 4, -4]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, destroy() { gl.deleteVertexArray(vao); gl.deleteBuffer(buf); } };
}

export const FULLSCREEN_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 xy;
out vec2 uv;
void main () {
  uv = 0.5 * xy + 0.5;
  gl_Position = vec4(xy, 0, 1);
}`;

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255
  ];
}
