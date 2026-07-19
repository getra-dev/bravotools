'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

const VTYPES = ['van', 'truck', 'crane_truck', 'trailer', 'other'];

function vehicleErr(message: string): string {
  if (message.includes('name_required')) return 'name_required';
  if (message.includes('invalid_type')) return 'invalid_type';
  if (message.includes('not_allowed')) return 'not_allowed';
  return 'save_failed';
}

function vehiclePayload(formData: FormData): Record<string, string | boolean> {
  const type = String(formData.get('type') ?? 'van');
  return {
    name: String(formData.get('name') ?? '').trim(),
    plate_number: String(formData.get('plate_number') ?? '').trim(),
    type: VTYPES.includes(type) ? type : 'van',
    has_crane: formData.get('has_crane') === 'on',
    can_carry_pallets: formData.get('can_carry_pallets') === 'on',
    capacity_kg: String(formData.get('capacity_kg') ?? '').trim(),
    capacity_m3: String(formData.get('capacity_m3') ?? '').trim(),
    max_item_length_m: String(formData.get('max_item_length_m') ?? '').trim(),
  };
}

export async function createVehicleAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const supabase = await getSupabaseServer();
  const { data: id, error } = await supabase.rpc('create_vehicle', {
    target_org: ctx.activeOrg.orgId,
    payload: vehiclePayload(formData),
  });
  if (error || !id) redirect(`/vehicles/new?error=${vehicleErr(error?.message ?? '')}`);
  redirect('/vehicles');
}

export async function updateVehicleAction(formData: FormData) {
  const vehicleId = String(formData.get('vehicleId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('update_vehicle', {
    vehicle_id: vehicleId,
    payload: vehiclePayload(formData),
  });
  if (error) redirect(`/vehicles/${vehicleId}/edit?error=${vehicleErr(error.message)}`);
  redirect('/vehicles');
}

export async function planDeliveryAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('plan_delivery', {
    args: { order_id: String(formData.get('orderId') ?? '') },
  });
  if (error) {
    const code = error.message.includes('already_planned')
      ? 'already_planned'
      : error.message.includes('not_allowed')
        ? 'not_allowed'
        : 'save_failed';
    redirect(`/deliveries?error=${code}`);
  }
  redirect('/deliveries?notice=planned');
}

export async function assignDeliveryAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('assign_delivery', {
    args: {
      task_id: String(formData.get('taskId') ?? ''),
      vehicle_id: String(formData.get('vehicleId') ?? ''),
      driver_id: String(formData.get('driverId') ?? ''),
      scheduled_date: String(formData.get('scheduledDate') ?? '').trim(),
    },
  });
  if (error) {
    const code = error.message.includes('not_allowed') ? 'not_allowed' : 'save_failed';
    redirect(`/deliveries?error=${code}`);
  }
  redirect('/deliveries?notice=assigned');
}

export async function setStopOrderAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('set_stop_order', {
    task_id: String(formData.get('taskId') ?? ''),
    p_order: Number(formData.get('stopOrder') ?? '0'),
  });
  if (error) redirect('/deliveries?error=save_failed');
  redirect('/deliveries');
}

export async function setDeliveryCraneAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('set_delivery_crane', {
    args: {
      task_id: String(formData.get('taskId') ?? ''),
      requires_crane: formData.get('requiresCrane') === 'on',
      lift_height_m: String(formData.get('liftHeight') ?? '').trim(),
      est_minutes: String(formData.get('craneMinutes') ?? '').trim(),
      billable: formData.get('craneBillable') === 'on',
    },
  });
  if (error) redirect('/deliveries?error=save_failed');
  redirect('/deliveries?notice=assigned');
}

export async function setDeliveryMethodAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('set_delivery_method', {
    args: {
      task_id: String(formData.get('taskId') ?? ''),
      method: String(formData.get('method') ?? 'own_vehicle'),
      carrier_vendor_id: String(formData.get('carrierId') ?? ''),
      cost: String(formData.get('cost') ?? '').trim(),
    },
  });
  if (error) {
    const code = error.message.includes('carrier_required')
      ? 'carrier_required'
      : error.message.includes('not_allowed')
        ? 'not_allowed'
        : 'save_failed';
    redirect(`/deliveries?error=${code}`);
  }
  redirect('/deliveries?notice=assigned');
}

export async function sendTransportRequestAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const taskId = String(formData.get('taskId') ?? '');
  const supabase = await getSupabaseServer();

  const { data: task } = await supabase
    .from('delivery_tasks')
    .select(
      `scheduled_date,
       carrier:vendors!delivery_tasks_carrier_vendor_id_fkey(name, email),
       dropoff:locations!delivery_tasks_dropoff_location_id_fkey(name, address),
       order:orders(order_number)`,
    )
    .eq('id', taskId)
    .maybeSingle();
  const email = task?.carrier?.email?.trim();
  if (!task || !email) redirect('/deliveries?error=no_vendor_email');

  const { sendMail } = await import('./mailer');
  const subject = `Transporto užsakymas — ${task.dropoff?.name ?? ''} ${task.scheduled_date ?? ''}`.trim();
  const body = `Sveiki, ${task.carrier?.name ?? ''},\n\nPrašome atvežti/nuvežti krovinį:\nObjektas: ${task.dropoff?.name ?? ''}${task.dropoff?.address ? `, ${task.dropoff.address}` : ''}\nData: ${task.scheduled_date ?? '—'}\nSusijęs užsakymas: ${task.order?.order_number ?? '—'}\n\nPrašome patvirtinti.\nAčiū.`;

  let messageId = '';
  try {
    const sent = await sendMail({ to: email, subject, text: body });
    messageId = sent.messageId;
  } catch {
    redirect('/deliveries?error=send_failed');
  }
  const { error } = await supabase.rpc('record_transport_sent', {
    args: { task_id: taskId, to_address: email, subject, provider_message_id: messageId },
  });
  if (error) redirect('/deliveries?error=save_failed');
  redirect('/deliveries?notice=transport_sent');
}
