// Heuristic column mapper for the tool-registry import (SPEC 2.2).
// Works offline; an AI mapping pass (ANTHROPIC_API_KEY) can later refine
// suggestions for headers this dictionary misses — the UI contract
// (suggest → user corrects) stays identical.

export const IMPORT_TARGETS = [
  'name',
  'serial_number',
  'inventory_code',
  'category',
  'purchase_price',
  'purchase_date',
  'vendor',
  'notes',
] as const;

export type ImportTarget = (typeof IMPORT_TARGETS)[number];
export type MappingSuggestion = Record<number, ImportTarget | 'ignore'>;

const DICTIONARY: Record<ImportTarget, string[]> = {
  name: [
    'pavadinimas', 'irankio pavadinimas', 'irankis', 'preke', 'prekes pavadinimas',
    'name', 'tool', 'tool name', 'item', 'description', 'aprasymas',
  ],
  serial_number: [
    'serijos nr', 'serijos numeris', 'serijinis nr', 'serijinis numeris',
    'serial', 'serial number', 'serial no', 'sn', 's n',
  ],
  inventory_code: [
    'inventoriaus nr', 'inventoriaus kodas', 'inv nr', 'inv kodas', 'kodas',
    'inventory', 'inventory code', 'code', 'asset no',
  ],
  category: ['kategorija', 'tipas', 'grupe', 'rusis', 'category', 'type', 'group'],
  purchase_price: [
    'kaina', 'kaina eur', 'verte', 'isigijimo kaina', 'pirkimo kaina', 'suma',
    'price', 'cost', 'value', 'eur',
  ],
  purchase_date: [
    'pirkimo data', 'isigijimo data', 'pirkta', 'data',
    'purchase date', 'date', 'bought', 'purchased',
  ],
  vendor: [
    'tiekejas', 'pardavejas', 'parduotuve', 'is kur pirkta',
    'vendor', 'supplier', 'shop', 'store', 'seller',
  ],
  notes: ['pastabos', 'pastaba', 'komentaras', 'komentarai', 'notes', 'comment', 'remarks'],
};

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[ąà]/g, 'a').replace(/[čç]/g, 'c').replace(/[ęėè]/g, 'e')
    .replace(/[į]/g, 'i').replace(/[š]/g, 's').replace(/[ųū]/g, 'u')
    .replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreMatch(header: string, candidates: string[]): number {
  for (const c of candidates) {
    if (header === c) return 1;
  }
  for (const c of candidates) {
    if (header.length >= 3 && (header.includes(c) || c.includes(header))) return 0.7;
  }
  return 0;
}

/** Suggest a target field for every source column; one column per target. */
export function suggestMapping(headers: string[]): MappingSuggestion {
  const scored: { col: number; target: ImportTarget; score: number }[] = [];
  headers.forEach((raw, col) => {
    const header = normalizeHeader(raw);
    if (!header) return;
    for (const target of IMPORT_TARGETS) {
      const score = scoreMatch(header, DICTIONARY[target]);
      if (score > 0) scored.push({ col, target, score });
    }
  });

  scored.sort((a, b) => b.score - a.score);
  const mapping: MappingSuggestion = {};
  const usedTargets = new Set<ImportTarget>();
  const usedCols = new Set<number>();
  for (const { col, target, score } of scored) {
    if (usedTargets.has(target) || usedCols.has(col) || score < 0.7) continue;
    mapping[col] = target;
    usedTargets.add(target);
    usedCols.add(col);
  }
  headers.forEach((_, col) => {
    if (!(col in mapping)) mapping[col] = 'ignore';
  });
  return mapping;
}

/** Normalize a raw cell into an ISO date string, or '' when unparseable. */
export function normalizeDate(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const dotted = value.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (dotted) {
    return `${dotted[1]}-${dotted[2].padStart(2, '0')}-${dotted[3].padStart(2, '0')}`;
  }
  const dmy = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return '';
}
