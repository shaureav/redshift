// The plane: oxygen (x) against cabin pressure (y, log scale, psi with kPa on the right), full screen, drawn as a
// map (plan, Phase 3). Land is where the build counted at least one test near a node of the probe grid; open sea,
// hatched, is where it counted none (unknown, not safe); the coast is the line between. Candidates are pins whose
// one word (inland, on the coast, at sea) describes the recorded evidence at their node, never risk.
// A probe can be dragged anywhere, moved with the arrow keys, or snapped to a candidate atmosphere. Everything
// drawn comes from the Python build; this file only places it. The probe position is snapped to the probe grid,
// so the panel always shows counts the build computed for exactly that node.
//
// Two stacked SVGs: the base (land, sea, coast, isotherms, glyphs, pins, axes, strips) renders once per view; the
// overlay (nearness halo, probe, selection, pointer surface) is the only thing that repaints while the probe
// moves, so a drag stays within a frame even with every glyph on the plane. The floating toolbar sits in the
// plane's top left corner, above both.
import * as d3 from "d3";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FUEL_COLOR_VAR, FUEL_EDGE_VAR, FUEL_RING_VAR, Hatch, markerPath } from "../components/Common";
import { Value } from "../components/Value";
import { coastFor, coastNear, EVIDENCE_WORD_NOTE, gridExtent, isLand, landPath, type Coast, type EvidenceWord } from "../lib/coast";
import { fmtNumber, FUEL_LABEL } from "../lib/format";
import { useReducedMotion } from "../lib/motion";
import { nodeOf, snapIndex, type Grid } from "../lib/probe";
import type { Candidate } from "../lib/types";
import { ZOOMS, type Box, type View } from "../lib/view";
import type { FlameGrid, MapPoint, PrebreathePoint, Strip, TradeMapData } from "./TradeMap";

const KPA_PER_PSI = 6.894757293168361; // axis labels only; every value shown in the panel carries its own kPa
const MAGNET_PX = 14;
// Glyphs are clipped to the plot plus this margin, not to the plot itself, so a test on the edge of the domain
// (15% O2, say) draws whole: the largest marker, the emulator diamond at r = 12, reaches 15.6 px plus its stroke.
const GLYPH_PAD = 18;
// Each trade-map bin (tests at identical recorded O2 and pressure) is drawn once, its area growing with its count.
const binRadius = d3.scaleSqrt().domain([1, 40]).range([4, 12]).clamp(true);
// A map pin: its tip on the atmosphere, its head 14 px above it.
const PIN = "M0,0C-1.8,-4.6 -6,-8.4 -6,-14A6,6 0 1,1 6,-14C6,-8.4 1.8,-4.6 0,0Z";
// The probe trail (plan, Phase 4): its last 40 positions. A move longer than TRAIL_JUMP_PX (a candidate chosen
// from the menu, the pointer leaving the plane) starts a new trail rather than drawing a line across the plane;
// after TRAIL_REST_MS without a move the trail fades away.
const TRAIL_N = 40;
const TRAIL_JUMP_PX = 96;
const TRAIL_REST_MS = 1200;
interface TrailPt { o2: number; psi: number; land: boolean }

/** A short buzz on a phone as the probe crosses the coast. Not every browser has vibrate, and some refuse it. */
function buzz() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(12);
  } catch {
    /* not allowed here: the coast pulse still shows the crossing */
  }
}

export type ProbeMode = "hover" | "drag" | "commit";

interface Props {
  map: TradeMapData;
  candidates: Candidate[];
  grid: Grid;
  flame?: FlameGrid;
  prebreathe?: PrebreathePoint[];
  view: View;
  probe: { o2: number; psi: number };
  /** Each candidate's evidence word at the current step size and mode (lib/coast.ts). */
  words: Partial<Record<string, EvidenceWord>>;
  /** Solids only changed while this page was open, so the land sinks (or rises) on screen. */
  scene: boolean;
  toolbar?: ReactNode;
  brushMode: boolean;
  onProbe: (o2: number, psi: number, mode: ProbeMode) => void;
  onHoverEnd: () => void;
  onBrush: (box: Box | null) => void;
  onOpenCandidate: (id: string) => void;
  onToggleBrush: () => void;
}

function useSize<T extends HTMLElement>(fallback: { w: number; h: number }, min = 320) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.max(min, Math.ceil(e.contentRect.width));
      const h = Math.max(min, Math.ceil(e.contentRect.height));
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return [ref, size] as const;
}

function stripRowHeight(s: Strip, solids: boolean): number {
  return solids && s.fuel_class === "solid" ? 32 : solids ? 12 : 16;
}

interface Frame {
  w: number;
  h: number;
  m: { top: number; right: number; bottom: number; left: number };
  iw: number;
  ih: number;
  narrow: boolean;
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLogarithmic<number, number>;
  z: (typeof ZOOMS)[keyof typeof ZOOMS];
  strips: Strip[];
}

function useFrame(w: number, h: number, view: View, rawStrips: Strip[], top: number): Frame {
  const strips = useMemo(() => {
    const order = ["solid", "emulator", "gas", "droplet"];
    return [...rawStrips].sort((a, b) => order.indexOf(a.fuel_class) - order.indexOf(b.fuel_class));
  }, [rawStrips]);
  const narrow = w < 640;
  const z = ZOOMS[view.zoom];
  const showStrip = view.layers.has("strip");
  const stripH = showStrip ? 32 + strips.reduce((a, s) => a + stripRowHeight(s, view.solids) + 4, 0) : 0;
  // Narrow margins still fit the rotated axis titles beside their tick labels and the strip lane labels.
  const left = narrow ? 50 : 56;
  const right = narrow ? 52 : 56;
  const bottom = 48 + stripH;
  const iw = w - left - right;
  const ih = Math.max(160, h - top - bottom);
  const x = useMemo(() => d3.scaleLinear().domain(z.o2).range([0, iw]), [z, iw]);
  const y = useMemo(() => d3.scaleLog().domain(z.psi).range([ih, 0]), [z, ih]);
  const m = useMemo(() => ({ top, right, bottom, left }), [top, right, bottom, left]);
  // One stable object per layout, so the memoised base layer is skipped while the probe moves.
  return useMemo(() => ({ w, h, m, iw, ih, narrow, x, y, z, strips }), [w, h, m, iw, ih, narrow, x, y, z, strips]);
}

