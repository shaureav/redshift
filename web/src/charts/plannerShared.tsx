// Shared pieces for the Test Planner, Methods and About pages: the shapes of the snapshot files they
// read, small presentational parts and the planner formula block. Nothing here computes a displayed
// number. Parameters written by the build as plain numbers are wrapped as {v,u,p} with the provenance id
// of the record that lists them, so the reader can still open their source.
import type { ReactNode } from "react";
import { Value } from "../components/Value";
import type { Candidate, Val } from "../lib/types";

// ---------- snapshot file shapes ----------

export type PresetKey = "balanced" | "equal" | "solids_only";
export const PRESETS: PresetKey[] = ["balanced", "equal", "solids_only"];
export const PRESET_LABEL: Record<PresetKey, string> = {
  balanced: "Balanced",
  equal: "Equal weights",
  solids_only: "Solids only",
};
export const PRESET_BLURB: Record<PresetKey, string> = {
  balanced: "Solid materials weighted most, then droplets, then gas flames.",
  equal: "Every material class weighted the same.",
  solids_only: "Only solid materials count; droplet and gas cells carry no weight.",
};

export type PlannerMaterial = "solid" | "droplet" | "gas";

export interface PlannerNearest {
  test_id: string;
  investigation: string;
  distance: Val<number>;
}

export interface PlannerGridCell {
  id: string;
  o2_pct: number;
  pressure_psi: number;
  material: PlannerMaterial;
  n_near: Val<number>;
  relevance: Val<number>;
  priority: Record<PresetKey, Val<number>>;
  nearest: PlannerNearest[];
  // Not written by the build today (see the pipeline request); read when present.
  pressure_kpa?: Val<number>;
}

export interface PlannerParams {
  evidence_constant: number;
  judgement: string;
  material_classes: PlannerMaterial[];
  o2_levels_pct: number[];
  pressure_levels_psi: number[];
  presets: Record<PresetKey, Record<PlannerMaterial, number>>;
  relevance: string;
}

export interface PlannerFile {
  cells: PlannerGridCell[];
  rankings: Record<PresetKey, string[]>;
  params: PlannerParams;
  p: string;
}

export interface NearnessParams {
  o2_step_pct_points: number;
  pressure_step_log: number;
  flow_step_cm_s: number;
  threshold: number;
  metric: string;
  flow_rule: string;
  unknown_rule: string;
  o2_basis_counted: string[];
  o2_basis_rule: string;
  sensitivity_multipliers: number[];
  judgement: string;
}

export interface CandidateEvidenceFile {
  p: string;
  params: NearnessParams;
}

export interface CandidatesFile {
  candidates: Candidate[];
}

export interface ManifestFile {
  note: string;
  files: {
    file: string;
    bytes: number;
    sha256: string;
    licence: string;
    retrieved: string;
    source_url: string;
    investigation_id?: string;
  }[];
}

export interface AdaptersFile {
  adapters: {
    folder: string;
    fuel_class: string;
    investigation_id: string;
    mapping: string;
    tables: string[];
    test_kind: string;
  }[];
}

export interface SensitivityFile {
  p: string;
  rows: {
    candidate_id: string;
    variant: string;
    multiplier: number;
    target_flow_cm_s: number | null;
    counts: Record<"gas" | "droplet" | "solid" | "emulator", Val<number>>;
  }[];
}

export interface FlameGridFile {
  caption: string;
  p: string;
  isotherms_K: Val<number>[];
}

export interface PrebreatheFile {
  caveat: string;
  p: string;
  pending: { atmosphere: string; finding_id: string; status: string }[];
  points: { finding_id: string; atmosphere: string; pressure_psi: Val<number>; o2_pct: Val<number>; duration_text?: string }[];
}

export interface KeyFindingsFile {
  p: string;
  findings: { id: string; finding: Val<string>; quote: string; page: number; ntrs_id?: string | null }[];
  status: {
    drafted: number;
    awaiting_verification: string[];
    failed_checks: string[];
    rejected_by_reviewer: string[];
    verified: string[];
  };
}

// ---------- helpers ----------

/** Wrap a parameter the build wrote as a plain number, citing the record that lists it. */
export function param(v: number, p: string, u?: string): Val<number> {
  return u ? { v, u, p } : { v, p };
}

