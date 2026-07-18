import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/org';
import { getToolFormOptions } from '@/lib/tool-options';
import { createToolAction } from '@/lib/tool-actions';
import { ToolForm } from '@/components/tool-form';

const ERROR_KEYS = new Set(['name_required', 'not_allowed', 'save_failed']);

export default async function NewToolPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) redirect('/tools');

  const t = await getTranslations('tools.form');
  const { error } = await searchParams;
  const options = await getToolFormOptions(ctx.activeOrg.orgId);

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('newTitle')}</h1>
      {error ? (
        <p className="mt-4 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <ToolForm
        action={createToolAction}
        defaults={{}}
        categories={options.categories}
        vendors={options.vendors}
        locations={options.locations}
        submitLabel={t('create')}
        cancelHref="/tools"
      />
    </main>
  );
}