/** A glyph where it is drawn, for the base layer and for the overlay's hover badge. */
interface Placed { p: MapPoint; px: number; py: number; r: number }

type Rect = { x0: number; x1: number; y0: number; y1: number };

export function Plane(props: Props) {
  const { map, candidates, grid, flame, prebreathe, view, probe, words, scene, toolbar, brushMode, onProbe, onHoverEnd, onBrush, onOpenCandidate, onToggleBrush } = props;
  const [wrap, { w, h }] = useSize<HTMLDivElement>({ w: 960, h: 640 });
  const [tbRef, tb] = useSize<HTMLDivElement>({ w: 300, h: 40 }, 0);
  const overlay = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [hoverBin, setHoverBin] = useState<Placed | null>(null);
  const [pointerOn, setPointerOn] = useState(false);
  const [focused, setFocused] = useState(false);
  const raf = useRef<number | null>(null);
  const touchDrag = useRef(false); // the drag under way is a finger's (haptics are for phones)
  // The toolbar floats over the plot's top left corner. On a narrow screen its 44 px touch tools would cover the
  // 14.7 psi tests on a short plot, so there it gets a band of its own above the plot (until Phase 6 folds it
  // into one menu button).
  const band = w < 640 && !!toolbar;
  const f = useFrame(w, h, view, map.strips, band ? tb.h + 16 : 16);
  const { m, iw, ih, x, y, z, narrow } = f;

  const onCand = candidates.find((c) => c.o2_pct.v === probe.o2 && c.pressure_psi.v === probe.psi);

  // The toolbar's corner of the plane, in plot coordinates: isotherm labels and pin labels keep clear of it.
  const tbLeft = narrow ? 8 : m.left + 8;
  const tbTop = band ? 8 : m.top + 8;
  const reserve = useMemo<Rect>(() => ({ x0: tbLeft - m.left - 4, y0: tbTop - m.top - 4, x1: tbLeft - m.left + tb.w + 4, y1: tbTop - m.top + tb.h + 4 }), [tbLeft, tbTop, m, tb]);

  const placed = useMemo<Placed[]>(
    () => map.points
      .filter((p) => p.pressure_psi >= z.psi[0] && p.pressure_psi <= z.psi[1] && p.o2_pct >= z.o2[0] && p.o2_pct <= z.o2[1])
      .map((p) => ({ p, px: x(p.o2_pct), py: y(p.pressure_psi), r: binRadius(p.n) })),
    [map.points, z, x, y],
  );

  // ---- pointer to data, snapped to a candidate (magnet) or to the probe grid ----
  const toData = useCallback(
    (clientX: number, clientY: number, clampToPlot = true) => {
      const r = overlay.current?.getBoundingClientRect();
      if (!r) return null;
      let px = clientX - r.left - m.left;
      let py = clientY - r.top - m.top;
      if (!clampToPlot && (px < 0 || px > iw || py < 0 || py > ih)) return null;
      px = Math.max(0, Math.min(iw, px));
      py = Math.max(0, Math.min(ih, py));
      for (const c of candidates) {
        if (Math.hypot(x(c.o2_pct.v) - px, y(c.pressure_psi.v) - py) < MAGNET_PX) return { o2: c.o2_pct.v, psi: c.pressure_psi.v, px, py };
      }
      return { o2: grid.o2[snapIndex(grid.o2, x.invert(px))], psi: grid.psi[snapIndex(grid.psi, y.invert(py))], px, py };
    },
    [candidates, grid, iw, ih, m, x, y],
  );

  // The bin under the pointer, for its count badge. Once a badge shows it stays while the pointer is within a
  // few pixels of its glyph, so the pointer can travel onto the badge (a Value: it opens the bin's source).
  const binAt = (px: number, py: number, current: Placed | null): Placed | null => {
    if (!view.layers.has("ev")) return null;
    if (current && Math.hypot(current.px - px, current.py - py) <= current.r + 14) return current;
    let best: Placed | null = null;
    let bestD = Infinity;
    for (const g of placed) {
      if (view.solids && g.p.fuel_class !== "solid") continue; // ghosted under Solids only
      const d = Math.hypot(g.px - px, g.py - py);
      if (d <= g.r + 2 && d < bestD) {
        best = g;
        bestD = d;
      }
    }
    return best;
  };

  const schedule = (fn: () => void) => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      fn();
    });
  };

  const onPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    const d = toData(e.clientX, e.clientY);
    if (!d) return;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* no capture available (synthetic pointer): dragging still works while the pointer stays on the plane */
    }
    setHoverBin(null);
    if (brushMode) {
      setBrush({ x0: d.px, y0: d.py, x1: d.px, y1: d.py });
      return;
    }
    touchDrag.current = e.pointerType === "touch";
    setDragging(true);
    onProbe(d.o2, d.psi, "drag");
  };
  const onPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const d = toData(e.clientX, e.clientY, dragging || brush !== null);
    if (!d) return;
    if (brush) {
      setBrush((b) => (b ? { ...b, x1: d.px, y1: d.py } : b));
      return;
    }
    schedule(() => {
      setPointerOn(true);
      if (!dragging) setHoverBin((cur) => binAt(d.px, d.py, cur));
      onProbe(d.o2, d.psi, dragging ? "drag" : "hover");
    });
  };
  const onPointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    if (brush) {
      const b = brush;
      setBrush(null);
      if (Math.abs(b.x1 - b.x0) < 6 || Math.abs(b.y1 - b.y0) < 6) return onBrush(null);
      const o2a = x.invert(Math.min(b.x0, b.x1));
      const o2b = x.invert(Math.max(b.x0, b.x1));
      const pa = y.invert(Math.max(b.y0, b.y1));
      const pb = y.invert(Math.min(b.y0, b.y1));
      return onBrush({ o2: [Math.round(o2a * 10) / 10, Math.round(o2b * 10) / 10], psi: [Math.round(pa * 100) / 100, Math.round(pb * 100) / 100] });
    }
    if (dragging) {
      const d = toData(e.clientX, e.clientY);
      setDragging(false);
      if (d) onProbe(d.o2, d.psi, "commit");
    }
  };
  const badge = useRef<HTMLDivElement>(null);
  const onPointerLeave = (e: React.PointerEvent<SVGRectElement>) => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setPointerOn(false);
    if (!(e.relatedTarget instanceof Node && badge.current?.contains(e.relatedTarget))) setHoverBin(null);
    if (!dragging && !brush) onHoverEnd();
  };

  // ---- keyboard: arrows step one grid node; Alt steps ten; Shift jumps to the next candidate ----
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (e.key === "b" || e.key === "B") {
      e.preventDefault();
      onToggleBrush();
      return;
    }
    if (e.key === "Escape") {
      onBrush(null);
      return;
    }
    if (e.key === "Enter") {
      if (onCand) onOpenCandidate(onCand.id);
      return;
    }
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const dy = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    if (e.shiftKey) {
      const here = { px: x(probe.o2), py: y(probe.psi) };
      const ahead = candidates
        .map((c) => ({ c, px: x(c.o2_pct.v), py: y(c.pressure_psi.v) }))
        .filter(({ px, py }) => (dx ? Math.sign(px - here.px) === dx && Math.abs(px - here.px) > 1 : Math.sign(here.py - py) === dy && Math.abs(py - here.py) > 1))
        .sort((a, b) => Math.hypot(a.px - here.px, a.py - here.py) - Math.hypot(b.px - here.px, b.py - here.py));
      if (ahead[0]) onProbe(ahead[0].c.o2_pct.v, ahead[0].c.pressure_psi.v, "commit");
      return;
    }
    const n = e.altKey ? 10 : 1;
    const i = Math.max(0, Math.min(grid.o2.length - 1, snapIndex(grid.o2, probe.o2) + dx * n));
    const j = Math.max(0, Math.min(grid.psi.length - 1, snapIndex(grid.psi, probe.psi) + dy * n));
    onProbe(grid.o2[i], grid.psi[j], "commit");
  };

  // ---- probe geometry (the only thing that changes while dragging) ----
  // The nearness region is an ellipse on these scales: O2 is linear and pressure is logarithmic, so a fixed
  // step in log pressure is a fixed height wherever the probe is. Its radii change with the view, not the probe.
  const nr = grid.file.nearness;
  const halo = useMemo(() => {
    const a = nr.threshold * nr.o2_step * view.m;
    const b = nr.threshold * nr.log_pressure_step * view.m;
    return { rx: x(z.o2[0] + a) - x(z.o2[0]), ry: y(z.psi[0]) - y(z.psi[0] * Math.exp(b)) };
  }, [nr, view.m, x, y, z]);
  const pxp = x(probe.o2);
  const pyp = y(probe.psi);
  const tag = `${fmtNumber(probe.o2)}% O2 · ${fmtNumber(probe.psi)} psi`;
  // The tag's box is the text's measured width plus 8 px each side. Until the text is measured (the first
  // paint, a server render) a character-count guess stands in. Tabular figures keep the width steady while the
  // probe moves, so a drag rarely changes it.
  const tagText = useRef<SVGTextElement>(null);
  const [tagTextW, setTagTextW] = useState<number | null>(null);
  const measureTag = useCallback(() => {
    const el = tagText.current;
    if (!el || typeof el.getComputedTextLength !== "function") return;
    const w = el.getComputedTextLength();
    if (w > 0) setTagTextW(Math.ceil(w));
  }, []);
  // Measured again only when the tag's shape changes (its digits read as 0): tabular figures give every tag of
  // one shape the same width, and measuring forces a layout, which on every step of a drag cost more than the
  // drag itself.
  const tagShape = tag.replace(/\d/g, "0");
  useLayoutEffect(measureTag, [tagShape, measureTag]);
  useEffect(() => {
    void document.fonts?.ready.then(measureTag); // the web font may arrive after the first measure
  }, [measureTag]);
  const tagW = (tagTextW ?? tag.length * 7) + 16;
  const tagLeft = pxp + 16 + tagW > iw;
  const glide = dragging ? "none" : "transform var(--t-move) var(--ease-out)";
  const candWord = onCand ? words[onCand.id] : undefined;
  const showTip = !!onCand && (pointerOn || focused) && view.layers.has("cand") && !dragging;
  const tipRight = pxp + 16 + 256 > iw;

  // ---- feel (plan, Phase 4): snap ping, coast pulse, trail and haptics, all on the overlay ----
  // Each is decided while rendering from the probe's previous state (no extra pass per move), and none shows a
  // number: they are geometry on the same built land and sea the base layer draws.
  const reduced = useReducedMotion();
  const coast = useMemo(() => coastFor(grid, view.m, view.solids ? "solids" : "all"), [grid, view.m, view.solids]);
  const node = nodeOf(grid, probe.o2, probe.psi);
  const land = node ? isLand(coast, node.i, node.j) : null; // null beyond the grid, where nothing was computed

  // A ring expands from a pin as the probe snaps onto it (by magnet, key, menu or shortcut).
  const candId = onCand?.id ?? null;
  const [pingFor, setPingFor] = useState(candId);
  const [ping, setPing] = useState(0);
  if (pingFor !== candId) {
    setPingFor(candId);
    if (candId) setPing((n) => n + 1);
  }

  // The stretch of coast nearest the probe brightens as the probe crosses it, either way. A new coast (Solids
  // only, a new step size) is not a crossing: the probe did not move.
  const [shore, setShore] = useState<{ coast: Coast; land: boolean | null }>({ coast, land });
  const [pulse, setPulse] = useState<{ n: number; d: string } | null>(null);
  if (shore.coast !== coast || shore.land !== land) {
    const crossed = shore.coast === coast && shore.land !== null && land !== null;
    setShore({ coast, land });
    if (crossed) setPulse({ n: (pulse?.n ?? 0) + 1, d: coastNear(coast, grid, x, y, pxp, pyp) });
  }
  // On a phone, a short buzz as a finger drags the probe across the coast.
  const buzzed = useRef(0);
  useEffect(() => {
    if (!pulse || pulse.n === buzzed.current) return;
    buzzed.current = pulse.n;
    if (dragging && touchDrag.current) buzz();
  }, [pulse, dragging]);

  // The trail: off with the layer and under reduced motion.
  const trailOn = view.layers.has("trail") && !reduced;
  const [trail, setTrail] = useState<TrailPt[]>([]);
  const [trailRest, setTrailRest] = useState(false);
  const lastPt = trail[trail.length - 1];
  if (trailOn && (!lastPt || lastPt.o2 !== probe.o2 || lastPt.psi !== probe.psi)) {
    const pt = { o2: probe.o2, psi: probe.psi, land: !!land };
    const fresh = !lastPt || trailRest || Math.hypot(x(lastPt.o2) - pxp, y(lastPt.psi) - pyp) > TRAIL_JUMP_PX;
    setTrail(fresh ? [pt] : [...trail.slice(1 - TRAIL_N), pt]);
    if (trailRest) setTrailRest(false);
  } else if (!trailOn && trail.length) {
    setTrail([]);
  }
  useEffect(() => {
    if (trail.length < 2) return;
    const t = setTimeout(() => setTrailRest(true), TRAIL_REST_MS);
    return () => clearTimeout(t);
  }, [trail]);

  return (
    <div ref={wrap} className="relative h-full w-full select-none" onPointerLeave={() => setHoverBin(null)}>
      {toolbar && (
        <div ref={tbRef} className="absolute z-10" style={{ left: tbLeft, top: tbTop, maxWidth: w - tbLeft - 8 }}>
          {toolbar}
        </div>
      )}
      <LandLayer frame={f} grid={grid} multiplier={view.m} solids={view.solids} scene={scene} hatch={view.layers.has("blind")} />
      <PlaneBase
        frame={f}
        grid={grid}
        placed={placed}
        candidates={candidates}
        words={words}
        flame={flame}
        prebreathe={prebreathe}
        layers={view.layers}
        solids={view.solids}
        scene={scene}
        reserve={reserve}
        placedSolid={map.points.some((p) => p.fuel_class === "solid")}
        activeCandidate={onCand?.id ?? null}
      />
      <svg
        ref={overlay}
        width={w}
        height={h}
        role="application"
        tabIndex={0}
        aria-roledescription="plane"
        aria-label={`Oxygen against cabin pressure. Probe at ${tag}${onCand ? `, on ${onCand.name}${candWord ? `, ${candWord}. ${EVIDENCE_WORD_NOTE}` : "."}` : "."} Arrow keys move the probe one grid step, Alt with an arrow moves ten, Shift with an arrow jumps to the next candidate atmosphere, Enter opens its dossier, B selects an area.`}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 block rounded-lg focus-visible:outline-offset-[-2px]"
        style={{ willChange: "transform" }}
      >
        <defs>
          <clipPath id="plane-clip-overlay"><rect width={iw} height={ih} /></clipPath>
          {/* A soft fill, a little stronger towards its edge, with no line: the region reads without a dash. */}
          <radialGradient id="plane-halo">
            <stop offset="0%" stopColor="var(--probe)" stopOpacity={0.02} />
            <stop offset="80%" stopColor="var(--probe)" stopOpacity={0.04} />
            <stop offset="100%" stopColor="var(--probe)" stopOpacity={0.09} />
          </radialGradient>
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          <g clipPath="url(#plane-clip-overlay)">
            {view.box && !brush && (
              <rect x={x(view.box.o2[0])} y={y(view.box.psi[1])} width={x(view.box.o2[1]) - x(view.box.o2[0])} height={y(view.box.psi[0]) - y(view.box.psi[1])} fill="var(--accent)" fillOpacity={0.06} stroke="var(--accent)" strokeDasharray="4 3" />
            )}
            {brush && (
              <rect x={Math.min(brush.x0, brush.x1)} y={Math.min(brush.y0, brush.y1)} width={Math.abs(brush.x1 - brush.x0)} height={Math.abs(brush.y1 - brush.y0)} fill="var(--accent)" fillOpacity={0.08} stroke="var(--accent)" strokeDasharray="4 3" />
            )}
            {/* The trail, oldest segment faintest: wider and in the trail colour over land, thinner and quiet over
                sea, so land and sea read apart without colour too. */}
            {trailOn && trail.length > 1 && (
              <g className="trail" data-rest={trailRest} pointerEvents="none" strokeLinecap="round" aria-hidden="true">
                {trail.slice(1).map((pt, k) => (
                  <line
                    key={k}
                    x1={x(trail[k].o2)}
                    y1={y(trail[k].psi)}
                    x2={x(pt.o2)}
                    y2={y(pt.psi)}
                    stroke={pt.land ? "var(--trail)" : "var(--trail-sea)"}
                    strokeWidth={pt.land ? 2.5 : 1.5}
                    strokeOpacity={Math.round((0.3 + (0.65 * (k + 1)) / (trail.length - 1)) * 100) / 100}
                  />
                ))}
              </g>
            )}
            {pulse && <path key={pulse.n} d={pulse.d} className="coast-pulse" fill="none" stroke="var(--probe)" strokeWidth={2.5} strokeLinecap="round" pointerEvents="none" />}
            {onCand && ping > 0 && (
              <circle key={ping} cx={x(onCand.o2_pct.v)} cy={y(onCand.pressure_psi.v)} r={12} className="snap-ping" fill="none" stroke="var(--probe)" strokeWidth={2} pointerEvents="none" />
            )}
            <g style={{ transform: `translate(${pxp}px, ${pyp}px)`, transition: glide }} pointerEvents="none">
              <g className="layer" data-on={view.layers.has("halo")}>
                <ellipse rx={halo.rx} ry={halo.ry} fill="url(#plane-halo)" />
              </g>
              <line x1={-pxp} x2={iw - pxp} y1={0} y2={0} stroke="var(--probe)" strokeOpacity={0.35} />
              <line y1={-pyp} y2={ih - pyp} x1={0} x2={0} stroke="var(--probe)" strokeOpacity={0.35} />
              <circle r={12} fill="none" stroke="var(--probe)" strokeWidth={2} />
              <circle r={3} fill="var(--probe)" />
              <g transform={`translate(${tagLeft ? -16 - tagW : 16},${pyp < 40 ? 16 : -32})`}>
                <rect width={tagW} height={24} rx={4} fill="var(--surface)" stroke="var(--line-strong)" />
                <text ref={tagText} x={8} y={16} fontSize={12} fill="var(--ink)" className="num">{tag}</text>
              </g>
            </g>
          </g>
          <rect
            width={iw}
            height={ih}
            fill="transparent"
            style={{ cursor: brushMode ? "crosshair" : dragging ? "grabbing" : "grab", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
        </g>
      </svg>
      {/* The pin's tooltip, while the pointer or the keyboard probe rests on a candidate. The plane's own label
          says the same to a screen reader, so this copy is hidden from it. */}
      {showTip && onCand && (
        <div
          aria-hidden="true"
          className="floating swap-in pointer-events-none absolute z-20 w-64 px-3 py-2 text-xs"
          style={{ left: m.left + (tipRight ? pxp - 16 - 256 : pxp + 16), top: m.top + pyp + 18 }}
        >
          <div className="text-sm font-semibold text-ink">{onCand.name}{candWord ? `: ${candWord}` : ""}</div>
          <div className="mt-1 text-ink-2">{EVIDENCE_WORD_NOTE}</div>
        </div>
      )}
      {/* A bin's count, only while the pointer is on its glyph: a Value, so it opens the bin's source. */}
      {hoverBin && !dragging && (
        <div
          ref={badge}
          key={hoverBin.p.p}
          className="floating swap-in absolute z-20 flex items-center gap-1 px-2 py-0.5 text-xs"
          // Right of the probe ring and under the probe's tag (which sits above and to the right of it).
          style={{ left: m.left + hoverBin.px + Math.max(hoverBin.r, 12) + 2, top: m.top + hoverBin.py + 4 }}
          onPointerLeave={() => setHoverBin(null)}
        >
          <Value val={{ v: hoverBin.p.n, u: hoverBin.p.fuel_class === "emulator" ? "sessions" : "tests", p: hoverBin.p.p }} />
        </div>
      )}
      <span className="sr-only" aria-live="polite">{brushMode ? "Area selection on. Drag across the plane to select tests; press B to turn it off." : ""}</span>
    </div>
  );
}

/** Where a pin's two-line label goes: beside its head (above the point) or under the point, to its right or left. */
interface PinAt { c: Candidate; cx: number; cy: number; word?: EvidenceWord; below: boolean; left: boolean; boxes: Rect[] }

const hitsAny = (b: Rect, taken: Rect[]) => taken.some((t) => b.x0 < t.x1 && b.x1 > t.x0 && b.y0 < t.y1 && b.y1 > t.y0);

/** A stretch of a polyline about `half` px either side of point k, running left to right so text on it reads
 *  upright; null if the line ends sooner. */
function stretch(line: [number, number][], k: number, half: number): [number, number][] | null {
  let a = k;
  let b = k;
  let la = 0;
  let lb = 0;
  while (a > 0 && la < half) {
    la += Math.hypot(line[a][0] - line[a - 1][0], line[a][1] - line[a - 1][1]);
    a--;
  }
  while (b < line.length - 1 && lb < half) {
    lb += Math.hypot(line[b + 1][0] - line[b][0], line[b + 1][1] - line[b][1]);
    b++;
  }
  if (la < half || lb < half) return null;
  const seg = line.slice(a, b + 1);
  return seg[0][0] <= seg[seg.length - 1][0] ? seg : seg.reverse();
}

/** Land, sea and coast: contours of the probe grid at "more than zero", cached per multiplier and mode. A layer
 *  of its own (its own SVG, composited apart), so the Solids only sink repaints only this, never the glyphs. */
const LandLayer = memo(function LandLayer({ frame, grid, multiplier, solids, scene, hatch }: {
  frame: Frame; grid: Grid; multiplier: number; solids: boolean; scene: boolean; hatch: boolean;
}) {
  const { w, h, m, iw, ih, x, y, z } = frame;
  const land = useMemo(() => landPath(coastFor(grid, multiplier, "all"), grid, x, y), [grid, multiplier, x, y]);
  const solidLand = useMemo(() => landPath(coastFor(grid, multiplier, "solids"), grid, x, y), [grid, multiplier, x, y]);
  const extent = useMemo(() => gridExtent(grid, x, y), [grid, x, y]);
  // Only a change of Solids only animates the land: the transition is on from that change until it ends, so a
  // resize meanwhile or afterwards redraws at once, and a new zoom or step size draws a new coast at once (key).
  const [sinkFor, setSinkFor] = useState(solids);
  const [sinking, setSinking] = useState(false);
  if (sinkFor !== solids) {
    setSinkFor(solids);
    setSinking(true);
  }
  return (
    <svg width={w} height={h} aria-hidden="true" className="absolute inset-0 block" style={{ willChange: "transform" }}>
      <defs>
        <Hatch id="hatch-sea" />
        <clipPath id="plane-clip-land"><rect width={iw} height={ih} /></clipPath>
        {/* Solids only: a black stroke along the coast widens until it has erased the land from the coast inward. */}
        <mask id="plane-land-mask">
          <path d={land.d} fill="white" stroke="white" strokeWidth={2} />
          <path
            key={`${z.label}|${multiplier}`}
            d={land.d}
            fill="none"
            stroke="black"
            strokeLinejoin="round"
            className={scene && sinking ? "land-sink" : undefined}
            style={{ strokeWidth: solids ? land.erode : 0 }}
            onTransitionEnd={() => setSinking(false)}
          />
        </mask>
      </defs>
      <g transform={`translate(${m.left},${m.top})`}>
        <rect width={iw} height={ih} fill="var(--surface)" />
        <g clipPath="url(#plane-clip-land)">
          {/* Sea: the grid's whole extent, hatched (unknown, not safe). The land is drawn over it. Beyond the
              grid the build computed nothing, so neither land nor sea is drawn there. */}
          <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="var(--sea)" />
          <g className="layer" data-on={hatch}>
            <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="url(#hatch-sea)" style={{ opacity: "var(--sea-hatch-opacity)" }} />
          </g>
          {solids && solidLand.d && (
            <g>
              <path d={solidLand.d} fill="var(--land)" />
              <path d={solidLand.d} fill="none" stroke="var(--coast)" strokeWidth={1} />
            </g>
          )}
          <g mask="url(#plane-land-mask)">
            <path d={land.d} fill="var(--land)" />
            <path d={land.d} fill="none" stroke="var(--coast)" strokeWidth={1} />
          </g>
        </g>
      </g>
    </svg>
  );
});

/** Everything else that does not move with the probe. Memoised: a drag never re-renders or repaints it. */
const PlaneBase = memo(function PlaneBase({ frame, grid, placed, candidates, words, flame, prebreathe, layers, solids, scene, reserve, placedSolid, activeCandidate }: {
  frame: Frame; grid: Grid; placed: Placed[]; candidates: Candidate[]; words: Partial<Record<string, EvidenceWord>>;
  flame?: FlameGrid; prebreathe?: PrebreathePoint[]; layers: Set<string>; solids: boolean; scene: boolean; reserve: Rect; placedSolid: boolean;
  activeCandidate: string | null;
}) {
  const { w, h, m, iw, ih, narrow, x, y, z, strips } = frame;

  // Where the probe grid ends (land and sea are drawn by LandLayer, underneath): above it, a caption says so.
  const beyondGrid = useMemo(() => gridExtent(grid, x, y).y, [grid, x, y]);

  // ---- pins and the boxes their labels take ----
  const nameSize = narrow ? 12 : 14;
  const pins = useMemo<PinAt[]>(() => {
    const at = candidates.map((c) => ({ c, cx: x(c.o2_pct.v), cy: y(c.pressure_psi.v) }));
    const heads: Rect[] = at.map(({ cx, cy }) => ({ x0: cx - 8, x1: cx + 8, y0: cy - 22, y1: cy + 4 }));
    const labels: Rect[] = [];
    return at.map(({ c, cx, cy }, k) => {
      const word = words[c.id];
      const tw = 4 + Math.max(c.name.length * nameSize * 0.6, (word?.length ?? 0) * 12 * 0.6);
      const box = (below: boolean, left: boolean): Rect => ({
        x0: left ? cx - 10 - tw : cx + 8,
        x1: left ? cx - 8 : cx + 10 + tw,
        y0: below ? cy + 20 - nameSize : cy - 12 - nameSize,
        y1: below ? cy + 38 : cy + 6,
      });
      // Beside the head on the right first (the scenario, which shares a pressure with a habitat candidate,
      // tries under it first), then the other sides. A side inside the plot and clear of the toolbar, every other
      // pin and every label already placed wins; among those, the one over the fewest glyphs, then the earlier.
      const order: [boolean, boolean][] = c.role === "scenario" ? [[true, false], [false, false], [true, true], [false, true]] : [[false, false], [true, false], [false, true], [true, true]];
      const hard = [reserve, ...heads.filter((_, i) => i !== k), ...labels];
      const cost = ([b, l]: [boolean, boolean]) => {
        const r = box(b, l);
        const out = r.x0 < 0 || r.x1 > iw || r.y0 < 0 || r.y1 > ih;
        const under = placed.filter((g) => g.px + g.r > r.x0 && g.px - g.r < r.x1 && g.py + g.r > r.y0 && g.py - g.r < r.y1).length;
        return (out ? 1e6 : 0) + (hitsAny(r, hard) ? 1e4 : 0) + under;
      };
      const [below, left] = order.reduce((best, o) => (cost(o) < cost(best) ? o : best), order[0]);
      labels.push(box(below, left));
      return { c, cx, cy, word, below, left, boxes: [heads[k], box(below, left)] };
    });
  }, [candidates, words, x, y, nameSize, reserve, iw, ih, placed]);

  // ---- isotherms: solid, quiet lines with their labels along the path, clear of every other label ----
  const isotherms = useMemo(() => {
    if (!flame) return [];
    const nx = flame.o2_pct.length;
    const ny = flame.pressure_psi.length;
    const gen = d3.contours().size([nx, ny]).thresholds(flame.isotherms_K.map((t) => t.v));
    const o2At = d3.scaleLinear().domain([0.5, nx - 0.5]).range([flame.o2_pct[0], flame.o2_pct[nx - 1]]);
    const pAt = d3.scaleLinear().domain([0.5, ny - 0.5]).range([flame.pressure_psi[0], flame.pressure_psi[ny - 1]]);
    // Boxes a label must stay clear of: the toolbar, every pin and its label (kept clear even while the probe
    // hides it), the prebreathe labels, the Solids only caption, and each isotherm label once placed. Widths are
    // generous estimates (0.6 em a character), so a label that might touch is moved, never one that does not.
    const taken: Rect[] = [reserve, ...pins.flatMap((p) => p.boxes), ...placed.map((g) => ({ x0: g.px - g.r - 2, x1: g.px + g.r + 2, y0: g.py - g.r - 2, y1: g.py + g.r + 2 }))];
    for (const pb of prebreathe ?? []) {
      const px = x(pb.o2_pct.v);
      const py = y(pb.pressure_psi.v);
      taken.push({ x0: px - 8, x1: px + 12 + (pb.duration_text?.length ?? 0) * 12 * 0.6, y0: py - 22, y1: py + 8 });
    }
    if (solids && !placedSolid) taken.push(narrow ? { x0: iw / 2 - 144, x1: iw / 2 + 144, y0: ih - 68, y1: ih - 12 } : { x0: iw / 2 - 254, x1: iw / 2 + 254, y0: ih - 66, y1: ih - 14 });
    return gen(flame.temperature_K.flat()).map((c, idx) => {
      const lines: [number, number][][] = [];
      const inside = ([gx, gy]: number[]) => gx > 0.5 && gx < nx - 0.5 && gy > 0.5 && gy < ny - 0.5;
      for (const poly of c.coordinates) {
        for (const ring of poly) {
          let cur: [number, number][] = [];
          for (const pt of ring) {
            if (inside(pt)) cur.push([x(o2At(pt[0])), y(Math.max(z.psi[0], pAt(pt[1])))]);
            else if (cur.length) {
              if (cur.length > 1) lines.push(cur);
              cur = [];
            }
          }
          if (cur.length > 1) lines.push(cur);
        }
      }
      const value = flame.isotherms_K[idx].v;
      const text = `${fmtNumber(value, 0)} K`;
      const half = (text.length * 12 * 0.6) / 2 + 6;
      // The label runs along its line, centred on a spot 50% of the way along, or the next spot that is clear;
      // none is drawn if none is.
      let label: { id: string; d: string } | null = null;
      const byLength = [...lines].sort((a, b) => b.length - a.length);
      search: for (const line of byLength) {
        for (const at of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const k = Math.floor((line.length - 1) * at);
          const [lx, ly] = line[k];
          if (lx < 24 || lx > iw - 24 || ly < 16 || ly > ih - 16) continue;
          const seg = stretch(line, k, half);
          if (!seg) continue;
          const xs = seg.map((p) => p[0]);
          const ys = seg.map((p) => p[1]);
          const box: Rect = { x0: Math.min(...xs) - 4, x1: Math.max(...xs) + 4, y0: Math.min(...ys) - 9, y1: Math.max(...ys) + 9 };
          if (box.x0 < 0 || box.x1 > iw || hitsAny(box, taken)) continue;
          taken.push(box);
          label = { id: `plane-iso-${value}`, d: d3.line()(seg) ?? "" };
          break search;
        }
      }
      return { value, text, lines: lines.map((l) => d3.line()(l) ?? ""), label };
    });
  }, [flame, x, y, z, iw, ih, pins, placed, prebreathe, reserve, solids, placedSolid, narrow]);

  const psiTicks = [3, 4.3, 6, 8.2, 10.2, 14.7, 20, 30, 45].filter((p) => p >= z.psi[0] && p <= z.psi[1]);
  const kpaTicks = [20, 30, 40, 50, 70, 100, 150, 200, 300].filter((k) => k / KPA_PER_PSI >= z.psi[0] && k / KPA_PER_PSI <= z.psi[1]);
  const o2Ticks = x.ticks(narrow ? 5 : 10);

  return (
    <svg data-chart width={w} height={h} aria-hidden="true" className="absolute inset-0 block">
      <defs>
        <Hatch id="hatch-plane" />
        <clipPath id="plane-clip"><rect width={iw} height={ih} /></clipPath>
        <clipPath id="plane-clip-glyphs"><rect x={-GLYPH_PAD} y={-GLYPH_PAD} width={iw + 2 * GLYPH_PAD} height={ih + 2 * GLYPH_PAD} /></clipPath>
        {isotherms.map((c) => c.label && <path key={c.label.id} id={c.label.id} d={c.label.d} />)}
      </defs>
      <g transform={`translate(${m.left},${m.top})`}>
        {/* The land and sea are drawn under this layer by LandLayer; this is the plot's frame. */}
        <rect width={iw} height={ih} fill="none" stroke="var(--line)" />

        {psiTicks.map((p) => <line key={`gy${p}`} x1={0} x2={iw} y1={y(p)} y2={y(p)} stroke="var(--line)" />)}
        {o2Ticks.map((t) => <line key={`gx${t}`} y1={0} y2={ih} x1={x(t)} x2={x(t)} stroke="var(--line)" />)}
        {beyondGrid > 24 && (
          <text x={iw - 8} y={beyondGrid - 8} textAnchor="end" fontSize={12} fill="var(--ink-3)" paintOrder="stroke" stroke="var(--surface)" strokeWidth={4} strokeLinejoin="round">Beyond the probe grid: no coast computed</text>
        )}

        <g clipPath="url(#plane-clip)">
          <g className="layer" data-on={layers.has("ft")}>
            {isotherms.map((c) => (
              <g key={c.value}>
                {c.lines.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--isotherm)" strokeOpacity={0.6} strokeWidth={1} />)}
                {c.label && (
                  <text fontSize={12} fill="var(--ink-3)" fontStyle="italic" dy="0.32em" paintOrder="stroke" stroke="var(--land)" strokeWidth={4} strokeLinejoin="round">
                    <textPath href={`#${c.label.id}`} startOffset="50%" textAnchor="middle">{c.text}</textPath>
                  </text>
                )}
              </g>
            ))}
          </g>
        </g>

        <g clipPath="url(#plane-clip-glyphs)">
          <GlyphLayer on={layers.has("ev")} placed={placed} solids={solids} />
        </g>

        {/* Clipped like the glyphs, so a pin on the domain's edge (100% O2) draws whole. */}
        <g clipPath="url(#plane-clip-glyphs)">
          <g className="layer" data-on={layers.has("pb")}>
            {(prebreathe ?? []).map((pb) => (
              <g key={pb.finding_id} transform={`translate(${x(pb.o2_pct.v)},${y(pb.pressure_psi.v)})`}>
                <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill="none" stroke="var(--prebreathe)" strokeWidth={2} />
                <text x={10} y={-8} fontSize={12} fill="var(--ink-2)" paintOrder="stroke" stroke="var(--land)" strokeWidth={4}>{pb.duration_text}</text>
              </g>
            ))}
          </g>

          <g className="layer" data-on={layers.has("cand")}>
            {pins.map(({ c, cx, cy, word, below, left }) => {
              const on = c.id === activeCandidate;
              const tx = left ? -10 : 10;
              return (
                <g key={c.id} transform={`translate(${cx},${cy})`}>
                  <path d={PIN} fill="var(--candidate)" stroke="var(--sea)" strokeWidth={1.5} strokeLinejoin="round" />
                  <circle cy={-14} r={2.25} fill="var(--sea)" />
                  {!on && (
                    <text x={tx} y={below ? 20 : -12} textAnchor={left ? "end" : "start"} fontSize={nameSize} fontWeight={600} fill="var(--ink)" paintOrder="stroke" stroke="var(--land)" strokeWidth={4} strokeLinejoin="round">
                      {c.name}
                      {word && <tspan x={tx} dy={14} fontSize={12} fontWeight={400} fill="var(--ink-2)">{word}</tspan>}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {solids && !placedSolid && (
            narrow ? (
              <g className={scene ? "lands-after-scene" : "animate-fade"} transform={`translate(${iw / 2},${ih - 40})`}>
                <rect x={-Math.min(140, iw / 2 - 8)} y={-24} width={Math.min(280, iw - 16)} height={48} rx={8} fill="var(--surface)" stroke="var(--solid-edge)" strokeOpacity={0.6} />
                <text textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--ink)">
                  <tspan x={0} dy={-4}>No solid-material test can be</tspan>
                  <tspan x={0} dy={18}>placed on this plane</tspan>
                </text>
              </g>
            ) : (
              <g className={scene ? "lands-after-scene" : "animate-fade"} transform={`translate(${iw / 2},${ih - 40})`}>
                <rect x={-250} y={-22} width={500} height={40} rx={8} fill="var(--surface)" stroke="var(--solid-edge)" strokeOpacity={0.6} />
                <text textAnchor="middle" dy={4} fontSize={20} fontWeight={600} fill="var(--ink)">No solid-material test can be placed on this plane</text>
              </g>
            )
          )}
        </g>

        <g transform={`translate(0,${ih})`}>
          {o2Ticks.map((t) => (
            <g key={t} transform={`translate(${x(t)},0)`}>
              <line y2={4} stroke="var(--ink-3)" />
              <text y={20} textAnchor="middle" fontSize={12} fill="var(--ink-2)" className="num">{t}</text>
            </g>
          ))}
          <text x={iw / 2} y={40} textAnchor="middle" fontSize={14} fill="var(--ink)">Oxygen (% by volume)</text>
        </g>
        <g>
          {psiTicks.map((p) => (
            <g key={p} transform={`translate(0,${y(p)})`}>
              <line x2={-4} stroke="var(--ink-3)" />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--ink-2)" className="num">{p}</text>
            </g>
          ))}
          <text transform={`translate(${-(narrow ? 38 : 40)},${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={14} fill="var(--ink)">Pressure (psi, log scale)</text>
          {kpaTicks.map((k) => (
            <g key={k} transform={`translate(${iw},${y(k / KPA_PER_PSI)})`}>
              <line x2={4} stroke="var(--ink-3)" />
              <text x={8} dy="0.32em" fontSize={12} fill="var(--ink-3)" className="num">{k}</text>
            </g>
          ))}
          <text transform={`translate(${iw + (narrow ? 36 : 44)},${ih / 2}) rotate(90)`} textAnchor="middle" fontSize={14} fill="var(--ink-2)">kPa</text>
        </g>

        {layers.has("strip") && <StripLayer strips={strips} solids={solids} x={x} z={z} iw={iw} top={ih + 56} narrow={narrow} />}
      </g>
    </svg>
  );
});

/** Tests whose pressure is not recorded, in O2-only strips under the plot. */
const StripLayer = memo(function StripLayer({ strips, solids, x, z, iw, top, narrow }: { strips: Strip[]; solids: boolean; x: d3.ScaleLinear<number, number>; z: { o2: [number, number] }; iw: number; top: number; narrow: boolean }) {
  let yy = 8;
  return (
    <g transform={`translate(0,${top})`} className="animate-fade">
      <text x={0} y={0} fontSize={12} fontWeight={500} fill="var(--ink-2)">{narrow ? "Oxygen recorded, no pressure: not placeable" : "Oxygen recorded, pressure not recorded: cannot be placed on the plane"}</text>
      {strips.map((s) => {
        const hh = stripRowHeight(s, solids);
        const at = yy;
        yy += hh + 4;
        const ghost = solids && s.fuel_class !== "solid";
        return (
          <g key={`${s.fuel_class}${s.source_type}`} transform={`translate(0,${at})`} style={{ opacity: ghost ? 0.25 : 1, transition: "opacity var(--t-move) var(--ease-out)" }}>
            <rect width={iw} height={hh} fill="url(#hatch-plane)" opacity={solids && s.fuel_class === "solid" ? 0.6 : 0.3} rx={2} />
            {s.items.filter((it) => it.o2_pct >= z.o2[0] && it.o2_pct <= z.o2[1]).map((it) => (
              <path key={it.p} d={markerPath(s.fuel_class, Math.min(hh / 2 - 1, 3 + Math.sqrt(it.n)))} transform={`translate(${x(it.o2_pct)},${hh / 2})`} fill={FUEL_COLOR_VAR[s.fuel_class]} stroke={FUEL_RING_VAR[s.fuel_class]}>
                <title>{`${it.n} ${s.unit === "sessions" ? "BRE sessions list" : FUEL_LABEL[s.fuel_class].toLowerCase() + " tests at"} ${fmtNumber(it.o2_pct, 1)}% O2, pressure not recorded (${it.investigations.join(", ")})`}</title>
              </path>
            ))}
            <text x={iw + 8} y={hh / 2} dy="0.32em" fontSize={12} fill="var(--ink-2)">{s.fuel_class === "emulator" ? "BRE" : FUEL_LABEL[s.fuel_class].split(" ")[0]}</text>
          </g>
        );
      })}
    </g>
  );
});

/** Every bin once, its marker sized by its count; the count itself shows only on hover (the overlay's badge).
 *  Under Solids only the other classes fade as one group (one opacity to animate, not one per glyph), so the
 *  fade does not hold up the land sinking beneath it. */
const GlyphLayer = memo(function GlyphLayer({ on, placed, solids }: { on: boolean; placed: Placed[]; solids: boolean }) {
  const glyph = ({ p, px, py, r }: Placed) => {
    const outline = p.source_type === "published_paper";
    return (
      <path
        key={p.p}
        d={markerPath(p.fuel_class, r)}
        transform={`translate(${px},${py})`}
        fill={outline ? "var(--surface-2)" : FUEL_COLOR_VAR[p.fuel_class]}
        fillOpacity={outline ? 1 : 0.85}
        stroke={outline ? FUEL_EDGE_VAR[p.fuel_class] : FUEL_RING_VAR[p.fuel_class]}
        strokeWidth={outline ? 2 : 1}
      />
    );
  };
  return (
    <g className="layer" data-on={on}>
      <g className="glyph-group" data-ghost={solids}>{placed.filter((g) => g.p.fuel_class !== "solid").map(glyph)}</g>
      <g>{placed.filter((g) => g.p.fuel_class === "solid").map(glyph)}</g>
    </g>
  );
});
