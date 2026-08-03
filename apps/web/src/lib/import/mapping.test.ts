import { describe, expect, it } from 'vitest';
import { normalizeHeader, normalizeDate, suggestMapping } from './mapping';

// Excel importas yra onboardingo kritinė vieta (SPEC 2.2): jei stulpelių
// spėjimas suklysta, klientas pirmą dieną gauna šiukšlių registrą.

describe('normalizeHeader', () => {
  it('strips Lithuanian diacritics so "Serijos Nr." matches the dictionary', () => {
    expect(normalizeHeader('Serijos Nr.')).toBe('serijos nr');
    expect(normalizeHeader('Įsigijimo kaina, €')).toBe('isigijimo kaina');
    expect(normalizeHeader('  KATEGORIJA  ')).toBe('kategorija');
  });
});

describe('suggestMapping', () => {
  it('maps a Lithuanian header row', () => {
    const mapping = suggestMapping([
      'Pavadinimas',
      'Serijos Nr.',
      'Inventoriaus kodas',
      'Kategorija',
      'Pirkimo data',
      'Tiekėjas',
    ]);
    expect(mapping[0]).toBe('name');
    expect(mapping[1]).toBe('serial_number');
    expect(mapping[2]).toBe('inventory_code');
    expect(mapping[3]).toBe('category');
    expect(mapping[4]).toBe('purchase_date');
    expect(mapping[5]).toBe('vendor');
  });

  it('maps an English header row', () => {
    const mapping = suggestMapping(['Tool name', 'Serial number', 'Price', 'Notes']);
    expect(mapping[0]).toBe('name');
    expect(mapping[1]).toBe('serial_number');
    expect(mapping[2]).toBe('purchase_price');
    expect(mapping[3]).toBe('notes');
  });

  it('never assigns the same target to two columns', () => {
    const mapping = suggestMapping(['Pavadinimas', 'Prekės pavadinimas', 'Item']);
    const targets = Object.values(mapping).filter((t) => t !== 'ignore');
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('marks unknown and empty columns as ignore instead of guessing', () => {
    const mapping = suggestMapping(['Pavadinimas', 'Zzz random', '']);
    expect(mapping[0]).toBe('name');
    expect(mapping[1]).toBe('ignore');
    expect(mapping[2]).toBe('ignore');
  });
});

describe('normalizeDate', () => {
  it('accepts the formats a Lithuanian office actually types', () => {
    expect(normalizeDate('2024-03-07')).toBe('2024-03-07');
    expect(normalizeDate('2024.3.7')).toBe('2024-03-07');
    expect(normalizeDate('07.03.2024')).toBe('2024-03-07');
    expect(normalizeDate('7/3/2024')).toBe('2024-03-07');
  });

  it('returns an empty string rather than an invented date', () => {
    expect(normalizeDate('')).toBe('');
    expect(normalizeDate('nezinoma')).toBe('');
    expect(normalizeDate('03/2024')).toBe('');
  });
});
