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

  // create_material only takes name/unit/category/mode — apply the physical
  // params (weight/size/pallet) with a follow-up update if any were entered
  const physical = {
    unit_weight_kg: String(formData.get('unit_weight_kg') ?? '').trim(),
    unit_volume_m3: String(formData.get('unit_volume_m3') ?? '').trim(),
    max_length_m: String(formData.get('max_length_m') ?? '').trim(),
    unit_width_m: String(formData.get('unit_width_m') ?? '').trim(),
    units_per_pallet: String(formData.get('units_per_pallet') ?? '').trim(),
    pallet_type: String(formData.get('pallet_type') ?? '').trim(),
  };
  if (Object.values(physical).some(Boolean)) {
    await supabase.rpc('update_material', {
      material_id: materialId,
      payload: {
        canonical_name: String(formData.get('canonical_name') ?? '').trim(),
        base_unit: String(formData.get('base_unit') ?? '').trim(),
        category: String(formData.get('category') ?? '').trim(),
        supply_mode: String(formData.get('supply_mode') ?? 'order') === 'stock' ? 'stock' : 'order',
        ...physical,
      },
    });
  }
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
      unit_weight_kg: String(formData.get('unit_weight_kg') ?? '').trim(),
      unit_volume_m3: String(formData.get('unit_volume_m3') ?? '').trim(),
      max_length_m: String(formData.get('max_length_m') ?? '').trim(),
      unit_width_m: String(formData.get('unit_width_m') ?? '').trim(),
      units_per_pallet: String(formData.get('units_per_pallet') ?? '').trim(),
      pallet_type: String(formData.get('pallet_type') ?? '').trim(),
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

export async function addAliasAction(formData: FormData) {
  const materialId = String(formData.get('materialId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('add_material_alias', {
    material_id: materialId,
    p_alias: String(formData.get('alias') ?? '').trim(),
  });
  if (error) redirect(`/materials/${materialId}?error=${errorCode(error.message)}`);
  redirect(`/materials/${materialId}?notice=alias_added`);
}

export async function removeAliasAction(formData: FormData) {
  const materialId = String(formData.get('materialId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('remove_material_alias', {
    alias_id: String(formData.get('aliasId') ?? ''),
  });
  if (error) redirect(`/materials/${materialId}?error=${errorCode(error.message)}`);
  redirect(`/materials/${materialId}?notice=alias_removed`);
}
