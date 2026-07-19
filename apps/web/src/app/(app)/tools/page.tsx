import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { ToolsFilters } from '@/components/tools-filters';

const STATUSES = [
  'available',
  'checked_out',
  'in_service',
  'lost',
  'written_off',
  'returned_to_vendor',
] as const;

const STATUS_STYLE: Record<string, string> = {
  available: 'text-ok border-ok/50',
  checked_out: 'text-ink border-line',
  in_service: 'text-hi border-hi/50',
  lost: 'text-hot border-hot/50',
  written_off: 'text-dim border-line',
  returned_to_vendor: 'text-dim border-line',
};

function daysFromToday(date: string): number {
  return Math.ceil((Date.parse(date) - Date.now()) / 86_400_000);
}

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; location?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('tools');
  const { q, status, location } = await searchParams;

  const supabase = await getSupabaseServer();

  let query = supabase
    .from('tools')
    .select(
      `id, qr_code, name, status, ownership, rental_due_return, warranty_until,
       location:locations!tools_current_location_id_fkey(name),
       holder:profiles!tools_current_holder_id_fkey(full_name),
       external_holder:external_persons!tools_current_external_holder_id_fkey(full_name)`,
    )
    .eq('org_id', ctx.activeOrg.orgId)
    .order('qr_code');

  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    query = query.or(`name.ilike.${like},qr_code.ilike.${like},serial_number.ilike.${like},inventory_code.ilike.${like}`);
  }
  if (status && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq('status', status);
  }
  if (location) {
    query = query.eq('current_location_id', location);
  }

  const [{ data: tools }, { data: locations }] = await Promise.all([
    query,
    supabase
      .from('locations')
      .select('id, name')
      .eq('org_id', ctx.activeOrg.orgId)
      .neq('type', 'vendor')
      .order('name'),
  ]);

  const canImport = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);
  const stickersParams = new URLSearchParams();
  if (q?.trim()) stickersParams.set('q', q.trim());
  if (status) stickersParams.set('status', status);
  if (location) stickersParams.set('location', location);
  const stickersHref = `/tools/stickers${stickersParams.size ? `?${stickersParams}` : ''}`;

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={stickersHref}
            className="flex h-11 items-center rounded-button border border-line/40 px-6 text-sm font-semibold hover:bg-white"
          >
            {t('filters.printFiltered')}
          </Link>
          {canImport ? (
            <>
              <Link
                href="/tools/import"
                className="flex h-11 items-center rounded-button border border-line/40 px-6 text-sm font-semibold hover:bg-white"
              >
                {t('importCta')}
              </Link>
              <Link
                href="/tools/new"
                className="flex h-11 items-center rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel"
              >
                {t('newCta')}
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ToolsFilters
          locations={locations ?? []}
          statuses={STATUSES.map((value) => ({
            value,
            label: t(`status.${value}` as Parameters<typeof t>[0]),
          }))}
          labels={{
            search: t('filters.searchPlaceholder'),
            allStatuses: t('filters.allStatuses'),
            allLocations: t('filters.allLocations'),
          }}
        />
        <p className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
          {t('filters.count', { count: tools?.length ?? 0 })}
        </p>
      </div>

      {!tools || tools.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line/50 bg-white p-8 text-center">
          <p className="text-lg font-semibold">{t('empty')}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-dim">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left">
                {[t('colCode'), t('colName'), t('colStatus'), t('colLocation'), t('colHolder'), t('colDue')].map(
                  (label) => (
                    <th
                      key={label}
                      className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-[1.5px] text-dim"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/20">
              {tools.map((tool) => {
                const holderName =
                  tool.holder?.full_name ?? tool.external_holder?.full_name ?? '';
                const due = tool.ownership === 'rented' ? tool.rental_due_return : null;
                const dueDays = due ? daysFromToday(due) : null;
                return (
                  <tr key={tool.id} className="hover:bg-paper/60">
                    <td className="px-3 py-1.5 font-mono text-xs uppercase tracking-[1px]">
                      <Link href={`/tools/${tool.id}`} className="hover:underline">
                        {tool.qr_code}
                      </Link>
                    </td>
                    <td className="max-w-72 truncate px-3 py-1.5 font-medium">
                      <Link href={`/tools/${tool.id}`} className="hover:underline">
                        {tool.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px] ${STATUS_STYLE[tool.status] ?? 'text-dim border-line'}`}
                      >
                        {t(`status.${tool.status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="max-w-52 truncate px-3 py-1.5 text-dim">
                      {tool.location?.name ?? ''}
                    </td>
                    <td className="max-w-44 truncate px-3 py-1.5">{holderName}</td>
                    <td
                      className={`px-3 py-1.5 font-mono text-xs ${dueDays !== null && dueDays < 0 ? 'font-bold text-hot' : dueDays !== null && dueDays <= 3 ? 'text-hi' : 'text-dim'}`}
                    >
                      {due ?? ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
