import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { updateOrderStatusAction } from '@/lib/request-actions';
import { sendOrderToVendorAction } from '@/lib/order-email-actions';
import { reorderShortfallAction } from '@/lib/request-actions';

const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const STATUS_STYLE: Record<string, string> = {
  requested: 'border-blue/50 text-blue',
  approved: 'border-hi/50 text-hi',
  ordered: 'border-hi/50 text-hi',
  partially_delivered: 'border-hi/50 text-hi',
  delivered: 'border-ok/50 text-ok',
  cancelled: 'border-line text-dim',
};
// board columns in flow order; closed ones last
const COLUMNS = [
  'requested',
  'approved',
  'ordered',
  'partially_delivered',
  'delivered',
  'cancelled',
] as const;
// allowed next steps per status (update_order_status blocks closed ones anyway)
const NEXT: Record<string, { status: string; key: 'approve' | 'markOrdered' | 'markPartial' | 'markDelivered' }[]> = {
  requested: [{ status: 'approved', key: 'approve' }],
  approved: [{ status: 'ordered', key: 'markOrdered' }],
  ordered: [
    { status: 'partially_delivered', key: 'markPartial' },
    { status: 'delivered', key: 'markDelivered' },
  ],
  partially_delivered: [{ status: 'delivered', key: 'markDelivered' }],
};
const ERROR_KEYS = new Set([
  'not_allowed',
  'save_failed',
  'order_closed',
  'no_vendor_email',
  'send_failed',
]);

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('orders');
  const tReq = await getTranslations('requests');
  const { notice, error } = await searchParams;

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const [{ data: orders }, { data: issues }, { data: sentMsgs }, { data: allVendors }] = await Promise.all([
    supabase
      .from('orders')
      .select(
        `id, order_number, status, is_hot, needed_by, created_at,
         site:locations(name), vendor:vendors!orders_vendor_id_fkey(name, email),
         items:order_items(id, description, quantity, delivered_quantity, unit, expected_date)`,
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('delivery_issues')
      .select('id, order_item_id, issue_type, qty_affected, description, status')
      .eq('org_id', orgId)
      .in('status', ['open', 'vendor_notified', 'redelivery']),
    supabase
      .from('outbound_messages')
      .select('entity_id, to_address, status_updated_at')
      .eq('org_id', orgId)
      .eq('entity_type', 'order')
      .eq('channel', 'email')
      .order('status_updated_at', { ascending: false }),
    supabase.from('vendors').select('id, name').eq('org_id', orgId).order('name'),
  ]);

  const issuesByItem = new Map<string, NonNullable<typeof issues>>();
  for (const issue of issues ?? []) {
    if (!issue.order_item_id) continue;
    const bucket = issuesByItem.get(issue.order_item_id) ?? [];
    bucket.push(issue);
    issuesByItem.set(issue.order_item_id, bucket);
  }

  // latest email per order (list is newest-first, so first write wins)
  const sentByOrder = new Map<string, { to_address: string | null; status_updated_at: string | null }>();
  for (const msg of sentMsgs ?? []) {
    if (msg.entity_id && !sentByOrder.has(msg.entity_id)) {
      sentByOrder.set(msg.entity_id, {
        to_address: msg.to_address,
        status_updated_at: msg.status_updated_at,
      });
    }
  }

  const byStatus = new Map<string, NonNullable<typeof orders>>();
  for (const order of orders ?? []) {
    const bucket = byStatus.get(order.status) ?? [];
    bucket.push(order);
    byStatus.set(order.status, bucket);
  }

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>

      {notice ? (
        <p className="mt-4 rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {notice === 'sent' ? t('notices.sent') : tReq('notices.order_created')}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {(orders ?? []).length === 0 ? <p className="mt-8 text-sm text-dim">{t('empty')}</p> : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {COLUMNS.filter((status) => (byStatus.get(status) ?? []).length > 0).map((status) => (
          <div key={status}>
            <h2 className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
              {t(`status.${status}`)} · {(byStatus.get(status) ?? []).length}
            </h2>
            <div className="mt-2 space-y-3">
              {(byStatus.get(status) ?? []).map((order) => (
                <section key={order.id} className="rounded-card border border-line/30 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/orders/${order.id}`} className="font-mono text-xs font-bold hover:underline">
                      {order.order_number}
                    </Link>
                    {order.is_hot ? (
                      <span className={`${STAMP} border-hot/50 text-hot`}>{t('hot')}</span>
                    ) : null}
                    <span
                      className={`${STAMP} ml-auto ${STATUS_STYLE[order.status] ?? 'border-line text-dim'}`}
                    >
                      {t(`status.${order.status}` as Parameters<typeof t>[0])}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-dim">
                    {order.site?.name ?? '—'}
                    {order.vendor?.name ? ` · ${t('vendor')}: ${order.vendor.name}` : ''}
                    {order.needed_by ? ` · ${t('neededBy')}: ${order.needed_by}` : ''}
                  </p>
                  {sentByOrder.has(order.id) ? (
                    <p className="mt-1 text-[11px] text-ok">
                      {t('sentAt', {
                        date: sentByOrder.get(order.id)!.status_updated_at
                          ? new Date(sentByOrder.get(order.id)!.status_updated_at!).toLocaleDateString('lt-LT')
                          : '',
                        to: sentByOrder.get(order.id)!.to_address ?? '',
                      })}
                    </p>
                  ) : null}
                  <ul className="mt-2 space-y-0.5">
                    {order.items.map((item) => {
                      const itemIssues = issuesByItem.get(item.id) ?? [];
                      const delivered = item.delivered_quantity ?? 0;
                      const remaining = item.quantity - delivered;
                      const today = new Date().toISOString().slice(0, 10);
                      const overdue = remaining > 0 && item.expected_date != null && item.expected_date < today;
                      return (
                        <li key={item.id} className="text-sm">
                          {item.description}
                          <span className="text-dim">
                            {' '}
                            ·{' '}
                            {delivered > 0
                              ? t('fulfillment', { delivered, total: item.quantity })
                              : item.quantity}{' '}
                            {item.unit}
                          </span>
                          {remaining > 0 && item.expected_date ? (
                            <span
                              className={`${STAMP} ml-1.5 ${overdue ? 'border-hot/50 text-hot' : 'border-line text-dim'}`}
                            >
                              {t('eta', { date: item.expected_date })}
                            </span>
                          ) : null}
                          {delivered > 0 && delivered >= item.quantity ? (
                            <span className={`${STAMP} ml-1.5 border-ok/50 text-ok`}>OK</span>
                          ) : null}
                          {itemIssues.map((issue) => (
                            <span
                              key={issue.id}
                              className={`${STAMP} ml-1.5 border-hot/50 text-hot`}
                              title={issue.description ?? undefined}
                            >
                              {t(`issueTypes.${issue.issue_type}` as Parameters<typeof t>[0])}
                              {issue.qty_affected ? ` ${issue.qty_affected}` : ''}
                            </span>
                          ))}
                          {isSupply &&
                          remaining > 0 &&
                          itemIssues.some((i) => ['open', 'vendor_notified'].includes(i.status)) ? (
                            <form action={reorderShortfallAction} className="mt-1 flex items-center gap-1">
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
                        </li>
                      );
                    })}
                  </ul>
                  {isSupply && !['delivered', 'cancelled'].includes(order.status) ? (
                    <div className="mt-2 flex flex-wrap gap-2 border-t border-line/20 pt-2">
                      {order.vendor?.email ? (
                        <form action={sendOrderToVendorAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <button className="h-7 rounded-button-sm bg-hi px-2.5 text-[11px] font-bold text-ink">
                            {sentByOrder.has(order.id) ? t('resend') : t('sendCta')}
                          </button>
                        </form>
                      ) : (
                        <span className={`${STAMP} border-line text-dim`}>{t('noEmail')}</span>
                      )}
                      {(NEXT[order.status] ?? []).map((step) => (
                        <form key={step.status} action={updateOrderStatusAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="status" value={step.status} />
                          <button className="h-7 rounded-button-sm bg-ink px-2.5 text-[11px] font-bold text-paper">
                            {t(`actions.${step.key}`)}
                          </button>
                        </form>
                      ))}
                      <form action={updateOrderStatusAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <button className="h-7 rounded-button-sm border border-hot/40 px-2.5 text-[11px] font-bold text-hot">
                          {t('actions.cancel')}
                        </button>
                      </form>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
