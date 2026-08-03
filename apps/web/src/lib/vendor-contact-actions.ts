'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';

function errorCode(message: string): string {
  if (message.includes('name_required')) return 'name_required';
  if (message.includes('vendor_not_found')) return 'vendor_not_found';
  if (message.includes('not_allowed')) return 'not_allowed';
  return 'save_failed';
}

// "muras, siltinimas" → ['muras','siltinimas']
function handlesFrom(formData: FormData): string[] {
  return String(formData.get('handles') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
}

export async function addVendorContactAction(formData: FormData) {
  const vendorId = String(formData.get('vendorId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('create_vendor_contact', {
    args: {
      vendor_id: vendorId,
      name: String(formData.get('name') ?? '').trim(),
      position: String(formData.get('position') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim(),
      handles: handlesFrom(formData),
      is_primary: formData.get('is_primary') === 'on',
    },
  });
  if (error) redirect(`/vendors/${vendorId}?error=${errorCode(error.message)}`);
  redirect(`/vendors/${vendorId}?notice=contact_added`);
}

export async function updateVendorContactAction(formData: FormData) {
  const vendorId = String(formData.get('vendorId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('update_vendor_contact', {
    args: {
      contact_id: String(formData.get('contactId') ?? ''),
      name: String(formData.get('name') ?? '').trim(),
      position: String(formData.get('position') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim(),
      handles: handlesFrom(formData),
      is_primary: formData.get('is_primary') === 'on',
    },
  });
  if (error) redirect(`/vendors/${vendorId}?error=${errorCode(error.message)}`);
  redirect(`/vendors/${vendorId}?notice=contact_saved`);
}

export async function removeVendorContactAction(formData: FormData) {
  const vendorId = String(formData.get('vendorId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('remove_vendor_contact', {
    contact_id: String(formData.get('contactId') ?? ''),
  });
  if (error) redirect(`/vendors/${vendorId}?error=${errorCode(error.message)}`);
  redirect(`/vendors/${vendorId}?notice=contact_removed`);
}
