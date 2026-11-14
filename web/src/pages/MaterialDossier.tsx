// Material dossier: where one material label (verbatim from the PSI tables) has been tested, the
// counts by investigation (from investigation_stats.json), its tests, and verified paper findings.
import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MaterialMap, materialMapMode } from "../charts/dossiersMaterialMap";
import { ErrorNote, FuelLegend, Loading } from "../components/Common";
import { Pressure, Value } from "../components/Value";
import { knownSentence, labelCount, materialEntries } from "../components/dossiersMaterials";
import {
  AwaitingVerification,
  BackLink,
  type CandidatesFile,
  evidenceHref,
  ExportButton,
  FindingCard,
  type InvestigationStatsFile,
  type KeyFindingsFile,
  MaterialLabel,
  normInv,
  Section,
  type TestsFile,
} from "../components/dossiersShared";
import { useData } from "../lib/data";
import type { TestRow } from "../lib/types";

type SortKey = "id" | "o2" | "date" | "investigation";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "investigation", label: "Investigation" },
  { key: "o2", label: "O2" },
  { key: "date", label: "Date" },
  { key: "id", label: "Test id" },
];

function sortTests(ts: TestRow[], key: SortKey): TestRow[] {
  const out = [...ts];
  const str = (t: TestRow) =>
    key === "date" ? String(t.fields.test_date?.v ?? "") : key === "id" ? t.test_id : key === "investigation" ? `${t.investigation}|${t.test_id}` : "";
  if (key === "o2") {
    out.sort((a, b) => {
      const av = a.fields.o2_pct?.v as number | null | undefined;
      const bv = b.fields.o2_pct?.v as number | null | undefined;
      if (av == null && bv == null) return a.test_id.localeCompare(b.test_id);
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv; // ordering only
    });
  } else {
    out.sort((a, b) => str(a).localeCompare(str(b), "en-GB", { numeric: true }));
  }
  return out;
}

