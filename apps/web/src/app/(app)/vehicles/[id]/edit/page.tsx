import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { updateVehicleAction } from '@/lib/logistics-actions';
import { VehicleForm } from '@/components/vehicle-form';

const ERROR_KEYS = new Set(['name_required', 'invalid_type', 'not_allowed', 'save_failed']);

export default async function EditVehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) redirect('/vehicles');
  const { id } = await params;
  const { error } = await searchParams;

  const t = await getTranslations('vehicles.form');
  const supabase = await getSupabaseServer();
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, name, plate_number, type, has_crane, can_carry_pallets, capacity_kg, capacity_m3, max_item_length_m')
    .eq('id', id)
    .maybeSingle();
  if (!vehicle) notFound();

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('editTitle')}</h1>
      {error ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <VehicleForm
        action={updateVehicleAction}
        vehicleId={vehicle.id}
        defaults={vehicle}
        submitLabel={t('save')}
        cancelHref="/vehicles"
      />
    </main>
  );
}
