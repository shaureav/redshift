// Investigation timeline: each investigation from its start to its end date as published on its PSI
// page. Raw date strings are parsed for positioning only; the text shown is always the raw value.
import * as d3 from "d3";
import { useMemo, useState, type ReactNode } from "react";
import { ChartFrame, Hatch } from "../components/Common";
import { Value } from "../components/Value";
import {
  INV_CLASS_LABEL,
  InvLegend,
  InvMarker,
  type InvRecord,
  invClass,
  invColor,
  invEdge,
  invMarkerPath,
  invName,
  invRing,
  parsePsiDate,
  SVG_ROW_HIGHLIGHT,
  Tooltip,
  useElementWidth,
} from "./investigationsShared";

interface Row {
  r: InvRecord;
  start: Date | null;
  end: Date | null;
}

interface Props {
  items: InvRecord[];
  openId?: string | null;
  onOpen: (id: string) => void;
}

export function InvestigationsTimelinePanel({ items, openId, onOpen }: Props) {
  const rows = useMemo<Row[]>(
    () =>
      items
        .map((r) => ({ r, start: parsePsiDate(r.start_date?.v), end: parsePsiDate(r.end_date?.v) }))
        .sort((a, b) => {
          if (a.start && b.start) return a.start.getTime() - b.start.getTime() || invName(a.r).localeCompare(invName(b.r));
          if (a.start) return -1;
          if (b.start) return 1;
          return invName(a.r).localeCompare(invName(b.r));
        }),
    [items],
  );

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Start and end dates of each investigation as written on its PSI page</caption>
        <thead className="text-left text-xs text-ink-3">
          <tr>
            <th className="py-1 pr-3">Investigation</th>
            <th className="pr-3">Class</th>
            <th className="pr-3">Experiment table</th>
            <th className="pr-3">Start (raw)</th>
            <th>End (raw)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r }) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-1.5 pr-3">
                <button type="button" className="text-left underline underline-offset-2" onClick={() => onOpen(r.id)}>{invName(r)}</button>{" "}
                <span className="mono text-xs text-ink-3">{r.id}</span>
              </td>
              <td className="pr-3"><span className="flex items-center gap-1.5"><InvMarker c={invClass(r)} outlined={!r.has_table} /> {INV_CLASS_LABEL[invClass(r)]}</span></td>
              <td className="pr-3">{r.has_table ? "yes" : "no"}</td>
              <td className="pr-3"><Value val={r.start_date} /></td>
              <td><Value val={r.end_date} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      id="investigation-timeline"
      title="Investigation timeline"
      headline={items.some((r) => !r.has_table) ? <>Not every combustion investigation left an experiment table to download.</> : <>When each combustion investigation ran.</>}
      caption="Each bar runs from the start to the end date given on the investigation's PSI page, coloured and shaped by fuel class; filled bars have a PSI experiment table, outlined bars do not. Dates are the investigation period, not the flight dates of individual tests. Missing dates are drawn hatched and never estimated."
      sources="NASA Physical Sciences Informatics (PSI) investigation pages."
      table={table}
    >
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">No investigations match the current filters.</p>
      ) : (
        <TimelineChart rows={rows} openId={openId} onOpen={onOpen} />
      )}
      <div className="mt-3"><InvLegend /></div>
    </ChartFrame>
  );
}

