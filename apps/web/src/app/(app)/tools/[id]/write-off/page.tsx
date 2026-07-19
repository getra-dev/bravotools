import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { writeOffToolAction } from '@/lib/commissioning-actions';

const REASONS = ['broken', 'lost', 'stolen', 'worn_out'] as const;
const ERROR_KEYS = new Set(['not_allowed', 'already_written_off', 'save_failed']);
const LABEL = 'font-mono text-[11px] uppercase tracking-[1.5px] text-dim';
const INPUT =
  'mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm outline-none focus:border-ink';

export default async function WriteOffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  if (!['owner', 'admin'].includes(ctx.activeOrg.role)) redirect(`/tools/${id}`);

  const t = await getTranslations('writeoff');
  const { error } = await searchParams;

  const supabase = await getSupabaseServer();
  const { data: tool } = await supabase
    .from('tools')
    .select('id, name, qr_code, status, current_external_holder_id')
    .eq('id', id)
    .eq('org_id', ctx.activeOrg.orgId)
    .maybeSingle();
  if (!tool) notFound();
  if (tool.status === 'written_off') redirect(`/tools/${id}`);

  return (
    <main>
      <p className="font-mono text-xs uppercase tracking-[1.5px] text-dim">{tool.qr_code}</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-sm font-medium">{tool.name}</p>
      <p className="mt-3 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
        {t('warning')}
      </p>
      {tool.current_external_holder_id ? (
        <p className="mt-2 max-w-xl rounded-button-sm border border-hi/40 bg-hi/10 px-3 py-2 text-sm">
          {t('billableHint')}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      <form action={writeOffToolAction} className="mt-6 max-w-xl space-y-4">
        <input type="hidden" name="toolId" value={tool.id} />
        <label className="block">
          <span className={LABEL}>{t('reason')}</span>
          <select name="reason" className={INPUT}>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {t(`reasons.${reason}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>{t('note')}</span>
          <textarea
            name="note"
            rows={3}
            className="mt-1 block w-full rounded-button border border-line/40 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('photo')}</span>
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png"
            className="mt-2 block w-full text-sm file:mr-3 file:h-10 file:rounded-button file:border file:border-line/40 file:bg-paper file:px-4 file:text-sm file:font-semibold"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="h-11 rounded-button bg-hot px-6 text-sm font-semibold text-paper hover:opacity-90"
          >
            {t('confirm')}
          </button>
          <Link
            href={`/tools/${tool.id}`}
            className="flex h-11 items-center rounded-button border border-line/40 px-6 text-sm font-semibold hover:bg-white"
          >
            {t('cancel')}
          </Link>
        </div>
      </form>
    </main>
  );
}
