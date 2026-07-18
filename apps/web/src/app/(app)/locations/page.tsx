import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

const STAMP =
  'inline-block rounded-stamp border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px]';

export default async function LocationsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('locations');

  const supabase = await getSupabaseServer();
  const { data: locations } = await supabase
    .from('locations')
    .select(
      `id, name, type, address, is_active,
       assignments:site_assignments(is_manager, profile:profiles(full_name))`,
    )
    .eq('org_id', ctx.activeOrg.orgId)
    .neq('type', 'vendor')
    .order('type')
    .order('name');

  const canEdit = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        {canEdit ? (
          <Link
            href="/locations/new"
            className="flex h-11 items-center rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel"
          >
            {t('newCta')}
          </Link>
        ) : null}
      </div>

      {!locations || locations.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line/50 bg-white p-8 text-center">
          <p className="text-lg font-semibold">{t('empty')}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-dim">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left">
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colName')}
                </th>
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colType')}
                </th>
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colAddress')}
                </th>
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colResponsible')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/20">
              {locations.map((location) => {
                const managers = (location.assignments ?? [])
                  .filter((a) => a.is_manager)
                  .map((a) => a.profile?.full_name)
                  .filter(Boolean);
                return (
                  <tr key={location.id} className="hover:bg-paper/60">
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/locations/${location.id}`} className="hover:underline">
                        {location.name}
                      </Link>
                      {!location.is_active ? (
                        <span className={`${STAMP} ml-2 border-line text-dim`}>
                          {t('archivedStamp')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`${STAMP} border-line text-ink`}>
                        {t(`types.${location.type}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-dim">{location.address}</td>
                    <td className="px-4 py-2">{managers.join(', ')}</td>
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
