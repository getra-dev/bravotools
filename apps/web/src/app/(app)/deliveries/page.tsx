import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { planDeliveryAction, assignDeliveryAction } from '@/lib/logistics-actions';

const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const H2 = 'font-mono text-[10px] uppercase tracking-[1.5px] text-dim';
const INPUT = 'h-8 rounded-button-sm border border-line/40 bg-paper px-2 text-xs';
const ERROR_KEYS = new Set(['already_planned', 'not_allowed', 'save_failed']);
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
  const [{ data: tasks }, { data: openOrders }, { data: vehicles }, { data: members }] =
    await Promise.all([
      supabase
        .from('delivery_tasks')
        .select(
          `id, status, priority, scheduled_date, est_weight_kg, est_volume_m3, requires_crane,
           order:orders(order_number, is_hot),
           dropoff:locations!delivery_tasks_dropoff_location_id_fkey(name),
           vehicle:vehicles(name, capacity_kg),
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
      supabase.from('memberships').select('user_id, profiles(full_name)').eq('org_id', orgId),
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

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>

      {notice ? (
        <p className="mt-4 rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {t(`notices.${notice === 'assigned' ? 'assigned' : 'planned'}`)}
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
                      <span className={`${STAMP} border-hi/50 text-hi`}>{t('crane')}</span>
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

                  {isSupply && task.status === 'assigned' ? (
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
                        <option value="">{t('pickDriver')}</option>
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
