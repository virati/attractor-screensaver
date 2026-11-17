// Evaluates each generated GLSL derivative as JavaScript at points the
// generator recorded, and compares against what sympy's numpy evaluation gave
// there. Catches printer mistakes (precedence, missing functions) without a GPU.
//
//   node tools/check-dysts.mjs

import fs from 'fs';
import { DYSTS } from '../src/dysts.js';
import { splitComponents } from '../src/format.js';

const vectors = JSON.parse(fs.readFileSync(new URL('./dysts-check.json', import.meta.url)));
const fns = 'sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh exp log floor sqrt abs sign'
  .split(' ').map(n => `const ${n} = Math.${n};`).join(' ');
const glslOnly = `const pow = Math.pow; const inversesqrt = v => 1 / Math.sqrt(v);
  const atan2 = Math.atan2; const mod = (a, b) => a - b * Math.floor(a / b);`;

let bad = 0;
for (const a of DYSTS) {
  const parts = splitComponents(a.deriv);
  const names = Object.keys(a.params);
  const body = parts.map(p => p.replace(/\batan\(([^,()]+),/g, 'atan2($1,')).join(', ');
  const f = new Function('x', 'y', 'z', 'w', 't', ...names, `${fns} ${glslOnly} return [${body}];`);
  for (const [x, want] of vectors[a.name]) {
    const got = f(x[0], x[1], x[2] ?? 0, x[3] ?? 0, 0.7, ...names.map(n => a.params[n]));
    const ok = want.every((v, i) => Math.abs(v - got[i]) <= 1e-6 * Math.max(1, Math.abs(v)) || (Number.isNaN(v) && Number.isNaN(got[i])));
    if (!ok) { bad++; console.log(`MISMATCH ${a.name}`, x, want, got); break; }
  }
}
console.log(`${DYSTS.length - bad}/${DYSTS.length} derivatives match`);
process.exit(bad ? 1 : 0);
