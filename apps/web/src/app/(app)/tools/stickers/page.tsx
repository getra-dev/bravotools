import QRCode from 'qrcode';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { PrintButton } from '@/components/print-button';

export default async function StickersPage() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const activeOrg = ctx.activeOrg;
  const t = await getTranslations('tools.stickers');

  const supabase = await getSupabaseServer();
  const { data: tools } = await supabase
    .from('tools')
    .select('id, qr_code, name')
    .eq('org_id', activeOrg.orgId)
    .not('qr_code', 'is', null)
    .order('qr_code');

  const labels = await Promise.all(
    (tools ?? []).map(async (tool) => ({
      ...tool,
      svg: await QRCode.toString(tool.qr_code as string, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
      }),
    })),
  );

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-dim">{t('hint')}</p>
          <p className="mt-1 font-mono text-xs uppercase tracking-[1.5px] text-dim">
            {t('count', { count: labels.length })}
          </p>
        </div>
        <PrintButton label={t('print')} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-0 print:mt-0">
        {labels.map((label) => (
          <div
            key={label.id}
            className="flex h-[34mm] items-center gap-[3mm] break-inside-avoid border border-dashed border-line/50 p-[3mm]"
          >
            <div
              className="size-[26mm] shrink-0 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: label.svg }}
            />
            <div className="min-w-0">
              <p className="font-mono text-[9pt] font-semibold uppercase tracking-[1px]">
                {label.qr_code}
              </p>
              <p className="line-clamp-2 text-[8pt] leading-tight">{label.name}</p>
              <p className="mt-[1mm] font-mono text-[6pt] uppercase tracking-[1px] text-dim">
                {activeOrg.orgName}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
