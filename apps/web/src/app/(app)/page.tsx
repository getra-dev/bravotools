import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

export default async function OverviewPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('home');

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;
  const [tools, members, orders] = await Promise.all([
    supabase.from('tools').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .not('status', 'in', '(delivered,cancelled)'),
  ]);

  const stats = [
    { label: t('toolsCount'), value: tools.count ?? 0 },
    { label: t('membersCount'), value: members.count ?? 0 },
    { label: t('openOrders'), value: orders.count ?? 0 },
  ];

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-[1.5px] text-dim">
        {ctx.activeOrg.orgName}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border border-line/30 bg-white p-4">
            <p className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">{s.label}</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-steel">{t('nextSteps')}</p>
    </main>
  );
}
