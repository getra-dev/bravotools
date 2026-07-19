import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

const STAMP =
  'inline-block rounded-stamp border border-line px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px] text-dim';

export default async function VehiclesPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('vehicles');
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, name, plate_number, type, has_crane, capacity_kg, capacity_m3, status')
    .eq('org_id', ctx.activeOrg.orgId)
    .order('name');

  return (
    <main>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        {isSupply ? (
          <Link
            href="/vehicles/new"
            className="ml-auto h-9 rounded-button bg-ink px-3 text-sm font-bold leading-9 text-paper"
          >
            {t('newCta')}
          </Link>
        ) : null}
      </div>

      {(vehicles ?? []).length === 0 ? (
        <p className="mt-8 text-sm text-dim">{t('empty')}</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left font-mono text-[10px] uppercase tracking-[1px] text-dim">
                <th className="px-3 py-2">{t('colName')}</th>
                <th className="px-3 py-2">{t('colType')}</th>
                <th className="px-3 py-2 text-right">{t('colCapacity')}</th>
                <th className="px-3 py-2">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {(vehicles ?? []).map((v) => (
                <tr key={v.id} className="border-b border-line/15 last:border-0 hover:bg-paper/60">
                  <td className="px-3 py-2">
                    {isSupply ? (
                      <Link href={`/vehicles/${v.id}/edit`} className="font-medium hover:underline">
                        {v.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{v.name}</span>
                    )}
                    {v.plate_number ? <span className="ml-2 text-dim">{v.plate_number}</span> : null}
                    {v.has_crane ? <span className={`${STAMP} ml-2`}>{t('crane')}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-dim">{t(`form.types.${v.type}` as Parameters<typeof t>[0])}</td>
                  <td className="px-3 py-2 text-right text-dim">
                    {v.capacity_kg ? `${v.capacity_kg} kg` : '—'}
                    {v.capacity_m3 ? ` · ${v.capacity_m3} m³` : ''}
                  </td>
                  <td className="px-3 py-2">
                    <span className={STAMP}>{t(`status.${v.status}` as Parameters<typeof t>[0])}</span>
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
