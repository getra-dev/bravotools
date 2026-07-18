import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations();

  const rows = [
    { label: t('web.home.database'), detail: t('web.home.databaseDetail'), up: true },
    { label: t('web.home.web'), detail: t('web.home.webDetail'), up: true },
    { label: t('web.home.mobile'), detail: t('web.home.mobileDetail'), up: false },
  ];

  return (
    <main className="mx-auto max-w-3xl px-xl py-xxl">
      <header className="border-b border-line/30 pb-lg">
        <p className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
          {t('common.appName')}
        </p>
        <h1 className="mt-sm text-3xl font-extrabold tracking-tight">{t('web.home.title')}</h1>
        <p className="mt-xs text-sm text-dim">{t('web.home.subtitle')}</p>
      </header>

      <section className="mt-xl">
        <h2 className="font-mono text-xs uppercase tracking-[1.5px] text-dim">
          {t('web.home.stackHeading')}
        </h2>
        <ul className="mt-md divide-y divide-line/20 rounded-card border border-line/30 bg-white">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-lg px-lg py-md">
              <span
                className={`size-2 shrink-0 rounded-full ${row.up ? 'bg-ok' : 'bg-dim'}`}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{row.label}</p>
                <p className="truncate text-xs text-dim">{row.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-lg text-xs text-steel">{t('web.home.nextSteps')}</p>
      </section>
    </main>
  );
}
