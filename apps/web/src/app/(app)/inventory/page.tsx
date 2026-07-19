import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

const STAMP =
  'inline-block rounded-stamp border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px]';

export default async function InventoryListPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('inventory');

  const supabase = await getSupabaseServer();
  const { data: sessions } = await supabase
    .from('inventory_sessions')
    .select('id, status, started_at, closed_at, report, location:locations(name), starter:profiles(full_name)')
    .eq('org_id', ctx.activeOrg.orgId)
    .order('started_at', { ascending: false });

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>

      {!sessions || sessions.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line/50 bg-white p-8 text-center">
          <p className="text-sm text-dim">{t('empty')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left">
                {[t('colLocation'), t('colStatus'), t('colStarted'), t('colResult')].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/20">
              {sessions.map((session) => {
                const report = session.report as
                  | { found: number; misplaced: number; missing: number }
                  | null;
                return (
                  <tr key={session.id} className="hover:bg-paper/60">
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/inventory/${session.id}`} className="hover:underline">
                        {session.location?.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`${STAMP} ${session.status === 'open' ? 'border-hi/50 text-hi' : 'border-ok/50 text-ok'}`}
                      >
                        {session.status === 'open' ? t('openStamp') : t('closedStamp')}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-dim">
                      {session.started_at.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-2 text-dim">
                      {report
                        ? t('summary', {
                            found: report.found,
                            misplaced: report.misplaced,
                            missing: report.missing,
                          })
                        : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
