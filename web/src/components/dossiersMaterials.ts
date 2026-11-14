// Material and fuel labels for the dossiers, derived from tests.json by grouping exact strings.
// Booleans and lists only; per-investigation counts come from investigation_stats.json with provenance.
import type { InvestigationStatsFile } from "./dossiersShared";
import type { TestRow, Val } from "../lib/types";

export interface MaterialEntry {
  label: string;
  fields: ("material" | "fuel")[];
  investigations: { id: string; name: string }[];
  kinds: string[];
  anyO2: boolean;
  anyPressure: boolean;
  anyFlow: boolean;
  testIds: string[];
}

/** Material and fuel labels of solid-class tests, verbatim and grouped exactly by string. */
export function materialEntries(tests: TestRow[]): { entries: MaterialEntry[]; unlabelled: string[] } {
  const by = new Map<string, MaterialEntry>();
  const unlabelled: string[] = [];
  for (const t of tests) {
    if (t.fuel_class !== "solid") continue;
    let labelled = false;
    for (const field of ["material", "fuel"] as const) {
      const v = t.fields[field]?.v;
      if (typeof v !== "string") continue;
      labelled = true;
      let e = by.get(v);
      if (!e) {
        e = { label: v, fields: [], investigations: [], kinds: [], anyO2: false, anyPressure: false, anyFlow: false, testIds: [] };
        by.set(v, e);
      }
      if (!e.fields.includes(field)) e.fields.push(field);
      if (!e.investigations.some((i) => i.id === t.investigation_id)) e.investigations.push({ id: t.investigation_id, name: t.investigation });
      if (!e.kinds.includes(t.test_kind)) e.kinds.push(t.test_kind);
      e.anyO2 ||= t.fields.o2_pct?.v != null;
      e.anyPressure ||= t.fields.pressure_psi?.v != null;
      e.anyFlow ||= t.fields.flow_cm_s?.v != null;
      if (!e.testIds.includes(t.test_id)) e.testIds.push(t.test_id);
    }
    if (!labelled) unlabelled.push(t.test_id);
  }
  return { entries: [...by.values()], unlabelled };
}

export const KIND_VERB: Record<string, string> = { burn: "Burned in", smoke: "Smoke tests in" };

export function knownSentence(e: MaterialEntry): string {
  if (e.anyO2 && e.anyPressure) return "O2 and pressure recorded for some tests, so they can be placed on the plane.";
  if (e.anyO2) return "O2 recorded; pressure not recorded, so no test can be judged near a candidate.";
  return "Neither O2 nor pressure recorded, so these tests cannot be placed on the plane.";
}

/** Per-investigation count for a label, from investigation_stats.json (carries provenance). */
export function labelCount(stats: InvestigationStatsFile | undefined, invId: string, label: string, fields: MaterialEntry["fields"]): Val<number> | null {
  const s = stats?.stats[invId];
  if (!s) return null;
  for (const f of fields) {
    const lc = f === "material" ? s.material_counts : s.fuel_counts;
    const n = lc?.labels[label];
    if (typeof n === "number") return { v: n, u: n === 1 ? "test" : "tests", p: lc.p };
  }
  return null;
}
