// Types for the static data snapshot written by `python -m redshift.build`.
// Every number the UI shows arrives as a Val: value, unit and a provenance id.

export interface Val<T = number | string | null> {
  v: T;
  u?: string;
  p: string;
}

export type FuelClass = "gas" | "droplet" | "solid" | "emulator" | "none";
export type SourceType = "psi_table" | "psi_page" | "published_paper" | "reference_document" | "derived";

export interface Prov {
  id: string;
  source_type: SourceType;
  investigation_id?: string;
  file?: string;
  row?: number;
  column?: string;
  raw?: string;
  transforms?: string[];
  doi?: string;
  ntrs?: string;
  page?: number;
  quote?: string;
  method?: string;
  method_version?: string;
  params?: Record<string, unknown>;
  inputs?: string[];
  note?: string;
  verified?: boolean;
  verified_by?: string;
  verified_at?: string;
}

export type TestFields = Record<string, Val>;

export interface TestRow {
  test_id: string;
  investigation_id: string;
  investigation: string;
  source_type: "psi_table";
  table_file: string;
  source_row: number;
  doi: string;
  fuel_class: FuelClass;
  test_kind: string;
  fields: TestFields;
  flags: string[];
  raw: Record<string, string>;
  verified: boolean;
}

export interface Candidate {
  id: string;
  name: string;
  short: string;
  role: "habitat" | "scenario" | "suit";
  context: string;
  pressure_psi: Val<number>;
  pressure_kpa: Val<number>;
  o2_pct: Val<number>;
  source: string;
}

export type BySource = Record<"psi_table" | "published_paper", Val<number>>;

export interface CandidateEvidence {
  candidate_id: string;
  near_total: Val<number>;
  near: Record<"gas" | "droplet" | "solid" | "emulator", BySource>;
  o2_match_pressure_unknown: Record<"gas" | "droplet" | "solid" | "emulator", Val<number>>;
  unknown: Record<string, Val<number>>;
  nearest: { test_id: string; investigation: string; fuel_class: FuelClass; source_type: string; distance: Val<number> }[];
  flame_temperature: Val<number> & { approximate: boolean };
}

export interface FlagEntry {
  id: string;
  code: string;
  severity: "info" | "warning" | "error";
  title: string;
  investigation_id: string;
  file: string | null;
  rows: number[];
  column: string | null;
  raw: string | null;
  detail: string;
  action: string;
  test_ids: string[];
}

export interface Investigation {
  id: string;
  acronym?: Val<string> | null;
  title?: Val<string> | null;
  doi?: Val<string> | null;
  [key: string]: unknown;
}

export interface DatasetVersion {
  version: string;
  retrieved: string;
  content_sha256: string;
  cite: string;
}
