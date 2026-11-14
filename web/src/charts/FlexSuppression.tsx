// FLEX suppression: for each CO2 group in the reduced-pressure band, how many droplet tests carry the
// verbatim outcome label "Extinction", out of how many. Each marker is one PSI table row, styled by its
// verbatim outcome label. A higher-oxygen group with no suppressant is shown for comparison.
// Every count comes from flex_suppression.json; this file only draws and lays them out.
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { ChartFrame, ErrorNote, FUEL_COLOR_VAR, Loading, markerPath } from "../components/Common";
import { Pressure, Value } from "../components/Value";
import { useData } from "../lib/data";
import type { Val } from "../lib/types";
import { ExportLabels, OverlayLayer, type OverlayLabel, useMeasuredWidth, valText, wrapWords } from "./landingShared";

type Count = number | Val<number>;

export interface FlexGroup {
  label: string;
  extinguished: Val<number>;
  total: Val<number>;
  outcome_labels: Record<string, Count>;
}
export interface FlexData {
  annotation: string;
  band_mmhg: [number, number];
  /** Requested from the pipeline: the band in psi and kPa. Used when present. */
  band_psi?: [Val<number>, Val<number>];
  band_kpa?: [Val<number>, Val<number>];
  groups: FlexGroup[];
  high_o2_no_suppressant: { fuels: Record<string, Count>; outcome_labels: Record<string, Count>; total: Val<number> };
  in_band: Val<number>;
  p: string;
  pressure_not_recorded: string[];
}

const EXTINGUISHED = "Extinction";
const KNOWN_ORDER = [EXTINGUISHED, "Disruption", "Completion"];

/** A breakdown count as a Val. Plain integers in the snapshot carry their group's provenance record. */
function asVal(c: Count, p: string): Val<number> {
  return typeof c === "number" ? { v: c, u: "tests", p } : c;
}

function orderedLabels(rec: Record<string, Count>): string[] {
  const keys = Object.keys(rec);
  return [...KNOWN_ORDER.filter((k) => keys.includes(k)), ...keys.filter((k) => !KNOWN_ORDER.includes(k)).sort()];
}

/** Marker style per verbatim outcome label: shape is the droplet marker; fill pattern tells labels apart. */
function UnitMark({ label, r }: { label: string; r: number }) {
  const d = markerPath("droplet", r);
  const col = FUEL_COLOR_VAR.droplet;
  if (label === EXTINGUISHED) return <path d={d} fill={col} />;
  if (label === "Disruption") {
    // Only the tip filled, so it reads apart from both the filled "Extinction" and the open "Completion"
    // marker without relying on colour.
    const h = r * 1.15;
    const half = `M0,${-h} L${0.5 * h},${-0.1 * h} L${-0.5 * h},${-0.1 * h} Z`;
    return (
      <g>
        <path d={d} fill="var(--surface-2)" stroke={col} strokeWidth={1.6} />
        <path d={half} fill={col} />
      </g>
    );
  }
  if (label === "Completion") return <path d={d} fill="var(--surface-2)" stroke={col} strokeWidth={1.6} />;
  return <path d={d} fill="var(--hatch)" />;
}

function KeyMarker({ label }: { label: string }) {
  return (
    <svg width={14} height={14} viewBox="-7 -7 14 14" aria-hidden="true" className="inline-block align-[-2px]">
      <UnitMark label={label} r={5} />
    </svg>
  );
}

