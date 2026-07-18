'use client';

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-11 rounded-button bg-ink px-6 text-sm font-semibold text-paper hover:bg-panel print:hidden"
    >
      {label}
    </button>
  );
}
