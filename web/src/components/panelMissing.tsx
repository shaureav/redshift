// "What's missing" at this point, directly under the readout tiles. Every line is built only from built values
// (the probe grid, access_gap.json, prebreathe.json) and each is a door to its source: its number opens the
// provenance card, and a line without a number links to the page that holds its source. Nothing here is a
// verdict on the atmosphere; it lists what the dataset cannot show.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AccessGapData } from "../charts/AccessGap";
import type { Fuel, Reading } from "../lib/probe";
import type { Candidate } from "../lib/types";
import type { PrebreatheStatus } from "./EvidencePanel";
import { Value } from "./Value";

/** A line of the callout. A group heading has no door of its own; the lines under it (sub) each have one. */
interface Line { key: string; text: ReactNode; door?: ReactNode; sub?: boolean }

const door = "text-sm font-semibold";
const linkDoor = "text-xs text-ink-2 underline underline-offset-2 hover:text-ink";

const O2M: { f: Fuel; text: string }[] = [
  { f: "solid", text: "Solid burns" },
  { f: "emulator", text: "BRE sessions (chamber pressure)" },
  { f: "gas", text: "Gas-flame tests" },
  { f: "droplet", text: "Droplet tests" },
];

function linesFor(r: Reading, candidate: Candidate | null, prebreathe: PrebreatheStatus, gap: AccessGapData | null): Line[] {
  const out: Line[] = [];
  if (r.total.v === 0) out.push({ key: "total", text: "Tests of any fuel class near this point", door: <Value val={r.total} unit={false} /> });
  else if (r.nearClass.solid === 0) out.push({ key: "solid", text: "Solid-material tests near this point", door: <Value val={r.near.solid.psi_table} unit={false} /> });
  // Tests that match this oxygen but cannot be placed, because their tables do not record pressure.
  const o2m = O2M.filter(({ f }) => r.o2m[f].v > 0);
  if (o2m.length) {
    out.push({ key: "o2m", text: "At this oxygen, but no pressure recorded" });
    for (const { f, text } of o2m) out.push({ key: `o2m-${f}`, text, sub: true, door: <Value val={r.o2m[f]} unit={false} /> });
  }
  if (prebreathe.kind === "pending") {
    out.push({ key: "pb", text: "Prebreathe figure awaits verification", door: <Link className={linkDoor} to="/methods?open=prebreathe">Source</Link> });
  } else if (prebreathe.kind === "none") {
    out.push({ key: "pb", text: candidate ? "No published prebreathe figure" : "No prebreathe figure for this point", door: <Link className={linkDoor} to="/methods?open=prebreathe">Source</Link> });
  }
  if (gap && gap.paper_findings_awaiting_verification.v > 0) {
    out.push({ key: "paper", text: "Paper findings to verify, whole dataset", door: <Value val={gap.paper_findings_awaiting_verification} unit={false} /> });
  }
  return out;
}

export function MissingCallout({ r, candidate, prebreathe, gap, onOpenGap }: { r: Reading; candidate: Candidate | null; prebreathe: PrebreatheStatus; gap: AccessGapData | null; onOpenGap?: () => void }) {
  const lines = linesFor(r, candidate, prebreathe, gap);
  return (
    // The tour's access-gap step spotlights this section (Tour.tsx finds it by its heading's id).
    <section className="px-5 pb-4" aria-labelledby="sec-gap">
      <div className="raised relative py-2 pl-4 pr-3">
        {/* A hatched edge: what follows is unknown, not safe. */}
        <span className="hatch-bg absolute inset-y-0 left-0 w-2 rounded-l-lg border-r border-line" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2">
          <h2 id="sec-gap" className="eyebrow">What&apos;s missing</h2>
          {onOpenGap && <button type="button" className="btn btn-sm btn-quiet -mr-2" onClick={onOpenGap}>Access gap chart</button>}
        </div>
        {lines.length === 0 ? (
          <p className="mt-1 text-sm text-ink-2">Nothing missing that this dataset can see.</p>
        ) : (
          <ul className="mt-1">
            {/* A divider above each line, except the first and the lines inside a group. */}
            {lines.map((l, k) =>
              l.door === undefined ? (
                <li key={l.key} className={`pb-0.5 pt-1 text-xs text-ink-3 ${k ? "border-t border-line" : ""}`}>{l.text}</li>
              ) : (
                <li key={l.key} className={`flex items-baseline justify-between gap-3 py-1 text-sm ${l.sub ? "pl-3" : k ? "border-t border-line" : ""}`}>
                  <span className="text-ink-2">{l.text}</span>
                  <span className={`flex-none ${door}`}>{l.door}</span>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
