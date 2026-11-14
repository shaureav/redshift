// The evidence panel: everything known about fire near one point of the plane, and what is missing. It is a
// pure view of a Reading from the probe grid plus the built files; it computes no count. The only arithmetic is
// choosing which built value to show (the nearest computed flame temperature) and drawn proportions (bar widths
// and heights), never printed numbers. The panel itself is composed from focused parts: panelReadout (point and
// tiles), panelMissing (what is missing), panelSparklines (the two profiles), panelContext (flame, prebreathe,
// step size) and panelActions (the action bar). This file keeps the data helpers and FuelRows, which Compare uses.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AccessGapData } from "../charts/AccessGap";
import type { FlameGrid, PrebreathePoint } from "../charts/TradeMap";
import { FUEL_LABEL } from "../lib/format";
import { FUELS, type NearTest, type ProbeInput, type Profile, type Reading } from "../lib/probe";
import type { Candidate, CandidateEvidence, Val } from "../lib/types";
import { FuelMarker } from "./Common";
import { ChevronIcon } from "./Icons";
import { ActionBar, type ActionLinks } from "./panelActions";
import { ContextStrip } from "./panelContext";
import { MissingCallout } from "./panelMissing";
import { Readout } from "./panelReadout";
import { Sparklines } from "./panelSparklines";
import { Value } from "./Value";

export { PointHeadline } from "./panelReadout";

export type FlameFile = FlameGrid & { p: string };

export interface FlameReading {
  value: Val<number>;
  approximate: boolean;
  exact: boolean; // computed for exactly this point (a candidate atmosphere)
  at: { o2: Val<number>; psi: Val<number> } | null; // the computed point shown, when not exact
}

/** The flame temperature to show at a point: exact for a candidate, otherwise the nearest computed grid point. Never interpolated. */
export function flameAt(flame: FlameFile | undefined, o2: number, psi: number, candEv: CandidateEvidence | null): FlameReading | null {
  if (candEv) return { value: candEv.flame_temperature, approximate: candEv.flame_temperature.approximate, exact: true, at: null };
  if (!flame) return null;
  const { o2_pct: xs, pressure_psi: ys } = flame;
  if (o2 < xs[0] || o2 > xs[xs.length - 1] || psi < ys[0] || psi > ys[ys.length - 1]) return null;
  const nearest = (arr: number[], v: number) => arr.reduce((best, a, i) => (Math.abs(a - v) < Math.abs(arr[best] - v) ? i : best), 0);
  const i = nearest(xs, o2);
  const j = nearest(ys, psi);
  return {
    value: { v: flame.temperature_K[j][i], u: "K", p: flame.p },
    approximate: flame.approximate[j][i],
    exact: false,
    at: { o2: { v: xs[i], u: "%", p: flame.p }, psi: { v: ys[j], u: "psi", p: flame.p } },
  };
}

export interface PrebreatheFile { points: PrebreathePoint[]; pending: { atmosphere: string; finding_id: string; status: string }[]; caveat: string; p: string }
export type PrebreatheStatus =
  | { kind: "published"; point: PrebreathePoint; caveat: string }
  | { kind: "pending"; finding: string }
  | { kind: "none" };

export function prebreatheFor(pb: PrebreatheFile | undefined, cand: Candidate | null): PrebreatheStatus {
  if (!pb || !cand) return { kind: "none" };
  const point = pb.points.find((p) => p.atmosphere === cand.name);
  if (point) return { kind: "published", point, caveat: pb.caveat };
  const pending = pb.pending.find((p) => p.atmosphere === cand.name);
  return pending ? { kind: "pending", finding: pending.finding_id } : { kind: "none" };
}

export interface PanelData {
  reading: Reading;
  near: NearTest[];
  o2match: ProbeInput[];
  candidate: Candidate | null;
  candEv: CandidateEvidence | null;
  flame: FlameReading | null;
  prebreathe: PrebreatheStatus;
  gap: AccessGapData | null;
  steps: { threshold: Val<number>; o2_step: Val<number>; pressure_ratio: Val<number> } | null;
  multipliers: number[];
  preview: boolean;
  outside: boolean; // the requested point lies outside the probe grid; the reading is its nearest edge node
  /** One row and one column of the grid through the probe (totals at the current step size), for the sparklines. */
  profiles: { o2: Profile; psi: Profile } | null;
}

