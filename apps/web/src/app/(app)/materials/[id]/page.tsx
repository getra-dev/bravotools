import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { setVendorPriceAction, addAliasAction, removeAliasAction } from '@/lib/material-actions';

const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const H2 = 'font-mono text-[10px] uppercase tracking-[1.5px] text-dim';
const INPUT = 'h-8 rounded-button-sm border border-line/40 bg-paper px-2 text-xs';
const ERROR_KEYS = new Set(['invalid_price', 'vendor_not_found', 'not_allowed', 'save_failed']);

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  const { notice, error } = await searchParams;
  const t = await getTranslations('materials');
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;
  const { data: material } = await supabase
    .from('materials')
    .select(
      'id, canonical_name, category, base_unit, supply_mode, unit_weight_kg, unit_volume_m3, max_length_m, unit_width_m, units_per_pallet, pallet_type',
    )
    .eq('id', id)
    .maybeSingle();
  if (!material) notFound();
  const phys = [
    material.unit_weight_kg != null ? `${material.unit_weight_kg} kg` : null,
    material.unit_volume_m3 != null ? `${material.unit_volume_m3} m³` : null,
    material.max_length_m != null ? `L ${material.max_length_m} m` : null,
    material.unit_width_m != null ? `W ${material.unit_width_m} m` : null,
    material.units_per_pallet != null ? `${material.units_per_pallet}/pal` : null,
    material.pallet_type ? material.pallet_type : null,
  ].filter(Boolean);

  const [{ data: prices }, { data: vendors }, { data: history }, { data: aliases }] = await Promise.all([
    supabase
      .from('vendor_catalog_items')
      .select('vendor_id, price, unit, lead_time_days, is_available, vendor:vendors!vendor_catalog_items_vendor_id_fkey(name)')
      .eq('material_id', id)
      .not('material_id', 'is', null)
      .order('price'),
    supabase
      .from('vendors')
      .select('id, name')
      .eq('org_id', orgId)
      .contains('type', ['materials'])
      .order('name'),
    supabase
      .from('material_price_points')
      .select('price, unit, observed_at, vendor:vendors!material_price_points_vendor_id_fkey(name)')
      .eq('material_id', id)
      .order('observed_at', { ascending: false })
      .limit(20),
    supabase
      .from('material_aliases')
      .select('id, alias, source')
      .eq('material_id', id)
      .order('alias'),
  ]);

  const best = (prices ?? []).reduce<number | null>(
    (min, p) => (p.price != null && (min === null || p.price < min) ? p.price : min),
    null,
  );

  return (
    <main>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{material.canonical_name}</h1>
        {isSupply ? (
          <Link
            href={`/materials/${material.id}/edit`}
            className="ml-auto h-9 rounded-button border border-line/40 px-3 text-sm font-bold leading-9"
          >
            {t('detail.edit')}
          </Link>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`${STAMP} ${material.supply_mode === 'stock' ? 'border-ok/50 text-ok' : 'border-blue/50 text-blue'}`}
        >
          {t(`modes.${material.supply_mode}` as Parameters<typeof t>[0])}
        </span>
        {material.category ? <span className={`${STAMP} border-line text-dim`}>{material.category}</span> : null}
        <span className="text-xs text-dim">
          {t('detail.unit')}: {material.base_unit}
        </span>
      </div>

      {phys.length > 0 ? (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[1px] text-dim">
          {phys.join(' · ')}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {t(
            `detail.notices.${notice === 'alias_added' ? 'aliasAdded' : notice === 'alias_removed' ? 'aliasRemoved' : 'priceSaved'}` as Parameters<typeof t>[0],
          )}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`detail.errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {/* who can supply this — vendor price comparison */}
      <section className="mt-8">
        <h2 className={H2}>{t('detail.vendorPrices')}</h2>
        {(prices ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-dim">{t('detail.noPrices')}</p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-card border border-line/30 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/30 text-left font-mono text-[10px] uppercase tracking-[1px] text-dim">
                  <th className="px-3 py-2">{t('detail.vendor')}</th>
                  <th className="px-3 py-2 text-right">{t('detail.price')}</th>
                  <th className="px-3 py-2 text-right">{t('detail.lead')}</th>
                  <th className="px-3 py-2">{t('detail.available')}</th>
                </tr>
              </thead>
              <tbody>
                {(prices ?? []).map((p) => (
                  <tr key={p.vendor_id} className="border-b border-line/15 last:border-0">
                    <td className="px-3 py-2 font-medium">{p.vendor?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={p.price === best ? 'font-bold text-ok' : ''}>
                        {p.price != null ? `${p.price.toFixed(2)} €` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-dim">
                      {p.lead_time_days != null ? t('days', { count: p.lead_time_days }) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {p.is_available ? (
                        <span className={`${STAMP} border-ok/50 text-ok`}>{t('detail.inStock')}</span>
                      ) : (
                        <span className={`${STAMP} border-hot/50 text-hot`}>{t('detail.outStock')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isSupply ? (
          <form
            action={setVendorPriceAction}
            className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/20 pt-3"
          >
            <input type="hidden" name="materialId" value={material.id} />
            <select name="vendorId" required className={INPUT} defaultValue="">
              <option value="" disabled>
                {t('detail.pickVendor')}
              </option>
              {(vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <input name="price" inputMode="decimal" required placeholder={t('detail.price')} className={`${INPUT} w-24`} />
            <input name="lead_time_days" inputMode="numeric" placeholder={t('detail.lead')} className={`${INPUT} w-20`} />
            <button className="h-8 rounded-button-sm bg-ink px-3 text-xs font-bold text-paper">
              {t('detail.setPrice')}
            </button>
          </form>
        ) : null}
      </section>

      {/* alternative names — how vendors / accounting call this */}
      <section className="mt-8 max-w-2xl">
        <h2 className={H2}>{t('detail.aliases')}</h2>
        <p className="mt-1 text-xs text-dim">{t('detail.aliasesHint')}</p>
        {(aliases ?? []).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {(aliases ?? []).map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-stamp border border-line px-2 py-1 text-xs"
              >
                {a.alias}
                <span className="font-mono text-[9px] uppercase tracking-[1px] text-dim">
                  {t(`detail.aliasSource.${a.source === 'manual' ? 'manual' : 'learned'}` as Parameters<typeof t>[0])}
                </span>
                {isSupply ? (
                  <form action={removeAliasAction} className="inline">
                    <input type="hidden" name="materialId" value={material.id} />
                    <input type="hidden" name="aliasId" value={a.id} />
                    <button className="text-hot" aria-label={t('detail.removeAlias')} title={t('detail.removeAlias')}>
                      {'✕'}
                    </button>
                  </form>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-dim">{t('detail.noAliases')}</p>
        )}
        {isSupply ? (
          <form action={addAliasAction} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="materialId" value={material.id} />
            <input name="alias" required placeholder={t('detail.aliasPlaceholder')} className={`${INPUT} w-64`} />
            <button className="h-8 rounded-button-sm bg-ink px-3 text-xs font-bold text-paper">
              {t('detail.addAlias')}
            </button>
          </form>
        ) : null}
      </section>

      {/* price over time */}
      {(history ?? []).length > 0 ? (
        <section className="mt-8 max-w-2xl">
          <h2 className={H2}>{t('detail.priceHistory')}</h2>
          <ul className="mt-2 divide-y divide-line/15">
            {(history ?? []).map((h, i) => (
              <li key={i} className="flex items-center gap-2 py-2 text-sm">
                <span className="text-dim">
                  {new Date(h.observed_at).toLocaleDateString('lt-LT')}
                </span>
                <span className="font-medium">{h.vendor?.name ?? '—'}</span>
                <span className="ml-auto font-mono">
                  {h.price != null ? `${h.price.toFixed(2)} €` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
