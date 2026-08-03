import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import {
  planDeliveryAction,
  assignDeliveryAction,
  setStopOrderAction,
  setDeliveryCraneAction,
  setDeliveryMethodAction,
  sendTransportRequestAction,
} from '@/lib/logistics-actions';

const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const H2 = 'font-mono text-[10px] uppercase tracking-[1.5px] text-dim';
const INPUT = 'h-8 rounded-button-sm border border-line/40 bg-paper px-2 text-xs';
const ERROR_KEYS = new Set([
  'already_planned',
  'not_allowed',
  'save_failed',
  'carrier_required',
  'no_vendor_email',
  'send_failed',
]);
const STATUS_STYLE: Record<string, string> = {
  assigned: 'border-blue/50 text-blue',
  picked_up: 'border-hi/50 text-hi',
  delivered: 'border-ok/50 text-ok',
  cancelled: 'border-line text-dim',
};

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('deliveries');
  const { notice, error } = await searchParams;
  const orgId = ctx.activeOrg.orgId;
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const [{ data: tasks }, { data: openOrders }, { data: vehicles }, { data: members }, { data: carriers }] =
    await Promise.all([
      supabase
        .from('delivery_tasks')
        .select(
          `id, status, priority, scheduled_date, est_weight_kg, est_volume_m3, requires_crane,
           crane_lift_height_m, est_crane_minutes, crane_billable, vehicle_id, stop_order,
           delivery_method, transport_cost,
           order:orders(order_number, is_hot),
           dropoff:locations!delivery_tasks_dropoff_location_id_fkey(name),
           vehicle:vehicles(name, capacity_kg),
           carrier:vendors!delivery_tasks_carrier_vendor_id_fkey(name, email),
           driver:profiles!delivery_tasks_assigned_to_fkey(full_name)`,
        )
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .order('scheduled_date', { nullsFirst: false }),
      // orders that still need a delivery planned
      supabase
        .from('orders')
        .select('id, order_number, is_hot, status, site:locations(name)')
        .eq('org_id', orgId)
        .in('status', ['approved', 'ordered', 'partially_delivered']),
      supabase
        .from('vehicles')
        .select('id, name, capacity_kg')
        .eq('org_id', orgId)
        .eq('status', 'available')
        .order('name'),
      // tik vairuotojai: sąrašas be filtro siūlydavo ir objekto vadovą,
      // ir jis realiai atsidurdavo reise kaip vairuotojas (0036 uždarė
      // tai ir DB pusėje — sąsaja nėra apsauga)
      supabase
        .from('memberships')
        .select('user_id, profiles(full_name)')
        .eq('org_id', orgId)
        .eq('role', 'driver'),
      supabase
        .from('vendors')
        .select('id, name')
        .eq('org_id', orgId)
        .contains('type', ['transport'])
        .order('name'),
    ]);

  const plannedOrderIds = new Set((tasks ?? []).map((task) => task.order?.order_number));
  const toPlan = (openOrders ?? []).filter((o) => !plannedOrderIds.has(o.order_number));

  // greedy vehicle suggestion for each task still needing a vehicle
  type Suggestion = {
    weight_kg: number;
    pallets: number;
    max_length_m: number;
    needs_crane: boolean;
    vehicle_id: string | null;
    vehicle_name: string | null;
    load_pct: number | null;
  };
  const needsVehicle = (tasks ?? []).filter((t) => t.status === 'assigned' && !t.vehicle);
  const suggestionEntries = await Promise.all(
    needsVehicle.map(async (task) => {
      const { data } = await supabase.rpc('suggest_delivery_vehicle', { task_id: task.id });
      return [task.id, (data as unknown as Suggestion) ?? null] as const;
    }),
  );
  const suggestions = new Map(suggestionEntries);

  // group assigned tasks into routes = (vehicle, date) → pick list + trip sheet
  const routeGroups = new Map<
    string,
    { vehicleId: string; vehicleName: string; date: string; stops: NonNullable<typeof tasks> }
  >();
  for (const task of tasks ?? []) {
    if (!task.vehicle_id || !task.scheduled_date) continue;
    const key = `${task.vehicle_id}|${task.scheduled_date}`;
    const g = routeGroups.get(key) ?? {
      vehicleId: task.vehicle_id,
      vehicleName: task.vehicle?.name ?? '',
      date: task.scheduled_date,
      stops: [],
    };
    g.stops.push(task);
    routeGroups.set(key, g);
  }
  for (const g of routeGroups.values()) {
    g.stops.sort((a, b) => (a.stop_order ?? 999) - (b.stop_order ?? 999));
  }

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>

      {notice ? (
        <p className="mt-4 rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {t(
            `notices.${notice === 'assigned' ? 'assigned' : notice === 'transport_sent' ? 'transport_sent' : 'planned'}`,
          )}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {/* orders that need a delivery planned */}
      {isSupply && toPlan.length > 0 ? (
        <section className="mt-6">
          <h2 className={H2}>{t('toPlan')}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {toPlan.map((order) => (
              <form key={order.id} action={planDeliveryAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button className="flex items-center gap-2 rounded-button border border-line/40 bg-white px-3 py-1.5 text-sm hover:border-ink">
                  <span className="font-mono text-xs font-bold">{order.order_number}</span>
                  <span className="text-dim">{order.site?.name ?? ''}</span>
                  {order.is_hot ? <span className={`${STAMP} border-hot/50 text-hot`}>HOT</span> : null}
                  <span className="text-hi">+ {t('plan')}</span>
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {/* routes = vehicle + date → pick list + trip sheet + stop order */}
      {routeGroups.size > 0 ? (
        <section className="mt-8">
          <h2 className={H2}>{t('routes')}</h2>
          <div className="mt-2 space-y-3">
            {[...routeGroups.values()].map((g) => (
              <div key={`${g.vehicleId}|${g.date}`} className="rounded-card border border-line/30 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">
                    {t('routeFor', { vehicle: g.vehicleName, date: g.date })}
                  </span>
                  <a
                    href={`/api/deliveries/picklist?vehicle=${g.vehicleId}&date=${g.date}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto rounded-button-sm border border-line/40 px-2.5 py-1 text-xs font-bold hover:border-ink"
                  >
                    {t('picklistCta')}
                  </a>
                  <a
                    href={`/api/deliveries/tripsheet?vehicle=${g.vehicleId}&date=${g.date}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-button-sm border border-line/40 px-2.5 py-1 text-xs font-bold hover:border-ink"
                  >
                    {t('tripsheetCta')}
                  </a>
                </div>
                <ol className="mt-2 space-y-1">
                  {g.stops.map((stop, idx) => (
                    <li key={stop.id} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-dim">{idx + 1}.</span>
                      <span className="flex-1">
                        {stop.dropoff?.name ?? '—'}
                        <span className="text-dim"> · {stop.order?.order_number ?? ''}</span>
                      </span>
                      {isSupply ? (
                        <span className="flex gap-1">
                          <form action={setStopOrderAction}>
                            <input type="hidden" name="taskId" value={stop.id} />
                            <input type="hidden" name="stopOrder" value={idx} />
                            <button className="h-6 w-6 rounded-button-sm border border-line/40 text-xs" aria-label={t('reorderUp')}>
                              {t('reorderUp')}
                            </button>
                          </form>
                          <form action={setStopOrderAction}>
                            <input type="hidden" name="taskId" value={stop.id} />
                            <input type="hidden" name="stopOrder" value={idx + 2} />
                            <button className="h-6 w-6 rounded-button-sm border border-line/40 text-xs" aria-label={t('reorderDown')}>
                              {t('reorderDown')}
                            </button>
                          </form>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* planned deliveries */}
      <section className="mt-8">
        <h2 className={H2}>{t('planned')}</h2>
        {(tasks ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-dim">{t('empty')}</p>
        ) : (
          <div className="mt-2 space-y-3">
            {(tasks ?? []).map((task) => {
              const cap = task.vehicle?.capacity_kg ?? null;
              const load = task.est_weight_kg ?? 0;
              const pct = cap && cap > 0 ? Math.round((load / cap) * 100) : null;
              return (
                <div key={task.id} className="rounded-card border border-line/30 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold">
                      {task.order?.order_number ?? '—'}
                    </span>
                    <span className="text-sm text-dim">{task.dropoff?.name ?? ''}</span>
                    {task.priority === 'urgent' ? (
                      <span className={`${STAMP} border-hot/50 text-hot`}>{t('urgent')}</span>
                    ) : null}
                    {task.requires_crane ? (
                      <span className={`${STAMP} border-hi/50 text-hi`} title={task.crane_lift_height_m ? `${task.crane_lift_height_m} m` : undefined}>
                        {t('crane')}
                        {task.est_crane_minutes ? ` ${task.est_crane_minutes}′` : ''}
                        {task.crane_billable ? ' €' : ''}
                      </span>
                    ) : null}
                    <span className={`${STAMP} ml-auto ${STATUS_STYLE[task.status] ?? 'border-line text-dim'}`}>
                      {t(`status.${task.status}` as Parameters<typeof t>[0])}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-dim">
                    {task.est_weight_kg ? `${task.est_weight_kg} kg` : t('noEstimate')}
                    {task.est_volume_m3 ? ` · ${task.est_volume_m3} m³` : ''}
                    {task.vehicle?.name ? ` · ${task.vehicle.name}` : ''}
                    {pct != null ? ` · ${t('load', { pct })}` : ''}
                    {task.driver?.full_name ? ` · ${task.driver.full_name}` : ''}
                    {task.scheduled_date ? ` · ${task.scheduled_date}` : ''}
                  </p>
                  {pct != null ? (
                    <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-line/30">
                      <div
                        className={`h-full ${pct > 85 ? 'bg-hot' : 'bg-ok'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  ) : null}

                  {isSupply && task.status !== 'delivered' ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/20 pt-2 text-xs">
                      <form action={setDeliveryMethodAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="taskId" value={task.id} />
                        <select name="method" defaultValue={task.delivery_method ?? 'own_vehicle'} className={INPUT}>
                          {(['own_vehicle', 'vendor_delivers', 'hired'] as const).map((m) => (
                            <option key={m} value={m}>
                              {t(`methods.${m}`)}
                            </option>
                          ))}
                        </select>
                        {task.delivery_method === 'hired' ? (
                          <>
                            <select name="carrierId" className={INPUT} defaultValue="">
                              <option value="">{t('carrierPick')}</option>
                              {(carriers ?? []).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <input name="cost" inputMode="decimal" defaultValue={task.transport_cost ?? ''} placeholder={t('cost')} className={`${INPUT} w-20`} />
                          </>
                        ) : null}
                        <button className="h-7 rounded-button-sm border border-line/40 px-2 text-[11px] font-bold">
                          {t('methodSave')}
                        </button>
                      </form>
                      {task.delivery_method === 'hired' && task.carrier?.email ? (
                        <form action={sendTransportRequestAction}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <button className="h-7 rounded-button-sm bg-hi px-2 text-[11px] font-bold text-ink">
                            {t('sendTransport')}
                          </button>
                        </form>
                      ) : null}
                      {task.delivery_method === 'vendor_delivers' ? (
                        <span className="text-dim">{t('vendorDelivers')}</span>
                      ) : null}
                    </div>
                  ) : null}

                  {isSupply && task.status !== 'delivered' && (task.delivery_method ?? 'own_vehicle') === 'own_vehicle' ? (
                    <form action={setDeliveryCraneAction} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <input type="hidden" name="taskId" value={task.id} />
                      <label className="flex items-center gap-1">
                        <input type="checkbox" name="requiresCrane" defaultChecked={task.requires_crane ?? false} className="h-3.5 w-3.5" />
                        {t('craneNeeded')}
                      </label>
                      <input name="liftHeight" inputMode="decimal" defaultValue={task.crane_lift_height_m ?? ''} placeholder={t('craneHeight')} className={`${INPUT} w-24`} />
                      <input name="craneMinutes" inputMode="numeric" defaultValue={task.est_crane_minutes ?? ''} placeholder={t('craneMinutes')} className={`${INPUT} w-24`} />
                      <label className="flex items-center gap-1">
                        <input type="checkbox" name="craneBillable" defaultChecked={task.crane_billable ?? false} className="h-3.5 w-3.5" />
                        {t('craneBillable')}
                      </label>
                      <button className="h-7 rounded-button-sm border border-line/40 px-2 text-[11px] font-bold">
                        {t('craneSave')}
                      </button>
                    </form>
                  ) : null}

                  {isSupply && task.status === 'assigned' && (task.delivery_method ?? 'own_vehicle') === 'own_vehicle' ? (
                    (() => {
                      const sug = suggestions.get(task.id);
                      const noFit = sug != null && sug.vehicle_id == null;
                      const heavy = sug?.load_pct != null && sug.load_pct > 85;
                      return (
                    <form action={assignDeliveryAction} className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/20 pt-2">
                      <input type="hidden" name="taskId" value={task.id} />
                      {sug ? (
                        <span className="w-full font-mono text-[10px] uppercase tracking-[1px] text-dim">
                          {t('need', {
                            pallets: sug.pallets,
                            length: sug.max_length_m,
                          })}
                          {noFit ? (
                            <span className="ml-2 text-hot">{t('noFit')}</span>
                          ) : sug.vehicle_name ? (
                            <span className={heavy ? 'ml-2 text-hot' : 'ml-2 text-ok'}>
                              {t('suggests', {
                                vehicle: sug.vehicle_name,
                                pct: sug.load_pct ?? 0,
                              })}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      <select name="vehicleId" className={INPUT} defaultValue={sug?.vehicle_id ?? ''}>
                        <option value="">{t('pickVehicle')}</option>
                        {(vehicles ?? []).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {v.capacity_kg ? ` (${v.capacity_kg} kg)` : ''}
                            {sug?.vehicle_id === v.id ? ` · ${t('suggested')}` : ''}
                          </option>
                        ))}
                      </select>
                      <select name="driverId" className={INPUT} defaultValue="">
                        <option value="">
                          {(members ?? []).length === 0 ? t('noDrivers') : t('pickDriver')}
                        </option>
                        {(members ?? []).map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profiles?.full_name ?? m.user_id}
                          </option>
                        ))}
                      </select>
                      <input type="date" name="scheduledDate" defaultValue={task.scheduled_date ?? ''} className={INPUT} />
                      <button className="h-8 rounded-button-sm bg-ink px-3 text-xs font-bold text-paper">
                        {t('assign')}
                      </button>
                    </form>
                      );
                    })()
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
