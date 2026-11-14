// Shared types, markers and small helpers for the Investigations and Compare screens.
// Nothing here produces a displayed number: counts and ranges come from the snapshot as {v,u,p}.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FUEL_COLOR_VAR, markerPath } from "../components/Common";
import { ProvDetails } from "../components/Value";
import { useProvenance } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import type { FlagEntry, Val } from "../lib/types";

export type CoverageKey = "o2_pct" | "pressure_kpa" | "co2_pct" | "he_pct" | "flow_cm_s" | "fuel" | "material" | "outcome_label";

export const CONDITION_KEYS: CoverageKey[] = ["o2_pct", "pressure_kpa", "co2_pct", "he_pct", "flow_cm_s"];
export const DESCRIPTOR_KEYS: CoverageKey[] = ["fuel", "material", "outcome_label"];
export const COVERAGE_KEYS: CoverageKey[] = [...CONDITION_KEYS, ...DESCRIPTOR_KEYS];

export const COVERAGE_LABEL: Record<CoverageKey, string> = {
  o2_pct: "O2",
  pressure_kpa: "Pressure",
  co2_pct: "CO2",
  he_pct: "He",
  flow_cm_s: "Flow",
  fuel: "Fuel",
  material: "Material",
  outcome_label: "Outcome",
};

export const COVERAGE_LONG: Record<CoverageKey, string> = {
  o2_pct: "Oxygen percentage",
  pressure_kpa: "Pressure",
  co2_pct: "Carbon dioxide percentage",
  he_pct: "Helium percentage",
  flow_cm_s: "Flow velocity",
  fuel: "Fuel named",
  material: "Material named",
  outcome_label: "Outcome label",
};

export interface StatRange {
  min: Val<number> | null;
  max: Val<number> | null;
  recorded: Val<number>;
}

export interface LabelCounts {
  labels: Record<string, number>;
  p: string;
}

export interface InvStats {
  n_tests: Val<number>;
  o2_pct: StatRange;
  pressure_kpa: StatRange;
  pressure_psi: StatRange;
  flow_cm_s: StatRange;
  co2_pct: StatRange;
  he_pct: StatRange;
  fuel_counts: LabelCounts;
  material_counts: LabelCounts;
  diluent_counts: LabelCounts;
  outcome_label_counts: LabelCounts;
  suppressant_counts: LabelCounts;
}

export interface Publication {
  authors: Val<string | null>;
  doi: Val<string | null>;
  title: Val<string | null>;
  line: number;
}

export type TextVal = Val<string | null>;

export interface InvRecord {
  id: string;
  acronym: TextVal;
  title: TextVal;
  proposal_title: TextVal;
  doi: TextVal;
  licence: TextVal;
  flight_platform: TextVal;
  start_date: TextVal;
  end_date: TextVal;
  objectives: TextVal;
  approach: TextVal;
  hypothesis: TextVal;
  hardware: TextVal;
  nasa_center: TextVal;
  project_type: TextVal;
  research_area: TextVal;
  psi_url: TextVal;
  fuel_class: Val<string>;
  has_table: boolean;
  in_harvest: boolean;
  coverage: Record<CoverageKey, boolean | null>;
  contacts: TextVal[] | null;
  publication_count: Val<number | null>;
  publications: Publication[];
  table_file_count: Val<number> | null;
  table_files: TextVal[];
  stats: InvStats | null;
}

export interface InvestigationsFile {
  investigations: InvRecord[];
  p: string;
}

export interface QualityFile {
  flags: FlagEntry[];
  summary: Record<string, Val<number> | Record<string, Val<number>>>;
}

export type InvClass = "gas" | "droplet" | "solid" | "emulator" | "none" | "model";
export const INV_CLASSES: InvClass[] = ["gas", "droplet", "solid", "emulator", "none", "model"];

export const INV_CLASS_LABEL: Record<InvClass, string> = {
  gas: FUEL_LABEL.gas,
  droplet: FUEL_LABEL.droplet,
  solid: FUEL_LABEL.solid,
  emulator: FUEL_LABEL.emulator,
  none: "Not a fuel (aerosol)",
  model: "Ground or modelling study",
};

