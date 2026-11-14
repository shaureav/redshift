// Parity: the browser's listing of near tests must reproduce the build's grid counts at every node and
// every step multiplier. If the TypeScript copy of the nearness rule ever drifts from
// redshift/science/nearness.py, this test fails.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeGrid, FUELS, nearInputs, nodeOf, o2MatchInputs, readAt, SOURCES, type ProbeGridFile } from "./probe";

// Vitest runs from web/, where the snapshot the site serves lives in public/data.
const load = <T,>(name: string): T => JSON.parse(readFileSync(join(process.cwd(), "public", "data", name), "utf8")) as T;
const grid = decodeGrid(load<ProbeGridFile>("probe_grid.json"));

interface Cand { id: string; o2_pct: { v: number }; pressure_psi: { v: number } }
interface CandEv { candidate_id: string; near: Record<string, Record<string, { v: number }>>; o2_match_pressure_unknown: Record<string, { v: number }> }
const cands = load<{ candidates: Cand[] }>("candidates.json").candidates;
const candEv = load<{ evidence: CandEv[] }>("candidate_evidence.json").evidence;
const sens = load<{ rows: { candidate_id: string; multiplier: number; target_flow_cm_s: number | null; counts: Record<string, { v: number }> }[] }>("sensitivity.json").rows;

describe("probe grid", () => {
  it("puts every candidate atmosphere exactly on a grid node", () => {
    for (const c of cands) expect(nodeOf(grid, c.o2_pct.v, c.pressure_psi.v), c.id).not.toBeNull();
  });

  it("reproduces candidate_evidence.json at every candidate (1x steps)", () => {
    for (const c of cands) {
      const r = readAt(grid, c.o2_pct.v, c.pressure_psi.v, 1);
      const ev = candEv.find((e) => e.candidate_id === c.id)!;
      for (const f of FUELS) {
        for (const s of SOURCES) expect(r.near[f][s].v, `${c.id} ${f} ${s}`).toBe(ev.near[f][s].v);
        expect(r.o2m[f].v, `${c.id} o2m ${f}`).toBe(ev.o2_match_pressure_unknown[f].v);
      }
    }
  });

  it("reproduces sensitivity.json at every candidate and multiplier", () => {
    for (const row of sens.filter((r) => r.target_flow_cm_s === null)) {
      const c = cands.find((x) => x.id === row.candidate_id)!;
      const r = readAt(grid, c.o2_pct.v, c.pressure_psi.v, row.multiplier);
      for (const f of FUELS) expect(r.nearClass[f], `${c.id} ${row.multiplier} ${f}`).toBe(row.counts[f].v);
    }
  });

  it("lists exactly the tests the build counted, at every node and multiplier", () => {
    let mismatches = 0;
    const first: string[] = [];
    for (const m of grid.multipliers) {
      for (let i = 0; i < grid.o2.length; i++) {
        for (let j = 0; j < grid.psi.length; j++) {
          const near = nearInputs(grid, i, j, m);
          const r = readAt(grid, grid.o2[i], grid.psi[j], m);
          let total = 0;
          for (const f of FUELS) {
            for (const s of SOURCES) {
              const n = near.filter((t) => t.input.fuel_class === f && t.input.source_type === s).length;
              total += n;
              if (n !== r.near[f][s].v) {
                mismatches++;
                if (first.length < 5) first.push(`m=${m} o2=${grid.o2[i]} psi=${grid.psi[j]} ${f}/${s}: listed ${n}, built ${r.near[f][s].v}`);
              }
            }
          }
          if (total !== r.total.v) mismatches++;
        }
      }
      for (let i = 0; i < grid.o2.length; i++) {
        for (const f of FUELS) {
          const n = o2MatchInputs(grid, i, m).filter((t) => t.fuel_class === f).length;
          if (n !== readAt(grid, grid.o2[i], grid.psi[0], m).o2m[f].v) mismatches++;
        }
      }
    }
    expect(first).toEqual([]);
    expect(mismatches).toBe(0);
  });

  it("reads a node in well under a frame", () => {
    const t0 = performance.now();
    for (let k = 0; k < 1000; k++) readAt(grid, 15 + (k % 170) * 0.5, 3 + (k % 140) * 0.1, 1);
    const per = (performance.now() - t0) / 1000;
    expect(per).toBeLessThan(1);
  });
});
