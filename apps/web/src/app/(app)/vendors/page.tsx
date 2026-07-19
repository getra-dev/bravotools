import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

const STAMP =
  'inline-block rounded-stamp border border-line px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px] text-dim';

export default async function VendorsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('vendors');
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name, type, email, phone, order_method, default_lead_time_days')
    .eq('org_id', ctx.activeOrg.orgId)
    .order('name');

  return (
    <main>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        {isSupply ? (
          <Link
            href="/vendors/new"
            className="ml-auto h-9 rounded-button bg-ink px-3 text-sm font-bold leading-9 text-paper"
          >
            {t('newCta')}
          </Link>
        ) : null}
      </div>

      {(vendors ?? []).length === 0 ? (
        <p className="mt-8 text-sm text-dim">{t('empty')}</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left font-mono text-[10px] uppercase tracking-[1px] text-dim">
                <th className="px-3 py-2">{t('colName')}</th>
                <th className="px-3 py-2">{t('colTypes')}</th>
                <th className="px-3 py-2">{t('colEmail')}</th>
                <th className="px-3 py-2">{t('colMethod')}</th>
                <th className="px-3 py-2 text-right">{t('colLeadTime')}</th>
              </tr>
            </thead>
            <tbody>
              {(vendors ?? []).map((v) => (
                <tr key={v.id} className="border-b border-line/15 last:border-0 hover:bg-paper/60">
                  <td className="px-3 py-2">
                    <Link href={`/vendors/${v.id}`} className="font-medium hover:underline">
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {(v.type ?? []).map((type) => (
                        <span key={type} className={STAMP}>
                          {t(`form.typeLabels.${type}` as Parameters<typeof t>[0])}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-dim">{v.email ?? '—'}</td>
                  <td className="px-3 py-2 text-dim">
                    {t(`form.methods.${v.order_method}` as Parameters<typeof t>[0])}
                  </td>
                  <td className="px-3 py-2 text-right text-dim">
                    {v.default_lead_time_days != null ? t('days', { count: v.default_lead_time_days }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
