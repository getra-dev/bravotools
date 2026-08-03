import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import {
  addVendorContactAction,
  updateVendorContactAction,
  removeVendorContactAction,
} from '@/lib/vendor-contact-actions';

const STAMP =
  'inline-block rounded-stamp border border-line px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px] text-dim';
const H2 = 'font-mono text-[10px] uppercase tracking-[1.5px] text-dim';
const INPUT = 'h-8 rounded-button-sm border border-line/40 bg-paper px-2 text-xs';
const ERROR_KEYS = new Set(['name_required', 'vendor_not_found', 'not_allowed', 'save_failed']);
const NOTICE_KEYS = new Set(['contact_added', 'contact_saved', 'contact_removed']);

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { id } = await params;
  const { notice, error } = await searchParams;
  const t = await getTranslations('vendors');
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, name, type, email, phone, order_method, default_lead_time_days, notes')
    .eq('id', id)
    .maybeSingle();
  if (!vendor) notFound();

  // orders sent to this vendor (activity signal) + who is responsible for what
  const [{ data: orders }, { data: contacts }, { data: categoryRows }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, status, created_at')
      .eq('vendor_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('vendor_contacts')
      .select('id, name, position, email, phone, handles, is_primary')
      .eq('vendor_id', id)
      .order('is_primary', { ascending: false })
      .order('name'),
    supabase
      .from('materials')
      .select('category')
      .eq('org_id', ctx.activeOrg.orgId)
      .not('category', 'is', null),
  ]);

  const categories = [...new Set((categoryRows ?? []).map((r) => r.category as string))].sort();

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

      {notice ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {t(
            `detail.notices.${NOTICE_KEYS.has(notice) ? notice : 'contact_saved'}` as Parameters<
              typeof t
            >[0],
          )}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(
            `detail.errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<
              typeof t
            >[0],
          )}
        </p>
      ) : null}

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

      {/* who is responsible for what at this vendor — PO emails route here */}
      <section className="mt-8 max-w-3xl">
        <h2 className={H2}>{t('detail.contacts')}</h2>
        <p className="mt-1 text-xs text-dim">{t('detail.contactsHint')}</p>

        {(contacts ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-dim">{t('detail.noContacts')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line/15">
            {(contacts ?? []).map((c) => (
              <li key={c.id} className="py-3">
                {isSupply ? (
                  <form
                    action={updateVendorContactAction}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="vendorId" value={vendor.id} />
                    <input type="hidden" name="contactId" value={c.id} />
                    <input
                      name="name"
                      required
                      defaultValue={c.name}
                      aria-label={t('contacts.name')}
                      className={`${INPUT} w-40`}
                    />
                    <input
                      name="position"
                      defaultValue={c.position ?? ''}
                      placeholder={t('contacts.position')}
                      className={`${INPUT} w-32`}
                    />
                    <input
                      name="email"
                      type="email"
                      defaultValue={c.email ?? ''}
                      placeholder={t('contacts.email')}
                      className={`${INPUT} w-48`}
                    />
                    <input
                      name="phone"
                      defaultValue={c.phone ?? ''}
                      placeholder={t('contacts.phone')}
                      className={`${INPUT} w-32`}
                    />
                    <input
                      name="handles"
                      list="vendor-contact-categories"
                      defaultValue={(c.handles ?? []).join(', ')}
                      placeholder={t('contacts.handles')}
                      className={`${INPUT} w-48`}
                    />
                    <label className="flex items-center gap-1 text-xs text-dim">
                      <input type="checkbox" name="is_primary" defaultChecked={c.is_primary} />
                      {t('contacts.primary')}
                    </label>
                    <button className="h-8 rounded-button-sm bg-ink px-3 text-xs font-bold text-paper">
                      {t('contacts.save')}
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.position ? <span className="text-dim">{c.position}</span> : null}
                    {c.email ? <span className="font-mono text-xs">{c.email}</span> : null}
                    {c.phone ? <span className="font-mono text-xs">{c.phone}</span> : null}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {c.is_primary ? (
                    <span className={`${STAMP} border-ok/50 text-ok`}>{t('contacts.primary')}</span>
                  ) : null}
                  {(c.handles ?? []).map((h) => (
                    <span key={h} className={STAMP}>
                      {h}
                    </span>
                  ))}
                  {(c.handles ?? []).length === 0 && !c.is_primary ? (
                    <span className="text-xs text-dim">{t('contacts.noHandles')}</span>
                  ) : null}
                  {isSupply ? (
                    <form action={removeVendorContactAction} className="ml-auto">
                      <input type="hidden" name="vendorId" value={vendor.id} />
                      <input type="hidden" name="contactId" value={c.id} />
                      <button className="text-xs text-hot">{t('contacts.remove')}</button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isSupply ? (
          <form
            action={addVendorContactAction}
            className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/20 pt-3"
          >
            <input type="hidden" name="vendorId" value={vendor.id} />
            <input
              name="name"
              required
              placeholder={t('contacts.name')}
              className={`${INPUT} w-40`}
            />
            <input name="position" placeholder={t('contacts.position')} className={`${INPUT} w-32`} />
            <input
              name="email"
              type="email"
              placeholder={t('contacts.email')}
              className={`${INPUT} w-48`}
            />
            <input name="phone" placeholder={t('contacts.phone')} className={`${INPUT} w-32`} />
            <input
              name="handles"
              list="vendor-contact-categories"
              placeholder={t('contacts.handles')}
              className={`${INPUT} w-48`}
            />
            <label className="flex items-center gap-1 text-xs text-dim">
              <input type="checkbox" name="is_primary" />
              {t('contacts.primary')}
            </label>
            <button className="h-8 rounded-button-sm bg-ink px-3 text-xs font-bold text-paper">
              {t('contacts.add')}
            </button>
          </form>
        ) : null}

        <datalist id="vendor-contact-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </section>

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