export function invClass(r: InvRecord): InvClass {
  const v = r.fuel_class?.v;
  return (INV_CLASSES as string[]).includes(v) ? (v as InvClass) : "none";
}

export function invColor(c: InvClass): string {
  return c === "model" || c === "none" ? "var(--ink-3)" : FUEL_COLOR_VAR[c];
}

// Marker shape per class. The four fuel classes use the shared shapes; the two non-fuel classes get
// their own so that shape alone still separates every class.
export function invMarkerPath(c: InvClass, r: number): string {
  if (c === "model") {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `${r * 1.1 * Math.cos(a)},${r * 1.1 * Math.sin(a)}`;
    });
    return `M${pts.join(" L")} Z`;
  }
  if (c === "none") return `M${-r * 1.2},${-r * 0.5} H${r * 1.2} V${r * 0.5} H${-r * 1.2} Z`;
  return markerPath(c, r);
}

export function InvMarker({ c, size = 12, outlined = false, title }: { c: InvClass; size?: number; outlined?: boolean; title?: string }) {
  const r = size / 2 - 1.5;
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden={title ? undefined : true} role={title ? "img" : undefined} aria-label={title} className="inline-block shrink-0 align-[-2px]">
      <path d={invMarkerPath(c, r)} fill={outlined ? "none" : invColor(c)} stroke={invColor(c)} strokeWidth={outlined ? 1.75 : 1} />
    </svg>
  );
}

export function InvLegend({ classes = INV_CLASSES, showTable = true }: { classes?: InvClass[]; showTable?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      {classes.map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <InvMarker c={c} /> {INV_CLASS_LABEL[c]}
        </li>
      ))}
      {showTable && (
        <>
          <li className="flex items-center gap-1.5"><InvMarker c="solid" /> Filled: PSI experiment table</li>
          <li className="flex items-center gap-1.5"><InvMarker c="solid" outlined /> Outlined: no experiment table</li>
        </>
      )}
    </ul>
  );
}

// The display name: acronym when the PSI page gives one, else the title.
export function invName(r: InvRecord): string {
  return r.acronym?.v ?? r.title?.v ?? r.id;
}

// Parses the raw PSI date string MM-DD-YYYY. Used for positioning and sorting only, never displayed.
export function parsePsiDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export type CoverageState = "recorded" | "not" | "notable";

export function coverageState(r: InvRecord, k: CoverageKey): CoverageState {
  if (!r.has_table) return "notable";
  const v = r.coverage?.[k];
  if (v === null || v === undefined) return "notable";
  return v ? "recorded" : "not";
}

export const COVERAGE_STATE_TEXT: Record<CoverageState, string> = {
  recorded: "recorded",
  not: "not recorded",
  notable: "no table",
};

// Stats range that matches a coverage key (pressure is reported in psi with kPa beside it).
export function statFor(s: InvStats | null, k: CoverageKey): StatRange | null {
  if (!s) return null;
  if (k === "o2_pct" || k === "co2_pct" || k === "he_pct" || k === "flow_cm_s") return s[k];
  if (k === "pressure_kpa") return s.pressure_psi;
  return null;
}

// Metadata flags: those about the investigation page or table as a whole rather than single tests.
const META_CODES = new Set(["no_licence", "metadata_inconsistent", "date_inconsistent"]);

export interface MetaFlag {
  code: string;
  title: string;
  severity: FlagEntry["severity"];
  details: string[];
}

export function metadataFlags(flags: FlagEntry[] | undefined, invId: string): MetaFlag[] {
  if (!flags) return [];
  const byCode = new Map<string, MetaFlag>();
  for (const f of flags) {
    if (f.investigation_id !== invId || !META_CODES.has(f.code) || f.test_ids.length > 0) continue;
    const cur = byCode.get(f.code);
    if (cur) cur.details.push(f.detail);
    else byCode.set(f.code, { code: f.code, title: f.title, severity: f.severity, details: [f.detail] });
  }
  return [...byCode.values()];
}

