import fs from 'fs';
const src = fs.readFileSync('notebook.js', 'utf8');
const start = src.indexOf('  const attractors = {');
const end = src.indexOf('\n  };\n  for (const [key, attractor] of Object.entries(attractors))');
if (start < 0 || end < 0) throw new Error('markers not found');
const body = src.slice(start + '  const attractors = '.length, end + '\n  }'.length);
const createTransform = (o = {}) => ({
  center: o.center || [0, 0, 0],
  size: o.size || [1, 1, 1],
  rotation: o.rotation || [0, 0, 0]
});
const attractors = new Function('createTransform', 'Math', `return (${body});`)(createTransform, Math);
const keys = Object.keys(attractors);
console.error(`${keys.length} attractors`);
console.error(keys.join(', '));
fs.writeFileSync('attractors.json', JSON.stringify(attractors, null, 2));
// sanity: which lack parameters / transform / tex
for (const k of keys) {
  const a = attractors[k];
  const miss = [];
  if (!a.parameters) miss.push('parameters');
  if (!a.transform) miss.push('transform');
  if (!a.dt) miss.push('dt');
  if (miss.length) console.error(`  ${k}: missing ${miss.join(',')}`);
}
