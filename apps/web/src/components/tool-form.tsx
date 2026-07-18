import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type Option = { id: string; name: string };

type ToolDefaults = {
  name?: string | null;
  category_id?: string | null;
  serial_number?: string | null;
  inventory_code?: string | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  purchased_from_vendor_id?: string | null;
  internal_rate_daily?: number | null;
  warranty_months?: number | null;
  current_location_id?: string | null;
  notes?: string | null;
};

const INPUT =
  'mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm outline-none focus:border-ink';
const LABEL = 'font-mono text-[11px] uppercase tracking-[1.5px] text-dim';

export async function ToolForm({
  action,
  defaults,
  categories,
  vendors,
  locations,
  toolId,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults: ToolDefaults;
  categories: Option[];
  vendors: Option[];
  locations: Option[];
  toolId?: string;
  submitLabel: string;
  cancelHref: string;
}) {
  const t = await getTranslations('tools.form');

  return (
    <form action={action} className="mt-6 max-w-2xl space-y-4">
      {toolId ? <input type="hidden" name="toolId" value={toolId} /> : null}

      <label className="block">
        <span className={LABEL}>{t('name')}</span>
        <input name="name" required defaultValue={defaults.name ?? ''} className={INPUT} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>{t('category')}</span>
          <select name="category_id" defaultValue={defaults.category_id ?? ''} className={INPUT}>
            <option value="">{t('noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>{t('location')}</span>
          <select
            name="location_id"
            defaultValue={defaults.current_location_id ?? ''}
            className={INPUT}
          >
            <option value="">{t('noLocation')}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>{t('serial')}</span>
          <input
            name="serial_number"
            defaultValue={defaults.serial_number ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('inventoryCode')}</span>
          <input
            name="inventory_code"
            defaultValue={defaults.inventory_code ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('price')}</span>
          <input
            name="purchase_price"
            inputMode="decimal"
            defaultValue={defaults.purchase_price ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('date')}</span>
          <input
            name="purchase_date"
            type="date"
            defaultValue={defaults.purchase_date ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('vendor')}</span>
          <select
            name="vendor_id"
            defaultValue={defaults.purchased_from_vendor_id ?? ''}
            className={INPUT}
          >
            <option value="">{t('noVendor')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>{t('warrantyMonths')}</span>
          <input
            name="warranty_months"
            type="number"
            min="0"
            defaultValue={defaults.warranty_months ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('internalRate')}</span>
          <input
            name="internal_rate_daily"
            inputMode="decimal"
            defaultValue={defaults.internal_rate_daily ?? ''}
            className={INPUT}
          />
        </label>
      </div>

      <label className="block">
        <span className={LABEL}>{t('notes')}</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaults.notes ?? ''}
          className="mt-1 block w-full rounded-button border border-line/40 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-11 rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="flex h-11 items-center rounded-button border border-line/40 px-6 text-sm font-semibold hover:bg-white"
        >
          {t('cancel')}
        </Link>
      </div>
    </form>
  );
}
