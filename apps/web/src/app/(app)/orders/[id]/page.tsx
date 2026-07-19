import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { updateOrderStatusAction, reorderShortfallAction } from '@/lib/request-actions';
import { sendOrderToVendorAction } from '@/lib/order-email-actions';

const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const H2 = 'font-mono text-[10px] uppercase tracking-[1.5px] text-dim';
const STATUS_STYLE: Record<string, string> = {
  requested: 'border-blue/50 text-blue',
  approved: 'border-hi/50 text-hi',
  ordered: 'border-hi/50 text-hi',
  partially_delivered: 'border-hi/50 text-hi',
  delivered: 'border-ok/50 text-ok',
  cancelled: 'border-line text-dim',
};
const NEXT: Record<string, { status: string; key: 'approve' | 'markOrdered' | 'markPartial' | 'markDelivered' }[]> = {
  requested: [{ status: 'approved', key: 'approve' }],
  approved: [{ status: 'ordered', key: 'markOrdered' }],
  ordered: [
    { status: 'partially_delivered', key: 'markPartial' },
    { status: 'delivered', key: 'markDelivered' },
  ],
  partially_delivered: [{ status: 'delivered', key: 'markDelivered' }],
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  const t = await getTranslations('orders');
  const orgId = ctx.activeOrg.orgId;
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const { data: order } = await supabase
    .from('orders')
    .select(
      `id, order_number, status, is_hot, needed_by, created_at, notes,
       site:locations(name), vendor:vendors!orders_vendor_id_fkey(name, email),
       buyer:profiles!orders_requested_by_fkey(full_name),
       items:order_items(id, description, quantity, delivered_quantity, unit, unit_price, expected_date, material_id)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!order) notFound();

  const [{ data: issues }, { data: msgs }, { data: activity }, { data: allVendors }] =
    await Promise.all([
      supabase
        .from('delivery_issues')
        .select('id, order_item_id, issue_type, qty_affected, description, status')
        .in(
          'order_item_id',
          order.items.map((i) => i.id),
        ),
      supabase
        .from('outbound_messages')
        .select('to_address, subject, status_updated_at')
        .eq('entity_type', 'order')
        .eq('entity_id', id)
        .order('status_updated_at', { ascending: false }),
      supabase
        .from('activity_log')
        .select('action, created_at, actor:profiles!activity_log_actor_id_fkey(full_name)')
        .eq('entity_type', 'order')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('vendors').select('id, name').eq('org_id', orgId).order('name'),
    ]);

  const issuesByItem = new Map<string, NonNullable<typeof issues>>();
  for (const issue of issues ?? []) {
    if (!issue.order_item_id) continue;
    const b = issuesByItem.get(issue.order_item_id) ?? [];
    b.push(issue);
    issuesByItem.set(issue.order_item_id, b);
  }
  const today = new Date().toISOString().slice(0, 10);
  const total = order.items.reduce(
    (sum, i) => sum + (i.unit_price != null ? i.unit_price * i.quantity : 0),
    0,
  );
  const closed = ['delivered', 'cancelled'].includes(order.status);

  return (
    <main>
      <Link href="/orders" className="text-xs text-dim hover:underline">
        ← {t('title')}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-extrabold tracking-tight">{order.order_number}</h1>
        {order.is_hot ? <span className={`${STAMP} border-hot/50 text-hot`}>{t('hot')}</span> : null}
        <span className={`${STAMP} ${STATUS_STYLE[order.status] ?? 'border-line text-dim'}`}>
          {t(`status.${order.status}` as Parameters<typeof t>[0])}
        </span>
      </div>

      <dl className="mt-4 grid max-w-2xl grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className={H2}>{t('vendor')}</dt>
          <dd className="mt-1">{order.vendor?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className={H2}>{t('site')}</dt>
          <dd className="mt-1">{order.site?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className={H2}>{t('neededBy')}</dt>
          <dd className="mt-1">{order.needed_by ?? '—'}</dd>
        </div>
        <div>
          <dt className={H2}>{t('pdf.buyer')}</dt>
          <dd className="mt-1">{order.buyer?.full_name ?? '—'}</dd>
        </div>
      </dl>

      {(msgs ?? []).length > 0 ? (
        <p className="mt-3 text-xs text-ok">
          {t('sentAt', {
            date: msgs![0].status_updated_at
              ? new Date(msgs![0].status_updated_at).toLocaleDateString('lt-LT')
              : '',
            to: msgs![0].to_address ?? '',
          })}
        </p>
      ) : null}

      {/* lines */}
      <section className="mt-6">
        <h2 className={H2}>{t('pdf.description')}</h2>
        <div className="mt-2 overflow-hidden rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left font-mono text-[10px] uppercase tracking-[1px] text-dim">
                <th className="px-3 py-2">{t('pdf.description')}</th>
                <th className="px-3 py-2 text-right">{t('pdf.qty')}</th>
                <th className="px-3 py-2 text-right">{t('pdf.unitPrice')}</th>
                <th className="px-3 py-2">{t('neededBy')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const delivered = item.delivered_quantity ?? 0;
                const remaining = item.quantity - delivered;
                const overdue = remaining > 0 && item.expected_date != null && item.expected_date < today;
                const itemIssues = issuesByItem.get(item.id) ?? [];
                const openIssue = itemIssues.some((i) => ['open', 'vendor_notified'].includes(i.status));
                return (
                  <tr key={item.id} className="border-b border-line/15 align-top last:border-0">
                    <td className="px-3 py-2 font-medium">{item.description}</td>
                    <td className="px-3 py-2 text-right">
                      {delivered > 0 ? t('fulfillment', { delivered, total: item.quantity }) : item.quantity}{' '}
                      {item.unit}
                      {delivered >= item.quantity ? (
                        <span className={`${STAMP} ml-1.5 border-ok/50 text-ok`}>OK</span>
                      ) : null}
                      {itemIssues.map((iss) => (
                        <span key={iss.id} className={`${STAMP} ml-1.5 border-hot/50 text-hot`} title={iss.description ?? undefined}>
                          {t(`issueTypes.${iss.issue_type}` as Parameters<typeof t>[0])}
                          {iss.qty_affected ? ` ${iss.qty_affected}` : ''}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right text-dim">
                      {item.unit_price != null ? `${item.unit_price.toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {item.expected_date ? (
                        <span className={overdue ? 'font-bold text-hot' : 'text-dim'}>{item.expected_date}</span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isSupply && remaining > 0 && openIssue ? (
                        <form action={reorderShortfallAction} className="flex items-center gap-1">
                          <input type="hidden" name="itemId" value={item.id} />
                          <select name="vendorId" required className="h-7 rounded-button-sm border border-line/40 bg-paper px-1.5 text-[11px]" defaultValue="">
                            <option value="" disabled>
                              {t('reorderPick')}
                            </option>
                            {(allVendors ?? []).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                          <button className="h-7 rounded-button-sm border border-hi/50 px-2 text-[11px] font-bold text-hi">
                            {t('reorder', { qty: remaining })}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > 0 ? (
          <p className="mt-2 text-right text-sm font-bold">
            {t('pdf.total')}: {total.toFixed(2)} €
          </p>
        ) : null}
      </section>

      {/* actions */}
      {isSupply && !closed ? (
        <section className="mt-6 flex flex-wrap gap-2">
          {order.vendor?.email ? (
            <form action={sendOrderToVendorAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <button className="h-9 rounded-button bg-hi px-3 text-sm font-bold text-ink">
                {(msgs ?? []).length > 0 ? t('resend') : t('sendCta')}
              </button>
            </form>
          ) : null}
          {(NEXT[order.status] ?? []).map((step) => (
            <form key={step.status} action={updateOrderStatusAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="status" value={step.status} />
              <button className="h-9 rounded-button bg-ink px-3 text-sm font-bold text-paper">
                {t(`actions.${step.key}`)}
              </button>
            </form>
          ))}
          <form action={updateOrderStatusAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="status" value="cancelled" />
            <button className="h-9 rounded-button border border-hot/40 px-3 text-sm font-bold text-hot">
              {t('actions.cancel')}
            </button>
          </form>
        </section>
      ) : null}

      {/* history */}
      {(activity ?? []).length > 0 ? (
        <section className="mt-8 max-w-2xl">
          <h2 className={H2}>{t('history')}</h2>
          <ul className="mt-2 divide-y divide-line/15">
            {(activity ?? []).map((a, i) => (
              <li key={i} className="flex items-center gap-2 py-2 text-sm">
                <span className="text-dim">{new Date(a.created_at).toLocaleString('lt-LT')}</span>
                <span className="font-medium">{t(`log.${a.action}` as Parameters<typeof t>[0])}</span>
                <span className="ml-auto text-dim">{a.actor?.full_name ?? ''}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
