// Methods: plain-English and technical explanations of every calculation, with equations, the data
// sources and the rules the pipeline keeps. Parameters are read from the snapshot (each with its
// provenance); nothing here computes a displayed number. Which collapsible sections are open lives in
// the URL (?open=...), and each section has an anchor, so a view can be shared.
import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Badge, ErrorNote, FuelMarker, Loading, PageHeader } from "../components/Common";
import { Pressure, Value } from "../components/Value";
import { useData, useProvenance } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import type { DatasetVersion } from "../lib/types";
import {
  type AdaptersFile,
  Callout,
  type CandidateEvidenceFile,
  type CandidatesFile,
  CountCell,
  Eq,
  EqText,
  type FlameGridFile,
  type KeyFindingsFile,
  type ManifestFile,
  param,
  PlannerFormula,
  type PlannerFile,
  type PrebreatheFile,
  PresetWeights,
  type SensitivityFile,
} from "../charts/plannerShared";

const SECTIONS: [string, string][] = [
  ["sources", "Data sources and raw manifest"],
  ["integrity", "Integrity rules"],
  ["transforms", "Allowed transforms"],
  ["adapters", "How each table is read"],
  ["nearness", "Nearness"],
  ["sensitivity", "Sensitivity of the counts"],
  ["flame", "Flame temperature"],
  ["planner", "Test planner"],
  ["prebreathe", "Prebreathe"],
  ["findings", "Paper findings"],
  ["limitations", "Limitations"],
  ["rebuild", "Rebuilding every figure"],
];

// Written out from redshift/transforms.py (ALLOWED). Anything not listed is a flag, not a fix.
const TRANSFORMS: [string, string][] = [
  ["trim", "Remove leading and trailing whitespace."],
  ["empty_to_null", "An empty cell becomes an explicit null, displayed as 'not recorded'."],
  ["parse_number", "Read a plain decimal number (digits, one optional point, optional sign or exponent)."],
  ["strip_stated_unit", "Read '<number> <unit>' when the unit written in the cell is exactly the unit expected for the column (for example '0.75 atm' in a pressure column read as atm)."],
  ["split_number_list", "Read a cell listing plain numbers separated by ';' (for example '21; 26.5; 40') as that list, in the order written. Every element must be a plain number."],
  ["strip_percent_sign", "Remove a single trailing '%' from a number already in percent."],
  ["fraction_to_pct", "Multiply a mole fraction by 100 to give percent."],
  ["mmhg_to_kpa", "Multiply by 101.325/760 (exact definition of the conventional mmHg)."],
  ["atm_to_kpa", "Multiply by 101.325 (exact definition of the standard atmosphere)."],
  ["bar_to_kpa", "Multiply by 100."],
  ["psi_to_kpa", "Multiply by 6.894757293168361."],
  ["kpa_to_psi", "Divide kPa by 6.894757293168361."],
  ["remove_exact_duplicate", "Drop a row that is byte-identical (after CSV parsing) to an earlier row."],
  ["exclude_blank_row", "Drop a row whose every cell is empty."],
  ["decode_cp1252", "Decode the file as Windows-1252 because it is not valid UTF-8."],
  ["strip_bom", "Remove a UTF-8 byte-order mark from the start of the file."],
];

const INTEGRITY: [string, string, string][] = [
  ["Raw files are immutable", "The files downloaded from NASA are never edited.", "Every raw file is listed in the manifest with its SHA-256. The build recomputes each hash and stops if any file is missing or changed."],
  ["Provenance on every value", "Every number on screen can be traced to the file, line, column and raw text it came from, or to the calculation that produced it.", "Each value is written as {v, u, p}: value, unit and a provenance id. A lint step walks every output file and the build fails unless every number carries a provenance id (coverage must be 100%)."],
  ["A fixed list of transforms", "Only a short, named list of mechanical steps (trimming, reading numbers, unit conversions by exact definitions) may turn a raw cell into a clean value.", "Each value's provenance records the transforms applied to it, by name. The list is below and matches redshift/transforms.py."],
  ["Flags, not fixes", "When a cell is odd (for example '~6' or a unit we do not expect), it is flagged and left as it is. Nothing is guessed or filled in.", "The raw string is kept, the clean value is null or unchanged, and a flag with a code, severity and the affected rows goes to the Data Quality page. There is no imputation."],
  ["Paper values are quarantined", "Numbers read from published papers stay out of the evidence until a named person has checked them against the PDF.", "Paper findings are drafted with exact quotes and page numbers, checked automatically, and reach the interface only after a recorded human verification. Until then they are listed as awaiting verification."],
  ["Counts are reproducible", "Anyone can rebuild every count from the raw files and get the same numbers.", "The build is deterministic. Known counts (goldens) are re-checked on every run, and each table's rows are reconciled: rows read equals rows kept plus rows dropped, with reasons."],
  ["The build fails on bad data", "If any of these checks fails, nothing is published.", "A hash mismatch, a number without provenance, an unexplained golden difference or an unbalanced reconciliation makes the build exit with an error and write nothing to the snapshot."],
];

