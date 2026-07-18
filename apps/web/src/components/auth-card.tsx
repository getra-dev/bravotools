import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

export async function AuthCard({
  title,
  children,
  notice,
  error,
}: {
  title: string;
  children: ReactNode;
  notice?: string;
  error?: string;
}) {
  const t = await getTranslations('common');
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-center font-mono text-xs uppercase tracking-[1.5px] text-dim">
          {t('appName')}
        </p>
        <div className="mt-4 rounded-card border border-line/30 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
          {notice ? (
            <p className="mt-3 rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ink">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm text-ink">
              {error}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </main>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-dim">{label}</span>
      <input
        className="mt-1 block h-11 w-full rounded-button border border-line/40 bg-paper px-3 text-sm outline-none focus:border-ink"
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
      />
    </label>
  );
}

export function PrimaryButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="h-11 w-full rounded-button bg-ink text-sm font-semibold text-paper hover:bg-panel"
    >
      {children}
    </button>
  );
}
