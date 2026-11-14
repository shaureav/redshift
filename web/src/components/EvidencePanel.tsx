// The evidence panel: everything known about fire near one point of the plane, and what is missing.
// It is a pure view of a Reading from the probe grid plus the built files; it computes no count. The
// only arithmetic is choosing which built value to show (the nearest computed flame temperature) and bar
// widths, which are drawn proportions, never printed numbers.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AccessGapData } from "../charts/AccessGap";
import type { FlameGrid, PrebreathePoint } from "../charts/TradeMap";
import { FUEL_LABEL, fmtNumber } from "../lib/format";
import { FUELS, type NearTest, type ProbeInput, type Reading } from "../lib/probe";
import type { Candidate, CandidateEvidence, Val } from "../lib/types";
import { FuelMarker } from "./Common";
import { Value } from "./Value";

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
}

function Section({ title, children, id }: { title: ReactNode; children: ReactNode; id?: string }) {
  return (
    // scroll-mt clears the sticky nav when a section is scrolled to the top (the tour's access-gap step).
    <section className="scroll-mt-16 border-t border-line px-5 py-4" aria-labelledby={id}>
      <h2 id={id} className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** The point's one-sentence answer, built only from built counts. */
export function PointHeadline({ r }: { r: Reading }) {
  const solid = r.nearClass.solid;
  if (r.total.v === 0) return <>No tests recorded near this point.</>;
  return (
    <>
      <Value val={r.total} unit={false} /> {r.total.v === 1 ? "test sits" : "tests sit"} near this point.{" "}
      {solid === 0 ? (
        <>None is a solid material.</>
      ) : (
        <>Solid material: <Value val={r.near.solid.psi_table} unit={false} /> from PSI tables, <Value val={r.near.solid.published_paper} unit={false} /> from verified papers.</>
      )}
    </>
  );
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
            <span className="relative flex h-6 items-center">
              {n === 0 ? (
                <span className="hatch-bg absolute inset-y-0 left-0 right-0 rounded-sm border border-dashed border-line-strong opacity-70" aria-hidden="true" />
              ) : (
                <span className="bar absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.max(2, (n / max) * 100)}%`, background: `var(--${f})`, opacity: 0.85 }} aria-hidden="true" />
              )}
              {/* A solid chip, so the count and the paper label never sit on the bar's fill (AA in both themes). */}
              <span className={`relative ml-auto flex items-baseline gap-2 rounded-sm bg-surface-2 px-2 text-sm ${n === 0 ? "text-ink-2" : ""}`}>
                {n === 0 ? <span className="italic">no tests recorded</span> : null}
                <span className="font-semibold"><Value val={r.near[f].psi_table} unit={false} /></span>
                <span className="text-xs text-ink-3">paper <Value val={r.near[f].published_paper} unit={false} /></span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StepScrubber({ value, stops, onChange, steps }: { value: number; stops: number[]; onChange?: (m: number) => void; steps: PanelData["steps"] }) {
  const idx = Math.max(0, stops.indexOf(value));
  const move = (d: number) => onChange?.(stops[Math.max(0, Math.min(stops.length - 1, idx + d))]);
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Nearness step size"
        className="relative flex h-10 items-center"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); move(1); }
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); move(-1); }
        }}
      >
        <span className="absolute left-3 right-3 top-1/2 h-px bg-[color:var(--line-strong)]" aria-hidden="true" />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--accent)] bg-[color:var(--surface)] transition-[left] duration-200 ease-out"
          style={{ left: `calc(12px + (100% - 24px) * ${stops.length > 1 ? idx / (stops.length - 1) : 0})` }}
          aria-hidden="true"
        />
        <span className="relative flex w-full justify-between">
          {stops.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === value}
              tabIndex={s === value ? 0 : -1}
              onClick={() => onChange?.(s)}
              className={`mt-8 w-12 text-center text-xs ${s === value ? "font-semibold text-ink" : "text-ink-3 hover:text-ink"}`}
            >
              {fmtNumber(s)}x
            </button>
          ))}
        </span>
      </div>
      {steps && (
        <p className="mt-5 text-xs text-ink-2">
          Near means within <Value val={steps.threshold} /> of the point. At 1x one step is <Value val={steps.o2_step} /> or a pressure ratio of <Value val={steps.pressure_ratio} digits={2} />. The step sizes are a judgement; counts at each stop are computed by the build. <Link className="underline underline-offset-2" to="/methods?open=nearness">Why these steps</Link>
        </p>
      )}
    </div>
  );
}

