import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthCard, Field, PrimaryButton } from '@/components/auth-card';
import { signUp } from '@/lib/actions';

const ERROR_KEYS = new Set(['missing_fields', 'weak_password', 'signup_failed']);

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations('auth');
  const { error } = await searchParams;
  const errorText = error
    ? t(`errors.${ERROR_KEYS.has(error) ? error : 'generic'}` as Parameters<typeof t>[0])
    : undefined;

  return (
    <AuthCard title={t('signUpTitle')} error={errorText}>
      <form action={signUp} className="mt-4 space-y-3">
        <Field label={t('fullName')} name="fullName" autoComplete="name" />
        <Field label={t('email')} name="email" type="email" autoComplete="email" />
        <Field
          label={t('password')}
          name="password"
          type="password"
          autoComplete="new-password"
        />
        <PrimaryButton>{t('signUpAction')}</PrimaryButton>
      </form>

      <p className="mt-4 text-center text-sm text-dim">
        {t('haveAccount')}{' '}
        <Link className="font-semibold text-ink underline" href="/login">
          {t('signInTitle')}
        </Link>
      </p>
    </AuthCard>
  );
}
