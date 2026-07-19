import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { setOrderLineEtaAction } from '@/lib/order-eta-actions';

const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const INPUT = 'h-8 rounded-button-sm border border-line/40 bg-paper px-2 text-xs';
// order statuses that still have outstanding deliveries
const OPEN_STATUSES = ['requested', 'approved', 'ordered', 'partially_delivered'];

export default async function AwaitingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('awaiting');
  const { notice, error } = await searchParams;
  const orgId = ctx.activeOrg.orgId;
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const { data: orders } = await supabase
    .from('orders')
    .select(
      `id, order_number, status, is_hot, needed_by,
       site:locations(name), vendor:vendors!orders_vendor_id_fkey(name),
       items:order_items(id, description, quantity, delivered_quantity, unit, expected_date)`,
    )
    .eq('org_id', orgId)
    .in('status', OPEN_STATUSES)
    .limit(300);

  // flatten to one row per still-outstanding line
  type Row = {
    itemId: string;
    orderId: string;
    orderNumber: string;
    isHot: boolean;
    vendor: string;
    site: string;
    description: string;
    remaining: number;
    unit: string;
    expected: string | null;
  };
  const rows: Row[] = [];
  for (const order of orders ?? []) {
    for (const item of order.items) {
      const remaining = item.quantity - (item.delivered_quantity ?? 0);
      if (remaining <= 0) continue;
      rows.push({
        itemId: item.id,
        orderId: order.id,
        orderNumber: order.order_number,
        isHot: order.is_hot,
        vendor: order.vendor?.name ?? '—',
        site: order.site?.name ?? '—',
        description: item.description,
        remaining,
        unit: item.unit ?? '',
        expected: item.expected_date,
      });
    }
  }
  // sort: dated first by date asc (overdue on top), undated last
  const today = new Date().toISOString().slice(0, 10);
  rows.sort((a, b) => {
    if (a.expected && b.expected) return a.expected < b.expected ? -1 : 1;
    if (a.expected) return -1;
    if (b.expected) return 1;
    return 0;
  });
  const overdueCount = rows.filter((r) => r.expected && r.expected < today).length;

  return (
    <main>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <span className="text-sm text-dim">{t('lineCount', { count: rows.length })}</span>
        {overdueCount > 0 ? (
          <span className={`${STAMP} border-hot/50 text-hot`}>
            {t('overdueCount', { count: overdueCount })}
          </span>
        ) : null}
      </div>

      {notice ? (
        <p className="mt-4 rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {t('etaSaved')}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${error === 'not_allowed' ? 'not_allowed' : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-dim">{t('empty')}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-line/30 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left font-mono text-[10px] uppercase tracking-[1px] text-dim">
                <th className="px-3 py-2">{t('colMaterial')}</th>
                <th className="px-3 py-2 text-right">{t('colRemaining')}</th>
                <th className="px-3 py-2">{t('colVendor')}</th>
                <th className="px-3 py-2">{t('colSite')}</th>
                <th className="px-3 py-2">{t('colOrder')}</th>
                <th className="px-3 py-2">{t('colExpected')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const overdue = row.expected != null && row.expected < today;
                return (
                  <tr key={row.itemId} className="border-b border-line/15 last:border-0">
                    <td className="px-3 py-2 font-medium">
                      {row.description}
                      {row.isHot ? (
                        <span className={`${STAMP} ml-1.5 border-hot/50 text-hot`}>{t('hot')}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.remaining} {row.unit}
                    </td>
                    <td className="px-3 py-2 text-dim">{row.vendor}</td>
                    <td className="px-3 py-2 text-dim">{row.site}</td>
                    <td className="px-3 py-2">
                      <Link href="/orders" className="font-mono text-xs hover:underline">
                        {row.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {isSupply ? (
                        <form action={setOrderLineEtaAction} className="flex items-center gap-1">
                          <input type="hidden" name="itemId" value={row.itemId} />
                          <input type="hidden" name="back" value="/awaiting" />
                          <input
                            type="date"
                            name="expectedDate"
                            defaultValue={row.expected ?? ''}
                            className={`${INPUT} ${overdue ? 'border-hot/60 text-hot' : ''}`}
                          />
                          <button className="h-8 rounded-button-sm bg-ink px-2 text-[11px] font-bold text-paper">
                            {t('save')}
                          </button>
                        </form>
                      ) : (
                        <span className={overdue ? 'font-bold text-hot' : 'text-dim'}>
                          {row.expected ?? t('noDate')}
                        </span>
                      )}
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
