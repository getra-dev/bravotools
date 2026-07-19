import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type MaterialDefaults = {
  canonical_name?: string | null;
  base_unit?: string | null;
  category?: string | null;
  supply_mode?: string | null;
  unit_weight_kg?: number | null;
  unit_volume_m3?: number | null;
  max_length_m?: number | null;
  unit_width_m?: number | null;
  units_per_pallet?: number | null;
  pallet_type?: string | null;
};

const INPUT =
  'mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm outline-none focus:border-ink';
const LABEL = 'font-mono text-[11px] uppercase tracking-[1.5px] text-dim';

export async function MaterialForm({
  action,
  defaults,
  materialId,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults: MaterialDefaults;
  materialId?: string;
  submitLabel: string;
  cancelHref: string;
}) {
  const t = await getTranslations('materials.form');

  return (
    <form action={action} className="mt-6 max-w-2xl space-y-4">
      {materialId ? <input type="hidden" name="materialId" value={materialId} /> : null}

      <label className="block">
        <span className={LABEL}>{t('name')}</span>
        <input
          name="canonical_name"
          required
          defaultValue={defaults.canonical_name ?? ''}
          className={INPUT}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>{t('unit')}</span>
          <input name="base_unit" defaultValue={defaults.base_unit ?? 'vnt'} className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>{t('category')}</span>
          <input name="category" defaultValue={defaults.category ?? ''} className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>{t('supplyMode')}</span>
          <select
            name="supply_mode"
            defaultValue={defaults.supply_mode ?? 'order'}
            className={INPUT}
          >
            <option value="stock">{t('modes.stock')}</option>
            <option value="order">{t('modes.order')}</option>
          </select>
        </label>
      </div>

      <fieldset className="border-t border-line/20 pt-4">
        <legend className={LABEL}>{t('physical')}</legend>
        <p className="mt-1 text-xs text-dim">{t('physicalHint')}</p>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={LABEL}>{t('weight')}</span>
            <input name="unit_weight_kg" inputMode="decimal" defaultValue={defaults.unit_weight_kg ?? ''} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>{t('volume')}</span>
            <input name="unit_volume_m3" inputMode="decimal" defaultValue={defaults.unit_volume_m3 ?? ''} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>{t('length')}</span>
            <input name="max_length_m" inputMode="decimal" defaultValue={defaults.max_length_m ?? ''} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>{t('width')}</span>
            <input name="unit_width_m" inputMode="decimal" defaultValue={defaults.unit_width_m ?? ''} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>{t('perPallet')}</span>
            <input name="units_per_pallet" inputMode="decimal" defaultValue={defaults.units_per_pallet ?? ''} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>{t('palletType')}</span>
            <input name="pallet_type" defaultValue={defaults.pallet_type ?? ''} placeholder="EUR" className={INPUT} />
          </label>
        </div>
      </fieldset>

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
