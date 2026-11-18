// Which entries of the 3×3 Jacobian ∂fᵢ/∂xⱼ are not identically zero: the
// system's coupling graph. An entry counts as live when its variable appears in
// the component *and* its partial is nonzero somewhere on the attractor, at the
// parameters currently in play — so a term whose coefficient is zero (or has
// drifted through zero) reads as absent, the way it would on paper.

import { splitComponents } from './format.js';

const VARS = ['x', 'y', 'z'];
const MATH = 'const { sin, cos, tan, exp, log, abs, sign, sqrt, pow, tanh, atan, floor, min, max } = Math;';

const compiled = new Map();

// The derivative source is GLSL, but every function it uses has a Math twin of
// the same name and every literal is a valid JS number, so it runs as written.
function compile(attractor) {
  if (compiled.has(attractor.name)) return compiled.get(attractor.name);
  const names = Object.keys(attractor.params || {});
  const parts = splitComponents(attractor.deriv).slice(0, 3);
  let fn = null;
  try {
    fn = new Function('x', 'y', 'z', 't', 'p',
      `${MATH} const { ${names.join(', ')} } = p; return [${parts.join(', ')}];`);
  } catch (e) {
    fn = null;
  }
  const mentions = parts.map(src => VARS.map(v => new RegExp(`\\b${v}\\b`).test(src)));
  const entry = { fn, mentions };
  compiled.set(attractor.name, entry);
  return entry;
}

// positions: the RGBA32F trail buffer from sim.readPositions(). Returns a 3×3
// array of booleans, rows = components (ẋ ẏ ż), columns = x y z.
export function jacobianSupport(attractor, params, positions, maxSamples = 400) {
  const { fn, mentions } = compile(attractor);
  if (!fn || !positions || !positions.length) return mentions;

  const count = positions.length / 4;
  const stride = Math.max(1, Math.floor(count / maxSamples));
  const peak = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let scale = 0;
  for (let k = 0; k < count; k += stride) {
    const p = [positions[k * 4], positions[k * 4 + 1], positions[k * 4 + 2]];
    if (!p.every(Number.isFinite)) continue;
    for (let j = 0; j < 3; j++) {
      const h = 1e-4 * (1 + Math.abs(p[j]));
      const a = p.slice(), b = p.slice();
      a[j] += h; b[j] -= h;
      const fa = fn(a[0], a[1], a[2], 0, params);
      const fb = fn(b[0], b[1], b[2], 0, params);
      for (let i = 0; i < 3; i++) {
        const d = Math.abs((fa[i] - fb[i]) / (2 * h));
        if (!Number.isFinite(d)) continue;
        if (d > peak[i][j]) peak[i][j] = d;
        if (d > scale) scale = d;
      }
    }
  }
  // Central differences in float64 leave residue around 1e-9 of the largest
  // entry; anything that small is a zero that did not cancel cleanly.
  const floor = Math.max(1e-12, scale * 1e-7);
  return mentions.map((row, i) => row.map((m, j) => m && peak[i][j] > floor));
}

export class JacobianPanel {
  constructor(root) {
    this.root = root;
    this.cells = [...root.querySelectorAll('.jac-cell')];
  }

  show(support) {
    support.flat().forEach((on, k) => this.cells[k].classList.toggle('on', !!on));
  }
}
