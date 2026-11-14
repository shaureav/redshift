// Coverage matrix: which conditions and test descriptors each investigation's PSI table records.
// The recorded / not recorded states come from the build's coverage field; this file only draws them.
import { ChartFrame, Hatch } from "../components/Common";
import { Value } from "../components/Value";
import {
  CONDITION_KEYS,
  COVERAGE_KEYS,
  COVERAGE_LABEL,
  COVERAGE_LONG,
  COVERAGE_STATE_TEXT,
  CoverageLegend,
  DESCRIPTOR_KEYS,
  type InvRecord,
  coverageState,
  invClass,
  invColor,
  invEdge,
  invMarkerPath,
  invName,
  statFor,
  SVG_ROW_HIGHLIGHT,
  useElementWidth,
} from "./investigationsShared";

interface Props {
  items: InvRecord[];
  openId?: string | null;
  onOpen: (id: string) => void;
}

export function InvestigationsCoveragePanel({ items, openId, onOpen }: Props) {
  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Conditions and test descriptors recorded in each investigation's PSI experiment table</caption>
        <thead className="text-left text-xs text-ink-3">
          <tr>
            <th className="py-1 pr-3">Investigation</th>
            {COVERAGE_KEYS.map((k) => <th key={k} className="pr-3">{COVERAGE_LONG[k]}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-t border-line align-top">
              <td className="py-1.5 pr-3">
                <button type="button" className="text-left underline underline-offset-2" onClick={() => onOpen(r.id)}>{invName(r)}</button>{" "}
                <span className="mono text-xs text-ink-3">{r.id}</span>
              </td>
              {COVERAGE_KEYS.map((k) => {
                const st = coverageState(r, k);
                const s = statFor(r.stats, k);
                return (
                  <td key={k} className={`pr-3 ${st === "recorded" ? "" : "text-ink-3"}`}>
                    {COVERAGE_STATE_TEXT[st]}
                    {st === "recorded" && s && (
                      <span className="block text-xs text-ink-2">usable value in <Value val={s.recorded} /></span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      id="investigation-coverage"
      title="What each table records"
      headline={(() => {
        const solidTables = items.filter((r) => invClass(r) === "solid" && r.has_table);
        const noPressure = solidTables.length > 0 && solidTables.every((r) => coverageState(r, "pressure_kpa") !== "recorded");
        return noPressure
          ? <>No solid-fuel investigation&apos;s table has a pressure column.</>
          : <>Which conditions each investigation&apos;s table records.</>;
      })()}
      caption="Rows are investigations, columns are the conditions and test descriptors a PSI experiment table can carry. Filled: the table has a column for it; some or all of its cells can still be blank, and the table view gives the number of tests with a usable value. Hatched: not recorded in this table, so the value is unknown rather than zero. Dashed: no experiment table at all."
      sources="NASA PSI experiment tables, column mapping by the Redshift build (see Methods)."
      table={table}
    >
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">No investigations match the current filters.</p>
      ) : (
        <CoverageMatrix items={items} openId={openId} onOpen={onOpen} />
      )}
      <div className="mt-3"><CoverageLegend /></div>
    </ChartFrame>
  );
}

function CoverageMatrix({ items, openId, onOpen }: Props) {
  const [wrap, width] = useElementWidth<HTMLDivElement>(520);
  const narrow = width < 520;
  const labelW = narrow ? 96 : 150;
  const groupGap = 10;
  const avail = width - labelW - 8 - groupGap - 40;
  const cellW = Math.max(24, Math.min(58, Math.floor(avail / COVERAGE_KEYS.length)));
  const rowH = narrow ? 20 : 19;
  const rotate = cellW < 52;
  const headH = rotate ? 66 : 40;
  const height = headH + items.length * rowH + 6;
  const colX = (k: (typeof COVERAGE_KEYS)[number]) => {
    const i = COVERAGE_KEYS.indexOf(k);
    return labelW + i * cellW + (i >= CONDITION_KEYS.length ? groupGap : 0);
  };
  const condEnd = colX(CONDITION_KEYS[CONDITION_KEYS.length - 1]) + cellW;
  const descStart = colX(DESCRIPTOR_KEYS[0]);
  const descEnd = colX(DESCRIPTOR_KEYS[DESCRIPTOR_KEYS.length - 1]) + cellW;
  const svgW = Math.min(width, descEnd + (rotate ? 44 : 8));

  return (
    <div ref={wrap} className="w-full">
      <svg data-chart width={svgW} height={height} role="group" aria-label="Coverage matrix of investigations against recorded conditions and test descriptors">
        <defs>
          <Hatch id="hatch-coverage" />
        </defs>
        {/* group headers */}
        <text x={labelW} y={11} fontSize={12} fontWeight={600} fill="var(--ink-2)">Conditions</text>
        <line x1={labelW} x2={condEnd - 4} y1={16} y2={16} stroke="var(--line)" />
        <text x={descStart} y={11} fontSize={12} fontWeight={600} fill="var(--ink-2)">{narrow ? "Descriptors" : "Test descriptors"}</text>
        <line x1={descStart} x2={descEnd - 4} y1={16} y2={16} stroke="var(--line)" />
        {COVERAGE_KEYS.map((k) => {
          const cx = colX(k) + (cellW - 4) / 2;
          return rotate ? (
            <text key={k} transform={`translate(${cx + 3},${headH - 6}) rotate(-45)`} fontSize={12} fill="var(--ink-2)">{COVERAGE_LABEL[k]}</text>
          ) : (
            <text key={k} x={cx} y={headH - 8} textAnchor="middle" fontSize={12} fill="var(--ink-2)">{COVERAGE_LABEL[k]}</text>
          );
        })}

        {items.map((r, i) => {
          const y0 = headH + i * rowH;
          const on = r.id === openId;
          const name = invName(r);
          const max = narrow ? 11 : 20;
          const summary = COVERAGE_KEYS.map((k) => `${COVERAGE_LONG[k]} ${COVERAGE_STATE_TEXT[coverageState(r, k)]}`).join(", ");
          return (
            <g
              key={r.id}
              role="button"
              tabIndex={0}
              aria-label={`${name}: ${summary}. Open card`}
              onClick={() => onOpen(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(r.id);
                }
              }}
              style={{ cursor: "pointer" }}
              className="group"
            >
              <rect x={0} y={y0} width={svgW} height={rowH} fill={on ? "var(--surface-3)" : "transparent"} className={SVG_ROW_HIGHLIGHT} />
              <path
                d={invMarkerPath(invClass(r), 4)}
                transform={`translate(7,${y0 + rowH / 2})`}
                fill={r.has_table ? invColor(invClass(r)) : "var(--surface-2)"}
                stroke={invEdge(invClass(r))}
                strokeWidth={r.has_table ? 1 : 1.5}
              />
              <text x={17} y={y0 + rowH / 2} dy="0.32em" fontSize={12} fontWeight={on ? 600 : 400} fill={on ? "var(--ink)" : "var(--ink-2)"}>
                {name.length > max ? `${name.slice(0, max - 1)}...` : name}
              </text>
              {COVERAGE_KEYS.map((k) => {
                const st = coverageState(r, k);
                const x0 = colX(k);
                const common = { x: x0 + 1, y: y0 + 2, width: cellW - 6, height: rowH - 4, rx: 3 };
                return (
                  <g key={k}>
                    {st === "recorded" && <rect {...common} fill="var(--accent)" />}
                    {st === "not" && <rect {...common} fill="url(#hatch-coverage)" stroke="var(--line)" />}
                    {st === "notable" && <rect {...common} fill="none" stroke="var(--ink-3)" strokeDasharray="3 2" strokeOpacity={0.7} />}
                    <title>{`${name}: ${COVERAGE_LONG[k]} ${COVERAGE_STATE_TEXT[st]}`}</title>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
