import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

const STATUS_STYLE: Record<string, string> = {
  available: 'text-ok border-ok/50',
  checked_out: 'text-ink border-line',
  in_service: 'text-hi border-hi/50',
  lost: 'text-hot border-hot/50',
  written_off: 'text-dim border-line',
  returned_to_vendor: 'text-dim border-line',
};

export default async function ToolsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const t = await getTranslations('tools');

  const supabase = await getSupabaseServer();
  const { data: tools } = await supabase
    .from('tools')
    .select('id, qr_code, name, status')
    .eq('org_id', ctx.activeOrg.orgId)
    .order('qr_code');

  const canImport = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  return (
    <main>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        {canImport ? (
          <Link
            href="/tools/import"
            className="flex h-11 items-center rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel"
          >
            {t('importCta')}
          </Link>
        ) : null}
      </div>

      {!tools || tools.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line/50 bg-white p-8 text-center">
          <p className="text-lg font-semibold">{t('empty')}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-dim">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-line/30 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/30 text-left">
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colCode')}
                </th>
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colName')}
                </th>
                <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                  {t('colStatus')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/20">
              {tools.map((tool) => (
                <tr key={tool.id}>
                  <td className="px-4 py-2 font-mono text-xs uppercase tracking-[1.5px]">
                    {tool.qr_code}
                  </td>
                  <td className="px-4 py-2 font-medium">{tool.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-stamp border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[1.5px] ${STATUS_STYLE[tool.status] ?? 'text-dim border-line'}`}
                    >
                      {t(`status.${tool.status}` as Parameters<typeof t>[0])}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
