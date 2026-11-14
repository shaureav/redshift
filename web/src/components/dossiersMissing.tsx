// "What is missing" for a candidate atmosphere: wording generated from zero counts and absent data.
// Counts that appear are the build's own values via <Value>; nothing here adds or compares magnitudes.
import type { ReactNode } from "react";
import { Value } from "./Value";
import { anyNear, FUEL_CLASSES, type KeyFindingsFile, type PrebreatheFile } from "./dossiersShared";
import { FUEL_LABEL } from "../lib/format";
import type { Candidate, CandidateEvidence } from "../lib/types";

const CLASS_PHRASE: Record<string, string> = {
  gas: "gas-flame",
  droplet: "droplet",
  solid: "solid-material",
  emulator: "solid-emulator (BRE)",
};

/** Short phrases for a dossier card: "Missing: a, b and c." */
export function missingShort(c: Candidate, ev: CandidateEvidence, pb?: PrebreatheFile, kf?: KeyFindingsFile): string[] {
  const out: string[] = [];
  const noneAt = FUEL_CLASSES.filter((f) => !anyNear(ev.near[f]));
  if (noneAt.length === FUEL_CLASSES.length) out.push("any test within the nearness region");
  else if (noneAt.includes("solid")) out.push("solid-material tests nearby");
  if (FUEL_CLASSES.every((f) => ev.near[f].published_paper.v === 0)) out.push("verified paper results nearby");
  if (pb && c.role !== "suit" && !pb.points.some((p) => p.atmosphere === c.name)) {
    out.push(pb.pending.some((p) => p.atmosphere === c.name) ? "a verified prebreathe figure" : "a published prebreathe figure");
  }
  if (kf && kf.findings.length === 0 && out.length === 0) out.push("verified paper findings");
  return out;
}

export function joinPhrases(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** The full list for section 7 of a candidate dossier. */
export function missingLong(c: Candidate, ev: CandidateEvidence, pb: PrebreatheFile | undefined, kf: KeyFindingsFile | undefined, flowRule?: string): ReactNode[] {
  const items: ReactNode[] = [];
  for (const f of FUEL_CLASSES) {
    if (!anyNear(ev.near[f])) items.push(<>No {CLASS_PHRASE[f]} tests recorded within the nearness region.</>);
  }
  if (FUEL_CLASSES.every((f) => ev.near[f].published_paper.v === 0)) {
    items.push(<>No human-verified paper results counted near this atmosphere yet. Paper results are counted once a named team member has checked them against the PDF.</>);
  }
  if (!anyNear(ev.near.solid)) {
    if (ev.o2_match_pressure_unknown.solid.v > 0) {
      items.push(
        <>
          Solid-material tests with a matching O2 exist (<Value val={ev.o2_match_pressure_unknown.solid} />) but their pressure was not recorded, so they cannot be
          judged near this atmosphere.
        </>,
      );
    } else {
      items.push(<>No solid-material test with a matching O2 is recorded either, with or without pressure.</>);
    }
  }
  for (const f of FUEL_CLASSES) {
    if (f !== "solid" && !anyNear(ev.near[f]) && ev.o2_match_pressure_unknown[f].v > 0) {
      items.push(
        <>
          {FUEL_LABEL[f]} tests with a matching O2 but no recorded pressure: <Value val={ev.o2_match_pressure_unknown[f]} />.
        </>,
      );
    }
  }
  if (ev.unknown.unknown_pressure?.v || ev.unknown.unknown_both?.v || ev.unknown.unknown_o2?.v) {
    items.push(
      <>
        Across the database, nearness is unknown (not "not near") for tests with no recorded pressure (<Value val={ev.unknown.unknown_pressure} />), no recorded O2 (
        <Value val={ev.unknown.unknown_o2} />) or neither (<Value val={ev.unknown.unknown_both} />).
      </>,
    );
  }
  if (ev.unknown.basis_differs?.v) {
    items.push(
      <>
        Tests whose O2 is recorded on another basis, such as the oxidiser stream of an inverse flame, are reported separately and not counted as near (
        <Value val={ev.unknown.basis_differs} />).
      </>,
    );
  }
  if (ev.nearest.length === 0) items.push(<>The build lists no nearest tests for this atmosphere.</>);
  if (ev.flame_temperature.approximate) {
    items.push(<>The flame temperature here is approximate: above the build's threshold, dissociation dominates and the value depends on how it is modelled.</>);
  }
  if (pb && c.role !== "suit" && !pb.points.some((p) => p.atmosphere === c.name)) {
    items.push(
      pb.pending.some((p) => p.atmosphere === c.name)
        ? <>A published prebreathe figure has been found for this atmosphere and is awaiting human verification.</>
        : <>No published prebreathe figure for this atmosphere is in the snapshot.</>,
    );
  }
  if (kf && kf.findings.length === 0) items.push(<>No paper findings have been verified yet, so none can be shown here.</>);
  if (flowRule) items.push(<>Airflow: {flowRule}</>);
  return items;
}