function TimelineChart({ rows, openId, onOpen }: { rows: Row[]; openId?: string | null; onOpen: (id: string) => void }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>(700);
  const [tip, setTip] = useState<{ x: number; y: number; html: ReactNode } | null>(null);
  const narrow = width < 560;
  const dated = rows.filter((d) => d.start);
  const undated = rows.filter((d) => !d.start);
  const rowH = narrow ? 22 : 20;
  const m = { top: 6, right: narrow ? 14 : 28, left: narrow ? 92 : 168 };
  const iw = width - m.left - m.right;
  const datedH = dated.length * rowH;
  const axisH = 30;
  const laneH = undated.length ? 52 : 0;
  const height = m.top + datedH + axisH + laneH + 4;

  const x = useMemo(() => {
    const ds = dated.flatMap((d) => [d.start, d.end]).filter((d): d is Date => !!d);
    const ext = d3.extent(ds) as [Date | undefined, Date | undefined];
    const lo = ext[0] ?? new Date(Date.UTC(1995, 0, 1));
    const hi = ext[1] ?? new Date(Date.UTC(2026, 0, 1));
    return d3.scaleUtc().domain([d3.utcYear.floor(lo), d3.utcYear.ceil(hi)]).range([0, iw]);
  }, [dated, iw]);
  const ticks = x.ticks(narrow ? 4 : 8);

  const show = (e: React.MouseEvent | React.FocusEvent, html: ReactNode) => {
    const box = wrap.current?.getBoundingClientRect();
    const tgt = (e.currentTarget as Element).getBoundingClientRect();
    if (!box) return;
    setTip({ x: Math.min(Math.max(tgt.left - box.left + tgt.width / 2, 120), box.width - 120), y: tgt.top - box.top, html });
  };

  const tipFor = (r: InvRecord) => (
    <div>
      <div className="font-semibold">{invName(r)} <span className="mono font-normal text-ink-3">{r.id}</span></div>
      <div className="flex items-center gap-1.5"><InvMarker c={invClass(r)} outlined={!r.has_table} /> {INV_CLASS_LABEL[invClass(r)]}</div>
      <div className="num">Start: {r.start_date?.v ?? "not recorded"}. End: {r.end_date?.v ?? "not recorded"}</div>
      <div className="text-ink-3">{r.has_table ? "PSI experiment table" : "No experiment table"}. Click or press Enter for the card.</div>
    </div>
  );

  const label = (r: InvRecord) => {
    const n = invName(r);
    const max = narrow ? 12 : 24;
    return n.length > max ? `${n.slice(0, max - 1)}...` : n;
  };

  const ariaFor = (r: InvRecord) =>
    `${invName(r)}, ${INV_CLASS_LABEL[invClass(r)]}, ${r.has_table ? "has" : "no"} experiment table. Start ${r.start_date?.v ?? "not recorded"}, end ${r.end_date?.v ?? "not recorded"}. Open card`;

  const act = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(id);
    }
  };

  return (
    <div ref={wrap} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg data-chart width={width} height={height} role="group" aria-label="Timeline of investigations from start to end date, by fuel class" className="select-none">
        <defs>
          <Hatch id="hatch-timeline" />
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          {ticks.map((t) => (
            <line key={+t} x1={x(t)} x2={x(t)} y1={0} y2={datedH} stroke="var(--line)" />
          ))}
          {dated.map(({ r, start, end }, i) => {
            const c = invClass(r);
            const col = invColor(c);
            const edge = invEdge(c);
            const ring = invRing(c);
            const cy = i * rowH + rowH / 2;
            const x0 = x(start!);
            const x1 = end ? x(end) : null;
            const on = r.id === openId;
            return (
              <g
                key={r.id}
                role="button"
                tabIndex={0}
                aria-label={ariaFor(r)}
                onClick={() => onOpen(r.id)}
                onKeyDown={act(r.id)}
                onMouseEnter={(e) => show(e, tipFor(r))}
                onFocus={(e) => show(e, tipFor(r))}
                onBlur={() => setTip(null)}
                style={{ cursor: "pointer" }}
                className="group"
              >
                <rect x={-m.left} y={i * rowH} width={width} height={rowH} fill={on ? "var(--surface-3)" : "transparent"} className={SVG_ROW_HIGHLIGHT} />
                <text x={-10} y={cy} dy="0.32em" textAnchor="end" fontSize={narrow ? 10.5 : 11.5} fontWeight={on ? 600 : 400} fill={on ? "var(--ink)" : "var(--ink-2)"}>
                  {label(r)}
                </text>
                {x1 !== null ? (
                  <rect
                    x={x0}
                    y={cy - 4}
                    width={Math.max(2, x1 - x0)}
                    height={8}
                    rx={2}
                    fill={r.has_table ? col : "var(--surface-2)"}
                    fillOpacity={r.has_table ? 0.8 : 1}
                    stroke={edge}
                    strokeWidth={r.has_table ? 1 : 1.5}
                  />
                ) : (
                  <g>
                    <rect x={x0} y={cy - 4} width={34} height={8} rx={2} fill="url(#hatch-timeline)" stroke="var(--hatch)" strokeWidth={1} />
                    {x0 + 130 < iw && <text x={x0 + 40} y={cy} dy="0.32em" fontSize={12} fill="var(--ink-3)" fontStyle="italic">end not recorded</text>}
                  </g>
                )}
                <path
                  d={invMarkerPath(c, 5)}
                  transform={`translate(${x0},${cy})`}
                  fill={r.has_table ? col : "var(--surface-2)"}
                  stroke={r.has_table ? ring : edge}
                  strokeWidth={r.has_table ? 2 : 1.75}
                />
              </g>
            );
          })}

          <g transform={`translate(0,${datedH})`}>
            <line x1={0} x2={iw} stroke="var(--ink-3)" />
            {ticks.map((t) => (
              <g key={+t} transform={`translate(${x(t)},0)`}>
                <line y2={5} stroke="var(--ink-3)" />
                <text y={17} textAnchor="middle" fontSize={12} fill="var(--ink-2)" className="num">{d3.utcFormat("%Y")(t)}</text>
              </g>
            ))}
          </g>

          {undated.length > 0 && (
            <g transform={`translate(0,${datedH + axisH})`}>
              <text x={-10} y={10} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--ink)">Dates not</text>
              <text x={-10} y={24} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--ink)">recorded</text>
              <rect x={0} y={0} width={iw} height={laneH - 8} rx={4} fill="url(#hatch-timeline)" opacity={0.45} />
              {undated.map(({ r }, i) => {
                const c = invClass(r);
                const col = invColor(c);
                const edge = invEdge(c);
                const ring = invRing(c);
                const slot = iw / undated.length;
                const cx = slot * i + 14;
                const cy = (laneH - 8) / 2;
                const on = r.id === openId;
                return (
                  <g
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-label={ariaFor(r)}
                    onClick={() => onOpen(r.id)}
                    onKeyDown={act(r.id)}
                    onMouseEnter={(e) => show(e, tipFor(r))}
                    onFocus={(e) => show(e, tipFor(r))}
                    onBlur={() => setTip(null)}
                    style={{ cursor: "pointer" }}
                    className="group"
                  >
                    <rect x={cx - 12} y={cy - 12} width={Math.max(40, slot - 6)} height={24} rx={4} fill={on ? "var(--surface-3)" : "var(--surface-2)"} stroke="var(--line)" className={SVG_ROW_HIGHLIGHT} />
                    <path
                      d={invMarkerPath(c, 5)}
                      transform={`translate(${cx},${cy})`}
                      fill={r.has_table ? col : "var(--surface-2)"}
                      stroke={r.has_table ? ring : edge}
                      strokeWidth={r.has_table ? 2 : 1.75}
                    />
                    <text x={cx + 11} y={cy} dy="0.32em" fontSize={narrow ? 10 : 11} fontWeight={on ? 600 : 400} fill="var(--ink-2)">
                      {invName(r).length > Math.floor((slot - 30) / 6.5) ? `${invName(r).slice(0, Math.max(3, Math.floor((slot - 30) / 6.5) - 1))}...` : invName(r)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </g>
      </svg>
      {tip && <Tooltip x={tip.x} y={tip.y}>{tip.html}</Tooltip>}
    </div>
  );
}
