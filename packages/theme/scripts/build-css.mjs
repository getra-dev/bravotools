// Generates src/tokens.css (Tailwind 4 @theme block) from src/tokens.json.
// tokens.json is the single source of truth — never edit tokens.css by hand.
// Usage: node scripts/build-css.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tokens = JSON.parse(readFileSync(join(root, 'src/tokens.json'), 'utf8'));

const lines = ['/* GENERATED from tokens.json — do not edit. Run: pnpm --filter @bravotools/theme build:css */', '@theme {'];

for (const [name, value] of Object.entries(tokens.color)) {
  lines.push(`  --color-${name}: ${value};`);
}
for (const [name, value] of Object.entries(tokens.radius)) {
  const kebab = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  lines.push(`  --radius-${kebab}: ${value}px;`);
}
// NOTE: tokens.spacing is deliberately NOT emitted as --spacing-* CSS vars:
// Tailwind 4 resolves w-*/max-w-*/p-* from the --spacing namespace, so named
// entries like --spacing-sm hijack utilities like max-w-sm. Web uses the
// default 4px scale (xs=1, sm=2, md=3, lg=4, xl=6, xxl=8); RN reads
// tokens.spacing directly.
lines.push(`  --font-mono: ${tokens.typography.mono.fontFamily};`);
lines.push('}');
lines.push('');

const css = lines.join('\n');
const target = join(root, 'src/tokens.css');

if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current !== css) {
    console.error('tokens.css is out of date with tokens.json. Run build:css.');
    process.exit(1);
  }
  console.log('tokens.css in sync');
} else {
  writeFileSync(target, css);
  console.log('tokens.css written');
}
