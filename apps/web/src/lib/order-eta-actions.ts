'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

export async function setOrderLineEtaAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const itemId = String(formData.get('itemId') ?? '');
  const date = String(formData.get('expectedDate') ?? '').trim();
  const back = String(formData.get('back') ?? '/awaiting');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('set_order_line_eta', {
    order_item_id: itemId,
    p_date: date,
  });
  if (error) {
    const code = error.message.includes('not_allowed') ? 'not_allowed' : 'save_failed';
    redirect(`${back}?error=${code}`);
  }
  redirect(`${back}?notice=eta_set`);
}
