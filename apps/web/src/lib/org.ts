import { cookies } from 'next/headers';
import { getSupabaseServer } from './supabase/server';

export const ACTIVE_ORG_COOKIE = 'bt-org';

export type OrgMembership = {
  orgId: string;
  orgName: string;
  role: string;
};

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string;
  memberships: OrgMembership[];
  activeOrg: OrgMembership | null;
};

/** Loads the signed-in user, their org memberships and the active org. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: membershipRows }, { data: profile }] = await Promise.all([
    supabase.from('memberships').select('org_id, role, organizations(name)').eq('user_id', user.id),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
  ]);

  const memberships: OrgMembership[] = (membershipRows ?? []).map((m) => ({
    orgId: m.org_id,
    orgName: m.organizations?.name ?? '',
    role: m.role,
  }));

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = memberships.find((m) => m.orgId === preferred) ?? memberships[0] ?? null;

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? '',
    memberships,
    activeOrg,
  };
}
