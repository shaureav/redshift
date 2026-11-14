import { describe, expect, it } from "vitest";
import { csvCell, evidenceCsv, evidenceCsvFilename } from "../components/evidenceCsv";
import {
  applyFilters, countMatching, EMPTY_FILTERS, hasActiveFilters, matchesFilters, parseFilters,
  pressureRecorded, searchText, writeFilters, type EvidenceFilters,
} from "./filters";
import type { FuelClass, TestRow } from "./types";

function row(id: string, over: Partial<TestRow> & { psi?: number | null; fuel?: string; outcome?: string } = {}): TestRow {
  const { psi = 10.2, fuel = "Heptane", outcome, ...rest } = over;
  return {
    test_id: id,
    investigation_id: "PSI-69",
    investigation: "FLEX",
    source_type: "psi_table",
    table_file: "data/raw/psi/FLEX/experiment_table/PSI-69.csv",
    source_row: 2,
    doi: "10.60555/mbq8-0451",
    fuel_class: "droplet" as FuelClass,
    test_kind: "burn",
    fields: {
      o2_pct: { v: 21, u: "%", p: `cell:${id}:o2` },
      pressure_psi: { v: psi, u: "psi", p: `cell:${id}:psi` },
      pressure_kpa: { v: psi === null ? null : 70.3, u: "kPa", p: `cell:${id}:kpa` },
      fuel: { v: fuel, p: `cell:${id}:fuel` },
      ...(outcome ? { outcome_label: { v: outcome, p: `cell:${id}:out` } } : {}),
    },
    flags: [],
    raw: { "Test end": outcome ?? "" },
    verified: true,
    ...rest,
  };
}

const rows: TestRow[] = [
  row("A", { outcome: "Disruption" }),
  row("B", { psi: null, flags: ["F0001"], fuel: "Methanol" }),
  row("C", { investigation_id: "PSI-25", investigation: "BASS-II", table_file: "data/raw/psi/BASS-II/t.csv", fuel_class: "solid", test_kind: "flame", flags: ["F0002", "F0003"] }),
  row("D", { investigation_id: "PSI-10", investigation: "ACME/Flame Design", fuel_class: "gas", test_kind: "flame", fuel: "Ethylene" }),
];

const f = (over: Partial<EvidenceFilters>): EvidenceFilters => ({ ...EMPTY_FILTERS, ...over });

describe("countMatching", () => {
  it("counts every row with no filters", () => {
    expect(countMatching(rows, EMPTY_FILTERS)).toBe(4);
  });
  it("counts an empty table as zero", () => {
    expect(countMatching([], f({ q: "anything" }))).toBe(0);
  });
  it("agrees with applyFilters for each filter", () => {
    const cases: Partial<EvidenceFilters>[] = [
      { inv: ["PSI-69"] },
      { fuel: ["solid", "gas"] },
      { kind: ["flame"] },
      { flagged: "flagged" },
      { flagged: "unflagged" },
      { pressure: "recorded" },
      { pressure: "not_recorded" },
      { ids: ["A", "C", "Z"] },
      { q: "methanol" },
      { q: "flex heptane" },
      { q: "disruption" },
      { inv: ["PSI-69"], flagged: "flagged", pressure: "not_recorded" },
    ];
    const expected = [2, 2, 2, 2, 2, 3, 1, 2, 1, 1, 1, 1];
    cases.forEach((c, i) => {
      expect(countMatching(rows, f(c))).toBe(applyFilters(rows, f(c)).length);
      expect(countMatching(rows, f(c))).toBe(expected[i]);
    });
  });
});

describe("matchesFilters", () => {
  it("restricts to linked ids", () => {
    expect(applyFilters(rows, f({ ids: ["B", "D"] })).map((r) => r.test_id)).toEqual(["B", "D"]);
  });
  it("searches all terms, case-insensitively, across fields, raw cells and flags", () => {
    expect(matchesFilters(rows[0], f({ q: "DISRUPTION flex" }))).toBe(true);
    expect(matchesFilters(rows[0], f({ q: "disruption bass" }))).toBe(false);
    expect(matchesFilters(rows[2], f({ q: "f0003" }))).toBe(true);
    expect(searchText(rows[3])).toContain("ethylene");
  });
  it("treats a missing pressure as not recorded rather than as a value", () => {
    expect(pressureRecorded(rows[1])).toBe(false);
    expect(pressureRecorded(rows[0])).toBe(true);
  });
});

describe("URL round trip", () => {
  it("parses and writes the same filters, leaving other params alone", () => {
    const sp = new URLSearchParams("inv=PSI-69,PSI-10&fuel=gas&kind=flame&flagged=flagged&pressure=recorded&q=heptane&ids=A,B&sort=-o2&test=A");
    const parsed = parseFilters(sp);
    expect(parsed).toEqual({ q: "heptane", inv: ["PSI-69", "PSI-10"], fuel: ["gas"], kind: ["flame"], flagged: "flagged", pressure: "recorded", ids: ["A", "B"] });
    const written = writeFilters(EMPTY_FILTERS, sp);
    expect(written.get("sort")).toBe("-o2");
    expect(written.get("test")).toBe("A");
    expect(written.get("inv")).toBeNull();
    expect(parseFilters(writeFilters(parsed, new URLSearchParams()))).toEqual(parsed);
  });
  it("ignores unknown enum values", () => {
    const parsed = parseFilters(new URLSearchParams("flagged=maybe&pressure=x"));
    expect(parsed.flagged).toBe("all");
    expect(parsed.pressure).toBe("all");
    expect(hasActiveFilters(parsed)).toBe(false);
  });
});

describe("CSV export", () => {
  it("quotes cells that need it", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell([21, 26.5])).toBe("21;26.5");
  });
  it("writes the version, the DOIs present and a provenance id beside each value", () => {
    const version = { version: "2026-11-14+abc", retrieved: "2026-11-14", content_sha256: "abc", cite: "Cite me" };
    const csv = evidenceCsv(rows.slice(0, 1), ["o2_pct", "outcome_label"], version);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("2026-11-14+abc");
    expect(lines[1]).toBe("# Citations (DOIs present in this export): 10.60555/mbq8-0451");
    const header = lines.find((l) => l.startsWith("test_id"))!.split(",");
    expect(header.slice(-4)).toEqual(["o2_pct", "o2_pct_provenance", "outcome_label", "outcome_label_provenance"]);
    expect(lines[lines.length - 1].endsWith("21,cell:A:o2,Disruption,cell:A:out")).toBe(true);
    expect(evidenceCsvFilename(version)).toBe("redshift-evidence-2026-11-14+abc.csv");
  });
});
