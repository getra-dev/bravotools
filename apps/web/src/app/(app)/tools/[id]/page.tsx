import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import {
  addComponentAction,
  addInspectionAction,
  addToolPhotoAction,
  removeComponentAction,
} from '@/lib/commissioning-actions';

const INSPECTION_TYPES = ['electrical_safety', 'lifting_certificate', 'calibration', 'general'] as const;
const MINI_INPUT =
  'h-9 rounded-button-sm border border-line/40 bg-paper px-2 text-sm outline-none focus:border-ink';

const STAMP = 'inline-block rounded-stamp border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px]';
const STATUS_STYLE: Record<string, string> = {
  available: 'text-ok border-ok/50',
  checked_out: 'text-ink border-line',
  in_service: 'text-hi border-hi/50',
  lost: 'text-hot border-hot/50',
  written_off: 'text-dim border-line',
  returned_to_vendor: 'text-dim border-line',
};

function daysFromToday(date: string): number {
  return Math.ceil((Date.parse(date) - Date.now()) / 86_400_000);
}

export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  const t = await getTranslations('tools');
  const tActPdf = await getTranslations('actPdf');
  const tWriteoff = await getTranslations('writeoff');
  const tComm = await getTranslations('commissioning');

  const supabase = await getSupabaseServer();
  const { data: tool } = await supabase
    .from('tools')
    .select(
      `id, org_id, name, qr_code, status, ownership, serial_number, inventory_code,
       purchase_price, purchase_date, purchase_invoice_number, internal_rate_daily,
       warranty_months, warranty_until, rental_rate_daily, rental_start, rental_due_return,
       tracks_engine_hours, engine_hours, notes,
       category:tool_categories(name),
       location:locations!tools_current_location_id_fkey(name),
       holder:profiles!tools_current_holder_id_fkey(full_name),
       external_holder:external_persons!tools_current_external_holder_id_fkey(full_name, position),
       purchase_vendor:vendors!fk_tools_purchased_from(name),
       rental_vendor:vendors!fk_tools_rental_vendor(name)`,
    )
    .eq('id', id)
    .eq('org_id', ctx.activeOrg.orgId)
    .maybeSingle();

  if (!tool) notFound();

  const [{ data: components }, { data: movements }, { data: repairs }, { data: photoRows }, { data: inspections }] = await Promise.all([
    supabase
      .from('tool_components')
      .select('id, name, quantity, status, notes')
      .eq('tool_id', id)
      .order('created_at'),
    supabase
      .from('tool_movements')
      .select(
        `id, action, performed_at, engine_hours_reading,
         performed_by_profile:profiles!tool_movements_performed_by_fkey(full_name),
         to_holder:profiles!tool_movements_holder_id_fkey(full_name),
         to_external:external_persons!tool_movements_external_holder_id_fkey(full_name),
         to_location:locations!tool_movements_to_location_id_fkey(name)`,
      )
      .eq('tool_id', id)
      .order('performed_at', { ascending: false }),
    supabase
      .from('tool_repairs')
      .select('id, repair_type, status, description, sent_at, returned_at, cost')
      .eq('tool_id', id)
      .order('sent_at', { ascending: false }),
    supabase
      .from('tool_photos')
      .select('id, storage_path, taken_at, photo_type, component:tool_components(name)')
      .eq('tool_id', id)
      .order('taken_at', { ascending: false })
      .limit(9),
    supabase
      .from('inspection_schedules')
      .select('id, inspection_type, interval_months, next_due')
      .eq('tool_id', id)
      .order('next_due'),
  ]);

  const photoPaths = (photoRows ?? []).map((p) => p.storage_path);
  const { data: signedPhotos } = photoPaths.length
    ? await supabase.storage.from('tool-photos').createSignedUrls(photoPaths, 3600)
    : { data: [] };
  const photos = (photoRows ?? [])
    .map((row, i) => ({
      id: row.id,
      url: signedPhotos?.[i]?.signedUrl ?? null,
      takenAt: row.taken_at.slice(0, 16).replace('T', ' '),
      componentName: row.component?.name ?? null,
    }))
    .filter((p) => p.url !== null);

  const movementIds = (movements ?? []).map((m) => m.id);
  const { data: acts } = movementIds.length
    ? await supabase
        .from('handover_acts')
        .select('id, act_number, status, created_at')
        .in('movement_id', movementIds)
        .order('created_at', { ascending: false })
    : { data: [] as { id: string; act_number: string; status: string; created_at: string }[] };

  const holderName = tool.holder?.full_name ?? tool.external_holder?.full_name ?? null;
  const warrantyDays = tool.warranty_until ? daysFromToday(tool.warranty_until) : null;
  const warrantyExpiring = warrantyDays !== null && warrantyDays >= 0 && warrantyDays <= 60;
  const rentalDays = tool.rental_due_return ? daysFromToday(tool.rental_due_return) : null;
  const rentalOverdue = tool.ownership === 'rented' && rentalDays !== null && rentalDays < 0;
  const canEdit = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const facts: { label: string; value: string }[] = [
    { label: t('detail.category'), value: tool.category?.name ?? '—' },
    { label: t('detail.location'), value: tool.location?.name ?? '—' },
    { label: t('detail.holder'), value: holderName ?? '—' },
    { label: t('detail.serial'), value: tool.serial_number ?? '—' },
    { label: t('detail.inventoryCode'), value: tool.inventory_code ?? '—' },
  ];
  if (tool.tracks_engine_hours) {
    facts.push({ label: t('detail.engineHours'), value: String(tool.engine_hours ?? '—') });
  }

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[1.5px] text-dim">{tool.qr_code}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{tool.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`${STAMP} ${STATUS_STYLE[tool.status] ?? 'text-dim border-line'}`}>
              {t(`status.${tool.status}` as Parameters<typeof t>[0])}
            </span>
            {warrantyExpiring ? (
              <span className={`${STAMP} border-hi/50 text-hi`}>
                {t('detail.warrantyExpiring', { days: warrantyDays })}
              </span>
            ) : null}
            {rentalOverdue ? (
              <span className={`${STAMP} border-hot/50 text-hot`}>
                {t('detail.rentalOverdue', { days: Math.abs(rentalDays ?? 0) })}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {['owner', 'admin'].includes(ctx.activeOrg.role) && tool.status !== 'written_off' ? (
            <Link
              href={`/tools/${tool.id}/write-off`}
              className="flex h-11 items-center rounded-button border border-hot/50 px-6 text-sm font-semibold text-hot hover:bg-hot/10"
            >
              {tWriteoff('cta')}
            </Link>
          ) : null}
          {canEdit ? (
            <Link
              href={`/tools/${tool.id}/edit`}
              className="flex h-11 items-center rounded-button border border-line/40 px-6 text-sm font-semibold hover:bg-white"
            >
              {t('detail.edit')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-line/30 bg-white p-4 lg:col-span-1">
          <dl className="space-y-3">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {f.label}
                </dt>
                <dd className="text-sm font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {tool.ownership === 'rented' ? t('detail.rentalTitle') : t('detail.purchaseTitle')}
          </h2>
          <dl className="mt-3 space-y-3">
            {tool.ownership === 'rented' ? (
              <>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                    {t('detail.rentalVendor')}
                  </dt>
                  <dd className="text-sm font-medium">{tool.rental_vendor?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                    {t('detail.rentalRate')}
                  </dt>
                  <dd className="text-sm font-medium">{tool.rental_rate_daily ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                    {t('detail.rentalDue')}
                  </dt>
                  <dd className={`text-sm font-semibold ${rentalOverdue ? 'text-hot' : ''}`}>
                    {tool.rental_due_return ?? '—'}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                    {t('detail.price')}
                  </dt>
                  <dd className="text-sm font-medium">{tool.purchase_price ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                    {t('detail.date')}
                  </dt>
                  <dd className="text-sm font-medium">{tool.purchase_date ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                    {t('detail.vendor')}
                  </dt>
                  <dd className="text-sm font-medium">{tool.purchase_vendor?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                    {t('detail.warranty')}
                  </dt>
                  <dd className="text-sm font-medium">
                    {tool.warranty_until
                      ? t('detail.warrantyUntil', { date: tool.warranty_until })
                      : '—'}
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                {t('detail.internalRate')}
              </dt>
              <dd className="text-sm font-medium">{tool.internal_rate_daily ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {t('detail.componentsTitle')}
          </h2>
          {components && components.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {components.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-dim">{`×${c.quantity}`}</span>
                    {canEdit ? (
                      <form action={removeComponentAction}>
                        <input type="hidden" name="toolId" value={tool.id} />
                        <input type="hidden" name="componentId" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-button-sm border border-line/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1px] text-dim hover:bg-paper"
                        >
                          {tComm('componentRemove')}
                        </button>
                      </form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-dim">{t('detail.emptySection')}</p>
          )}
          {canEdit ? (
            <form action={addComponentAction} className="mt-3 flex items-end gap-2 border-t border-line/20 pt-3">
              <input type="hidden" name="toolId" value={tool.id} />
              <input
                name="name"
                required
                placeholder={tComm('componentName')}
                className={`${MINI_INPUT} min-w-0 flex-1`}
              />
              <input
                name="qty"
                type="number"
                min="1"
                defaultValue={1}
                className={`${MINI_INPUT} w-16`}
              />
              <button
                type="submit"
                className="h-9 rounded-button-sm bg-ink px-3 text-xs font-semibold text-paper hover:bg-panel"
              >
                {tComm('componentsAdd')}
              </button>
            </form>
          ) : null}

          <h2 className="mt-5 font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {tComm('inspectionsTitle')}
          </h2>
          {inspections && inspections.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {inspections.map((inspection) => (
                <li key={inspection.id} className="flex items-center justify-between text-sm">
                  <span>{tComm(`types.${inspection.inspection_type}` as Parameters<typeof tComm>[0])}</span>
                  <span className="font-mono text-xs text-dim">{inspection.next_due}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-dim">{t('detail.emptySection')}</p>
          )}
          {canEdit ? (
            <form action={addInspectionAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line/20 pt-3">
              <input type="hidden" name="toolId" value={tool.id} />
              <select name="itype" className={MINI_INPUT}>
                {INSPECTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tComm(`types.${type}`)}
                  </option>
                ))}
              </select>
              <input name="months" type="number" min="1" defaultValue={12} className={`${MINI_INPUT} w-16`} />
              <input name="due" type="date" required className={MINI_INPUT} />
              <button
                type="submit"
                className="h-9 rounded-button-sm bg-ink px-3 text-xs font-semibold text-paper hover:bg-panel"
              >
                {tComm('inspectionAdd')}
              </button>
            </form>
          ) : null}
          {tool.notes ? (
            <>
              <h2 className="mt-5 font-mono text-xs uppercase tracking-[1.5px] text-dim">
                {t('detail.notes')}
              </h2>
              <p className="mt-2 text-sm">{tool.notes}</p>
            </>
          ) : null}
        </section>
      </div>

      {photos.length > 0 || canEdit ? (
        <section className="mt-6 rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {t('detail.photosTitle')}
          </h2>
          {canEdit ? (
            <form action={addToolPhotoAction} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="toolId" value={tool.id} />
              <input
                name="photo"
                type="file"
                accept="image/jpeg,image/png"
                required
                className="text-sm file:mr-2 file:h-9 file:rounded-button-sm file:border file:border-line/40 file:bg-paper file:px-3 file:text-xs file:font-semibold"
              />
              <button
                type="submit"
                className="h-9 rounded-button-sm bg-ink px-3 text-xs font-semibold text-paper hover:bg-panel"
              >
                {tComm('photoAdd')}
              </button>
            </form>
          ) : null}
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((photo) => (
              <a key={photo.id} href={photo.url!} target="_blank" className="block">
                {/* plain img: signed URLs are short-lived, next/image adds nothing here */}
                <img
                  src={photo.url!}
                  alt={photo.componentName ?? photo.takenAt}
                  className="aspect-square w-full rounded-button border border-line/30 object-cover"
                />
                <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[1px] text-dim">
                  {photo.componentName ? `${photo.componentName} · ` : ''}
                  {photo.takenAt}
                </p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {t('detail.movementsTitle')}
          </h2>
          {movements && movements.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {movements.map((m) => {
                const receiver = m.to_holder?.full_name ?? m.to_external?.full_name ?? null;
                const target = receiver ?? m.to_location?.name ?? null;
                return (
                  <li key={m.id} className="border-l-2 border-line/40 pl-3 text-sm">
                    <p className="font-semibold">
                      {t(`detail.actions.${m.action}` as Parameters<typeof t>[0])}
                      {target ? ` — ${target}` : ''}
                    </p>
                    <p className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
                      {m.performed_at.slice(0, 16).replace('T', ' ')}
                      {m.performed_by_profile?.full_name
                        ? ` · ${t('detail.byPerson', { name: m.performed_by_profile.full_name })}`
                        : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-dim">{t('detail.emptySection')}</p>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-card border border-line/30 bg-white p-4">
            <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
              {t('detail.actsTitle')}
            </h2>
            {acts && acts.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {acts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono text-xs uppercase tracking-[1.5px]">
                      {a.act_number}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`${STAMP} border-line text-ink`}>
                        {t(`detail.actStatus.${a.status}` as Parameters<typeof t>[0])}
                      </span>
                      <a
                        href={`/api/acts/${a.id}/pdf`}
                        target="_blank"
                        className="font-mono text-xs uppercase tracking-[1.5px] text-blue underline"
                      >
                        {tActPdf('openPdf')}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-dim">{t('detail.emptySection')}</p>
            )}
          </section>

          <section className="rounded-card border border-line/30 bg-white p-4">
            <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
              {t('detail.repairsTitle')}
            </h2>
            {repairs && repairs.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {repairs.map((r) => (
                  <li key={r.id} className="text-sm">
                    <p className="font-semibold">
                      {t(`detail.repairType.${r.repair_type}` as Parameters<typeof t>[0])}
                      {' — '}
                      {t(`detail.repairStatus.${r.status}` as Parameters<typeof t>[0])}
                    </p>
                    <p className="text-dim">{r.description}</p>
                    <p className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
                      {r.sent_at}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-dim">{t('detail.emptySection')}</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
