'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from './supabase/server';
import { ACTIVE_ORG_COOKIE } from './org';

function fieldValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function signIn(formData: FormData) {
  const email = fieldValue(formData, 'email');
  const password = fieldValue(formData, 'password');
  if (!email || !password) redirect('/login?error=missing_fields');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=invalid_credentials');
  redirect('/');
}

export async function signUp(formData: FormData) {
  const fullName = fieldValue(formData, 'fullName');
  const email = fieldValue(formData, 'email');
  const password = fieldValue(formData, 'password');
  if (!fullName || !email || !password) redirect('/signup?error=missing_fields');
  if (password.length < 8) redirect('/signup?error=weak_password');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) redirect('/signup?error=signup_failed');

  // Profile row is created by the DB trigger; fill in the name it read
  // from raw_user_meta_data (kept for clarity if metadata was missing).
  redirect('/');
}

export async function sendMagicLink(formData: FormData) {
  const email = fieldValue(formData, 'email');
  if (!email) redirect('/login?error=missing_fields');

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm` },
  });
  if (error) redirect('/login?error=otp_failed');
  redirect('/login?notice=magic_link_sent');
}

export async function signOut() {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function createOrganization(formData: FormData) {
  const name = fieldValue(formData, 'orgName');
  if (!name) redirect('/onboarding?error=missing_fields');

  const supabase = await getSupabaseServer();
  const { data: orgId, error } = await supabase.rpc('create_organization', { org_name: name });
  if (error || !orgId) redirect('/onboarding?error=create_failed');

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, { path: '/' });
  redirect('/');
}

export async function inviteMember(formData: FormData) {
  const email = fieldValue(formData, 'email');
  const role = fieldValue(formData, 'role');
  const orgId = fieldValue(formData, 'orgId');
  if (!email || !role || !orgId) redirect('/settings/members?error=missing_fields');

  const supabase = await getSupabaseServer();
  const { data: result, error } = await supabase.rpc('invite_member', {
    target_org: orgId,
    invite_email: email,
    invite_role: role,
  });
  if (error) {
    const code = error.message.includes('not_allowed')
      ? 'not_allowed'
      : error.message.includes('invalid_email')
        ? 'invalid_email'
        : 'invite_failed';
    redirect(`/settings/members?error=${code}`);
  }
  revalidatePath('/settings/members');
  redirect(`/settings/members?notice=${result === 'added' ? 'member_added' : 'invitation_sent'}`);
}

export async function switchOrg(formData: FormData) {
  const orgId = fieldValue(formData, 'orgId');
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (membership) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, { path: '/' });
  }
  redirect('/');
}
