import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type LocationDefaults = {
  name?: string | null;
  type?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active?: boolean | null;
};

const INPUT =
  'mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm outline-none focus:border-ink';
const LABEL = 'font-mono text-[11px] uppercase tracking-[1.5px] text-dim';
const TYPES = ['site', 'warehouse', 'service'] as const;

export async function LocationForm({
  action,
  defaults,
  locationId,
  submitLabel,
  cancelHref,
  showActive,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults: LocationDefaults;
  locationId?: string;
  submitLabel: string;
  cancelHref: string;
  showActive: boolean;
}) {
  const t = await getTranslations('locations.form');
  const tTypes = await getTranslations('locations.types');

  return (
    <form action={action} className="mt-6 max-w-2xl space-y-4">
      {locationId ? <input type="hidden" name="locationId" value={locationId} /> : null}

      <label className="block">
        <span className={LABEL}>{t('name')}</span>
        <input name="name" required defaultValue={defaults.name ?? ''} className={INPUT} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>{t('type')}</span>
          <select name="type" defaultValue={defaults.type ?? 'site'} className={INPUT}>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>{t('address')}</span>
          <input name="address" defaultValue={defaults.address ?? ''} className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>{t('latitude')}</span>
          <input
            name="latitude"
            inputMode="decimal"
            defaultValue={defaults.latitude ?? ''}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('longitude')}</span>
          <input
            name="longitude"
            inputMode="decimal"
            defaultValue={defaults.longitude ?? ''}
            className={INPUT}
          />
        </label>
      </div>
      <p className="text-xs text-steel">{t('coordsHint')}</p>

      {showActive ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={defaults.is_active ?? true}
            className="size-4"
          />
          <span className="text-sm font-medium">{t('active')}</span>
        </label>
      ) : null}

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
