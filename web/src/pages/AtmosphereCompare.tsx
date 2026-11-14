// Side-by-side compare of two to four atmospheres. Each column is a reading of the probe grid at that
// point, shown with the same rows so the eye can run across them. It never ranks the columns.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FuelMarker } from "../components/Common";
import { flameAt, FuelRows, PointHeadline, prebreatheFor, type FlameFile, type PrebreatheFile } from "../components/EvidencePanel";
import { Value } from "../components/Value";
import { useData } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import { decodeGrid, readAt, type Grid, type ProbeGridFile } from "../lib/probe";
import type { Candidate, CandidateEvidence } from "../lib/types";
import { parsePoint } from "../lib/view";

const MAX = 4;

export function parsePoints(raw: string | null): { o2: number; psi: number }[] {
  return (raw ?? "")
    .split(";")
    .map((s) => s.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map(([o2, psi]) => ({ o2, psi }))
    .slice(0, MAX);
}

export function CompareColumns({ grid, points, m, candidates, candEv, flame, pb, onRemove }: {
  grid: Grid; points: { o2: number; psi: number }[]; m: number; candidates: Candidate[]; candEv: CandidateEvidence[];
  flame?: FlameFile; pb?: PrebreatheFile; onRemove?: (i: number) => void;
}) {
  const cols = points.map((p) => {
    const r = readAt(grid, p.o2, p.psi, m);
    const c = candidates.find((x) => x.o2_pct.v === r.o2.v && x.pressure_psi.v === r.psi.v) ?? null;
    const ce = c ? candEv.find((e) => e.candidate_id === c.id) ?? null : null;
    return { r, c, ce, flame: flameAt(flame, r.o2.v, r.psi.v, ce), pb: prebreatheFor(pb, c) };
  });
  const row = "border-t border-line px-4 py-4";
  return (
    <div className="grid gap-px overflow-x-auto rounded-lg border border-line bg-[color:var(--line)]" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(260px, 1fr))` }}>
      {cols.map(({ r, c, flame: ft, pb: p }, i) => (
        <section key={i} className="flex flex-col bg-[color:var(--surface-2)]" aria-label={`Atmosphere ${i + 1}`}>
          <header className="px-4 pb-4 pt-4">
            <div className="flex items-start justify-between gap-2">
              <span className="eyebrow">{c ? c.short : "Point on the plane"}</span>
              {onRemove && points.length > 2 && <button type="button" className="btn btn-sm btn-quiet" onClick={() => onRemove(i)} aria-label="Remove this column">Remove</button>}
            </div>
            <p className="mt-2 text-lg font-semibold"><Value val={r.o2} digits={1} /> · <Value val={r.psi} digits={1} /></p>
            <p className="text-sm text-ink-2"><Value val={r.kpa} digits={1} /></p>
            <p className="mt-3 min-h-[48px] text-sm leading-snug"><PointHeadline r={r} /></p>
          </header>
          <div className={row}><FuelRows r={r} /></div>
          <div className={row}>
            <div className="eyebrow mb-2">Oxygen matches, pressure not recorded</div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              {(["solid", "emulator"] as const).map((f) => (
                <div key={f} className="contents"><dt className="flex items-center gap-2 text-ink-2"><FuelMarker fuel={f} size={12} />{FUEL_LABEL[f]}</dt><dd className="font-semibold"><Value val={r.o2m[f]} unit={false} /></dd></div>
              ))}
            </dl>
          </div>
          <div className={row}>
            <div className="eyebrow mb-2">Flame temperature</div>
            {ft ? <p className="text-sm"><Value val={ft.value} digits={0} approximate={ft.approximate} />{!ft.exact && ft.at && <span className="text-ink-3"> at <Value val={ft.at.o2} digits={1} />, <Value val={ft.at.psi} digits={1} /></span>}</p> : <p className="text-sm text-ink-3">Not computed here</p>}
          </div>
          <div className={row}>
            <div className="eyebrow mb-2">Prebreathe</div>
            <p className="text-sm text-ink-2">{p.kind === "published" ? p.point.duration_text : p.kind === "pending" ? "Published figure awaiting verification" : "No published figure"}</p>
          </div>
          <div className={`${row} mt-auto flex flex-wrap gap-2`}>
            <Link className="btn btn-sm" to={`/?o2=${r.o2.v}&p=${r.psi.v}${m !== 1 ? `&m=${m}` : ""}`}>Open on the plane</Link>
            {c && <Link className="btn btn-sm" to={`/dossiers/candidate/${c.id}`}>Dossier</Link>}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function AtmosphereCompare() {
  const [sp, setSp] = useSearchParams();
  const probe = useData<ProbeGridFile>("probe_grid.json");
  const cands = useData<{ candidates: Candidate[] }>("candidates.json");
  const candEv = useData<{ evidence: CandidateEvidence[] }>("candidate_evidence.json");
  const flame = useData<FlameFile>("flame_temperature_grid.json");
  const pb = useData<PrebreatheFile>("prebreathe.json");
  const grid = useMemo(() => (probe.data ? decodeGrid(probe.data) : null), [probe.data]);
  const [add, setAdd] = useState("");
  const m = Number(sp.get("m") ?? 1) || 1;
  const parsed = parsePoints(sp.get("pts"));
  const points = parsed.length >= 2 ? parsed : cands.data ? cands.data.candidates.filter((c) => c.role !== "suit").slice(1, 4).map((c) => ({ o2: c.o2_pct.v, psi: c.pressure_psi.v })) : [];
  const setPoints = (pts: { o2: number; psi: number }[]) => {
    const next = new URLSearchParams(sp);
    next.set("pts", pts.map((p) => `${p.o2},${p.psi}`).join(";"));
    setSp(next, { replace: true });
  };

  return (
    <div>
      <header className="mb-6 max-w-3xl">
        <span className="eyebrow">Compare atmospheres</span>
        <h1 className="mt-2 text-xl font-semibold leading-tight">What is known about fire at each atmosphere, side by side.</h1>
        <p className="mt-2 text-sm text-ink-2">Columns are not ranked. Each shows the build&apos;s counts at that point of the plane, at the same nearness step size. Empty means unknown, never safe.</p>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {cands.data?.candidates.map((c) => {
          const on = points.some((p) => p.o2 === c.o2_pct.v && p.psi === c.pressure_psi.v);
          return (
            <button key={c.id} type="button" className="chip h-8 text-xs" aria-pressed={on} disabled={!on && points.length >= MAX}
              onClick={() => setPoints(on ? points.filter((p) => !(p.o2 === c.o2_pct.v && p.psi === c.pressure_psi.v)) : [...points, { o2: c.o2_pct.v, psi: c.pressure_psi.v }])}>
              {c.name.replace(" O2", "")}
            </button>
          );
        })}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const p = parsePoint(add); if (p && points.length < MAX) { setPoints([...points, p]); setAdd(""); } }}>
          <label htmlFor="add-point" className="sr-only">Add a point, for example 30% 9 psi</label>
          <input id="add-point" className="field h-8 w-48" placeholder="Add 30% 9 psi" value={add} onChange={(e) => setAdd(e.target.value)} />
          <button type="submit" className="btn" disabled={points.length >= MAX}>Add</button>
        </form>
        <span className="seg ml-auto" role="group" aria-label="Nearness step size">
          {(grid?.multipliers ?? [0.75, 1, 1.5]).map((x) => (
            <button key={x} type="button" aria-pressed={x === m} onClick={() => { const n = new URLSearchParams(sp); if (x === 1) n.delete("m"); else n.set("m", String(x)); setSp(n, { replace: true }); }}>{x}x</button>
          ))}
        </span>
      </div>
      {grid && cands.data && candEv.data ? (
        <CompareColumns grid={grid} points={points} m={m} candidates={cands.data.candidates} candEv={candEv.data.evidence} flame={flame.data} pb={pb.data} onRemove={(i) => setPoints(points.filter((_, k) => k !== i))} />
      ) : (
        <div className="grid grid-cols-3 gap-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-96" />)}</div>
      )}
    </div>
  );
}
