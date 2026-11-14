// Candidate dossier: everything the snapshot holds about fire near one candidate atmosphere, split by
// fuel class and source type, with what is missing. Every number is a build value shown via <Value>.
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { DossierEvidenceBars } from "../charts/dossiersEvidenceBars";
import { ErrorNote, Loading, SourceLegend } from "../components/Common";
import { Pressure, ProvDetails, Value } from "../components/Value";
import { missingLong } from "../components/dossiersMissing";
import {
  AwaitingVerification,
  BackLink,
  bibtexFor,
  type CandidatesFile,
  CountCell,
  type DatasetVersionFile,
  dossierStatus,
  downloadText,
  type EvidenceFile,
  evidenceHref,
  ExportButton,
  FindingCard,
  FUEL_CLASSES,
  FuelName,
  investigationByName,
  type InvestigationsFile,
  isAboutPressure,
  type KeyFindingsFile,
  normInv,
  type PrebreatheFile,
  ROLE_LABEL,
  Section,
  StatusBadge,
  STATUS_HELP,
  type TestsFile,
  toCsv,
  uniq,
} from "../components/dossiersShared";
import { useData, useProvenance } from "../lib/data";
import { doiUrl, SOURCE_LABEL } from "../lib/format";
import type { Candidate, CandidateEvidence, Prov, TestRow } from "../lib/types";

const PARAM_LABEL: Record<string, string> = {
  mechanism: "Reaction mechanism",
  fuel: "Fuel",
  equivalence_ratio: "Equivalence ratio",
  equilibrium: "Equilibrium",
  initial_temperature_K: "Initial temperature",
  o2_pct: "Atmosphere O2",
  pressure_psi: "Atmosphere pressure",
  cantera_version: "Cantera version",
  helium_model: "Helium",
  approximate_above_K: "Shown as approximate above",
  approximate_rule: "Why approximate",
};

const PARAM_UNIT: Record<string, string | undefined> = {
  initial_temperature_K: "K",
  approximate_above_K: "K",
  o2_pct: "%",
  pressure_psi: "psi",
};

