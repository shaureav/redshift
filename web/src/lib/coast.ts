// The coastline of knowledge (plan, Phase 3). The plane becomes a map: land where the build counted at least
// one test near a node of the probe grid, open sea where it counted none, the coast between. This is geometry on
// built values only: a node is land when its series in probe_grid.json is more than zero, and nothing here adds,
// estimates or shows a count.
//
// Axis order. The grid stores a series at index i_o2 * n_pressure + j_pressure; d3.contours reads
// values[x + y * width]. The mask below is transposed so that x is the O2 index and y the pressure index, and
// d3 puts node (i, j) at the centre of its cell, (i + 0.5, j + 0.5) in contour units. Contours are not smoothed,
// so the coast always runs half way between a node with tests near it and a neighbour without: every node with a
// count above zero is inside the land and every node at zero is outside it (coast.test.ts checks this).
import * as d3 from "d3";
import { layerFor, type Grid } from "./probe";

/** "all" reads the layer's total over every fuel class; "solids" reads the solid series (PSI's tables and
 *  verified papers), the land that Solids only leaves standing. */
export type CoastMode = "all" | "solids";

export interface Coast {
  mode: CoastMode;
  multiplier: number;
  nO2: number;
  nP: number;
  /** 1 where the node is land, in d3.contours order: mask[i + j * nO2]. */
  mask: Uint8Array;
  /** The land, in contour units (node (i, j) at (i + 0.5, j + 0.5)). Empty coordinates mean sea everywhere. */
  land: d3.ContourMultiPolygon;
}

const cache = new WeakMap<Grid, Map<string, Coast>>();

/** The land for one multiplier and mode, computed once per grid and cached. */
export function coastFor(g: Grid, multiplier: number, mode: CoastMode): Coast {
  let byKey = cache.get(g);
  if (!byKey) {
    byKey = new Map();
    cache.set(g, byKey);
  }
  const L = layerFor(g, multiplier);
  const key = `${L.multiplier}|${mode}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const nO2 = g.o2.length;
  const nP = g.psi.length;
  // Each node is tested against "more than zero" on built series; two series are tested one by one (either
  // above zero), never added together.
  const series = mode === "solids" ? [L.near.solid.psi_table.counts, L.near.solid.published_paper.counts] : [L.total.counts];
  const mask = new Uint8Array(nO2 * nP);
  for (let i = 0; i < nO2; i++) {
    for (let j = 0; j < nP; j++) {
      const k = i * nP + j;
      if (series.some((s) => s[k] > 0)) mask[i + j * nO2] = 1;
    }
  }
  // The mask holds only 0 and 1, so the threshold 1 keeps exactly the nodes above zero.
  const [land] = d3.contours().size([nO2, nP]).smooth(false).thresholds([1])(Array.from(mask));
  const coast: Coast = { mode, multiplier: L.multiplier, nO2, nP, mask, land: simplify(land) };
  byKey.set(key, coast);
  return coast;
}

/** Drop the middle point of every straight run along a grid line. A run along a line of constant O2 or constant
 *  pressure stays straight on the plane's scales too (one is linear, the other log, each in one axis only), so
 *  this changes no shape; it only makes the path shorter to draw and to mask. */
function simplify(mp: d3.ContourMultiPolygon): d3.ContourMultiPolygon {
  const ring = (r: number[][]) => {
    const pts = r.slice(0, -1); // d3 closes each ring by repeating its first point
    const out = pts.filter((b, k) => {
      const a = pts[(k - 1 + pts.length) % pts.length];
      const c = pts[(k + 1) % pts.length];
      return !((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]));
    });
    return [...out, out[0]];
  };
  return { ...mp, coordinates: mp.coordinates.map((poly) => poly.map(ring)) };
}

/** Whether node (i, j) is land in this coast. */
export function isLand(c: Coast, i: number, j: number): boolean {
  return i >= 0 && i < c.nO2 && j >= 0 && j < c.nP && c.mask[i + j * c.nO2] === 1;
}

/** One word for a pin, read from the grid at its node. It describes the recorded evidence there, never fire risk:
 *  "at sea" when the node's series is zero; "inland" when it and every node within two grid steps in each
 *  direction (a 5 by 5 block, cut off at the grid's edge) are above zero; otherwise "on the coast". */
export type EvidenceWord = "inland" | "on the coast" | "at sea";
export const NEIGHBOURHOOD = 2;

export function evidenceWord(c: Coast, i: number, j: number): EvidenceWord {
  if (!isLand(c, i, j)) return "at sea";
  for (let di = -NEIGHBOURHOOD; di <= NEIGHBOURHOOD; di++) {
    for (let dj = -NEIGHBOURHOOD; dj <= NEIGHBOURHOOD; dj++) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || ii >= c.nO2 || jj < 0 || jj >= c.nP) continue; // beyond the grid: no node, so nothing to test
      if (!isLand(c, ii, jj)) return "on the coast";
    }
  }
  return "inland";
}

/** What the word means, for the pin's tooltip and the legend. */
export const EVIDENCE_WORD_NOTE = "The word describes the recorded evidence near this point, not fire risk.";

/** The land as an SVG path on the plane's scales, and the stroke width that erases it from the coast inward
 *  (the Solids only wipe): wide enough to reach the middle of the widest land mass, so no land is left. */
export function landPath(c: Coast, g: Grid, x: (o2: number) => number, y: (psi: number) => number): { d: string; erode: number } {
  const o2Step = g.o2[1] - g.o2[0];
  const pStep = g.psi[1] - g.psi[0];
  const px = (gx: number) => Math.round(x(g.o2[0] + (gx - 0.5) * o2Step) * 10) / 10;
  const py = (gy: number) => Math.round(y(g.psi[0] + (gy - 0.5) * pStep) * 10) / 10;
  let d = "";
  let erode = 0;
  for (const poly of c.land.coordinates) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const ring of poly) {
      ring.slice(0, -1).forEach(([gx, gy], k) => {
        const sx = px(gx);
        const sy = py(gy);
        d += `${k ? "L" : "M"}${sx},${sy}`;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      });
      d += "Z";
    }
    // No point inside a shape is further from its edge than half the shorter side of its bounding box.
    erode = Math.max(erode, Math.min(x1 - x0, y1 - y0) + 4);
  }
  return { d, erode };
}

/** The grid's own extent on the plane's scales: half a step beyond its outer nodes, where the land can reach.
 *  Outside it the build computed nothing, so no sea is drawn there either. */
export function gridExtent(g: Grid, x: (o2: number) => number, y: (psi: number) => number) {
  const o2h = (g.o2[1] - g.o2[0]) / 2;
  const ph = (g.psi[1] - g.psi[0]) / 2;
  const x0 = x(g.o2[0] - o2h);
  const x1 = x(g.o2[g.o2.length - 1] + o2h);
  const y0 = y(g.psi[g.psi.length - 1] + ph);
  const y1 = y(g.psi[0] - ph);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
