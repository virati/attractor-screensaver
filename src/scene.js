// Frame composition: floor smear, trails, grid room, transition veil.

import { program, fullscreenTriangle, FULLSCREEN_VERT } from './glutil.js';
import { Simulation } from './simulation.js';
import { TrailRenderer } from './lines.js';
import { Stage } from './stage.js';
import { Camera } from './camera.js';

const VEIL_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main () { fragColor = uColor; }`;

export class Scene {
  constructor(gl, opts) {
    this.gl = gl;
    this.sim = new Simulation(gl, opts);
    this.trails = new TrailRenderer(gl);
    this.stage = new Stage(gl);
    this.camera = new Camera();
    this.quad = fullscreenTriangle(gl);
    this.veil = program(gl, FULLSCREEN_VERT, VEIL_FRAG);
    this.style = null;
  }

  render({ veil = 0 } = {}) {
    const gl = this.gl;
    const style = this.style;
    if (!style) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(style.background[0], style.background[1], style.background[2], 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.BLEND);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    if (style.shadow && this.camera.eye[1] > style.floorY) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      this.trails.draw(this.sim, this.camera, style, { shadow: true });
      gl.depthMask(true);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.trails.draw(this.sim, this.camera, style, { shadow: false });

    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    if (style.gridOpacity > 0.002) this.stage.draw(this.camera, style);

    if (veil > 0.001) {
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.veil.program);
      gl.uniform4f(this.veil.u.uColor, style.background[0], style.background[1], style.background[2], veil);
      gl.bindVertexArray(this.quad.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
  }

  destroy() {
    this.sim.destroy();
    this.trails.destroy();
    this.stage.destroy();
    this.quad.destroy();
    this.veil.destroy();
  }
}
