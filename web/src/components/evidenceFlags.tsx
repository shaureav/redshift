// Every data-quality flag from the pipeline, searchable and filterable, with deep links. ?flag=
// highlights one flag and turns to its page; ?inv=, ?code=, ?sev= and ?fq= filter the list.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { flagMatches, parseFlagFilters, writeFlagFilters, type FlagFilters } from "../lib/filters";
import type { FlagEntry } from "../lib/types";
import { SeverityBadge, type FlagDefinition } from "./evidenceShared";

const PAGE = 25;
const MAX_CHIPS = 8;
const MAX_LINES = 24;

const control = "rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink";
const labelCls = "flex flex-col gap-1 text-xs text-ink-2";

function evidenceLink(ids: string[]): string {
  return `/evidence?ids=${encodeURIComponent(ids.join(","))}`;
}

function Lines({ rows }: { rows: number[] }) {
  if (!rows.length) return <span className="text-ink-3">whole file or page</span>;
  const text = rows.join(", ");
  if (rows.length <= MAX_LINES) return <span className="mono">{text}</span>;
  return (
    <details>
      <summary className="cursor-pointer text-ink-2">
        <span className="mono">{rows.slice(0, MAX_LINES).join(", ")}</span> and more (show all)
      </summary>
      <p className="mono mt-1 max-h-40 overflow-auto break-words">{text}</p>
    </details>
  );
}

function FlagCard({ fl, highlighted, invName }: { fl: FlagEntry; highlighted: boolean; invName?: string }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!highlighted || !ref.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    ref.current.focus({ preventScroll: true });
  }, [highlighted]);
  return (
    <li
      ref={ref}
      id={`flag-${fl.id}`}
      tabIndex={-1}
      aria-current={highlighted ? "true" : undefined}
      className={`rounded-lg border bg-surface-2 p-3 ${highlighted ? "border-accent ring-2 ring-accent" : "border-line"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/quality?flag=${encodeURIComponent(fl.id)}#flags`} className="mono text-sm font-semibold underline-offset-2 hover:underline" aria-label={`Link to flag ${fl.id}`}>
          {fl.id}
        </Link>
        <SeverityBadge severity={fl.severity} />
        <span className="font-medium">{fl.title}</span>
        <span className="mono text-xs text-ink-3">{fl.code}</span>
        <span className="ml-auto text-xs text-ink-2">
          <Link className="underline" to={`/investigations?open=${encodeURIComponent(fl.investigation_id)}`}>{invName ?? fl.investigation_id}</Link>{" "}
          <span className="mono text-ink-3">{fl.investigation_id}</span>
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[7rem_1fr]">
        <dt className="text-ink-3">File</dt>
        <dd className="mono break-all" title={fl.file ?? undefined}>{fl.file ?? <span className="text-ink-3">not file specific</span>}</dd>
        <dt className="text-ink-3">Lines</dt>
        <dd><Lines rows={fl.rows} /></dd>
        <dt className="text-ink-3">Column</dt>
        <dd className="mono break-words">{fl.column ?? <span className="font-sans text-ink-3">not column specific</span>}</dd>
        <dt className="text-ink-3">Raw value</dt>
        <dd className="mono whitespace-pre-wrap break-all">
          {fl.raw === null ? <span className="font-sans text-ink-3">none</span> : fl.raw === "" ? <span className="font-sans italic text-ink-3">empty cell</span> : `"${fl.raw}"`}
        </dd>
        <dt className="text-ink-3">Detail</dt>
        <dd className="text-ink">{fl.detail}</dd>
        <dt className="text-ink-3">Action</dt>
        <dd className="text-ink-2">{fl.action}</dd>
        <dt className="text-ink-3">Affected tests</dt>
        <dd>
          {fl.test_ids.length === 0 ? (
            <span className="text-ink-3">No individual test rows (applies to the file, column or investigation page).</span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {fl.test_ids.slice(0, MAX_CHIPS).map((t) => (
                <Link key={t} className="mono text-accent underline underline-offset-2 hover:no-underline" to={evidenceLink([t])}>{t}</Link>
              ))}
              {fl.test_ids.length > MAX_CHIPS && <span className="text-ink-3">and more</span>}
              {fl.test_ids.length > 1 && (
                <Link className="rounded border border-line px-2 py-0.5 hover:bg-surface-3" to={evidenceLink(fl.test_ids)}>
                  Open all affected tests in the Evidence Explorer
                </Link>
              )}
            </span>
          )}
        </dd>
      </dl>
    </li>
  );
}

interface FlagListProps {
  flags: FlagEntry[];
  definitions: Record<string, FlagDefinition>;
  invNames: Map<string, string>;
}

