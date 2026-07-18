import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/org';
import { createLocationAction } from '@/lib/location-actions';
import { LocationForm } from '@/components/location-form';

const ERROR_KEYS = new Set(['name_required', 'not_allowed', 'save_failed']);

export default async function NewLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) redirect('/locations');

  const t = await getTranslations('locations.form');
  const { error } = await searchParams;

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('newTitle')}</h1>
      {error ? (
        <p className="mt-4 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <LocationForm
        action={createLocationAction}
        defaults={{}}
        submitLabel={t('create')}
        cancelHref="/locations"
        showActive={false}
      />
    </main>
  );
}
