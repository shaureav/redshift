// About: the team, the AI disclosure, licences, how to cite and the references. Licences, DOIs and the
// citation text come from the snapshot (investigations.json, dataset_version.json).
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AiLabel, ErrorNote, Loading, PageHeader } from "../components/Common";
import { Value } from "../components/Value";
import { useData } from "../lib/data";
import { doiUrl, ntrsUrl } from "../lib/format";
import type { DatasetVersion, Investigation, Val } from "../lib/types";
import { Callout } from "../charts/plannerShared";

interface InvestigationsFile {
  p: string;
  investigations: (Investigation & { licence?: Val<string | null> | null; has_table?: boolean })[];
}

// NASA Technical Reports Server documents used for context and for paper findings.
const NTRS_DOCS: { id: string; title: string; who: string; year: string; venue: string }[] = [
  { id: "20240002981", title: "Preliminary Results from the Saffire VI Experiment", who: "Urban, D. L., et al.", year: "2024", venue: "53rd International Conference on Environmental Systems" },
  { id: "20210011521", title: "Fire Safety Implications of Preliminary Results from Saffire IV and V Experiments on Large Scale Spacecraft Fires", who: "Urban, D. L., et al.", year: "2021", venue: "50th International Conference on Environmental Systems" },
  { id: "20220011152", title: "Open Atmospheres Forum: Exploration Atmospheres Validation Study", who: "Garbino, A., et al.", year: "2022", venue: "Open Atmospheres Forum (presentation)" },
  { id: "20220009536", title: "Validation of Decompression Sickness Risk Mitigation Protocols for Planetary Spaceflight Missions", who: "Abercromby, A. F. J., et al.", year: "2022", venue: "International Conference in Aerospace Medicine (ICAM2022)" },
  { id: "20240003211", title: "Moon to Mars (M2M): Exploration Atmosphere", who: "Walton, M., and Norcross, J.", year: "2024", venue: "Trilateral Safety and Mission Assurance Conference (presentation; abstract only)" },
  { id: "20220013669", title: "Internal Layout of a Lunar Surface Habitat", who: "Burke, C., Howard, R. L., Jr, and Kessler, P.", year: "2022", venue: "ASCEND 2022" },
  { id: "20210021781", title: "Recent Research on Flames of Gaseous Fuel Aboard the International Space Station", who: "Stocker, D. P.", year: "2021", venue: "33rd Japanese Conference on Microgravity Science and Application" },
  { id: "20170009141", title: "Emulation of Condensed Fuel Flames Using a Burning Rate Emulator (BRE) in Microgravity", who: "Markan, A., et al.", year: "2017", venue: "U.S. National Combustion Meeting" },
  { id: "20150023456", title: "Detailed Results from the Flame Extinguishment Experiment (FLEX) March 2009 to December 2011", who: "Dietrich, D. L., et al.", year: "2015", venue: "NASA Technical Publication" },
  { id: "20210022617", title: "Isolated Single Droplet Combustion: FLEX Experiments onboard the International Space Station", who: "Nayagam, V., et al.", year: "2021", venue: "33rd Academic Lecture Meeting of the Japan Society of Microgravity Application (presentation)" },
];

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card p-5">
      <h2 id={`${id}-h`} className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-sm text-ink-2">{children}</div>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 2000);
          },
          () => setDone(false),
        );
      }}
    >
      <span aria-live="polite">{done ? "Copied" : "Copy citation"}</span>
    </button>
  );
}

