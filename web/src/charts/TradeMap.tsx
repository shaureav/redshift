// The Trade Map: oxygen percentage (x) against cabin pressure (y, log scale, psi with kPa on the right).
// Every glyph, count and contour comes from the Python build; this file only draws them.
import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FUEL_COLOR_VAR, FUEL_EDGE_VAR, FUEL_RING_VAR, Hatch, markerPath } from "../components/Common";
import { FUEL_LABEL, fmtNumber } from "../lib/format";
import type { Candidate, CandidateEvidence, Val } from "../lib/types";

export interface MapPoint {
  fuel_class: string;
  source_type: string;
  o2_pct: number;
  pressure_kpa: number;
  pressure_psi: number;
  n: number;
  test_ids: string[];
  investigations: string[];
  outcomes: Record<string, number>;
  p: string;
}
export interface Strip {
  fuel_class: string;
  source_type: string;
  unit?: string;
  items: { o2_pct: number; n: number; investigations: string[]; test_ids: string[]; p: string }[];
}
export interface TradeMapData {
  points: MapPoint[];
  strips: Strip[];
  inverse_flames: Val<number>;
}
export interface FlameGrid {
  o2_pct: number[];
  pressure_psi: number[];
  temperature_K: number[][];
  approximate: boolean[][];
  isotherms_K: Val<number>[];
}
export interface PlannerCell {
  id: string;
  o2_pct: number;
  pressure_psi: number;
  material: string;
  n_near: Val<number>;
  priority: Record<string, Val<number>>;
}
export interface PrebreathePoint {
  finding_id: string;
  atmosphere: string;
  pressure_psi: Val<number>;
  o2_pct: Val<number>;
  duration_text?: string;
}

export type Layer = "ft" | "ev" | "strip" | "cand" | "blind" | "pb";
export const ALL_LAYERS: { id: Layer; label: string }[] = [
  { id: "cand", label: "Candidate atmospheres" },
  { id: "ev", label: "Test evidence" },
  { id: "strip", label: "Pressure not recorded" },
  { id: "blind", label: "Blind spots (no tests)" },
  { id: "ft", label: "Flame temperature" },
  { id: "pb", label: "Prebreathe" },
];

export const ZOOMS = {
  all: { label: "All tests", o2: [10, 102] as [number, number], psi: [2.5, 50] as [number, number] },
  habitat: { label: "Habitat range", o2: [15, 45] as [number, number], psi: [6, 17] as [number, number] },
  suit: { label: "Suit corner", o2: [20, 102] as [number, number], psi: [3, 16] as [number, number] },
};
export type ZoomKey = keyof typeof ZOOMS;

const KPA_PER_PSI = 6.894757293168361; // axis labelling only (secondary axis); data values come converted

interface Props {
  map: TradeMapData;
  candidates: Candidate[];
  evidence: CandidateEvidence[];
  grid?: FlameGrid;
  planner?: PlannerCell[];
  prebreathe?: PrebreathePoint[];
  layers: Set<Layer>;
  solidsOnly: boolean;
  zoom: ZoomKey;
  highlight?: string;
  height?: number;
  steps?: { threshold: Val<number>; o2_step: Val<number>; pressure_ratio: Val<number> };
}

type Tip = { x: number; y: number; html: React.ReactNode } | null;