export default function MaterialDossier() {
  const { name = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const sort = (SORTS.find((s) => s.key === sp.get("sort"))?.key ?? "investigation") as SortKey;

  const tests = useData<TestsFile>("tests.json");
  const cands = useData<CandidatesFile>("candidates.json");
  const stats = useData<InvestigationStatsFile>("investigation_stats.json");
  const kf = useData<KeyFindingsFile>("key_findings.json");

  const entry = useMemo(() => (tests.data ? materialEntries(tests.data.tests).entries.find((e) => e.label === name) : undefined), [tests.data, name]);
  const rows = useMemo(
    () => (tests.data ? tests.data.tests.filter((t) => t.fuel_class === "solid" && (t.fields.material?.v === name || t.fields.fuel?.v === name)) : []),
    [tests.data, name],
  );
  const sorted = useMemo(() => sortTests(rows, sort), [rows, sort]);

  const paperOnly = (kf.data?.findings ?? []).some((f) => (f.materials ?? []).includes(name));

  if (tests.error) return <ErrorNote error={tests.error} />;
  if (!tests.data || !cands.data) return <Loading what="the material dossier" />;
  if (!entry && !paperOnly) {
    return (
      <div className="card p-6 text-sm">
        <p>
          No solid-material test in the snapshot has the label <MaterialLabel label={name} />.
        </p>
        <p className="mt-2"><Link className="underline" to="/dossiers">See all dossiers</Link></p>
      </div>
    );
  }

  const invKeys = new Set((entry?.investigations ?? []).map((i) => normInv(i.name)));
  const needle = name.trim().toLowerCase();
  const mentioning = (kf.data?.findings ?? []).filter(
    (f) =>
      f.kind !== "detection" &&
      ((f.materials ?? []).includes(name) ||
        (needle.length > 2 && (f.finding.v.toLowerCase().includes(needle) || f.quote.toLowerCase().includes(needle))) ||
        invKeys.has(normInv(f.investigation))),
  );
  const detection = (kf.data?.findings ?? []).filter((f) => f.kind === "detection" && normInv(f.investigation) === "saffirevi");
  const detectionPending = (kf.data?.status.awaiting_verification ?? []).filter((id) => id.startsWith("FND-S6-DET-"));
  const mode = materialMapMode(rows);
  const ids = rows.map((t) => t.test_id);

  const setSort = (k: SortKey) => {
    const next = new URLSearchParams(sp);
    next.set("sort", k);
    setSp(next, { replace: true });
  };

  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <BackLink />
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Material dossier</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">
            <MaterialLabel label={name} />
          </h1>
          <div className="no-print flex flex-wrap gap-2">
            <ExportButton onClick={() => window.print()}>Print or save as PDF</ExportButton>
            {ids.length > 0 && (
              <Link to={evidenceHref(ids)} className="btn btn-sm">
                Open all in the Evidence Explorer
              </Link>
            )}
          </div>
        </div>
        <p className="max-w-3xl text-sm text-ink-2">
          The label exactly as the PSI table writes it. Other labels may describe the same material in different words; they have their own dossiers and are not
          merged here.
          {entry && <> {knownSentence(entry)}</>}
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="flex min-w-0 flex-col gap-5">
          {mode === "none" ? (
            <Section id="map" title="Where it was tested">
              <div className="hatch-bg rounded-lg border border-line p-1.5">
                <p className="rounded-md bg-surface-2 p-3 text-sm text-ink-2">
                  Neither O2 nor pressure is recorded for any test of this material, so it cannot be placed on the oxygen and pressure plane or judged near any
                  candidate atmosphere. The tests are listed below.
                </p>
              </div>
            </Section>
          ) : (
            <div>
              <MaterialMap tests={rows} candidates={cands.data.candidates} label={name} />
            </div>
          )}

          <Section
            id="tests"
            title="Tests of this material"
            aside={
              <div className="no-print flex items-center gap-2 text-xs">
                <span className="text-ink-3" aria-hidden="true">Sort</span>
                <span className="seg seg-sm" role="group" aria-label="Sort tests by">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={sort === s.key}
                    onClick={() => setSort(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
                </span>
              </div>
            }
          >
            <div className="-mx-1 max-h-[34rem] overflow-auto px-1" role="region" aria-label={`Tests of ${name}, scrollable`} tabIndex={0}>
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Tests of {name}</caption>
                <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-3">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Test</th>
                    <th className="pr-3 font-medium">Label</th>
                    <th className="pr-3 font-medium">Investigation</th>
                    <th className="pr-3 font-medium">Date</th>
                    <th className="pr-3 font-medium">O2</th>
                    <th className="pr-3 font-medium">Pressure</th>
                    <th className="pr-3 font-medium">Flow</th>
                    <th className="font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t) => (
                    <tr key={t.test_id} className="border-t border-line align-top">
                      <td className="py-1.5 pr-3">
                        <Link className="mono text-xs underline" to={evidenceHref([t.test_id])}>{t.test_id}</Link>
                        {t.flags.length > 0 && (
                          <span className="ml-1 text-xs text-ink-3" title={t.flags.join(", ")}>
                            flagged<span className="sr-only">: {t.flags.join(", ")}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3"><Value val={t.fields.test_label} /></td>
                      <td className="py-1.5 pr-3">{t.investigation}</td>
                      <td className="py-1.5 pr-3"><Value val={t.fields.test_date} /></td>
                      <td className="py-1.5 pr-3">
                        <Value val={t.fields.o2_pct} />
                        {t.fields.o2_basis?.v && <span className="block text-xs text-ink-3">{String(t.fields.o2_basis.v)}</span>}
                      </td>
                      <td className="py-1.5 pr-3"><Pressure psi={t.fields.pressure_psi} kpa={t.fields.pressure_kpa} /></td>
                      <td className="py-1.5 pr-3"><Value val={t.fields.flow_cm_s} /></td>
                      <td className="max-w-[22rem] py-1.5 text-xs text-ink-2">{t.fields.notes?.v ? String(t.fields.notes.v) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section id="counts" title="Tests by investigation" lead="Counts of this exact label in each investigation's PSI table.">
            {entry ? (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {entry.investigations.map((i) => {
                  const n = labelCount(stats.data, i.id, name, entry.fields);
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-1.5">
                      <Link className="underline decoration-line" to={`/investigations?open=${i.id}`}>{i.name}</Link>
                      {n ? <Value val={n} /> : <span className="text-xs text-ink-3">{stats.isLoading ? "loading" : "count not in the snapshot"}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Reported only in published papers; no PSI table lists this label.</p>
            )}
            <div className="mt-3"><FuelLegend classes={["solid"]} /></div>
          </Section>

          <Section id="findings" title="Verified paper findings" lead="Findings that name this label, or come from an investigation that tested it.">
            {!kf.data ? (
              <Loading what="paper findings" />
            ) : kf.data.findings.length === 0 ? (
              <AwaitingVerification kf={kf.data} />
            ) : mentioning.length === 0 ? (
              <p className="text-sm text-ink-2">No verified finding mentions this material yet.</p>
            ) : (
              <div className="flex flex-col gap-3">{mentioning.map((f) => <FindingCard key={f.id} f={f} />)}</div>
            )}
          </Section>

          <Section id="detection" title="Saffire VI: detecting a fire" lead="What the Saffire VI paper reports about smoke and gas detection. Shown on every material dossier as context.">
            {!kf.data ? (
              <Loading what="paper findings" />
            ) : detection.length > 0 ? (
              <div className="flex flex-col gap-3">{detection.map((f) => <FindingCard key={f.id} f={f} />)}</div>
            ) : (
              <AwaitingVerification kf={kf.data} pendingIds={detectionPending} />
            )}
          </Section>
        </div>
      </div>
    </article>
  );
}
