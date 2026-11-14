// Data Quality: the pipeline's own account of what it read, what it excluded, what it checked and
// what it flagged. Every number is read from quality_report.json or key_findings.json.
import { useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, ErrorNote, FuelMarker, Loading, PageHeader } from "../components/Common";
import { EvidenceFlagList } from "../components/evidenceFlags";
import {
  fileBase, type FindingProblem, type GoldenResult, type GoldenValue, type KeyFinding, type KeyFindingsFile,
  type QualityReport, type Reconciliation,
} from "../components/evidenceShared";
import { Pressure, Value } from "../components/Value";
import { dataUrl, useData } from "../lib/data";
import { doiUrl, FUEL_LABEL, ntrsUrl } from "../lib/format";
import type { Candidate, Investigation, Val } from "../lib/types";

const SECTIONS: [string, string][] = [
  ["summary", "Summary"],
  ["coverage", "Provenance coverage"],
  ["reconciliation", "Reconciliation"],
  ["goldens", "Golden checks"],
  ["findings", "Paper findings"],
  ["flags", "Flags"],
];

// Attaches the report's provenance id to a number the report stores without one. No arithmetic.
const tag = (v: number | string | null, p: string, u?: string): Val => ({ v, u, p });

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20">
      <h2 id={`${id}-h`} className="text-lg font-semibold tracking-tight">{title}</h2>
      {lead && <p className="mb-3 mt-0.5 max-w-3xl text-sm text-ink-2">{lead}</p>}
      {children}
    </section>
  );
}

function Tile({ label, children, note }: { label: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold">{children}</dd>
      {note && <dd className="mt-0.5 text-[11px] text-ink-3">{note}</dd>}
    </div>
  );
}

function GoldenCell({ value, p, g }: { value: GoldenValue; p: string; g: GoldenResult }) {
  if (value === null) return <span className="italic text-ink-3">none</span>;
  // A count of nearby tests that is zero means no tests recorded there, never low risk.
  if (value === 0 && g.id.startsWith("near_")) {
    return (
      <span className="hatch-bg inline-flex flex-col items-end rounded border border-line px-1.5 py-0.5">
        <span className="rounded bg-surface-2 px-1"><Value val={tag(value, p)} /></span>
        <span className="rounded bg-surface-2 px-1 text-[11px] text-ink-2">no tests recorded</span>
      </span>
    );
  }
  if (typeof value === "object") {
    return (
      <ul className="flex flex-col">
        {Object.entries(value).map(([k, v]) => (
          <li key={k} className="whitespace-nowrap">
            <span className="text-ink-2">&ldquo;{k}&rdquo;</span>: <Value val={tag(v, p)} />
          </li>
        ))}
      </ul>
    );
  }
  const approximate = typeof value === "number" && /approximate/i.test(g.description);
  // Shown with the decimals as stored (up to two), so a check that matches within tolerance is not
  // disguised by rounding (2903.5 must not read as 2,904 beside an expected 2,903).
  const digits = typeof value === "number" ? Math.min((String(value).split(".")[1] ?? "").length, 2) : undefined;
  return <Value val={tag(value, p)} approximate={approximate} digits={digits} />;
}

// Notes the app always attaches to these quantities, whatever the check's own wording.
function goldenNotes(g: GoldenResult): string[] {
  const notes: string[] = [];
  if (g.id.startsWith("ft_")) notes.push("Flame temperature explains, does not predict: it says how hot a flame can get, not whether one ignites or spreads.");
  return notes;
}

