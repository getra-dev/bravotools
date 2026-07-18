import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { inviteMember } from '@/lib/actions';

const ROLES = ['admin', 'supply_manager', 'site_manager', 'driver', 'worker'] as const;
const ERROR_KEYS = new Set(['missing_fields', 'invalid_email', 'not_allowed', 'invite_failed']);
const NOTICE_KEYS = new Set(['member_added', 'invitation_sent']);

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('members');
  const { error, notice } = await searchParams;

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;
  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, role, user_id, profiles(full_name)')
      .eq('org_id', orgId)
      .order('created_at'),
    supabase
      .from('org_invitations')
      .select('id, email, role, status')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at'),
  ]);

  const canInvite = ['owner', 'admin'].includes(ctx.activeOrg.role);
  const errorText = error
    ? t(`errors.${ERROR_KEYS.has(error) ? error : 'invite_failed'}` as Parameters<typeof t>[0])
    : null;
  const noticeText =
    notice && NOTICE_KEYS.has(notice)
      ? t(`notices.${notice}` as Parameters<typeof t>[0])
      : null;

  return (
    <main>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>

      {noticeText ? (
        <p className="mt-3 max-w-xl rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {noticeText}
        </p>
      ) : null}
      {errorText ? (
        <p className="mt-3 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {errorText}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-card border border-line/30 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line/30 text-left">
              <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                {t('colName')}
              </th>
              <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                {t('colEmail')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/20">
            {(members ?? []).map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2 font-medium">{m.profiles?.full_name}</td>
                <td className="px-4 py-2">
                  <span className="inline-block rounded-stamp border border-line px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px] text-ink">
                    {t(`roles.${m.role}` as Parameters<typeof t>[0])}
                  </span>
                </td>
              </tr>
            ))}
            {(invitations ?? []).map((i) => (
              <tr key={i.id} className="text-dim">
                <td className="px-4 py-2">{i.email}</td>
                <td className="px-4 py-2">
                  <span className="inline-block rounded-stamp border border-hi/50 px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px] text-hi">
                    {t('pendingBadge')} · {t(`roles.${i.role}` as Parameters<typeof t>[0])}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canInvite ? (
        <section className="mt-6 max-w-xl rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {t('inviteTitle')}
          </h2>
          <form action={inviteMember} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="orgId" value={orgId} />
            <label className="min-w-52 flex-1">
              <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                {t('inviteEmail')}
              </span>
              <input
                name="email"
                type="email"
                required
                className="mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm outline-none focus:border-ink"
              />
            </label>
            <label>
              <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                {t('inviteRole')}
              </span>
              <select
                name="role"
                defaultValue="worker"
                className="mt-1 block h-11 rounded-button border border-line/40 bg-paper px-3 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="h-11 rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel"
            >
              {t('inviteAction')}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
