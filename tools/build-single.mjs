// Inlines the ES modules into one self-contained HTML file, so the screensaver
// can be opened straight off the filesystem (no server, no build tooling).
//
//   node tools/build-single.mjs             ->  dist/attractors.html
//
// `bundle(entry)` is also importable, for embedding the renderer in some other
// page: it returns the module registry plus a `__req(entry)` loader.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const EXPORT_RE = /^export\s+(?:(async\s+function|function|class|const|let|var)\s+)([A-Za-z_$][\w$]*)/gm;

function transform(file) {
  let code = fs.readFileSync(path.join(SRC, file), 'utf8');
  const deps = [];

  code = code.replace(
    /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+'\.\/([^']+)';?$/gm,
    (_, name, dep) => { deps.push(dep); return `const ${name} = __req('${dep}');`; });

  code = code.replace(
    /^import\s+\{([^}]+)\}\s+from\s+'\.\/([^']+)';?$/gm,
    (_, names, dep) => { deps.push(dep); return `const {${names.replace(/\s+as\s+/g, ': ')}} = __req('${dep}');`; });

  const exported = [];
  for (const m of code.matchAll(EXPORT_RE)) exported.push(m[2]);
  code = code.replace(/^export\s+/gm, '');

  const tail = exported.length
    ? `\nObject.assign(__exports, { ${exported.join(', ')} });\n`
    : '';

  return { code: code + tail, deps: [...new Set(deps)] };
}

export function bundle(entry = 'main.js') {
  const modules = new Map();
  (function collect(file) {
    if (modules.has(file)) return;
    const m = transform(file);
    modules.set(file, m);
    m.deps.forEach(collect);
  })(entry);

  const registry = [...modules.entries()].map(([name, m]) =>
    `__def(${JSON.stringify(name)}, function (__exports, __req) {\n${m.code}\n});`
  ).join('\n\n');

  return { runtime: RUNTIME, registry, count: modules.size };
}

const RUNTIME = `
const __mods = {};
const __cache = {};
function __def (name, fn) { __mods[name] = fn; }
function __req (name) {
  if (!__cache[name]) {
    const exports = __cache[name] = {};
    __mods[name](exports, __req);
  }
  return __cache[name];
}
`;

if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  // Imported for its bundle() export; nothing else to do.
} else {

const { runtime, registry, count } = bundle('main.js');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const bundled = html.replace(
  /<script type="module">[\s\S]*?<\/script>/,
  `<script type="module">
(function () {
${runtime}
${registry}

__req('main.js').boot().catch(err => {
  const el = document.getElementById('error');
  el.textContent = String(err && err.stack || err);
  el.classList.add('show');
  console.error(err);
});
})();
</script>`);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'attractors.html');
fs.writeFileSync(out, bundled);
console.log(`${out}  (${(bundled.length / 1024).toFixed(0)} kB, ${count} modules)`);

}
