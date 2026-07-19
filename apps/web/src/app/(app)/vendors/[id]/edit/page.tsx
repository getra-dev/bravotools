import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { updateVendorAction } from '@/lib/vendor-actions';
import { VendorForm } from '@/components/vendor-form';

const ERROR_KEYS = new Set(['name_required', 'invalid_method', 'not_allowed', 'save_failed']);

export default async function EditVendorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) redirect('/vendors');
  const { id } = await params;
  const { error } = await searchParams;

  const t = await getTranslations('vendors.form');
  const supabase = await getSupabaseServer();
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, name, type, email, phone, order_method, default_lead_time_days, notes')
    .eq('id', id)
    .maybeSingle();
  if (!vendor) notFound();

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('editTitle')}</h1>
      {error ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <VendorForm
        action={updateVendorAction}
        vendorId={vendor.id}
        defaults={vendor}
        submitLabel={t('save')}
        cancelHref={`/vendors/${vendor.id}`}
      />
    </main>
  );
}
