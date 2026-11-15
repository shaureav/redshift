// The coastline is geometry on built values (plan, Phase 3): the land must cover exactly the probe-grid nodes
// whose series is above zero, at every step multiplier and in both modes, and a pin's word must follow its rule.
import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import { coastFor, coastNear, evidenceWord, gridExtent, isLand, landPath, type Coast, type CoastMode } from "./coast";
import { decodeGrid, layerFor, nodeOf, type ProbeGridFile } from "./probe";
import { loadSnapshot as load } from "./snapshot.fixture";

const grid = decodeGrid(load<ProbeGridFile>("probe_grid.json"));
const nO2 = grid.o2.length;
const nP = grid.psi.length;
const cands = load<{ candidates: { id: string; o2_pct: { v: number }; pressure_psi: { v: number } }[] }>("candidates.json").candidates;

/** Point in the land, by the even-odd rule over every ring (outer rings and holes alike). */
function onLand(c: Coast, gx: number, gy: number): boolean {
  let inside = false;
  for (const poly of c.land.coordinates) for (const ring of poly) if (d3.polygonContains(ring as [number, number][], [gx, gy])) inside = !inside;
  return inside;
}

/** The built series at node (i, j) for a mode, read straight from the decoded grid (grid order, i * nP + j). */
function above(mode: CoastMode, m: number, i: number, j: number): boolean {
  const L = layerFor(grid, m);
  const k = i * nP + j;
  return mode === "solids" ? L.near.solid.psi_table.counts[k] > 0 || L.near.solid.published_paper.counts[k] > 0 : L.total.counts[k] > 0;
}

/** Every node next to a change from land to sea (where an error would show first), plus every fifth node. */
function sample(mode: CoastMode, m: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < nO2; i++) {
    for (let j = 0; j < nP; j++) {
      const a = above(mode, m, i, j);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => {
        const ii = i + di;
        const jj = j + dj;
        return ii >= 0 && ii < nO2 && jj >= 0 && jj < nP && above(mode, m, ii, jj) !== a;
      });
      if (edge || (i % 5 === 0 && j % 5 === 0)) out.push([i, j]);
    }
  }
  return out;
}

describe("the coastline of knowledge", () => {
  const cases = grid.multipliers.flatMap((m) => (["all", "solids"] as const).map((mode) => [m, mode] as const));

  it.each(cases)("covers exactly the nodes above zero (%sx, %s)", (m, mode) => {
    const c = coastFor(grid, m, mode);
    const nodes = sample(mode, m);
    expect(nodes.length).toBeGreaterThan(900);
    const wrong = nodes.filter(([i, j]) => onLand(c, i + 0.5, j + 0.5) !== above(mode, m, i, j));
    expect(wrong).toEqual([]);
    // The mask the pins read agrees with the series too.
    expect(nodes.filter(([i, j]) => isLand(c, i, j) !== above(mode, m, i, j))).toEqual([]);
  });

  it("transposes the grid: x is the O2 index and y the pressure index", () => {
    // A node near 21% O2 and 14.7 psi has tests near it; read it both ways and check they are the same node.
    const n = nodeOf(grid, 21, 14.7)!;
    expect(above("all", 1, n.i, n.j)).toBe(true);
    const c = coastFor(grid, 1, "all");
    expect(c.mask[n.i + n.j * nO2]).toBe(1);
    expect(onLand(c, n.i + 0.5, n.j + 0.5)).toBe(true);
  });

  it("has land at every multiplier, and none for solids (no solid test can be placed in this snapshot)", () => {
    for (const m of grid.multipliers) {
      expect(coastFor(grid, m, "all").land.coordinates.length).toBeGreaterThan(0);
      const solids = coastFor(grid, m, "solids");
      const anySolid = Array.from({ length: nO2 * nP }, (_, k) => k).some((k) => layerFor(grid, m).near.solid.psi_table.counts[k] > 0 || layerFor(grid, m).near.solid.published_paper.counts[k] > 0);
      expect(solids.land.coordinates.length > 0).toBe(anySolid);
    }
  });

  it("caches one coast per multiplier and mode", () => {
    expect(coastFor(grid, 1.5, "all")).toBe(coastFor(grid, 1.5, "all"));
    expect(coastFor(grid, 1.5, "all")).not.toBe(coastFor(grid, 1, "all"));
    expect(coastFor(grid, 1, "solids")).not.toBe(coastFor(grid, 1, "all"));
  });

  it("maps contour units to the plane: a node's centre lands on its own O2 and pressure", () => {
    const x = d3.scaleLinear().domain([15, 100]).range([0, 850]);
    const y = d3.scaleLog().domain([3, 17]).range([500, 0]);
    const { d, erode } = landPath(coastFor(grid, 1, "all"), grid, x, y);
    expect(d.startsWith("M")).toBe(true);
    expect(erode).toBeGreaterThan(4);
    const ext = gridExtent(grid, x, y);
    expect(ext.x).toBeCloseTo(x(14.75), 6);
    expect(ext.x + ext.w).toBeCloseTo(x(100.25), 6);
    expect(ext.y).toBeCloseTo(y(17.05), 6);
  });
});

