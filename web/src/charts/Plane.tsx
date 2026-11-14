// The plane: oxygen (x) against cabin pressure (y, log scale, psi with kPa on the right), full screen.
// A probe can be dragged anywhere, moved with the arrow keys, or snapped to a candidate atmosphere.
// Everything drawn comes from the Python build; this file only places it. The probe position is snapped
// to the probe grid, so the panel always shows counts the build computed for exactly that node.
//
// Two stacked SVGs: the base (grid, hatching, isotherms, glyphs, candidates, axes, strips) renders once per
// view; the overlay (nearness region, probe, selection, pointer surface) is the only thing that repaints
// while the probe moves, so a drag stays within a frame even with a thousand glyphs on the plane.
import * as d3 from "d3";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FUEL_COLOR_VAR, FUEL_EDGE_VAR, FUEL_RING_VAR, Hatch, markerPath } from "../components/Common";
import { fmtNumber, FUEL_LABEL } from "../lib/format";
import { snapIndex, type Grid } from "../lib/probe";
import type { Candidate } from "../lib/types";
import { ZOOMS, type Box, type View } from "../lib/view";
import type { FlameGrid, MapPoint, PlannerCell, PrebreathePoint, Strip, TradeMapData } from "./TradeMap";

const KPA_PER_PSI = 6.894757293168361; // axis labels only; every value shown in the panel carries its own kPa
const MAGNET_PX = 14;
// Glyphs are clipped to the plot plus this margin, not to the plot itself, so a test on the edge of the domain
// (15% O2, say) draws whole: the largest marker, the emulator diamond at r = 12, reaches 15.6 px plus its stroke.
const GLYPH_PAD = 18;

export type ProbeMode = "hover" | "drag" | "commit";

