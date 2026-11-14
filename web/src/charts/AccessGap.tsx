// The Access Gap: how many solid-material burns survive each step from "a row in a PSI table" to
// "a downloadable row near a habitat candidate", and the same question for published papers.
// Every count comes from access_gap.json; this file only draws them. A zero is hatched and written
// out. Paper steps at zero say why: their findings are drafted and awaiting human verification.
import * as d3 from "d3";
import type { ReactElement } from "react";
import { ChartFrame, ErrorNote, FUEL_COLOR_VAR, FUEL_EDGE_VAR, Hatch, Loading, markerPath } from "../components/Common";
import { Value } from "../components/Value";
import { useData } from "../lib/data";
import type { Val } from "../lib/types";
import { barPath, ExportLabels, OverlayLayer, type OverlayLabel, textWidth, useMeasuredWidth, valText, wrapWords } from "./landingShared";

export interface AccessGapStep {
  label: string;
  count: Val<number>;
}
export interface AccessGapData {
  note: string;
  paper_findings_awaiting_verification: Val<number>;
  psi_steps: AccessGapStep[];
  paper_steps: AccessGapStep[];
}

const SECTIONS = [
  { key: "psi_steps", title: "PSI experiment tables", sub: "Rows anyone can download today", source: "psi_table" },
  { key: "paper_steps", title: "Published papers", sub: "Counted only once a named team member has verified the finding", source: "published_paper" },
] as const;

