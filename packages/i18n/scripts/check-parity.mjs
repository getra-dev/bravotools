// CI fence: lt.json must mirror every key of en.json (SPEC §6).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const en = JSON.parse(readFileSync(join(root, 'src/en.json'), 'utf8'));
const lt = JSON.parse(readFileSync(join(root, 'src/lt.json'), 'utf8'));

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const enKeys = new Set(flatten(en));
const ltKeys = new Set(flatten(lt));
const missing = [...enKeys].filter((k) => !ltKeys.has(k));
const extra = [...ltKeys].filter((k) => !enKeys.has(k));

if (missing.length || extra.length) {
  if (missing.length) console.error('lt.json missing keys:', missing.join(', '));
  if (extra.length) console.error('lt.json extra keys:', extra.join(', '));
  process.exit(1);
}
console.log(`i18n parity OK (${enKeys.size} keys)`);
