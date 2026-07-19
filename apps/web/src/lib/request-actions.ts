'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

function errorCode(message: string, known: string[]): string {
  return known.find((code) => message.includes(code)) ?? 'save_failed';
}

export async function confirmMatchAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const itemId = String(formData.get('itemId') ?? '');
  const materialId = String(formData.get('materialId') ?? '');
  const qty = String(formData.get('qty') ?? '').trim();
  const unit = String(formData.get('unit') ?? '').trim();
  if (!materialId) redirect('/requests?error=save_failed');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('confirm_material_match', {
    item_id: itemId,
    target_material: materialId,
    p_qty: qty ? Number(qty.replace(',', '.')) : undefined,
    p_unit: unit || undefined,
  });
  if (error) redirect(`/requests?error=${errorCode(error.message, ['not_allowed'])}`);
  redirect('/requests?notice=confirmed');
}

export async function createMaterialAndConfirmAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const itemId = String(formData.get('itemId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const unit = String(formData.get('unit') ?? '').trim();
  const qty = String(formData.get('qty') ?? '').trim();
  if (!name) redirect('/requests?error=name_required');

  const supabase = await getSupabaseServer();
  const { data: materialId, error: createError } = await supabase.rpc('create_material', {
    target_org: ctx.activeOrg.orgId,
    m_name: name,
    m_unit: unit || 'vnt',
  });
  if (createError || !materialId) {
    redirect(
      `/requests?error=${errorCode(createError?.message ?? '', ['not_allowed', 'name_required'])}`,
    );
  }
  const { error } = await supabase.rpc('confirm_material_match', {
    item_id: itemId,
    target_material: materialId,
    p_qty: qty ? Number(qty.replace(',', '.')) : undefined,
    p_unit: unit || undefined,
  });
  if (error) redirect(`/requests?error=${errorCode(error.message, ['not_allowed'])}`);
  redirect('/requests?notice=confirmed');
}

export async function createOrderAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const requestId = String(formData.get('requestId') ?? '');
  const vendorId = String(formData.get('vendorId') ?? '');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('create_order_from_request', {
    req_id: requestId,
    p_vendor: vendorId || undefined,
  });
  if (error) {
    redirect(
      `/requests?error=${errorCode(error.message, [
        'not_allowed',
        'no_confirmed_items',
        'request_closed',
      ])}`,
    );
  }
  redirect('/orders?notice=order_created');
}

export async function updateOrderStatusAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const orderId = String(formData.get('orderId') ?? '');
  const status = String(formData.get('status') ?? '');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('update_order_status', {
    order_id: orderId,
    new_status: status,
  });
  if (error) {
    redirect(`/orders?error=${errorCode(error.message, ['not_allowed', 'order_closed'])}`);
  }
  redirect('/orders');
}

export async function createSplitOrdersAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const requestId = String(formData.get('requestId') ?? '');
  const itemIds = formData.getAll('items').map(String);
  const assignments = itemIds
    .map((itemId) => ({
      item_id: itemId,
      vendor_id: String(formData.get(`vendor__${itemId}`) ?? ''),
    }))
    .filter((a) => a.vendor_id);
  if (assignments.length === 0) redirect('/requests?error=no_confirmed_items');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('create_orders_split', {
    req_id: requestId,
    assignments,
  });
  if (error) {
    redirect(
      `/requests?error=${errorCode(error.message, [
        'not_allowed',
        'line_unassigned',
        'request_closed',
        'no_confirmed_items',
      ])}`,
    );
  }
  redirect('/orders?notice=order_created');
}

export async function reorderShortfallAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const itemId = String(formData.get('itemId') ?? '');
  const vendorId = String(formData.get('vendorId') ?? '');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('reorder_shortfall', {
    args: { order_item_id: itemId, vendor_id: vendorId },
  });
  if (error) {
    redirect(
      `/orders?error=${errorCode(error.message, [
        'not_allowed',
        'vendor_not_found',
        'nothing_to_reorder',
      ])}`,
    );
  }
  redirect('/orders?notice=order_created');
}
