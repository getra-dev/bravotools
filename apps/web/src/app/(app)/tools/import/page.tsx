import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/org';
import { uploadImportFile } from '@/lib/import-actions';

const ERROR_KEYS = new Set([
  'missing_file',
  'file_too_large',
  'unsupported_format',
  'empty_file',
  'too_many_rows',
  'not_allowed',
  'expired',
  'import_failed',
]);

export default async function ImportUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('import');
  const { error } = await searchParams;
  const errorText = error
    ? t(`errors.${ERROR_KEYS.has(error) ? error : 'import_failed'}` as Parameters<typeof t>[0])
    : null;

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-dim">{t('subtitle')}</p>

      {errorText ? (
        <p className="mt-4 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {errorText}
        </p>
      ) : null}

      <form
        action={uploadImportFile}
        className="mt-6 max-w-xl rounded-card border border-line/30 bg-white p-6"
      >
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
            {t('fileLabel')}
          </span>
          <input
            name="file"
            type="file"
            accept=".xlsx,.xlsm,.csv"
            required
            className="mt-2 block w-full text-sm file:mr-3 file:h-11 file:rounded-button file:border file:border-line/40 file:bg-paper file:px-4 file:text-sm file:font-semibold"
          />
        </label>
        <button
          type="submit"
          className="mt-4 h-11 rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel"
        >
          {t('uploadAction')}
        </button>
      </form>

      <p className="mt-4 text-sm">
        <Link href="/tools" className="text-dim underline">
          {t('backToTools')}
        </Link>
      </p>
    </main>
  );
}
