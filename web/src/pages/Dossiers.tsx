// Dossiers index: one card per candidate atmosphere and one per material or fuel label burned as a
// solid in the PSI tables (labels verbatim, grouped exactly by string). Each card says, from data
// values only, what is known about fire there and what is missing. Filters live in the URL.
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorNote, FuelLegend, Loading, PageHeader } from "../components/Common";
import { Pressure, Value } from "../components/Value";
import {
  type CandidatesFile,
  CountCell,
  dossierStatus,
  type EvidenceFile,
  evidenceHref,
  FUEL_CLASSES,
  FuelName,
  type InvestigationStatsFile,
  isAboutPressure,
  type KeyFindingsFile,
  materialHref,
  MaterialLabel,
  normInv,
  type PrebreatheFile,
  ROLE_LABEL,
  StatusBadge,
  type TestsFile,
  uniq,
} from "../components/dossiersShared";
import { joinPhrases, missingShort } from "../components/dossiersMissing";
import { KIND_VERB, knownSentence, labelCount, type MaterialEntry, materialEntries } from "../components/dossiersMaterials";
import { useData } from "../lib/data";
import type { Candidate, CandidateEvidence } from "../lib/types";

export default function Dossiers() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const inv = sp.get("inv") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    setSp(next, { replace: true });
  };

  const cands = useData<CandidatesFile>("candidates.json");
  const ev = useData<EvidenceFile>("candidate_evidence.json");
  const tests = useData<TestsFile>("tests.json");
  const stats = useData<InvestigationStatsFile>("investigation_stats.json");
  const kf = useData<KeyFindingsFile>("key_findings.json");
  const pb = useData<PrebreatheFile>("prebreathe.json");

  const mats = useMemo(() => (tests.data ? materialEntries(tests.data.tests) : null), [tests.data]);
  const invOptions = useMemo(() => (mats ? uniq(mats.entries.flatMap((e) => e.investigations.map((i) => i.name))) : []), [mats]);

  // Saffire paper materials are listed only when a verified finding names them.
  const paperMaterials = useMemo(() => {
    const out: { label: string; investigation: string; findingId: string }[] = [];
    for (const f of kf.data?.findings ?? []) {
      if (!normInv(f.investigation).startsWith("saffire")) continue;
      for (const m of f.materials ?? []) out.push({ label: m, investigation: f.investigation ?? "", findingId: f.id });
    }
    return out;
  }, [kf.data]);

  const groups = useMemo(() => {
    if (!mats) return [];
    const needle = q.trim().toLowerCase();
    const shown = mats.entries.filter((e) => (!needle || e.label.toLowerCase().includes(needle)) && (!inv || e.investigations.some((i) => i.name === inv)));
    const g = new Map<string, MaterialEntry[]>();
    for (const e of shown) {
      const key = e.investigations.map((i) => i.name).join(" and ");
      g.set(key, [...(g.get(key) ?? []), e]);
    }
    return [...g.entries()];
  }, [mats, q, inv]);

  if (cands.error || ev.error) return <ErrorNote error={cands.error ?? ev.error} />;

  return (
    <>
      <PageHeader
        title="Dossiers"
        lead="One page per candidate atmosphere and per material burned in the PSI experiments. Each card says what the records show about fire there and what is missing. Nothing here is ranked, scored or judged; an empty cell means no tests are recorded, which is unknown, not low risk."
      />

      <section aria-labelledby="cand-h" className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 id="cand-h" className="text-lg font-semibold">Candidate atmospheres</h2>
          <FuelLegend />
        </div>
        {!cands.data || !ev.data ? (
          <Loading what="candidate atmospheres" />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {cands.data.candidates.map((c) => {
              const e = ev.data.evidence.find((x) => x.candidate_id === c.id);
              return e ? <CandidateCard key={c.id} c={c} ev={e} pb={pb.data} kf={kf.data} /> : null;
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="mat-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="mat-h" className="text-lg font-semibold">Materials and fuels</h2>
            <p className="max-w-3xl text-sm text-ink-2">
              Labels exactly as written in the PSI tables for solid-material tests, spelling and spacing included. Similar labels are not merged: merging would be a
              judgement the tables do not make.
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-ink-3">Search labels</span>
              <input
                type="search"
                value={q}
                onChange={(e) => set("q", e.target.value)}
                placeholder="e.g. PMMA"
                className="w-40 rounded border border-line bg-surface-2 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-ink-3">Investigation</span>
              <select value={inv} onChange={(e) => set("inv", e.target.value)} className="rounded border border-line bg-surface-2 px-2 py-1 text-sm">
                <option value="">All</option>
                {invOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>
        </div>

        {!mats ? (
          <Loading what="test records" />
        ) : groups.length === 0 ? (
          <p className="hatch-bg rounded-lg border border-line p-1.5"><span className="block rounded-md bg-surface-2 p-3 text-sm text-ink-2">No material label matches these filters.</span></p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(([key, entries]) => (
              <div key={key}>
                <h3 className="mb-2 text-sm font-semibold text-ink-2">{key}</h3>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {entries.map((e) => <MaterialCard key={e.label} e={e} stats={stats.data} />)}
                </ul>
              </div>
            ))}
          </div>
        )}

        {mats && mats.unlabelled.length > 0 && (
          <p className="mt-4 text-xs text-ink-3">
            Some solid-material tests have no material label in their table and cannot be given a dossier.{" "}
            <Link className="underline" to={evidenceHref(mats.unlabelled)}>Open them in the Evidence Explorer</Link>.
          </p>
        )}

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink-2">Saffire materials from published papers</h3>
          {paperMaterials.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {paperMaterials.map((m) => (
                <li key={`${m.findingId}${m.label}`} className="card p-3 text-sm">
                  <Link className="font-medium underline" to={materialHref(m.label)}><MaterialLabel label={m.label} /></Link>
                  <p className="mt-1 text-xs text-ink-2">Published paper, human verified: {m.investigation} (<span className="mono">{m.findingId}</span>).</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">
              Saffire materials reported only in papers are listed here once a finding naming them has been verified by a team member. None is verified yet
              {kf.data && <> (findings drafted: <Value val={{ v: kf.data.status.drafted, u: "findings", p: kf.data.p }} />)</>}.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function CandidateCard({ c, ev, pb, kf }: { c: Candidate; ev: CandidateEvidence; pb?: PrebreatheFile; kf?: KeyFindingsFile }) {
  const missing = missingShort(c, ev, pb, kf);
  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">
            <Link to={`/dossiers/candidate/${c.id}`} className="underline decoration-line underline-offset-4 hover:decoration-ink">{c.name}</Link>
          </h3>
          <p className="text-xs text-ink-3">{c.short === ROLE_LABEL[c.role] ? ROLE_LABEL[c.role] : `${ROLE_LABEL[c.role]}: ${c.short}`}</p>
        </div>
        <StatusBadge status={dossierStatus(ev)} />
      </div>
      <p className="text-sm text-ink-2">
        {isAboutPressure(c) && "about "}
        <Pressure psi={c.pressure_psi} kpa={c.pressure_kpa} />, <Value val={c.o2_pct} /> O2
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">Tests near {c.name} by fuel class and source type</caption>
        <thead className="text-left text-[11px] text-ink-3">
          <tr>
            <th className="pb-1 font-medium">Near this atmosphere</th>
            <th className="pb-1 font-medium">PSI table</th>
            <th className="pb-1 font-medium">Paper, verified</th>
          </tr>
        </thead>
        <tbody>
          {FUEL_CLASSES.map((f) => (
            <tr key={f} className="border-t border-line">
              <th scope="row" className="py-1 pr-2 text-left text-xs font-normal"><FuelName fuel={f} short /></th>
              <td className="py-1 pr-2"><CountCell val={ev.near[f].psi_table} compact /></td>
              <td className="py-1"><CountCell val={ev.near[f].published_paper} compact /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-2">
        {missing.length > 0 ? <><span className="font-medium text-ink">Missing:</span> {joinPhrases(missing)}.</> : "Each fuel class has tests nearby."}
      </p>
      <Link to={`/dossiers/candidate/${c.id}`} className="mt-auto text-xs text-accent underline">Open dossier</Link>
    </li>
  );
}

function MaterialCard({ e, stats }: { e: MaterialEntry; stats?: InvestigationStatsFile }) {
  const verb = e.kinds.length === 1 ? KIND_VERB[e.kinds[0]] ?? "Tested in" : "Tested in";
  return (
    <li className="card flex flex-col gap-1 p-3">
      <Link to={materialHref(e.label)} className="text-sm font-medium underline decoration-line underline-offset-4 hover:decoration-ink">
        <MaterialLabel label={e.label} />
      </Link>
      <p className="text-xs text-ink-2">
        {verb}{" "}
        {e.investigations.map((i, k) => {
          const n = labelCount(stats, i.id, e.label, e.fields);
          return (
            <span key={i.id}>
              {k > 0 && ", "}
              {i.name}
              {n && <> (<Value val={n} />)</>}
            </span>
          );
        })}
        . {knownSentence(e)}
        {e.fields.includes("fuel") && " Recorded in the fuel column."}
      </p>
    </li>
  );
}
