// Orbit camera with a slow, never-quite-repeating drift.

import * as mat4 from './mat4.js';

export class Camera {
  constructor() {
    this.target = [0, 0.5, 0];
    this.distance = 3.2;
    this.theta = 0.9;       // azimuth
    this.phi = 0.32;        // elevation, radians above the horizon
    this.fov = Math.PI / 4;
    this.aspect = 1;

    this.dTheta = 0.0022;   // radians per frame at 60fps
    this.phiCenter = 0.32;
    this.phiSwing = 0.22;
    this.phiRate = 0.11;
    this.clock = 0;

    this.eye = new Float32Array(3);
    this.view = mat4.create();
    this.projection = mat4.create();
    this.projView = mat4.create();
    this.drag = null;
  }

  // Randomise the vantage point without ever ducking under the floor.
  randomize(rng = Math.random) {
    this.theta = rng() * Math.PI * 2;
    this.phiCenter = 0.12 + rng() * 0.5;
    this.phiSwing = 0.06 + rng() * 0.22;
    this.phiRate = 0.06 + rng() * 0.12;
    this.dTheta = (rng() < 0.5 ? -1 : 1) * (0.0012 + rng() * 0.0022);
    this.distance = 2.9 + rng() * 0.9;
    this.clock = rng() * 100;
  }

  update(dt) {
    this.clock += dt;
    if (!this.drag) {
      this.theta += this.dTheta * dt * 60;
      this.phi = this.phiCenter + this.phiSwing * Math.sin(this.clock * this.phiRate);
    }
    this.phi = Math.max(-0.45, Math.min(1.45, this.phi));

    const cp = Math.cos(this.phi), sp = Math.sin(this.phi);
    this.eye[0] = this.target[0] + this.distance * cp * Math.cos(this.theta);
    this.eye[1] = this.target[1] + this.distance * sp;
    this.eye[2] = this.target[2] + this.distance * cp * Math.sin(this.theta);

    mat4.perspective(this.projection, this.fov, this.aspect, 0.05, 60);
    mat4.lookAt(this.view, this.eye, this.target, [0, 1, 0]);
    mat4.multiply(this.projView, this.projection, this.view);
  }

  // Back off far enough that a sphere of `radius` about the target fits the
  // narrower of the two field-of-view angles, with room to breathe.
  frameRadius(radius, margin = 1.35) {
    const vertical = this.fov / 2;
    const horizontal = Math.atan(Math.tan(vertical) * this.aspect);
    const half = Math.min(vertical, horizontal);
    this.distance = Math.max(1.4, Math.min(9, (radius / Math.sin(half)) * margin));
  }

  orbitBy(dx, dy) {
    this.theta -= dx * 0.005;
    this.phiCenter = Math.max(-0.4, Math.min(1.4, this.phiCenter - dy * 0.005));
    this.phi = this.phiCenter;
  }

  zoomBy(delta) {
    this.distance = Math.max(0.8, Math.min(12, this.distance * Math.exp(delta * 0.0012)));
  }
}
