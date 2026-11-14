// Compare: two to four investigations in aligned columns. Condition ranges share one scale per row so
// the bars can be read against each other; the numbers under each bar come from the snapshot.
import { useId, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorNote, Loading, PageHeader } from "../components/Common";
import { Value } from "../components/Value";
import { useData } from "../lib/data";
import { doiUrl } from "../lib/format";
import { MAX_COMPARE, MIN_COMPARE } from "../charts/investigationsQuery";
import { type Domain, RangeCell, sharedDomain } from "../charts/investigationsRanges";
import {
  COVERAGE_KEYS,
  COVERAGE_LABEL,
  CoverageChip,
  CoverageLegend,
  coverageState,
  INV_CLASS_LABEL,
  InvLegend,
  InvMarker,
  type InvRecord,
  type InvestigationsFile,
  type QualityFile,
  invClass,
  invName,
  labelEntries,
  metadataFlags,
  MetaFlagBadges,
  QualityLink,
  SourcedText,
  type StatRange,
  type InvStats,
} from "../charts/investigationsShared";

type RangeKey = "o2_pct" | "pressure_psi" | "flow_cm_s" | "co2_pct" | "he_pct";

const RANGE_ROWS: { key: RangeKey; label: string; unit: string }[] = [
  { key: "o2_pct", label: "O2", unit: "% by volume" },
  { key: "pressure_psi", label: "Pressure", unit: "psi (kPa beside)" },
  { key: "flow_cm_s", label: "Flow", unit: "cm/s" },
  { key: "co2_pct", label: "CO2", unit: "% by volume" },
  { key: "he_pct", label: "He", unit: "% by volume" },
];

const rangeOf = (s: InvStats | null, k: RangeKey): StatRange | null => (s ? s[k] : null);