export function EvidenceFlagList({ flags, definitions, invNames }: FlagListProps) {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => parseFlagFilters(sp), [sp]);
  const highlight = sp.get("flag");
  const pageParam = Math.max(1, Number.parseInt(sp.get("fpage") ?? "1", 10) || 1);
  const [q, setQ] = useState(filters.q);
  const lastQ = useRef(filters.q);

  const setFilters = useCallback(
    (f: FlagFilters) => setSp((prev) => writeFlagFilters(f, prev), { replace: true }),
    [setSp],
  );

  useEffect(() => {
    if (filters.q !== lastQ.current) {
      lastQ.current = filters.q;
      setQ(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    if (q === lastQ.current) return;
    const t = setTimeout(() => {
      lastQ.current = q;
      setFilters({ ...filters, q });
    }, 220);
    return () => clearTimeout(t);
  }, [q, filters, setFilters]);

  const shown = useMemo(() => flags.filter((f) => flagMatches(f, filters)), [flags, filters]);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE));
  const highlightIndex = highlight ? shown.findIndex((f) => f.id === highlight) : -1;
  // A highlighted flag opens on its own page unless the reader has turned the page since.
  const page = sp.has("fpage") || highlightIndex < 0 ? Math.min(pageParam, pageCount) - 1 : Math.floor(highlightIndex / PAGE);
  const pageItems = shown.slice(page * PAGE, page * PAGE + PAGE);
  const highlightKnown = highlight ? flags.some((f) => f.id === highlight) : false;

  const setPage = (i: number) =>
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (i > 0) next.set("fpage", String(i + 1));
      else next.set("fpage", "1");
      return next;
    }, { replace: true });

  const codes = useMemo(() => {
    const present = new Set(flags.map((f) => f.code));
    return [...present].sort((a, b) => (definitions[a]?.title ?? a).localeCompare(definitions[b]?.title ?? b, "en-GB"));
  }, [flags, definitions]);
  const invs = useMemo(() => [...new Set(flags.map((f) => f.investigation_id))].sort((a, b) => (invNames.get(a) ?? a).localeCompare(invNames.get(b) ?? b, "en-GB")), [flags, invNames]);
  const def = filters.code ? definitions[filters.code] : undefined;
  const active = filters.q || filters.code || filters.sev || filters.inv;
  const btn = "rounded border border-line px-2.5 py-1 hover:bg-surface-3 disabled:opacity-40";

  return (
    <div>
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,2fr)_repeat(3,minmax(10rem,1fr))]">
        <label className={labelCls}>
          Search flags
          <input type="search" className={control} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Flag id, file, column, raw value, test id" />
        </label>
        <label className={labelCls}>
          Flag type
          <select className={control} value={filters.code} onChange={(e) => setFilters({ ...filters, code: e.target.value })}>
            <option value="">All types</option>
            {codes.map((c) => <option key={c} value={c}>{definitions[c]?.title ?? c} ({c})</option>)}
          </select>
        </label>
        <label className={labelCls}>
          Severity
          <select className={control} value={filters.sev} onChange={(e) => setFilters({ ...filters, sev: e.target.value })}>
            <option value="">All severities</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className={labelCls}>
          Investigation
          <select className={control} value={filters.inv} onChange={(e) => setFilters({ ...filters, inv: e.target.value })}>
            <option value="">All investigations</option>
            {invs.map((i) => <option key={i} value={i}>{invNames.get(i) ?? i} ({i})</option>)}
          </select>
        </label>
        {(def || active) && (
          <div className="flex flex-wrap items-start justify-between gap-2 text-xs sm:col-span-2 lg:col-span-4">
            {def ? <p className="max-w-3xl text-ink-2"><span className="font-medium text-ink">{def.title}.</span> {def.description}</p> : <span />}
            {active && (
              <button type="button" className="underline" onClick={() => { setQ(""); lastQ.current = ""; setFilters({ q: "", code: "", sev: "", inv: "" }); }}>
                Clear flag filters
              </button>
            )}
          </div>
        )}
      </div>

      {highlight && !highlightKnown && (
        <p role="status" className="mt-3 rounded-md border border-line bg-surface-2 p-3 text-sm">
          No flag with id <span className="mono">{highlight}</span> in this snapshot.
        </p>
      )}
      {highlight && highlightKnown && highlightIndex < 0 && (
        <p role="status" className="mt-3 rounded-md border border-accent bg-surface-2 p-3 text-sm">
          The linked flag <span className="mono">{highlight}</span> is hidden by the current filters.{" "}
          <button type="button" className="underline" onClick={() => { setQ(""); lastQ.current = ""; setFilters({ q: "", code: "", sev: "", inv: "" }); }}>
            Clear filters to show it
          </button>
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-3 rounded-md border border-line bg-surface-2 p-4 text-sm text-ink-2">No flags match these filters.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2" aria-label="Data quality flags">
          {pageItems.map((f) => (
            <FlagCard key={f.id} fl={f} highlighted={f.id === highlight} invName={invNames.get(f.investigation_id)} />
          ))}
        </ol>
      )}

      <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2" aria-label="Flag pages">
        <span>Page <span className="num">{page + 1}</span> of <span className="num">{pageCount}</span>, 25 flags per page</span>
        <span className="flex gap-1.5">
          <button type="button" className={btn} disabled={page === 0} onClick={() => setPage(0)}>First</button>
          <button type="button" className={btn} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <button type="button" className={btn} disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</button>
          <button type="button" className={btn} disabled={page >= pageCount - 1} onClick={() => setPage(pageCount - 1)}>Last</button>
        </span>
      </nav>
    </div>
  );
}
