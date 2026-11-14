// View state for the plane, held in the URL so a link reproduces the exact view: probe position, step
// multiplier, layers, solids only, zoom, brushed area, open panel view and asked question.
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export type Layer = "ev" | "strip" | "blind" | "ft" | "cand" | "pb" | "halo";
export const LAYERS: { id: Layer; label: string }[] = [
  { id: "ev", label: "Tests" },
  { id: "halo", label: "Nearness region" },
  { id: "strip", label: "Pressure not recorded" },
  { id: "blind", label: "Sea hatching (no tests near)" }, // id kept from the planner hatch it replaced, so old links still work
  { id: "ft", label: "Flame temperature" },
  { id: "cand", label: "Candidates" },
  { id: "pb", label: "Prebreathe" },
];
export const DEFAULT_LAYERS: Layer[] = ["ev", "halo", "strip", "blind", "ft", "cand", "pb"];

export const ZOOMS = {
  habitat: { label: "Habitat range", o2: [15, 45] as [number, number], psi: [6, 17] as [number, number] },
  // The whole probe grid (3 to 17 psi) plus headroom to 20 psi, drawn as beyond the grid, so the plane's floating
  // toolbar sits over that band and not over the 14.7 psi tests.
  plane: { label: "Whole plane", o2: [15, 100] as [number, number], psi: [3, 20] as [number, number] },
  all: { label: "All tests", o2: [10, 102] as [number, number], psi: [2.5, 50] as [number, number] },
};
export type ZoomKey = keyof typeof ZOOMS;

export interface Box { o2: [number, number]; psi: [number, number] }

export interface View {
  o2: number;
  psi: number;
  m: number;
  layers: Set<Layer>;
  solids: boolean;
  zoom: ZoomKey;
  box: Box | null;
  panel: "evidence" | "gap";
  ask: string | null;
}

export const DEFAULT_PROBE = { o2: 34, psi: 8.2 };

const num = (s: string | null, fallback: number) => {
  const n = s === null ? NaN : Number.parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

export function parseView(sp: URLSearchParams): View {
  const layersRaw = sp.get("layers");
  const layers = new Set<Layer>(layersRaw === null ? DEFAULT_LAYERS : (layersRaw.split(",").filter(Boolean) as Layer[]));
  const zoomRaw = sp.get("zoom") as ZoomKey | null;
  const boxRaw = sp.get("box")?.split(",").map(Number);
  const box = boxRaw && boxRaw.length === 4 && boxRaw.every(Number.isFinite)
    ? { o2: [Math.min(boxRaw[0], boxRaw[1]), Math.max(boxRaw[0], boxRaw[1])] as [number, number], psi: [Math.min(boxRaw[2], boxRaw[3]), Math.max(boxRaw[2], boxRaw[3])] as [number, number] }
    : null;
  return {
    o2: num(sp.get("o2"), DEFAULT_PROBE.o2),
    psi: num(sp.get("p"), DEFAULT_PROBE.psi),
    m: num(sp.get("m"), 1),
    layers,
    solids: sp.get("solids") === "1",
    zoom: zoomRaw && zoomRaw in ZOOMS ? zoomRaw : "habitat",
    box,
    panel: sp.get("view") === "gap" ? "gap" : "evidence",
    ask: sp.get("ask"),
  };
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

export function writeView(v: Partial<View>, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const put = (k: string, val: string | null) => (val === null ? next.delete(k) : next.set(k, val));
  if (v.o2 !== undefined) put("o2", fmt(v.o2));
  if (v.psi !== undefined) put("p", fmt(v.psi));
  if (v.m !== undefined) put("m", v.m === 1 ? null : fmt(v.m));
  if (v.layers !== undefined) {
    const same = v.layers.size === DEFAULT_LAYERS.length && DEFAULT_LAYERS.every((l) => v.layers!.has(l));
    put("layers", same ? null : [...v.layers].join(","));
  }
  if (v.solids !== undefined) put("solids", v.solids ? "1" : null);
  if (v.zoom !== undefined) put("zoom", v.zoom === "habitat" ? null : v.zoom);
  if (v.box !== undefined) put("box", v.box ? [v.box.o2[0], v.box.o2[1], v.box.psi[0], v.box.psi[1]].map(fmt).join(",") : null);
  if (v.panel !== undefined) put("view", v.panel === "gap" ? "gap" : null);
  if (v.ask !== undefined) put("ask", v.ask);
  return next;
}

export function useView(): [View, (patch: Partial<View>, opts?: { push?: boolean }) => void] {
  const [sp, setSp] = useSearchParams();
  const view = useMemo(() => parseView(sp), [sp]);
  // react-router hands back a new setter whenever the search string changes. Keep one stable function that
  // calls the latest setter, so callbacks built on it do not change identity every time the view moves.
  const latest = useRef(setSp);
  useLayoutEffect(() => {
    latest.current = setSp;
  }, [setSp]);
  const update = useCallback(
    (patch: Partial<View>, opts?: { push?: boolean }) => latest.current((cur) => writeView(patch, cur), { replace: !opts?.push }),
    [],
  );
  return [view, update];
}

/** Parse free text such as "8.2 psi 34%", "34% at 8.2" or "34, 8.2" into a probe position. */
export function parsePoint(text: string): { o2: number; psi: number } | null {
  const t = text.toLowerCase().replace(/,/g, " ");
  const pct = t.match(/(\d+(?:\.\d+)?)\s*%/);
  const psi = t.match(/(\d+(?:\.\d+)?)\s*psi/);
  if (pct && psi) return { o2: Number(pct[1]), psi: Number(psi[1]) };
  const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (nums.length !== 2) return null;
  if (pct) return { o2: Number(pct[1]), psi: nums.find((n) => n !== Number(pct[1])) ?? nums[1] };
  if (psi) return { psi: Number(psi[1]), o2: nums.find((n) => n !== Number(psi[1])) ?? nums[0] };
  // Two bare numbers: pressure is the one that fits a cabin (below 20 psi), oxygen the other.
  const [a, b] = nums;
  return a <= 20 && b > 20 ? { psi: a, o2: b } : { o2: a, psi: b };
}