describe("the coast pulse (Phase 4)", () => {
  const x = d3.scaleLinear().domain([15, 45]).range([0, 900]);
  const y = d3.scaleLog().domain([6, 17]).range([600, 0]);

  it("is a short stretch of the coast itself, next to the probe", () => {
    const c = coastFor(grid, 1, "all");
    const at = { px: x(34), py: y(8.2) };
    const d = coastNear(c, grid, x, y, at.px, at.py, 48);
    const pts = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(pts.length).toBeGreaterThan(1);
    // About 96 px long in all (48 either side), unless a small island's coast is shorter.
    const len = pts.slice(1).reduce((a, p, k) => a + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0);
    expect(len).toBeLessThanOrEqual(96.5);
    expect(len).toBeGreaterThan(8);
    // Every point of it lies on the land's outline (landPath's vertices or between two of them).
    const land = landPath(c, grid, x, y).d;
    const rings = land.split("Z").filter(Boolean).map((r) => [...r.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
    const onOutline = ([px, py]: number[]) => rings.some((ring) => ring.some((a, k) => {
      const b = ring[(k + 1) % ring.length];
      const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      const t = len2 ? Math.max(0, Math.min(1, ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / len2)) : 0;
      return Math.hypot(a[0] + t * (b[0] - a[0]) - px, a[1] + t * (b[1] - a[1]) - py) < 0.3;
    }));
    expect(pts.filter((p) => !onOutline(p))).toEqual([]);
  });

  // D44: whether Solids only has a coast depends on the data (verified paper burns are placed), so the rule is
  // tested, not a count: no solid land, no pulse; solid land, a pulse along its coast.
  it("is empty exactly where there is no coast (Solids only has land only near placed solid tests)", () => {
    const solids = coastFor(grid, 1, "solids");
    const anyLand = grid.o2.some((_, i) => grid.psi.some((_, j) => isLand(solids, i, j)));
    const pulse = coastNear(solids, grid, x, y, 100, 100);
    if (anyLand) expect(pulse).not.toBe("");
    else expect(pulse).toBe("");
  });
});

describe("pin words", () => {
  /** The rule, written out a second way: the node, then the 5 by 5 block around it inside the grid. */
  function expected(c: Coast, i: number, j: number) {
    if (!isLand(c, i, j)) return "at sea";
    const block = [];
    for (let ii = Math.max(0, i - 2); ii <= Math.min(nO2 - 1, i + 2); ii++) for (let jj = Math.max(0, j - 2); jj <= Math.min(nP - 1, j + 2); jj++) block.push(isLand(c, ii, jj));
    return block.every(Boolean) ? "inland" : "on the coast";
  }

  it.each(grid.multipliers)("follows the rule at every candidate and on a sample of nodes (%sx)", (m) => {
    for (const mode of ["all", "solids"] as const) {
      const c = coastFor(grid, m, mode);
      for (const cand of cands) {
        const n = nodeOf(grid, cand.o2_pct.v, cand.pressure_psi.v)!;
        expect(evidenceWord(c, n.i, n.j), `${cand.id} ${m} ${mode}`).toBe(expected(c, n.i, n.j));
      }
      for (const [i, j] of sample(mode, m)) expect(evidenceWord(c, i, j)).toBe(expected(c, i, j));
    }
  });

  // D44: under Solids only a candidate is at sea exactly when the build counts no solid test near it (from the
  // PSI tables or from verified papers); once paper burns are verified, candidates near them are not at sea.
  it("is at sea under Solids only exactly where the build counts no solid test near the candidate", () => {
    const c = coastFor(grid, 1, "solids");
    const ev = load<{ evidence: { candidate_id: string; near: { solid: { psi_table: { v: number }; published_paper: { v: number } } } }[] }>("candidate_evidence.json").evidence;
    for (const cand of cands as { id: string; o2_pct: { v: number }; pressure_psi: { v: number } }[]) {
      const n = nodeOf(grid, cand.o2_pct.v, cand.pressure_psi.v)!;
      const e = ev.find((x) => x.candidate_id === cand.id)!;
      const solidNear = e.near.solid.psi_table.v + e.near.solid.published_paper.v;
      if (solidNear === 0) expect(evidenceWord(c, n.i, n.j), cand.id).toBe("at sea");
      else expect(evidenceWord(c, n.i, n.j), cand.id).not.toBe("at sea");
    }
  });

  it("uses all three words on a made-up coast", () => {
    // A 7 by 7 grid with a 5 by 5 block of land at its centre: the middle node is inland, an edge node of the
    // block is on the coast, and a node outside it is at sea.
    const mask = new Uint8Array(49);
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) mask[i + j * 7] = 1;
    const c: Coast = { mode: "all", multiplier: 1, nO2: 7, nP: 7, mask, land: { type: "MultiPolygon", value: 1, coordinates: [] } };
    expect(evidenceWord(c, 3, 3)).toBe("inland");
    expect(evidenceWord(c, 1, 3)).toBe("on the coast");
    expect(evidenceWord(c, 0, 0)).toBe("at sea");
  });
});
