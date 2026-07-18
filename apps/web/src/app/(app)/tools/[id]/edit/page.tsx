import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { getToolFormOptions } from '@/lib/tool-options';
import { updateToolAction } from '@/lib/tool-actions';
import { ToolForm } from '@/components/tool-form';

const ERROR_KEYS = new Set(['name_required', 'not_allowed', 'save_failed']);

export default async function EditToolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) {
    redirect(`/tools/${id}`);
  }

  const t = await getTranslations('tools.form');
  const { error } = await searchParams;

  const supabase = await getSupabaseServer();
  const { data: tool } = await supabase
    .from('tools')
    .select(
      'id, name, qr_code, category_id, serial_number, inventory_code, purchase_price, purchase_date, purchased_from_vendor_id, internal_rate_daily, warranty_months, current_location_id, notes',
    )
    .eq('id', id)
    .eq('org_id', ctx.activeOrg.orgId)
    .maybeSingle();
  if (!tool) notFound();

  const options = await getToolFormOptions(ctx.activeOrg.orgId);

  return (
    <main>
      <p className="font-mono text-xs uppercase tracking-[1.5px] text-dim">{tool.qr_code}</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{t('editTitle')}</h1>
      {error ? (
        <p className="mt-4 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <ToolForm
        action={updateToolAction}
        defaults={tool}
        categories={options.categories}
        vendors={options.vendors}
        locations={options.locations}
        toolId={tool.id}
        submitLabel={t('save')}
        cancelHref={`/tools/${tool.id}`}
      />
    </main>
  );
}