const LIMITATIONS: [string, string][] = [
  ["PSI has no partial-gravity data", "The PSI tests are microgravity experiments. Lunar and Martian gravity are not represented, so nothing here describes fire behaviour at partial gravity."],
  ["Solid tables record no pressure", "None of the solid-material tables has a pressure column, and some (BASS, SAME, SAME-R) record no oxygen either. Their tests can never be counted as near a candidate; those with oxygen appear in the 'pressure not recorded' strip of the Trade Map, as unknown."],
  ["BRE pressures not recorded", "The ACME Burning Rate Emulator table lists the oxygen levels used in each session (a test day of several flames) but no pressure, so its sessions cannot be placed on the plane."],
  ["The FLEX-2 table is a test matrix summary", "Each row names one fuel and the lists or ranges of conditions used with it, not individual tests. Rows are kept because each names a fuel that was burned, but no single oxygen or pressure can be read from a list without choosing one, so those fields are empty and flagged."],
  ["Flame temperature is for stoichiometric methane only", "It is one reference fuel at one mixture ratio. It does not describe solids, droplets or any real cabin material, and explains rather than predicts."],
];

function useOpenSet() {
  const [sp, setSp] = useSearchParams();
  const open = new Set((sp.get("open") ?? "").split(",").filter(Boolean));
  const set = (key: string, on: boolean) => {
    if (open.has(key) === on) return;
    const s = new Set(open);
    if (on) s.add(key);
    else s.delete(key);
    const next = new URLSearchParams(sp);
    if (s.size) next.set("open", [...s].join(","));
    else next.delete("open");
    setSp(next, { replace: true });
  };
  return { isOpen: (k: string) => open.has(k), set };
}

