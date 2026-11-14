// Evidence Explorer filtering. Pure functions only, so they can be unit tested.
// countMatching is the one client-side count the app shows ("Showing N of M tests"): it counts the
// rows that pass the reader's own filters. Every other number comes from the data snapshot.
import type { TestRow, Val } from "./types";

export type FlaggedFilter = "all" | "flagged" | "unflagged";
export type PressureFilter = "all" | "recorded" | "not_recorded";

export interface EvidenceFilters {
  q: string;
  inv: string[];
  fuel: string[];
  kind: string[];
  flagged: FlaggedFilter;
  pressure: PressureFilter;
  ids: string[] | null;
}

export const EMPTY_FILTERS: EvidenceFilters = {
  q: "",
  inv: [],
  fuel: [],
  kind: [],
  flagged: "all",
  pressure: "all",
  ids: null,
};

const list = (s: string | null): string[] =>
  s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];

export function parseFilters(sp: URLSearchParams): EvidenceFilters {
  const flagged = sp.get("flagged");
  const pressure = sp.get("pressure");
  const ids = list(sp.get("ids"));
  return {
    q: sp.get("q") ?? "",
    inv: list(sp.get("inv")),
    fuel: list(sp.get("fuel")),
    kind: list(sp.get("kind")),
    flagged: flagged === "flagged" || flagged === "unflagged" ? flagged : "all",
    pressure: pressure === "recorded" || pressure === "not_recorded" ? pressure : "all",
    ids: ids.length ? ids : null,
  };
}

// Writes the filters into a copy of the given params, leaving unrelated keys (sort, cols, test) alone.
export function writeFilters(f: EvidenceFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const put = (k: string, v: string | null) => (v ? next.set(k, v) : next.delete(k));
  put("q", f.q.trim() ? f.q : null);
  put("inv", f.inv.join(","));
  put("fuel", f.fuel.join(","));
  put("kind", f.kind.join(","));
  put("flagged", f.flagged === "all" ? null : f.flagged);
  put("pressure", f.pressure === "all" ? null : f.pressure);
  put("ids", f.ids && f.ids.length ? f.ids.join(",") : null);
  return next;
}

export function hasActiveFilters(f: EvidenceFilters): boolean {
  return (
    f.q.trim() !== "" || f.inv.length > 0 || f.fuel.length > 0 || f.kind.length > 0 ||
    f.flagged !== "all" || f.pressure !== "all" || (f.ids !== null && f.ids.length > 0)
  );
}

function valText(val: Val | undefined): string {
  if (!val || val.v === null || val.v === undefined) return "";
  return Array.isArray(val.v) ? (val.v as unknown[]).join(" ") : String(val.v);
}

const haystacks = new WeakMap<TestRow, string>();

// Lower-cased text the global search looks through: identifiers, every field value, raw cells and flags.
export function searchText(row: TestRow): string {
  const cached = haystacks.get(row);
  if (cached !== undefined) return cached;
  const parts: string[] = [
    row.test_id, row.investigation_id, row.investigation, row.fuel_class, row.test_kind,
    row.source_type, row.table_file, row.doi, ...row.flags,
  ];
  for (const val of Object.values(row.fields)) parts.push(valText(val));
  for (const raw of Object.values(row.raw ?? {})) parts.push(raw);
  const text = parts.join(" \u0001 ").toLowerCase();
  haystacks.set(row, text);
  return text;
}

export function pressureRecorded(row: TestRow): boolean {
  const psi = row.fields.pressure_psi?.v;
  const kpa = row.fields.pressure_kpa?.v;
  return (psi !== null && psi !== undefined) || (kpa !== null && kpa !== undefined);
}

export function matchesFilters(row: TestRow, f: EvidenceFilters, idSet?: Set<string> | null): boolean {
  if (f.ids && f.ids.length) {
    const set = idSet ?? new Set(f.ids);
    if (!set.has(row.test_id)) return false;
  }
  if (f.inv.length && !f.inv.includes(row.investigation_id)) return false;
  if (f.fuel.length && !f.fuel.includes(row.fuel_class)) return false;
  if (f.kind.length && !f.kind.includes(row.test_kind)) return false;
  if (f.flagged === "flagged" && row.flags.length === 0) return false;
  if (f.flagged === "unflagged" && row.flags.length > 0) return false;
  if (f.pressure === "recorded" && !pressureRecorded(row)) return false;
  if (f.pressure === "not_recorded" && pressureRecorded(row)) return false;
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) {
    const hay = searchText(row);
    for (const t of terms) if (!hay.includes(t)) return false;
  }
  return true;
}

export function applyFilters(rows: readonly TestRow[], f: EvidenceFilters): TestRow[] {
  const idSet = f.ids && f.ids.length ? new Set(f.ids) : null;
  return rows.filter((r) => matchesFilters(r, f, idSet));
}

// The number of tests currently shown after the reader's filters. This is the only count the
// interface computes for display.
export function countMatching(rows: readonly TestRow[], f: EvidenceFilters): number {
  const idSet = f.ids && f.ids.length ? new Set(f.ids) : null;
  let n = 0;
  for (const r of rows) if (matchesFilters(r, f, idSet)) n += 1;
  return n;
}

// Data Quality flag list filters (search, code, severity, investigation). This filters a list; it
// does not count anything for display.
export interface FlagFilters {
  q: string;
  code: string;
  sev: string;
  inv: string;
}

export function parseFlagFilters(sp: URLSearchParams): FlagFilters {
  return { q: sp.get("fq") ?? "", code: sp.get("code") ?? "", sev: sp.get("sev") ?? "", inv: sp.get("inv") ?? "" };
}

export function writeFlagFilters(f: FlagFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const put = (k: string, v: string) => (v.trim() ? next.set(k, v) : next.delete(k));
  put("fq", f.q);
  put("code", f.code);
  put("sev", f.sev);
  put("inv", f.inv);
  next.delete("fpage");
  return next;
}

export interface FlagLike {
  id: string;
  code: string;
  severity: string;
  title: string;
  investigation_id: string;
  file: string | null;
  column: string | null;
  raw: string | null;
  detail: string;
  action: string;
  test_ids: string[];
}

export function flagMatches(fl: FlagLike, f: FlagFilters): boolean {
  if (f.code && fl.code !== f.code) return false;
  if (f.sev && fl.severity !== f.sev) return false;
  if (f.inv && fl.investigation_id !== f.inv) return false;
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [fl.id, fl.code, fl.severity, fl.title, fl.investigation_id, fl.file ?? "", fl.column ?? "", fl.raw ?? "", fl.detail, fl.action, ...fl.test_ids]
    .join(" \u0001 ")
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
}
