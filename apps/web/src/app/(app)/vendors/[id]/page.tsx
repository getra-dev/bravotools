import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';

const STAMP =
  'inline-block rounded-stamp border border-line px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px] text-dim';
const H2 = 'font-mono text-[10px] uppercase tracking-[1.5px] text-dim';

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  const t = await getTranslations('vendors');
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, name, type, email, phone, order_method, default_lead_time_days, notes')
    .eq('id', id)
    .maybeSingle();
  if (!vendor) notFound();

  // orders sent to this vendor (activity signal)
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, created_at')
    .eq('vendor_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <main>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{vendor.name}</h1>
        {isSupply ? (
          <Link
            href={`/vendors/${vendor.id}/edit`}
            className="ml-auto h-9 rounded-button border border-line/40 px-3 text-sm font-bold leading-9"
          >
            {t('detail.edit')}
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {(vendor.type ?? []).map((type) => (
          <span key={type} className={STAMP}>
            {t(`form.typeLabels.${type}` as Parameters<typeof t>[0])}
          </span>
        ))}
      </div>

      <dl className="mt-6 grid max-w-2xl grid-cols-2 gap-4">
        <div>
          <dt className={H2}>{t('form.email')}</dt>
          <dd className="mt-1 text-sm">{vendor.email ?? '—'}</dd>
        </div>
        <div>
          <dt className={H2}>{t('form.phone')}</dt>
          <dd className="mt-1 text-sm">{vendor.phone ?? '—'}</dd>
        </div>
        <div>
          <dt className={H2}>{t('form.orderMethod')}</dt>
          <dd className="mt-1 text-sm">
            {t(`form.methods.${vendor.order_method}` as Parameters<typeof t>[0])}
          </dd>
        </div>
        <div>
          <dt className={H2}>{t('form.leadTime')}</dt>
          <dd className="mt-1 text-sm">
            {vendor.default_lead_time_days != null
              ? t('days', { count: vendor.default_lead_time_days })
              : '—'}
          </dd>
        </div>
      </dl>

      {vendor.notes ? (
        <div className="mt-4 max-w-2xl">
          <dt className={H2}>{t('form.notes')}</dt>
          <dd className="mt-1 text-sm">{vendor.notes}</dd>
        </div>
      ) : null}

      <div className="mt-8 max-w-2xl">
        <h2 className={H2}>{t('detail.recentOrders')}</h2>
        {(orders ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-dim">{t('detail.noOrders')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/15">
            {(orders ?? []).map((order) => (
              <li key={order.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="font-mono text-xs font-bold">{order.order_number}</span>
                <span className={`${STAMP} ml-auto`}>
                  {t(`status.${order.status}` as Parameters<typeof t>[0])}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
