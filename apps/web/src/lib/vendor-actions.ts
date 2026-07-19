'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

const TYPES = ['materials', 'rental', 'tools', 'subcontractor', 'transport', 'service'] as const;

function payloadFrom(formData: FormData): Record<string, string | string[]> {
  const types = TYPES.filter((type) => formData.get(`type_${type}`) === 'on');
  return {
    name: String(formData.get('name') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim(),
    order_method: String(formData.get('order_method') ?? 'email'),
    default_lead_time_days: String(formData.get('default_lead_time_days') ?? '').trim(),
    notes: String(formData.get('notes') ?? '').trim(),
    type: types.length > 0 ? types : ['materials'],
  };
}

function errorCode(message: string): string {
  if (message.includes('name_required')) return 'name_required';
  if (message.includes('invalid_method')) return 'invalid_method';
  if (message.includes('not_allowed')) return 'not_allowed';
  return 'save_failed';
}

export async function createVendorAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');

  const supabase = await getSupabaseServer();
  const { data: vendorId, error } = await supabase.rpc('create_vendor', {
    target_org: ctx.activeOrg.orgId,
    payload: payloadFrom(formData),
  });
  if (error || !vendorId) redirect(`/vendors/new?error=${errorCode(error?.message ?? '')}`);
  redirect(`/vendors/${vendorId}`);
}

export async function updateVendorAction(formData: FormData) {
  const vendorId = String(formData.get('vendorId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('update_vendor', {
    vendor_id: vendorId,
    payload: payloadFrom(formData),
  });
  if (error) redirect(`/vendors/${vendorId}/edit?error=${errorCode(error.message)}`);
  redirect(`/vendors/${vendorId}`);
}
