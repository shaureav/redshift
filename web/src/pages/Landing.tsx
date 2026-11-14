// Landing page, and the first frame of the demo video. The opening statement is built only from
// access_gap.json, every number a <Value>. Then the trade map, the access gap and evidence strips,
// the FLEX suppression results, and the ways in. Map view state lives in the URL (see TradeMapPanel).
import { Link } from "react-router-dom";
import { AccessGap, type AccessGapData } from "../charts/AccessGap";
import { EvidenceStrips } from "../charts/EvidenceStrips";
import { FlexSuppression } from "../charts/FlexSuppression";
import { TradeMapPanel } from "../charts/TradeMapPanel";
import { Value } from "../components/Value";
import { AskPanel } from "../components/AiText";
import { useData } from "../lib/data";

const HIGHLIGHT = "c8_2_34";

function GapStatement({ data }: { data: AccessGapData }) {
  const s = data.psi_steps;
  if (s.length < 4) {
    // The snapshot changed shape: state each step as written rather than guess at the sentence.
    return (
      <>
        {s.map((step, i) => (
          <span key={i}>
            {i > 0 && "; "}
            {step.label.replace(/^\.\.\.\s*/, "")}: <Value val={step.count} unit={false} />
          </span>
        ))}
        .
      </>
    );
  }
  return (
    <>
      PSI&apos;s tables hold <Value val={s[0].count} unit={false} /> solid-fuel burn rows; <Value val={s[1].count} unit={false} /> record oxygen;{" "}
      <Value val={s[2].count} unit={false} /> record pressure; <Value val={s[3].count} unit={false} /> sit near a habitat candidate.
    </>
  );
}

const WAYS_IN = [
  {
    to: "/dossiers",
    title: "Dossiers",
    body: "One page per candidate atmosphere and per material burned: what the records show near it, split by fuel class and source, and what is missing.",
  },
  {
    to: "/investigations",
    title: "Investigations",
    body: "Every PSI combustion investigation: what it burned, at which oxygen and pressure, what its tables record and what they leave blank.",
  },
  {
    to: "/evidence",
    title: "Evidence Explorer",
    body: "Every test row with its source line, raw text, transforms and DOI. Filter, sort, share the view and download what you see.",
  },
];

export default function Landing() {
  const gap = useData<AccessGapData>("access_gap.json");

  return (
    <div className="flex min-w-0 flex-col gap-6 [&>*]:min-w-0">
      <section aria-labelledby="landing-statement" className="pt-1">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-3">Redshift: The Atmosphere Trade Studio</p>
        <h1 id="landing-statement" className="mt-2 max-w-5xl text-[1.6rem] font-semibold leading-snug tracking-tight sm:text-[2rem]">
          {gap.data ? (
            <GapStatement data={gap.data} />
          ) : gap.error ? (
            <span className="text-ink-3">The access gap could not be loaded.</span>
          ) : (
            <span className="text-ink-3">Loading the access gap...</span>
          )}
        </h1>
        <p className="mt-3 max-w-4xl text-lg text-ink-2 sm:text-xl">
          If NASA has already burned fabric in near-Moon-base air, why can&apos;t a researcher download it?
        </p>
        <p className="mt-3 max-w-3xl text-sm text-ink-3">
          A plane, not a score. Redshift places every microgravity fire test it can on one plane of oxygen against cabin
          pressure, split by fuel class and by source, and marks where nothing is recorded. It shows where the evidence is
          and where it is missing; it does not rank atmospheres.
        </p>
      </section>

      <TradeMapPanel height={560} defaults={{ highlight: HIGHLIGHT, zoom: "habitat" }} compact />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <AccessGap />
        <EvidenceStrips highlight={HIGHLIGHT} />
      </div>

      <FlexSuppression />

      <AskPanel />

      <nav aria-label="Explore the evidence" className="grid gap-4 md:grid-cols-3">
        {WAYS_IN.map((w) => (
          <Link key={w.to} to={w.to} className="card group block p-4 transition-colors hover:bg-surface-3">
            <h2 className="flex items-center justify-between text-base font-semibold">
              {w.title}
              <span aria-hidden="true" className="text-ink-3 transition-transform group-hover:translate-x-0.5">
                &rarr;
              </span>
            </h2>
            <p className="mt-1 text-sm text-ink-2">{w.body}</p>
          </Link>
        ))}
      </nav>
    </div>
  );
}
