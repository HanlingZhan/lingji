// Static import-graph validator: ensures every named import resolves to a real export.
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, resolve, relative } from 'path';

const root = resolve(process.cwd(), 'js');
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = resolve(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(root);

function collectExports(src) {
  const names = new Set();
  let m;
  // export function/const/let/class NAME
  const re1 = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g;
  while ((m = re1.exec(src))) names.add(m[1]);
  // export { a, b as c }
  const re2 = /export\s*\{([^}]*)\}/g;
  while ((m = re2.exec(src))) {
    m[1].split(',').forEach(part => {
      const t = part.trim(); if (!t) return;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    });
  }
  // export * from
  const re3 = /export\s+\*\s+from\s*['"]([^'"]+)['"]/g;
  while ((re3.exec(src))) names.add('*');
  // export default
  if (/export\s+default/.test(src)) names.add('default');
  return names;
}

const exportMap = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  exportMap.set(f, collectExports(src));
}

let errors = 0;
const importRe = /import\s+(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\*\s+as\s+([A-Za-z0-9_$]+)\s*)?(?:\{([^}]*)\}\s*)?from\s*['"]([^'"]+)['"]/g;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  let m;
  while ((m = importRe.exec(src))) {
    const def = m[1];     // default import name (ignored for resolution)
    const ns = m[2];      // namespace import (just need file to exist)
    const named = m[3];   // named imports
    const spec = m[4];
    if (!spec.startsWith('.')) continue; // skip bare/absolute
    const target = resolve(dirname(f), spec);
    if (!exportMap.has(target)) {
      console.log(`MISSING FILE: ${relative(root, f)} imports '${spec}' -> ${target} (not found)`);
      errors++; continue;
    }
    if (named) {
      const exp = exportMap.get(target);
      named.split(',').forEach(part => {
        const t = part.trim(); if (!t || t.startsWith('*')) return;
        const name = t.split(/\s+as\s+/)[0].trim();
        if (!exp.has(name) && !exp.has('*')) {
          console.log(`MISSING EXPORT: ${relative(root, f)} imports { ${name} } from '${spec}' but it is not exported`);
          errors++;
        }
      });
    }
  }
}

console.log(errors === 0 ? `\nOK: ${files.length} files, import graph resolves cleanly.` : `\nFAILED: ${errors} import-graph error(s).`);
process.exit(errors === 0 ? 0 : 1);
