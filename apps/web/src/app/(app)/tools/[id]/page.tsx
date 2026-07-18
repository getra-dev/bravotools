import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

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

  const [{ data: components }, { data: movements }, { data: repairs }] = await Promise.all([
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
  ]);

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
        {canEdit ? (
          <Link
            href={`/tools/${tool.id}/edit`}
            className="flex h-11 items-center rounded-button border border-line/40 px-6 text-sm font-semibold hover:bg-white"
          >
            {t('detail.edit')}
          </Link>
        ) : null}
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
                  <span className="font-mono text-xs text-dim">{`×${c.quantity}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-dim">{t('detail.emptySection')}</p>
          )}
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
