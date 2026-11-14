// Shared pieces for the dossier pages: data shapes for the snapshot files the dossiers read, small
// presentational parts (count cells, findings, sections) and export helpers (CSV, BibTeX).
// Nothing here computes a displayed number: counts and values arrive as {v,u,p} objects from the build.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FuelMarker } from "./Common";
import { Value } from "./Value";
import { doiUrl, FUEL_LABEL, ntrsUrl } from "../lib/format";
import type { Candidate, CandidateEvidence, Investigation, TestRow, Val } from "../lib/types";

export const FUEL_CLASSES = ["gas", "droplet", "solid", "emulator"] as const;
export type FuelKey = (typeof FUEL_CLASSES)[number];

// ---------- snapshot file shapes (only the parts the dossiers read) ----------

export interface CandidatesFile {
  candidates: Candidate[];
}

export interface EvidenceFile {
  evidence: CandidateEvidence[];
  p: string;
  params: {
    o2_step_pct_points: number;
    pressure_step_log: number;
    threshold: number;
    flow_rule: string;
    unknown_rule: string;
    o2_basis_rule: string;
    judgement: string;
    [k: string]: unknown;
  };
}

export interface TestsFile {
  p: string;
  tests: TestRow[];
}

export interface InvestigationsFile {
  p: string;
  investigations: Investigation[];
}

export interface LabelCounts {
  labels: Record<string, number>;
  p: string;
}

export interface InvestigationStat {
  n_tests: Val<number>;
  material_counts: LabelCounts;
  fuel_counts: LabelCounts;
  [k: string]: unknown;
}

export interface InvestigationStatsFile {
  p: string;
  stats: Record<string, InvestigationStat>;
}

export interface FindingValue extends Val<number> {
  name: string;
  as_written: string;
}

export interface KeyFinding {
  id: string;
  investigation: string | null;
  kind: string | null;
  finding: Val<string>;
  quote: string;
  page: number;
  ntrs_id?: string | null;
  doi?: string | null;
  values: FindingValue[];
  p: string;
  // Not written by the build today; read if a future build lists the materials a finding concerns.
  materials?: string[];
}

export interface KeyFindingsFile {
  findings: KeyFinding[];
  p: string;
  status: {
    drafted: number;
    failed_checks: { id: string; problems: string[] }[];
    awaiting_verification: string[];
    rejected_by_reviewer: string[];
    verified: string[];
  };
}

export interface PrebreatheVerified {
  finding_id: string;
  atmosphere: string;
  pressure_psi: Val<number>;
  o2_pct: Val<number>;
  duration_text: string;
  quote: string;
  page: number;
  ntrs_id?: string | null;
  p: string;
}

export interface PrebreatheFile {
  points: PrebreatheVerified[];
  pending: { atmosphere: string; finding_id: string; status: string }[];
  caveat: string;
  p: string;
}

export interface DatasetVersionFile {
  version: string;
  retrieved: string;
  content_sha256: string;
  cite: string;
}

// ---------- helpers (string handling only) ----------

