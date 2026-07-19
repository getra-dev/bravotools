import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { updateMaterialAction } from '@/lib/material-actions';
import { MaterialForm } from '@/components/material-form';

const ERROR_KEYS = new Set(['name_required', 'not_allowed', 'save_failed']);

export default async function EditMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) redirect('/materials');
  const { id } = await params;
  const { error } = await searchParams;

  const t = await getTranslations('materials.form');
  const supabase = await getSupabaseServer();
  const { data: material } = await supabase
    .from('materials')
    .select('id, canonical_name, base_unit, category, supply_mode')
    .eq('id', id)
    .maybeSingle();
  if (!material) notFound();

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('editTitle')}</h1>
      {error ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <MaterialForm
        action={updateMaterialAction}
        materialId={material.id}
        defaults={material}
        submitLabel={t('save')}
        cancelHref={`/materials/${material.id}`}
      />
    </main>
  );
}
