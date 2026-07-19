import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { adjustStockAction } from '@/lib/stock-actions';

const H2 = 'font-mono text-[10px] uppercase tracking-[1.5px] text-dim';
const INPUT = 'h-8 rounded-button-sm border border-line/40 bg-paper px-2 text-xs';
const MOVEMENTS = ['receipt', 'issue', 'adjustment', 'write_off'] as const;
const ERROR_KEYS = new Set([
  'insufficient_stock',
  'invalid_qty',
  'invalid_type',
  'not_allowed',
  'save_failed',
]);

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('stock');
  const { notice, error } = await searchParams;
  const orgId = ctx.activeOrg.orgId;
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const [{ data: stock }, { data: materials }, { data: locations }] = await Promise.all([
    supabase
      .from('stock_items')
      .select(
        'id, quantity, unit, min_quantity, material:materials(canonical_name), location:locations(id, name)',
      )
      .eq('org_id', orgId)
      .gt('quantity', 0),
    supabase.from('materials').select('id, canonical_name').eq('org_id', orgId).order('canonical_name'),
    supabase
      .from('locations')
      .select('id, name')
      .eq('org_id', orgId)
      .in('type', ['warehouse', 'site'])
      .order('name'),
  ]);

  // group by location
  const byLocation = new Map<string, { name: string; rows: NonNullable<typeof stock> }>();
  for (const row of stock ?? []) {
    const loc = row.location;
    if (!loc) continue;
    const bucket = byLocation.get(loc.id) ?? { name: loc.name, rows: [] };
    bucket.rows.push(row);
    byLocation.set(loc.id, bucket);
  }

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>

      {notice ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {t('saved')}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {byLocation.size === 0 ? (
        <p className="mt-8 text-sm text-dim">{t('empty')}</p>
      ) : (
        <div className="mt-6 space-y-6">
          {[...byLocation.entries()].map(([locId, bucket]) => (
            <section key={locId}>
              <h2 className={H2}>{bucket.name}</h2>
              <div className="mt-2 overflow-hidden rounded-card border border-line/30 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line/30 text-left font-mono text-[10px] uppercase tracking-[1px] text-dim">
                      <th className="px-3 py-2">{t('colMaterial')}</th>
                      <th className="px-3 py-2 text-right">{t('colQty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.rows.map((row) => (
                      <tr key={row.id} className="border-b border-line/15 last:border-0">
                        <td className="px-3 py-2 font-medium">{row.material?.canonical_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={
                              row.min_quantity != null && row.quantity <= row.min_quantity
                                ? 'font-bold text-hot'
                                : ''
                            }
                          >
                            {row.quantity} {row.unit ?? ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {isSupply ? (
        <section className="mt-8 max-w-3xl">
          <h2 className={H2}>{t('adjustTitle')}</h2>
          <form action={adjustStockAction} className="mt-2 flex flex-wrap items-center gap-2">
            <select name="materialId" required className={INPUT} defaultValue="">
              <option value="" disabled>
                {t('pickMaterial')}
              </option>
              {(materials ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.canonical_name}
                </option>
              ))}
            </select>
            <select name="locationId" required className={INPUT} defaultValue="">
              <option value="" disabled>
                {t('pickLocation')}
              </option>
              {(locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select name="movementType" required className={INPUT} defaultValue="receipt">
              {MOVEMENTS.map((mv) => (
                <option key={mv} value={mv}>
                  {t(`movements.${mv}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
            <input name="quantity" inputMode="decimal" required placeholder={t('colQty')} className={`${INPUT} w-24`} />
            <input name="notes" placeholder={t('note')} className={`${INPUT} w-40`} />
            <button className="h-8 rounded-button-sm bg-ink px-3 text-xs font-bold text-paper">
              {t('apply')}
            </button>
          </form>
          <p className="mt-2 text-xs text-dim">{t('adjustHint')}</p>
        </section>
      ) : null}
    </main>
  );
}
