import { describe, expect, it } from 'vitest';
import { parseCsv, parseUpload } from './parse';

// Klientai atsiunčia bet ką: Excel'io eksportą su kabliataškiais, BOM'u
// ir kableliais viduje laukų. Parseris turi nesugriūti nė ties vienu.

describe('parseCsv', () => {
  it('detects a semicolon delimiter (Lithuanian Excel default)', () => {
    const sheet = parseCsv('Pavadinimas;Serijos Nr.\nPerforatorius;AB123');
    expect(sheet.headers).toEqual(['Pavadinimas', 'Serijos Nr.']);
    expect(sheet.rows).toEqual([['Perforatorius', 'AB123']]);
  });

  it('detects a comma delimiter', () => {
    const sheet = parseCsv('name,serial\nDrill,X1');
    expect(sheet.headers).toEqual(['name', 'serial']);
    expect(sheet.rows).toEqual([['Drill', 'X1']]);
  });

  it('strips a UTF-8 BOM so the first header is not corrupted', () => {
    const sheet = parseCsv('﻿Pavadinimas;Kaina\nGrąžtas;120');
    expect(sheet.headers[0]).toBe('Pavadinimas');
  });

  it('keeps a delimiter that sits inside quotes', () => {
    const sheet = parseCsv('name;notes\nDrill;"su priedais; dėžė"');
    expect(sheet.rows).toEqual([['Drill', 'su priedais; dėžė']]);
  });

  it('unescapes doubled quotes', () => {
    const sheet = parseCsv('name;notes\nDrill;"12"" korpusas"');
    expect(sheet.rows[0][1]).toBe('12" korpusas');
  });

  it('handles CRLF line endings and skips blank lines', () => {
    const sheet = parseCsv('name;serial\r\nDrill;X1\r\n\r\nSaw;X2\r\n');
    expect(sheet.rows).toEqual([
      ['Drill', 'X1'],
      ['Saw', 'X2'],
    ]);
  });

  it('returns empty structures for empty input instead of throwing', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});

describe('parseUpload', () => {
  it('rejects a format we cannot read, with a code the UI can translate', async () => {
    await expect(parseUpload('registras.pdf', Buffer.from(''))).rejects.toThrow(
      'unsupported_format',
    );
  });

  it('routes .csv to the CSV parser', async () => {
    const sheet = await parseUpload('registras.csv', Buffer.from('name;serial\nDrill;X1'));
    expect(sheet.headers).toEqual(['name', 'serial']);
  });
});
