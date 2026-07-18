import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { assignMemberAction, removeAssignmentAction } from '@/lib/location-actions';

const STAMP =
  'inline-block rounded-stamp border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px]';
const ERROR_KEYS = new Set(['not_allowed', 'save_failed']);

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  const { error } = await searchParams;
  const t = await getTranslations('locations');
  const tTools = await getTranslations('tools');

  const supabase = await getSupabaseServer();
  const { data: location } = await supabase
    .from('locations')
    .select('id, name, type, address, latitude, longitude, is_active')
    .eq('id', id)
    .eq('org_id', ctx.activeOrg.orgId)
    .maybeSingle();
  if (!location) notFound();

  const [{ data: assignments }, { data: members }, { data: tools }] = await Promise.all([
    supabase
      .from('site_assignments')
      .select('user_id, is_manager, profile:profiles(full_name)')
      .eq('site_id', id)
      .order('is_manager', { ascending: false }),
    supabase
      .from('memberships')
      .select('user_id, profiles(full_name)')
      .eq('org_id', ctx.activeOrg.orgId),
    supabase
      .from('tools')
      .select('id, qr_code, name, status')
      .eq('current_location_id', id)
      .order('qr_code'),
  ]);

  const canEdit = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);
  const assignedIds = new Set((assignments ?? []).map((a) => a.user_id));
  const assignable = (members ?? []).filter(
    (m) => !assignedIds.has(m.user_id) && m.profiles?.full_name,
  );

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`${STAMP} border-line text-ink`}>
              {t(`types.${location.type}` as Parameters<typeof t>[0])}
            </span>
            <span
              className={`${STAMP} ${location.is_active ? 'border-ok/50 text-ok' : 'border-line text-dim'}`}
            >
              {location.is_active ? t('activeStamp') : t('archivedStamp')}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{location.name}</h1>
          <p className="mt-1 text-sm text-dim">{location.address}</p>
        </div>
        {canEdit ? (
          <Link
            href={`/locations/${location.id}/edit`}
            className="flex h-11 items-center rounded-button border border-line/40 px-6 text-sm font-semibold hover:bg-white"
          >
            {t('detail.edit')}
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(
            `form.errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0],
          )}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {t('detail.assignmentsTitle')}
          </h2>
          {assignments && assignments.length > 0 ? (
            <ul className="mt-3 divide-y divide-line/20">
              {assignments.map((a) => (
                <li key={a.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{a.profile?.full_name}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`${STAMP} ${a.is_manager ? 'border-hi/50 text-hi' : 'border-line text-dim'}`}
                    >
                      {a.is_manager ? t('detail.managerStamp') : t('detail.workerStamp')}
                    </span>
                    {canEdit ? (
                      <form action={removeAssignmentAction}>
                        <input type="hidden" name="siteId" value={location.id} />
                        <input type="hidden" name="userId" value={a.user_id} />
                        <button
                          type="submit"
                          className="rounded-button-sm border border-line/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[1px] text-dim hover:bg-paper"
                        >
                          {t('detail.removeAction')}
                        </button>
                      </form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-dim">{t('detail.noAssignments')}</p>
          )}

          {canEdit && assignable.length > 0 ? (
            <form action={assignMemberAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line/20 pt-4">
              <input type="hidden" name="siteId" value={location.id} />
              <label className="min-w-44 flex-1">
                <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('detail.member')}
                </span>
                <select
                  name="userId"
                  className="mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm"
                >
                  {assignable.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-11 items-center gap-2">
                <input type="checkbox" name="isManager" className="size-4" />
                <span className="text-sm font-medium">{t('detail.asManager')}</span>
              </label>
              <button
                type="submit"
                className="h-11 rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel"
              >
                {t('detail.assignAction')}
              </button>
            </form>
          ) : null}
        </section>

        <section className="rounded-card border border-line/30 bg-white p-4">
          <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {t('detail.toolsTitle')}
          </h2>
          {tools && tools.length > 0 ? (
            <ul className="mt-3 divide-y divide-line/20">
              {tools.map((tool) => (
                <li key={tool.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/tools/${tool.id}`} className="min-w-0 hover:underline">
                    <span className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
                      {tool.qr_code}
                    </span>
                    <span className="ml-2 font-medium">{tool.name}</span>
                  </Link>
                  <span className={`${STAMP} border-line text-ink`}>
                    {tTools(`status.${tool.status}` as Parameters<typeof tTools>[0])}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-dim">{t('detail.toolsEmpty')}</p>
          )}
        </section>
      </div>
    </main>
  );
}
