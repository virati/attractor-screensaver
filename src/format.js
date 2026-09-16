// Turns the GLSL derivative source into something readable under the title.

export function splitComponents(deriv) {
  const parts = [];
  let depth = 0, current = '';
  for (const ch of deriv) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const SUPER = { 2: '²', 3: '³' };

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω'
};

const GREEK_RE = new RegExp(`\\b(${Object.keys(GREEK).join('|')})\\b`, 'g');

export const greek = s => s.replace(GREEK_RE, m => GREEK[m]);

// Four significant figures is plenty; 2.6666666666666665 is not a parameter.
export const shortNumber = v => {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(4)));
};

export function prettyExpression(src) {
  let s = ' ' + src + ' ';
  // Collapse repeated self-products into exponents, longest run first.
  for (const v of ['x', 'y', 'z']) {
    for (const n of [4, 3, 2]) {
      const run = new RegExp(`\\b${v}(?:\\s*\\*\\s*${v}){${n - 1}}\\b`, 'g');
      s = s.replace(run, v + (SUPER[n] || `^${n}`));
    }
  }
  s = s.replace(/\s*\*\s*/g, ' ');
  s = s.replace(/\s*\/\s*/g, ' / ');
  s = s.replace(/\bpow\b/g, 'pow');
  s = s.replace(/(\d)\.0\b/g, '$1');
  s = s.replace(/\b1 (?=[a-zA-Zα-ω(])/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return greek(s);
}

export function equations(attractor) {
  const dots = ['ẋ', 'ẏ', 'ż'];
  return splitComponents(attractor.deriv).slice(0, 3)
    .map((part, i) => `${dots[i]} = ${prettyExpression(part)}`);
}

export function parameterLine(attractor) {
  if (!attractor.params) return '';
  return Object.entries(attractor.params)
    .map(([k, v]) => `${greek(k)} = ${shortNumber(v)}`)
    .join('   ');
}

export function reference(attractor) {
  const r = attractor.refs && attractor.refs[0];
  if (!r) return '';
  const who = r.authors ? r.authors.join(', ') + ' · ' : '';
  return who + (r.title || '');
}
