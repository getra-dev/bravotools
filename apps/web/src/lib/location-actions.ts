'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

const FIELDS = ['name', 'type', 'address', 'latitude', 'longitude'] as const;

function payloadFrom(formData: FormData): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    payload[field] = typeof value === 'string' ? value.trim() : '';
  }
  payload.is_active = formData.get('is_active') === null ? 'true' : String(formData.get('is_active') === 'on');
  return payload;
}

function errorCode(message: string): string {
  if (message.includes('name_required')) return 'name_required';
  if (message.includes('not_allowed')) return 'not_allowed';
  return 'save_failed';
}

export async function createLocationAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');

  const supabase = await getSupabaseServer();
  const { data: locationId, error } = await supabase.rpc('create_location', {
    target_org: ctx.activeOrg.orgId,
    payload: payloadFrom(formData),
  });
  if (error || !locationId) redirect(`/locations/new?error=${errorCode(error?.message ?? '')}`);
  redirect(`/locations/${locationId}`);
}

export async function updateLocationAction(formData: FormData) {
  const locationId = String(formData.get('locationId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('update_location', {
    location_id: locationId,
    payload: payloadFrom(formData),
  });
  if (error) redirect(`/locations/${locationId}/edit?error=${errorCode(error.message)}`);
  redirect(`/locations/${locationId}`);
}

export async function assignMemberAction(formData: FormData) {
  const siteId = String(formData.get('siteId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const manager = formData.get('isManager') === 'on';

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('assign_site_member', {
    target_site: siteId,
    target_user: userId,
    manager,
  });
  if (error) redirect(`/locations/${siteId}?error=${errorCode(error.message)}`);
  revalidatePath(`/locations/${siteId}`);
  redirect(`/locations/${siteId}`);
}

export async function removeAssignmentAction(formData: FormData) {
  const siteId = String(formData.get('siteId') ?? '');
  const userId = String(formData.get('userId') ?? '');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('remove_site_assignment', {
    target_site: siteId,
    target_user: userId,
  });
  if (error) redirect(`/locations/${siteId}?error=${errorCode(error.message)}`);
  revalidatePath(`/locations/${siteId}`);
  redirect(`/locations/${siteId}`);
}
