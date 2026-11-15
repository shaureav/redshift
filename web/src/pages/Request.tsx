// The data request (docs/DECISIONS.md D39): the access gap turned into an ask NASA could act on. Every count is
// the build's (access_gap.json) and opens its source; the tables named are PSI's solid-fuel investigations with
// their DOIs; the atmospheres are the candidates the plane pins. It asks for data to be published, never for an
// atmosphere to be chosen. Printable, so it can travel as a page.
import { Link } from "react-router-dom";
import type { AccessGapData } from "../charts/AccessGap";
import { ErrorNote, Loading, PageHeader } from "../components/Common";
import { Value } from "../components/Value";
import { useData } from "../lib/data";
import { doiUrl, ntrsUrl } from "../lib/format";
import type { Candidate, Investigation, Val } from "../lib/types";

type Inv = Investigation & { fuel_class?: Val<string> | null; has_table?: boolean };

// Published papers that describe solid burns near these atmospheres (Saffire V and VI; IV ran at sea-level pressure).
const PAPERS: { ntrs: string; title: string }[] = [
  { ntrs: "20210011521", title: "Fire Safety Implications of Preliminary Results from Saffire IV and V Experiments on Large Scale Spacecraft Fires (Urban et al., ICES 2021)" },
  { ntrs: "20240002981", title: "Preliminary Results from the Saffire VI Experiment (Urban et al., ICES 2024)" },
];

export default function Request() {
  const gap = useData<AccessGapData>("access_gap.json");
  const inv = useData<{ investigations: Inv[] }>("investigations.json");
  const cands = useData<{ candidates: Candidate[] }>("candidates.json");
  const err = gap.error ?? inv.error ?? cands.error;
  if (err) return <ErrorNote error={err} />;
  if (!gap.data || !inv.data || !cands.data) return <Loading what="the data request" />;
  const [rows, withO2, withP, near] = gap.data.psi_steps;
  const solids = inv.data.investigations.filter((i) => i.fuel_class?.v === "solid" && i.has_table);
  // Beside Earth's sea-level air, the lower-pressure options the plane pins (the suit point is not a cabin).
  const options = cands.data.candidates.filter((c) => c.role !== "suit" && c.pressure_psi.v < 14.7);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 print:py-0 lg:px-6">
      <PageHeader
        title="A data request to NASA Physical Sciences Informatics"
        lead="Drafted from Redshift's build. It asks for existing results to be published as downloadable rows. It does not ask for, or suggest, a choice of atmosphere."
      >
        <div className="mt-4 flex gap-2 print:hidden">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
          <Link className="btn" to="/?view=gap">See the access gap</Link>
        </div>
      </PageHeader>

      <section className="space-y-3 text-sm">
        <h2 className="text-base font-semibold">What we found</h2>
        <p>
          PSI&apos;s experiment tables hold <Value val={rows.count} unit={false} /> solid-fuel burn rows. <Value val={withO2.count} unit={false} /> of them record oxygen, <Value val={withP.count} unit={false} /> record pressure, and so <Value val={near.count} unit={false} /> can be placed near a candidate Moon-base atmosphere as downloadable rows.
        </p>
        <p>
          NASA has burned solid materials near these atmospheres: by NASA's own papers (cited below), the Saffire V and VI experiments ran at reduced pressure with raised oxygen, and their results are published there. They are not available as rows a researcher can download, filter and cite.
        </p>

        <h2 className="pt-3 text-base font-semibold">What we ask</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Add the ambient pressure, and the oxygen where it is missing, to each solid-fuel table below, as recorded for each test.</li>
          <li>Publish the Saffire IV, V and VI test conditions and results (sample, ambient pressure, oxygen, flow, outcome) as a downloadable PSI table.</li>
          <li>Where a condition was not recorded, say so in the table, so that unknown is never read as zero.</li>
        </ol>

        <h2 className="pt-3 text-base font-semibold">The tables this concerns</h2>
        <ul className="space-y-1">
          {solids.map((i) => (
            <li key={i.id}>
              <span className="font-medium">{i.acronym?.v ?? i.id}</span>{i.title?.v ? `: ${i.title.v}` : ""}
              {i.doi?.v && <> (<a className="underline underline-offset-2" href={doiUrl(i.doi.v)} target="_blank" rel="noreferrer">doi:{i.doi.v}</a>)</>}
            </li>
          ))}
        </ul>

        <h2 className="pt-3 text-base font-semibold">The papers whose burns are not yet data</h2>
        <ul className="space-y-1">
          {PAPERS.map((p) => (
            <li key={p.ntrs}>{p.title} (<a className="underline underline-offset-2" href={ntrsUrl(p.ntrs)} target="_blank" rel="noreferrer">NTRS {p.ntrs}</a>)</li>
          ))}
        </ul>

        <h2 className="pt-3 text-base font-semibold">Why it matters now</h2>
        <p>
          NASA has not chosen the Moon-base cabin atmosphere. Beside Earth&apos;s sea-level air, the plane pins{" "}
          {options.map((c, k) => (
            <span key={c.id}>
              {k > 0 && (k === options.length - 1 ? " and " : ", ")}
              <Value val={c.pressure_psi} /> with <Value val={c.o2_pct} /> oxygen{c.role === "scenario" ? " (the challenge statement's scenario)" : ""}
            </span>
          ))}
          . Each lower-pressure, higher-oxygen option shortens the prebreathe before a spacewalk and changes how materials burn. Published rows would let anyone place NASA&apos;s own solid burns beside these options and see what is known and what is not.
        </p>
        <p className="pt-3 text-xs text-ink-3">
          Generated by Redshift from NASA PSI data (each investigation cited by its DOI). Counts open their sources on screen; the full method is on the <Link className="underline underline-offset-2" to="/methods">Methods</Link> page.
        </p>
      </section>
    </article>
  );
}
