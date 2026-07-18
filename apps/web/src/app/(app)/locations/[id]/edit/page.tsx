import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { updateLocationAction } from '@/lib/location-actions';
import { LocationForm } from '@/components/location-form';

const ERROR_KEYS = new Set(['name_required', 'not_allowed', 'save_failed']);

export default async function EditLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) {
    redirect(`/locations/${id}`);
  }

  const t = await getTranslations('locations.form');
  const { error } = await searchParams;

  const supabase = await getSupabaseServer();
  const { data: location } = await supabase
    .from('locations')
    .select('id, name, type, address, latitude, longitude, is_active')
    .eq('id', id)
    .eq('org_id', ctx.activeOrg.orgId)
    .maybeSingle();
  if (!location) notFound();

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('editTitle')}</h1>
      {error ? (
        <p className="mt-4 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <LocationForm
        action={updateLocationAction}
        defaults={location}
        locationId={location.id}
        submitLabel={t('save')}
        cancelHref={`/locations/${location.id}`}
        showActive
      />
    </main>
  );
}
