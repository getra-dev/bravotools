import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type VehicleDefaults = {
  name?: string | null;
  plate_number?: string | null;
  type?: string | null;
  has_crane?: boolean | null;
  can_carry_pallets?: boolean | null;
  capacity_kg?: number | null;
  capacity_m3?: number | null;
  max_item_length_m?: number | null;
};

const INPUT =
  'mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm outline-none focus:border-ink';
const LABEL = 'font-mono text-[11px] uppercase tracking-[1.5px] text-dim';
const TYPES = ['van', 'truck', 'crane_truck', 'trailer', 'other'] as const;

export async function VehicleForm({
  action,
  defaults,
  vehicleId,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults: VehicleDefaults;
  vehicleId?: string;
  submitLabel: string;
  cancelHref: string;
}) {
  const t = await getTranslations('vehicles.form');

  return (
    <form action={action} className="mt-6 max-w-2xl space-y-4">
      {vehicleId ? <input type="hidden" name="vehicleId" value={vehicleId} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>{t('name')}</span>
          <input name="name" required defaultValue={defaults.name ?? ''} className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>{t('plate')}</span>
          <input name="plate_number" defaultValue={defaults.plate_number ?? ''} className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>{t('type')}</span>
          <select name="type" defaultValue={defaults.type ?? 'van'} className={INPUT}>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>{t('capacityKg')}</span>
          <input
            name="capacity_kg"
            type="number"
            min="0"
            defaultValue={defaults.capacity_kg ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('capacityM3')}</span>
          <input
            name="capacity_m3"
            inputMode="decimal"
            defaultValue={defaults.capacity_m3 ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('maxLength')}</span>
          <input
            name="max_item_length_m"
            inputMode="decimal"
            defaultValue={defaults.max_item_length_m ?? ''}
            className={INPUT}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="has_crane" defaultChecked={defaults.has_crane ?? false} className="h-4 w-4" />
          {t('hasCrane')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="can_carry_pallets"
            defaultChecked={defaults.can_carry_pallets ?? true}
            className="h-4 w-4"
          />
          {t('pallets')}
        </label>
      </div>

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
