import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthCard, Field, PrimaryButton } from '@/components/auth-card';
import { createOrganization } from '@/lib/actions';
import { getSessionContext } from '@/lib/org';

const ERROR_KEYS = new Set(['missing_fields', 'create_failed']);

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; new?: string }>;
}) {
  const t = await getTranslations('onboarding');
  const { error, new: forceNew } = await searchParams;

  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (ctx.memberships.length > 0 && !forceNew) redirect('/');

  const errorText = error
    ? t(`errors.${ERROR_KEYS.has(error) ? error : 'missing_fields'}` as Parameters<typeof t>[0])
    : undefined;

  return (
    <AuthCard title={t('title')} error={errorText}>
      <p className="mt-2 text-sm text-dim">{t('subtitle')}</p>
      <form action={createOrganization} className="mt-4 space-y-3">
        <Field label={t('orgName')} name="orgName" placeholder={t('orgNamePlaceholder')} />
        <PrimaryButton>{t('createAction')}</PrimaryButton>
      </form>
    </AuthCard>
  );
}
