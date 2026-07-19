'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Option = { value: string; label: string };

export function HistoryFilters({
  actions,
  locations,
  people,
  labels,
}: {
  actions: Option[];
  locations: Option[];
  people: Option[];
  labels: { allActions: string; allLocations: string; allPeople: string; search: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    params.delete('notice');
    params.delete('error');
    router.replace(`${pathname}?${params.toString()}`);
  }

  const selectClass = 'h-9 rounded-button-sm border border-line/40 bg-white px-2 text-sm';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="month"
        defaultValue={searchParams.get('month') ?? ''}
        onChange={(event) => setParam('month', event.target.value)}
        className={selectClass}
      />
      <select
        defaultValue={searchParams.get('action') ?? ''}
        onChange={(event) => setParam('action', event.target.value)}
        className={selectClass}
      >
        <option value="">{labels.allActions}</option>
        {actions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        defaultValue={searchParams.get('location') ?? ''}
        onChange={(event) => setParam('location', event.target.value)}
        className={selectClass}
      >
        <option value="">{labels.allLocations}</option>
        {locations.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        defaultValue={searchParams.get('person') ?? ''}
        onChange={(event) => setParam('person', event.target.value)}
        className={selectClass}
      >
        <option value="">{labels.allPeople}</option>
        {people.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="search"
        defaultValue={searchParams.get('q') ?? ''}
        placeholder={labels.search}
        onChange={(event) => setParam('q', event.target.value)}
        className="h-9 w-56 rounded-button-sm border border-line/40 bg-white px-3 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}
