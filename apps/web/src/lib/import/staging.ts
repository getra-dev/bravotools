import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MappingSuggestion } from './mapping';

// Local-first staging between the upload → mapping → import steps (ADR-014).
// Lives in the OS temp dir; nothing here survives a reboot and that is fine.

export type ImportStaging = {
  id: string;
  orgId: string;
  fileName: string;
  headers: string[];
  rows: string[][];
  suggestion: MappingSuggestion;
  createdAt: string;
};

export type ImportResult = {
  imported: number;
  totalRows: number;
  skipped: { row: number; reason: string; data: Record<string, string> }[];
};

const DIR = join(tmpdir(), 'bravotools-import');

function stagingPath(id: string) {
  return join(DIR, `${id}.json`);
}
function resultPath(id: string) {
  return join(DIR, `${id}.result.json`);
}

function assertSafeId(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid_import_id');
}

export async function saveStaging(staging: ImportStaging): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(stagingPath(staging.id), JSON.stringify(staging));
}

export async function loadStaging(id: string): Promise<ImportStaging | null> {
  assertSafeId(id);
  try {
    return JSON.parse(await readFile(stagingPath(id), 'utf8')) as ImportStaging;
  } catch {
    return null;
  }
}

export async function saveResult(id: string, result: ImportResult): Promise<void> {
  assertSafeId(id);
  await mkdir(DIR, { recursive: true });
  await writeFile(resultPath(id), JSON.stringify(result));
  await rm(stagingPath(id), { force: true });
}

export async function loadResult(id: string): Promise<ImportResult | null> {
  assertSafeId(id);
  try {
    return JSON.parse(await readFile(resultPath(id), 'utf8')) as ImportResult;
  } catch {
    return null;
  }
}
