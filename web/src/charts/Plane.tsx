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
//
// Touch (plan, Phase 6): tap to pin the probe, press and hold to preview a point, drag to move the probe, pinch or
// drag with two fingers to zoom and pan. While the fingers move, the drawn layers follow by a CSS transform
// (lib/gesture.ts, pinchTransform), so nothing is laid out or re-rendered during the gesture; when they lift the
// window is written to the address bar (view.win) and the plane is drawn afresh for it from the same build values.
// The mouse keeps its drag, hover and zoom presets.
import * as d3 from "d3";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FUEL_COLOR_VAR, FUEL_EDGE_VAR, FUEL_RING_VAR, Hatch, markerPath } from "../components/Common";
import { Value } from "../components/Value";
import { coastFor, coastNear, EVIDENCE_WORD_NOTE, gridExtent, isLand, landPath, type Coast, type EvidenceWord } from "../lib/coast";
import { fmtNumber, FUEL_LABEL } from "../lib/format";
import { pinchDomain, pinchTransform, type Domain, type Pt } from "../lib/gesture";
import { useReducedMotion } from "../lib/motion";
import { nodeOf, snapIndex, type Grid } from "../lib/probe";
import type { Candidate } from "../lib/types";
import { ZOOMS, type Box, type View, type ZoomKey } from "../lib/view";
import type { FlameGrid, MapPoint, PrebreathePoint, Strip, TradeMapData } from "./TradeMap";

const KPA_PER_PSI = 6.894757293168361; // axis labels only; every value shown in the panel carries its own kPa
const MAGNET_PX = 14;
// A fingertip covers more of the plane than a pointer, so a tap snaps to a candidate from further away.
const TOUCH_MAGNET_PX = 24;
// A finger that moves less than this has not started a drag; held this long without moving, it previews.
const TOUCH_SLOP = 8;
const LONG_PRESS = 450; // milliseconds
/** The probe tag's text width by its shape (digits read as 0), measured once in the page's font. */
const TAG_WIDTHS = new Map<string, number>();
/** The range of the plane in view: a zoom preset, or the window a pinch left. */
interface Zoom { label: string; o2: [number, number]; psi: [number, number] }
/** A zoom from its key: a preset's name, or a pinched window's four numbers. One object per key, so the base
 *  layer's memo holds while the address bar changes for other reasons. */
function zoomOf(key: string): Zoom {
  if (key in ZOOMS) return ZOOMS[key as ZoomKey];
  const [a, b, c, d] = key.split(",").map(Number);
  return { label: "Pinched", o2: [a, b], psi: [c, d] };
}
// Glyphs are clipped to the plot plus this margin, not to the plot itself, so a test on the edge of the domain
// (15% O2, say) draws whole: the largest marker, the emulator diamond at r = 12, reaches 15.6 px plus its stroke.
const GLYPH_PAD = 18;
// Each trade-map bin (tests at identical recorded O2 and pressure) is drawn once, its area growing with its count.
// D40: a little smaller than before, so a row of packed bins (14.7 psi) stays a row of marks, not a bar.
const binRadius = d3.scaleSqrt().domain([1, 40]).range([3.5, 10]).clamp(true);
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

/** A beat of the story intro (components/Intro.tsx) over this live plane. "pins": the bare plot (no land and no
 *  sea yet) and the candidate pins alone, which appear and pulse; "land": the land rises with the sea around it
 *  and the glyphs fade in, one fuel class after another; "solids": the land sinks under Solids only. The probe and
 *  the toolbar wait until the intro hands over. */
export type IntroStage = "pins" | "land" | "solids";

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
  /** The story intro's beat while it plays over the plane; null or absent once it has handed over. */
  stage?: IntroStage | null;
  toolbar?: ReactNode;
  brushMode: boolean;
  onProbe: (o2: number, psi: number, mode: ProbeMode) => void;
  onHoverEnd: () => void;
  onBrush: (box: Box | null) => void;
  onOpenCandidate: (id: string) => void;
  onToggleBrush: () => void;
  /** A pinch or two-finger pan ended on this window (lib/gesture.ts). */
  onWindow?: (d: Domain) => void;
}

function useSize<T extends HTMLElement>(fallback: { w: number; h: number }, min = 320) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    if (!ref.current) return;
    // Measured before the first paint, so nothing is drawn at the fallback size first (a phone saw the probe
    // near the right edge for a frame). A box with no layout yet (a test) keeps the fallback.
    const r = ref.current.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const w0 = Math.max(min, Math.ceil(r.width));
      const h0 = Math.max(min, Math.ceil(r.height));
      setSize((s) => (s.w === w0 && s.h === h0 ? s : { w: w0, h: h0 }));
    }
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

/** Each O2-only strip's row height, in strip order. Under Solids only the solid row grows and the others shrink
 *  inside the same total, so the plot keeps its size: Solids only (and the story intro's third beat) never moves
 *  the plot, nor changes whether the toolbar takes its band (D37). */
function stripRows(strips: Strip[], solids: boolean): number[] {
  const plain = 16;
  const ghost = 12;
  const nSolid = strips.filter((s) => s.fuel_class === "solid").length;
  if (!solids || nSolid === 0 || nSolid === strips.length) return strips.map(() => plain);
  const solidH = (strips.length * plain - (strips.length - nSolid) * ghost) / nSolid;
  return strips.map((s) => (s.fuel_class === "solid" ? solidH : ghost));
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
  z: Zoom;
  strips: Strip[];
}

