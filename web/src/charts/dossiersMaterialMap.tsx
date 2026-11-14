// Where one material has been tested. With O2 and pressure recorded: a small scatter of O2 against
// pressure (log scale) with the candidate atmospheres. With O2 only: a strip along the O2 axis, the
// candidates' O2 drawn for reference, and a plain statement that pressure was not recorded.
// Values come from tests.json and candidates.json; this file only positions them.
import * as d3 from "d3";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChartFrame, FUEL_COLOR_VAR, Hatch, markerPath } from "../components/Common";
import { Pressure, Value } from "../components/Value";
import { isAboutPressure } from "../components/dossiersShared";
import { fmtNumber } from "../lib/format";
import type { Candidate, TestRow } from "../lib/types";

const KPA_PER_PSI = 6.894757293168361; // secondary axis labelling only

function useWidth(min = 300) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(min, e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width] as const;
}

export type MapMode = "plane" | "strip" | "none";

export function materialMapMode(tests: TestRow[]): MapMode {
  if (tests.some((t) => t.fields.o2_pct?.v != null && t.fields.pressure_psi?.v != null)) return "plane";
  if (tests.some((t) => t.fields.o2_pct?.v != null)) return "strip";
  return "none";
}

function TestsTable({ tests, label }: { tests: TestRow[]; label: string }) {
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Tests of {label} with their recorded oxygen and pressure</caption>
        <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-3">
          <tr>
            <th className="py-1 pr-3 font-medium">Test</th>
            <th className="pr-3 font-medium">Investigation</th>
            <th className="pr-3 font-medium">O2</th>
            <th className="font-medium">Pressure</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => (
            <tr key={t.test_id} className="border-t border-line">
              <td className="py-1 pr-3"><Link className="mono text-xs underline" to={`/evidence?ids=${encodeURIComponent(t.test_id)}`}>{t.test_id}</Link></td>
              <td className="pr-3">{t.investigation}</td>
              <td className="pr-3"><Value val={t.fields.o2_pct} /></td>
              <td><Pressure psi={t.fields.pressure_psi} kpa={t.fields.pressure_kpa} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MaterialMap({ tests, candidates, label }: { tests: TestRow[]; candidates: Candidate[]; label: string }) {
  const mode = materialMapMode(tests);
  const placed = tests.filter((t) => t.fields.o2_pct?.v != null);
  if (mode === "none") return null;
  return (
    <ChartFrame
      id="material-map"
      title={mode === "plane" ? "Where it was tested: oxygen against pressure" : "Where it was tested: oxygen only"}
      caption={
        mode === "plane"
          ? "Each square is one test of this material at its recorded oxygen and pressure (log scale, psi with kPa on the right). Rings are the candidate atmospheres. Tests without a recorded pressure are listed in the table below, not drawn."
          : "Pressure is not recorded for any test of this material, so none can be placed on the oxygen and pressure plane or judged near a candidate. Each square is one test at its recorded oxygen; stacked squares share a value. Vertical lines mark the candidates' oxygen for reference only: their pressures differ."
      }
      sources="NASA PSI experiment tables (DOI per investigation); candidate atmospheres from PSI pages and the challenge statement."
      table={<TestsTable tests={placed} label={label} />}
    >
      {mode === "plane" ? <Plane tests={placed} candidates={candidates} label={label} /> : <StripView tests={placed} candidates={candidates} label={label} />}
    </ChartFrame>
  );
}

function Plane({ tests, candidates, label }: { tests: TestRow[]; candidates: Candidate[]; label: string }) {
  const [ref, width] = useWidth();
  const narrow = width < 520;
  const height = narrow ? 300 : 360;
  const m = { top: 14, right: narrow ? 40 : 56, bottom: 42, left: narrow ? 42 : 54 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const pts = tests.filter((t) => t.fields.pressure_psi?.v != null) as (TestRow & { fields: { o2_pct: { v: number }; pressure_psi: { v: number } } })[];
  const o2s = [...pts.map((t) => t.fields.o2_pct.v), ...candidates.map((c) => c.o2_pct.v)];
  const ps = [...pts.map((t) => t.fields.pressure_psi.v), ...candidates.map((c) => c.pressure_psi.v)];
  const [o0, o1] = d3.extent(o2s) as [number, number];
  const [p0, p1] = d3.extent(ps) as [number, number];
  const x = d3.scaleLinear().domain([Math.max(0, o0 - 4), Math.min(102, o1 + 4)]).nice().range([0, iw]);
  const y = d3.scaleLog().domain([p0 * 0.8, p1 * 1.25]).range([ih, 0]);
  const psiTicks = [3, 4.3, 6, 8.2, 10.2, 14.7, 20, 30, 45].filter((p) => p >= y.domain()[0] && p <= y.domain()[1]);
  const kpaTicks = [20, 30, 50, 70, 100, 150, 200, 300].filter((k) => k / KPA_PER_PSI >= y.domain()[0] && k / KPA_PER_PSI <= y.domain()[1]);
  return (
    <div ref={ref} className="w-full">
      <svg data-chart width={width} height={height} role="img" aria-label={`Scatter of oxygen against pressure for tests of ${label}, with candidate atmospheres`}>
        <g transform={`translate(${m.left},${m.top})`}>
          <rect width={iw} height={ih} fill="var(--surface-2)" stroke="var(--line)" />
          {psiTicks.map((p) => <line key={p} x1={0} x2={iw} y1={y(p)} y2={y(p)} stroke="var(--line)" />)}
          {x.ticks(narrow ? 4 : 8).map((t) => <line key={t} y1={0} y2={ih} x1={x(t)} x2={x(t)} stroke="var(--line)" />)}
          {pts.map((t) => (
            <path key={t.test_id} d={markerPath("solid", 4.5)} transform={`translate(${x(t.fields.o2_pct.v)},${y(t.fields.pressure_psi.v)})`} fill={FUEL_COLOR_VAR.solid} stroke="var(--surface-2)" strokeWidth={2}>
              <title>{`${t.test_id}: ${fmtNumber(t.fields.o2_pct.v, 1)}% O2, ${fmtNumber(t.fields.pressure_psi.v, 2)} psi`}</title>
            </path>
          ))}
          {candidates.map((c) => (
            <g key={c.id} transform={`translate(${x(c.o2_pct.v)},${y(c.pressure_psi.v)})`}>
              <circle r={6} fill="var(--surface-2)" stroke="var(--candidate)" strokeWidth={2} />
              <circle r={2} fill="var(--candidate)" />
              {!narrow && (
                <text x={9} y={-7} fontSize={11} fontWeight={600} fill="var(--ink)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={4}>
                  {isAboutPressure(c) ? `${c.name} (pressure about)` : c.name}
                </text>
              )}
              <title>{c.name}</title>
            </g>
          ))}
          <g transform={`translate(0,${ih})`}>
            {x.ticks(narrow ? 4 : 8).map((t) => (
              <g key={t} transform={`translate(${x(t)},0)`}>
                <line y2={5} stroke="var(--ink-3)" />
                <text y={18} textAnchor="middle" fontSize={11} fill="var(--ink-2)" className="num">{t}</text>
              </g>
            ))}
            <text x={iw / 2} y={36} textAnchor="middle" fontSize={12} fill="var(--ink)">Oxygen (% by volume)</text>
          </g>
          {psiTicks.map((p) => (
            <g key={p} transform={`translate(0,${y(p)})`}>
              <line x2={-5} stroke="var(--ink-3)" />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-2)" className="num">{p}</text>
            </g>
          ))}
          <text transform={`translate(${-(narrow ? 32 : 40)},${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--ink)">psi (log)</text>
          {kpaTicks.map((k) => (
            <g key={k} transform={`translate(${iw},${y(k / KPA_PER_PSI)})`}>
              <line x2={5} stroke="var(--ink-3)" />
              <text x={8} dy="0.32em" fontSize={11} fill="var(--ink-3)" className="num">{k}</text>
            </g>
          ))}
          <text transform={`translate(${iw + (narrow ? 32 : 44)},${ih / 2}) rotate(90)`} textAnchor="middle" fontSize={12} fill="var(--ink-2)">kPa</text>
        </g>
      </svg>
    </div>
  );
}

function StripView({ tests, candidates, label }: { tests: TestRow[]; candidates: Candidate[]; label: string }) {
  const [ref, width] = useWidth();
  const narrow = width < 520;
  const cands = [...candidates].sort((a, b) => a.o2_pct.v - b.o2_pct.v);
  const labelRow = 14;
  const labelBand = cands.length * labelRow + 6;
  // Stack tests that share an O2 value (geometry only).
  const stacks = d3.groups(tests, (t) => t.fields.o2_pct.v as number);
  const tallest = d3.max(stacks, ([, g]) => g.length) ?? 1;
  const step = 10;
  const stackH = Math.max(40, tallest * step + 10);
  const m = { top: 6, right: 16, bottom: 40, left: 16 };
  const iw = width - m.left - m.right;
  const ih = labelBand + stackH;
  const height = m.top + ih + m.bottom;
  const o2s = [...tests.map((t) => t.fields.o2_pct.v as number), ...cands.map((c) => c.o2_pct.v)];
  const [o0, o1] = d3.extent(o2s) as [number, number];
  const x = d3.scaleLinear().domain([Math.max(0, Math.floor((o0 - 2) / 5) * 5), Math.min(102, o1 + 2)]).range([0, iw]);
  const ticks = x.ticks(narrow ? 5 : 10);
  const base = ih - 6;
  return (
    <div ref={ref} className="w-full">
      <svg data-chart width={width} height={height} role="img" aria-label={`Strip of recorded oxygen for tests of ${label}; pressure not recorded. Candidate oxygen marked for reference`}>
        <defs><Hatch id="hatch-strip" /></defs>
        <g transform={`translate(${m.left},${m.top})`}>
          <rect y={labelBand} width={iw} height={stackH} fill="url(#hatch-strip)" opacity={0.25} />
          {ticks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={labelBand} y2={ih} stroke="var(--line)" />)}
          {cands.map((c, i) => {
            const cx = x(c.o2_pct.v);
            const ly = i * labelRow + 10;
            const right = cx > iw - (narrow ? 90 : 130);
            return (
              <g key={c.id}>
                <line x1={cx} x2={cx} y1={ly + 3} y2={ih} stroke="var(--candidate)" strokeOpacity={0.45} />
                <circle cx={cx} cy={ly + 3} r={2.5} fill="var(--candidate)" />
                <text x={right ? cx - 6 : cx + 6} y={ly} dy="0.55em" textAnchor={right ? "end" : "start"} fontSize={narrow ? 10 : 11} fill="var(--ink-2)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={3}>
                  {narrow ? `${fmtNumber(c.o2_pct.v)}% O2` : `${c.name}${isAboutPressure(c) ? " (about)" : ""}`}
                </text>
                <title>{`${c.name}: candidate O2, shown for reference; its pressure is not comparable here`}</title>
              </g>
            );
          })}
          {stacks.map(([o2, g]) =>
            g.map((t, k) => (
              <path key={t.test_id} d={markerPath("solid", 4)} transform={`translate(${x(o2)},${base - k * step})`} fill={FUEL_COLOR_VAR.solid} stroke="var(--surface-2)" strokeWidth={2}>
                <title>{`${t.test_id}: ${fmtNumber(o2, 1)}% O2, pressure not recorded`}</title>
              </path>
            )),
          )}
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink-3)" />
          {ticks.map((t) => (
            <g key={t} transform={`translate(${x(t)},${ih})`}>
              <line y2={5} stroke="var(--ink-3)" />
              <text y={18} textAnchor="middle" fontSize={11} fill="var(--ink-2)" className="num">{t}</text>
            </g>
          ))}
          <text x={iw / 2} y={ih + 34} textAnchor="middle" fontSize={12} fill="var(--ink)">Oxygen (% by volume); pressure not recorded</text>
        </g>
      </svg>
    </div>
  );
}