// The candidate condition a check refers to (golden ids end in the candidate id), so its pressure can
// be written in psi with kPa beside it from the snapshot, never converted here.
function GoldenCondition({ g, candidates }: { g: GoldenResult; candidates: Candidate[] }) {
  const c = candidates.find((x) => g.id.endsWith(`_${x.id}`));
  if (!c) return null;
  const about = /4\.3 psi/.test(g.description) || c.pressure_psi.v === 4.3;
  return (
    <span className="mt-0.5 block text-[11px] text-ink-2">
      Condition: {about && "about "}<Pressure psi={c.pressure_psi} kpa={c.pressure_kpa} />, <Value val={c.o2_pct} /> O2 ({c.short})
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  match: "Reproduced",
  explained_difference: "Difference explained",
};

function GoldenTable({ results, p, candidates }: { results: GoldenResult[]; p: string; candidates: Candidate[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Golden checks: expected values from earlier analyses, the value this snapshot produces, and the status</caption>
        <thead className="bg-surface-3 text-left text-xs text-ink-2">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Check</th>
            <th scope="col" className="px-3 py-2 font-medium">Expected</th>
            <th scope="col" className="px-3 py-2 font-medium">Actual</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Explanation</th>
          </tr>
        </thead>
        <tbody>
          {results.map((g) => (
            <tr key={g.id} className="border-t border-line align-top">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="block">{g.description}</span>
                <span className="mono block text-[11px] text-ink-3">{g.id}</span>
                <span className="block text-[11px] text-ink-3">Source: {g.source}</span>
                <GoldenCondition g={g} candidates={candidates} />
                {goldenNotes(g).map((n) => <span key={n} className="mt-0.5 block text-[11px] italic text-ink-2">{n}</span>)}
              </th>
              <td className="px-3 py-2 text-right"><GoldenCell value={g.expected} p={p} g={g} /></td>
              <td className="px-3 py-2 text-right"><GoldenCell value={g.actual} p={p} g={g} /></td>
              <td className="whitespace-nowrap px-3 py-2">
                <Badge tone={g.status === "match" ? "teal" : g.status === "explained_difference" ? "amber" : "neutral"}>
                  {STATUS_LABEL[g.status] ?? g.status}
                </Badge>
              </td>
              <td className="min-w-[18rem] max-w-xl px-3 py-2 text-xs text-ink-2">{g.explanation ?? <span className="text-ink-3">Not needed: values agree.</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReconDetails({ r }: { r: Reconciliation }) {
  const any = r.blank_excluded_lines.length || r.duplicates_removed_detail.length || r.non_test_excluded_detail.length;
  if (!any) return <span className="text-xs text-ink-3">no exclusions</span>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-accent underline underline-offset-2">Show excluded lines</summary>
      <div className="mt-1 flex max-w-md flex-col gap-2">
        {r.duplicates_removed_detail.length > 0 && (
          <div>
            <p className="font-medium text-ink-2">Exact duplicates removed</p>
            <ul className="mono">
              {r.duplicates_removed_detail.map((d) => <li key={d.line}>line {d.line} repeats line {d.duplicate_of}</li>)}
            </ul>
          </div>
        )}
        {r.non_test_excluded_detail.length > 0 && (
          <div>
            <p className="font-medium text-ink-2">Non-test rows excluded</p>
            <ul className="flex flex-col gap-1">
              {r.non_test_excluded_detail.map((d) => (
                <li key={d.line}>
                  <span className="mono">line {d.line}</span>: {d.reason}
                  <span className="mono block break-all text-ink-3">{d.raw.map((c) => `"${c}"`).join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.blank_excluded_lines.length > 0 && (
          <div>
            <p className="font-medium text-ink-2">Blank lines excluded</p>
            <p className="mono max-h-32 overflow-auto break-words text-ink-3">{r.blank_excluded_lines.join(", ")}</p>
          </div>
        )}
      </div>
    </details>
  );
}

function ReconciliationTable({ rows, p, invNames, highlightInv }: { rows: Reconciliation[]; p: string; invNames: Map<string, string>; highlightInv: string }) {
  const num = (v: number, u: string) => <Value val={tag(v, p, u)} unit={false} />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Line-by-line reconciliation of every experiment table file: lines read, excluded and kept</caption>
        <thead className="bg-surface-3 text-left text-xs text-ink-2">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Table file</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Physical lines</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Header lines</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Records in</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Blank rows excluded</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Exact duplicates removed</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Non-test rows excluded</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Tests out</th>
            <th scope="col" className="px-3 py-2 font-medium">Balanced</th>
            <th scope="col" className="px-3 py-2 font-medium">Exclusions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.table_file} className={`border-t border-line align-top ${highlightInv === r.investigation_id ? "bg-surface-3" : ""}`}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="block">
                  <Link className="underline" to={`/evidence?inv=${encodeURIComponent(r.investigation_id)}`} title="Open these tests in the Evidence Explorer">
                    {invNames.get(r.investigation_id) ?? r.investigation_id}
                  </Link>{" "}
                  <span className="mono text-[11px] text-ink-3">{r.investigation_id} / {r.table_key}</span>
                </span>
                <span className="mono block min-w-[15rem] max-w-[22rem] break-words text-[11px] text-ink-3" title={r.table_file}>{fileBase(r.table_file)}</span>
              </th>
              <td className="px-3 py-2 text-right">{num(r.physical_lines, "lines")}</td>
              <td className="px-3 py-2 text-right">{num(r.header_lines, "lines")}</td>
              <td className="px-3 py-2 text-right">{num(r.records_in, "records")}</td>
              <td className="px-3 py-2 text-right">{num(r.blank_excluded, "rows")}</td>
              <td className="px-3 py-2 text-right">{num(r.duplicates_removed, "rows")}</td>
              <td className="px-3 py-2 text-right">{num(r.non_test_excluded, "rows")}</td>
              <td className="px-3 py-2 text-right font-medium">{num(r.tests_out, "tests")}</td>
              <td className="whitespace-nowrap px-3 py-2">
                {r.balanced ? <Badge tone="teal">Balanced</Badge> : <Badge tone="amber">Does not balance</Badge>}
              </td>
              <td className="px-3 py-2"><ReconDetails r={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function problemText(p: FindingProblem): ReactNode {
  if (typeof p === "string") return <span className="mono">{p}</span>;
  const problems = p.problems ?? (p.problem ? [p.problem] : []);
  return (
    <>
      <span className="mono">{p.id}</span>
      {problems.length > 0 && <span className="text-ink-2">: {problems.join("; ")}</span>}
    </>
  );
}

function IdList({ ids, empty }: { ids: FindingProblem[]; empty: string }) {
  if (!ids.length) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {ids.map((p, i) => <li key={typeof p === "string" ? p : `${p.id}-${i}`}>{problemText(p)}</li>)}
    </ul>
  );
}

function FindingItem({ f }: { f: KeyFinding }) {
  const text = f.text ?? f.statement ?? f.finding;
  return (
    <li className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-xs text-ink-3">{f.id}</span>
        <Badge tone="teal">Published paper, human verified</Badge>
        {f.investigation_id && <span className="mono text-xs text-ink-3">{f.investigation_id}</span>}
      </div>
      {text && <p className="mt-1">{text}</p>}
      {f.quote && <blockquote className="mt-1 border-l-2 border-line pl-2 text-xs italic text-ink-2">&ldquo;{f.quote}&rdquo;</blockquote>}
      {f.value && <p className="mt-1 text-xs">Value: <Value val={f.value} /></p>}
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-3">
        {f.doi && <a className="mono underline" href={doiUrl(f.doi)} target="_blank" rel="noreferrer">{f.doi}</a>}
        {f.ntrs && <a className="mono underline" href={ntrsUrl(f.ntrs)} target="_blank" rel="noreferrer">NTRS {f.ntrs}</a>}
        {f.verified_by && <span>Verified by {f.verified_by}{f.verified_at ? ` (${f.verified_at})` : ""}</span>}
      </p>
    </li>
  );
}

export default function Quality() {
  const report = useData<QualityReport>("quality_report.json");
  const findings = useData<KeyFindingsFile>("key_findings.json");
  const invs = useData<{ investigations: Investigation[] }>("investigations.json");
  const cands = useData<{ candidates: Candidate[] }>("candidates.json");
  const [sp] = useSearchParams();
  const highlightInv = sp.get("inv") ?? "";

  const invNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of invs.data?.investigations ?? []) {
      const a = i.acronym?.v;
      if (typeof a === "string" && a) m.set(i.id, a);
    }
    return m;
  }, [invs.data]);

  if (report.error) return <ErrorNote error={report.error} />;
  if (!report.data) return <Loading what="the quality report" />;
  const q = report.data;
  const s = q.summary;
  const cov = q.provenance_coverage;
  const status = findings.data?.status ?? q.findings;
  const findingsP = findings.data?.p ?? q.p;
  const verifiedFindings = findings.data?.findings ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Data Quality"
        lead="What the pipeline read, what it excluded and why, what it checked against earlier analyses, and every flag it raised. Raw values are kept verbatim; nothing is silently corrected."
      >
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <a className="rounded border border-line px-2.5 py-1.5 hover:bg-surface-3" href={dataUrl("flags.csv")} download>Download flags.csv</a>
          <a className="rounded border border-line px-2.5 py-1.5 hover:bg-surface-3" href={dataUrl("tests.csv")} download>Download tests.csv</a>
          <Link className="rounded border border-line px-2.5 py-1.5 hover:bg-surface-3" to="/evidence">Open the Evidence Explorer</Link>
        </div>
        <nav aria-label="On this page" className="mt-4">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}><a className="text-ink-2 underline-offset-2 hover:text-ink hover:underline" href={`#${id}`}>{label}</a></li>
            ))}
          </ul>
        </nav>
      </PageHeader>

      <Section id="summary" title="Summary" lead="Counts written by the pipeline for this snapshot. Select any number for its source.">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          <Tile label="Tests"><Value val={s.tests} unit={false} /></Tile>
          <Tile label="Experiment tables"><Value val={s.tables} unit={false} /></Tile>
          <Tile label="Investigations with tables"><Value val={s.investigations_with_tables} unit={false} /></Tile>
          <Tile label="Investigations in total"><Value val={s.investigations_total} unit={false} /></Tile>
          <Tile label="Flags raised"><Value val={s.flags} unit={false} /></Tile>
          <Tile label="Exact duplicate rows removed"><Value val={s.duplicates_removed} unit={false} /></Tile>
          <Tile label="Blank rows excluded"><Value val={s.blank_rows_excluded} unit={false} /></Tile>
          <Tile label="Non-test rows excluded"><Value val={s.non_test_rows_excluded} unit={false} /></Tile>
        </dl>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Tests by fuel class <span className="font-normal text-ink-3">(all from PSI experiment tables)</span></h3>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {["gas", "droplet", "solid", "emulator", "none"].filter((f) => s.by_fuel_class[f]).map((f) => (
                <Tile key={f} label={<span className="flex items-center gap-1.5"><FuelMarker fuel={f} /> {FUEL_LABEL[f] ?? f}</span>}>
                  <Value val={s.by_fuel_class[f]} unit={false} />
                </Tile>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Flags by severity</h3>
            <dl className="grid grid-cols-3 gap-2">
              {["info", "warning", "error"].filter((k) => s.flags_by_severity[k]).map((k) => (
                <Tile key={k} label={<Link className="mono underline" to={`/quality?sev=${k}#flags`}>{k}</Link>}>
                  <Value val={s.flags_by_severity[k]} unit={false} />
                </Tile>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      <Section id="coverage" title="Provenance coverage" lead="Every number written to the snapshot was checked for a provenance record: the file, line, column and raw text it came from, or the method that derived it.">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Tile label="Numbers checked"><Value val={tag(cov.numbers_checked, q.p, "numbers")} unit={false} /></Tile>
          <Tile label="Numbers without provenance"><Value val={tag(cov.without_provenance, q.p, "numbers")} unit={false} /></Tile>
          <Tile label="Coverage"><Value val={tag(cov.percent, q.p, "%")} /></Tile>
        </dl>
        {cov.examples.length > 0 && (
          <div className="mt-2 text-xs">
            <p className="text-ink-2">Examples without provenance:</p>
            <ul className="mono">{cov.examples.map((e, i) => <li key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</li>)}</ul>
          </div>
        )}
      </Section>

      <Section
        id="reconciliation"
        title="Reconciliation per table file"
        lead="For each experiment table: physical lines in the file, header lines, records read, rows excluded (blank, exact duplicate, not a test) and tests kept. Balanced means every line is accounted for."
      >
        <ReconciliationTable rows={q.reconciliation} p={q.p} invNames={invNames} highlightInv={highlightInv} />
      </Section>

      <Section
        id="goldens"
        title="Golden checks"
        lead="Values from earlier analyses that this snapshot must reproduce. A difference is accepted only with an exact written explanation."
      >
        <GoldenTable results={q.goldens.results} p={q.goldens.p} candidates={cands.data?.candidates ?? []} />
      </Section>

      <Section
        id="findings"
        title="Paper findings"
        lead="Findings drafted from published papers appear in the app only after a person has checked each one against the source page."
      >
        {verifiedFindings.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-2">{verifiedFindings.map((f) => <FindingItem key={f.id} f={f} />)}</ul>
        ) : (
          <p className="mb-4 rounded-lg border border-line bg-surface-2 p-3 text-sm">
            <span className="font-medium">Awaiting human verification.</span>{" "}
            <Value val={tag(status.drafted, findingsP, "findings")} /> drafted; none verified yet, so no paper finding is shown anywhere in the app.
          </p>
        )}
        <dl className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="card p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-2">Drafted</dt>
            <dd className="mt-1 text-xl font-semibold"><Value val={tag(status.drafted, findingsP, "findings")} unit={false} /></dd>
          </div>
          <div className="card p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-2">Verified</dt>
            <dd className="mt-1"><IdList ids={status.verified} empty="None yet." /></dd>
          </div>
          <div className="card p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-2">Failed automatic checks</dt>
            <dd className="mt-1"><IdList ids={status.failed_checks} empty="None." /></dd>
          </div>
          <div className="card p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-2">Rejected by reviewer</dt>
            <dd className="mt-1"><IdList ids={status.rejected_by_reviewer} empty="None." /></dd>
          </div>
        </dl>
        {status.awaiting_verification.length > 0 && (
          <details className="card mt-3 p-3">
            <summary className="cursor-pointer text-sm font-medium">Findings awaiting verification (ids)</summary>
            <ul className="mono mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
              {status.awaiting_verification.map((id) => <li key={id}>{id}</li>)}
            </ul>
          </details>
        )}
      </Section>

      <Section
        id="flags"
        title="Flags"
        lead={
          <>
            Every flag the pipeline raised: the file, lines and column it concerns, the raw value verbatim, what was found and what
            was done. Severity is the pipeline's grade for the data issue, not a statement about any atmosphere. The snapshot holds{" "}
            <Value val={s.flags} />.
          </>
        }
      >
        <EvidenceFlagList flags={q.flags} definitions={q.flag_definitions} invNames={invNames} />
      </Section>
    </div>
  );
}