export default function About() {
  const version = useData<DatasetVersion>("dataset_version.json");
  const inv = useData<InvestigationsFile>("investigations.json");

  if (version.error) return <ErrorNote error={version.error} />;
  if (inv.error) return <ErrorNote error={inv.error} />;
  if (!version.data || !inv.data) return <Loading what="the about page" />;

  const withDoi = inv.data.investigations.filter((i) => i.doi && i.doi.v);
  const noLicence = withDoi.filter((i) => i.licence?.v === "not shown");
  const v = version.data;

  return (
    <div className="max-w-5xl">
      <img src="/logo.webp" alt="Project Redshift logo" width={144} height={144} className="mb-6 h-36 w-36 rounded-xl" />
      <PageHeader title="About Redshift" lead="Redshift: The Atmosphere Trade Studio is an entry to the NASA Space Apps Challenge 2026. It brings together the microgravity fire evidence near candidate habitat atmospheres so an engineer can see what is known, what is missing and what could be tested." />

      <div className="mb-5">
        <Callout title="Redshift informs a decision; it does not recommend an atmosphere.">
          It shows the evidence on a plane of oxygen and pressure, split by fuel class and by source, with the gaps marked. Choosing an atmosphere is a decision for the people responsible for it.
        </Callout>
      </div>

      <div className="grid gap-5">
        <Block id="team" title="The team">
          <p>Redshift is built by Project Redshift, a team of four. Names are not shown here.</p>
          <p>The idea is the team's own: treat the choice of cabin atmosphere as a trade study on a plane, not a score, and put every piece of fire evidence on that plane with its source.</p>
        </Block>

        <Block id="ai" title="Use of AI">
          <p>We used AI tools throughout, and say exactly where:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><span className="font-medium text-ink">Code.</span> Much of the code for this site and the data pipeline was written with AI assistance and reviewed, tested and run by the team.</li>
            <li><span className="font-medium text-ink">Pipeline.</span> The adapters that read each PSI table, the integrity checks and the science modules were drafted with AI help. Every rule they apply is written out on the <Link className="underline" to="/methods">Methods</Link> page, and the build refuses to publish if a check fails.</li>
            <li><span className="font-medium text-ink">Draft text.</span> Explanatory text, including this page, was drafted with AI help and edited by the team.</li>
            <li><span className="font-medium text-ink">Paper findings.</span> Findings from published papers are drafted with AI, each with an exact quote and page. Code checks that the quote is on that page, and a named team member checks it against the PDF. Only findings that pass both appear in the app.</li>
            <li>
              <span className="font-medium text-ink">Summaries and cached answers.</span> Short texts written with AI are labelled <AiLabel />. They are templates that may not contain a number of their own: every number is filled in from the published data, with its source. Code rejects a template with a bare number, an unresolved value, an unknown id or wording that recommends an atmosphere, and a named team member then reads each text against the data.
            </li>
          </ul>
          <p>No number in Redshift is written by AI. Every value comes from a NASA table, a verified quote or a documented calculation, and its source opens when it is selected.</p>
        </Block>

        <Block id="licences" title="Licences">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><span className="font-medium text-ink">Code:</span> MIT licence (see the LICENSE file in the repository).</li>
            <li>
              <span className="font-medium text-ink">PSI data:</span> Creative Commons Zero v1.0 Universal (CC0-1.0), as each PSI investigation page states, except where shown below.
            </li>
            <li><span className="font-medium text-ink">NASA technical reports:</span> cited by NTRS id; short quotes are used only to support verified findings.</li>
          </ul>
          {noLicence.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-3 p-3">
              <p className="font-medium text-ink">Investigations whose PSI page shows no licence</p>
              <ul className="mt-1 space-y-0.5">
                {noLicence.map((i) => (
                  <li key={i.id}>
                    {i.acronym?.v ?? i.id} <span className="mono text-xs text-ink-3">{i.id}</span>: licence <Value val={i.licence ?? null} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink hover:bg-surface-3">Licence of every investigation, as its PSI page states it</summary>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">Licence per investigation</caption>
                <thead className="text-left text-xs text-ink-3">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 font-medium">Investigation</th>
                    <th scope="col" className="px-3 py-1.5 font-medium">Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {withDoi.map((i) => (
                    <tr key={i.id} className="border-t border-line">
                      <td className="px-3 py-1.5">{i.acronym?.v ?? i.id} <span className="mono text-xs text-ink-3">{i.id}</span></td>
                      <td className="px-3 py-1.5"><Value val={i.licence ?? null} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Block>

        <Block id="cite" title="How to cite">
          <p>Cite the dataset version you used, and each investigation by its DOI.</p>
          <figure className="rounded-lg border border-line bg-surface-3 p-3">
            <blockquote className="text-ink">{v.cite}</blockquote>
            <figcaption className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-3">
              <span>Version <span className="mono text-ink-2">{v.version}</span></span>
              <span>Retrieved {v.retrieved}</span>
              <CopyButton text={v.cite} />
            </figcaption>
          </figure>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Investigation DOIs</caption>
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Investigation</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Title</th>
                  <th scope="col" className="py-1.5 font-medium">DOI</th>
                </tr>
              </thead>
              <tbody>
                {withDoi.map((i) => (
                  <tr key={i.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap py-1.5 pr-3">
                      <Link className="underline decoration-ink-3 underline-offset-2" to={`/investigations?open=${i.id}`}>{i.acronym?.v ?? i.id}</Link>
                    </td>
                    <td className="py-1.5 pr-3">{i.title?.v ?? ""}</td>
                    <td className="py-1.5">
                      <a className="mono break-all text-xs underline decoration-ink-3 underline-offset-2" href={doiUrl(i.doi?.v)} target="_blank" rel="noreferrer">{i.doi?.v}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-3">Investigations found in the PSI search without an experiment table or DOI are listed on the <Link className="underline" to="/investigations">Investigations</Link> page.</p>
        </Block>

        <Block id="references" title="References">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              NASA Physical Sciences Informatics (PSI) system, combustion investigations and experiment tables.{" "}
              <a className="underline" href="https://psi.nasa.gov/" target="_blank" rel="noreferrer">psi.nasa.gov</a>. Each investigation is cited by its DOI above.
            </li>
            {NTRS_DOCS.map((d) => (
              <li key={d.id}>
                {d.who} ({d.year}). <span className="italic text-ink">{d.title}</span>. {d.venue}. NTRS{" "}
                <a className="mono text-xs underline" href={ntrsUrl(d.id)} target="_blank" rel="noreferrer">{d.id}</a>.
              </li>
            ))}
            <li>
              Goodwin, D. G., Speth, R. L., Moffat, H. K., and Weber, B. W. Cantera: an object-oriented software toolkit for chemical kinetics, thermodynamics and transport processes.{" "}
              <a className="underline" href="https://cantera.org/" target="_blank" rel="noreferrer">cantera.org</a>. The version used is recorded in the provenance of every flame temperature.
            </li>
            <li>
              Smith, G. P., Golden, D. M., Frenklach, M., et al. GRI-Mech 3.0.{" "}
              <a className="underline" href="http://combustion.berkeley.edu/gri-mech/" target="_blank" rel="noreferrer">combustion.berkeley.edu/gri-mech</a>.
            </li>
            <li>
              NASA Space Apps Challenge 2026.{" "}
              <a className="underline" href="https://www.spaceappschallenge.org/" target="_blank" rel="noreferrer">spaceappschallenge.org</a>.
            </li>
          </ol>
        </Block>

        <p className="pb-4 text-sm font-medium text-ink">Redshift informs a decision; it does not recommend an atmosphere.</p>
      </div>
    </div>
  );
}
