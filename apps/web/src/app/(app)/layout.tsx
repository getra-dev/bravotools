import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionContext } from '@/lib/org';
import { signOut, switchOrg } from '@/lib/actions';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!ctx.activeOrg) redirect('/onboarding');

  const t = await getTranslations();

  const nav = [
    { href: '/', label: t('nav.overview') },
    { href: '/tools', label: t('nav.tools') },
    { href: '/locations', label: t('nav.locations') },
    { href: '/requests', label: t('nav.requests') },
    { href: '/orders', label: t('nav.orders') },
    { href: '/inventory', label: t('inventory.title') },
    { href: '/history', label: t('history.title') },
    { href: '/map', label: t('nav.map') },
    { href: '/settings/members', label: t('nav.members') },
  ];

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line/30 bg-white print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <span className="font-mono text-xs uppercase tracking-[1.5px] text-ink">
            {t('common.appName')}
          </span>
          <nav className="flex items-center gap-4 text-sm font-medium">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-ink hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {ctx.memberships.length > 1 ? (
              <form action={switchOrg} className="flex items-center gap-1">
                <label className="sr-only" htmlFor="org-switcher">
                  {t('org.switcherLabel')}
                </label>
                <select
                  id="org-switcher"
                  name="orgId"
                  defaultValue={ctx.activeOrg.orgId}
                  className="h-8 rounded-button-sm border border-line/40 bg-paper px-2 text-xs"
                >
                  {ctx.memberships.map((m) => (
                    <option key={m.orgId} value={m.orgId}>
                      {m.orgName}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="h-8 rounded-button-sm border border-line/40 px-2 text-xs font-semibold hover:bg-paper"
                >
                  {t('org.switchAction')}
                </button>
              </form>
            ) : (
              <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">
                {ctx.activeOrg.orgName}
              </span>
            )}
            <span className="hidden text-xs text-dim sm:block">{ctx.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="h-8 rounded-button-sm border border-line/40 px-3 text-xs font-semibold hover:bg-paper"
              >
                {t('auth.signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
