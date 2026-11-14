// Shared pieces for the Evidence Explorer and Data Quality pages: data shapes of tests.json,
// quality_report.json and key_findings.json, the canonical field order, and value renderers.
import { Link } from "react-router-dom";
import { FIELD_LABEL } from "../lib/format";
import type { FlagEntry, TestRow, Val } from "../lib/types";
import { Badge } from "./Common";
import { Value } from "./Value";

export interface TestsFile {
  p: string;
  tests: TestRow[];
}

export interface DuplicateDetail {
  line: number;
  duplicate_of: number;
}

export interface NonTestDetail {
  line: number;
  raw: string[];
  reason: string;
}

export interface Reconciliation {
  balanced: boolean;
  blank_excluded: number;
  blank_excluded_lines: number[];
  duplicates_removed: number;
  duplicates_removed_detail: DuplicateDetail[];
  header_lines: number;
  investigation_id: string;
  non_test_excluded: number;
  non_test_excluded_detail: NonTestDetail[];
  physical_lines: number;
  records_in: number;
  table_file: string;
  table_key: string;
  tests_out: number;
}

export type GoldenValue = number | string | Record<string, number | string> | null;

export interface GoldenResult {
  id: string;
  description: string;
  source: string;
  expected: GoldenValue;
  actual: GoldenValue;
  status: string;
  explanation: string | null;
}

export interface FlagDefinition {
  description: string;
  severity: FlagEntry["severity"];
  title: string;
}

export type FindingProblem = string | { id: string; problems?: string[]; problem?: string; [k: string]: unknown };

export interface FindingsStatus {
  awaiting_verification: string[];
  drafted: number;
  failed_checks: FindingProblem[];
  rejected_by_reviewer: FindingProblem[];
  verified: string[];
}

export interface QualitySummary {
  blank_rows_excluded: Val<number>;
  by_fuel_class: Record<string, Val<number>>;
  duplicates_removed: Val<number>;
  flags: Val<number>;
  flags_by_severity: Record<string, Val<number>>;
  investigations_total: Val<number>;
  investigations_with_tables: Val<number>;
  non_test_rows_excluded: Val<number>;
  tables: Val<number>;
  tests: Val<number>;
}

export interface QualityReport {
  p: string;
  findings: FindingsStatus;
  flag_definitions: Record<string, FlagDefinition>;
  flags: FlagEntry[];
  goldens: { p: string; results: GoldenResult[] };
  provenance_coverage: { examples: unknown[]; numbers_checked: number; percent: number; without_provenance: number };
  reconciliation: Reconciliation[];
  summary: QualitySummary;
}

// A verified paper finding. The list is empty until a person verifies a drafted finding, so the
// shape is read defensively.
export interface KeyFinding {
  id: string;
  text?: string;
  statement?: string;
  finding?: string;
  quote?: string;
  investigation_id?: string;
  doi?: string;
  ntrs?: string;
  page?: number;
  value?: Val;
  p?: string;
  verified_by?: string;
  verified_at?: string;
  [k: string]: unknown;
}

export interface KeyFindingsFile {
  p: string;
  findings: KeyFinding[];
  status: FindingsStatus;
}

// Canonical field order: every field a test row can carry, in reading order.
export const FIELD_ORDER: string[] = [
  "test_label", "test_date", "o2_pct", "o2_list_pct", "o2_basis", "pressure_psi", "pressure_kpa",
  "co2_pct", "he_pct", "n2_pct", "diluent", "suppressant", "flow_cm_s", "fuel", "fuel_conc_pct",
  "material", "n_flames", "outcome_label", "gravity_level", "notes",
];

export const fieldLabel = (k: string): string =>
  k === "o2_list_pct" ? "O2 (list)" : FIELD_LABEL[k] ?? k;

// Field keys in canonical order, followed by any key the snapshot carries that the list does not know.
export function orderedFieldKeys(rows: readonly TestRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.fields)) seen.add(k);
  const known = FIELD_ORDER.filter((k) => seen.has(k));
  const extra = [...seen].filter((k) => !FIELD_ORDER.includes(k)).sort();
  return [...known, ...extra];
}

// Renders one field value. A list value (for example the oxygen levels of an ACME BRE test) shows
// each element with the same provenance as the list.
export function FieldValue({ val, k }: { val: Val | undefined; k: string }) {
  if (!val) return <span className="text-ink-3 italic">not in this table</span>;
  if (Array.isArray(val.v)) {
    const items = val.v as (number | string | null)[];
    return (
      <span>
        {items.map((v, i) => (
          <span key={i}>
            {i > 0 && <span className="text-ink-3">, </span>}
            <Value val={{ v, u: val.u, p: val.p }} />
          </span>
        ))}
      </span>
    );
  }
  if (k === "outcome_label" && val.v !== null) {
    return (
      <span>
        <span aria-hidden="true">&ldquo;</span>
        <Value val={val} />
        <span aria-hidden="true">&rdquo;</span>
      </span>
    );
  }
  return <Value val={val} />;
}

// Severity is a data-quality grade from the pipeline, written as the pipeline writes it. Amber marks
// warning and error (error with a heavier outline), from the token palette only.
export function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "error") {
    return (
      <span
        title="Severity: error"
        className="mono inline-flex items-center rounded-full border-2 border-[color:var(--solid)] px-2 py-0 text-xs font-semibold text-[color:var(--amber-ink)]"
      >
        error
      </span>
    );
  }
  return (
    <Badge tone={severity === "warning" ? "amber" : "neutral"} title={`Severity: ${severity}`}>
      <span className="mono">{severity}</span>
    </Badge>
  );
}

export function FlagLink({ id }: { id: string }) {
  return (
    <Link to={`/quality?flag=${encodeURIComponent(id)}`} className="mono text-xs text-accent underline underline-offset-2 hover:no-underline">
      {id}
    </Link>
  );
}

export const fileBase = (path: string | null | undefined): string => (path ? path.split("/").pop() ?? path : "");
