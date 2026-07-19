import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import Link from 'next/link';

const STAMP =
  'inline-block rounded-stamp border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px]';

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  const t = await getTranslations('inventory');

  const supabase = await getSupabaseServer();
  const { data: session } = await supabase
    .from('inventory_sessions')
    .select('id, status, started_at, closed_at, report, location:locations(name), starter:profiles(full_name)')
    .eq('id', id)
    .eq('org_id', ctx.activeOrg.orgId)
    .maybeSingle();
  if (!session) notFound();

  const report = session.report as
    | { found: number; misplaced: number; missing: number; missing_tool_ids: string[]; marked_lost: boolean }
    | null;

  const [{ data: scans }, { data: missingTools }] = await Promise.all([
    supabase
      .from('inventory_scans')
      .select('id, result, scanned_at, tool:tools(id, name, qr_code), scanner:profiles(full_name)')
      .eq('session_id', id)
      .order('scanned_at'),
    report && report.missing_tool_ids?.length
      ? supabase.from('tools').select('id, name, qr_code').in('id', report.missing_tool_ids)
      : Promise.resolve({ data: [] as { id: string; name: string; qr_code: string | null }[] }),
  ]);

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {session.started_at.slice(0, 16).replace('T', ' ')} · {session.starter?.full_name}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            {t('detailTitle')} — {session.location?.name}
          </h1>
          {report ? (
            <p className="mt-2 text-sm font-medium">
              {t('summary', {
                found: report.found,
                misplaced: report.misplaced,
                missing: report.missing,
              })}
            </p>
          ) : null}
          {report?.marked_lost && report.missing > 0 ? (
            <p className="mt-1 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-1.5 text-sm">
              {t('markedLost')}
            </p>
          ) : null}
        </div>
        <span
          className={`${STAMP} ${session.status === 'open' ? 'border-hi/50 text-hi' : 'border-ok/50 text-ok'}`}
        >
          {session.status === 'open' ? t('openStamp') : t('closedStamp')}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">{t('scansTitle')}</h2>
          <ul className="mt-3 divide-y divide-line/20">
            {(scans ?? []).map((scan) => (
              <li key={scan.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <Link href={`/tools/${scan.tool?.id}`} className="min-w-0 truncate hover:underline">
                  <span className="font-mono text-xs uppercase tracking-[1px] text-dim">
                    {scan.tool?.qr_code}
                  </span>
                  <span className="ml-2 font-medium">{scan.tool?.name}</span>
                </Link>
                <span
                  className={`${STAMP} ${scan.result === 'found' ? 'border-ok/50 text-ok' : 'border-hi/50 text-hi'}`}
                >
                  {scan.result === 'found' ? t('foundStamp') : t('misplacedStamp')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-hot">
            {t('missingTitle')}
          </h2>
          <ul className="mt-3 divide-y divide-line/20">
            {(missingTools ?? []).map((tool) => (
              <li key={tool.id} className="py-1.5 text-sm">
                <Link href={`/tools/${tool.id}`} className="hover:underline">
                  <span className="font-mono text-xs uppercase tracking-[1px] text-dim">
                    {tool.qr_code}
                  </span>
                  <span className="ml-2 font-medium">{tool.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
