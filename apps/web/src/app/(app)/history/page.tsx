import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { HistoryFilters } from '@/components/history-filters';
import { archiveActsAction } from '@/lib/history-actions';

const ACTIONS = ['checkout', 'checkin', 'transfer', 'to_service', 'from_service', 'write_off'] as const;
const LIMIT = 300;
const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const ACTION_STYLE: Record<string, string> = {
  checkout: 'border-line text-ink',
  checkin: 'border-ok/50 text-ok',
  transfer: 'border-hi/50 text-hi',
  to_service: 'border-hi/50 text-hi',
  from_service: 'border-ok/50 text-ok',
  write_off: 'border-hot/50 text-hot',
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    action?: string;
    location?: string;
    person?: string;
    q?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('history');
  const tActions = await getTranslations('tools.detail.actions');
  const { month, action, location, person, q, notice, error } = await searchParams;

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;

  let query = supabase
    .from('tool_movements')
    .select(
      `id, action, performed_at, notes, engine_hours_reading,
       tool:tools!inner(id, name, qr_code),
       performer:profiles!tool_movements_performed_by_fkey(full_name),
       to_holder:profiles!tool_movements_holder_id_fkey(full_name),
       to_external:external_persons!tool_movements_external_holder_id_fkey(full_name),
       to_location:locations!tool_movements_to_location_id_fkey(name),
       from_location:locations!tool_movements_from_location_id_fkey(name)`,
    )
    .eq('org_id', orgId)
    .order('performed_at', { ascending: false })
    .limit(LIMIT);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    query = query.gte('performed_at', start).lt('performed_at', next);
  }
  if (action && (ACTIONS as readonly string[]).includes(action)) query = query.eq('action', action);
  if (location) query = query.or(`to_location_id.eq.${location},from_location_id.eq.${location}`);
  if (person) query = query.eq('performed_by', person);
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    query = query.or(`name.ilike.${like},qr_code.ilike.${like}`, { referencedTable: 'tool' });
  }

  const [{ data: movements }, { data: locations }, { data: members }] = await Promise.all([
    query,
    supabase.from('locations').select('id, name').eq('org_id', orgId).order('name'),
    supabase.from('memberships').select('user_id, profiles(full_name)').eq('org_id', orgId),
  ]);

  // group by month, newest first
  const buckets = new Map<string, NonNullable<typeof movements>>();
  for (const movement of movements ?? []) {
    const key = movement.performed_at.slice(0, 7);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(movement);
  }

  const canArchive = ['owner', 'admin'].includes(ctx.activeOrg.role);

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        {canArchive ? (
          <form action={archiveActsAction} className="flex items-end gap-2">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                {t('archiveUpTo')}
              </span>
              <input
                name="upTo"
                type="date"
                required
                className="mt-1 block h-9 rounded-button-sm border border-line/40 bg-white px-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-button-sm border border-line/40 px-3 text-xs font-semibold hover:bg-white"
            >
              {t('archiveAction')}
            </button>
          </form>
        ) : null}
      </div>

      {notice !== undefined ? (
        <p className="mt-3 max-w-xl rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-1.5 text-sm">
          {t('archivedNotice', { count: notice })}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 max-w-xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-1.5 text-sm">
          {t(
            `archiveErrors.${error === 'not_allowed' ? 'not_allowed' : 'save_failed'}` as Parameters<
              typeof t
            >[0],
          )}
        </p>
      ) : null}

      <div className="mt-4">
        <HistoryFilters
          actions={ACTIONS.map((value) => ({
            value,
            label: tActions(value as Parameters<typeof tActions>[0]),
          }))}
          locations={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
          people={(members ?? [])
            .filter((m) => m.profiles?.full_name)
            .map((m) => ({ value: m.user_id, label: m.profiles!.full_name! }))}
          labels={{
            allActions: t('allActions'),
            allLocations: t('allLocations'),
            allPeople: t('allPeople'),
            search: t('searchPlaceholder'),
          }}
        />
      </div>

      {(movements?.length ?? 0) >= LIMIT ? (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
          {t('limitNote', { count: LIMIT })}
        </p>
      ) : null}

      {buckets.size === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line/50 bg-white p-8 text-center">
          <p className="text-sm text-dim">{t('empty')}</p>
        </div>
      ) : (
        [...buckets.entries()].map(([monthKey, rows]) => (
          <section key={monthKey} className="mt-6">
            <div className="flex items-baseline justify-between border-b border-line/30 pb-1">
              <h2 className="font-mono text-sm font-bold uppercase tracking-[1.5px]">{monthKey}</h2>
              <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                {t('monthEvents', { count: rows.length })}
              </span>
            </div>
            <ul className="divide-y divide-line/15 rounded-card border border-line/30 bg-white">
              {rows.map((movement) => {
                const receiver =
                  movement.to_holder?.full_name ?? movement.to_external?.full_name ?? null;
                const target = receiver ?? movement.to_location?.name ?? null;
                return (
                  <li key={movement.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <span className="w-32 shrink-0 font-mono text-xs text-dim">
                      {movement.performed_at.slice(0, 16).replace('T', ' ')}
                    </span>
                    <span className={`${STAMP} shrink-0 ${ACTION_STYLE[movement.action] ?? 'border-line text-dim'}`}>
                      {tActions(movement.action as Parameters<typeof tActions>[0])}
                    </span>
                    <Link
                      href={`/tools/${movement.tool?.id}`}
                      className="min-w-0 truncate font-medium hover:underline"
                    >
                      <span className="font-mono text-xs uppercase tracking-[1px] text-dim">
                        {movement.tool?.qr_code}
                      </span>
                      <span className="ml-2">{movement.tool?.name}</span>
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-dim">
                      {target ? `→ ${target}` : ''}
                      {movement.notes ? ` · ${movement.notes}` : ''}
                    </span>
                    <span className="hidden shrink-0 text-xs text-dim lg:block">
                      {movement.performer?.full_name
                        ? t('byPerson', { name: movement.performer.full_name })
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
