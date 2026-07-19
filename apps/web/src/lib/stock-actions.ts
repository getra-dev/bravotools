'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

function errorCode(message: string): string {
  if (message.includes('insufficient_stock')) return 'insufficient_stock';
  if (message.includes('invalid_qty')) return 'invalid_qty';
  if (message.includes('invalid_type')) return 'invalid_type';
  if (message.includes('not_allowed')) return 'not_allowed';
  return 'save_failed';
}

export async function adjustStockAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('adjust_stock', {
    args: {
      material_id: String(formData.get('materialId') ?? ''),
      location_id: String(formData.get('locationId') ?? ''),
      movement_type: String(formData.get('movementType') ?? ''),
      quantity: String(formData.get('quantity') ?? '').trim(),
      notes: String(formData.get('notes') ?? '').trim(),
    },
  });
  if (error) redirect(`/stock?error=${errorCode(error.message)}`);
  redirect('/stock?notice=saved');
}
