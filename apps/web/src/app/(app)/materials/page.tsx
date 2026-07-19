import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

export default async function MaterialsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('materials');
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;
  const [{ data: materials }, { data: catalog }] = await Promise.all([
    supabase
      .from('materials')
      .select('id, canonical_name, category, base_unit, supply_mode')
      .eq('org_id', orgId)
      .order('canonical_name'),
    supabase
      .from('vendor_catalog_items')
      .select('material_id, price')
      .eq('org_id', orgId)
      .not('material_id', 'is', null),
  ]);

  // best (lowest) price + vendor count per material
  const priceStats = new Map<string, { best: number; count: number }>();
  for (const row of catalog ?? []) {
    if (!row.material_id || row.price == null) continue;
    const cur = priceStats.get(row.material_id) ?? { best: row.price, count: 0 };
    cur.best = Math.min(cur.best, row.price);
    cur.count += 1;
    priceStats.set(row.material_id, cur);
  }

  return (
    <main>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        {isSupply ? (
          <Link
            href="/materials/new"
            className="ml-auto h-9 rounded-button bg-ink px-3 text-sm font-bold leading-9 text-paper"
          >
            {t('newCta')}
          </Link>
        ) : null}
      </div>

      {(materials ?? []).length === 0 ? (
        <p className="mt-8 text-sm text-dim">{t('empty')}</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left font-mono text-[10px] uppercase tracking-[1px] text-dim">
                <th className="px-3 py-2">{t('colName')}</th>
                <th className="px-3 py-2">{t('colMode')}</th>
                <th className="px-3 py-2">{t('colCategory')}</th>
                <th className="px-3 py-2">{t('colUnit')}</th>
                <th className="px-3 py-2 text-right">{t('colVendors')}</th>
                <th className="px-3 py-2 text-right">{t('colBestPrice')}</th>
              </tr>
            </thead>
            <tbody>
              {(materials ?? []).map((m) => {
                const stat = priceStats.get(m.id);
                return (
                  <tr key={m.id} className="border-b border-line/15 last:border-0 hover:bg-paper/60">
                    <td className="px-3 py-2">
                      <Link href={`/materials/${m.id}`} className="font-medium hover:underline">
                        {m.canonical_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px] ${
                          m.supply_mode === 'stock' ? 'border-ok/50 text-ok' : 'border-blue/50 text-blue'
                        }`}
                      >
                        {t(`modes.${m.supply_mode}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-dim">{m.category ?? '—'}</td>
                    <td className="px-3 py-2 text-dim">{m.base_unit}</td>
                    <td className="px-3 py-2 text-right text-dim">{stat?.count ?? 0}</td>
                    <td className="px-3 py-2 text-right">
                      {stat ? `${stat.best.toFixed(2)} €` : <span className="text-dim">—</span>}
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