export function FlexSuppression() {
  const q = useData<FlexData>("flex_suppression.json");
  const [ref, width] = useMeasuredWidth(1100, 300);

  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading what="the FLEX suppression results" />;
  const data = q.data;
  const high = data.high_o2_no_suppressant;
  // The band limits are plain numbers in the snapshot; their provenance record (flex:band) holds the same
  // pressure_mmhg limits. No psi or kPa value exists for the band yet, so none is written here.
  const bandVals: [Val<number>, Val<number>] = [
    { v: data.band_mmhg[0], u: "mmHg", p: data.in_band.p },
    { v: data.band_mmhg[1], u: "mmHg", p: data.in_band.p },
  ];
  const allLabels = orderedLabels(
    Object.fromEntries([...data.groups.flatMap((g) => Object.entries(g.outcome_labels)), ...Object.entries(high.outcome_labels)]),
  );

  const wide = width >= 760;
  const leftW = wide ? 290 : width;
  const breakdownW = wide ? 230 : width;
  const unitsX = wide ? leftW : 0;
  const unitsW = wide ? width - leftW - breakdownW - 20 : width;
  const step = wide ? 22 : 18;
  const r = wide ? 7.5 : 6;
  const cap = Math.max(1, Math.floor(unitsW / step));

  const labels: OverlayLabel[] = [];
  const marks: ReactElement[] = [];
  let y = 0;

  type Row = { key: string; title: string; headline: OverlayLabel["node"]; headlineText: string; sub?: { node: OverlayLabel["node"]; text: string }; outcomes: Record<string, Count>; p: string };

  const drawRow = (row: Row) => {
    const order = orderedLabels(row.outcomes);
    const units: string[] = order.flatMap((l) => Array.from({ length: asVal(row.outcomes[l], row.p).v }, () => l));
    const lines = Math.max(1, Math.ceil(units.length / cap));
    const unitsH = lines * step;
    const bdH = order.length * 17;
    const leftH = row.sub ? 66 : 50;
    const h = wide ? Math.max(leftH, unitsH + 16, bdH + 12) : leftH + unitsH + 10 + bdH + 6;
    const y0 = y;
    const k = row.key;

    marks.push(<text key={`${k}t`} x={0} y={y0 + 12} dominantBaseline="central" fontSize={14} fill="var(--ink-2)">{row.title}</text>);
    labels.push({ key: `${k}h`, x: 0, y: y0 + 33, size: wide ? 19 : 17, weight: 600, text: row.headlineText, node: row.headline });
    if (row.sub) labels.push({ key: `${k}s`, x: 0, y: y0 + 54, size: 12, tone: "ink-2", text: row.sub.text, node: row.sub.node });

    const uy = wide ? y0 + (h - unitsH) / 2 : y0 + leftH + 2;
    marks.push(
      <g key={`${k}u`} transform={`translate(${unitsX},${uy})`}>
        {units.map((l, i) => (
          <g key={i} transform={`translate(${(i % cap) * step + step / 2},${Math.floor(i / cap) * step + step / 2})`}>
            <UnitMark label={l} r={r} />
          </g>
        ))}
        <title>{`${row.title}: ${order.map((l) => `"${l}" ${asVal(row.outcomes[l], row.p).v}`).join(", ")}`}</title>
      </g>,
    );

    const bx = wide ? width - breakdownW : 0;
    const by = wide ? y0 + (h - bdH) / 2 + 8 : uy + unitsH + 14;
    order.forEach((l, i) => {
      const v = asVal(row.outcomes[l], row.p);
      marks.push(
        <g key={`${k}bk${l}`} transform={`translate(${bx + 6},${by + i * 17})`}>
          <UnitMark label={l} r={4.5} />
        </g>,
      );
      labels.push({
        key: `${k}b${l}`,
        x: bx + 18,
        y: by + i * 17,
        size: 12.5,
        tone: "ink",
        text: `"${l}" ${valText(v)}`,
        node: (
          <>
            <q className="text-ink-2">{l}</q> <Value val={v} unit={false} />
          </>
        ),
      });
    });
    y = y0 + h + 10;
    marks.push(<line key={`${k}sep`} x1={0} x2={width} y1={y - 5} y2={y - 5} stroke="var(--line)" />);
    y += 6;
  };

  // Band line and key.
  const bandText = data.band_psi
    ? `Pressure band used: ${valText(data.band_psi[0], "psi")} to ${valText(data.band_psi[1], "psi")}. FLEX tests in this band: ${valText(data.in_band)}`
    : `Pressure band used: ${valText(bandVals[0], "mmHg")} to ${valText(bandVals[1], "mmHg")}, in mmHg as the FLEX tables record it. FLEX tests in this band: ${valText(data.in_band)}`;
  const bandLines = wide ? 1 : 2;
  labels.push({
    key: "band",
    x: 0,
    y: 10 + (bandLines - 1) * 8,
    size: 12.5,
    tone: "ink-2",
    text: bandText,
    maxWidth: wide ? undefined : width,
    node: (
      <>
        Pressure band used:{" "}
        {data.band_psi && data.band_kpa ? (
          <>
            <Pressure psi={data.band_psi[0]} kpa={data.band_kpa[0]} /> to <Pressure psi={data.band_psi[1]} kpa={data.band_kpa[1]} />.
          </>
        ) : (
          <>
            <Value val={bandVals[0]} unit={false} /> to <Value val={bandVals[1]} />, in mmHg as the FLEX tables record it.
          </>
        )}{" "}
        FLEX tests in this band: <Value val={data.in_band} unit={false} />
      </>
    ),
  });
  y += 12 + bandLines * 18;

  // CO2 groups.
  marks.push(<text key="co2h" x={0} y={y + 8} dominantBaseline="central" fontSize={14} fontWeight={600} fill="var(--ink)">CO2 added as a suppressant</text>);
  marks.push(<line key="co2l" x1={0} x2={width} y1={y + 24} y2={y + 24} stroke="var(--line)" />);
  y += 32;
  data.groups.forEach((g, i) =>
    drawRow({
      key: `g${i}`,
      title: g.label,
      p: g.total.p,
      outcomes: g.outcome_labels,
      headlineText: `${valText(g.extinguished)} of ${valText(g.total)} labelled "${EXTINGUISHED}"`,
      headline: (
        <>
          <Value val={g.extinguished} unit={false} /> of <Value val={g.total} unit={false} />{" "}
          <span className="text-xs font-normal text-ink-3">labelled <q>{EXTINGUISHED}</q></span>
        </>
      ),
    }),
  );

  // The annotation, beside the group it qualifies.
  const noteSize = wide ? 14.5 : 13;
  const noteLines = wrapWords(data.annotation, Math.floor((width - 40) / (noteSize * 0.53)));
  const noteH = noteLines.length * (noteSize + 7) + 18;
  marks.push(
    <g key="note" transform={`translate(0,${y})`}>
      <rect width={width} height={noteH} rx={8} fill="var(--surface-3)" />
      <rect width={4} height={noteH} rx={2} fill="var(--accent)" />
      {noteLines.map((ln, i) => (
        <text key={i} x={18} y={9 + (noteSize + 7) * (i + 0.5)} dominantBaseline="central" fontSize={noteSize} fontWeight={500} fill="var(--ink)">
          {ln}
        </text>
      ))}
    </g>,
  );
  y += noteH + 22;

  // Comparison group.
  marks.push(<text key="cmph" x={0} y={y + 8} dominantBaseline="central" fontSize={14} fontWeight={600} fill="var(--ink)">For comparison: higher oxygen, no suppressant</text>);
  marks.push(<line key="cmpl" x1={0} x2={width} y1={y + 24} y2={y + 24} stroke="var(--line)" />);
  y += 32;
  const fuelNames = Object.keys(high.fuels);
  drawRow({
    key: "high",
    title: "Higher oxygen, no suppressant",
    p: high.total.p,
    outcomes: high.outcome_labels,
    headlineText: `${valText(high.total, "tests")}`,
    headline: <Value val={high.total} />,
    sub: {
      text: fuelNames.map((f) => `${f} ${valText(asVal(high.fuels[f], high.total.p))}`).join(", "),
      node: (
        <>
          {fuelNames.map((f, i) => (
            <span key={f}>
              {i > 0 && ", "}
              {f} <Value val={asVal(high.fuels[f], high.total.p)} unit={false} />
            </span>
          ))}
        </>
      ),
    },
  });
  const height = y;

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">FLEX droplet tests by CO2 group: tests labelled "Extinction" out of all tests, with every verbatim outcome label</caption>
        <thead className="text-left text-xs text-ink-3">
          <tr>
            <th className="py-1 pr-3 font-medium">Group (as labelled by the build)</th>
            <th className="pr-3 text-right font-medium">Labelled "Extinction"</th>
            <th className="pr-3 text-right font-medium">All tests</th>
            <th className="font-medium">Outcome labels (verbatim)</th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g, i) => (
            <tr key={i} className="border-t border-line align-top">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">{g.label}</th>
              <td className="num pr-3 text-right"><Value val={g.extinguished} unit={false} /></td>
              <td className="num pr-3 text-right"><Value val={g.total} unit={false} /></td>
              <td>
                {orderedLabels(g.outcome_labels).map((l, j) => (
                  <span key={l}>{j > 0 && ", "}<q>{l}</q> <Value val={asVal(g.outcome_labels[l], g.total.p)} unit={false} /></span>
                ))}
              </td>
            </tr>
          ))}
          <tr className="border-t border-line align-top">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal">Higher oxygen, no suppressant (comparison)</th>
            <td className="pr-3 text-right text-ink-3">not counted separately</td>
            <td className="num pr-3 text-right"><Value val={high.total} unit={false} /></td>
            <td>
              {orderedLabels(high.outcome_labels).map((l, j) => (
                <span key={l}>{j > 0 && ", "}<q>{l}</q> <Value val={asVal(high.outcome_labels[l], high.total.p)} unit={false} /></span>
              ))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      headline={(() => {
        // Groups are ordered by increasing CO2 (redshift/params.json). Say so only if the shares really rise.
        const shares = data.groups.map((g) => (g.total.v > 0 ? g.extinguished.v / g.total.v : NaN));
        const rising = shares.every((s, i) => Number.isFinite(s) && (i === 0 || s >= shares[i - 1]));
        return rising
          ? <>The more CO2 was added, the larger the share of FLEX droplet tests labelled &ldquo;{EXTINGUISHED}&rdquo;.</>
          : <>How many FLEX droplet tests were labelled &ldquo;{EXTINGUISHED}&rdquo; in each CO2 group.</>;
      })()}
      id="flex-suppression"
      title={`FLEX: droplet tests with CO2 added, and how many were labelled "${EXTINGUISHED}"`}
      caption={`Each marker is one FLEX droplet test from the PSI table, styled by its outcome label, quoted exactly as the table writes it (for example "Disruption" is the table's own word, not a paraphrase). Fractions are tests labelled "${EXTINGUISHED}" out of all tests in the group. Groups and the pressure band were fixed before any count was run.`}
      sources="NASA PSI experiment table for FLEX (DOI on the investigation page); grouping by the Redshift build."
      table={table}
    >
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Outcome labels">
        {allLabels.map((l) => (
          <li key={l} className="flex items-center gap-1.5"><KeyMarker label={l} /> <q>{l}</q></li>
        ))}
        <li className="text-ink-3">One marker per test; all FLEX tests here are droplets</li>
      </ul>
      <div ref={ref} className="relative w-full">
        <svg
          data-chart
          width={width}
          height={height}
          role="img"
          aria-label={`FLEX droplet tests with CO2 added. ${data.groups
            .map((g) => `${g.label}: ${valText(g.extinguished)} of ${valText(g.total)} labelled ${EXTINGUISHED}`)
            .join("; ")}. ${data.annotation}`}
          className="block select-none"
        >
          {marks}
          <ExportLabels labels={labels} />
        </svg>
        <OverlayLayer labels={labels} />
      </div>
      {data.pressure_not_recorded.length > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          Not placed in any group because pressure is not recorded:{" "}
          {data.pressure_not_recorded.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <Link className="mono underline" to={`/evidence?ids=${encodeURIComponent(id)}`}>{id}</Link>
            </span>
          ))}
          .
        </p>
      )}
    </ChartFrame>
  );
}
