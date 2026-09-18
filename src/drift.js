// Smooth, endless parameter motion for --continuous mode.
//
// The published parameter values are the ones that are known to put each system
// on its attractor, so this wanders around them rather than exploring freely: a
// sum of two slow sinusoids per parameter, centred on the published value. Both
// sinusoids start at zero phase, so the drift begins exactly where the spin-up
// left off and there is no jump when it starts.
//
// The periods of the two waves are incommensurate, and every parameter gets a
// different pair, so the combination never comes back round to where it began.

const PHI = 1.618033988749895;

export class Drift {
  // `amplitude` is a fraction of each published value; `period` the base swing
  // in seconds. A parameter published as exactly zero has no scale of its own,
  // so it gets `zeroAmplitude` in absolute terms instead.
  constructor({ amplitude = 0.12, period = 55, zeroAmplitude = 0.05 } = {}) {
    this.amplitude = amplitude;
    this.period = period;
    this.zeroAmplitude = zeroAmplitude;
    this.clock = 0;
    this.base = {};
    this.keys = [];
  }

  reset(attractor) {
    this.clock = 0;
    this.base = { ...(attractor.params || {}) };
    this.keys = Object.keys(this.base);
  }

  advance(dt, sim) {
    if (!this.keys.length) return;
    this.clock += dt;
    const t = this.clock;
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      const v = this.base[key];
      const amp = v === 0 ? this.zeroAmplitude : Math.abs(v) * this.amplitude;
      const w1 = (2 * Math.PI) / (this.period * (1 + i * 0.31));
      const w2 = (2 * Math.PI) / (this.period * PHI * (1 + i * 0.17));
      sim.params[key] = v + amp * (0.68 * Math.sin(w1 * t) + 0.32 * Math.sin(w2 * t));
    }
  }

  // Current values, for the readout under the title.
  values(sim) {
    const out = {};
    for (const key of this.keys) out[key] = sim.params[key];
    return out;
  }
}
