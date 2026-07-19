'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Option = { id: string; name: string };

// SPEC 2.8: keyboard-first dense table — Cmd+K jumps to search, filters
// live in the URL so any filter combination is shareable/bookmarkable
// (lightweight "saved filters").
export function ToolsFilters({
  locations,
  statuses,
  labels,
}: {
  locations: Option[];
  statuses: { value: string; label: string }[];
  labels: { search: string; allStatuses: string; allLocations: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={searchRef}
        type="search"
        defaultValue={searchParams.get('q') ?? ''}
        placeholder={labels.search}
        onChange={(event) => {
          const value = event.target.value;
          const timer = setTimeout(() => setParam('q', value), 300);
          return () => clearTimeout(timer);
        }}
        className="h-9 w-72 rounded-button-sm border border-line/40 bg-white px-3 text-sm outline-none focus:border-ink"
      />
      <select
        defaultValue={searchParams.get('status') ?? ''}
        onChange={(event) => setParam('status', event.target.value)}
        className="h-9 rounded-button-sm border border-line/40 bg-white px-2 text-sm"
      >
        <option value="">{labels.allStatuses}</option>
        {statuses.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
      <select
        defaultValue={searchParams.get('location') ?? ''}
        onChange={(event) => setParam('location', event.target.value)}
        className="h-9 rounded-button-sm border border-line/40 bg-white px-2 text-sm"
      >
        <option value="">{labels.allLocations}</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </div>
  );
}
