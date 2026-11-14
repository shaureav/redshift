// The probe: reads nearness counts for any point from probe_grid.json, which the Python build computed at
// every node of a dense grid. Nothing here computes a count. The probe snaps to the nearest node and the
// panel says which node it shows. Lookups are array reads, so a reading costs microseconds.
//
// nearInputs() lists WHICH tests are near a node with a TypeScript copy of the nearness rule
// (redshift/science/nearness.py). probe.test.ts checks that this listing reproduces the build's counts at
// every node and every step multiplier, so the list and the counts cannot drift apart.
import type { Val } from "./types";

export const FUELS = ["gas", "droplet", "solid", "emulator"] as const;
export const SOURCES = ["psi_table", "published_paper"] as const;
export type Fuel = (typeof FUELS)[number];
export type Source = (typeof SOURCES)[number];

interface Series { rle: number[]; u: string; p: string }
interface Layer {
  multiplier: number;
  near: Record<Fuel, Record<Source, Series>>;
  total: Series;
  o2_match_pressure_unknown: Record<Fuel, { by_o2: number[]; u: string; p: string }>;
}
export interface ProbeInput {
  id: string;
  investigation_id: string;
  investigation: string;
  fuel_class: Fuel;
  source_type: Source;
  label: string;
  doi: string | null;
  o2: Val<number | null> | null;
  kpa: Val<number | null> | null;
  o2_range?: Val<number[]>;
  pressure_range_kpa?: Val<number[]>;
  o2_list?: Val<number[] | null>;
}
export interface ProbeGridFile {
  axes: {
    o2_pct: { start: number; stop: number; step: number; n: number; values: number[] };
    pressure_psi: { start: number; stop: number; step: number; n: number; values: number[] };
    pressure_kpa: { values: number[] };
    p: string;
  };
  nearness: { o2_step: number; log_pressure_step: number; threshold: number; o2_basis_counted: string[]; p: string };
  layers: Layer[];
  unknown: Record<"unknown_pressure" | "unknown_o2" | "unknown_both" | "basis_differs", Val<number>>;
  inputs: ProbeInput[];
  pressure_unknown_inputs: ProbeInput[];
  p: string;
}

interface DecodedLayer {
  multiplier: number;
  near: Record<Fuel, Record<Source, { counts: Uint16Array; p: string }>>;
  total: { counts: Uint16Array; p: string };
  o2m: Record<Fuel, { by_o2: number[]; p: string }>;
}
export interface Grid {
  file: ProbeGridFile;
  o2: number[];
  psi: number[];
  kpa: number[];
  layers: DecodedLayer[];
  multipliers: number[];
}

function unrle(pairs: number[], n: number): Uint16Array {
  const out = new Uint16Array(n);
  let k = 0;
  for (let i = 0; i < pairs.length; i += 2) {
    out.fill(pairs[i], k, k + pairs[i + 1]);
    k += pairs[i + 1];
  }
  if (k !== n) throw new Error(`probe grid series has ${k} cells, expected ${n}`);
  return out;
}

export function decodeGrid(file: ProbeGridFile): Grid {
  const n = file.axes.o2_pct.n * file.axes.pressure_psi.n;
  const layers = file.layers.map((l) => {
    const near = {} as DecodedLayer["near"];
    for (const f of FUELS) {
      near[f] = {} as Record<Source, { counts: Uint16Array; p: string }>;
      for (const s of SOURCES) near[f][s] = { counts: unrle(l.near[f][s].rle, n), p: l.near[f][s].p };
    }
    const o2m = {} as DecodedLayer["o2m"];
    for (const f of FUELS) o2m[f] = { by_o2: l.o2_match_pressure_unknown[f].by_o2, p: l.o2_match_pressure_unknown[f].p };
    return { multiplier: l.multiplier, near, total: { counts: unrle(l.total.rle, n), p: l.total.p }, o2m };
  });
  return {
    file,
    o2: file.axes.o2_pct.values,
    psi: file.axes.pressure_psi.values,
    kpa: file.axes.pressure_kpa.values,
    layers,
    multipliers: layers.map((l) => l.multiplier),
  };
}

const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, i));

/** Index of the grid node nearest to a value on an evenly spaced axis. */
export function snapIndex(values: number[], v: number): number {
  const step = values[1] - values[0];
  return clampIdx(Math.round((v - values[0]) / step), values.length);
}

export function inGrid(g: Grid, o2: number, psi: number): boolean {
  return o2 >= g.o2[0] - 1e-9 && o2 <= g.o2[g.o2.length - 1] + 1e-9 && psi >= g.psi[0] - 1e-9 && psi <= g.psi[g.psi.length - 1] + 1e-9;
}

export interface Reading {
  i: number;
  j: number;
  multiplier: number;
  o2: Val<number>;
  psi: Val<number>;
  kpa: Val<number>;
  near: Record<Fuel, Record<Source, Val<number>>>;
  nearClass: Record<Fuel, number>; // psi_table + published_paper, for bar widths only
  total: Val<number>;
  o2m: Record<Fuel, Val<number>>;
  unknown: ProbeGridFile["unknown"];
}

export function layerFor(g: Grid, multiplier: number): DecodedLayer {
  return g.layers.find((l) => l.multiplier === multiplier) ?? g.layers.find((l) => l.multiplier === 1) ?? g.layers[0];
}