export default function Compare() {
  const inv = useData<InvestigationsFile>("investigations.json");
  const quality = useData<QualityFile>("quality_report.json");
  const [sp, setSp] = useSearchParams();
  const [fullText, setFullText] = useState(false);
  const addId = useId();
  const [toAdd, setToAdd] = useState("");

  const byId = useMemo(() => new Map((inv.data?.investigations ?? []).map((r) => [r.id, r])), [inv.data]);
  const idsParam = sp.get("ids");
  const ids = useMemo(() => {
    const raw = idsParam ? idsParam.split(",").map((x) => x.trim()).filter(Boolean) : [];
    return [...new Set(raw)].filter((id) => !inv.data || byId.has(id)).slice(0, MAX_COMPARE);
  }, [idsParam, byId, inv.data]);
  const cols = useMemo(() => ids.map((id) => byId.get(id)).filter((r): r is InvRecord => !!r), [ids, byId]);

  const domains = useMemo(() => {
    const out = {} as Record<RangeKey, Domain | null>;
    for (const row of RANGE_ROWS) out[row.key] = sharedDomain(cols.map((r) => rangeOf(r.stats, row.key)));
    return out;
  }, [cols]);

  const setIds = (next: string[]) => {
    const p = new URLSearchParams(sp);
    if (next.length) p.set("ids", next.join(","));
    else p.delete("ids");
    setSp(p, { replace: true });
  };

  if (inv.error) return <ErrorNote error={inv.error} />;
  if (!inv.data) return <Loading what="investigations" />;

  const others = inv.data.investigations.filter((r) => !ids.includes(r.id)).sort((a, b) => invName(a).localeCompare(invName(b)));
  const flags = quality.data?.flags;
  const canAdd = cols.length < MAX_COMPARE;

  const addPicker = canAdd && (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (toAdd) {
          setIds([...ids, toAdd]);
          setToAdd("");
        }
      }}
    >
      <div>
        <label htmlFor={addId} className="mb-1 block text-xs font-medium text-ink-3">Add an investigation</label>
        <select id={addId} value={toAdd} onChange={(e) => setToAdd(e.target.value)} className="max-w-[18rem] rounded border border-line bg-surface-2 px-2 py-1 text-sm text-ink">
          <option value="">Choose...</option>
          {others.map((r) => (
            <option key={r.id} value={r.id}>{invName(r)} ({r.id})</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={!toAdd} className="rounded border border-line px-3 py-1 text-sm hover:bg-surface-3 disabled:opacity-50">Add</button>
    </form>
  );

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-2 text-xs text-ink-3">
        <Link to={`/investigations${ids.length ? `?sel=${ids.join(",")}` : ""}`} className="underline underline-offset-2 hover:text-ink">Investigations</Link>
        <span aria-hidden="true"> / </span>
        <span>Compare</span>
      </nav>
      <PageHeader
        title="Compare investigations"
        lead={`Two to four investigations side by side. Condition ranges share one scale per row, so bar lengths can be read across columns. Side by side is not a ranking: each column only says what that table recorded.`}
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        {addPicker || <p className="text-xs text-ink-3">Four is the most that fit side by side. Remove one to add another.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="rounded border border-line px-2 py-1 text-xs hover:bg-surface-3" aria-pressed={fullText} onClick={() => setFullText((f) => !f)}>
            {fullText ? "Shorten long text" : "Show full text"}
          </button>
        </div>
      </div>

      {cols.length < MIN_COMPARE && (
        <p className="card mb-4 p-4 text-sm text-ink-2" role="status">
          Pick at least {MIN_COMPARE} investigations to compare. Use the picker above, or tick cards on the <Link className="text-accent underline" to="/investigations">Investigations</Link> page.
        </p>
      )}

      {cols.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: `${9 + cols.length * 14}rem` }}>
            <caption className="sr-only">Comparison of {cols.map(invName).join(", ")}</caption>
            <colgroup>
              <col style={{ width: "9rem" }} />
              {cols.map((r) => <col key={r.id} />)}
            </colgroup>
            <thead>
              <tr className="align-top">
                <th scope="col" className="sticky left-0 z-10 bg-surface-2 p-3 text-left text-xs font-medium text-ink-3">Investigation</th>
                {cols.map((r) => (
                  <th key={r.id} scope="col" className="border-l border-line p-3 text-left font-normal">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <InvMarker c={invClass(r)} size={14} outlined={!r.has_table} />
                          <Link to={`/investigations?open=${r.id}`} className="font-semibold underline-offset-2 hover:underline">{invName(r)}</Link>
                        </div>
                        <div className="mono text-xs text-ink-3">{r.id}</div>
                      </div>
                      <button type="button" className="shrink-0 rounded border border-line px-1.5 py-0.5 text-xs text-ink-2 hover:bg-surface-3" aria-label={`Remove ${invName(r)} from the comparison`} onClick={() => setIds(ids.filter((x) => x !== r.id))}>
                        Remove
                      </button>
                    </div>
                    {r.acronym?.v && r.title?.v && <p className="mt-1 text-xs text-ink-2">{r.title.v}</p>}
                    <p className="mt-1 text-xs text-ink-3">{INV_CLASS_LABEL[invClass(r)]}{r.has_table ? "" : ", no experiment table"}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Section label="Objectives">
                {cols.map((r) => <Cell key={r.id}><SourcedText val={r.objectives} clamp={!fullText} /></Cell>)}
              </Section>
              <Section label="Platform and dates">
                {cols.map((r) => (
                  <Cell key={r.id}>
                    <div className="text-xs"><Value val={r.flight_platform} /></div>
                    <div className="mt-1 text-xs text-ink-2"><Value val={r.start_date} /> to <Value val={r.end_date} /></div>
                    {r.doi?.v && <a className="mono mt-1 block truncate text-xs underline underline-offset-2" href={doiUrl(r.doi.v)} target="_blank" rel="noreferrer">{r.doi.v}</a>}
                    <div className="mt-1 text-xs text-ink-3">Licence: <Value val={r.licence} /></div>
                  </Cell>
                ))}
              </Section>
              <Section label="Tests in the PSI table">
                {cols.map((r) => (
                  <Cell key={r.id}>
                    {r.stats ? <span className="font-semibold"><Value val={r.stats.n_tests} /></span> : <Hatched>no tests recorded (no experiment table)</Hatched>}
                  </Cell>
                ))}
              </Section>
              <Section label="Fuels">
                {cols.map((r) => <Cell key={r.id}><Labels entries={labelEntries(r.stats?.fuel_counts)} hasTable={r.has_table} what="fuel" /></Cell>)}
              </Section>
              <Section label="Materials">
                {cols.map((r) => <Cell key={r.id}><Labels entries={labelEntries(r.stats?.material_counts)} hasTable={r.has_table} what="material" /></Cell>)}
              </Section>
              {RANGE_ROWS.map((row) => (
                <Section key={row.key} label={row.label} sub={`${row.unit}; one scale across the row`}>
                  {cols.map((r) => (
                    <Cell key={r.id}>
                      <RangeCell
                        range={rangeOf(r.stats, row.key)}
                        kpa={row.key === "pressure_psi" ? r.stats?.pressure_kpa ?? null : undefined}
                        domain={domains[row.key]}
                        cls={invClass(r)}
                        hasTable={r.has_table && !!r.stats}
                        label={row.label}
                        unitLabel={row.unit}
                      />
                    </Cell>
                  ))}
                </Section>
              ))}
              <Section label="Variables recorded">
                {cols.map((r) => (
                  <Cell key={r.id}>
                    <ul className="flex flex-wrap gap-1" aria-label={`Variables recorded by ${invName(r)}`}>
                      {COVERAGE_KEYS.map((k) => <li key={k}><CoverageChip state={coverageState(r, k)} label={COVERAGE_LABEL[k]} /></li>)}
                    </ul>
                  </Cell>
                ))}
              </Section>
              <Section label="Hardware" sub="as named on the PSI page">
                {cols.map((r) => <Cell key={r.id}><SourcedText val={r.hardware} clamp={!fullText} /></Cell>)}
              </Section>
              <Section label="Approach and sensors" sub="as described on the PSI page">
                {cols.map((r) => <Cell key={r.id}><SourcedText val={r.approach} clamp={!fullText} /></Cell>)}
              </Section>
              <Section label="People">
                {cols.map((r) => (
                  <Cell key={r.id}>
                    {r.contacts && r.contacts.length ? (
                      <ul className="flex flex-col gap-0.5 text-xs text-ink-2">
                        {(fullText ? r.contacts : r.contacts.slice(0, 3)).map((c) => <li key={c.p}>{c.v}</li>)}
                      </ul>
                    ) : (
                      <span className="text-xs italic text-ink-3">not recorded</span>
                    )}
                  </Cell>
                ))}
              </Section>
              <Section label="Publications" sub="first five listed on the PSI page">
                {cols.map((r) => (
                  <Cell key={r.id}>
                    <div className="text-xs text-ink-2">Listed: <Value val={r.publication_count} emptyText="none on the PSI page" /></div>
                    {r.publications.length > 0 && (
                      <ol className="mt-1.5 flex flex-col gap-1.5">
                        {r.publications.slice(0, 5).map((p) => (
                          <li key={p.line} className="text-xs leading-snug">
                            <span className="text-ink">{p.title?.v ?? "untitled"}</span>
                            {p.doi?.v ? (
                              <a className="mono block truncate text-[11px] text-ink-2 underline underline-offset-2" href={doiUrl(p.doi.v)} target="_blank" rel="noreferrer">{p.doi.v}</a>
                            ) : (
                              <span className="block text-[11px] italic text-ink-3">no DOI listed</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </Cell>
                ))}
              </Section>
              <Section label="Flags">
                {cols.map((r) => {
                  const meta = metadataFlags(flags, r.id);
                  return (
                    <Cell key={r.id}>
                      <div className="flex flex-col gap-1.5">
                        <MetaFlagBadges flags={meta} />
                        {r.has_table ? <QualityLink id={r.id} /> : <span className="text-xs italic text-ink-3">no experiment table to check</span>}
                      </div>
                    </Cell>
                  );
                })}
              </Section>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <InvLegend />
        <CoverageLegend />
        <p className="text-xs text-ink-3">
          Range bars run from the lowest to the highest value recorded for that condition in the investigation's PSI table. Hatched: the table does not record the condition, so it is unknown rather than zero.
          Sources: NASA PSI investigation pages and experiment tables.
        </p>
      </div>
    </div>
  );
}

function Section({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="sticky left-0 z-10 bg-surface-2 p-3 text-left text-xs font-medium text-ink-2">
        {label}
        {sub && <span className="mt-0.5 block font-normal text-ink-3">{sub}</span>}
      </th>
      {children}
    </tr>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="min-w-0 border-l border-line p-3">{children}</td>;
}

function Hatched({ children }: { children: ReactNode }) {
  return (
    <span className="hatch-bg inline-block rounded border border-line px-1 py-0.5 text-xs">
      <span className="rounded-sm bg-surface-2 px-0.5 italic text-ink-2">{children}</span>
    </span>
  );
}

function Labels({ entries, hasTable, what }: { entries: ReturnType<typeof labelEntries>; hasTable: boolean; what: string }) {
  const [all, setAll] = useState(false);
  const LIMIT = 6;
  if (!hasTable) return <span className="text-xs italic text-ink-3">no experiment table</span>;
  if (!entries.length) return <Hatched>no {what} named in the table</Hatched>;
  const shown = all ? entries : entries.slice(0, LIMIT);
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {shown.map((e) => (
        <li key={e.label} className="flex justify-between gap-2">
          <span className="min-w-0 break-words">{e.label}</span>
          <span className="shrink-0 text-ink-3"><Value val={e.val} /></span>
        </li>
      ))}
      {entries.length > LIMIT && (
        <li>
          <button type="button" className="text-accent underline underline-offset-2" aria-expanded={all} onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : "Show all"}
          </button>
        </li>
      )}
    </ul>
  );
}
