import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/org';
import { loadStaging } from '@/lib/import/staging';
import { IMPORT_TARGETS } from '@/lib/import/mapping';
import { runImport } from '@/lib/import-actions';

export default async function ImportMappingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  const { error } = await searchParams;

  const staging = await loadStaging(id).catch(() => null);
  if (!staging || staging.orgId !== ctx.activeOrg.orgId) {
    redirect('/tools/import?error=expired');
  }

  const t = await getTranslations('import');
  const autoMapped = Object.values(staging.suggestion).filter((v) => v !== 'ignore').length;
  const samples = staging.headers.map((_, col) =>
    staging.rows
      .slice(0, 3)
      .map((r) => r[col] ?? '')
      .filter(Boolean)
      .join(' · '),
  );

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('mappingTitle')}</h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-[1.5px] text-dim">
        {t('fileInfo', { file: staging.fileName, rows: staging.rows.length })}
      </p>
      <p className="mt-2 text-sm text-steel">
        {t('autoMapped', { mapped: autoMapped, total: staging.headers.length })}
      </p>

      {error === 'name_required' ? (
        <p className="mt-4 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t('errors.name_required')}
        </p>
      ) : null}

      <form action={runImport} className="mt-6">
        <input type="hidden" name="importId" value={staging.id} />
        <div className="overflow-x-auto rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left">
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colSource')}
                </th>
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colTarget')}
                </th>
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colSamples')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/20">
              {staging.headers.map((header, col) => (
                <tr key={col}>
                  <td className="px-4 py-2 font-medium">{header}</td>
                  <td className="px-4 py-2">
                    <select
                      name={`map_${col}`}
                      defaultValue={staging.suggestion[col] ?? 'ignore'}
                      className="h-9 min-w-44 rounded-button-sm border border-line/40 bg-paper px-2 text-sm"
                    >
                      <option value="ignore">{t('ignore')}</option>
                      {IMPORT_TARGETS.map((target) => (
                        <option key={target} value={target}>
                          {t(`fields.${target}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="max-w-md truncate px-4 py-2 text-dim">{samples[col]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="submit"
          className="mt-4 h-11 rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel"
        >
          {t('importAction')}
        </button>
      </form>
    </main>
  );
}