/** The build's counts at the node nearest (o2, psi). */
export function readAt(g: Grid, o2: number, psi: number, multiplier = 1): Reading {
  const i = snapIndex(g.o2, o2);
  const j = snapIndex(g.psi, psi);
  const idx = i * g.psi.length + j;
  const L = layerFor(g, multiplier);
  const ap = g.file.axes.p;
  const near = {} as Reading["near"];
  const nearClass = {} as Reading["nearClass"];
  const o2m = {} as Reading["o2m"];
  for (const f of FUELS) {
    near[f] = {} as Record<Source, Val<number>>;
    for (const s of SOURCES) near[f][s] = { v: L.near[f][s].counts[idx], u: "tests", p: L.near[f][s].p };
    nearClass[f] = near[f].psi_table.v + near[f].published_paper.v;
    o2m[f] = { v: L.o2m[f].by_o2[i], u: "tests", p: L.o2m[f].p };
  }
  return {
    i,
    j,
    multiplier: L.multiplier,
    o2: { v: g.o2[i], u: "%", p: ap },
    psi: { v: g.psi[j], u: "psi", p: ap },
    kpa: { v: g.kpa[j], u: "kPa", p: ap },
    near,
    nearClass,
    total: { v: L.total.counts[idx], u: "tests", p: L.total.p },
    o2m,
    unknown: g.file.unknown,
  };
}

/** One line through the grid: the build's near-test totals at every node along one axis, each a Val with the
 *  layer's provenance id, and the axis values those nodes sit at. */
export interface Profile { axis: Val<number>[]; counts: Val<number>[] }

/** The totals along oxygen at pressure index j: one row of the grid, for the panel's sparkline. Array reads only. */
export function totalsAlongO2(g: Grid, j: number, multiplier = 1): Profile {
  const L = layerFor(g, multiplier);
  const jj = clampIdx(j, g.psi.length);
  const ap = g.file.axes.p;
  return {
    axis: g.o2.map((v) => ({ v, u: "%", p: ap })),
    counts: g.o2.map((_, i) => ({ v: L.total.counts[i * g.psi.length + jj], u: "tests", p: L.total.p })),
  };
}

/** The totals along pressure at oxygen index i: one column of the grid, for the panel's sparkline. Array reads only. */
export function totalsAlongPressure(g: Grid, i: number, multiplier = 1): Profile {
  const L = layerFor(g, multiplier);
  const ii = clampIdx(i, g.o2.length);
  const ap = g.file.axes.p;
  const base = ii * g.psi.length;
  return {
    axis: g.psi.map((v) => ({ v, u: "psi", p: ap })),
    counts: g.psi.map((_, j) => ({ v: L.total.counts[base + j], u: "tests", p: L.total.p })),
  };
}

// ---- The nearness rule, ported from redshift/science/nearness.py (parity-tested). ----

export interface Steps { o2: number; logP: number; threshold: number }

export function stepsFor(g: Grid, multiplier: number): Steps {
  const n = g.file.nearness;
  return { o2: n.o2_step * multiplier, logP: n.log_pressure_step * multiplier, threshold: n.threshold };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Distance in steps from a placed test to a point, or null if the test lacks O2 or pressure. */
export function distance(ev: ProbeInput, o2: number, kpa: number, s: Steps): number | null {
  const eo2 = ev.o2?.v;
  const ekpa = ev.kpa?.v;
  if (eo2 == null || ekpa == null || ekpa <= 0) return null;
  const x = ev.o2_range ? clamp(o2, ev.o2_range.v[0], ev.o2_range.v[1]) : eo2;
  const p = ev.pressure_range_kpa ? clamp(kpa, ev.pressure_range_kpa.v[0], ev.pressure_range_kpa.v[1]) : ekpa;
  const d2 = ((x - o2) / s.o2) ** 2 + (Math.log(p / kpa) / s.logP) ** 2;
  return Math.sqrt(d2);
}

export interface NearTest { input: ProbeInput; distance: number }

/** Tests near a grid node, nearest first (ties by id), exactly as nearness.evaluate orders them. */
export function nearInputs(g: Grid, i: number, j: number, multiplier: number): NearTest[] {
  const s = stepsFor(g, multiplier);
  const o2 = g.o2[i];
  const kpa = g.kpa[j];
  const out: NearTest[] = [];
  for (const ev of g.file.inputs) {
    const d = distance(ev, o2, kpa, s);
    if (d !== null && d <= s.threshold) out.push({ input: ev, distance: d });
  }
  out.sort((a, b) => a.distance - b.distance || (a.input.id < b.input.id ? -1 : a.input.id > b.input.id ? 1 : 0));
  return out;
}

/** Tests whose O2 matches the node's O2 within the threshold but whose pressure is not recorded. */
export function o2MatchInputs(g: Grid, i: number, multiplier: number): ProbeInput[] {
  const s = stepsFor(g, multiplier);
  const o2 = g.o2[i];
  return g.file.pressure_unknown_inputs.filter((ev) => {
    const list = ev.o2_list?.v;
    if (ev.o2?.v == null && list && list.length) return list.some((v) => Math.abs(v - o2) / s.o2 <= s.threshold);
    if (ev.o2?.v == null) return false;
    const x = ev.o2_range ? clamp(o2, ev.o2_range.v[0], ev.o2_range.v[1]) : ev.o2.v;
    return Math.abs(x - o2) / s.o2 <= s.threshold;
  });
}

/** Grid indices of a candidate atmosphere, if it sits exactly on a node (all five do). */
export function nodeOf(g: Grid, o2: number, psi: number): { i: number; j: number } | null {
  const i = snapIndex(g.o2, o2);
  const j = snapIndex(g.psi, psi);
  return Math.abs(g.o2[i] - o2) < 1e-9 && Math.abs(g.psi[j] - psi) < 1e-9 ? { i, j } : null;
}
