'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';
import { parseUpload } from './import/parse';
import {
  IMPORT_TARGETS,
  normalizeDate,
  suggestMapping,
  type ImportTarget,
} from './import/mapping';
import { loadStaging, saveResult, saveStaging, type ImportResult } from './import/staging';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

export async function uploadImportFile(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) {
    redirect('/tools/import?error=not_allowed');
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) redirect('/tools/import?error=missing_file');
  if (file.size > MAX_FILE_BYTES) redirect('/tools/import?error=file_too_large');

  let headers: string[];
  let rows: string[][];
  try {
    const parsed = await parseUpload(file.name, Buffer.from(await file.arrayBuffer()));
    headers = parsed.headers;
    rows = parsed.rows;
  } catch {
    redirect('/tools/import?error=unsupported_format');
  }

  if (headers.length === 0 || rows.length === 0) redirect('/tools/import?error=empty_file');
  if (rows.length > MAX_ROWS) redirect('/tools/import?error=too_many_rows');

  const id = randomUUID();
  await saveStaging({
    id,
    orgId: ctx.activeOrg.orgId,
    fileName: file.name,
    headers,
    rows,
    suggestion: suggestMapping(headers),
    createdAt: new Date().toISOString(),
  });
  redirect(`/tools/import/${id}`);
}

export async function runImport(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');

  const id = String(formData.get('importId') ?? '');
  const staging = await loadStaging(id);
  if (!staging || staging.orgId !== ctx.activeOrg.orgId) redirect('/tools/import?error=expired');

  const mapping = new Map<number, ImportTarget>();
  staging.headers.forEach((_, col) => {
    const value = String(formData.get(`map_${col}`) ?? 'ignore');
    if ((IMPORT_TARGETS as readonly string[]).includes(value)) {
      // last one wins is fine — the UI prevents duplicates visually
      mapping.set(col, value as ImportTarget);
    }
  });
  if (![...mapping.values()].includes('name')) {
    redirect(`/tools/import/${id}?error=name_required`);
  }

  const rows = staging.rows.map((row) => {
    const record: Record<string, string> = {};
    for (const [col, target] of mapping) {
      const raw = (row[col] ?? '').trim();
      record[target] = target === 'purchase_date' ? normalizeDate(raw) : raw;
    }
    return record;
  });

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('import_tools', {
    target_org: staging.orgId,
    rows,
  });
  if (error) {
    const code = error.message.includes('not_allowed') ? 'not_allowed' : 'import_failed';
    redirect(`/tools/import/${id}?error=${code}`);
  }

  const result = data as { imported: number; skipped: ImportResult['skipped'] };
  await saveResult(id, {
    imported: result.imported,
    totalRows: staging.rows.length,
    skipped: result.skipped ?? [],
  });
  redirect(`/tools/import/${id}/result`);
}
