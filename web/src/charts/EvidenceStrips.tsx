// Evidence strips: small multiples, one strip per candidate atmosphere, with the tests recorded near it
// split by fuel class (columns) and by source type (rows). The scale is shared by every strip.
// A zero is hatched and written "no tests". A secondary row counts tests whose O2 matches but whose
// pressure is not recorded, so they cannot be placed. Counts come from candidate_evidence.json.
import * as d3 from "d3";
import type { ReactElement } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChartFrame, ErrorNote, FUEL_COLOR_VAR, FuelMarker, Hatch, Loading, markerPath } from "../components/Common";
import { Value } from "../components/Value";
import { useData } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import type { Candidate, CandidateEvidence } from "../lib/types";
import type { AccessGapData } from "./AccessGap";
import {
  barPath, ExportLabels, FUEL_SHORT, FUEL_TINY, FUELS, isAboutPressure, OverlayLayer, type OverlayLabel, useMeasuredWidth, valText,
} from "./landingShared";

const NEAR_ROWS = [
  { key: "psi_table", label: "PSI table", tiny: "PSI" },
  { key: "published_paper", label: "Paper, verified", tiny: "Paper" },
] as const;

export function EvidenceStrips({ highlight }: { highlight?: string }) {
  const cands = useData<{ candidates: Candidate[] }>("candidates.json");
  const ev = useData<{ evidence: CandidateEvidence[] }>("candidate_evidence.json");
  const gap = useData<AccessGapData>("access_gap.json");
  const [sp] = useSearchParams();
  const selected = sp.get("sel") ?? highlight;
  const [ref, width] = useMeasuredWidth(600, 300);

  const error = cands.error ?? ev.error;
  if (error) return <ErrorNote error={error} />;
  if (!cands.data || !ev.data) return <Loading what="the evidence strips" />;
  const candidates = cands.data.candidates;
  const byId = new Map(ev.data.evidence.map((e) => [e.candidate_id, e]));
  const pending = gap.data?.paper_findings_awaiting_verification;

  const narrow = width < 520;
  const labelW = narrow ? 52 : 140;
  const colW = (width - labelW) / FUELS.length;
  const valueRoom = narrow ? 26 : 36;
  const barMax = Math.max(12, colW - valueRoom - 10);
  const max = d3.max(ev.data.evidence.flatMap((e) => FUELS.flatMap((f) => NEAR_ROWS.map((r) => e.near[f][r.key].v)))) ?? 0;
  const x = d3.scaleLinear().domain([0, Math.max(1, max)]).range([0, barMax]);
  const headH = 30;
  const titleH = 28;
  const rowH = 19;
  const o2H = narrow ? 22 : 30;
  const stripH = titleH + NEAR_ROWS.length * rowH + o2H + 12;
  const height = headH + candidates.length * stripH;
  const barH = 10;

  const labels: OverlayLabel[] = [];
  const marks: ReactElement[] = [];

  // Column headers: fuel class with its marker.
  FUELS.forEach((f, j) => {
    const cx = labelW + j * colW + 4;
    marks.push(
      <g key={`head${f}`} transform={`translate(${cx},12)`}>
        <path d={markerPath(f, 5)} transform="translate(5,0)" fill={FUEL_COLOR_VAR[f]} />
        <text x={15} dominantBaseline="central" fontSize={narrow ? 10.5 : 12} fontWeight={600} fill="var(--ink)">
          {narrow ? FUEL_TINY[f] : FUEL_SHORT[f]}
        </text>
      </g>,
    );
  });
  marks.push(<line key="headline" x1={0} x2={width} y1={headH - 4} y2={headH - 4} stroke="var(--line)" />);

  candidates.forEach((c, ci) => {
    const e = byId.get(c.id);
    const y0 = headH + ci * stripH;
    const on = c.id === selected;
    if (on) {
      marks.push(
        <g key={`sel${c.id}`}>
          <rect x={0} y={y0 + 2} width={width} height={stripH - 6} rx={6} fill="var(--surface-3)" />
          <rect x={0} y={y0 + 2} width={3} height={stripH - 6} rx={1.5} fill="var(--accent)" />
        </g>,
      );
    }
    const pad = on ? 10 : 0;
    const about = isAboutPressure(c);
    labels.push({
      key: `t${c.id}`,
      x: pad,
      y: y0 + 15,
      size: narrow ? 12.5 : 13.5,
      weight: 600,
      text: `${about ? "about " : ""}${c.name} (${valText(c.pressure_kpa, "kPa")})${narrow ? "" : `  ${c.short}`}`,
      node: (
        <>
          <Link to={`/dossiers/candidate/${c.id}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">
            {about && "about "}
            {c.name}
          </Link>{" "}
          <span className="font-normal text-ink-3">
            (<Value val={c.pressure_kpa} digits={1} />)
          </span>
          {!narrow && <span className="ml-2 font-normal text-ink-3">{c.short}</span>}
          {on && !narrow && <span className="ml-2 text-[11px] font-medium text-accent">highlighted on the map</span>}
        </>
      ),
    });

    // Row labels.
    NEAR_ROWS.forEach((r, ri) => {
      marks.push(
        <text key={`rl${c.id}${r.key}`} x={pad} y={y0 + titleH + ri * rowH + rowH / 2} dominantBaseline="central" fontSize={narrow ? 10.5 : 11.5} fill="var(--ink-2)">
          {narrow ? r.tiny : r.label}
        </text>,
      );
    });
    const o2y = y0 + titleH + NEAR_ROWS.length * rowH + 2;
    marks.push(
      <g key={`o2l${c.id}`}>
        {narrow ? (
          <text x={pad} y={o2y + o2H / 2} dominantBaseline="central" fontSize={10.5} fill="var(--ink-3)">O2 only</text>
        ) : (
          <>
            <text x={pad} y={o2y + 8} dominantBaseline="central" fontSize={10.5} fill="var(--ink-3)">O2 matches,</text>
            <text x={pad} y={o2y + 21} dominantBaseline="central" fontSize={10.5} fill="var(--ink-3)">pressure not recorded</text>
          </>
        )}
        <line x1={labelW} x2={width} y1={o2y - 1} y2={o2y - 1} stroke="var(--line)" strokeOpacity={0.7} />
      </g>,
    );

    FUELS.forEach((f, j) => {
      const cx = labelW + j * colW + 4;
      NEAR_ROWS.forEach((r, ri) => {
        const cy = y0 + titleH + ri * rowH + rowH / 2;
        const val = e?.near[f][r.key];
        const k = `${c.id}${f}${r.key}`;
        if (!val || val.v === 0) {
          marks.push(
            <g key={k}>
              <rect x={cx} y={cy - 7} width={colW - 10} height={14} rx={3} fill="url(#hatch-strips)" opacity={0.75} />
              <text x={cx + 6} y={cy} dominantBaseline="central" fontSize={10.5} fill="var(--ink-2)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={4}>
                no tests
              </text>
              <title>{`${FUEL_LABEL[f]}, ${r.label}: no tests recorded near ${c.name}`}</title>
            </g>,
          );
          return;
        }
        const paper = r.key === "published_paper";
        const bw = Math.max(2, x(val.v));
        marks.push(
          <path
            key={k}
            d={barPath(bw, barH, 3)}
            transform={`translate(${cx},${cy - barH / 2})`}
            fill={paper ? "var(--surface-2)" : FUEL_COLOR_VAR[f]}
            stroke={paper ? FUEL_COLOR_VAR[f] : "none"}
            strokeWidth={paper ? 1.5 : 0}
          >
            <title>{`${FUEL_LABEL[f]}, ${r.label}: ${valText(val, "tests")} near ${c.name}`}</title>
          </path>,
        );
        labels.push({ key: `${k}v`, x: cx + bw + 5, y: cy, size: narrow ? 11 : 12, weight: 600, text: valText(val), node: <Value val={val} unit={false} /> });
      });
      const o2 = e?.o2_match_pressure_unknown[f];
      if (o2) {
        labels.push({
          key: `${c.id}${f}o2`,
          x: cx + 2,
          y: o2y + o2H / 2,
          size: narrow ? 10.5 : 11.5,
          tone: "ink-2",
          text: valText(o2),
          node: <Value val={o2} unit={false} />,
        });
      }
    });
    marks.push(<line key={`sep${c.id}`} x1={0} x2={width} y1={y0 + stripH - 2} y2={y0 + stripH - 2} stroke="var(--line)" />);
  });

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Tests near each candidate atmosphere, by fuel class and source type, with O2-only matches</caption>
        <thead className="text-left text-xs text-ink-3">
          <tr>
            <th className="py-1 pr-3 font-medium">Candidate</th>
            {FUELS.map((f) => (
              <th key={f} className="pr-3 font-medium">
                <FuelMarker fuel={f} size={10} /> {FUEL_LABEL[f]}
                <span className="block font-normal">PSI table / paper, verified / O2 match, pressure not recorded</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const e = byId.get(c.id);
            return (
              <tr key={c.id} className="border-t border-line align-top">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  <Link className="underline" to={`/dossiers/candidate/${c.id}`}>{isAboutPressure(c) && "about "}{c.name}</Link>
                </th>
                {FUELS.map((f) => (
                  <td key={f} className="num pr-3">
                    {e ? (
                      <>
                        <Value val={e.near[f].psi_table} unit={false} /> / <Value val={e.near[f].published_paper} unit={false} /> /{" "}
                        <Value val={e.o2_match_pressure_unknown[f]} unit={false} />
                      </>
                    ) : (
                      <span className="text-ink-3">not in snapshot</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      id="evidence-strips"
      title="Tests near each candidate, by fuel class and source"
      caption="One strip per candidate atmosphere. Filled bars are PSI experiment table rows within the nearness region (1.5 steps); outlined bars are results from human-verified papers. All strips share one scale. Hatched cells have no tests recorded: unknown, not low risk. The bottom row of each strip counts tests whose O2 matches but whose pressure is not recorded, so they cannot be placed on the plane."
      sources="NASA PSI experiment tables (DOI per investigation); human-verified papers (NTRS); nearness counts by the Redshift build."
      table={table}
    >
      <div ref={ref} className="relative w-full">
        <svg
          data-chart
          width={width}
          height={height}
          role="img"
          aria-label="Small multiples: for each candidate atmosphere, the number of tests recorded nearby for gas flames, droplets, solid materials and the BRE emulator, split into PSI table rows and verified paper results, with O2-only matches below"
          className="block select-none"
        >
          <defs><Hatch id="hatch-strips" /></defs>
          {marks}
          <ExportLabels labels={labels} />
        </svg>
        <OverlayLayer labels={labels} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Key">
        <li className="flex items-center gap-1.5"><FuelMarker fuel="droplet" /> PSI table (filled)</li>
        <li className="flex items-center gap-1.5"><FuelMarker fuel="droplet" outlined /> Published paper, human verified (outlined)</li>
        <li className="flex items-center gap-1.5"><span className="hatch-bg inline-block h-3 w-5 rounded-sm border border-line" /> No tests recorded (hatched)</li>
      </ul>
      {pending && pending.v !== null && pending.v > 0 && (
        <p className="mt-1 text-xs text-ink-3">
          Paper rows fill in as findings are verified: <Value val={pending} /> awaiting human verification.
        </p>
      )}
    </ChartFrame>
  );
}
