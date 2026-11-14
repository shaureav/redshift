// The context strip: flame temperature (the nearest computed point when the probe is not on a candidate),
// prebreathe status and the nearness step size, in one compact row that expands into the explanations and the
// step size scrubber. The flame temperature is a built value chosen by flameAt, never interpolated (D18).
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { fmtNumber } from "../lib/format";
import type { FlameReading, PanelData, PrebreatheStatus } from "./EvidencePanel";
import { ChevronIcon } from "./Icons";
import { Value } from "./Value";

const PB_SHORT: Record<PrebreatheStatus["kind"], string> = { published: "Published", pending: "Awaiting check", none: "None published" };

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
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--accent)] bg-[color:var(--surface)] transition-[left] duration-base ease-out"
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
              data-setting=""
            >
              {fmtNumber(s)}x
            </button>
          ))}
        </span>
      </div>
      {steps && (
        <p className="mt-5 text-xs text-ink-2">
          Near means within <Value val={steps.threshold} /> of the point. At <span data-setting="">1x</span> one step is <Value val={steps.o2_step} /> or a pressure ratio of <Value val={steps.pressure_ratio} digits={2} />. The step sizes are a judgement; counts at each stop are computed by the build. <Link className="underline underline-offset-2" to="/methods?open=nearness">Why these steps</Link>
        </p>
      )}
    </div>
  );
}

function FlameDetail({ flame }: { flame: FlameReading | null }) {
  if (!flame) return <p className="text-sm text-ink-2">Not computed at this point; it lies outside the flame temperature grid.</p>;
  return (
    <>
      <p className="text-sm">
        <Value val={flame.value} digits={0} approximate={flame.approximate} />{" "}
        {flame.exact || !flame.at ? (
          <span className="text-ink-2">computed for this atmosphere.</span>
        ) : (
          <span className="text-xs text-ink-2">At the nearest computed point, <Value val={flame.at.o2} digits={1} /> and <Value val={flame.at.psi} digits={1} />. Values between computed points are not interpolated.</span>
        )}
      </p>
      <p className="mt-1 text-xs italic text-ink-2">Stoichiometric methane. Explains how hot a flame can get; it does not predict ignition or spread.</p>
    </>
  );
}

function PrebreatheDetail({ prebreathe }: { prebreathe: PrebreatheStatus }) {
  if (prebreathe.kind === "published") return <p className="text-sm">{prebreathe.point.duration_text} <span className="text-ink-2">{prebreathe.caveat}</span></p>;
  if (prebreathe.kind === "pending") {
    return (
      <p className="text-sm text-ink-2">
        A published figure has been found for this atmosphere and is waiting for a team member to verify it against the source (finding <span className="mono">{prebreathe.finding}</span>). It appears here once verified.
      </p>
    );
  }
  return <p className="text-sm text-ink-2">No published prebreathe figure for this atmosphere.</p>;
}

export function ContextStrip({ flame, prebreathe, multiplier, multipliers, onMultiplier, steps }: {
  flame: FlameReading | null;
  prebreathe: PrebreatheStatus;
  multiplier: number;
  multipliers: number[];
  onMultiplier?: (m: number) => void;
  steps: PanelData["steps"];
}) {
  const [open, setOpen] = useState(false);
  const region = useId();
  return (
    <section className="border-t border-line px-5 py-3" aria-labelledby="sec-context">
      <h2 id="sec-context" className="sr-only">Context: flame temperature, prebreathe and step size</h2>
      <div className="flex items-start gap-3">
        <dl className="grid flex-1 grid-cols-[1fr_auto_auto] gap-x-6 text-sm">
          <div>
            <dt className="eyebrow">Flame</dt>
            <dd className="font-semibold">
              {flame ? <Value val={flame.value} digits={0} approximate={flame.approximate} /> : <span className="font-normal italic text-ink-2">not computed here</span>}
              {flame && !flame.exact && <span className="block text-xs font-normal text-ink-3">nearest point</span>}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Prebreathe</dt>
            <dd className={prebreathe.kind === "published" ? "" : "text-ink-2"}>{PB_SHORT[prebreathe.kind]}</dd>
          </div>
          <div>
            <dt className="eyebrow">Step</dt>
            <dd data-setting="">{fmtNumber(multiplier)}x</dd>
          </div>
        </dl>
        <button type="button" className="btn btn-sm btn-quiet flex-none" aria-expanded={open} aria-controls={region} onClick={() => setOpen((o) => !o)}>
          {open ? "Less" : "More"}
          <ChevronIcon dir={open ? "up" : "down"} />
        </button>
      </div>
      {/* Rendered while closed too (hidden), so the page's text and the snapshots hold the full context. */}
      <div id={region} hidden={!open} className="mt-3 space-y-4">
        <div>
          <h3 className="eyebrow mb-1">Flame temperature</h3>
          <FlameDetail flame={flame} />
        </div>
        <div>
          <h3 className="eyebrow mb-1">Prebreathe</h3>
          <PrebreatheDetail prebreathe={prebreathe} />
        </div>
        <div>
          <h3 className="eyebrow mb-1">Nearness step size</h3>
          <StepScrubber value={multiplier} stops={multipliers} onChange={onMultiplier} steps={steps} />
        </div>
      </div>
    </section>
  );
}
