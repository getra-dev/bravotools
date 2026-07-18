import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/org';
import { loadResult } from '@/lib/import/staging';

export default async function ImportResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;

  const result = await loadResult(id).catch(() => null);
  if (!result) redirect('/tools/import?error=expired');

  const t = await getTranslations('import');

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('resultTitle')}</h1>

      <div className="mt-6 max-w-xl rounded-card border border-ok/40 bg-ok/10 p-4">
        <p className="text-lg font-semibold">
          {t('resultImported', { count: result.imported })}
        </p>
      </div>

      {result.skipped.length > 0 ? (
        <section className="mt-6 max-w-2xl">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-hot">
            {t('resultSkippedTitle', { count: result.skipped.length })}
          </h2>
          <p className="mt-1 text-sm text-dim">{t('resultSkippedHint')}</p>
          <ul className="mt-3 divide-y divide-line/20 rounded-card border border-line/30 bg-white">
            {result.skipped.map((s) => {
              const preview = Object.values(s.data ?? {})
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={s.row} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                  <span className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
                    {t('skippedRow', { row: s.row })}
                  </span>
                  <span className="inline-block rounded-stamp border border-hot/50 px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px] text-hot">
                    {t(`reasons.${s.reason}` as Parameters<typeof t>[0])}
                  </span>
                  <span className="truncate text-dim">{preview}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="mt-6 text-sm">
        <Link href="/tools" className="font-semibold text-ink underline">
          {t('backToTools')}
        </Link>
      </p>
    </main>
  );
}