export default function CandidateDossier() {
  const { id = "" } = useParams();
  const cands = useData<CandidatesFile>("candidates.json");
  const ev = useData<EvidenceFile>("candidate_evidence.json");
  const tests = useData<TestsFile>("tests.json");
  const invs = useData<InvestigationsFile>("investigations.json");
  const kf = useData<KeyFindingsFile>("key_findings.json");
  const pb = useData<PrebreatheFile>("prebreathe.json");
  const dv = useData<DatasetVersionFile>("dataset_version.json");
  const prov = useProvenance();

  const testById = useMemo(() => new Map((tests.data?.tests ?? []).map((t) => [t.test_id, t])), [tests.data]);
  const invByName = useMemo(() => investigationByName(invs.data?.investigations ?? []), [invs.data]);

  const c = cands.data?.candidates.find((x) => x.id === id);
  const e = ev.data?.evidence.find((x) => x.candidate_id === id);
  const domainMax = useMemo(
    () => Math.max(0, ...(ev.data?.evidence ?? []).flatMap((x) => FUEL_CLASSES.flatMap((f) => [x.near[f].psi_table.v, x.near[f].published_paper.v]))),
    [ev.data],
  ); // chart scale only

  if (cands.error || ev.error) return <ErrorNote error={cands.error ?? ev.error} />;
  if (!cands.data || !ev.data) return <Loading what="the dossier" />;
  if (!c || !e) {
    return (
      <div className="card p-6 text-sm">
        <p>No candidate atmosphere has the id <span className="mono">{id}</span>.</p>
        <p className="mt-2"><Link className="underline" to="/dossiers">See all dossiers</Link></p>
      </div>
    );
  }

  const status = dossierStatus(e);
  const nearestInvNames = uniq(e.nearest.map((n) => n.investigation));
  const nearestInvs = nearestInvNames.map((n) => invByName.get(n)).filter((i): i is NonNullable<typeof i> => !!i);
  const sourceProv = prov.data?.[c.source];
  const ftProv = prov.data?.[e.flame_temperature.p];

  const downloadCsv = () => {
    const header = ["dataset_version", "candidate_id", "candidate", "test_id", "investigation", "investigation_id", "fuel_class", "source_type", "distance_steps", "o2_pct", "pressure_psi", "pressure_kpa", "doi", "distance_provenance"];
    const rows = e.nearest.map((n) => {
      const t = testById.get(n.test_id);
      return [
        dv.data?.version ?? "",
        c.id,
        c.name,
        n.test_id,
        n.investigation,
        t?.investigation_id ?? invByName.get(n.investigation)?.id ?? "",
        n.fuel_class,
        n.source_type,
        n.distance.v,
        t?.fields.o2_pct?.v ?? "",
        t?.fields.pressure_psi?.v ?? "",
        t?.fields.pressure_kpa?.v ?? "",
        t?.doi ?? invByName.get(n.investigation)?.doi?.v ?? "",
        n.distance.p,
      ];
    });
    downloadText(`redshift-nearest-tests-${c.id}-${dv.data?.version ?? "snapshot"}.csv`, toCsv(header, rows), "text/csv;charset=utf-8");
  };

  const downloadBib = () => {
    const head = dv.data ? `% ${dv.data.cite}\n% Investigations with tests in the nearest list for ${c.name}.\n\n` : "";
    downloadText(`redshift-${c.id}.bib`, head + bibtexFor(nearestInvs), "application/x-bibtex;charset=utf-8");
  };

  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <BackLink />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Candidate dossier: {ROLE_LABEL[c.role]}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            <p className="mt-1 text-base">
              {isAboutPressure(c) && <span className="text-ink-2">about </span>}
              <Pressure psi={c.pressure_psi} kpa={c.pressure_kpa} />
              <span className="text-ink-3">, </span>
              <Value val={c.o2_pct} /> <span className="text-ink-2">O2</span>
            </p>
            <p className="mt-1 max-w-3xl text-sm text-ink-2">{c.short}. {c.context}</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <ExportButton onClick={() => window.print()}>Print or save as PDF</ExportButton>
            <ExportButton onClick={downloadCsv} label="Download nearest tests as CSV, with dataset version and DOIs">Download nearest tests CSV</ExportButton>
            <ExportButton onClick={downloadBib} label="Download BibTeX for the investigations in the nearest list">BibTeX</ExportButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={status} />
          <span className="text-xs text-ink-3">{STATUS_HELP[status]} Based only on the counts of tests near this atmosphere.</span>
        </div>
        <SourceQuote prov={sourceProv} loading={prov.isLoading} />
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section
            id="evidence"
            title="Evidence near this atmosphere"
            lead={
              <>
                A test counts as near when it lies within <Value val={{ v: ev.data.params.threshold, u: "steps", p: ev.data.p }} /> of this atmosphere, where one step is{" "}
                <Value val={{ v: ev.data.params.o2_step_pct_points, u: "O2 points", p: ev.data.p }} /> or a pressure ratio of{" "}
                <Value val={{ v: ev.data.params.pressure_step_log, p: ev.data.p }} />. {ev.data.params.judgement}
              </>
            }
          >
            <DossierEvidenceBars c={c} ev={e} domainMax={domainMax} />
            <div className="mt-3"><SourceLegend /></div>
          </Section>

          <Section
            id="o2match"
            title="O2 matches, pressure not recorded"
            lead="Tests whose O2 is within reach of this atmosphere but whose table records no pressure. They cannot be judged near or far, so they are counted here and not above."
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              {FUEL_CLASSES.map((f) => (
                <li key={f} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <FuelName fuel={f} />
                  <CountCell val={e.o2_match_pressure_unknown[f]} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">{ev.data.params.unknown_rule}</p>
          </Section>

          <NearestTable c={c} ev={e} testById={testById} invByName={invByName} />

          <FindingsSection c={c} ev={e} kf={kf.data} pb={pb.data} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section id="flame" title="Flame temperature">
            <p className="text-2xl font-semibold">
              <Value val={e.flame_temperature} digits={0} approximate={e.flame_temperature.approximate} />
            </p>
            <p className="mt-1 text-sm text-ink-2">
              <span className="font-medium text-ink">Explains, does not predict.</span> The adiabatic equilibrium temperature of a stoichiometric methane flame in this
              atmosphere: a measure of how hot a flame can get here. It does not predict whether a material ignites, how fast a flame spreads or whether it goes out.
            </p>
            {e.flame_temperature.approximate && (
              <p className="mt-1 text-xs text-ink-2">Shown as approximate: at this temperature dissociation dominates, so the value depends strongly on how it is modelled.</p>
            )}
            <details className="mt-3 rounded-lg border border-line p-3 text-sm">
              <summary className="cursor-pointer font-medium">How this was computed</summary>
              {ftProv ? <FlameMethod prov={ftProv} /> : <p className="mt-2 text-xs text-ink-3">{prov.isLoading ? "Loading the method record..." : "No method record found."}</p>}
            </details>
          </Section>

          <PrebreatheSection c={c} pb={pb.data} />

          <Section id="missing" title="What is missing">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              {missingLong(c, e, pb.data, kf.data, ev.data.params.flow_rule).map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}

function SourceQuote({ prov, loading }: { prov?: Prov; loading: boolean }) {
  if (!prov) return <p className="text-xs text-ink-3">{loading ? "Loading the source of this atmosphere..." : "Source record not found."}</p>;
  return (
    <figure className="card max-w-4xl p-4">
      <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Where this atmosphere comes from</figcaption>
      {prov.quote && (
        <blockquote className="border-l-2 border-accent pl-3 text-sm">
          <q className="italic">{prov.quote}</q>
        </blockquote>
      )}
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        <div><dt className="inline text-ink-3">Source: </dt><dd className="inline">{SOURCE_LABEL[prov.source_type] ?? prov.source_type}</dd></div>
        {prov.file && <div className="min-w-0"><dt className="inline text-ink-3">File: </dt><dd className="mono inline break-all">{prov.file}</dd></div>}
        {prov.row !== undefined && <div><dt className="inline text-ink-3">Line: </dt><dd className="inline"><Value val={{ v: prov.row, p: prov.id }} unit={false} /></dd></div>}
        {prov.investigation_id && (
          <div><dt className="inline text-ink-3">Investigation: </dt><dd className="inline"><Link className="underline" to={`/investigations?open=${prov.investigation_id}`}>{prov.investigation_id}</Link></dd></div>
        )}
        {prov.doi && <div><dt className="inline text-ink-3">DOI: </dt><dd className="inline"><a className="mono underline" href={doiUrl(prov.doi)} target="_blank" rel="noreferrer">{prov.doi}</a></dd></div>}
      </dl>
      {prov.note && <p className="mt-1 text-xs text-ink-3">{prov.note}</p>}
    </figure>
  );
}

function NearestTable({ c, ev, testById, invByName }: { c: Candidate; ev: CandidateEvidence; testById: Map<string, TestRow>; invByName: ReturnType<typeof investigationByName> }) {
  return (
    <Section
      id="nearest"
      title="Nearest tests"
      lead="Closest first, as listed by the build. Distance is in steps on the oxygen and log-pressure plane; it is a measure of similarity of conditions, not of outcome."
      aside={
        ev.nearest.length > 0 ? (
          <Link className="no-print text-xs text-accent underline" to={evidenceHref(ev.nearest.map((n) => n.test_id))}>
            Open these in the Evidence Explorer
          </Link>
        ) : undefined
      }
    >
      {ev.nearest.length === 0 ? (
        <div className="hatch-bg rounded-lg border border-line p-0.5">
          <p className="rounded-md bg-surface-2/95 p-3 text-sm text-ink-2">No tests recorded near {c.name}: the build lists no nearest tests for this atmosphere.</p>
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Nearest tests to {c.name}</caption>
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="py-1 pr-3 font-medium">Test</th>
                <th className="pr-3 font-medium">Investigation</th>
                <th className="pr-3 font-medium">Fuel class</th>
                <th className="pr-3 font-medium">Source</th>
                <th className="pr-3 font-medium">O2</th>
                <th className="pr-3 font-medium">Pressure</th>
                <th className="text-right font-medium">Distance</th>
              </tr>
            </thead>
            <tbody>
              {ev.nearest.map((n) => {
                const t = testById.get(n.test_id);
                const inv = invByName.get(n.investigation);
                return (
                  <tr key={n.test_id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3">
                      <Link className="mono text-xs underline" to={evidenceHref([n.test_id])}>{n.test_id}</Link>
                    </td>
                    <td className="py-1.5 pr-3">
                      {inv ? <Link className="underline decoration-line" to={`/investigations?open=${inv.id}`}>{n.investigation}</Link> : n.investigation}
                    </td>
                    <td className="py-1.5 pr-3"><FuelName fuel={n.fuel_class} short /></td>
                    <td className="py-1.5 pr-3 text-xs text-ink-2">{n.source_type === "published_paper" ? "Published paper, verified" : "PSI table"}</td>
                    <td className="py-1.5 pr-3">{t ? <Value val={t.fields.o2_pct} /> : <span className="text-ink-3">see source</span>}</td>
                    <td className="py-1.5 pr-3">{t ? <Pressure psi={t.fields.pressure_psi} kpa={t.fields.pressure_kpa} /> : <span className="text-ink-3">see source</span>}</td>
                    <td className="py-1.5 text-right"><Value val={n.distance} digits={2} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function FlameMethod({ prov }: { prov: Prov }) {
  const params = prov.params ?? {};
  const keys = Object.keys(PARAM_LABEL).filter((k) => k in params);
  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      <p>
        Method <span className="mono">{prov.method}</span>
        {prov.method_version && <> (version {prov.method_version})</>}: Cantera equilibrium at constant enthalpy and pressure, for a stoichiometric mixture of
        the fuel below with this atmosphere.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {keys.map((k) => {
          const v = params[k];
          return (
            <div key={k} className="contents">
              <dt className="text-ink-3">{PARAM_LABEL[k]}</dt>
              <dd>
                {typeof v === "number" ? (
                  <Value val={{ v, u: PARAM_UNIT[k], p: prov.id }} />
                ) : (
                  <span className={k === "mechanism" || k === "cantera_version" ? "mono" : ""}>{String(v)}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {prov.note && <p className="text-ink-2">{prov.note}</p>}
      <details>
        <summary className="cursor-pointer text-ink-3">Full provenance record</summary>
        <div className="mt-1"><ProvDetails prov={prov} /></div>
      </details>
    </div>
  );
}

function PrebreatheSection({ c, pb }: { c: Candidate; pb?: PrebreatheFile }) {
  const point = pb?.points.find((p) => p.atmosphere === c.name);
  const pending = pb?.pending.find((p) => p.atmosphere === c.name);
  return (
    <Section id="prebreathe" title="Prebreathe">
      {!pb ? (
        <Loading what="prebreathe" />
      ) : point ? (
        <div className="text-sm">
          <p className="text-lg font-semibold"><Value val={{ v: point.duration_text, p: point.p }} /></p>
          <blockquote className="mt-2 border-l-2 border-[color:var(--prebreathe)] pl-3 text-ink-2">
            <q className="italic">{point.quote}</q>
            <footer className="mt-1 text-xs text-ink-3">
              Page <Value val={{ v: point.page, p: point.p }} unit={false} />
              {point.ntrs_id && <>, NTRS <span className="mono">{point.ntrs_id}</span></>}
            </footer>
          </blockquote>
        </div>
      ) : pending ? (
        <div className="hatch-bg rounded-lg border border-line p-0.5">
          <p className="rounded-md bg-surface-2/95 p-3 text-sm text-ink-2">
            <span className="font-medium text-ink">Not shown yet:</span> {pending.status}. Finding <span className="mono">{pending.finding_id}</span>.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-2">No published prebreathe figure for this atmosphere is in the snapshot.</p>
      )}
      {pb && <p className="mt-2 text-xs text-ink-3">{pb.caveat}</p>}
    </Section>
  );
}

function FindingsSection({ c, ev, kf, pb }: { c: Candidate; ev: CandidateEvidence; kf?: KeyFindingsFile; pb?: PrebreatheFile }) {
  const invKeys = new Set(ev.nearest.map((n) => normInv(n.investigation)));
  const relevant = (kf?.findings ?? []).filter(
    (f) => f.kind === "candidate_atmosphere" || f.kind === "prebreathe" || invKeys.has(normInv(f.investigation)),
  );
  const pendingIds = (pb?.pending ?? []).filter((p) => p.atmosphere === c.name).map((p) => p.finding_id);
  return (
    <Section
      id="findings"
      title="Verified paper findings"
      lead="Findings about candidate atmospheres and prebreathe, and findings from the investigations in the nearest list. Each quote has been checked against the PDF by a named team member."
    >
      {!kf ? (
        <Loading what="paper findings" />
      ) : kf.findings.length === 0 ? (
        <AwaitingVerification kf={kf} pendingIds={pendingIds} />
      ) : relevant.length === 0 ? (
        <p className="text-sm text-ink-2">No verified finding concerns this atmosphere or the investigations near it yet.</p>
      ) : (
        <div className="flex flex-col gap-3">{relevant.map((f) => <FindingCard key={f.id} f={f} />)}</div>
      )}
    </Section>
  );
}
