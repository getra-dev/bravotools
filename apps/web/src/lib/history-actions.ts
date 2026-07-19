'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

export async function archiveActsAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const upTo = String(formData.get('upTo') ?? '');

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('archive_acts', {
    target_org: ctx.activeOrg.orgId,
    up_to: upTo,
  });
  if (error) {
    const code = error.message.includes('not_allowed') ? 'not_allowed' : 'save_failed';
    redirect(`/history?error=${code}`);
  }
  const archived = (data as { archived: number }).archived;
  redirect(`/history?notice=${archived}`);
}