interface Props {
  map: TradeMapData;
  candidates: Candidate[];
  grid: Grid;
  flame?: FlameGrid;
  planner?: PlannerCell[];
  prebreathe?: PrebreathePoint[];
  view: View;
  probe: { o2: number; psi: number };
  brushMode: boolean;
  onProbe: (o2: number, psi: number, mode: ProbeMode) => void;
  onHoverEnd: () => void;
  onBrush: (box: Box | null) => void;
  onOpenCandidate: (id: string) => void;
  onToggleBrush: () => void;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 960, h: 640 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(320, e.contentRect.width), h: Math.max(320, e.contentRect.height) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
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

function useFrame(w: number, h: number, view: View, rawStrips: Strip[]): Frame {
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
  const top = 16;
  const bottom = 48 + stripH;
  const iw = w - left - right;
  const ih = Math.max(160, h - top - bottom);
  const x = useMemo(() => d3.scaleLinear().domain(z.o2).range([0, iw]), [z, iw]);
  const y = useMemo(() => d3.scaleLog().domain(z.psi).range([ih, 0]), [z, ih]);
  const m = useMemo(() => ({ top, right, bottom, left }), [right, bottom, left]);
  // One stable object per layout, so the memoised base layer is skipped while the probe moves.
  return useMemo(() => ({ w, h, m, iw, ih, narrow, x, y, z, strips }), [w, h, m, iw, ih, narrow, x, y, z, strips]);
}

export function Plane(props: Props) {
  const { map, candidates, grid, flame, planner, prebreathe, view, probe, brushMode, onProbe, onHoverEnd, onBrush, onOpenCandidate, onToggleBrush } = props;
  const [wrap, { w, h }] = useSize<HTMLDivElement>();
  const overlay = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const raf = useRef<number | null>(null);
  const f = useFrame(w, h, view, map.strips);
  const { m, iw, ih, x, y } = f;

  const onCand = candidates.find((c) => c.o2_pct.v === probe.o2 && c.pressure_psi.v === probe.psi);

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
    if (brushMode) {
      setBrush({ x0: d.px, y0: d.py, x1: d.px, y1: d.py });
      return;
    }
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
    schedule(() => onProbe(d.o2, d.psi, dragging ? "drag" : "hover"));
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
  const n = grid.file.nearness;
  const halo = useMemo(() => {
    const pts = d3.range(0, 2 * Math.PI + 0.01, Math.PI / 60).map((t) => [
      x(probe.o2 + n.threshold * n.o2_step * view.m * Math.cos(t)),
      y(probe.psi * Math.exp(n.threshold * n.log_pressure_step * view.m * Math.sin(t))),
    ] as [number, number]);
    return d3.line()(pts) ?? "";
  }, [probe, x, y, n, view.m]);
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
  useLayoutEffect(measureTag, [tag, measureTag]);
  useEffect(() => {
    void document.fonts?.ready.then(measureTag); // the web font may arrive after the first measure
  }, [measureTag]);
  const tagW = (tagTextW ?? tag.length * 7) + 16;
  const tagLeft = pxp + 16 + tagW > iw;
  const glide = dragging ? "none" : "transform var(--t-move) var(--ease-out)";

  return (
    <div ref={wrap} className="relative h-full w-full select-none">
      <PlaneBase frame={f} map={map} candidates={candidates} flame={flame} planner={planner} prebreathe={prebreathe} layers={view.layers} solids={view.solids} activeCandidate={onCand?.id ?? null} />
      <svg
        ref={overlay}
        width={w}
        height={h}
        role="application"
        tabIndex={0}
        aria-roledescription="plane"
        aria-label={`Oxygen against cabin pressure. Probe at ${tag}. Arrow keys move the probe one grid step, Alt with an arrow moves ten, Shift with an arrow jumps to the next candidate atmosphere, Enter opens its dossier, B selects an area.`}
        onKeyDown={onKeyDown}
        className="absolute inset-0 block rounded-lg focus-visible:outline-offset-[-2px]"
        style={{ willChange: "transform" }}
      >
        <defs><clipPath id="plane-clip-overlay"><rect width={iw} height={ih} /></clipPath></defs>
        <g transform={`translate(${m.left},${m.top})`}>
          <g clipPath="url(#plane-clip-overlay)">
            {view.box && !brush && (
              <rect x={x(view.box.o2[0])} y={y(view.box.psi[1])} width={x(view.box.o2[1]) - x(view.box.o2[0])} height={y(view.box.psi[0]) - y(view.box.psi[1])} fill="var(--accent)" fillOpacity={0.06} stroke="var(--accent)" strokeDasharray="4 3" />
            )}
            {brush && (
              <rect x={Math.min(brush.x0, brush.x1)} y={Math.min(brush.y0, brush.y1)} width={Math.abs(brush.x1 - brush.x0)} height={Math.abs(brush.y1 - brush.y0)} fill="var(--accent)" fillOpacity={0.08} stroke="var(--accent)" strokeDasharray="4 3" />
            )}
            <g className="layer" data-on={view.layers.has("halo")}>
              <path d={halo} fill="var(--probe)" fillOpacity={0.05} stroke="var(--probe)" strokeOpacity={0.5} strokeDasharray="6 4" strokeWidth={1.5} />
            </g>
            <g style={{ transform: `translate(${pxp}px, ${pyp}px)`, transition: glide }} pointerEvents="none">
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
            onPointerLeave={() => !dragging && !brush && onHoverEnd()}
          />
        </g>
      </svg>
      <span className="sr-only" aria-live="polite">{brushMode ? "Area selection on. Drag across the plane to select tests; press B to turn it off." : ""}</span>
    </div>
  );
}

/** Everything that does not move with the probe. Memoised: a drag never re-renders or repaints it. */
const PlaneBase = memo(function PlaneBase({ frame, map, candidates, flame, planner, prebreathe, layers, solids, activeCandidate }: {
  frame: Frame; map: TradeMapData; candidates: Candidate[]; flame?: FlameGrid; planner?: PlannerCell[]; prebreathe?: PrebreathePoint[];
  layers: Set<string>; solids: boolean; activeCandidate: string | null;
}) {
  const { w, h, m, iw, ih, narrow, x, y, z, strips } = frame;
  const glyphs = useMemo(
    () => map.points.filter((p) => p.pressure_psi >= z.psi[0] && p.pressure_psi <= z.psi[1] && p.o2_pct >= z.o2[0] && p.o2_pct <= z.o2[1]),
    [map.points, z],
  );
  const placedSolid = useMemo(() => map.points.some((p) => p.fuel_class === "solid"), [map.points]);
  const r = useMemo(() => d3.scaleSqrt().domain([1, 40]).range([4, 12]).clamp(true), []);

  const contours = useMemo(() => {
    if (!flame) return [];
    const nx = flame.o2_pct.length;
    const ny = flame.pressure_psi.length;
    const gen = d3.contours().size([nx, ny]).thresholds(flame.isotherms_K.map((t) => t.v));
    const o2At = d3.scaleLinear().domain([0.5, nx - 0.5]).range([flame.o2_pct[0], flame.o2_pct[nx - 1]]);
    const pAt = d3.scaleLinear().domain([0.5, ny - 0.5]).range([flame.pressure_psi[0], flame.pressure_psi[ny - 1]]);
    // Boxes an isotherm label must stay clear of: every candidate's ring and name (the name is drawn unless the
    // probe sits on that candidate; it is kept clear either way), then each isotherm label once placed. Widths
    // are generous estimates (0.6 em a character), so a label that might touch is moved, never one that does not.
    type Box = { x0: number; x1: number; y0: number; y1: number };
    const nameSize = narrow ? 12 : 14;
    const taken: Box[] = candidates.flatMap((c) => {
      const cx = x(c.o2_pct.v);
      const cy = y(c.pressure_psi.v);
      const base = cy + (c.role === "scenario" ? 20 : -10);
      return [
        { x0: cx - 10, x1: cx + 10, y0: cy - 10, y1: cy + 10 },
        { x0: cx + 10, x1: cx + 14 + c.name.length * nameSize * 0.6, y0: base - nameSize, y1: base + 4 },
      ];
    });
    const hits = (b: Box) => taken.some((t) => b.x0 < t.x1 && b.x1 > t.x0 && b.y0 < t.y1 && b.y1 > t.y0);
    return gen(flame.temperature_K.flat()).map((c, i) => {
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
      // The label sits 30% along the line, or at the next spot along it that is clear; none is drawn if none is.
      const labelPts = lines.flat().filter(([px, py]) => px > 40 && px < iw - 40 && py > 16 && py < ih - 16);
      const text = `${fmtNumber(flame.isotherms_K[i].v, 0)} K`;
      const half = (text.length * 12 * 0.6) / 2 + 2;
      const boxAt = ([lx, ly]: [number, number]): Box => ({ x0: lx - half, x1: lx + half, y0: ly - 17, y1: ly + 2 });
      let label: [number, number] | null = null;
      for (const at of [0.3, 0.45, 0.6, 0.15, 0.75, 0.9]) {
        const pt = labelPts[Math.floor(labelPts.length * at)];
        if (pt && !hits(boxAt(pt))) {
          label = pt;
          taken.push(boxAt(pt));
          break;
        }
      }
      return { value: flame.isotherms_K[i].v, lines: lines.map((l) => d3.line()(l) ?? ""), label };
    });
  }, [flame, x, y, z, iw, ih, candidates, narrow]);

  const blind = useMemo(() => {
    if (!planner) return [];
    const mats = solids ? ["solid"] : ["solid", "droplet", "gas"];
    const byPos = new Map<string, PlannerCell[]>();
    for (const c of planner) if (mats.includes(c.material)) byPos.set(`${c.o2_pct}|${c.pressure_psi}`, [...(byPos.get(`${c.o2_pct}|${c.pressure_psi}`) ?? []), c]);
    const o2s = [...new Set(planner.map((c) => c.o2_pct))].sort((a, b) => a - b);
    const ps = [...new Set(planner.map((c) => c.pressure_psi))].sort((a, b) => a - b);
    const edge = (arr: number[], i: number, side: -1 | 1, log = false) => {
      const v = arr[i];
      const nb = arr[i + side];
      if (nb === undefined) {
        const o = arr[i - side];
        return log ? v * Math.sqrt(v / o) : v + (v - o) / 2;
      }
      return log ? Math.sqrt(v * nb) : (v + nb) / 2;
    };
    const out: { key: string; x: number; y: number; w: number; h: number }[] = [];
    o2s.forEach((o2, i) => ps.forEach((p, j) => {
      const cells = byPos.get(`${o2}|${p}`) ?? [];
      if (!cells.every((c) => c.n_near.v === 0)) return;
      const x0 = x(edge(o2s, i, -1));
      const x1 = x(edge(o2s, i, 1));
      const y0 = y(edge(ps, j, 1, true));
      const y1 = y(edge(ps, j, -1, true));
      out.push({ key: `${o2}|${p}`, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
    }));
    return out;
  }, [planner, solids, x, y]);

  const psiTicks = [3, 4.3, 6, 8.2, 10.2, 14.7, 20, 30, 45].filter((p) => p >= z.psi[0] && p <= z.psi[1]);
  const kpaTicks = [20, 30, 40, 50, 70, 100, 150, 200, 300].filter((k) => k / KPA_PER_PSI >= z.psi[0] && k / KPA_PER_PSI <= z.psi[1]);
  const o2Ticks = x.ticks(narrow ? 5 : 10);

  return (
    <svg data-chart width={w} height={h} aria-hidden="true" className="absolute inset-0 block">
      <defs>
        <Hatch id="hatch-plane" />
        <clipPath id="plane-clip"><rect width={iw} height={ih} /></clipPath>
        <clipPath id="plane-clip-glyphs"><rect x={-GLYPH_PAD} y={-GLYPH_PAD} width={iw + 2 * GLYPH_PAD} height={ih + 2 * GLYPH_PAD} /></clipPath>
      </defs>
      <g transform={`translate(${m.left},${m.top})`}>
        <rect width={iw} height={ih} fill="var(--surface-2)" stroke="var(--line)" />
        {psiTicks.map((p) => <line key={`gy${p}`} x1={0} x2={iw} y1={y(p)} y2={y(p)} stroke="var(--line)" />)}
        {o2Ticks.map((t) => <line key={`gx${t}`} y1={0} y2={ih} x1={x(t)} x2={x(t)} stroke="var(--line)" />)}

        <g clipPath="url(#plane-clip)">
          <g className="layer" data-on={layers.has("blind")}>
            {blind.map((b) => <rect key={b.key} x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#hatch-plane)" opacity={solids ? 0.7 : 0.4} style={{ transition: "opacity var(--t-move) var(--ease-out)" }} />)}
          </g>

          <g className="layer" data-on={layers.has("ft")}>
            {contours.map((c) => (
              <g key={c.value}>
                {c.lines.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--isotherm)" strokeWidth={1} strokeDasharray="4 4" />)}
                {c.label && <text x={c.label[0]} y={c.label[1]} dy={-4} fontSize={12} fill="var(--ink-3)" fontStyle="italic" textAnchor="middle" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={4}>{fmtNumber(c.value, 0)} K</text>}
              </g>
            ))}
          </g>

        </g>

        <g clipPath="url(#plane-clip-glyphs)">
          <GlyphLayer on={layers.has("ev")} points={glyphs} x={x} y={y} r={r} solids={solids} />
        </g>

        <g clipPath="url(#plane-clip)">
          <g className="layer" data-on={layers.has("pb")}>
            {(prebreathe ?? []).map((pb) => (
              <g key={pb.finding_id} transform={`translate(${x(pb.o2_pct.v)},${y(pb.pressure_psi.v)})`}>
                <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill="none" stroke="var(--prebreathe)" strokeWidth={2} />
                <text x={10} y={-8} fontSize={12} fill="var(--ink-2)">{pb.duration_text}</text>
              </g>
            ))}
          </g>

          <g className="layer" data-on={layers.has("cand")}>
            {candidates.map((c) => {
              const on = c.id === activeCandidate;
              return (
                <g key={c.id} transform={`translate(${x(c.o2_pct.v)},${y(c.pressure_psi.v)})`}>
                  <circle r={on ? 9 : 7} fill="var(--surface-2)" stroke="var(--candidate)" strokeWidth={on ? 2.5 : 2} />
                  <circle r={2.5} fill="var(--candidate)" />
                  {!on && <text x={12} y={c.role === "scenario" ? 20 : -10} fontSize={narrow ? 12 : 14} fontWeight={600} fill="var(--ink)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={4}>{c.name}</text>}
                </g>
              );
            })}
          </g>

          {solids && !placedSolid && (
            narrow ? (
              <g className="animate-fade" transform={`translate(${iw / 2},${ih - 40})`}>
                <rect x={-Math.min(140, iw / 2 - 8)} y={-24} width={Math.min(280, iw - 16)} height={48} rx={8} fill="var(--surface)" stroke="var(--solid-edge)" strokeOpacity={0.6} />
                <text textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--ink)">
                  <tspan x={0} dy={-4}>No solid-material test can be</tspan>
                  <tspan x={0} dy={18}>placed on this plane</tspan>
                </text>
              </g>
            ) : (
              <g className="animate-fade" transform={`translate(${iw / 2},${ih - 40})`}>
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

const GlyphLayer = memo(function GlyphLayer({ on, points, x, y, r, solids }: { on: boolean; points: MapPoint[]; x: d3.ScaleLinear<number, number>; y: d3.ScaleLogarithmic<number, number>; r: d3.ScalePower<number, number>; solids: boolean }) {
  return (
    <g className="layer" data-on={on}>
      {points.map((p) => {
        const outline = p.source_type === "published_paper";
        const ghost = solids && p.fuel_class !== "solid";
        return (
          <path
            key={p.p}
            className="glyph"
            data-ghost={ghost}
            d={markerPath(p.fuel_class, r(p.n))}
            transform={`translate(${x(p.o2_pct)},${y(p.pressure_psi)})`}
            fill={outline ? "var(--surface-2)" : FUEL_COLOR_VAR[p.fuel_class]}
            fillOpacity={outline ? 1 : 0.85}
            stroke={outline ? FUEL_EDGE_VAR[p.fuel_class] : FUEL_RING_VAR[p.fuel_class]}
            strokeWidth={outline ? 2 : 1}
          />
        );
      })}
    </g>
  );
});
