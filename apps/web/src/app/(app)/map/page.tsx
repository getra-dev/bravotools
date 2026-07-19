import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { LocationsMap, type MapPoint } from '@/components/locations-map';

const STAMP =
  'inline-flex items-center gap-1 rounded-stamp border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px]';

export default async function MapPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('map');

  const supabase = await getSupabaseServer();
  const [{ data: locations }, { data: tools }] = await Promise.all([
    supabase
      .from('locations')
      .select('id, name, type, latitude, longitude')
      .eq('org_id', ctx.activeOrg.orgId)
      .eq('is_active', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null),
    supabase
      .from('tools')
      .select('current_location_id')
      .eq('org_id', ctx.activeOrg.orgId)
      .not('current_location_id', 'is', null),
  ]);

  const counts = new Map<string, number>();
  for (const tool of tools ?? []) {
    const id = tool.current_location_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const points: MapPoint[] = (locations ?? []).map((location) => ({
    id: location.id,
    name: location.name,
    type: location.type,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    toolCount: counts.get(location.id) ?? 0,
  }));

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${STAMP} border-hi/50 text-hi`}>{t('legendSite')}</span>
          <span className={`${STAMP} border-ok/50 text-ok`}>{t('legendWarehouse')}</span>
          <span className={`${STAMP} border-blue/50 text-blue`}>{t('legendVendor')}</span>
        </div>
      </div>
      <div className="mt-4">
        <LocationsMap
          points={points}
          labels={{ toolsHere: t('toolsHere', { count: '{count}' }), openList: t('openList') }}
        />
      </div>
    </main>
  );
}
