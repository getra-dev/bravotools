import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type VendorDefaults = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  order_method?: string | null;
  default_lead_time_days?: number | null;
  notes?: string | null;
  type?: string[] | null;
};

const INPUT =
  'mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm outline-none focus:border-ink';
const LABEL = 'font-mono text-[11px] uppercase tracking-[1.5px] text-dim';
const METHODS = ['email', 'csv', 'api', 'manual'] as const;
const TYPES = ['materials', 'rental', 'tools', 'subcontractor', 'transport', 'service'] as const;

export async function VendorForm({
  action,
  defaults,
  vendorId,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults: VendorDefaults;
  vendorId?: string;
  submitLabel: string;
  cancelHref: string;
}) {
  const t = await getTranslations('vendors.form');
  const activeTypes = new Set(defaults.type ?? ['materials']);

  return (
    <form action={action} className="mt-6 max-w-2xl space-y-4">
      {vendorId ? <input type="hidden" name="vendorId" value={vendorId} /> : null}

      <label className="block">
        <span className={LABEL}>{t('name')}</span>
        <input name="name" required defaultValue={defaults.name ?? ''} className={INPUT} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>{t('email')}</span>
          <input
            name="email"
            type="email"
            defaultValue={defaults.email ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('phone')}</span>
          <input name="phone" defaultValue={defaults.phone ?? ''} className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>{t('orderMethod')}</span>
          <select
            name="order_method"
            defaultValue={defaults.order_method ?? 'email'}
            className={INPUT}
          >
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {t(`methods.${method}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>{t('leadTime')}</span>
          <input
            name="default_lead_time_days"
            type="number"
            min="0"
            defaultValue={defaults.default_lead_time_days ?? ''}
            className={INPUT}
          />
        </label>
      </div>

      <fieldset>
        <span className={LABEL}>{t('types')}</span>
        <div className="mt-2 flex flex-wrap gap-4">
          {TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`type_${type}`}
                defaultChecked={activeTypes.has(type)}
                className="h-4 w-4"
              />
              {t(`typeLabels.${type}` as Parameters<typeof t>[0])}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className={LABEL}>{t('notes')}</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaults.notes ?? ''}
          className="mt-1 block w-full rounded-button border border-line/40 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button className="h-10 rounded-button bg-ink px-4 text-sm font-bold text-paper">
          {submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm text-dim hover:underline">
          {t('cancel')}
        </Link>
      </div>
    </form>
  );
}