/** Cell id as written by the build, for example "cell:21:14.7:solid". */
export function cellLabel(c: { o2_pct: number; pressure_psi: number }): string {
  return `${c.o2_pct}% O2, ${c.pressure_psi} psi`;
}

/** A test count: zero is hatched and written "no tests recorded", never shown as a low number. */
export function CountCell({ val, compact = false }: { val: Val<number>; compact?: boolean }) {
  if (val.v === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="hatch-bg inline-block h-3 w-4 rounded-sm border border-line" aria-hidden="true" />
        <span className="text-ink-2">{compact ? "none recorded" : "no tests recorded"}</span>
        <span className="text-[11px] text-ink-3">
          (<Value val={val} unit={false} />)
        </span>
      </span>
    );
  }
  return <Value val={val} />;
}

/** A displayed equation, written as readable HTML. */
export function Eq({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-line bg-surface-3 px-4 py-3" role="math" aria-label={label}>
      <div className="num whitespace-nowrap text-[15px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

/** Plain-text form of an equation, for copying. */
export function EqText({ children }: { children: string }) {
  return (
    <p className="text-xs text-ink-3">
      Plain text: <code className="mono break-words text-ink-2">{children}</code>
    </p>
  );
}

export function Callout({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <aside className="rounded-lg border border-line border-l-4 border-l-accent bg-surface-2 px-4 py-3 text-sm">
      {title && <p className="font-semibold">{title}</p>}
      <div className="text-ink-2">{children}</div>
    </aside>
  );
}

// ---------- the planner formula (Planner and Methods pages) ----------

export function PlannerFormula({ grid, nearness, nearP }: { grid: PlannerFile; nearness?: NearnessParams; nearP?: string }) {
  const k = param(grid.params.evidence_constant, grid.p);
  return (
    <div className="text-sm text-ink-2">
      <Eq label="Priority equals relevance times material weight times one minus n over n plus k">
        priority = <var>R</var> &times; <var>w</var><sub>material</sub> &times; ( 1 &minus; <var>n</var> / (<var>n</var> + <var>k</var>) )
      </Eq>
      <Eq label="Relevance equals the exponential of minus d squared over two theta squared">
        <var>R</var> = exp( &minus;<var>d</var><sup>2</sup> / (2 <var>&theta;</var><sup>2</sup>) )
      </Eq>
      <EqText>{`priority = relevance x weight x (1 - n/(n+${grid.params.evidence_constant})); ${grid.params.relevance}`}</EqText>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="font-medium text-ink"><var>n</var></dt>
        <dd>existing tests of that material class near the cell (the nearness rule at 1x steps)</dd>
        <dt className="font-medium text-ink"><var>k</var></dt>
        <dd>
          the evidence constant, <Value val={k} />: with <var>k</var> tests nearby the evidence term falls to one half (judgement)
        </dd>
        <dt className="font-medium text-ink"><var>d</var></dt>
        <dd>nearness distance in steps from the cell to the nearest habitat candidate (the suit candidate is excluded)</dd>
        <dt className="font-medium text-ink"><var>&theta;</var></dt>
        <dd>
          the nearness threshold
          {nearness && nearP ? (
            <>
              , <Value val={param(nearness.threshold, nearP, "steps")} />
            </>
          ) : null}
        </dd>
        <dt className="font-medium text-ink"><var>w</var></dt>
        <dd>the material weight of the chosen preset (table below; judgement)</dd>
      </dl>
    </div>
  );
}

export function PresetWeights({ grid, active }: { grid: PlannerFile; active?: PresetKey }) {
  const mats = grid.params.material_classes;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Material weights for each planner preset</caption>
        <thead className="text-left text-xs text-ink-3">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">Preset</th>
            {mats.map((m) => (
              <th key={m} scope="col" className="py-1 pr-3 font-medium capitalize">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PRESETS.map((p) => (
            <tr key={p} className={`border-t border-line ${p === active ? "bg-surface-3" : ""}`} aria-current={p === active ? "true" : undefined}>
              <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                {PRESET_LABEL[p]}
                {p === active && <span className="ml-1.5 text-xs font-normal text-accent">(shown)</span>}
              </th>
              {mats.map((m) => (
                <td key={m} className="py-1.5 pr-3">
                  <Value val={param(grid.params.presets[p][m], grid.p)} digits={1} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