function useFrame(w: number, h: number, view: View, rawStrips: Strip[], top: number, z: Zoom): Frame {
  const strips = useMemo(() => {
    const order = ["solid", "emulator", "gas", "droplet"];
    return [...rawStrips].sort((a, b) => order.indexOf(a.fuel_class) - order.indexOf(b.fuel_class));
  }, [rawStrips]);
  const narrow = w < 640;
  const showStrip = view.layers.has("strip");
  // The same with Solids only on or off (stripRows keeps the total).
  const stripH = showStrip ? 32 + stripRows(strips, false).reduce((a, hh) => a + hh + 4, 0) : 0;
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
  const { map, candidates, grid, flame, prebreathe, view, probe, words, scene, toolbar, brushMode, onProbe, onHoverEnd, onBrush, onOpenCandidate, onToggleBrush, onWindow } = props;
  const stage = props.stage ?? null;
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
  // The window in view: the one a pinch left in the address bar, else the zoom preset. While two fingers pinch,
  // the layers are moved by a transform (paintPinch) and nothing is laid out again until they lift.
  const win = view.win;
  const zoomKey = win ? [win.o2[0], win.o2[1], win.psi[0], win.psi[1]].join(",") : view.zoom;
  const zoom = useMemo(() => zoomOf(zoomKey), [zoomKey]);
  // The toolbar floats over the plot's top left corner unless it would cover a pin's head or a glyph there (the
  // 14.7 psi row on a tablet's short plot, under 44 px touch tools); then it takes a band of its own above the
  // plot. On a narrow screen even the one menu button it folds into (planeToolbar.tsx) would, so it always does.
  // Decided on the plot as it would be under a floating toolbar, from every pin and glyph whatever the layers
  // show, so turning a layer on or off never moves the plot; and that plot is the same size with Solids only on
  // or off (stripRows), so neither Solids only nor the story intro's beats can tip the decision either way.
  const floating = useFrame(w, h, view, map.strips, 16, zoom);
  const hasToolbar = !!toolbar;
  const band = useMemo(() => {
    if (!hasToolbar) return false;
    if (w < 640) return true;
    const { x: fx, y: fy, z: fz } = floating;
    const corner: Rect = { x0: 8, y0: 8, x1: 8 + tb.w, y1: 8 + tb.h }; // the toolbar's own box, in plot coordinates
    const inView = (o2: number, psi: number) => o2 >= fz.o2[0] && o2 <= fz.o2[1] && psi >= fz.psi[0] && psi <= fz.psi[1];
    const heads = candidates.filter((c) => inView(c.o2_pct.v, c.pressure_psi.v)).map((c) => ({ x0: fx(c.o2_pct.v) - 8, x1: fx(c.o2_pct.v) + 8, y0: fy(c.pressure_psi.v) - 22, y1: fy(c.pressure_psi.v) + 4 }));
    const glyphs = map.points.filter((p) => inView(p.o2_pct, p.pressure_psi)).map((p) => {
      const r = binRadius(p.n);
      return { x0: fx(p.o2_pct) - r, x1: fx(p.o2_pct) + r, y0: fy(p.pressure_psi) - r, y1: fy(p.pressure_psi) + r };
    });
    return hitsAny(corner, heads) || hitsAny(corner, glyphs);
  }, [hasToolbar, w, floating, tb.w, tb.h, candidates, map.points]);
  const banded = useFrame(w, h, view, map.strips, tb.h + 12, zoom);
  const f = band ? banded : floating;
  const { m, iw, ih, x, y, z, narrow } = f;

  const onCand = candidates.find((c) => c.o2_pct.v === probe.o2 && c.pressure_psi.v === probe.psi);

  // The toolbar's corner of the plane, in plot coordinates: isotherm labels and pin labels keep clear of it.
  const tbLeft = narrow ? 8 : m.left + 8;
  const tbTop = band ? 6 : m.top + 8;
  const reserve = useMemo<Rect>(() => ({ x0: tbLeft - m.left - 4, y0: tbTop - m.top - 4, x1: tbLeft - m.left + tb.w + 4, y1: tbTop - m.top + tb.h + 4 }), [tbLeft, tbTop, m, tb]);

  const placed = useMemo<Placed[]>(
    () => map.points
      .filter((p) => p.pressure_psi >= z.psi[0] && p.pressure_psi <= z.psi[1] && p.o2_pct >= z.o2[0] && p.o2_pct <= z.o2[1])
      .map((p) => ({ p, px: x(p.o2_pct), py: y(p.pressure_psi), r: binRadius(p.n) })),
    [map.points, z, x, y],
  );
  // On a narrow plot the pinned probe (not one being dragged: pins are placed once per view) and its tag are
  // obstacles for pin labels too, so a label never sits under them. Not while the intro plays: no probe shows.
  const probeAt = useMemo(() => (narrow && !stage ? { o2: view.o2, psi: view.psi } : null), [narrow, stage, view.o2, view.psi]);
  // Under Solids only, with no solid test placed, a caption says so; its height is chosen first (captionY).
  const placedSolid = useMemo(() => map.points.some((p) => p.fuel_class === "solid"), [map.points]);
  const capY = useMemo(() => (view.solids && !placedSolid ? captionY(f, candidates, reserve) : null), [view.solids, placedSolid, f, candidates, reserve]);
  const pins = useMemo(
    () => placePins(candidates, words, f, reserve, placed, probeAt, capY === null ? [] : [captionBox(f, capY)]),
    [candidates, words, f, reserve, placed, probeAt, capY],
  );

  // ---- pointer to data, snapped to a candidate (magnet) or to the probe grid ----
  const toData = useCallback(
    (clientX: number, clientY: number, clampToPlot = true, magnet = MAGNET_PX) => {
      const r = overlay.current?.getBoundingClientRect();
      if (!r) return null;
      let px = clientX - r.left - m.left;
      let py = clientY - r.top - m.top;
      if (!clampToPlot && (px < 0 || px > iw || py < 0 || py > ih)) return null;
      px = Math.max(0, Math.min(iw, px));
      py = Math.max(0, Math.min(ih, py));
      for (const c of candidates) {
        if (Math.hypot(x(c.o2_pct.v) - px, y(c.pressure_psi.v) - py) < magnet) return { o2: c.o2_pct.v, psi: c.pressure_psi.v, px, py };
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

  const capture = (e: React.PointerEvent<SVGRectElement>) => {
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* no capture available (synthetic pointer): dragging still works while the pointer stays on the plane */
    }
  };
  const cancelFrame = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  // ---- touch: a finger's first move decides. Past the slop it drags the probe; held still for LONG_PRESS it
  // previews (the panel reads the point, as a hover does, and the probe goes back when the finger lifts); lifted
  // before either, it pins the probe where it touched. A second finger turns whatever began into a pinch, and a
  // finger left down after a pinch does nothing until it lifts. Each returns false for the one case the pointer
  // code below handles for a finger too: a single finger selecting an area. ----
  type TouchGesture =
    | { kind: "pending"; x: number; y: number; d: { o2: number; psi: number; px: number; py: number }; timer: number }
    | { kind: "drag" | "preview" | "after" }
    | { kind: "pinch"; start: Domain; from: [Pt, Pt]; last: Domain | null };
  const fingers = useRef(new Map<number, Pt>());
  const touch = useRef<TouchGesture | null>(null);
  useEffect(() => () => {
    const t = touch.current;
    if (t?.kind === "pending") clearTimeout(t.timer);
  }, []);
  const plotPt = (p: Pt): Pt => {
    const r = overlay.current?.getBoundingClientRect();
    return { x: p.x - (r?.left ?? 0) - m.left, y: p.y - (r?.top ?? 0) - m.top };
  };
  const twoFingers = (): [Pt, Pt] => {
    const [a, b] = [...fingers.current.values()];
    return [plotPt(a), plotPt(b)];
  };
  // ---- a pinch in progress: the base layers (one transform on their wrapper, in CSS pixels) and the overlay's
  // drawing (one SVG transform, in plot coordinates) follow the fingers; the probe moves with its point but keeps
  // its size; the pointer surface does not move, so the fingers keep being read against the same plot ----
  const pinchLayer = useRef<HTMLDivElement>(null);
  const pinchMarks = useRef<SVGGElement>(null);
  const pinchProbe = useRef<SVGGElement>(null);
  const pinchPending = useRef(false);
  const paintPinch = (start: Domain, next: Domain) => {
    const { kx, tx, ky, ty } = pinchTransform(start, next, iw, ih);
    wrap.current?.setAttribute("data-pinching", ""); // the plane clips what the transform carries past its edge
    const el = pinchLayer.current;
    if (el) {
      el.style.willChange = "transform"; // composited for the gesture only
      el.style.transform = `matrix(${kx}, 0, 0, ${ky}, ${m.left * (1 - kx) + tx}, ${m.top * (1 - ky) + ty})`;
    }
    pinchMarks.current?.setAttribute("transform", `matrix(${kx} 0 0 ${ky} ${tx} ${ty})`);
    pinchProbe.current?.setAttribute("transform", `translate(${(kx - 1) * pxp + tx} ${(ky - 1) * pyp + ty})`);
  };
  const endPinch = useCallback(() => {
    pinchPending.current = false;
    wrap.current?.removeAttribute("data-pinching");
    if (pinchLayer.current) {
      pinchLayer.current.style.transform = "";
      pinchLayer.current.style.willChange = "";
    }
    pinchMarks.current?.removeAttribute("transform");
    pinchProbe.current?.removeAttribute("transform");
  }, [wrap]);
  useLayoutEffect(() => {
    if (pinchPending.current) endPinch();
  }, [zoomKey, endPinch]);

  const touchDown = (e: React.PointerEvent<SVGRectElement>): boolean => {
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const t = touch.current;
    if (fingers.current.size === 2) {
      if (t?.kind === "pending") clearTimeout(t.timer);
      if (t?.kind === "drag" || t?.kind === "preview") {
        cancelFrame();
        setDragging(false);
        onHoverEnd(); // the probe goes back to where it was pinned
      }
      setBrush(null);
      setHoverBin(null);
      capture(e);
      touch.current = { kind: "pinch", start: { o2: z.o2, psi: z.psi }, from: twoFingers(), last: null };
      return true;
    }
    if (fingers.current.size > 2 || t) return true;
    if (brushMode) return false;
    const d = toData(e.clientX, e.clientY, true, TOUCH_MAGNET_PX);
    if (!d) return true;
    capture(e);
    setHoverBin(null);
    const timer = window.setTimeout(() => {
      touch.current = { kind: "preview" };
      buzz();
      onProbe(d.o2, d.psi, "hover");
    }, LONG_PRESS);
    touch.current = { kind: "pending", x: e.clientX, y: e.clientY, d, timer };
    return true;
  };
  const touchMove = (e: React.PointerEvent<SVGRectElement>): boolean => {
    if (!fingers.current.has(e.pointerId)) return false;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const t = touch.current;
    if (!t) return false;
    if (t.kind === "after") return true;
    if (t.kind === "pinch") {
      if (fingers.current.size < 2) return true;
      const next = pinchDomain(t.start, iw, ih, t.from, twoFingers());
      t.last = next;
      schedule(() => paintPinch(t.start, next));
      return true;
    }
    if (t.kind === "pending") {
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < TOUCH_SLOP) return true;
      clearTimeout(t.timer);
      touch.current = { kind: "drag" };
      touchDrag.current = true;
      setDragging(true);
    }
    const d = toData(e.clientX, e.clientY, true, TOUCH_MAGNET_PX);
    if (!d) return true;
    const mode: ProbeMode = touch.current?.kind === "preview" ? "hover" : "drag";
    schedule(() => onProbe(d.o2, d.psi, mode));
    return true;
  };
  const touchUp = (e: React.PointerEvent<SVGRectElement>, cancelled: boolean): boolean => {
    if (!fingers.current.delete(e.pointerId)) return false;
    const t = touch.current;
    if (!t) return false;
    if (t.kind === "pinch") {
      if (fingers.current.size >= 2) return true;
      cancelFrame();
      touch.current = fingers.current.size ? { kind: "after" } : null;
      if (t.last && !cancelled && onWindow) {
        // The transform stays until the plane is drawn for the new window (the layout effect on zoomKey), so no
        // frame shows the old window between the two.
        pinchPending.current = true;
        onWindow(t.last);
        window.setTimeout(endPinch, 0); // the same window again: nothing new is drawn, so let go here
      } else endPinch();
      return true;
    }
    if (t.kind === "after") {
      if (!fingers.current.size) touch.current = null;
      return true;
    }
    touch.current = null;
    cancelFrame();
    if (t.kind === "pending") {
      clearTimeout(t.timer);
      if (!cancelled) {
        onProbe(t.d.o2, t.d.psi, "commit"); // tap to pin
        setHoverBin(binAt(t.d.px, t.d.py, null)); // a tap on a glyph shows its count badge, as a hover does
      }
      return true;
    }
    if (t.kind === "drag") {
      setDragging(false);
      const d = cancelled ? null : toData(e.clientX, e.clientY, true, TOUCH_MAGNET_PX);
      if (d) onProbe(d.o2, d.psi, "commit");
      else onHoverEnd();
      return true;
    }
    onHoverEnd(); // the end of a preview: the probe goes back to the pinned point
    return true;
  };

  const onPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.pointerType === "touch" && touchDown(e)) return;
    const d = toData(e.clientX, e.clientY);
    if (!d) return;
    capture(e);
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
    if (e.pointerType === "touch" && touchMove(e)) return;
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
    if (e.pointerType === "touch" && touchUp(e, false)) return;
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
      // A move frame still pending would set the drag again after this commit (as the touch path guards too).
      cancelFrame();
      const d = toData(e.clientX, e.clientY);
      setDragging(false);
      if (d) onProbe(d.o2, d.psi, "commit");
    }
  };
  // The system took the pointer (a scroll, a call): nothing is pinned, and a drag or preview lets go.
  const onPointerCancel = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.pointerType === "touch" && touchUp(e, true)) return;
    setBrush(null);
    if (dragging) {
      cancelFrame();
      setDragging(false);
      onHoverEnd();
    }
  };
  const badge = useRef<HTMLDivElement>(null);
  const onPointerLeave = (e: React.PointerEvent<SVGRectElement>) => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setPointerOn(false);
    // A finger leaves the plane as it lifts: a badge a tap showed stays until the next touch.
    if (e.pointerType !== "touch" && !(e.relatedTarget instanceof Node && badge.current?.contains(e.relatedTarget))) setHoverBin(null);
    if (!dragging && !brush) onHoverEnd();
  };

  // ---- keyboard: arrows step one grid node; Alt steps ten; Shift jumps to the next candidate. Where the probe
  // lands on a glyph its count badge shows, as on hover, and Tab reaches the badge's Value next. ----
  const keyTo = (o2: number, psi: number) => {
    onProbe(o2, psi, "commit");
    setHoverBin(binAt(x(o2), y(psi), null));
  };
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
      if (ahead[0]) keyTo(ahead[0].c.o2_pct.v, ahead[0].c.pressure_psi.v);
      return;
    }
    const n = e.altKey ? 10 : 1;
    const i = Math.max(0, Math.min(grid.o2.length - 1, snapIndex(grid.o2, probe.o2) + dx * n));
    const j = Math.max(0, Math.min(grid.psi.length - 1, snapIndex(grid.psi, probe.psi) + dy * n));
    keyTo(grid.o2[i], grid.psi[j]);
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
  // Measured once per tag shape (its digits read as 0) and kept: tabular figures give every tag of one shape the
  // same width, and measuring forces a layout. A hover crosses between shapes (34% and 34.5%) on most steps, so
  // measuring each time a shape came back cost more than the hover itself (D38).
  const measureTag = useCallback((fresh = false) => {
    const el = tagText.current;
    if (!el || typeof el.getComputedTextLength !== "function") return;
    const shape = (el.textContent ?? "").replace(/\d/g, "0");
    let w = fresh ? undefined : TAG_WIDTHS.get(shape);
    if (w === undefined) {
      w = Math.ceil(el.getComputedTextLength());
      if (w <= 0) return;
      TAG_WIDTHS.set(shape, w);
    }
    setTagTextW(w);
  }, []);
  const tagShape = tag.replace(/\d/g, "0");
  useLayoutEffect(() => measureTag(), [tagShape, measureTag]);
  useEffect(() => {
    // The web font may arrive after the first measure: widths taken in the fallback font are dropped.
    void document.fonts?.ready.then(() => {
      TAG_WIDTHS.clear();
      measureTag(true);
    });
  }, [measureTag]);
  const tagW = (tagTextW ?? tag.length * 7) + 16;
  // The tag sits above and right of the probe (left near the right edge, under it near the top), or at the first
  // other corner that keeps it inside the plot and off every other pin and its label, which on a phone's short
  // plot it would otherwise cover. The pin the probe is on hides its own label.
  // The Solids only caption is in the way too.
  const pinLabels = [...(view.layers.has("cand") ? pins.filter((p) => p.c.id !== onCand?.id).flatMap((p) => p.boxes) : []), ...(capY === null ? [] : [captionBox(f, capY)])];
  const tagCost = ([left, below]: [boolean, boolean]) => {
    const x0 = left ? pxp - 16 - tagW : pxp + 16;
    const y0 = below ? pyp + 16 : pyp - 32;
    const box = { x0, x1: x0 + tagW, y0, y1: y0 + 24 };
    return (box.x0 < 0 || box.x1 > iw || box.y0 < 0 || box.y1 > ih ? 2 : 0) + (hitsAny(box, pinLabels) ? 1 : 0);
  };
  const tagFirst: [boolean, boolean] = [pxp + 16 + tagW > iw, pyp < 40];
  const tagCorners: [boolean, boolean][] = [tagFirst, [tagFirst[0], !tagFirst[1]], [!tagFirst[0], tagFirst[1]], [!tagFirst[0], !tagFirst[1]]];
  const [tagLeft, tagBelow] = tagCorners.reduce((best, o) => (tagCost(o) < tagCost(best) ? o : best), tagFirst);
  // The probe glides to a point the keyboard, a chip or a shortcut chose, and back to the pinned point when the
  // pointer leaves. Under a pointer (a drag, or a hover with the pointer on the plot) it moves at once: a glide
  // restarted on every step kept the probe animating, and the overlay repainting, for as long as the pointer moved.
  const glide = dragging || pointerOn ? "none" : "transform var(--t-move) var(--ease-out)";
  const candWord = onCand ? words[onCand.id] : undefined;
  const showTip = !!onCand && (pointerOn || focused) && view.layers.has("cand") && !dragging && !stage;
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
    <div ref={wrap} className="relative h-full w-full select-none" data-intro={stage ?? undefined} onPointerLeave={(e) => e.pointerType !== "touch" && setHoverBin(null)}>
      {toolbar && (
        <div ref={tbRef} className="plane-tools intro-hide absolute z-10" style={{ left: tbLeft, top: tbTop, maxWidth: w - tbLeft - 8 }}>
          {toolbar}
        </div>
      )}
      {/* The layers a pinch moves by transform; while it does, the plane (data-pinching) clips them at its edge. */}
      <div ref={pinchLayer} className="absolute inset-0" style={{ transformOrigin: "0 0" }}>
      <LandLayer frame={f} grid={grid} multiplier={view.m} solids={view.solids} risen={stage !== "pins"} scene={scene} hatch={view.layers.has("blind")} robust={view.layers.has("robust") && !stage} />
      <PlaneBase
        frame={f}
        grid={grid}
        placed={placed}
        pins={pins}
        flame={flame}
        prebreathe={prebreathe}
        layers={view.layers}
        solids={view.solids}
        scene={scene}
        reserve={reserve}
        capY={capY}
        activeCandidate={stage ? null : onCand?.id ?? null}
        pulse={stage === "pins" && !reduced}
      />
      </div>
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
        onBlur={(e) => {
          setFocused(false);
          // A badge the keyboard showed goes with the focus, unless the focus went to it.
          if (!pointerOn && !(e.relatedTarget instanceof Node && badge.current?.contains(e.relatedTarget))) setHoverBin(null);
        }}
        className="absolute inset-0 block rounded-lg focus-visible:outline-offset-[-2px]"
        style={{ willChange: "transform" }}
      >
        <defs>
          <clipPath id="plane-clip-overlay"><rect width={iw} height={ih} /></clipPath>
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          <g clipPath="url(#plane-clip-overlay)">
            <g ref={pinchMarks}>
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
            </g>
            {/* The probe waits while the story intro plays, then fades in where the intro hands over. */}
            <g ref={pinchProbe}>
            <g className="intro-hide">
              <g style={{ transform: `translate(${pxp}px, ${pyp}px)`, transition: glide }} pointerEvents="none">
                <g className="layer" data-on={view.layers.has("halo")}>
                  {/* The nearness region: a crisp thin solid ring over a faint fill (dashes on the plane mean a grid or step edge), so it reads as an instrument's reach and
                      not a smudge over the map beneath it (D40). */}
                  <ellipse rx={halo.rx} ry={halo.ry} fill="var(--probe)" fillOpacity={0.035} stroke="var(--probe)" strokeOpacity={0.45} strokeWidth={1} />
                </g>
                <line x1={-pxp} x2={iw - pxp} y1={0} y2={0} stroke="var(--probe)" strokeOpacity={0.35} />
                <line y1={-pyp} y2={ih - pyp} x1={0} x2={0} stroke="var(--probe)" strokeOpacity={0.35} />
                <circle r={12} fill="none" stroke="var(--probe)" strokeWidth={2} />
                <circle r={3} fill="var(--probe)" />
                <g transform={`translate(${tagLeft ? -16 - tagW : 16},${tagBelow ? 16 : -32})`}>
                  <rect width={tagW} height={24} rx={4} fill="var(--surface)" stroke="var(--line-strong)" />
                  <text ref={tagText} x={8} y={16} fontSize={12} fill="var(--ink)" className="num">{tag}</text>
                </g>
              </g>
            </g>
            </g>
          </g>
          <rect
            width={iw}
            height={ih}
            fill="transparent"
            // touch-action none: the page neither scrolls nor zooms under a finger on the plane; the plane's own
            // pinch zooms it. No callout or context menu under a press and hold, which previews instead.
            style={{ cursor: brushMode ? "crosshair" : dragging ? "grabbing" : "grab", touchAction: "none", WebkitTouchCallout: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerLeave}
            onContextMenu={(e) => touch.current && e.preventDefault()}
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
      {hoverBin && !dragging && !stage && (
        <div
          ref={badge}
          key={hoverBin.p.p}
          className="floating swap-in absolute z-20 flex items-center gap-1 px-2 py-0.5 text-xs"
          // Right of the probe ring and under the probe's tag (which sits above and to the right of it).
          style={{ left: m.left + hoverBin.px + Math.max(hoverBin.r, 12) + 2, top: m.top + hoverBin.py + 4 }}
          onPointerLeave={() => setHoverBin(null)}
        >
          <Value val={{ v: hoverBin.p.n, u: unitFor(hoverBin.p.fuel_class, hoverBin.p.n), p: hoverBin.p.p }} />
          <span className="text-ink-2">{FUEL_LABEL[hoverBin.p.fuel_class].toLowerCase()}</span>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{brushMode ? "Area selection on. Drag across the plane to select tests; press B to turn it off." : ""}</span>
    </div>
  );
}

/** Where a pin's two-line label goes: beside its head (above the point) or under the point, to its right or left.
 *  label says what is drawn: the name and its evidence word, the name alone, its oxygen alone (the pressure is
 *  on the axis beside it), or nothing when every side would cover something. The full name and word are always
 *  in the tooltip and the Candidates menu. text is the first line drawn. */
interface PinAt { c: Candidate; cx: number; cy: number; text: string; word?: EvidenceWord; below: boolean; left: boolean; label: "full" | "name" | "short" | "none"; boxes: Rect[] }

/** A bin's unit: one test, two tests; BRE counts sessions. */
export function unitFor(fuel: string, n: number): string {
  if (fuel === "emulator") return n === 1 ? "session" : "sessions";
  return n === 1 ? "test" : "tests";
}

/** The box the Solids only caption takes, centred across the plot at height cy. */
function captionBox(frame: Frame, cy: number): Rect {
  const { iw, narrow } = frame;
  return narrow ? { x0: iw / 2 - 124, x1: iw / 2 + 124, y0: cy - 16, y1: cy + 16 } : { x0: iw / 2 - 254, x1: iw / 2 + 254, y0: cy - 26, y1: cy + 26 };
}

/** Where the Solids only caption goes: the lowest height, from near the foot of the plot upwards, at which it
 *  keeps clear of every pin's head and of the toolbar (the foot if there is none). It is placed before the pin
 *  labels, which then keep off it: under Solids only it is the message, and a label can shorten or step aside. */
function captionY(frame: Frame, candidates: Candidate[], reserve: Rect): number {
  const { ih, x, y } = frame;
  const heads: Rect[] = candidates.map((c) => ({ x0: x(c.o2_pct.v) - 8, x1: x(c.o2_pct.v) + 8, y0: y(c.pressure_psi.v) - 22, y1: y(c.pressure_psi.v) + 4 }));
  // A narrow plot's caption is one short line (24 px tall); a wide one's is 40 px.
  const half = frame.narrow ? 14 : 25;
  const foot = frame.narrow ? ih - 20 : ih - 40;
  const tight = (cy: number): Rect => ({ ...captionBox(frame, cy), y0: cy - half, y1: cy + half });
  for (let cy = foot; cy >= 32; cy -= 4) if (!hitsAny(tight(cy), [reserve, ...heads])) return cy;
  return foot;
}

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
const LandLayer = memo(function LandLayer({ frame, grid, multiplier, solids, risen, scene, hatch, robust }: {
  /** risen: false while the story intro's first beat shows the bare plot, before the land and sea come in.
   *  robust: draw the coast at the smallest and the widest step size over the land (D39). */
  frame: Frame; grid: Grid; multiplier: number; solids: boolean; risen: boolean; scene: boolean; hatch: boolean; robust: boolean;
}) {
  const { w, h, m, iw, ih, x, y, z } = frame;
  const land = useMemo(() => landPath(coastFor(grid, multiplier, "all"), grid, x, y), [grid, multiplier, x, y]);
  const solidLand = useMemo(() => landPath(coastFor(grid, multiplier, "solids"), grid, x, y), [grid, multiplier, x, y]);
  const extent = useMemo(() => gridExtent(grid, x, y), [grid, x, y]);
  // Sensitivity of the coast to the nearness step (D39). A smaller step can only shrink the land, so land at the
  // smallest step is land at every step (a solid line round it), and the band out to the widest step's coast (a
  // dashed line) is land only there. Both are coasts the build's grid already holds; nothing new is counted.
  const mode = solids ? "solids" : "all";
  const steps = grid.multipliers;
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  const core = useMemo(() => (robust ? landPath(coastFor(grid, lo, mode), grid, x, y).d : ""), [robust, grid, lo, mode, x, y]);
  const outer = useMemo(() => (robust ? landPath(coastFor(grid, hi, mode), grid, x, y).d : ""), [robust, grid, hi, mode, x, y]);
  // The land is sunk under Solids only and before the intro raises it. Only a change of that animates the land:
  // the transition is on from that change until it ends, so a resize meanwhile or afterwards redraws at once, and
  // a new zoom or step size draws a new coast at once (key).
  const sunk = solids || !risen;
  const [sinkFor, setSinkFor] = useState(sunk);
  const [sinking, setSinking] = useState(false);
  if (sinkFor !== sunk) {
    setSinkFor(sunk);
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
            style={{ strokeWidth: sunk ? land.erode : 0 }}
            onTransitionEnd={() => setSinking(false)}
          />
        </mask>
      </defs>
      <g transform={`translate(${m.left},${m.top})`}>
        <rect width={iw} height={ih} fill="var(--surface)" />
        <g clipPath="url(#plane-clip-land)">
          {/* Sea: the grid's whole extent, hatched (unknown, not safe). The land is drawn over it. Beyond the
              grid the build computed nothing, so neither land nor sea is drawn there. Before the story intro
              raises the land (its first beat) there is no sea either, only the bare plot: sea says "no tests
              near", which is not true where the build counted tests, so it comes in with the land (D37). */}
          <g className="layer" data-on={risen}>
            <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="var(--sea)" />
            <g className="layer" data-on={hatch}>
              <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="url(#hatch-sea)" style={{ opacity: "var(--sea-hatch-opacity)" }} />
            </g>
          </g>
          {solids && risen && solidLand.d && (
            <g>
              <path d={solidLand.d} fill="var(--land)" />
              <path d={solidLand.d} fill="none" stroke="var(--coast)" strokeWidth={1} />
            </g>
          )}
          <g mask="url(#plane-land-mask)">
            <path d={land.d} fill="var(--land)" />
            <path d={land.d} fill="none" stroke="var(--coast)" strokeWidth={1} />
          </g>
          {robust && risen && (
            <g data-robust="">
              {outer && <path d={outer} fill="none" stroke="var(--coast)" strokeWidth={1.5} strokeDasharray="4 3" />}
              {core && <path d={core} fill="none" stroke="var(--coast)" strokeWidth={2.5} />}
            </g>
          )}
        </g>
      </g>
    </svg>
  );
});

/** Pins and the boxes their labels take, placed once per layout (the base draws them; the probe's tag keeps off
 *  their labels). A label on every pin comes before any pin's evidence word: if placing the words leaves a pin
 *  with no label, the pins are placed again without them, and the placing that labels more pins is kept (the
 *  full name and word stay in the tooltip, the Candidates menu and the plane's accessible name). */
function placePins(candidates: Candidate[], words: Partial<Record<string, EvidenceWord>>, frame: Frame, reserve: Rect, placed: Placed[], probeAt: { o2: number; psi: number } | null = null, keepOff: Rect[] = []): PinAt[] {
  const first = placePinsWith(true, candidates, words, frame, reserve, placed, probeAt, keepOff);
  const unlabelled = (ps: PinAt[]) => ps.filter((p) => p.label === "none").length;
  if (!unlabelled(first) || !first.some((p) => p.label === "full")) return first;
  const second = placePinsWith(false, candidates, words, frame, reserve, placed, probeAt, keepOff);
  return unlabelled(second) < unlabelled(first) ? second : first;
}

function placePinsWith(useWords: boolean, candidates: Candidate[], words: Partial<Record<string, EvidenceWord>>, frame: Frame, reserve: Rect, placed: Placed[], probeAt: { o2: number; psi: number } | null, keepOff: Rect[]): PinAt[] {
  const { iw, ih, narrow, x, y } = frame;
  const nameSize = narrow ? 12 : 14;
  const at = candidates.map((c) => ({ c, cx: x(c.o2_pct.v), cy: y(c.pressure_psi.v) }));
  const heads: Rect[] = at.map(({ cx, cy }) => ({ x0: cx - 8, x1: cx + 8, y0: cy - 22, y1: cy + 4 }));
  // The pinned probe's ring and its tag where it first goes (above and right; Plane's tag placement), from a
  // character-count width: the same guess the tag uses before it is measured.
  const probe: Rect[] = [];
  if (probeAt) {
    const px = x(probeAt.o2);
    const py = y(probeAt.psi);
    const tagW = `${fmtNumber(probeAt.o2)}% O2 · ${fmtNumber(probeAt.psi)} psi`.length * 7 + 16;
    const left = px + 16 + tagW > iw;
    const tx0 = left ? px - 16 - tagW : px + 16;
    const ty0 = py < 40 ? py + 16 : py - 32;
    probe.push({ x0: px - 14, x1: px + 14, y0: py - 14, y1: py + 14 }, { x0: tx0, x1: tx0 + tagW, y0: ty0, y1: ty0 + 24 });
  }
  const labels: Rect[] = [];
  return at.map(({ c, cx, cy }, k) => {
    const word = words[c.id];
    type Try = { label: "full" | "name" | "short"; text: string; withWord: boolean };
    const box = (below: boolean, left: boolean, { text, withWord }: Try): Rect => {
      const tw = 4 + Math.max(text.length * nameSize * 0.6, withWord ? (word?.length ?? 0) * 12 * 0.6 : 0);
      return {
        x0: left ? cx - 10 - tw : cx + 8,
        x1: left ? cx - 8 : cx + 10 + tw,
        y0: below ? cy + 20 - nameSize : cy - 12 - nameSize,
        y1: below ? (withWord ? cy + 38 : cy + 24) : withWord ? cy + 6 : cy - 8,
      };
    };
    // Beside the head on the right first (the scenario, which shares a pressure with a habitat candidate,
    // tries under it first), then the other sides. A side inside the plot and clear of the toolbar, every other
    // pin and every label already placed wins; among those, the one over the fewest glyphs, then the earlier.
    // When no side is clear the evidence word goes, then the name gives way to the oxygen alone, then the whole
    // label, rather than print over another.
    const order: [boolean, boolean][] = c.role === "scenario" ? [[true, false], [false, false], [true, true], [false, true]] : [[false, false], [true, false], [false, true], [true, true]];
    const onProbe = !!probeAt && probeAt.o2 === c.o2_pct.v && probeAt.psi === c.pressure_psi.v; // hides its own label
    const hard = [reserve, ...keepOff, ...heads.filter((_, i) => i !== k), ...labels, ...(onProbe ? [] : probe)];
    const cost = (t: Try) => ([b, l]: [boolean, boolean]) => {
      const r = box(b, l, t);
      const out = r.x0 < 0 || r.x1 > iw || r.y0 < 0 || r.y1 > ih;
      const under = placed.filter((g) => g.px + g.r > r.x0 && g.px - g.r < r.x1 && g.py + g.r > r.y0 && g.py - g.r < r.y1).length;
      return (out ? 1e6 : 0) + (hitsAny(r, hard) ? 1e4 : 0) + under;
    };
    const best = (t: Try) => order.reduce((b, o) => (cost(t)(o) < cost(t)(b) ? o : b), order[0]);
    const tries: Try[] = [
      ...(word && useWords ? [{ label: "full" as const, text: c.name, withWord: true }] : []),
      { label: "name", text: c.name, withWord: false },
      { label: "short", text: `${fmtNumber(c.o2_pct.v)}% O2`, withWord: false },
    ];
    for (const t of tries) {
      const [below, left] = best(t);
      if (cost(t)([below, left]) >= 1e4) continue;
      const b = box(below, left, t);
      labels.push(b);
      return { c, cx, cy, text: t.text, word: t.withWord ? word : undefined, below, left, label: t.label, boxes: [heads[k], b] };
    }
    return { c, cx, cy, text: c.name, word: undefined, below: false, left: false, label: "none", boxes: [heads[k]] };
  });
}

/** Everything else that does not move with the probe. Memoised: a drag never re-renders or repaints it. */
const PlaneBase = memo(function PlaneBase({ frame, grid, placed, pins, flame, prebreathe, layers, solids, scene, reserve, capY, activeCandidate, pulse }: {
  frame: Frame; grid: Grid; placed: Placed[]; pins: PinAt[];
  flame?: FlameGrid; prebreathe?: PrebreathePoint[]; layers: Set<string>; solids: boolean; scene: boolean; reserve: Rect;
  /** Under Solids only with no solid test placed, the height of the caption that says so (captionY); else null. */
  capY: number | null;
  activeCandidate: string | null;
  /** The story intro's first beat: the pins appear one after another and pulse (never under reduced motion). */
  pulse: boolean;
}) {
  const { w, h, m, iw, ih, narrow, x, y, z, strips } = frame;
  const nameSize = narrow ? 12 : 14;

  // Where the probe grid ends (land and sea are drawn by LandLayer, underneath). Wherever it ends inside the plot
  // (the headroom of Whole plane; All tests, which also runs past it to the left, right and below; a pinched
  // window) its edge is a dashed line, and one caption beyond it says what lies past that line, so every band
  // outside the grid reads alike, the glyphs drawn there included (D37).
  const ext = useMemo(() => gridExtent(grid, x, y), [grid, x, y]);
  const edgeShows = ext.x > 0.5 || ext.y > 0.5 || ext.x + ext.w < iw - 0.5 || ext.y + ext.h < ih - 0.5;
  const beyondGrid = ext.y;
  const belowGrid = ih - (ext.y + ext.h);

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
    if (capY !== null) taken.push(captionBox(frame, capY));
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
  }, [flame, x, y, z, iw, ih, pins, placed, prebreathe, reserve, frame, capY]);

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
        {edgeShows && (
          <g clipPath="url(#plane-clip)">
            <rect x={ext.x} y={ext.y} width={ext.w} height={ext.h} fill="none" stroke="var(--ink-3)" strokeOpacity={0.7} strokeDasharray="4 3" />
          </g>
        )}
        {edgeShows && (beyondGrid > 24 || belowGrid > 24) && (
          <text x={iw - 8} y={beyondGrid > 24 ? beyondGrid - 8 : ih - 8} textAnchor="end" fontSize={12} fill="var(--ink-3)" paintOrder="stroke" stroke="var(--surface)" strokeWidth={4} strokeLinejoin="round">{narrow ? "Past the dashed line: no coast computed" : "Past the dashed line, beyond the probe grid: no coast computed"}</text>
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
            {pins.map(({ c, cx, cy, text, word, below, left, label }, k) => {
              const on = c.id === activeCandidate;
              const tx = left ? -10 : 10;
              const delay = pulse ? { animationDelay: `calc(${k} * var(--t-fast))` } : undefined;
              return (
                <g key={c.id} transform={`translate(${cx},${cy})`} className={pulse ? "pin-appear" : undefined} style={delay}>
                  {pulse && <circle cy={-14} r={9} className="pin-pulse" fill="none" stroke="var(--candidate)" strokeWidth={2} style={delay} />}
                  <path d={PIN} fill="var(--candidate)" stroke="var(--sea)" strokeWidth={1.5} strokeLinejoin="round" />
                  <circle cy={-14} r={2.25} fill="var(--sea)" />
                  {!on && label !== "none" && (
                    <text x={tx} y={below ? 20 : -12} textAnchor={left ? "end" : "start"} fontSize={nameSize} fontWeight={600} fill="var(--ink)" paintOrder="stroke" stroke="var(--land)" strokeWidth={4} strokeLinejoin="round">
                      {text}
                      {word && <tspan x={tx} dy={14} fontSize={12} fontWeight={400} fill="var(--ink-2)">{word}</tspan>}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {capY !== null && (
            narrow ? (
              // One short line on a phone, so it fits under the pins of a short plot (the headline above the plot,
              // or the intro's card, gives the cited counts).
              <g className={scene ? "lands-after-scene" : "animate-fade"} transform={`translate(${iw / 2},${capY})`}>
                <rect x={-Math.min(120, iw / 2 - 8)} y={-12} width={Math.min(240, iw - 16)} height={24} rx={8} fill="var(--surface)" stroke="var(--solid-edge)" strokeOpacity={0.6} />
                <text textAnchor="middle" dy={4} fontSize={12} fontWeight={600} fill="var(--ink)">No solid test can be placed here</text>
              </g>
            ) : (
              <g className={scene ? "lands-after-scene" : "animate-fade"} transform={`translate(${iw / 2},${capY})`}>
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

        {/* The strip of tests with no recorded pressure comes in after the glyphs in the story intro (index.css). */}
        {layers.has("strip") && <g className="intro-strip"><StripLayer strips={strips} solids={solids} x={x} z={z} iw={iw} top={ih + 56} narrow={narrow} /></g>}
      </g>
    </svg>
  );
});

/** Tests whose pressure is not recorded, in O2-only strips under the plot. */
const StripLayer = memo(function StripLayer({ strips, solids, x, z, iw, top, narrow }: { strips: Strip[]; solids: boolean; x: d3.ScaleLinear<number, number>; z: { o2: [number, number] }; iw: number; top: number; narrow: boolean }) {
  let yy = 8;
  const rows = stripRows(strips, solids);
  return (
    <g transform={`translate(0,${top})`} className="animate-fade">
      <text x={0} y={0} fontSize={12} fontWeight={500} fill="var(--ink-2)">{narrow ? "Oxygen recorded, no pressure: not placeable" : "Oxygen recorded, pressure not recorded: cannot be placed on the plane"}</text>
      {strips.map((s, k) => {
        const hh = rows[k];
        const at = yy;
        yy += hh + 4;
        const ghost = solids && s.fuel_class !== "solid";
        return (
          <g key={`${s.fuel_class}${s.source_type}`} transform={`translate(0,${at})`}>
            <g style={{ opacity: ghost ? 0.25 : 1, transition: "opacity var(--t-move) var(--ease-out)" }}>
            <rect width={iw} height={hh} fill="url(#hatch-plane)" opacity={solids && s.fuel_class === "solid" ? 0.6 : 0.3} rx={2} />
            {s.items.filter((it) => it.o2_pct >= z.o2[0] && it.o2_pct <= z.o2[1]).map((it) => (
              <path key={it.p} d={markerPath(s.fuel_class, Math.min(hh / 2 - 1, 3 + Math.sqrt(it.n)))} transform={`translate(${x(it.o2_pct)},${hh / 2})`} fill={FUEL_COLOR_VAR[s.fuel_class]} stroke={FUEL_RING_VAR[s.fuel_class]}>
                {/* No count here: a native tooltip cannot open a provenance card. The panel's "What's missing" gives,
                    as Values, the tests near the probe's oxygen with no pressure recorded, and the Evidence Explorer
                    lists each test. The oxygen is the item's position, read like an axis tick. */}
                <title>{`${s.unit === "sessions" ? "BRE sessions list" : FUEL_LABEL[s.fuel_class] + " tests at"} ${fmtNumber(it.o2_pct, 1)}% O2, pressure not recorded (${it.investigations.join(", ")})`}</title>
              </path>
            ))}
            </g>
            {/* The lane's name stays readable under Solids only, when its marks are ghosted (D40). */}
            <text x={iw + 8} y={hh / 2} dy="0.32em" fontSize={12} fill="var(--ink-2)" style={{ opacity: ghost ? 0.7 : 1, transition: "opacity var(--t-move) var(--ease-out)" }}>{s.fuel_class === "emulator" ? "BRE" : FUEL_LABEL[s.fuel_class].split(" ")[0]}</text>
          </g>
        );
      })}
    </g>
  );
});

/** Every bin once, its marker sized by its count; the count itself shows only on hover (the overlay's badge).
 *  Under Solids only the other classes fade as one group (one opacity to animate, not one per glyph), so the
 *  fade does not hold up the land sinking beneath it. Inside, one group per fuel class in the build's order
 *  (which keeps the drawing order), so the story intro can fade the classes in one after another (--k). */
const GlyphLayer = memo(function GlyphLayer({ on, placed, solids }: { on: boolean; placed: Placed[]; solids: boolean }) {
  const others = [...new Set(placed.map((g) => g.p.fuel_class))].filter((f) => f !== "solid");
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
      <g className="glyph-group" data-ghost={solids}>
        {others.map((f, k) => (
          <g key={f} className="glyph-class" style={{ "--k": k } as CSSProperties}>{placed.filter((g) => g.p.fuel_class === f).map(glyph)}</g>
        ))}
      </g>
      <g className="glyph-class" style={{ "--k": others.length } as CSSProperties}>{placed.filter((g) => g.p.fuel_class === "solid").map(glyph)}</g>
    </g>
  );
});
