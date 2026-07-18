import ExcelJS from 'exceljs';

export type ParsedSheet = {
  headers: string[];
  rows: string[][];
};

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((p) => p.text).join('');
    if ('result' in value) return cellToString(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text);
    if ('error' in value) return '';
    return '';
  }
  return String(value).trim();
}

export async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const all: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    // row.values is 1-based; normalize to a dense 0-based array
    for (let col = 1; col <= sheet.columnCount; col += 1) {
      values.push(cellToString(row.getCell(col).value));
    }
    all.push(values);
  });

  const headerIdx = all.findIndex((r) => r.some((v) => v !== ''));
  if (headerIdx === -1) return { headers: [], rows: [] };
  return {
    headers: all[headerIdx],
    rows: all.slice(headerIdx + 1).filter((r) => r.some((v) => v !== '')),
  };
}

function detectDelimiter(firstLine: string): string {
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(text: string): ParsedSheet {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') === -1 ? undefined : clean.indexOf('\n'));
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      current.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      current.push(field.trim());
      field = '';
      if (current.some((v) => v !== '')) rows.push(current);
      current = [];
    } else {
      field += ch;
    }
  }
  current.push(field.trim());
  if (current.some((v) => v !== '')) rows.push(current);

  if (rows.length === 0) return { headers: [], rows: [] };
  return { headers: rows[0], rows: rows.slice(1) };
}

export async function parseUpload(fileName: string, buffer: Buffer): Promise<ParsedSheet> {
  if (/\.(xlsx|xlsm)$/i.test(fileName)) return parseXlsx(buffer);
  if (/\.csv$/i.test(fileName)) return parseCsv(buffer.toString('utf8'));
  throw new Error('unsupported_format');
}