function GapMini({ gap, r }: { gap: AccessGapData; r: Reading }) {
  const steps = gap.psi_steps;
  const noPressure = steps[2]?.count.v === 0;
  const max = Math.max(1, ...steps.map((s) => s.count.v));
  return (
    <div>
      <p className="text-base font-semibold leading-snug">
        {noPressure ? "No solid burn in PSI's tables records pressure." : "Solid burns in PSI's tables, step by step."}
      </p>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs">
            <span className="relative h-6">
              {s.count.v === 0 ? (
                <span className="hatch-bg absolute inset-0 rounded-sm border border-dashed border-line-strong opacity-70" aria-hidden="true" />
              ) : (
                <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(s.count.v / max) * 100}%`, background: "var(--solid)", opacity: 0.85 }} aria-hidden="true" />
              )}
              <span className="relative flex h-6 items-center px-2 text-ink">{s.label.replace(/^\.\.\.\s*/, "… ")}</span>
            </span>
            <span className="text-sm font-semibold"><Value val={s.count} unit={false} /></span>
          </li>
        ))}
      </ol>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-2">Solid tests near this point, PSI tables</dt><dd className="font-semibold"><Value val={r.near.solid.psi_table} unit={false} /></dd>
        <dt className="text-ink-2">Solid tests near this point, verified papers</dt><dd className="font-semibold"><Value val={r.near.solid.published_paper} unit={false} /></dd>
        <dt className="text-ink-2">Paper findings awaiting a person to verify them</dt><dd className="font-semibold"><Value val={gap.paper_findings_awaiting_verification} unit={false} /></dd>
      </dl>
    </div>
  );
}

export interface PanelActions {
  onMultiplier?: (m: number) => void;
  links: { dossier?: string; evidence: string; compare: string; brief: string };
  onShare?: () => void;
  shareLabel?: string;
  onOpenGap?: () => void;
}

export function EvidencePanelView({ data, actions, ask }: { data: PanelData; actions: PanelActions; ask?: ReactNode }) {
  const { reading: r, candidate, flame, prebreathe, gap } = data;
  const nearShown = data.near.slice(0, 6);
  return (
    <div className="flex min-h-full flex-col" data-testid="evidence-panel">
      <header className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">{data.preview ? "Preview" : candidate ? "Candidate atmosphere" : "Probe"}</span>
          {data.preview && <span className="text-xs text-ink-3">Click to pin</span>}
        </div>
        <p className="mt-2 text-xl font-semibold num">
          <Value val={r.o2} /> <span className="text-ink-3">O2</span> · <Value val={r.psi} />{" "}
          <span className="text-base font-normal text-ink-2">(<Value val={r.kpa} digits={1} />)</span>
        </p>
        {candidate && <p className="mt-1 text-sm text-ink-2">{candidate.name}: {candidate.short}. {candidate.context}</p>}
        {data.outside && <p className="mt-1 text-sm text-[color:var(--amber-ink)]">Outside the probe grid; showing its nearest edge point.</p>}
        <p className="mt-3 text-lg leading-snug" aria-live="polite"><PointHeadline r={r} /></p>
      </header>

      <Section title="Tests near this point, by fuel class" id="sec-fuel">
        <FuelRows r={r} />
        {nearShown.length > 0 && (
          <details className="group mt-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none transition-transform duration-200 group-open:rotate-90"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Nearest tests
            </summary>
            <ul className="mt-2 divide-y divide-[color:var(--line)] text-sm">
              {nearShown.map(({ input }) => (
                <li key={input.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <Link className="mono text-xs underline underline-offset-2" to={`/evidence?ids=${encodeURIComponent(input.id)}&test=${encodeURIComponent(input.id)}`}>{input.id}</Link>
                    <span className="ml-2 text-ink-2">{input.investigation}{input.label ? `, ${input.label}` : ""}</span>
                  </span>
                  <span className="flex-none text-xs text-ink-2"><Value val={input.o2 as Val} digits={1} /> · <Value val={input.kpa as Val} digits={1} /></span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="Oxygen matches, pressure not recorded" id="sec-o2m">
        <p className="mb-2 text-sm text-ink-2">These tests ran at about this oxygen level, but their tables do not record pressure, so they cannot be placed at this point.</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          {FUELS.filter((f) => f === "solid" || f === "emulator" || data.reading.o2m[f].v > 0).map((f) => (
            <div key={f} className="contents">
              <dt className="flex items-center gap-2 text-ink-2"><FuelMarker fuel={f} size={12} /> {FUEL_LABEL[f]}{f === "emulator" ? ", sessions" : ""}</dt>
              <dd className="font-semibold"><Value val={r.o2m[f]} unit={false} /></dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Nearness step size" id="sec-step">
        <StepScrubber value={r.multiplier} stops={data.multipliers} onChange={actions.onMultiplier} steps={data.steps} />
      </Section>

      <Section title="Flame temperature" id="sec-ft">
        {flame ? (
          <>
            <p className="text-lg font-semibold"><Value val={flame.value} digits={0} approximate={flame.approximate} /></p>
            {!flame.exact && flame.at && (
              <p className="text-xs text-ink-2">At the nearest computed point, <Value val={flame.at.o2} digits={1} /> and <Value val={flame.at.psi} digits={1} />. Values between computed points are not interpolated.</p>
            )}
            <p className="mt-1 text-xs italic text-ink-2">Stoichiometric methane. Explains how hot a flame can get; it does not predict ignition or spread.</p>
          </>
        ) : (
          <p className="text-sm text-ink-2">Not computed at this point (the grid covers 15 to 100% O2 and 3 to 16 psi).</p>
        )}
      </Section>

      <Section title="Prebreathe" id="sec-pb">
        {prebreathe.kind === "published" ? (
          <p className="text-sm">{prebreathe.point.duration_text} <span className="text-ink-2">{prebreathe.caveat}</span></p>
        ) : prebreathe.kind === "pending" ? (
          <p className="text-sm text-ink-2">A published figure has been found for this atmosphere and is waiting for a team member to verify it against the source (finding <span className="mono">{prebreathe.finding}</span>). It appears here once verified.</p>
        ) : (
          <p className="text-sm text-ink-2">No published prebreathe figure for this atmosphere.</p>
        )}
      </Section>

      {gap && (
        <Section title="The access gap" id="sec-gap">
          <GapMini gap={gap} r={r} />
          {actions.onOpenGap && <button type="button" className="btn btn-sm mt-3" onClick={actions.onOpenGap}>Open the access gap chart</button>}
        </Section>
      )}

      <Section title="Go deeper" id="sec-go">
        <div className="flex flex-wrap gap-2">
          {actions.links.dossier && <Link className="btn btn-primary" to={actions.links.dossier}>Open the dossier</Link>}
          <Link className="btn" to={actions.links.evidence}>See these tests</Link>
          <Link className="btn" to={actions.links.compare}>Compare</Link>
          <Link className="btn" to={actions.links.brief}>Cited brief</Link>
          {actions.onShare && <button type="button" className="btn" onClick={actions.onShare}>{actions.shareLabel ?? "Copy link"}</button>}
        </div>
      </Section>

      {ask && <Section title="Ask the evidence" id="sec-ask">{ask}</Section>}
    </div>
  );
}
