// Small horizontal range bars on a shared scale, for comparing condition ranges across investigations.
// Bar ends sit at the recorded minimum and maximum from the build; only the geometry is computed here.
import * as d3 from "d3";
import { Pressure, Value } from "../components/Value";
import { type InvClass, invColor, invMarkerPath, type StatRange, useElementWidth } from "./investigationsShared";

export type Domain = [number, number];

// Shared scale domain across the ranges being compared (chart geometry only).
export function sharedDomain(ranges: (StatRange | null | undefined)[]): Domain | null {
  const vals: number[] = [];
  for (const r of ranges) {
    if (r?.min && typeof r.min.v === "number") vals.push(r.min.v);
    if (r?.max && typeof r.max.v === "number") vals.push(r.max.v);
  }
  if (!vals.length) return null;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo = lo - Math.max(1, Math.abs(lo) * 0.1);
    hi = hi + Math.max(1, Math.abs(hi) * 0.1);
  }
  const s = d3.scaleLinear().domain([Math.min(0, lo), hi]).nice(4);
  return s.domain() as Domain;
}

interface CellProps {
  range: StatRange | null;
  kpa?: StatRange | null;
  domain: Domain | null;
  cls: InvClass;
  hasTable: boolean;
  // The table has a column for this condition, even if no cell in it holds a usable value.
  hasColumn?: boolean;
  label: string;
  unitLabel: string;
}

export function RangeCell(props: CellProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(200, 120);
  return (
    <div ref={ref} className="w-full">
      <RangeCellBody {...props} width={width} />
    </div>
  );
}

function RangeCellBody({ range, kpa, domain, cls, hasTable, hasColumn, label, unitLabel, width }: CellProps & { width: number }) {
  if (!hasTable || !range) {
    return (
      <div className="rounded border border-dashed border-line px-2 py-2 text-xs italic text-ink-3">No experiment table</div>
    );
  }
  if (!range.min || !range.max || range.min.v === null || range.max.v === null || !domain) {
    return (
      <div className="hatch-bg rounded border border-line px-2 py-2 text-xs">
        <span className="rounded-sm bg-surface-2 px-1 italic text-ink-2">
          {hasColumn ? `${label} column in this table, no usable values` : `${label} not recorded in this table`}
        </span>
      </div>
    );
  }
  const h = 34;
  const pad = 12;
  const x = d3.scaleLinear().domain(domain).range([pad, width - pad]);
  const x0 = x(range.min.v);
  const x1 = x(range.max.v);
  const col = invColor(cls);
  const ticks = x.ticks(width < 200 ? 2 : 4);
  const fmt = x.tickFormat(width < 200 ? 2 : 4);
  return (
    <div>
      <svg width={width} height={h} role="img" aria-label={`${label} range in ${unitLabel}, drawn on a scale shared by all columns; the recorded minimum and maximum are written below`}>
        <line x1={pad} x2={width - pad} y1={11} y2={11} stroke="var(--line)" strokeWidth={1} />
        {ticks.map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={17} y2={20} stroke="var(--ink-3)" />
            <text y={30} textAnchor="middle" fontSize={9.5} fill="var(--ink-3)" className="num">{fmt(t)}</text>
          </g>
        ))}
        {x1 - x0 >= 3 ? (
          <rect x={x0} y={7} width={x1 - x0} height={8} rx={2} fill={col} fillOpacity={0.8} />
        ) : null}
        <path d={invMarkerPath(cls, 4.5)} transform={`translate(${x0},11)`} fill={col} stroke="var(--surface-2)" strokeWidth={2} />
        {x1 - x0 >= 3 && <path d={invMarkerPath(cls, 4.5)} transform={`translate(${x1},11)`} fill={col} stroke="var(--surface-2)" strokeWidth={2} />}
      </svg>
      <div className="mt-0.5 text-xs text-ink-2">
        {kpa ? (
          <>
            <Pressure psi={range.min} kpa={kpa.min} /> to <Pressure psi={range.max} kpa={kpa.max} />
          </>
        ) : (
          <>
            <Value val={range.min} /> to <Value val={range.max} />
          </>
        )}
        <span className="block text-ink-3">in <Value val={range.recorded} /></span>
      </div>
    </div>
  );
}
