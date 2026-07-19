import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import {
  confirmMatchAction,
  createMaterialAndConfirmAction,
  createOrderAction,
} from '@/lib/request-actions';

const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const STATUS_STYLE: Record<string, string> = {
  open: 'border-blue/50 text-blue',
  processing: 'border-hi/50 text-hi',
  ordered: 'border-ok/50 text-ok',
  delivered: 'border-ok/50 text-ok',
  cancelled: 'border-line text-dim',
};
const ITEM_STATUS_STYLE: Record<string, string> = {
  pending: 'border-line text-dim',
  matched: 'border-blue/50 text-blue',
  confirmed: 'border-ok/50 text-ok',
  ordered: 'border-ok/50 text-ok',
  duplicate: 'border-hot/50 text-hot',
};
const ERROR_KEYS = new Set([
  'not_allowed',
  'save_failed',
  'no_confirmed_items',
  'request_closed',
  'name_required',
]);
const INPUT = 'h-8 rounded-button-sm border border-line/40 bg-paper px-2 text-xs';

type Suggestion = {
  material_id: string;
  canonical_name: string;
  base_unit: string;
  score: number;
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string; notice?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('requests');
  const { closed, notice, error } = await searchParams;
  const showClosed = closed === '1';

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  let query = supabase
    .from('material_requests')
    .select(
      `id, status, is_hot, hot_reason, needed_by, created_at,
       site:locations(name),
       requester:profiles!material_requests_requested_by_fkey(full_name),
       items:material_request_items(id, raw_text, status, qty, unit, material_id,
         material:materials(canonical_name))`,
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (!showClosed) query = query.in('status', ['open', 'processing']);

  const [{ data: requests }, { data: materials }, { data: vendors }] = await Promise.all([
    query,
    supabase.from('materials').select('id, canonical_name, base_unit').eq('org_id', orgId).order('canonical_name'),
    supabase.from('vendors').select('id, name').eq('org_id', orgId).order('name'),
  ]);

  // fuzzy suggestions for every still-pending line (pg_trgm via RPC)
  const pendingItems = (requests ?? []).flatMap((req) =>
    req.items.filter((item) => item.status === 'pending' || item.status === 'matched'),
  );
  const suggestionEntries = await Promise.all(
    pendingItems.map(async (item) => {
      const { data } = await supabase.rpc('suggest_material_matches', {
        target_org: orgId,
        raw: item.raw_text,
      });
      return [item.id, (data ?? []) as Suggestion[]] as const;
    }),
  );
  const suggestions = new Map(suggestionEntries);

  // own stock for the materials on these requests (matched or top-suggested)
  // → dispatcher sees "we already have N somewhere" before ordering
  const materialIds = new Set<string>();
  for (const req of requests ?? []) {
    for (const item of req.items) {
      if (item.material_id) materialIds.add(item.material_id);
      const topSugg = suggestions.get(item.id)?.[0];
      if (topSugg) materialIds.add(topSugg.material_id);
    }
  }
  const { data: stockRows } = materialIds.size
    ? await supabase
        .from('stock_items')
        .select('material_id, quantity, unit, location:locations(name)')
        .eq('org_id', orgId)
        .gt('quantity', 0)
        .in('material_id', [...materialIds])
    : { data: [] };
  const stockByMaterial = new Map<string, { qty: number; unit: string | null; where: string }[]>();
  for (const row of stockRows ?? []) {
    if (!row.material_id) continue;
    const bucket = stockByMaterial.get(row.material_id) ?? [];
    bucket.push({ qty: row.quantity, unit: row.unit, where: row.location?.name ?? '' });
    stockByMaterial.set(row.material_id, bucket);
  }

  return (
    <main>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Link
          href={showClosed ? '/requests' : '/requests?closed=1'}
          className="ml-auto text-xs font-medium text-dim hover:underline"
        >
          {t('showClosed')}
        </Link>
      </div>

      {notice ? (
        <p className="mt-4 rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {t(`notices.${notice === 'confirmed' ? 'confirmed' : 'order_created'}`)}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {(requests ?? []).length === 0 ? (
        <p className="mt-8 text-sm text-dim">{t('empty')}</p>
      ) : null}

      <div className="mt-6 space-y-4">
        {(requests ?? []).map((req) => {
          const confirmedCount = req.items.filter((i) => i.status === 'confirmed').length;
          const actionable = isSupply && (req.status === 'open' || req.status === 'processing');
          return (
            <section key={req.id} className="rounded-card border border-line/30 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{req.site?.name ?? '—'}</span>
                {req.is_hot ? (
                  <span className={`${STAMP} border-hot/50 text-hot`} title={req.hot_reason ? t(`reasons.${req.hot_reason}` as Parameters<typeof t>[0]) : undefined}>
                    {t('hot')}
                  </span>
                ) : null}
                <span className={`${STAMP} ${STATUS_STYLE[req.status] ?? 'border-line text-dim'}`}>
                  {t(`status.${req.status}` as Parameters<typeof t>[0])}
                </span>
                <span className="ml-auto font-mono text-[11px] uppercase tracking-[1px] text-dim">
                  {t('requestedBy')}: {req.requester?.full_name ?? '—'} ·{' '}
                  {new Date(req.created_at).toLocaleDateString('lt-LT')}
                  {req.needed_by ? ` · ${t('neededBy')}: ${req.needed_by}` : ''}
                </span>
              </div>

              <ul className="mt-3 divide-y divide-line/20">
                {req.items.map((item) => {
                  const sugg = suggestions.get(item.id) ?? [];
                  const editable = actionable && (item.status === 'pending' || item.status === 'matched');
                  const stockMatId = item.material_id ?? sugg[0]?.material_id;
                  const stock = stockMatId ? stockByMaterial.get(stockMatId) : undefined;
                  return (
                    <li key={item.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">{item.raw_text}</span>
                        {item.material?.canonical_name ? (
                          <span className="text-xs text-dim">→ {item.material.canonical_name}</span>
                        ) : null}
                        {item.qty ? (
                          <span className="text-xs text-dim">
                            {item.qty} {item.unit ?? ''}
                          </span>
                        ) : null}
                        {stock && stock.length > 0 ? (
                          <span
                            className={`${STAMP} border-ok/50 text-ok`}
                            title={stock.map((s) => `${s.qty} ${s.unit ?? ''} — ${s.where}`).join('; ')}
                          >
                            {t('inStock', {
                              qty: stock.reduce((sum, s) => sum + s.qty, 0),
                              where: stock[0].where,
                            })}
                          </span>
                        ) : null}
                        <span
                          className={`${STAMP} ml-auto ${ITEM_STATUS_STYLE[item.status] ?? 'border-line text-dim'}`}
                        >
                          {t(`itemStatus.${item.status}` as Parameters<typeof t>[0])}
                        </span>
                      </div>

                      {editable ? (
                        <div className="mt-2 flex flex-wrap items-end gap-4">
                          <form action={confirmMatchAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="itemId" value={item.id} />
                            <label className="sr-only" htmlFor={`mat-${item.id}`}>
                              {t('material')}
                            </label>
                            <select id={`mat-${item.id}`} name="materialId" required className={INPUT} defaultValue={sugg[0]?.material_id ?? ''}>
                              <option value="" disabled>
                                {t('pickMaterial')}
                              </option>
                              {sugg.length > 0 ? (
                                <optgroup label={t('suggestions')}>
                                  {sugg.map((s) => (
                                    <option key={`s-${s.material_id}`} value={s.material_id}>
                                      {s.canonical_name} · {t('matchScore', { score: Math.round(s.score * 100) })}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                              <optgroup label={t('material')}>
                                {(materials ?? []).map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.canonical_name} ({m.base_unit})
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            <input
                              name="qty"
                              inputMode="decimal"
                              defaultValue={item.qty ?? ''}
                              placeholder={t('qty')}
                              className={`${INPUT} w-20`}
                            />
                            <input
                              name="unit"
                              defaultValue={item.unit ?? ''}
                              placeholder={t('unit')}
                              className={`${INPUT} w-16`}
                            />
                            <button className="h-8 rounded-button-sm bg-ink px-3 text-xs font-bold text-paper">
                              {t('confirm')}
                            </button>
                          </form>

                          <form
                            action={createMaterialAndConfirmAction}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="itemId" value={item.id} />
                            <span className="font-mono text-[10px] uppercase tracking-[1px] text-dim">
                              {t('createNewHint')}
                            </span>
                            <input
                              name="name"
                              required
                              defaultValue={item.raw_text}
                              placeholder={t('newName')}
                              className={`${INPUT} w-56`}
                            />
                            <input
                              name="qty"
                              inputMode="decimal"
                              defaultValue={item.qty ?? ''}
                              placeholder={t('qty')}
                              className={`${INPUT} w-20`}
                            />
                            <input
                              name="unit"
                              defaultValue={item.unit ?? ''}
                              placeholder={t('unit')}
                              className={`${INPUT} w-16`}
                            />
                            <button className="h-8 rounded-button-sm border border-line/40 px-3 text-xs font-bold">
                              {t('createAndConfirm')}
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {actionable && confirmedCount > 0 ? (
                <form action={createOrderAction} className="mt-3 flex items-center gap-2 border-t border-line/20 pt-3">
                  <input type="hidden" name="requestId" value={req.id} />
                  <label className="sr-only" htmlFor={`vendor-${req.id}`}>
                    {t('vendor')}
                  </label>
                  <select id={`vendor-${req.id}`} name="vendorId" className={INPUT} defaultValue="">
                    <option value="">{t('noVendor')}</option>
                    {(vendors ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <button className="h-8 rounded-button-sm bg-hi px-3 text-xs font-bold text-ink">
                    {t('orderCta')} ({confirmedCount})
                  </button>
                </form>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}
