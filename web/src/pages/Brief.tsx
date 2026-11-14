// A cited one-page brief for one atmosphere: what is known about fire there, what is missing, and where
// every number comes from. Print it to PDF; download the nearby tests as CSV and the sources as BibTeX.
// Every number is a built value with a numbered footnote to its provenance record.
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AccessGapData } from "../charts/AccessGap";
import { downloadText } from "../components/evidenceCsv";
import { flameAt, prebreatheFor, type FlameFile, type PrebreatheFile } from "../components/EvidencePanel";
import { Value } from "../components/Value";
import { useData, useProvenance } from "../lib/data";
import { doiUrl, FUEL_LABEL, SOURCE_LABEL } from "../lib/format";
import { decodeGrid, FUELS, nearInputs, readAt, type NearTest, type ProbeGridFile, type Reading } from "../lib/probe";
import type { Candidate, CandidateEvidence, DatasetVersion, Investigation, Prov, Val } from "../lib/types";

const ROWS_SHOWN = 20;

export function briefCsv(r: Reading, near: NearTest[], version: string): string {
  const esc = (s: unknown) => {
    const t = s === null || s === undefined ? "" : String(s);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["test_id", "investigation_id", "investigation", "fuel_class", "source_type", "label", "o2_pct", "o2_provenance", "pressure_kpa", "pressure_provenance", "doi", "probe_o2_pct", "probe_pressure_psi", "step_multiplier", "dataset_version"];
  const rows = near.map(({ input: t }) => [t.id, t.investigation_id, t.investigation, t.fuel_class, t.source_type, t.label, t.o2?.v, t.o2?.p, t.kpa?.v, t.kpa?.p, t.doi, r.o2.v, r.psi.v, r.multiplier, version]);
  return [head, ...rows].map((row) => row.map(esc).join(",")).join("\n") + "\n";
}

export function briefBibtex(near: NearTest[], invs: Investigation[], cite: string, version: string): string {
  const out: string[] = [`@misc{redshift_dataset,\n  title = {Redshift microgravity fire evidence dataset},\n  note = {${cite}},\n  version = {${version}}\n}`];
  const ids = [...new Set(near.map((n) => n.input.investigation_id))].sort();
  for (const id of ids) {
    const inv = invs.find((i) => i.id === id);
    const doi = inv?.doi?.v as string | undefined;
    if (!doi) continue;
    const title = (inv?.title?.v as string | undefined) ?? id;
    out.push(`@misc{${id.replace("-", "")},\n  title = {${title}},\n  howpublished = {NASA Physical Sciences Informatics},\n  doi = {${doi}},\n  note = {${id}}\n}`);
  }
  return out.join("\n\n") + "\n";
}

export default function Brief() {
  const [sp] = useSearchParams();
  const o2 = Number(sp.get("o2") ?? 34);
  const psi = Number(sp.get("p") ?? 8.2);
  const m = Number(sp.get("m") ?? 1) || 1;
  const probe = useData<ProbeGridFile>("probe_grid.json");
  const cands = useData<{ candidates: Candidate[] }>("candidates.json");
  const candEv = useData<{ evidence: CandidateEvidence[] }>("candidate_evidence.json");
  const flame = useData<FlameFile>("flame_temperature_grid.json");
  const pb = useData<PrebreatheFile>("prebreathe.json");
  const gap = useData<AccessGapData>("access_gap.json");
  const version = useData<DatasetVersion>("dataset_version.json");
  const invs = useData<{ investigations: Investigation[] }>("investigations.json");
  const prov = useProvenance(true);
  const [copied, setCopied] = useState(false);

  const grid = useMemo(() => (probe.data ? decodeGrid(probe.data) : null), [probe.data]);
  const built = useMemo(() => {
    if (!grid || !cands.data || !candEv.data) return null;
    const r = readAt(grid, o2, psi, m);
    const c = cands.data.candidates.find((x) => x.o2_pct.v === r.o2.v && x.pressure_psi.v === r.psi.v) ?? null;
    const ce = c ? candEv.data.evidence.find((e) => e.candidate_id === c.id) ?? null : null;
    return { r, c, near: nearInputs(grid, r.i, r.j, m), flame: flameAt(flame.data, r.o2.v, r.psi.v, ce), pb: prebreatheFor(pb.data, c) };
  }, [grid, cands.data, candEv.data, flame.data, pb.data, o2, psi, m]);

  // Footnotes: one per distinct provenance record, numbered in reading order.
  const notes = useMemo(() => {
    if (!built) return [] as string[];
    const { r } = built;
    const vals: (Val | null | undefined)[] = [r.o2, r.total, ...FUELS.flatMap((f) => [r.near[f].psi_table, r.near[f].published_paper, r.o2m[f]]), built.flame?.value, ...(gap.data?.psi_steps.map((s) => s.count) ?? [])];
    return [...new Set(vals.filter(Boolean).map((v) => v!.p))];
  }, [built, gap.data]);
  const fn = (v: Val | null | undefined) => (v ? <sup className="ml-0.5 text-xs text-ink-3">{notes.indexOf(v.p) + 1}</sup> : null);
  const V = ({ v, digits, unit }: { v: Val | null | undefined; digits?: number; unit?: string | false }) => <><Value val={v} digits={digits} unit={unit} />{fn(v)}</>;

  if (!built || !version.data) return <div className="space-y-4" aria-busy="true"><div className="skeleton h-10 w-2/3" /><div className="skeleton h-64 w-full" /></div>;
  const { r, c, near } = built;
  const solidNear = r.nearClass.solid;
  const ver = version.data.version;

  return (
    <article className="mx-auto max-w-[800px]">
      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
        <button type="button" className="btn" onClick={() => downloadText(briefCsv(r, near, ver), `redshift-brief-${r.o2.v}pct-${r.psi.v}psi.csv`, "text/csv")}>Download CSV</button>
        <button type="button" className="btn" disabled={!invs.data} onClick={() => invs.data && downloadText(briefBibtex(near, invs.data.investigations, version.data!.cite, ver), `redshift-brief-${r.o2.v}pct-${r.psi.v}psi.bib`, "application/x-bibtex")}>Download BibTeX</button>
        <button type="button" className="btn" onClick={() => { try { void navigator.clipboard?.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* address bar holds the link */ } }}>{copied ? "Link copied" : "Copy link"}</button>
        <Link className="btn btn-quiet ml-auto" to={`/?o2=${r.o2.v}&p=${r.psi.v}${m !== 1 ? `&m=${m}` : ""}`}>Back to the plane</Link>
      </div>

      <header className="border-b border-line pb-6">
        <span className="eyebrow">Redshift brief · dataset {ver}</span>
        <h1 className="mt-2 text-xl font-semibold">
          Fire evidence near <V v={r.o2} /> oxygen and <V v={r.psi} /> (<Value val={r.kpa} digits={1} />)
        </h1>
        {c && <p className="mt-2 text-sm text-ink-2">{c.name}: {c.short}. {c.context}</p>}
        <p className="mt-3 text-sm text-ink-2">Redshift informs a decision; it does not rank or recommend an atmosphere. Nearness step size {r.multiplier}x. Counts come from the Redshift build; each number is footnoted to its source.</p>
      </header>

      <Block title="What is known">
        <p className="text-base">
          <V v={r.total} unit={false} /> {r.total.v === 1 ? "test sits" : "tests sit"} near this point in PSI&apos;s experiment tables and human-verified papers.
          {solidNear === 0 ? " None is a solid material." : null}
        </p>
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">Tests near this point by fuel class and source</caption>
          <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 font-medium">Fuel class</th><th className="font-medium">PSI tables</th><th className="font-medium">Verified papers</th><th className="font-medium">O2 matches, pressure not recorded</th></tr></thead>
          <tbody>
            {FUELS.map((f) => (
              <tr key={f} className="border-t border-line">
                <td className="py-2">{FUEL_LABEL[f]}</td>
                <td><V v={r.near[f].psi_table} unit={false} /></td>
                <td><V v={r.near[f].published_paper} unit={false} /></td>
                <td><V v={r.o2m[f]} unit={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <Block title="What is missing">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {solidNear === 0 && <li>No solid-material burn in PSI&apos;s tables or in a human-verified paper sits near this point.</li>}
          {r.o2m.solid.v > 0 && <li><V v={r.o2m.solid} unit={false} /> solid-material burns ran at about this oxygen level, but their tables do not record pressure, so they cannot be placed here.</li>}
          {r.o2m.emulator.v > 0 && <li><V v={r.o2m.emulator} unit={false} /> ACME BRE sessions list this oxygen level, but the BRE summary table does not record chamber pressure.</li>}
          {gap.data && gap.data.psi_steps.length >= 3 && (
            <li>Across PSI&apos;s tables: <V v={gap.data.psi_steps[0].count} unit={false} /> solid-fuel burn rows, of which <V v={gap.data.psi_steps[1].count} unit={false} /> record oxygen and <V v={gap.data.psi_steps[2].count} unit={false} /> record pressure.</li>
          )}
          {built.pb.kind !== "published" && <li>{built.pb.kind === "pending" ? "A published prebreathe figure exists but has not yet been verified by a team member." : "No published prebreathe figure for this atmosphere."}</li>}
        </ul>
      </Block>

      <Block title="Flame temperature">
        {built.flame ? (
          <p className="text-sm">
            <V v={built.flame.value} digits={0} />{built.flame.approximate ? " (approximate)" : ""}
            {!built.flame.exact && built.flame.at && <> at the nearest computed point, <Value val={built.flame.at.o2} digits={1} /> and <Value val={built.flame.at.psi} digits={1} /></>}
            . Adiabatic flame temperature of stoichiometric methane: it explains how hot a flame can get and does not predict ignition or spread.
          </p>
        ) : <p className="text-sm text-ink-2">Not computed at this point.</p>}
      </Block>

      <Block title={`Nearest tests${near.length > ROWS_SHOWN ? ` (first ${ROWS_SHOWN}; all are in the CSV)` : ""}`}>
        {near.length === 0 ? <p className="text-sm text-ink-2">No tests recorded near this point.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 font-medium">Test</th><th className="font-medium">Investigation</th><th className="font-medium">Fuel class</th><th className="font-medium">O2</th><th className="font-medium">Pressure</th></tr></thead>
            <tbody>
              {near.slice(0, ROWS_SHOWN).map(({ input: t }) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="mono py-1.5 text-xs">{t.id}</td>
                  <td>{t.investigation}</td>
                  <td>{FUEL_LABEL[t.fuel_class]}</td>
                  <td><Value val={t.o2 as Val} digits={1} /></td>
                  <td><Value val={t.kpa as Val} digits={1} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Block>

      <Block title="Sources">
        <ol className="space-y-2 text-xs">
          {notes.map((id, i) => <li key={id} className="grid grid-cols-[24px_1fr] gap-2"><span className="text-ink-3">{i + 1}</span><SourceLine id={id} prov={prov.data?.[id]} loading={prov.isLoading} /></li>)}
        </ol>
        <p className="mt-4 text-xs text-ink-2">Cite the dataset as: {version.data.cite}</p>
        <p className="mt-1 text-xs text-ink-2">PSI investigations cited by the tests above:{" "}
          {[...new Set(near.map((n) => n.input.doi).filter(Boolean))].slice(0, 12).map((d, i) => <span key={d}>{i > 0 && ", "}<a className="mono underline underline-offset-2" href={doiUrl(d)}>{d}</a></span>)}
        </p>
      </Block>
    </article>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line py-6 [break-inside:avoid]">
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

function SourceLine({ id, prov, loading }: { id: string; prov?: Prov; loading: boolean }) {
  if (!prov) return <span className="mono">{id}{loading ? " (loading source)" : ""}</span>;
  const where = prov.source_type === "derived" ? `${prov.method ?? "derived"}${prov.method_version ? ` v${prov.method_version}` : ""}` : [prov.file, prov.row !== undefined ? `line ${prov.row}` : null, prov.column ? `column "${prov.column}"` : null].filter(Boolean).join(", ");
  return <span><span className="text-ink-2">{SOURCE_LABEL[prov.source_type] ?? prov.source_type}:</span> {where} <span className="mono text-ink-3">[{id}]</span></span>;
}
