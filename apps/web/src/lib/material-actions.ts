'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

function errorCode(message: string): string {
  if (message.includes('name_required')) return 'name_required';
  if (message.includes('invalid_price')) return 'invalid_price';
  if (message.includes('vendor_not_found')) return 'vendor_not_found';
  if (message.includes('not_allowed')) return 'not_allowed';
  return 'save_failed';
}

export async function createMaterialAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');

  const supabase = await getSupabaseServer();
  const { data: materialId, error } = await supabase.rpc('create_material', {
    target_org: ctx.activeOrg.orgId,
    m_name: String(formData.get('canonical_name') ?? '').trim(),
    m_unit: String(formData.get('base_unit') ?? 'vnt').trim() || 'vnt',
    m_category: String(formData.get('category') ?? '').trim() || undefined,
    m_mode: String(formData.get('supply_mode') ?? 'order') === 'stock' ? 'stock' : 'order',
  });
  if (error || !materialId) redirect(`/materials/new?error=${errorCode(error?.message ?? '')}`);
  redirect(`/materials/${materialId}`);
}

export async function updateMaterialAction(formData: FormData) {
  const materialId = String(formData.get('materialId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('update_material', {
    material_id: materialId,
    payload: {
      canonical_name: String(formData.get('canonical_name') ?? '').trim(),
      base_unit: String(formData.get('base_unit') ?? '').trim(),
      category: String(formData.get('category') ?? '').trim(),
      supply_mode: String(formData.get('supply_mode') ?? 'order') === 'stock' ? 'stock' : 'order',
    },
  });
  if (error) redirect(`/materials/${materialId}/edit?error=${errorCode(error.message)}`);
  redirect(`/materials/${materialId}`);
}

export async function setVendorPriceAction(formData: FormData) {
  const materialId = String(formData.get('materialId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('set_vendor_price', {
    args: {
      material_id: materialId,
      vendor_id: String(formData.get('vendorId') ?? ''),
      price: String(formData.get('price') ?? '').trim(),
      lead_time_days: String(formData.get('lead_time_days') ?? '').trim(),
    },
  });
  if (error) redirect(`/materials/${materialId}?error=${errorCode(error.message)}`);
  redirect(`/materials/${materialId}?notice=price_set`);
}
