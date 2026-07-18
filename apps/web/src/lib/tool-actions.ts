'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

const FIELDS = [
  'name',
  'category_id',
  'serial_number',
  'inventory_code',
  'purchase_price',
  'purchase_date',
  'vendor_id',
  'internal_rate_daily',
  'warranty_months',
  'location_id',
  'notes',
] as const;

function payloadFrom(formData: FormData): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    payload[field] = typeof value === 'string' ? value.trim() : '';
  }
  return payload;
}

function errorCode(message: string): string {
  if (message.includes('name_required')) return 'name_required';
  if (message.includes('not_allowed')) return 'not_allowed';
  return 'save_failed';
}

export async function createToolAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');

  const supabase = await getSupabaseServer();
  const { data: toolId, error } = await supabase.rpc('create_tool', {
    target_org: ctx.activeOrg.orgId,
    payload: payloadFrom(formData),
  });
  if (error || !toolId) redirect(`/tools/new?error=${errorCode(error?.message ?? '')}`);
  redirect(`/tools/${toolId}`);
}

export async function updateToolAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');

  const toolId = String(formData.get('toolId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('update_tool', {
    tool_id: toolId,
    payload: payloadFrom(formData),
  });
  if (error) redirect(`/tools/${toolId}/edit?error=${errorCode(error.message)}`);
  redirect(`/tools/${toolId}`);
}
