// Investigations: one card per PSI investigation, a timeline and a coverage matrix. Cards can be
// ordered by reproducible measures and filtered; every view state lives in the URL.
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, ErrorNote, Loading, PageHeader } from "../components/Common";
import { Pressure, Value } from "../components/Value";
import { useData } from "../lib/data";
import { doiUrl } from "../lib/format";
import type { Val } from "../lib/types";
import { InvestigationsCoveragePanel } from "../charts/investigationsCoverage";
import {
  filterInvestigations,
  MAX_COMPARE,
  MIN_COMPARE,
  SORT_LABEL,
  type SortKey,
  sortInvestigations,
  type TableFilter,
  useInvestigationsState,
} from "../charts/investigationsQuery";
import {
  COVERAGE_KEYS,
  COVERAGE_LABEL,
  CoverageChip,
  coverageState,
  INV_CLASS_LABEL,
  INV_CLASSES,
  InvMarker,
  type InvRecord,
  type InvestigationsFile,
  type QualityFile,
  invClass,
  hasRawPublications,
  invName,
  labelEntries,
  metadataFlags,
  MetaFlagBadges,
  type MetaFlag,
  prefersReducedMotion,
  QualityLink,
  SourcedText,
  type StatRange,
} from "../charts/investigationsShared";
import { InvestigationsTimelinePanel } from "../charts/investigationsTimeline";

