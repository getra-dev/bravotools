import { getSupabaseServer } from '@/lib/supabase/server';

export type TaskLine = { description: string; qty: number; unit: string; weightKg: number | null };
export type LoadedTask = {
  id: string;
  stopOrder: number | null;
  orderNumber: string;
  site: string;
  address: string;
  pickup: string;
  craneHeightM: number | null;
  craneMinutes: number | null;
  lines: TaskLine[];
};

// Load the day's tasks for a vehicle with their order lines + material weights.
export async function loadTasksForVehicleDay(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  orgId: string,
  vehicleId: string,
  date: string,
): Promise<LoadedTask[]> {
  const { data: tasks } = await supabase
    .from('delivery_tasks')
    .select(
      `id, stop_order, order_id, crane_lift_height_m, est_crane_minutes,
       order:orders(order_number),
       dropoff:locations!delivery_tasks_dropoff_location_id_fkey(name, address),
       pickup:locations!delivery_tasks_pickup_location_id_fkey(name)`,
    )
    .eq('org_id', orgId)
    .eq('vehicle_id', vehicleId)
    .eq('scheduled_date', date)
    .neq('status', 'cancelled')
    .order('stop_order', { nullsFirst: false });

  const result: LoadedTask[] = [];
  for (const task of tasks ?? []) {
    if (!task.order_id) continue;
    const { data: items } = await supabase
      .from('order_items')
      .select('description, quantity, unit, material:materials(unit_weight_kg)')
      .eq('order_id', task.order_id);
    result.push({
      id: task.id,
      stopOrder: task.stop_order,
      orderNumber: task.order?.order_number ?? '',
      site: task.dropoff?.name ?? '',
      address: task.dropoff?.address ?? '',
      pickup: task.pickup?.name ?? '—',
      craneHeightM: task.crane_lift_height_m,
      craneMinutes: task.est_crane_minutes,
      lines: (items ?? []).map((i) => ({
        description: i.description,
        qty: i.quantity,
        unit: i.unit ?? '',
        weightKg: i.material?.unit_weight_kg ?? null,
      })),
    });
  }
  return result;
}
