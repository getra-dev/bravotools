import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/org';
import { createVendorAction } from '@/lib/vendor-actions';
import { VendorForm } from '@/components/vendor-form';

const ERROR_KEYS = new Set(['name_required', 'invalid_method', 'not_allowed', 'save_failed']);

export default async function NewVendorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) redirect('/vendors');

  const t = await getTranslations('vendors.form');
  const { error } = await searchParams;

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('newTitle')}</h1>
      {error ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <VendorForm
        action={createVendorAction}
        defaults={{}}
        submitLabel={t('create')}
        cancelHref="/vendors"
      />
    </main>
  );
}