export function FuelRows({ r }: { r: Reading }) {
  const max = Math.max(1, ...FUELS.map((f) => r.nearClass[f]));
  return (
    <ul className="space-y-3" aria-label="Tests near this point by fuel class">
      {FUELS.map((f) => {
        const n = r.nearClass[f];
        return (
          <li key={f} className="grid grid-cols-[112px_1fr] items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-ink-2"><FuelMarker fuel={f} size={12} /> {FUEL_LABEL[f].replace(" (BRE)", "")}</span>
            {n === 0 ? (
              // Zero: the words sit beside the hatch, never on it, so in a narrow column (a phone's compare) they
              // wrap under it instead of covering it. Empty means unknown, and the hatch must stay in sight.
              <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                <span className="hatch-bg h-6 min-w-8 flex-1 rounded-sm border border-dashed border-line-strong opacity-70" aria-hidden="true" />
                <span className="flex flex-wrap items-baseline justify-end gap-x-2 text-sm text-ink-2">
                  <span className="italic">no tests recorded</span>
                  <span className="flex items-baseline gap-2 whitespace-nowrap">
                    <span className="font-semibold"><Value val={r.near[f].psi_table} unit={false} /></span>
                    <span className="text-xs text-ink-3">paper <Value val={r.near[f].published_paper} unit={false} /></span>
                  </span>
                </span>
              </span>
            ) : (
              <span className="relative flex h-6 items-center">
                <span className={`bar fuel-bar fuel-${f} absolute inset-y-0 left-0 rounded-sm`} style={{ width: `${Math.max(2, (n / max) * 100)}%` }} aria-hidden="true" />
                {/* A solid chip, so the count and the paper label never sit on the bar's fill (AA in both themes). */}
                <span className="relative ml-auto flex items-baseline gap-2 rounded-sm bg-surface-2 px-2 text-sm">
                  <span className="font-semibold"><Value val={r.near[f].psi_table} unit={false} /></span>
                  <span className="text-xs text-ink-3">paper <Value val={r.near[f].published_paper} unit={false} /></span>
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface PanelActions {
  onMultiplier?: (m: number) => void;
  links: ActionLinks;
  /** Copy the view's link; the page says so in a toast (components/Toaster.tsx). */
  onShare?: () => void;
  onOpenGap?: () => void;
}

function NearestTests({ near }: { near: NearTest[] }) {
  const shown = near.slice(0, 6);
  if (!shown.length) return null;
  return (
    <section className="border-t border-line px-5 py-3" aria-label="Nearest tests">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronIcon className="flex-none transition-transform duration-base group-open:rotate-90" />
          Nearest tests
        </summary>
        <ul className="mt-2 divide-y divide-[color:var(--line)] text-sm">
          {shown.map(({ input }) => (
            <li key={input.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <Link className="mono text-xs underline underline-offset-2" to={`/evidence?ids=${encodeURIComponent(input.id)}&test=${encodeURIComponent(input.id)}`}>{input.id}</Link>
                {/* The investigation only: a test's free-text label can hold numbers with no provenance of their own
                    ("30% ethane"); the id opens the record, with every value sourced, in the Evidence Explorer. */}
                <span className="ml-2 text-ink-2">{input.investigation}</span>
              </span>
              <span className="flex-none text-xs text-ink-2"><Value val={input.o2 as Val} digits={1} /> · <Value val={input.kpa as Val} digits={1} /></span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The instrument panel: readout and tiles, what is missing, the two profiles through the probe, the context
 *  strip, then the nearest tests and Ask, with the action bar pinned to the bottom. A pure view of PanelData. */
export function EvidencePanelView({ data, actions, ask }: { data: PanelData; actions: PanelActions; ask?: ReactNode }) {
  const { reading: r, candidate } = data;
  return (
    <div className="flex min-h-full flex-col" data-testid="evidence-panel">
      <Readout r={r} candidate={candidate} preview={data.preview} outside={data.outside} />
      <MissingCallout r={r} candidate={candidate} prebreathe={data.prebreathe} gap={data.gap} onOpenGap={actions.onOpenGap} />
      {data.profiles && <Sparklines o2={data.profiles.o2} psi={data.profiles.psi} at={{ i: r.i, j: r.j }} o2Val={r.o2} psiVal={r.psi} multiplier={r.multiplier} />}
      <ContextStrip flame={data.flame} prebreathe={data.prebreathe} multiplier={r.multiplier} multipliers={data.multipliers} onMultiplier={actions.onMultiplier} steps={data.steps} />
      <NearestTests near={data.near} />
      {ask && (
        <section className="border-t border-line px-5 py-4" aria-labelledby="sec-ask" data-testid="ask">
          <h2 id="sec-ask" className="eyebrow mb-3">Ask the evidence</h2>
          {ask}
        </section>
      )}
      <p className="border-t border-line px-5 py-4 text-xs text-ink-3">Redshift informs a decision; it does not rank or recommend an atmosphere. Empty means unknown, never safe.</p>
      <ActionBar links={actions.links} onShare={actions.onShare} />
    </div>
  );
}