export function MetaFlagBadges({ flags }: { flags: MetaFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Metadata flags">
      {flags.map((f) => (
        <li key={f.code}>
          <span
            title={f.details.join("\n\n")}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              f.severity === "info" ? "border-line text-ink-2" : "border-[color:var(--solid)] text-[color:var(--amber-ink)]"
            }`}
          >
            <span aria-hidden="true">&#9873;</span> {f.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function QualityLink({ id, className = "" }: { id: string; className?: string }) {
  return (
    <Link to={`/quality?inv=${encodeURIComponent(id)}`} className={`text-xs text-accent underline underline-offset-2 hover:no-underline ${className}`}>
      Data quality flags for <span className="mono">{id}</span>
    </Link>
  );
}

// A coverage chip: filled when recorded, hatched when not recorded, dashed when there is no table.
export function CoverageChip({ state, label }: { state: CoverageState; label: string }) {
  const base = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight border";
  const text = `${label}: ${COVERAGE_STATE_TEXT[state]}`;
  if (state === "recorded")
    return (
      <span className={`${base} border-accent bg-accent text-accent-ink`} title={text}>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">{label}</span>
      </span>
    );
  if (state === "not")
    return (
      <span className={`${base} hatch-bg border-line text-ink-2`} title={text}>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true" className="rounded-sm bg-surface-2 px-0.5">{label}</span>
      </span>
    );
  return (
    <span className={`${base} border-dashed border-line text-ink-3`} title={text}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

export function CoverageLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Coverage legend">
      <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm bg-accent" /> Recorded in the PSI table</li>
      <li className="flex items-center gap-1.5"><span className="hatch-bg inline-block h-3 w-4 rounded-sm border border-line" /> Not recorded</li>
      <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-dashed border-ink-3" /> No experiment table</li>
    </ul>
  );
}

// Long text from the PSI page, with its source one click away. Short values use <Value> instead.
export function SourcedText({ val, className = "", clamp = false, emptyText = "not recorded" }: { val: TextVal | null | undefined; className?: string; clamp?: boolean; emptyText?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popId = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!val || val.v === null || val.v === "") return <p className="text-sm italic text-ink-3">{emptyText}</p>;
  return (
    <div ref={ref} className={`relative ${className}`} data-prov={val.p}>
      <p className={`whitespace-pre-line text-sm leading-relaxed text-ink ${clamp ? "line-clamp-4" : ""}`}>{val.v}</p>
      <button type="button" className="mt-1 text-[11px] text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink" aria-expanded={open} aria-controls={popId} onClick={() => setOpen((o) => !o)}>
        Source
      </button>
      {open && <SourcePopover id={popId} provId={val.p} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SourcePopover({ id, provId, onClose }: { id: string; provId: string; onClose: () => void }) {
  const { data, isLoading, error } = useProvenance(true);
  const prov = data?.[provId];
  return (
    <div id={id} role="dialog" aria-label="Source of this text" className="absolute left-0 top-full z-50 mt-1 w-[22rem] max-w-[85vw] rounded-lg border border-line bg-surface-2 p-3 text-left text-ink shadow-xl">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">Where this text comes from</span>
        <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={onClose} aria-label="Close">Close</button>
      </div>
      {isLoading && <p className="text-xs text-ink-3">Loading provenance...</p>}
      {error && <p className="text-xs">Provenance could not be loaded.</p>}
      {prov && <ProvDetails prov={prov} />}
      {data && !prov && <p className="text-xs">No provenance record found for {provId}.</p>}
    </div>
  );
}

// Width of an element, for responsive SVG geometry.
export function useElementWidth<T extends HTMLElement>(fallback = 600, min = 260) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(min, Math.floor(entries[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width] as const;
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Fuel or material labels with their test counts, as {v,u,p} values that keep the parent's provenance.
export function labelEntries(c: LabelCounts | undefined): { label: string; val: Val<number> }[] {
  if (!c) return [];
  return Object.entries(c.labels)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, n]) => ({ label, val: { v: n, u: n === 1 ? "test" : "tests", p: c.p } }));
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-30 max-w-xs -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}