/** Investigation names are written differently in papers and PSI ("Saffire VI", "SAFFIRE-II"). */
export function normInv(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function investigationByName(invs: Investigation[]): Map<string, Investigation> {
  const m = new Map<string, Investigation>();
  for (const i of invs) {
    if (i.acronym?.v) m.set(i.acronym.v, i);
  }
  return m;
}

export function materialHref(label: string): string {
  return `/dossiers/material/${encodeURIComponent(label)}`;
}

export function evidenceHref(ids: string[]): string {
  return `/evidence?ids=${encodeURIComponent(ids.join(","))}`;
}

/** The 4.3 psi suit value is a round figure from the challenge statement, so it is written "about". */
export function isAboutPressure(c: Candidate): boolean {
  return c.pressure_psi.v === 4.3;
}

export const ROLE_LABEL: Record<Candidate["role"], string> = {
  habitat: "Habitat atmosphere",
  scenario: "Reference scenario",
  suit: "Spacesuit",
};

export function anyNear(cls: CandidateEvidence["near"][FuelKey]): boolean {
  return cls.psi_table.v > 0 || cls.published_paper.v > 0;
}

export type DossierStatus = "here" | "nearby" | "none";

/** Plain-words status from the near counts only. Never a judgement about the atmosphere. */
export function dossierStatus(ev: CandidateEvidence): DossierStatus {
  if (anyNear(ev.near.solid)) return "here";
  if (FUEL_CLASSES.some((f) => anyNear(ev.near[f]))) return "nearby";
  return "none";
}

export const STATUS_TEXT: Record<DossierStatus, string> = {
  here: "Tested here",
  nearby: "Tested nearby (non-solid only)",
  none: "No tests recorded",
};

export const STATUS_HELP: Record<DossierStatus, string> = {
  here: "At least one solid-material test is recorded within the nearness region.",
  nearby: "Tests are recorded within the nearness region, but none of them burned a solid material.",
  none: "No test of any fuel class is recorded within the nearness region. Unknown, not low risk.",
};

export function StatusBadge({ status }: { status: DossierStatus }) {
  return (
    <span
      title={STATUS_HELP[status]}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        status === "here" ? "border-accent text-accent" : "border-line text-ink-2"
      }`}
    >
      {status === "none" ? (
        <span className="hatch-bg inline-block h-2.5 w-4 rounded-sm border border-line" aria-hidden="true" />
      ) : (
        <FuelMarker fuel={status === "here" ? "solid" : "none"} size={10} outlined={status !== "here"} />
      )}
      {STATUS_TEXT[status]}
    </span>
  );
}

// ---------- presentational parts ----------

export function Section({ n, id, title, lead, children, aside }: { n?: number; id: string; title: string; lead?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="card break-inside-avoid p-4 sm:p-5" id={id}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="flex items-baseline gap-2 text-base font-semibold">
          {n !== undefined && <span className="num text-xs font-medium text-ink-3">{n}</span>}
          {title}
        </h2>
        {aside}
      </div>
      {lead && <p className="mb-3 max-w-prose text-sm text-ink-2">{lead}</p>}
      {children}
    </section>
  );
}

/** A count, or a hatched "no tests recorded" when the count is zero. */
export function CountCell({ val, compact = false }: { val: Val<number>; compact?: boolean }) {
  if (val.v === 0) {
    return (
      <span className={`hatch-bg inline-flex items-center rounded border border-line px-1.5 py-0.5 ${compact ? "text-[11px]" : "text-xs"} text-ink-2`}>
        <span className="rounded-sm bg-surface-2 px-1">no tests recorded</span>
      </span>
    );
  }
  return <Value val={val} unit={false} className={compact ? "text-sm" : ""} />;
}

export function FuelName({ fuel, short = false }: { fuel: string; short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <FuelMarker fuel={fuel} />
      {short && fuel === "emulator" ? "Emulator (BRE)" : FUEL_LABEL[fuel] ?? fuel}
    </span>
  );
}

/** Material labels are shown exactly as the PSI table writes them, spacing included. */
export function MaterialLabel({ label, className = "" }: { label: string; className?: string }) {
  return <q className={`whitespace-pre-wrap ${className}`}>{label}</q>;
}

export function FindingCard({ f }: { f: KeyFinding }) {
  return (
    <article className="rounded-lg border border-line bg-surface p-3 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <FuelMarker fuel="solid" outlined size={10} />
        <span>Published paper, human verified</span>
        {f.investigation && <span>{f.investigation}</span>}
        {f.kind && <span className="rounded border border-line px-1.5">{f.kind.replace(/_/g, " ")}</span>}
        <span className="mono">{f.id}</span>
      </div>
      <p className="text-ink">
        <Value val={f.finding} />
      </p>
      <blockquote className="mt-2 border-l-2 border-line pl-3 text-ink-2">
        <q className="italic">{f.quote}</q>
        <footer className="mt-1 text-xs text-ink-3">
          Page <Value val={{ v: f.page, p: f.p }} unit={false} />
          {f.ntrs_id && (
            <>
              {", NTRS "}
              <a className="mono underline" href={ntrsUrl(f.ntrs_id)} target="_blank" rel="noreferrer">{f.ntrs_id}</a>
            </>
          )}
          {f.doi && (
            <>
              {", DOI "}
              <a className="mono underline" href={doiUrl(f.doi)} target="_blank" rel="noreferrer">{f.doi}</a>
            </>
          )}
        </footer>
      </blockquote>
      {f.values.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {f.values.map((v) => (
            <div key={v.name} className="contents">
              <dt className="text-ink-3">{v.name}</dt>
              <dd>
                <Value val={v} /> <span className="text-ink-3">written as <q>{v.as_written}</q></span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/** Shown wherever verified findings would appear while none are verified. */
export function AwaitingVerification({ kf, pendingIds = [] }: { kf: KeyFindingsFile; pendingIds?: string[] }) {
  return (
    <div className="hatch-bg rounded-lg border border-line p-1.5">
      <div className="rounded-md bg-surface-2 p-3 text-sm text-ink-2">
        <p>
          <span className="font-medium text-ink">Awaiting human verification.</span> Paper findings appear here only after a named team member has checked
          the quote against the PDF. Findings drafted so far: <Value val={{ v: kf.status.drafted, u: "findings", p: kf.p }} />; verified so far: none.
        </p>
        {pendingIds.length > 0 && (
          <p className="mt-1 text-xs">
            Relevant drafts waiting: {pendingIds.map((id, i) => (
              <span key={id}>
                {i > 0 && ", "}
                <span className="mono">{id}</span>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

export function ExportButton({ onClick, children, label, disabled, title }: { onClick: () => void; children: ReactNode; label?: string; disabled?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} disabled={disabled} title={title} className="rounded border border-line bg-surface-2 px-2.5 py-1 text-xs hover:bg-surface-3 disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-surface-2">
      {children}
    </button>
  );
}

export function BackLink() {
  return (
    <Link to="/dossiers" className="no-print text-xs text-ink-3 underline hover:text-ink">
      All dossiers
    </Link>
  );
}

// ---------- exports ----------

export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function bibEscape(s: string): string {
  return s.replace(/([{}&%$#_])/g, "\\$1");
}

/** BibTeX for PSI investigation datasets, built from investigations.json (title, DOI, PSI page, release). */
export function bibtexFor(invs: Investigation[]): string {
  return invs
    .filter((i) => i.doi?.v)
    .map((i) => {
      const acr = i.acronym?.v ?? i.id;
      const key = `psi_${String(i.id).toLowerCase().replace(/[^a-z0-9]/g, "")}_${acr.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      const url = (i.psi_url as Val<string> | undefined)?.v;
      const released = (i.released_submitted as Val<string> | undefined)?.v ?? "";
      const year = released.match(/\d{4}/)?.[0];
      const lines = [
        `@misc{${key},`,
        `  title = {{${bibEscape(acr)}: ${bibEscape(i.title?.v ?? acr)}}},`,
        `  author = {{NASA Physical Sciences Informatics}},`,
        `  howpublished = {NASA Physical Sciences Informatics (PSI) data repository, ${bibEscape(String(i.id))}},`,
        year ? `  year = {${year}},` : null,
        `  doi = {${i.doi!.v}},`,
        url ? `  url = {${url}},` : null,
        `  note = {Dataset}`,
        `}`,
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n") + "\n";
}

/** Distinct values in first-seen order (used for lists of labels and investigations, never for counts). */
export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