export function AccessGap() {
  const q = useData<AccessGapData>("access_gap.json");
  const [ref, width] = useMeasuredWidth(600, 300);

  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading what="the access gap" />;
  const data = q.data;
  const pending = data.paper_findings_awaiting_verification;

  const narrow = width < 520;
  const labelSize = narrow ? 12 : 13;
  const countRoom = narrow ? 56 : 72;
  const iw = Math.max(120, width - countRoom);
  const allSteps = [...data.psi_steps, ...data.paper_steps];
  const max = d3.max(allSteps, (s) => s.count.v) ?? 0;
  const x = d3.scaleLinear().domain([0, Math.max(1, max)]).range([0, iw]);
  const charBudget = Math.floor(width / (labelSize * 0.55));
  const barH = narrow ? 20 : 24;
  const lineH = labelSize + 5;

  const labels: OverlayLabel[] = [];
  const marks: ReactElement[] = [];
  let y = 0;

  // Fuel-class key: every step counts solid-material burns.
  marks.push(
    <g key="key" transform="translate(0,10)">
      <path d={markerPath("solid", 5)} transform="translate(6,0)" fill={FUEL_COLOR_VAR.solid} stroke={FUEL_EDGE_VAR.solid} />
      <text x={18} dominantBaseline="central" fontSize={12} fill="var(--ink-2)">Every step counts solid-material burns</text>
    </g>,
  );
  y += 30;

  SECTIONS.forEach((sec, si) => {
    const steps = data[sec.key];
    const paper = sec.source === "published_paper";
    if (si > 0) {
      marks.push(<line key={`div${si}`} x1={0} x2={width} y1={y + 2} y2={y + 2} stroke="var(--line)" />);
      y += 18;
    }
    marks.push(
      <g key={`sec${si}`}>
        <text x={0} y={y + 8} dominantBaseline="central" fontSize={14} fontWeight={600} fill="var(--ink)">{sec.title}</text>
        {wrapWords(sec.sub, charBudget + 6).map((ln, i) => (
          <text key={i} x={0} y={y + 26 + i * 15} dominantBaseline="central" fontSize={12} fill="var(--ink-3)">{ln}</text>
        ))}
      </g>,
    );
    y += 26 + wrapWords(sec.sub, charBudget + 6).length * 15 + 6;

    steps.forEach((step, i) => {
      const k = `${sec.key}${i}`;
      const lines = wrapWords(step.label, charBudget);
      lines.forEach((ln, li) => {
        marks.push(
          <text key={`${k}l${li}`} x={0} y={y + 8 + li * lineH} dominantBaseline="central" fontSize={labelSize} fill="var(--ink-2)">{ln}</text>,
        );
      });
      y += lines.length * lineH + 4;

      const v = step.count.v;
      const prev = i > 0 ? steps[i - 1].count.v : null;
      if (v === 0) {
        const awaiting = paper && pending.v > 0;
        const text = awaiting ? `0 verified; ${valText(pending, pending.u)} awaiting human verification` : "0, none recorded";
        const pillW = textWidth(text, 12) + 24;
        const twoLines = pillW > iw - 12;
        const h = twoLines ? barH + 16 : barH;
        marks.push(
          <rect key={`${k}h`} x={0} y={y} width={iw} height={h} rx={4} fill="url(#hatch-gap)" stroke="var(--line)">
            <title>{text}</title>
          </rect>,
        );
        labels.push({
          key: `${k}c`,
          x: 10,
          y: y + h / 2,
          size: 12,
          pill: true,
          text,
          maxWidth: twoLines ? iw - 20 : undefined,
          node: awaiting ? (
            <>
              <Value val={step.count} unit={false} /> verified; <Value val={pending} /> awaiting human verification
            </>
          ) : (
            <>
              <Value val={step.count} unit={false} />, none recorded
            </>
          ),
        });
        y += h + 18;
        return;
      }
      // The step above, as a hairline outline, so each bar reads as "of those".
      if (prev !== null && prev > v) {
        marks.push(<rect key={`${k}g`} x={0.5} y={y + 0.5} width={x(prev) - 1} height={barH - 1} rx={4} fill="none" stroke="var(--ink-3)" strokeOpacity={0.6} />);
      }
      marks.push(
        <path
          key={`${k}b`}
          d={barPath(x(v), barH)}
          transform={`translate(0,${y})`}
          fill={paper ? "var(--surface-2)" : FUEL_COLOR_VAR.solid}
          stroke={FUEL_EDGE_VAR.solid}
          strokeWidth={paper ? 2 : 1}
        >
          <title>{`${step.label}: ${valText(step.count, step.count.u)}`}</title>
        </path>,
      );
      labels.push({ key: `${k}c`, x: x(v) + 8, y: y + barH / 2, size: narrow ? 14 : 16, weight: 600, text: valText(step.count), node: <Value val={step.count} unit={false} /> });
      y += barH + 18;
    });
  });

  const height = y + 4;

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Solid-material burns remaining at each step, PSI tables and published papers</caption>
        <thead className="text-left text-xs text-ink-3">
          <tr>
            <th className="py-1 pr-3 font-medium">Source</th>
            <th className="pr-3 font-medium">Step</th>
            <th className="text-right font-medium">Count</th>
          </tr>
        </thead>
        <tbody>
          {SECTIONS.flatMap((sec) =>
            data[sec.key].map((s, i) => (
              <tr key={`${sec.key}${i}`} className="border-t border-line">
                <td className="py-1.5 pr-3">{sec.title}</td>
                <td className="pr-3">{s.label}</td>
                <td className="num text-right">
                  <Value val={s.count} unit={false} />
                  {s.count.v === 0 && (
                    <span className="ml-1 text-ink-3">
                      {sec.source === "published_paper" && pending.v > 0 ? "(awaiting human verification)" : "(none recorded)"}
                    </span>
                  )}
                </td>
              </tr>
            )),
          )}
          <tr className="border-t border-line">
            <td className="py-1.5 pr-3">Published papers</td>
            <td className="pr-3">Findings drafted and awaiting human verification</td>
            <td className="num text-right"><Value val={pending} unit={false} /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      id="access-gap"
      title="The access gap: solid-material burns, step by step"
      headline={
        data.psi_steps[2]?.count.v === 0
          ? <>No solid burn in PSI&apos;s tables records pressure, so none can be placed near a habitat atmosphere.</>
          : <>How many solid-material burns survive each step to a downloadable row.</>
      }
      caption="Each bar counts solid-material burns that survive one more step, from a row in a PSI experiment table to a downloadable row near a habitat candidate. A hairline outline shows the step above. Hatched bars hold no records: unknown, not low risk. Paper counts stay at zero until a named team member verifies each finding against its source, so a zero there means not yet verified, not that no burns took place."
      sources="NASA PSI experiment tables (DOI per investigation); drafted paper findings (NTRS) and their verification status; step counts by the Redshift build."
      table={table}
    >
      <div ref={ref} className="relative w-full">
        <svg
          data-chart
          width={width}
          height={height}
          role="img"
          aria-label={`Stepped bar chart of solid-material burns. PSI tables: ${data.psi_steps.map((s) => `${s.label.replace(/^\.\.\.\s*/, "")} ${valText(s.count)}`).join("; ")}. Published papers: ${data.paper_steps.map((s) => `${s.label.replace(/^\.\.\.\s*/, "")} ${valText(s.count)}`).join("; ")}; ${valText(pending, pending.u)} awaiting human verification.`}
          className="block select-none"
        >
          <defs><Hatch id="hatch-gap" /></defs>
          {marks}
          <ExportLabels labels={labels} />
        </svg>
        <OverlayLayer labels={labels} />
      </div>
      <p className="mt-1 text-xs text-ink-2">{data.note}</p>
    </ChartFrame>
  );
}
