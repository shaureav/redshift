// Two profiles through the probe: tests near points along oxygen at this pressure, and along pressure at this
// oxygen. Each bar is one node of probe_grid.json (the totals for the current step size, read by
// totalsAlongO2 and totalsAlongPressure), so every value is a built Val with the series provenance id. Bar
// heights are drawn proportions, never printed. Where the total is zero the line is hatched: unknown, not safe.
// A marker shows the probe. Hovering, or the arrow keys on a focused line, moves an inspection cursor whose
// node and count show below as Values.
import { useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { Profile } from "../lib/probe";
import { Value, valueText } from "./Value";

const H = 32; // drawn height of a line, px

/** Runs of zero along a line, as [start, length] in node indices: drawn hatched. */
function zeroRuns(counts: Profile["counts"]): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  counts.forEach((c, k) => {
    if (c.v === 0 && start < 0) start = k;
    if (c.v !== 0 && start >= 0) {
      runs.push([start, k - start]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, counts.length - start]);
  return runs;
}

function Sparkline({ caption, label, profile, at, resetKey, digits }: { caption: ReactNode; label: string; profile: Profile; at: number; resetKey: string; digits?: number }) {
  const n = profile.counts.length;
  // The cursor stays where the reader left it until the probe moves, so the count it shows can still be opened.
  const [inspect, setInspect] = useState<{ key: string; i: number } | null>(null);
  const idx = inspect && inspect.key === resetKey ? inspect.i : at;
  const clampI = (i: number) => Math.max(0, Math.min(n - 1, i));
  const set = (i: number) => setInspect({ key: resetKey, i: clampI(i) });
  // From the cursor as React last stored it, so quick repeats never step from a stale index.
  const step = (d: number) => setInspect((prev) => ({ key: resetKey, i: clampI((prev && prev.key === resetKey ? prev.i : at) + d) }));

  const { bars, runs, top } = useMemo(() => {
    const max = Math.max(1, ...profile.counts.map((c) => c.v));
    const top = (v: number) => H - Math.max(2, (v / max) * (H - 2)); // a drawn proportion, never printed
    let d = "";
    profile.counts.forEach((c, k) => {
      if (c.v > 0) d += `M${k},${H}V${top(c.v)}H${k + 1}V${H}Z`;
    });
    return { bars: d, runs: zeroRuns(profile.counts), top };
  }, [profile.counts]);

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width > 0) set(Math.floor(((e.clientX - box.left) / box.width) * n));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const by: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in by) step(by[e.key]);
    else if (e.key === "Home") set(0);
    else if (e.key === "End") set(n - 1);
    else return;
    e.preventDefault();
  };
  const pct = (k: number) => `${(k / n) * 100}%`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink-2">{caption}</span>
        <span className="text-ink">
          at <Value val={profile.axis[idx]} digits={digits} />, <Value val={profile.counts[idx]} />
        </span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={idx}
        aria-valuetext={`at ${valueText(profile.axis[idx], digits)}, ${valueText(profile.counts[idx])} near`}
        className="relative mt-1 cursor-crosshair rounded-sm border-b border-line-strong"
        style={{ height: H }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onKeyDown={onKey}
      >
        {runs.map(([s, len]) => (
          <span key={s} className="hatch-bg absolute inset-y-0 opacity-60" style={{ left: pct(s), width: pct(len) }} aria-hidden="true" />
        ))}
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={bars} fill="var(--ink-3)" />
          {profile.counts[idx].v > 0 && idx !== at && (
            <rect x={idx} width={1} y={top(profile.counts[idx].v)} height={H} fill="var(--ink)" />
          )}
        </svg>
        {/* The probe: a solid line. The inspection cursor, when moved away from it: a dashed one. */}
        <span className="absolute -inset-y-1 -translate-x-1/2 bg-[color:var(--probe)]" style={{ left: pct(at + 0.5), width: 2 }} aria-hidden="true" />
        {idx !== at && <span className="absolute inset-y-0 -translate-x-1/2 border-l border-dashed border-[color:var(--ink-2)]" style={{ left: pct(idx + 0.5) }} aria-hidden="true" />}
      </div>
    </div>
  );
}

export function Sparklines({ o2, psi, at, psiVal, o2Val, multiplier }: {
  o2: Profile;
  psi: Profile;
  at: { i: number; j: number };
  psiVal: Profile["axis"][number];
  o2Val: Profile["axis"][number];
  multiplier: number;
}) {
  const key = `${at.i}:${at.j}:${multiplier}`;
  return (
    <section className="px-5 pb-4" aria-labelledby="sec-lines">
      <h2 id="sec-lines" className="eyebrow">Tests near, along each axis</h2>
      <div className="mt-2 space-y-3">
        <Sparkline
          caption={<>Along oxygen at <Value val={psiVal} /></>}
          label="Tests near points along oxygen at this pressure. Arrow keys move the cursor."
          profile={o2}
          at={at.i}
          resetKey={key}
        />
        <Sparkline
          caption={<>Along pressure at <Value val={o2Val} /> O2</>}
          label="Tests near points along pressure at this oxygen. Arrow keys move the cursor."
          profile={psi}
          at={at.j}
          resetKey={key}
          digits={1}
        />
      </div>
    </section>
  );
}
