// Planner heat map: small multiples, one panel per material class. Columns are the planner's O2 levels
// and rows its pressure levels (levels, not to scale). Shading is the priority of the chosen preset on a
// single-hue ramp (the accent token at varying opacity). Cells with no tests nearby are hatched and
// labelled "no tests recorded". Candidate atmospheres are drawn as rings in their cells.
// Every value comes from planner_grid.json; this file only places and shades them.
import * as d3 from "d3";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FUEL_COLOR_VAR, Hatch, markerPath } from "../components/Common";
import { FUEL_LABEL, fmtNumber } from "../lib/format";
import type { Candidate, Val } from "../lib/types";
import { PRESET_LABEL, type PlannerFile, type PlannerGridCell, type PlannerMaterial, type PresetKey } from "./plannerShared";

interface Props {
  grid: PlannerFile;
  preset: PresetKey;
  candidates: Candidate[];
  selected: string | null;
  onSelect: (id: string) => void;
  kpaByPsi: Map<number, Val<number>>;
}

type Tip = { x: number; y: number; cell: PlannerGridCell; cands: Candidate[] } | null;

const MIN_OPACITY = 0.07;
const MAX_OPACITY = 0.85;

export function PlannerHeatmap({ grid, preset, candidates, selected, onSelect, kpaByPsi }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, SVGGElement>());
  const [width, setWidth] = useState(1000);
  const [tip, setTip] = useState<Tip>(null);
  const [active, setActive] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    if (!wrap.current) return;
    // Measure before the first paint so the chart never renders wider than its container.
    setWidth(Math.max(300, wrap.current.clientWidth));
    const ro = new ResizeObserver((entries) => setWidth(Math.max(300, entries[0].contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const { o2_levels_pct: o2s, pressure_levels_psi: psis, material_classes: mats } = grid.params;
  const psiTopDown = useMemo(() => [...psis].sort((a, b) => b - a), [psis]);

  const byKey = useMemo(() => new Map(grid.cells.map((c) => [`${c.material}|${c.o2_pct}|${c.pressure_psi}`, c])), [grid.cells]);
  const candAt = useMemo(() => {
    const m = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const k = `${c.o2_pct.v}|${c.pressure_psi.v}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [candidates]);

  // Opacity scale (encoding only): zero priority is unshaded; the largest priority in this preset is darkest.
  const maxPrio = useMemo(() => d3.max(grid.cells, (c) => c.priority[preset].v) ?? 0, [grid.cells, preset]);
  const op = (v: number) => (v <= 0 || maxPrio <= 0 ? 0 : MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * (v / maxPrio));

  const cols = width >= 880 ? mats.length : 1;
  const gap = cols > 1 ? 20 : 0;
  const m = { top: 34, right: 8, bottom: 40, left: 68 };
  const panelW = (width - gap * (cols - 1)) / cols;
  const iw = panelW - m.left - m.right;
  const cw = iw / o2s.length;
  const ch = Math.max(34, Math.min(48, cw * 0.72));
  const ih = ch * psis.length;
  const panelH = m.top + ih + m.bottom;
  const rows = Math.ceil(mats.length / cols);
  const height = rows * panelH + (rows - 1) * 16;
  const labelSize = Math.min(9.5, cw / 4.6);

  const show = (el: Element, cell: PlannerGridCell) => {
    const box = wrap.current?.getBoundingClientRect();
    const tgt = el.getBoundingClientRect();
    if (!box) return;
    setTip({ x: tgt.left - box.left + tgt.width / 2, y: tgt.top - box.top, cell, cands: candAt.get(`${cell.o2_pct}|${cell.pressure_psi}`) ?? [] });
  };

  const focusCell = (mat: string, o2: number, psi: number) => {
    const c = byKey.get(`${mat}|${o2}|${psi}`);
    if (!c) return;
    setActive((a) => ({ ...a, [mat]: c.id }));
    const el = cellRefs.current.get(c.id);
    el?.focus();
  };

  const onKey = (e: KeyboardEvent<SVGGElement>, c: PlannerGridCell) => {
    const i = o2s.indexOf(c.o2_pct);
    const j = psiTopDown.indexOf(c.pressure_psi);
    let ni = i;
    let nj = j;
    if (e.key === "ArrowRight") ni = Math.min(o2s.length - 1, i + 1);
    else if (e.key === "ArrowLeft") ni = Math.max(0, i - 1);
    else if (e.key === "ArrowDown") nj = Math.min(psiTopDown.length - 1, j + 1);
    else if (e.key === "ArrowUp") nj = Math.max(0, j - 1);
    else if (e.key === "Home") ni = 0;
    else if (e.key === "End") ni = o2s.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(c.id);
      return;
    } else return;
    e.preventDefault();
    focusCell(c.material, o2s[ni], psiTopDown[nj]);
  };

  const describe = (c: PlannerGridCell) => {
    const cands = candAt.get(`${c.o2_pct}|${c.pressure_psi}`) ?? [];
    const n = c.n_near.v === 0 ? "no tests recorded nearby" : `${fmtNumber(c.n_near.v)} ${c.n_near.v === 1 ? "test" : "tests"} near`;
    const cand = cands.length ? `. Candidate atmosphere here: ${cands.map((x) => x.short).join(", ")}` : "";
    return `${FUEL_LABEL[c.material]}, ${c.o2_pct}% O2, ${c.pressure_psi} psi: ${n}; priority ${fmtNumber(c.priority[preset].v, 3)} (${PRESET_LABEL[preset]})${cand}. Press Enter for details`;
  };

  return (
    <div ref={wrap} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg
        data-chart
        width={width}
        height={height}
        role="group"
        aria-label={`Test planner heat map, one panel per material class, shaded by priority under the ${PRESET_LABEL[preset]} preset. Hatched cells have no tests recorded nearby. Use the arrow keys to move between cells and Enter to open one.`}
        className="select-none"
      >
        <defs>
          <Hatch id="hatch-planner" />
        </defs>
        {mats.map((mat, pi) => {
          const px = (pi % cols) * (panelW + gap);
          const py = Math.floor(pi / cols) * (panelH + 16);
          const weight = grid.params.presets[preset][mat as PlannerMaterial];
          const activeId = active[mat] ?? byKey.get(`${mat}|${o2s[0]}|${psiTopDown[0]}`)?.id;
          return (
            <g key={mat} transform={`translate(${px},${py})`} role="group" aria-label={`${FUEL_LABEL[mat]} panel`}>
              {/* panel title: marker shape and colour, label, weight in this preset */}
              <g transform={`translate(${m.left},14)`}>
                <path d={markerPath(mat, 5)} transform="translate(5,0)" fill={FUEL_COLOR_VAR[mat]} stroke={FUEL_COLOR_VAR[mat]} />
                <text x={16} dy="0.35em" fontSize={13} fontWeight={600} fill="var(--ink)">{FUEL_LABEL[mat]}</text>
                <text x={iw} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--ink-2)" className="num">
                  weight {fmtNumber(weight, 1)}
                </text>
              </g>
              <g transform={`translate(${m.left},${m.top})`}>
                {psiTopDown.map((psi, j) =>
                  o2s.map((o2, i) => {
                    const c = byKey.get(`${mat}|${o2}|${psi}`);
                    if (!c) return null;
                    const pr = c.priority[preset].v;
                    const empty = c.n_near.v === 0;
                    const cands = candAt.get(`${o2}|${psi}`) ?? [];
                    const on = c.id === selected;
                    const x0 = i * cw;
                    const y0 = j * ch;
                    return (
                      <g
                        key={c.id}
                        ref={(el) => {
                          if (el) cellRefs.current.set(c.id, el);
                          else cellRefs.current.delete(c.id);
                        }}
                        transform={`translate(${x0},${y0})`}
                        role="button"
                        tabIndex={c.id === activeId ? 0 : -1}
                        aria-label={describe(c)}
                        aria-pressed={on}
                        onClick={() => onSelect(c.id)}
                        onKeyDown={(e) => onKey(e, c)}
                        onMouseEnter={(e) => show(e.currentTarget, c)}
                        onFocus={(e) => {
                          setActive((a) => ({ ...a, [mat]: c.id }));
                          show(e.currentTarget, c);
                        }}
                        onBlur={() => setTip(null)}
                        className="planner-cell outline-none"
                        style={{ cursor: "pointer" }}
                      >
                        <rect width={cw} height={ch} fill="var(--surface-2)" />
                        <rect width={cw} height={ch} fill="var(--accent)" fillOpacity={op(pr)} />
                        {empty && <rect width={cw} height={ch} fill="url(#hatch-planner)" opacity={0.6} />}
                        <rect x={0.5} y={0.5} width={cw - 1} height={ch - 1} fill="none" stroke="var(--line)" />
                        {empty ? (
                          <text x={cw / 2} y={ch / 2} textAnchor="middle" fontSize={labelSize} fill="var(--ink)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={3} strokeLinejoin="round">
                            <tspan x={cw / 2} dy="-0.25em">no tests</tspan>
                            <tspan x={cw / 2} dy="1.1em">recorded</tspan>
                          </text>
                        ) : (
                          <text x={cw / 2} y={ch / 2} dy="0.35em" textAnchor="middle" fontSize={Math.min(12, cw / 3.4)} fontWeight={500} fill="var(--ink)" className="num" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={3} strokeLinejoin="round">
                            {fmtNumber(c.n_near.v)}
                          </text>
                        )}
                        {cands.length > 0 && (
                          <g transform={`translate(${cw - 7},7)`} aria-hidden="true">
                            <circle r={4.5} fill="var(--surface-2)" stroke="var(--candidate)" strokeWidth={1.75} />
                            <circle r={1.6} fill="var(--candidate)" />
                          </g>
                        )}
                        {on && <rect x={1.5} y={1.5} width={cw - 3} height={ch - 3} fill="none" stroke="var(--ink)" strokeWidth={2.5} />}
                        <rect className="planner-focus" x={2} y={2} width={cw - 4} height={ch - 4} fill="none" stroke="var(--focus)" strokeWidth={2} strokeDasharray="3 2" opacity={0} />
                      </g>
                    );
                  }),
                )}
                {/* y axis: psi, with kPa beneath where the snapshot has it */}
                {psiTopDown.map((psi, j) => {
                  const kpa = kpaByPsi.get(psi);
                  return (
                    <g key={psi} transform={`translate(-6,${j * ch + ch / 2})`}>
                      <text textAnchor="end" dy={kpa ? "-0.15em" : "0.35em"} fontSize={11} fill="var(--ink-2)" className="num">{psi}</text>
                      {kpa && typeof kpa.v === "number" && (
                        <text textAnchor="end" dy="1.05em" fontSize={9.5} fill="var(--ink-3)" className="num">{fmtNumber(kpa.v, 1)} kPa</text>
                      )}
                    </g>
                  );
                })}
                {(pi % cols === 0) && (
                  <text transform={`translate(${-(m.left - 9)},${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--ink)">Pressure (psi)</text>
                )}
                {/* x axis: O2 levels */}
                {o2s.map((o2, i) => (
                  <text key={o2} x={i * cw + cw / 2} y={ih + 14} textAnchor="middle" fontSize={11} fill="var(--ink-2)" className="num">{o2}</text>
                ))}
                <text x={iw / 2} y={ih + 32} textAnchor="middle" fontSize={11} fill="var(--ink)">O2 (% by volume; levels, not to scale)</text>
              </g>
            </g>
          );
        })}
      </svg>
      <style>{`.planner-cell:focus-visible .planner-focus{opacity:1}`}</style>
      {tip && (
        <div
          className="pointer-events-none absolute z-30 w-60 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(tip.x, 124), width - 124), top: tip.y - 8 }}
          aria-hidden="true"
        >
          <div className="font-semibold">{FUEL_LABEL[tip.cell.material]}: {tip.cell.o2_pct}% O2, {tip.cell.pressure_psi} psi</div>
          <div className="mt-0.5">
            {tip.cell.n_near.v === 0 ? "No tests recorded nearby" : `${fmtNumber(tip.cell.n_near.v)} ${tip.cell.n_near.v === 1 ? "test" : "tests"} near this cell`}
          </div>
          <div className="num">Priority ({PRESET_LABEL[preset]}): <span className="italic">{fmtNumber(tip.cell.priority[preset].v, 3)}</span></div>
          {tip.cands.length > 0 && <div className="mt-0.5">Candidate atmosphere: {tip.cands.map((c) => c.short).join(", ")}</div>}
          <div className="mt-1 text-ink-3">Click or press Enter for details</div>
        </div>
      )}
    </div>
  );
}
