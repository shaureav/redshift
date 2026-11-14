// Controls for the Evidence Explorer: filter bar, column visibility menu and pager.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EMPTY_FILTERS, hasActiveFilters, type EvidenceFilters } from "../lib/filters";
import { FUEL_LABEL } from "../lib/format";
import { FuelMarker } from "./Common";

const control = "rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink";
const labelCls = "flex flex-col gap-1 text-xs text-ink-2";

// Text input that writes to the URL a moment after typing stops, and follows the URL when it changes.
function SearchBox({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (text === last.current) return;
    const t = setTimeout(() => {
      last.current = text;
      onCommit(text);
    }, 220);
    return () => clearTimeout(t);
  }, [text, onCommit]);
  return (
    <input
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Test id, fuel, material, outcome, raw text, flag id"
      className={`${control} w-full`}
    />
  );
}

interface FilterBarProps {
  filters: EvidenceFilters;
  onChange: (f: EvidenceFilters) => void;
  investigations: [string, string][];
  kinds: string[];
  fuels: string[];
}

export function EvidenceFilterBar({ filters, onChange, investigations, kinds, fuels }: FilterBarProps) {
  const set = (over: Partial<EvidenceFilters>) => onChange({ ...filters, ...over });
  const invValue = filters.inv.length === 0 ? "" : filters.inv.length === 1 ? filters.inv[0] : "__several";
  const kindValue = filters.kind.length === 0 ? "" : filters.kind.length === 1 ? filters.kind[0] : "__several";
  const commitSearch = useCallback((q: string) => onChange({ ...filters, q }), [filters, onChange]);

  return (
    <section className="card p-4" aria-label="Filter tests">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,2fr)_repeat(4,minmax(9rem,1fr))]">
        <label className={labelCls}>
          Search all fields
          <SearchBox value={filters.q} onCommit={commitSearch} />
        </label>
        <label className={labelCls}>
          Investigation
          <select className={control} value={invValue} onChange={(e) => set({ inv: e.target.value ? [e.target.value] : [] })}>
            <option value="">All investigations</option>
            {invValue === "__several" && <option value="__several">Several (from link)</option>}
            {investigations.map(([id, name]) => (
              <option key={id} value={id}>{name} ({id})</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Test kind
          <select className={control} value={kindValue} onChange={(e) => set({ kind: e.target.value ? [e.target.value] : [] })}>
            <option value="">All kinds</option>
            {kindValue === "__several" && <option value="__several">Several (from link)</option>}
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          Data quality flags
          <select className={control} value={filters.flagged} onChange={(e) => set({ flagged: e.target.value as EvidenceFilters["flagged"] })}>
            <option value="all">Flagged and unflagged</option>
            <option value="flagged">Flagged rows only</option>
            <option value="unflagged">Unflagged rows only</option>
          </select>
        </label>
        <label className={labelCls}>
          Pressure
          <select className={control} value={filters.pressure} onChange={(e) => set({ pressure: e.target.value as EvidenceFilters["pressure"] })}>
            <option value="all">Recorded or not</option>
            <option value="recorded">Pressure recorded</option>
            <option value="not_recorded">Pressure not recorded</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby="ev-fuel-label">
          <span id="ev-fuel-label" className="mr-1 text-xs text-ink-2">Fuel class</span>
          {fuels.map((f) => {
            const on = filters.fuel.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => set({ fuel: on ? filters.fuel.filter((x) => x !== f) : [...filters.fuel, f] })}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  on ? "border-accent bg-surface-3 font-medium text-ink" : "border-line text-ink-2 hover:bg-surface-3"
                }`}
              >
                <FuelMarker fuel={f} outlined={!on && filters.fuel.length > 0} /> {FUEL_LABEL[f] ?? f}
              </button>
            );
          })}
        </div>
        {filters.ids && (
          <span className="flex items-center gap-2 rounded-full border border-accent px-2.5 py-1 text-xs">
            Restricted to the tests in a link
            <button type="button" className="underline" onClick={() => set({ ids: null })}>Show all tests</button>
          </span>
        )}
        {hasActiveFilters(filters) && (
          <button type="button" className="text-xs text-ink-2 underline hover:text-ink" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear all filters
          </button>
        )}
      </div>
    </section>
  );
}

interface ColumnChoice {
  id: string;
  label: string;
  canHide: boolean;
  visible: boolean;
}

export function EvidenceColumnMenu({ columns, onChange, defaults }: { columns: ColumnChoice[]; onChange: (ids: string[] | null) => void; defaults: string[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panelId = useId();
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const visibleIds = columns.filter((c) => c.visible).map((c) => c.id);
  const toggle = (id: string) => {
    const next = visibleIds.includes(id) ? visibleIds.filter((x) => x !== id) : columns.filter((c) => c.visible || c.id === id).map((c) => c.id);
    const isDefault = next.length === defaults.length && next.every((x) => defaults.includes(x));
    onChange(isDefault ? null : next);
  };
  return (
    <details ref={ref} className="relative">
      <summary className="cursor-pointer list-none rounded border border-line px-2.5 py-1.5 hover:bg-surface-3" aria-controls={panelId}>
        Columns
      </summary>
      <div id={panelId} className="absolute right-0 z-30 mt-1 max-h-[60vh] w-64 max-w-[85vw] overflow-auto rounded-lg border border-line bg-surface-2 p-3 shadow-xl">
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">Visible columns</legend>
          <ul className="flex flex-col gap-1 text-sm">
            {columns.map((c) => (
              <li key={c.id}>
                <label className={`flex items-center gap-2 ${c.canHide ? "" : "text-ink-3"}`}>
                  <input type="checkbox" checked={c.visible} disabled={!c.canHide} onChange={() => toggle(c.id)} />
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="mt-2 flex gap-3 border-t border-line pt-2 text-xs">
          <button type="button" className="underline" onClick={() => onChange(null)}>Default set</button>
          <button type="button" className="underline" onClick={() => onChange(columns.map((c) => c.id))}>Show all</button>
        </div>
      </div>
    </details>
  );
}

export function EvidencePager({ pageIndex, pageCount, onPage }: { pageIndex: number; pageCount: number; onPage: (i: number) => void }) {
  const btn = "rounded border border-line px-2.5 py-1 hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-ink-2" aria-label="Table pages">
      <span>Page <span className="num">{pageIndex + 1}</span> of <span className="num">{pageCount}</span>, 50 rows per page</span>
      <span className="flex gap-1.5">
        <button type="button" className={btn} disabled={pageIndex === 0} onClick={() => onPage(0)}>First</button>
        <button type="button" className={btn} disabled={pageIndex === 0} onClick={() => onPage(pageIndex - 1)}>Previous</button>
        <button type="button" className={btn} disabled={pageIndex >= pageCount - 1} onClick={() => onPage(pageIndex + 1)}>Next</button>
        <button type="button" className={btn} disabled={pageIndex >= pageCount - 1} onClick={() => onPage(pageCount - 1)}>Last</button>
      </span>
    </nav>
  );
}
