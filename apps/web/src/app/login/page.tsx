import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthCard, Field, PrimaryButton } from '@/components/auth-card';
import { signIn, sendMagicLink } from '@/lib/actions';

const ERROR_KEYS = new Set([
  'missing_fields',
  'invalid_credentials',
  'otp_failed',
  'weak_password',
  'signup_failed',
]);
const NOTICE_KEYS = new Set(['magic_link_sent']);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const t = await getTranslations('auth');
  const { error, notice } = await searchParams;
  const errorText = error
    ? t(`errors.${ERROR_KEYS.has(error) ? error : 'generic'}` as Parameters<typeof t>[0])
    : undefined;
  const noticeText =
    notice && NOTICE_KEYS.has(notice)
      ? t(`notices.${notice}` as Parameters<typeof t>[0])
      : undefined;

  return (
    <AuthCard title={t('signInTitle')} error={errorText} notice={noticeText}>
      <form action={signIn} className="mt-4 space-y-3">
        <Field label={t('email')} name="email" type="email" autoComplete="email" />
        <Field
          label={t('password')}
          name="password"
          type="password"
          autoComplete="current-password"
        />
        <PrimaryButton>{t('signInAction')}</PrimaryButton>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-dim">
        <span className="h-px flex-1 bg-line/30" />
        {t('orDivider')}
        <span className="h-px flex-1 bg-line/30" />
      </div>

      <form action={sendMagicLink} className="space-y-3">
        <Field label={t('email')} name="email" type="email" autoComplete="email" />
        <button
          type="submit"
          className="h-11 w-full rounded-button border border-line/40 bg-white text-sm font-semibold text-ink hover:bg-paper"
        >
          {t('magicLinkAction')}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-dim">
        {t('noAccount')}{' '}
        <Link className="font-semibold text-ink underline" href="/signup">
          {t('signUpTitle')}
        </Link>
      </p>
    </AuthCard>
  );
}