export function TradeMap({ map, candidates, evidence, grid, planner, prebreathe, layers, solidsOnly, zoom, highlight, height = 600, steps }: Props) {
  // Nearness parameters from the build (candidate_evidence.json steps); used for the halo geometry only.
  const thr = steps?.threshold.v ?? 1.5;
  const o2Step = steps?.o2_step.v ?? 5;
  const pRatio = steps?.pressure_ratio.v ?? 1.25;
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [tip, setTip] = useState<Tip>(null);
  const [hoverCand, setHoverCand] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(320, entries[0].contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const narrow = width < 640;
  const stripClasses = map.strips.filter((s) => !solidsOnly || s.fuel_class === "solid");
  const stripRowH = 18;
  const stripH = layers.has("strip") ? 26 + stripClasses.length * stripRowH : 0;
  const m = { top: 16, right: narrow ? 44 : 64, bottom: 44 + stripH, left: narrow ? 44 : 60 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const z = ZOOMS[zoom];

  const x = useMemo(() => d3.scaleLinear().domain(z.o2).range([0, iw]), [z, iw]);
  const y = useMemo(() => d3.scaleLog().domain(z.psi).range([ih, 0]), [z, ih]);

  const points = useMemo(
    () => map.points.filter((p) => (!solidsOnly || p.fuel_class === "solid") && p.pressure_psi >= z.psi[0] && p.pressure_psi <= z.psi[1] && p.o2_pct >= z.o2[0] && p.o2_pct <= z.o2[1]),
    [map.points, solidsOnly, z],
  );
  const offscreen = map.points.filter((p) => (!solidsOnly || p.fuel_class === "solid")).length - points.length;
  const r = d3.scaleSqrt().domain([1, 40]).range([4, 13]).clamp(true);

  // Flame temperature contours (geometry only; levels and values from the build).
  const contours = useMemo(() => {
    if (!grid || !layers.has("ft")) return [];
    const nx = grid.o2_pct.length;
    const ny = grid.pressure_psi.length;
    const flat = grid.temperature_K.flat();
    const gen = d3.contours().size([nx, ny]).thresholds(grid.isotherms_K.map((t) => t.v));
    const o2At = d3.scaleLinear().domain([0.5, nx - 0.5]).range([grid.o2_pct[0], grid.o2_pct[nx - 1]]);
    const pAt = d3.scaleLinear().domain([0.5, ny - 0.5]).range([grid.pressure_psi[0], grid.pressure_psi[ny - 1]]);
    return gen(flat).map((c, i) => {
      // d3.contours returns filled polygons; keep only the isoline parts (drop points on the grid edge).
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
      return { value: grid.isotherms_K[i], lines };
    });
  }, [grid, layers, x, y, z]);

  const blind = useMemo(() => {
    if (!planner || !layers.has("blind")) return [];
    const mats = solidsOnly ? ["solid"] : ["solid", "droplet", "gas"];
    const byPos = new Map<string, PlannerCell[]>();
    for (const c of planner) {
      if (!mats.includes(c.material)) continue;
      const k = `${c.o2_pct}|${c.pressure_psi}`;
      byPos.set(k, [...(byPos.get(k) ?? []), c]);
    }
    const o2s = [...new Set(planner.map((c) => c.o2_pct))].sort((a, b) => a - b);
    const ps = [...new Set(planner.map((c) => c.pressure_psi))].sort((a, b) => a - b);
    const edge = (arr: number[], i: number, side: -1 | 1, log = false) => {
      const v = arr[i];
      const n = arr[i + side];
      if (n === undefined) {
        const o = arr[i - side];
        return log ? v * Math.sqrt(v / o) : v + (v - o) / 2;
      }
      return log ? Math.sqrt(v * n) : (v + n) / 2;
    };
    const out: { x0: number; x1: number; y0: number; y1: number; cells: PlannerCell[]; empty: boolean }[] = [];
    o2s.forEach((o2, i) => {
      ps.forEach((p, j) => {
        const cells = byPos.get(`${o2}|${p}`) ?? [];
        const empty = cells.every((c) => c.n_near.v === 0);
        out.push({ x0: x(edge(o2s, i, -1)), x1: x(edge(o2s, i, 1)), y0: y(edge(ps, j, 1, true)), y1: y(edge(ps, j, -1, true)), cells, empty });
      });
    });
    return out;
  }, [planner, layers, solidsOnly, x, y]);

  const evById = useMemo(() => new Map(evidence.map((e) => [e.candidate_id, e])), [evidence]);

  const halo = (c: Candidate) => {
    // The nearness region, from the build's nearness parameters.
    const pts: [number, number][] = d3.range(0, 2 * Math.PI + 0.01, Math.PI / 48).map((t) => [
      x(c.o2_pct.v + thr * o2Step * Math.cos(t)),
      y(c.pressure_psi.v * Math.pow(pRatio, thr * Math.sin(t))),
    ]);
    return d3.line()(pts) ?? "";
  };

  const kpaTicks = [20, 30, 50, 70, 100, 150, 200, 300].filter((k) => k / KPA_PER_PSI >= z.psi[0] && k / KPA_PER_PSI <= z.psi[1]);
  const psiTicks = [3, 4.3, 6, 8.2, 10.2, 14.7, 20, 30, 45].filter((p) => p >= z.psi[0] && p <= z.psi[1]);
  const o2Ticks = x.ticks(narrow ? 5 : 10);

  const show = (e: React.MouseEvent | React.FocusEvent, html: React.ReactNode) => {
    const box = wrap.current?.getBoundingClientRect();
    const tgt = (e.currentTarget as Element).getBoundingClientRect();
    if (!box) return;
    setTip({ x: tgt.left - box.left + tgt.width / 2, y: tgt.top - box.top, html });
  };

  return (
    <div ref={wrap} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg data-chart width={width} height={height} role="img" aria-label="Trade map of oxygen percentage against cabin pressure, showing candidate atmospheres and the microgravity fire tests near them" className="select-none">
        <defs>
          <Hatch id="hatch-map" />
          <clipPath id="plot-clip"><rect width={iw} height={ih} /></clipPath>
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          <rect width={iw} height={ih} fill="var(--surface-2)" stroke="var(--line)" />
          {/* gridlines */}
          {psiTicks.map((p) => <line key={`gy${p}`} x1={0} x2={iw} y1={y(p)} y2={y(p)} stroke="var(--line)" strokeWidth={1} />)}
          {o2Ticks.map((t) => <line key={`gx${t}`} y1={0} y2={ih} x1={x(t)} x2={x(t)} stroke="var(--line)" strokeWidth={1} />)}

          <g clipPath="url(#plot-clip)">
            {/* blind spots: hatched where no test of the selected classes sits near the cell */}
            {blind.filter((b) => b.empty).map((b, i) => (
              <rect key={i} x={Math.min(b.x0, b.x1)} y={Math.min(b.y0, b.y1)} width={Math.abs(b.x1 - b.x0)} height={Math.abs(b.y1 - b.y0)} fill="url(#hatch-map)" opacity={0.55}>
                <title>No {solidsOnly ? "solid-material " : ""}tests recorded near this cell</title>
              </rect>
            ))}

            {/* flame temperature isotherms */}
            {contours.map((c) => (
              <g key={c.value.v}>
                {c.lines.map((l, i) => (
                  <path key={i} d={d3.line()(l) ?? ""} fill="none" stroke="var(--isotherm)" strokeWidth={1.2} strokeDasharray="4 3" />
                ))}
                {(() => {
                  const pts = c.lines.flat().filter(([px, py]) => px > 30 && px < iw - 30 && py > 12 && py < ih - 12);
                  if (!pts.length) return null;
                  const [lx, ly] = pts[Math.floor(pts.length * 0.35)];
                  return (
                    <text x={lx} y={ly} dy={-3} fontSize={12} fill="var(--ink-3)" fontStyle="italic" textAnchor="middle" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={3}>
                      {fmtNumber(c.value.v, 0)} K
                    </text>
                  );
                })()}
              </g>
            ))}

            {/* candidate halos (nearness region) */}
            {layers.has("cand") && candidates.filter((c) => c.id === highlight || c.id === hoverCand).map((c) => (
              <path key={`h${c.id}`} d={halo(c)} fill="var(--accent)" fillOpacity={0.08} stroke="var(--accent)" strokeDasharray="5 3" strokeWidth={1.5}>
                <title>{`Nearness region of ${c.name}: within ${fmtNumber(thr)} steps (one step is ${fmtNumber(o2Step)} O2 points or a pressure ratio of ${fmtNumber(pRatio)})`}</title>
              </path>
            ))}

            {/* test evidence */}
            {layers.has("ev") && points.map((p) => {
              const outline = p.source_type === "published_paper";
              return (
                <path
                  key={p.p}
                  d={markerPath(p.fuel_class, r(p.n))}
                  transform={`translate(${x(p.o2_pct)},${y(p.pressure_psi)})`}
                  fill={outline ? "var(--surface-2)" : FUEL_COLOR_VAR[p.fuel_class]}
                  fillOpacity={outline ? 1 : 0.85}
                  stroke={outline ? FUEL_EDGE_VAR[p.fuel_class] : FUEL_RING_VAR[p.fuel_class]}
                  strokeWidth={outline ? 2 : 1.5}
                  className="transition-opacity"
                  onMouseEnter={(e) => show(e, (
                    <div>
                      <div className="font-semibold">{p.n} {FUEL_LABEL[p.fuel_class].toLowerCase()} {p.n === 1 ? "test" : "tests"} ({outline ? "published paper" : "PSI table"})</div>
                      <div>O2 {fmtNumber(p.o2_pct, 1)}%, {fmtNumber(p.pressure_psi, 2)} psi ({fmtNumber(p.pressure_kpa, 1)} kPa)</div>
                      <div className="text-ink-3">{p.investigations.join(", ")}</div>
                      {Object.keys(p.outcomes).filter((k) => k !== "None").length > 0 && (
                        <div className="mt-1">Recorded outcomes: {Object.entries(p.outcomes).filter(([k]) => k !== "None").map(([k, v]) => `"${k}" ${v}`).join(", ")}</div>
                      )}
                    </div>
                  ))}
                  onClick={() => navigate(`/evidence?ids=${encodeURIComponent(p.test_ids.join(","))}`)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}

            {/* prebreathe points (published, verified only) */}
            {layers.has("pb") && (prebreathe ?? []).map((pb) => (
              <g key={pb.finding_id} transform={`translate(${x(pb.o2_pct.v)},${y(pb.pressure_psi.v)})`}>
                <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill="var(--prebreathe)" />
                <text x={9} y={-8} fontSize={12} fill="var(--ink)">{pb.duration_text}</text>
              </g>
            ))}

            {/* candidates */}
            {layers.has("cand") && candidates.map((c) => {
              const ev = evById.get(c.id);
              const cx = x(c.o2_pct.v);
              const cy = y(c.pressure_psi.v);
              const on = c.id === highlight;
              const open = () => navigate(`/dossiers/candidate/${c.id}`);
              return (
                <g
                  key={c.id}
                  transform={`translate(${cx},${cy})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.name}, ${c.short}. ${ev?.near_total.v ?? 0} tests near. Open dossier`}
                  onClick={open}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
                  onMouseEnter={(e) => { setHoverCand(c.id); if (ev) show(e, <CandTip c={c} ev={ev} solidsOnly={solidsOnly} />); }}
                  onMouseLeave={() => setHoverCand(null)}
                  onFocus={(e) => ev && show(e, <CandTip c={c} ev={ev} solidsOnly={solidsOnly} />)}
                  onBlur={() => setTip(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle r={on ? 9 : 7} fill="var(--surface-2)" stroke={on ? "var(--accent)" : "var(--candidate)"} strokeWidth={on ? 3 : 2.25} />
                  <circle r={2.5} fill={on ? "var(--accent)" : "var(--candidate)"} />
                  <text x={11} y={c.role === "scenario" ? 20 : -8} fontSize={12} fontWeight={600} fill="var(--ink)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={4}>
                    {c.name}
                  </text>
                  {!narrow && (
                    <text x={11} y={c.role === "scenario" ? 34 : 6} fontSize={12} fill="var(--ink-2)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={4}>
                      {solidsOnly
                        ? `${(ev?.near.solid.psi_table.v ?? 0) + (ev?.near.solid.published_paper.v ?? 0)} solid tests near`
                        : `${ev?.near_total.v ?? 0} tests near`}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* axes */}
          <g transform={`translate(0,${ih})`}>
            {o2Ticks.map((t) => (
              <g key={t} transform={`translate(${x(t)},0)`}>
                <line y2={5} stroke="var(--ink-3)" />
                <text y={18} textAnchor="middle" fontSize={12} fill="var(--ink-2)" className="num">{t}</text>
              </g>
            ))}
            <text x={iw / 2} y={36} textAnchor="middle" fontSize={12} fill="var(--ink)">Oxygen (% by volume)</text>
          </g>
          {psiTicks.map((p) => (
            <g key={p} transform={`translate(0,${y(p)})`}>
              <line x2={-5} stroke="var(--ink-3)" />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--ink-2)" className="num">{p}</text>
            </g>
          ))}
          <text transform={`translate(${-(narrow ? 32 : 44)},${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--ink)">Pressure (psi, log scale)</text>
          {kpaTicks.map((k) => (
            <g key={k} transform={`translate(${iw},${y(k / KPA_PER_PSI)})`}>
              <line x2={5} stroke="var(--ink-3)" />
              <text x={8} dy="0.32em" fontSize={12} fill="var(--ink-3)" className="num">{k}</text>
            </g>
          ))}
          <text transform={`translate(${iw + (narrow ? 34 : 48)},${ih / 2}) rotate(90)`} textAnchor="middle" fontSize={12} fill="var(--ink-2)">kPa</text>

          {/* pressure-not-recorded strips */}
          {layers.has("strip") && (
            <g transform={`translate(0,${ih + 48})`}>
              <text x={0} y={0} fontSize={12} fontWeight={600} fill="var(--ink)">O2 recorded, pressure not recorded (cannot be placed on the plane)</text>
              {stripClasses.map((s, i) => (
                <g key={`${s.fuel_class}${s.source_type}`} transform={`translate(0,${10 + i * stripRowH})`}>
                  <rect width={iw} height={stripRowH - 4} fill="url(#hatch-map)" opacity={0.35} />
                  {s.items.filter((it) => it.o2_pct >= z.o2[0] && it.o2_pct <= z.o2[1]).map((it) => (
                    <path
                      key={it.p}
                      d={markerPath(s.fuel_class, Math.min(7, 3 + Math.sqrt(it.n)))}
                      transform={`translate(${x(it.o2_pct)},${(stripRowH - 4) / 2})`}
                      fill={FUEL_COLOR_VAR[s.fuel_class]}
                      stroke={FUEL_RING_VAR[s.fuel_class]}
                      onMouseEnter={(e) => show(e, (
                        <div>
                          <div className="font-semibold">
                            {s.unit === "sessions"
                              ? `${it.n} BRE ${it.n === 1 ? "session lists" : "sessions list"} ${fmtNumber(it.o2_pct, 1)}% O2`
                              : `${it.n} ${FUEL_LABEL[s.fuel_class].toLowerCase()} ${it.n === 1 ? "test" : "tests"} at ${fmtNumber(it.o2_pct, 1)}% O2`}
                          </div>
                          <div>Pressure not recorded in the PSI table</div>
                          <div className="text-ink-3">{it.investigations.join(", ")}</div>
                        </div>
                      ))}
                      onClick={() => navigate(`/evidence?ids=${encodeURIComponent(it.test_ids.join(","))}`)}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                  <text x={iw + 6} y={(stripRowH - 4) / 2} dy="0.32em" fontSize={12} fill="var(--ink-2)">{s.fuel_class === "emulator" ? "BRE" : FUEL_LABEL[s.fuel_class].split(" ")[0]}</text>
                </g>
              ))}
            </g>
          )}
        </g>
      </svg>
      {offscreen > 0 && layers.has("ev") && (
        <p className="absolute right-3 top-3 rounded bg-surface-2/90 px-2 py-1 text-xs text-ink-3">
          Some tests lie outside this view; choose "All tests" to see them
        </p>
      )}
      {tip && (
        <div className="pointer-events-none absolute z-30 max-w-xs -translate-x-1/2 -translate-y-full floating px-3 py-2 text-xs" style={{ left: tip.x, top: tip.y - 8 }}>
          {tip.html}
        </div>
      )}
    </div>
  );
}

function CandTip({ c, ev, solidsOnly }: { c: Candidate; ev: CandidateEvidence; solidsOnly: boolean }) {
  const classes = solidsOnly ? (["solid"] as const) : (["gas", "droplet", "solid", "emulator"] as const);
  return (
    <div>
      <div className="font-semibold">{c.name}</div>
      <div className="text-ink-3">{c.short}</div>
      <table className="mt-1 num">
        <tbody>
          {classes.map((fc) => {
            const n = ev.near[fc].psi_table.v + ev.near[fc].published_paper.v;
            return (
              <tr key={fc}>
                <td className="pr-3">{FUEL_LABEL[fc]}</td>
                <td className="text-right">{n === 0 ? "no tests" : n}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-1 italic text-ink-2">
        Flame temperature {ev.flame_temperature.approximate ? "about " : ""}{fmtNumber(ev.flame_temperature.v, 0)} K (explains, does not predict)
      </div>
      <div className="mt-1 text-ink-3">Click or press Enter for the dossier</div>
    </div>
  );
}
