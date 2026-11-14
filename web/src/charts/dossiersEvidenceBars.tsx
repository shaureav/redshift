// Evidence near one candidate atmosphere: one row per fuel class, one bar per source type
// (PSI table filled, published paper outlined). A zero is drawn hatched and written "no tests recorded".
// Counts come from candidate_evidence.json; this file only draws them.
import * as d3 from "d3";
import { useLayoutEffect, useRef, useState } from "react";
import { ChartFrame, FUEL_COLOR_VAR, Hatch, markerPath } from "../components/Common";
import { Value } from "../components/Value";
import { CountCell, FUEL_CLASSES, FuelName } from "../components/dossiersShared";
import { FUEL_LABEL, fmtNumber } from "../lib/format";
import type { Candidate, CandidateEvidence } from "../lib/types";

const SOURCES = [
  { key: "psi_table", label: "PSI table" },
  { key: "published_paper", label: "Published paper, human verified" },
] as const;

export function DossierEvidenceBars({ c, ev, domainMax }: { c: Candidate; ev: CandidateEvidence; domainMax: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useLayoutEffect(() => {
    if (!wrap.current) return;
    setWidth(Math.max(240, wrap.current.getBoundingClientRect().width));
    const ro = new ResizeObserver((e) => setWidth(Math.max(240, e[0].contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const narrow = width < 520;
  const labelW = narrow ? 112 : 168;
  const m = { top: 8, right: narrow ? 40 : 56, bottom: 30, left: labelW };
  const barH = 14;
  const gap = 4;
  const rowH = barH * 2 + gap + 18;
  const ih = FUEL_CLASSES.length * rowH;
  const height = m.top + ih + m.bottom;
  const iw = width - m.left - m.right;
  const x = d3.scaleLinear().domain([0, Math.max(1, domainMax)]).nice().range([0, iw]);
  const ticks = x.ticks(narrow ? 3 : 5);

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Tests near {c.name}, by fuel class and source type</caption>
        <thead className="text-left text-xs text-ink-3">
          <tr>
            <th className="py-1 pr-3 font-medium">Fuel class</th>
            {SOURCES.map((s) => <th key={s.key} className="pr-3 font-medium">{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {FUEL_CLASSES.map((f) => (
            <tr key={f} className="border-t border-line">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal"><FuelName fuel={f} /></th>
              {SOURCES.map((s) => (
                <td key={s.key} className="py-1.5 pr-3"><CountCell val={ev.near[f][s.key]} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      id={`evidence-near-${c.id}`}
      title="Tests within the nearness region"
      caption={`Microgravity fire tests recorded within the nearness region of ${c.name}, split by fuel class and by source. Filled bars are PSI experiment table rows; outlined bars are results from human-verified papers. The scale is the same on every candidate dossier. Hatched rows have no tests recorded: unknown, not low risk.`}
      sources="NASA PSI experiment tables (DOI per investigation); human-verified papers (NTRS); nearness computed by the Redshift build."
      table={table}
    >
      <div ref={wrap} className="w-full">
        <svg data-chart width={width} height={height} role="img" aria-label={`Bar chart of tests near ${c.name} by fuel class and source type`}>
          <defs><Hatch id={`hatch-ev-${c.id}`} /></defs>
          <g transform={`translate(${m.left},${m.top})`}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(${x(t)},0)`}>
                <line y1={0} y2={ih} stroke="var(--line)" />
                <text y={ih + 16} textAnchor="middle" fontSize={11} fill="var(--ink-3)" className="num">{fmtNumber(t, 0)}</text>
              </g>
            ))}
            <text x={iw} y={ih + 28} textAnchor="end" fontSize={11} fill="var(--ink-3)">tests</text>
            {FUEL_CLASSES.map((f, i) => (
              <g key={f} transform={`translate(0,${i * rowH + 9})`}>
                <g transform={`translate(${-labelW + 8},${barH + gap / 2})`}>
                  <path d={markerPath(f, 5)} fill={FUEL_COLOR_VAR[f]} transform="translate(5,0)" />
                  <text x={16} dy="0.32em" fontSize={12} fill="var(--ink)">{narrow && f === "emulator" ? "Emulator" : FUEL_LABEL[f]}</text>
                </g>
                {SOURCES.map((s, j) => {
                  const val = ev.near[f][s.key];
                  const y0 = j * (barH + gap);
                  const outline = s.key === "published_paper";
                  if (val.v === 0) {
                    return (
                      <g key={s.key} transform={`translate(0,${y0})`}>
                        <rect width={iw} height={barH} fill={`url(#hatch-ev-${c.id})`} opacity={0.5} rx={2} />
                        <text x={6} y={barH / 2} dy="0.32em" fontSize={10.5} fill="var(--ink-2)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={3}>
                          {s.key === "psi_table" ? "PSI table" : "Paper"}: no tests recorded
                        </text>
                        <title>{`${FUEL_LABEL[f]}, ${s.label}: no tests recorded`}</title>
                      </g>
                    );
                  }
                  const w = Math.max(2, x(val.v));
                  return (
                    <g key={s.key} transform={`translate(0,${y0})`}>
                      <path
                        d={`M0,0 H${w - 3} Q${w},0 ${w},3 V${barH - 3} Q${w},${barH} ${w - 3},${barH} H0 Z`}
                        fill={outline ? "var(--surface-2)" : FUEL_COLOR_VAR[f]}
                        stroke={outline ? FUEL_COLOR_VAR[f] : "none"}
                        strokeWidth={outline ? 1.5 : 0}
                      />
                      <text x={w + 6} y={barH / 2} dy="0.32em" fontSize={11} fill="var(--ink)" className="num">
                        {fmtNumber(val.v, 0)}
                        <tspan fill="var(--ink-3)">{s.key === "psi_table" ? "  PSI table" : "  paper"}</tspan>
                      </text>
                      <title>{`${FUEL_LABEL[f]}, ${s.label}: ${fmtNumber(val.v, 0)} tests`}</title>
                    </g>
                  );
                })}
              </g>
            ))}
            <line y1={0} y2={ih} stroke="var(--ink-3)" />
          </g>
        </svg>
      </div>
      <p className="mt-2 text-xs text-ink-2">
        All tests near this atmosphere, every class and source: <Value val={ev.near_total} />.
      </p>
    </ChartFrame>
  );
}
