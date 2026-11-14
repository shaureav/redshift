// Parity: the browser's listing of near tests must reproduce the build's grid counts at every node and
// every step multiplier. If the TypeScript copy of the nearness rule ever drifts from
// redshift/science/nearness.py, this test fails.
import { describe, expect, it } from "vitest";
import { decodeGrid, FUELS, nearInputs, nodeOf, o2MatchInputs, readAt, SOURCES, totalsAlongO2, totalsAlongPressure, type ProbeGridFile } from "./probe";
import { loadSnapshot as load } from "./snapshot.fixture";

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

// The panel's sparklines read one row and one column of the grid. These readers are checked against the raw
// file decoded here independently (index = i_o2 * n_pressure + j_pressure), and against readAt at every node
// of the line, so a sparkline bar is exactly the count the build wrote there.
describe("row and column readers", () => {
  const raw = load<ProbeGridFile>("probe_grid.json");
  const nO2 = raw.axes.o2_pct.values.length;
  const nP = raw.axes.pressure_psi.values.length;
  const expand = (rle: number[]) => {
    const out: number[] = [];
    for (let k = 0; k < rle.length; k += 2) for (let r = 0; r < rle[k + 1]; r++) out.push(rle[k]);
    return out;
  };

  it("has the shape the plan describes (171 oxygen nodes by 141 pressure nodes)", () => {
    expect([nO2, nP]).toEqual([171, 141]);
  });

  it.each(raw.layers.map((l) => l.multiplier))("reads every row and column of the raw totals at %sx", (m) => {
    const flat = expand(raw.layers.find((l) => l.multiplier === m)!.total.rle);
    expect(flat).toHaveLength(nO2 * nP);
    for (let j = 0; j < nP; j++) {
      const row = totalsAlongO2(grid, j, m);
      expect(row.counts.map((c) => c.v)).toEqual(flat.filter((_, k) => k % nP === j));
      expect(row.axis.map((a) => a.v)).toEqual(raw.axes.o2_pct.values);
    }
    for (let i = 0; i < nO2; i++) {
      const col = totalsAlongPressure(grid, i, m);
      expect(col.counts.map((c) => c.v)).toEqual(flat.slice(i * nP, (i + 1) * nP));
      expect(col.axis.map((a) => a.v)).toEqual(raw.axes.pressure_psi.values);
    }
  });

  it("agrees with readAt at every node of the line through each candidate, with the series provenance", () => {
    for (const c of cands) {
      for (const m of grid.multipliers) {
        const r = readAt(grid, c.o2_pct.v, c.pressure_psi.v, m);
        const row = totalsAlongO2(grid, r.j, m);
        const col = totalsAlongPressure(grid, r.i, m);
        expect(row.counts[r.i]).toEqual(r.total);
        expect(col.counts[r.j]).toEqual(r.total);
        grid.o2.forEach((o2, i) => expect(row.counts[i].v, `${c.id} m=${m} o2=${o2}`).toBe(readAt(grid, o2, c.pressure_psi.v, m).total.v));
        grid.psi.forEach((psi, j) => expect(col.counts[j].v, `${c.id} m=${m} psi=${psi}`).toBe(readAt(grid, c.o2_pct.v, psi, m).total.v));
        const totalP = raw.layers.find((l) => l.multiplier === m)!.total.p;
        expect(new Set([...row.counts, ...col.counts].map((v) => v.p))).toEqual(new Set([totalP]));
        expect(new Set([...row.axis, ...col.axis].map((v) => v.p))).toEqual(new Set([raw.axes.p]));
        expect(row.axis[r.i]).toEqual(r.o2);
        expect(col.axis[r.j]).toEqual(r.psi);
      }
    }
  });

  it("clamps an index past either edge to the edge line", () => {
    expect(totalsAlongO2(grid, -5, 1)).toEqual(totalsAlongO2(grid, 0, 1));
    expect(totalsAlongO2(grid, nP + 9, 1)).toEqual(totalsAlongO2(grid, nP - 1, 1));
    expect(totalsAlongPressure(grid, nO2 + 1, 1)).toEqual(totalsAlongPressure(grid, nO2 - 1, 1));
  });
});