function Collapsible({ id, summary, children, state }: { id: string; summary: ReactNode; children: ReactNode; state: ReturnType<typeof useOpenSet> }) {
  return (
    <details
      className="group rounded-lg border border-line bg-surface-2"
      open={state.isOpen(id)}
      onToggle={(e) => state.set(id, (e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none list-none rounded-lg px-3 py-2 text-sm hover:bg-surface-3 [&::-webkit-details-marker]:hidden">
        <span className="mr-2 inline-block text-ink-3 transition-transform group-open:rotate-90" aria-hidden="true">&#9656;</span>
        {summary}
      </summary>
      <div className="border-t border-line px-3 py-3">{children}</div>
    </details>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-line pt-6">
      <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight">
        <a href={`#${id}`} className="hover:underline">{title}</a>
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function Plain({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-3 px-4 py-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">In plain English</p>
      <div className="text-ink">{children}</div>
    </div>
  );
}

function Tech({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Technical detail</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/** Formatting only: show a parameter with as many decimals as the build wrote. */
function decimalsAsWritten(v: number) {
  return (String(v).split(".")[1] ?? "").length;
}

function humanKey(k: string) {
  return k.replace(/_/g, " ");
}

/** Method parameters of a derived record, loaded from provenance only when the reader opens them. */
function ProvParams({ id, enabled }: { id: string; enabled: boolean }) {
  const { data, isLoading, error } = useProvenance(enabled);
  if (!enabled) return null;
  if (isLoading) return <p className="text-xs text-ink-3">Loading parameters...</p>;
  if (error) return <p className="text-xs">The provenance file could not be loaded.</p>;
  const prov = data?.[id];
  if (!prov) return <p className="text-xs">No provenance record found for <span className="mono">{id}</span>.</p>;
  const params = prov.params ?? {};
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="text-ink-3">method</dt>
      <dd className="mono break-words">{prov.method}{prov.method_version ? ` (version ${prov.method_version})` : ""}</dd>
      {Object.entries(params).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{humanKey(k)}</dt>
          <dd className="break-words">
            <ParamValue v={v} id={id} />
          </dd>
        </div>
      ))}
      <dt className="text-ink-3">provenance id</dt>
      <dd className="mono">{prov.id}</dd>
    </dl>
  );
}

/** One method parameter: numbers through Value, nested records as labelled lists, text as written. */
function ParamValue({ v, id }: { v: unknown; id: string }) {
  if (typeof v === "number") return <Value val={param(v, id)} digits={decimalsAsWritten(v)} />;
  if (typeof v === "string") return <>{v}</>;
  if (Array.isArray(v)) {
    return (
      <>
        {v.map((x, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <ParamValue v={x} id={id} />
          </span>
        ))}
      </>
    );
  }
  if (v && typeof v === "object") {
    return (
      <>
        {Object.entries(v as Record<string, unknown>).map(([k, x], i) => (
          <span key={k}>
            {i > 0 && ", "}
            {humanKey(k)} <ParamValue v={x} id={id} />
          </span>
        ))}
      </>
    );
  }
  return <span className="mono">{String(v)}</span>;
}

/**
 * A pending prebreathe atmosphere is written by the build as text ("10.2 psi / 26.5% O2"). When the text
 * names a candidate atmosphere exactly, show the candidate's own values (psi with kPa, O2) so every number
 * carries its source; otherwise show the text as written.
 */
function PendingAtmosphere({ text, cands }: { text: string; cands: CandidatesFile }) {
  const c = cands.candidates.find((x) => `${x.pressure_psi.v} psi / ${x.o2_pct.v}% O2` === text);
  if (!c) return <>{text}</>;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <Pressure psi={c.pressure_psi} kpa={c.pressure_kpa} />
      <span className="text-ink-3">,</span>
      <span><Value val={c.o2_pct} /> O2</span>
      <span className="text-xs text-ink-3">({c.short})</span>
    </span>
  );
}

function SensitivityTable({ sens, cands }: { sens: SensitivityFile; cands: CandidatesFile }) {
  const names = new Map(cands.candidates.map((c) => [c.id, c]));
  const order = cands.candidates.map((c) => c.id);
  const groups = order.map((id) => ({ id, rows: sens.rows.filter((r) => r.candidate_id === id) })).filter((g) => g.rows.length);
  const classes = ["gas", "droplet", "solid", "emulator"] as const;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Tests near each candidate atmosphere under each nearness variant, by fuel class</caption>
        <thead className="bg-surface-3 text-left text-xs text-ink-3">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Candidate</th>
            <th scope="col" className="px-3 py-2 font-medium">Variant</th>
            {classes.map((f) => (
              <th key={f} scope="col" className="px-3 py-2 font-medium">
                <span className="flex items-center gap-1.5"><FuelMarker fuel={f} /> {FUEL_LABEL[f]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) =>
            g.rows.map((r, i) => (
              <tr key={`${r.candidate_id}-${r.variant}`} className={i === 0 ? "border-t-2 border-line" : "border-t border-line/60"}>
                {i === 0 && (
                  <th scope="rowgroup" rowSpan={g.rows.length} className="bg-surface-2 px-3 py-2 text-left align-top font-medium text-ink">
                    <Link className="underline decoration-ink-3 underline-offset-2" to={`/dossiers/candidate/${g.id}`}>{names.get(g.id)?.short ?? g.id}</Link>
                    {names.get(g.id) && (
                      <span className="mt-0.5 block text-xs font-normal text-ink-2">
                        <Pressure psi={names.get(g.id)!.pressure_psi} kpa={names.get(g.id)!.pressure_kpa} />, <Value val={names.get(g.id)!.o2_pct} /> O2
                      </span>
                    )}
                  </th>
                )}
                <th scope="row" className={`min-w-[11rem] px-3 py-1.5 text-left font-normal ${r.multiplier === 1 && r.target_flow_cm_s === null ? "font-medium text-ink" : "text-ink-2"}`}>
                  {r.variant}
                  {r.multiplier === 1 && r.target_flow_cm_s === null && <span className="ml-1.5 text-xs text-accent">(used elsewhere)</span>}
                </th>
                {classes.map((f) => (
                  <td key={f} className="px-3 py-1.5">
                    <CountCell val={r.counts[f]} />
                  </td>
                ))}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Methods() {
  const state = useOpenSet();
  const location = useLocation();
  const version = useData<DatasetVersion>("dataset_version.json");
  const manifest = useData<ManifestFile>("manifest.json");
  const adapters = useData<AdaptersFile>("adapters.json");
  const ev = useData<CandidateEvidenceFile>("candidate_evidence.json");
  const sens = useData<SensitivityFile>("sensitivity.json");
  const cands = useData<CandidatesFile>("candidates.json");
  const ft = useData<FlameGridFile>("flame_temperature_grid.json");
  const planner = useData<PlannerFile>("planner_grid.json");
  const pb = useData<PrebreatheFile>("prebreathe.json");
  const kf = useData<KeyFindingsFile>("key_findings.json");

  const ready = !!(manifest.data && adapters.data && ev.data && sens.data && cands.data && ft.data && planner.data && pb.data && kf.data);
  useEffect(() => {
    if (!ready || !location.hash) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [ready, location.hash]);

  const firstError = [manifest, adapters, ev, sens, cands, ft, planner, pb, kf].find((q) => q.error)?.error;
  if (firstError) return <ErrorNote error={firstError} />;
  if (!ready) return <Loading what="the methods" />;
  const np = ev.data!.params;
  const nP = ev.data!.p;
  const status = kf.data!.status;

  return (
    <div>
      <PageHeader
        title="Methods"
        lead="How every number in Redshift is read, checked and calculated, first in plain English and then in technical detail. Each parameter below opens its source when selected."
      >
        {version.data && (
          <p className="mt-2 text-xs text-ink-3">
            Dataset version <span className="mono text-ink-2">{version.data.version}</span>, retrieved {version.data.retrieved}.
          </p>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">On this page</p>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-ink-2 hover:text-ink hover:underline">{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 max-w-5xl space-y-8">
          <Section id="sources" title="Data sources and the raw manifest">
            <Plain>
              <p>
                The evidence comes from NASA's Physical Sciences Informatics (PSI) system: the experiment tables of the combustion investigations flown on the International Space Station and earlier platforms, together with each investigation's page. A small set of NASA technical reports adds context and, once a person has checked them, published findings. Every file used is listed below with a fingerprint (SHA-256) so anyone can confirm they have the same bytes.
              </p>
            </Plain>
            <Tech>
              <p>{manifest.data!.note}</p>
              <p>
                Each investigation is cited by its own DOI (see <Link className="underline" to="/about#cite">How to cite</Link>). Licences are recorded per file as the PSI page states them.
              </p>
            </Tech>
            <Collapsible id="manifest" state={state} summary={<span className="font-medium text-ink">Raw manifest: every file with its SHA-256</span>}>
              <div className="max-h-[36rem] overflow-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">Raw data manifest</caption>
                  <thead className="sticky top-0 bg-surface-2 text-left text-ink-3">
                    <tr>
                      <th scope="col" className="py-1 pr-3 font-medium">File</th>
                      <th scope="col" className="py-1 pr-3 font-medium">Investigation</th>
                      <th scope="col" className="py-1 pr-3 font-medium">Licence</th>
                      <th scope="col" className="py-1 pr-3 font-medium">Retrieved</th>
                      <th scope="col" className="py-1 font-medium">SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manifest.data!.files.map((f) => (
                      <tr key={f.file} className="border-t border-line align-top">
                        <td className="mono break-all py-1.5 pr-3 text-ink">
                          {f.source_url.startsWith("http") ? (
                            <a className="underline decoration-ink-3 underline-offset-2" href={f.source_url} target="_blank" rel="noreferrer">{f.file}</a>
                          ) : (
                            f.file
                          )}
                          {!f.source_url.startsWith("http") && <span className="block font-sans text-ink-3">{f.source_url}</span>}
                        </td>
                        <td className="mono py-1.5 pr-3">{f.investigation_id ?? ""}</td>
                        <td className="py-1.5 pr-3">{f.licence}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3">{f.retrieved}</td>
                        <td className="mono break-all py-1.5 text-xs text-ink-2">{f.sha256}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          </Section>

          <Section id="integrity" title="Integrity rules">
            <Plain>
              <p>Seven rules keep the data honest. If any is broken, the build stops and nothing is published.</p>
            </Plain>
            <ol className="space-y-3">
              {INTEGRITY.map(([t, plain, tech], i) => (
                <li key={t} className="rounded-lg border border-line bg-surface-2 p-3">
                  <p className="font-semibold text-ink">
                    <span className="num mr-2 text-ink-3" aria-hidden="true">{i + 1}.</span>
                    {t}
                  </p>
                  <p className="mt-1 text-ink">{plain}</p>
                  <p className="mt-1 text-xs text-ink-2">{tech}</p>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="transforms" title="Allowed transforms">
            <Plain>
              <p>
                These are the only steps allowed between a raw cell and a clean value. Anything else is a flag, not a fix: the raw text is kept and the value is left empty or unchanged. Each value's provenance lists the steps applied to it.
              </p>
            </Plain>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">The fixed list of allowed transforms</caption>
                <thead className="bg-surface-3 text-left text-xs text-ink-3">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Name</th>
                    <th scope="col" className="px-3 py-2 font-medium">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {TRANSFORMS.map(([name, desc]) => (
                    <tr key={name} className="border-t border-line align-top">
                      <th scope="row" className="mono whitespace-nowrap px-3 py-1.5 text-left text-xs font-normal text-ink">{name}</th>
                      <td className="px-3 py-1.5">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-3">The list matches <span className="mono">ALLOWED</span> in <span className="mono">redshift/transforms.py</span>.</p>
          </Section>

          <Section id="adapters" title="How each investigation's table is read">
            <Plain>
              <p>
                Every PSI table has its own column names and conventions, so each investigation has a small adapter written by hand. It maps columns by their exact header text to the shared fields (oxygen, pressure, fuel, outcome and so on), and states which transforms apply. Outcome labels are always kept verbatim.
              </p>
            </Plain>
            <div className="space-y-2">
              {adapters.data!.adapters.map((a) => (
                <Collapsible
                  key={a.investigation_id}
                  id={`adapter:${a.investigation_id}`}
                  state={state}
                  summary={
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <FuelMarker fuel={a.fuel_class} />
                      <span className="font-medium text-ink">{a.folder}</span>
                      <span className="mono text-xs text-ink-3">{a.investigation_id}</span>
                      <span className="text-xs text-ink-3">{FUEL_LABEL[a.fuel_class] ?? a.fuel_class}, {a.test_kind}</span>
                    </span>
                  }
                >
                  <p className="mb-2 text-xs text-ink-3">
                    Tables:{" "}
                    {a.tables.map((t, i) => (
                      <span key={t}>
                        {i > 0 && "; "}
                        <span className="mono break-all text-ink-2">{t}</span>
                      </span>
                    ))}
                  </p>
                  <pre className="mono max-w-full whitespace-pre-wrap break-words text-xs leading-relaxed text-ink">{a.mapping}</pre>
                  <Link className="mt-2 inline-block text-xs underline" to={`/investigations?open=${a.investigation_id}`}>Open this investigation</Link>
                </Collapsible>
              ))}
            </div>
          </Section>

          <Section id="nearness" title="Nearness: which tests count as near an atmosphere">
            <Plain>
              <p>
                A test counts as near a candidate atmosphere when its oxygen and pressure are both close to the candidate's. Closeness is measured in steps: one step is a change of <Value val={param(np.o2_step_pct_points, nP, "percentage points")} /> of oxygen, or a <Value val={param(np.pressure_step_log, nP)} />-fold change in pressure. A test within <Value val={param(np.threshold, nP, "steps")} /> is near. If a test did not record its oxygen or pressure, it is "unknown", never "not near".
              </p>
            </Plain>
            <Tech>
              <Eq label="Distance in steps">
                <var>d</var> = &radic;[ (&Delta;O<sub>2</sub> / <var>s</var><sub>O2</sub>)<sup>2</sup> + ( ln(<var>p</var> / <var>p</var><sub>0</sub>) / ln <var>s</var><sub>p</sub> )<sup>2</sup> + (&Delta;<var>u</var> / <var>s</var><sub>u</sub>)<sup>2</sup> ]
              </Eq>
              <EqText>{`d = sqrt((dO2/${np.o2_step_pct_points})^2 + (ln(p/p0)/ln ${np.pressure_step_log})^2 [+ (du/${np.flow_step_cm_s})^2]); near when d <= ${np.threshold}`}</EqText>
              <p>
                Here &Delta;O<sub>2</sub> is the difference in oxygen (percentage points), <var>p</var> the test pressure and <var>p</var><sub>0</sub> the candidate pressure, and &Delta;<var>u</var> the difference in flow speed. The pressure term uses a logarithm, so the same relative change in pressure counts the same at any pressure. The metric is {np.metric}. When a published paper gives a range (for example of oxygen), the distance is measured to the closest point of the range.
              </p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-line bg-surface-2 p-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <dt className="text-ink-3"><var>s</var><sub>O2</sub>, oxygen step</dt>
                <dd><Value val={param(np.o2_step_pct_points, nP, "percentage points")} /></dd>
                <dt className="text-ink-3"><var>s</var><sub>p</sub>, pressure step (ratio)</dt>
                <dd><Value val={param(np.pressure_step_log, nP)} /></dd>
                <dt className="text-ink-3"><var>s</var><sub>u</sub>, flow step</dt>
                <dd><Value val={param(np.flow_step_cm_s, nP, "cm/s")} /></dd>
                <dt className="text-ink-3"><var>&theta;</var>, threshold</dt>
                <dd><Value val={param(np.threshold, nP, "steps")} /></dd>
                <dt className="text-ink-3">Flow</dt>
                <dd>{np.flow_rule}</dd>
                <dt className="text-ink-3">Missing values</dt>
                <dd>{np.unknown_rule}</dd>
                <dt className="text-ink-3">Oxygen basis counted</dt>
                <dd>{np.o2_basis_counted.map((b) => `"${b}"`).join(", ")}. {np.o2_basis_rule}</dd>
                <dt className="text-ink-3">Judgement</dt>
                <dd>{np.judgement}</dd>
              </dl>
              <p>
                Tests whose oxygen is within the threshold but whose pressure was not recorded are counted separately as "O2 matches, pressure not recorded", using the oxygen term alone: |&Delta;O<sub>2</sub>| / <var>s</var><sub>O2</sub> &le; <var>&theta;</var>.
              </p>
            </Tech>
          </Section>

          <Section id="sensitivity" title="Sensitivity of the nearness counts">
            <Plain>
              <p>
                The step sizes are a judgement, so the counts are repeated with every step made smaller and larger, and once with flow taken into account. If a conclusion holds only at one step size, it should be read with care. Zero is shown hatched as "no tests recorded": an unknown, not a low risk.
              </p>
            </Plain>
            <Tech>
              <p>
                For each multiplier <var>m</var> in{" "}
                {np.sensitivity_multipliers.map((mm, i) => (
                  <span key={mm}>
                    {i > 0 && ", "}
                    <Value val={param(mm, nP)} />
                  </span>
                ))}
                , every step (<var>s</var><sub>O2</sub>, ln <var>s</var><sub>p</sub>, <var>s</var><sub>u</sub>) is multiplied by <var>m</var> while the threshold <var>&theta;</var> stays fixed, so a larger <var>m</var> counts tests further away. The last variant keeps 1x steps and also uses flow where a test records it, against a quiescent target.
              </p>
            </Tech>
            <SensitivityTable sens={sens.data!} cands={cands.data!} />
          </Section>

          <Section id="flame" title="Flame temperature">
            <div className="flex flex-wrap gap-2">
              <Badge tone="teal">Explains, does not predict</Badge>
              <Badge>Derived calculation</Badge>
            </div>
            <Plain>
              <p>
                Flame temperature says how hot a flame of a reference fuel could get in a given atmosphere. More oxygen and less nitrogen mean less gas to heat, so the flame is hotter. It explains part of why oxygen-rich atmospheres burn more vigorously; it does not predict whether a material ignites or how fast a fire spreads.
              </p>
            </Plain>
            <Tech>
              <p>{ft.data!.caption}</p>
              <Eq label="Adiabatic flame temperature: products enthalpy at T ad equals reactants enthalpy at T zero, at constant pressure">
                <var>H</var><sub>products</sub>(<var>T</var><sub>ad</sub>, <var>p</var>) = <var>H</var><sub>reactants</sub>(<var>T</var><sub>0</sub>, <var>p</var>), &nbsp; CH<sub>4</sub> + 2 O<sub>2</sub> + diluent N<sub>2</sub> at &phi; = 1
              </Eq>
              <p>
                The atmosphere is oxygen with nitrogen as the balance. Cantera finds the equilibrium composition and temperature at constant enthalpy and pressure (HP) with the GRI-Mech 3.0 mechanism. The grid behind the map's contour lines is one equilibrium per cell. Contour levels:{" "}
                {ft.data!.isotherms_K.map((t, i) => (
                  <span key={t.p + i}>
                    {i > 0 && ", "}
                    <Value val={t} digits={0} />
                  </span>
                ))}
                . Values above the approximate threshold are written "about", because dissociation dominates there and the result depends strongly on how it is modelled.
              </p>
              <Collapsible id="ft-params" state={state} summary={<span className="font-medium text-ink">Method parameters (from the provenance record)</span>}>
                <ProvParams id={ft.data!.p} enabled={state.isOpen("ft-params")} />
              </Collapsible>
            </Tech>
          </Section>

          <Section id="planner" title="Test planner">
            <Callout title="The planner ranks gaps in the evidence, never atmospheres.">
              Weights, levels and the constant <Value val={param(planner.data!.params.evidence_constant, planner.data!.p)} /> are judgement.
            </Callout>
            <Plain>
              <p>
                The planner asks where one more test would add the most to the evidence near the habitat candidates. It cuts the plane into a grid of oxygen and pressure levels for each material class, counts the tests already near each cell, and gives each cell a priority: high when the cell is close to a habitat candidate, its material class is weighted heavily, and few tests sit near it.
              </p>
            </Plain>
            <Tech>
              <PlannerFormula grid={planner.data!} nearness={np} nearP={nP} />
              <p>
                Grid: oxygen levels{" "}
                {planner.data!.params.o2_levels_pct.map((o, i) => (
                  <span key={o}>
                    {i > 0 && ", "}
                    <Value val={param(o, planner.data!.p, "%")} />
                  </span>
                ))}
                ; pressure levels{" "}
                {planner.data!.params.pressure_levels_psi.map((p, i) => (
                  <span key={p}>
                    {i > 0 && ", "}
                    <Value val={param(p, planner.data!.p, "psi")} />
                  </span>
                ))}
                ; material classes {planner.data!.params.material_classes.join(", ")}.
              </p>
              <PresetWeights grid={planner.data!} />
              <p className="text-xs text-ink-3">{planner.data!.params.judgement}</p>
              <p>
                <Link className="underline" to="/planner">Open the Test Planner</Link>
              </p>
            </Tech>
          </Section>

          <Section id="prebreathe" title="Prebreathe">
            <Plain>
              <p>
                Prebreathe is the time a crew member breathes pure oxygen before a spacewalk to clear nitrogen from the body. Redshift shows only NASA's own published figures, each with its quote and page, and never interpolates between them. A figure appears only after a named team member has checked it against the source.
              </p>
            </Plain>
            <Tech>
              <p>{pb.data!.caveat}</p>
              {pb.data!.points.length === 0 && <p>No prebreathe point is drawn yet. These published figures are found and awaiting human verification:</p>}
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <caption className="sr-only">Prebreathe figures awaiting verification</caption>
                  <thead className="bg-surface-3 text-left text-xs text-ink-3">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Atmosphere</th>
                      <th scope="col" className="px-3 py-2 font-medium">Finding</th>
                      <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pb.data!.pending.map((r) => (
                      <tr key={r.finding_id} className="border-t border-line">
                        <td className="px-3 py-1.5"><PendingAtmosphere text={r.atmosphere} cands={cands.data!} /></td>
                        <td className="mono px-3 py-1.5 text-xs">{r.finding_id}</td>
                        <td className="px-3 py-1.5">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tech>
          </Section>

          <Section id="findings" title="Paper findings">
            <Plain>
              <p>
                Some useful facts are only in published papers, not in the PSI tables. These are drafted with AI help, each with an exact quote and page, checked automatically, and then checked by a named person against the PDF. Only findings that pass both appear anywhere in Redshift.
              </p>
            </Plain>
            <ol className="space-y-2">
              <li className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="font-semibold text-ink">1. AI drafts, with exact quotes</p>
                <p className="mt-1">Each draft names the source PDF, the page, an exact quote, and every number it states together with the words of the quote that state it. Drafts are always marked not verified.</p>
              </li>
              <li className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="font-semibold text-ink">2. Automatic quote check</p>
                <p className="mt-1">
                  Code confirms that the quote occurs verbatim on the stated page of the extracted PDF text (after a short, listed set of typographic normalisations such as ligatures and curly quotes, none of which changes a digit, unit or word), that each number's written form occurs inside the quote, and that the finding uses none of the words the project does not allow in findings. A draft failing any check is rejected and listed on the Data Quality page.
                </p>
              </li>
              <li className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="font-semibold text-ink">3. Named human verification</p>
                <p className="mt-1">
                  A team member runs <code className="mono rounded bg-surface-3 px-1 py-0.5 text-xs text-ink">uv run python scripts/verify_findings.py</code>, opens each PDF at the page, reads the quote and accepts or rejects the finding. Each answer is appended, with the person's name and the time, to <span className="mono text-xs">data/findings/verifications.json</span>; nothing is ever deleted from it.
                </p>
              </li>
            </ol>
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <p className="font-semibold text-ink">Status in this build</p>
              <dl className="mt-1 grid grid-cols-[12rem_minmax(0,1fr)] gap-y-1">
                <dt className="text-ink-3">Drafted</dt>
                <dd><Value val={param(status.drafted, kf.data!.p, "findings")} /></dd>
                <dt className="text-ink-3">Verified</dt>
                <dd>{status.verified.length === 0 ? "none yet: awaiting human verification" : <span className="mono text-xs">{status.verified.join(", ")}</span>}</dd>
                <dt className="text-ink-3">Failed the automatic checks</dt>
                <dd>{status.failed_checks.length === 0 ? "none" : <span className="mono text-xs">{status.failed_checks.join(", ")}</span>}</dd>
                <dt className="text-ink-3">Rejected by a reviewer</dt>
                <dd>{status.rejected_by_reviewer.length === 0 ? "none" : <span className="mono text-xs">{status.rejected_by_reviewer.join(", ")}</span>}</dd>
              </dl>
              {status.awaiting_verification.length > 0 && (
                <div className="mt-2">
                  <Collapsible id="awaiting" state={state} summary={<span className="font-medium text-ink">Findings awaiting human verification</span>}>
                    <ul className="mono columns-1 text-xs text-ink-2 sm:columns-2 lg:columns-3">
                      {status.awaiting_verification.map((id) => <li key={id}>{id}</li>)}
                    </ul>
                  </Collapsible>
                </div>
              )}
            </div>
          </Section>

          <Section id="limitations" title="Limitations">
            <Plain>
              <p>What the data cannot tell you. These limits apply to every screen.</p>
            </Plain>
            <ul className="space-y-2">
              {LIMITATIONS.map(([t, d]) => (
                <li key={t} className="rounded-lg border border-line bg-surface-2 p-3">
                  <p className="font-semibold text-ink">{t}</p>
                  <p className="mt-1">{d}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="rebuild" title="Rebuilding every figure">
            <Plain>
              <p>Every number, chart and table in Redshift is produced by one command from the raw files. Run it from the repository root:</p>
            </Plain>
            <pre className="mono overflow-x-auto rounded-lg border border-line bg-surface-3 px-4 py-3 text-sm text-ink">uv run python -m redshift.build</pre>
            <Tech>
              <p>
                The build verifies the raw hashes, normalises every table through its adapter, runs the science (nearness, sensitivity, flame temperature, planner, prebreathe), checks the goldens and provenance coverage, and only then writes <span className="mono text-xs">data/processed/</span> and the static snapshot this site reads, <span className="mono text-xs">web/public/data/</span>. Any integrity failure exits with an error and writes nothing.
              </p>
              {version.data && (
                <p>
                  This snapshot: version <span className="mono text-xs text-ink">{version.data.version}</span>, content SHA-256 <span className="mono break-all text-xs text-ink">{version.data.content_sha256}</span>.
                </p>
              )}
            </Tech>
          </Section>
        </article>
      </div>
    </div>
  );
}