export default function Investigations() {
  const inv = useData<InvestigationsFile>("investigations.json");
  const quality = useData<QualityFile>("quality_report.json");
  const st = useInvestigationsState();

  const all = useMemo(() => inv.data?.investigations ?? [], [inv.data]);
  const visible = useMemo(
    () => sortInvestigations(filterInvestigations(all, st.classes, st.table), st.sort, st.dir),
    [all, st.classes, st.table, st.sort, st.dir],
  );
  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all]);
  const openHidden = !!st.openId && byId.has(st.openId) && !visible.some((r) => r.id === st.openId);

  // ?open=<id>: scroll to the card and move focus to it once it is on the page.
  useEffect(() => {
    if (!st.openId || !inv.data) return;
    const el = document.getElementById(`inv-${st.openId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, [st.openId, inv.data]);

  if (inv.error) return <ErrorNote error={inv.error} />;
  if (!inv.data) return <Loading what="investigations" />;

  const summary = quality.data?.summary as Record<string, Val<number>> | undefined;
  const flags = quality.data?.flags;
  const filtered = st.classes.size > 0 || st.table !== "all";

  return (
    <div className="pb-24">
      <PageHeader
        title="Investigations"
        lead={
          <>
            Every investigation in the PSI combustion harvest, summarised from its PSI page and experiment table.
            Cards can be ordered by reproducible measures only: number of tests, variables recorded, start date or acronym.
            An order is a sort, not a score, and says nothing about which atmosphere to choose.
          </>
        }
      >
        {summary && (
          <p className="mt-2 text-sm text-ink-2">
            <Value val={summary.investigations_total} /> in the harvest. <Value val={summary.investigations_with_tables} /> have a PSI experiment table;
            together the tables hold <Value val={summary.tests} />. Ground and modelling studies have no table and are listed so the record is complete.
          </p>
        )}
      </PageHeader>

      <Controls st={st} />

      {openHidden && (
        <p className="mb-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm" role="status">
          <span className="mono">{st.openId}</span> is hidden by the current filters.{" "}
          <button type="button" className="text-accent underline" onClick={st.resetFilters}>Clear filters</button>
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <InvestigationsTimelinePanel items={visible} openId={st.openId} onOpen={st.setOpen} />
        <InvestigationsCoveragePanel items={visible} openId={st.openId} onOpen={st.setOpen} />
      </div>

      <section aria-labelledby="inv-cards-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="inv-cards-h" className="text-lg font-semibold">
            Investigation cards
            <span className="ml-2 text-sm font-normal text-ink-3">
              ordered by {SORT_LABEL[st.sort].toLowerCase()}, {st.dir === "asc" ? "ascending" : "descending"}
              {filtered ? ", filtered" : ""}
            </span>
          </h2>
          <p className="text-xs text-ink-3">Tick {MIN_COMPARE} to {MAX_COMPARE} cards to compare them side by side.</p>
        </div>
        {visible.length === 0 ? (
          <p className="card p-6 text-sm text-ink-3">No investigations match the current filters.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {visible.map((r) => (
              <li key={r.id} className="min-w-0">
                <InvCard
                  r={r}
                  isOpen={st.openId === r.id}
                  selected={st.selected.includes(r.id)}
                  canSelect={st.selected.length < MAX_COMPARE}
                  onToggleSelect={() => st.toggleSelected(r.id)}
                  meta={metadataFlags(flags, r.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {st.selected.length > 0 && <CompareBar ids={st.selected} byId={byId} onRemove={st.toggleSelected} onClear={st.clearSelected} />}
    </div>
  );
}

function Controls({ st }: { st: ReturnType<typeof useInvestigationsState> }) {
  const sortId = useId();
  return (
    <section aria-label="Filter and order the investigations" className="card mb-5 flex flex-wrap items-end gap-x-6 gap-y-3 p-3">
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-3">Fuel class</legend>
        <div className="flex flex-wrap gap-1.5">
          {INV_CLASSES.map((c) => {
            const on = st.classes.has(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => st.toggleClass(c)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-accent bg-surface-3 font-medium text-ink" : "border-line text-ink-2 hover:bg-surface-3"}`}
              >
                <InvMarker c={c} /> {INV_CLASS_LABEL[c]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-3">Experiment table</legend>
        <div className="flex overflow-hidden rounded border border-line text-xs" role="group">
          {([["all", "All"], ["yes", "With table"], ["no", "Without table"]] as [TableFilter, string][]).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={st.table === k} onClick={() => st.setTable(k)} className={`px-2.5 py-1 ${st.table === k ? "bg-surface-3 font-medium" : "hover:bg-surface-3"}`}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={sortId} className="mb-1 block text-xs font-medium text-ink-3">Order by</label>
        <div className="flex gap-1.5">
          <select id={sortId} value={st.sort} onChange={(e) => st.setSort(e.target.value as SortKey)} className="rounded border border-line bg-surface-2 px-2 py-1 text-xs text-ink">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
          <button type="button" onClick={st.toggleDir} className="rounded border border-line px-2 py-1 text-xs hover:bg-surface-3" aria-label={`Direction: ${st.dir === "asc" ? "ascending" : "descending"}. Change`}>
            {st.dir === "asc" ? "Ascending" : "Descending"}
          </button>
        </div>
      </div>
      {(st.classes.size > 0 || st.table !== "all") && (
        <button type="button" onClick={st.resetFilters} className="text-xs text-accent underline underline-offset-2">Clear filters</button>
      )}
    </section>
  );
}

function NotRecorded({ children = "not recorded" }: { children?: React.ReactNode }) {
  return <span className="hatch-bg inline-block rounded border border-line px-1 text-xs"><span className="rounded-sm bg-surface-2 px-0.5 italic text-ink-2">{children}</span></span>;
}

function RangeLine({ label, range, kpa, hasColumn }: { label: string; range: StatRange; kpa?: StatRange; hasColumn: boolean }) {
  const has = range.min && range.max && range.min.v !== null && range.max.v !== null;
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5 text-sm">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">
        {has ? (
          <>
            {kpa ? (
              <><Pressure psi={range.min} kpa={kpa.min} /> to <Pressure psi={range.max} kpa={kpa.max} /></>
            ) : (
              <><Value val={range.min} /> to <Value val={range.max} /></>
            )}
            <span className="ml-1 text-xs text-ink-3">(in <Value val={range.recorded} />)</span>
          </>
        ) : (
          <NotRecorded>{hasColumn ? "column in table, no usable values" : "not recorded"}</NotRecorded>
        )}
      </dd>
    </div>
  );
}

function LabelList({ title, entries }: { title: string; entries: ReturnType<typeof labelEntries> }) {
  const [all, setAll] = useState(false);
  const LIMIT = 5;
  if (!entries.length) return null;
  const shown = all ? entries : entries.slice(0, LIMIT);
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium text-ink-3">{title}</h4>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((e) => (
          <li key={e.label} className="max-w-full rounded border border-line bg-surface px-1.5 py-0.5 text-xs">
            <span className="break-words">{e.label}</span> <span className="text-ink-3"><Value val={e.val} /></span>
          </li>
        ))}
        {entries.length > LIMIT && (
          <li>
            <button type="button" className="px-1 text-xs text-accent underline underline-offset-2" aria-expanded={all} onClick={() => setAll((a) => !a)}>
              {all ? "Show fewer" : "Show all"}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

interface CardProps {
  r: InvRecord;
  isOpen: boolean;
  selected: boolean;
  canSelect: boolean;
  onToggleSelect: () => void;
  meta: MetaFlag[];
}

function InvCard({ r, isOpen, selected, canSelect, onToggleSelect, meta }: CardProps) {
  const [expanded, setExpanded] = useState(isOpen);
  useEffect(() => {
    if (isOpen) setExpanded(true);
  }, [isOpen]);
  const c = invClass(r);
  const s = r.stats;
  const headId = `inv-${r.id}-h`;
  const objId = `inv-${r.id}-obj`;
  const doi = r.doi?.v;
  const fuels = labelEntries(s?.fuel_counts);
  const mats = labelEntries(s?.material_counts);

  return (
    <article
      id={`inv-${r.id}`}
      tabIndex={-1}
      aria-labelledby={headId}
      className={`card flex h-full scroll-mt-24 flex-col gap-3 p-4 ${isOpen ? "ring-2 ring-accent" : ""}`}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <InvMarker c={c} size={14} outlined={!r.has_table} />
            <h3 id={headId} className="text-base font-semibold leading-tight">{r.acronym?.v ?? r.title?.v ?? r.id}</h3>
            <span className="mono text-xs text-ink-3">{r.id}</span>
          </div>
          {r.acronym?.v && r.title?.v && <p className="mt-0.5 text-sm text-ink-2">{r.title.v}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge>{INV_CLASS_LABEL[c]}</Badge>
            {r.project_type?.v && <Badge>{r.project_type.v}</Badge>}
            {!r.has_table && <Badge>No experiment table</Badge>}
          </div>
        </div>
        <label className={`flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-xs ${selected ? "border-accent text-ink" : "border-line text-ink-2"} ${!selected && !canSelect ? "opacity-60" : "cursor-pointer hover:bg-surface-3"}`}>
          <input type="checkbox" checked={selected} disabled={!selected && !canSelect} onChange={onToggleSelect} aria-describedby={headId} />
          Compare
        </label>
      </header>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-ink-3">DOI</dt>
          <dd className="truncate">
            {doi ? <a className="mono text-xs underline underline-offset-2" href={doiUrl(doi)} target="_blank" rel="noreferrer">{doi}</a> : <span className="text-xs italic text-ink-3">no DOI on the PSI page</span>}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-ink-3">Licence</dt>
          <dd className="text-xs"><Value val={r.licence} /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-ink-3">Flight platform</dt>
          <dd className="text-xs"><Value val={r.flight_platform} /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-ink-3">Dates (as published)</dt>
          <dd className="text-xs"><Value val={r.start_date} /> to <Value val={r.end_date} /></dd>
        </div>
      </dl>

      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-xs font-medium text-ink-3">Tests in the PSI table</h4>
          {s ? <span className="text-sm font-semibold"><Value val={s.n_tests} /></span> : <NotRecorded>no tests recorded (no experiment table)</NotRecorded>}
        </div>
        {s && (
          <dl>
            <RangeLine label="O2" range={s.o2_pct} hasColumn={r.coverage?.o2_pct === true} />
            <RangeLine label="Pressure" range={s.pressure_psi} kpa={s.pressure_kpa} hasColumn={r.coverage?.pressure_kpa === true} />
            <RangeLine label="Flow" range={s.flow_cm_s} hasColumn={r.coverage?.flow_cm_s === true} />
          </dl>
        )}
        {s && s.o2_pct.min && (
          <p className="mt-1 text-xs leading-snug text-ink-3">
            Lowest to highest value in the table. The O2 range covers whichever basis the table records (chamber initial, ambient or, for inverse flames, the oxidiser stream) and can mix them; Evidence gives the basis of each test.
          </p>
        )}
      </div>

      {(fuels.length > 0 || mats.length > 0) && (
        <div className="flex flex-col gap-2">
          <LabelList title="Fuels (as written in the table)" entries={fuels} />
          <LabelList title="Materials (as written in the table)" entries={mats} />
        </div>
      )}

      <div>
        <h4 className="mb-1 text-xs font-medium text-ink-3">Variables in the table</h4>
        <ul className="flex flex-wrap gap-1" aria-label="Variables recorded">
          {COVERAGE_KEYS.map((k) => (
            <li key={k}><CoverageChip state={coverageState(r, k)} label={COVERAGE_LABEL[k]} /></li>
          ))}
        </ul>
      </div>

      <div>
        <button type="button" className="text-sm font-medium text-accent underline-offset-2 hover:underline" aria-expanded={expanded} aria-controls={objId} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Hide objectives" : "Show objectives"}
        </button>
        {expanded && (
          <div id={objId} className="mt-2">
            <SourcedText val={r.objectives} />
          </div>
        )}
      </div>

      <footer className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
        <MetaFlagBadges flags={meta} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {r.has_table && <QualityLink id={r.id} />}
          <span className="text-ink-2">
            Publications:{" "}
            <Value val={r.publication_count} emptyText={hasRawPublications(r) ? "listed as text on the PSI page, not counted" : "none listed"} />
          </span>
          {r.psi_url?.v && <a className="text-accent underline underline-offset-2" href={r.psi_url.v} target="_blank" rel="noreferrer">PSI page</a>}
          <Link className="text-accent underline underline-offset-2" to={`/investigations/compare?ids=${r.id}`}>Compare with others</Link>
        </div>
      </footer>
    </article>
  );
}

function CompareBar({ ids, byId, onRemove, onClear }: { ids: string[]; byId: Map<string, InvRecord>; onRemove: (id: string) => void; onClear: () => void }) {
  const ready = ids.length >= MIN_COMPARE;
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-2 shadow-floating" role="region" aria-label="Investigations picked for comparison">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="text-xs text-ink-3">Compare:</span>
        <ul className="flex flex-1 flex-wrap gap-1.5">
          {ids.map((id) => {
            const r = byId.get(id);
            return (
              <li key={id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs">
                {r && <InvMarker c={invClass(r)} size={11} outlined={!r.has_table} />}
                {r ? invName(r) : id}
                <button type="button" className="ml-0.5 rounded px-1 text-ink-3 hover:text-ink" aria-label={`Remove ${r ? invName(r) : id} from comparison`} onClick={() => onRemove(id)}>
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
        {!ready && <span className="text-xs text-ink-3">Pick at least {MIN_COMPARE}.</span>}
        <button type="button" className="text-xs text-ink-3 underline underline-offset-2 hover:text-ink" onClick={onClear}>Clear</button>
        {ready ? (
          <Link to={`/investigations/compare?ids=${ids.join(",")}`} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90">
            Compare
          </Link>
        ) : (
          <span aria-disabled="true" className="cursor-not-allowed rounded bg-surface-3 px-3 py-1.5 text-sm font-medium text-ink-3">Compare</span>
        )}
      </div>
    </div>
  );
}
