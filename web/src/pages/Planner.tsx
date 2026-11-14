// Test Planner: where would one more microgravity fire test add the most to the evidence near the
// habitat candidates? It ranks gaps in the evidence, never atmospheres. Every priority, count and
// ranking comes from planner_grid.json; the page only lays them out. View state (preset, selected cell)
// lives in the URL so a view can be shared.
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChartFrame, ErrorNote, FuelLegend, FuelMarker, Loading, PageHeader } from "../components/Common";
import { Pressure, Value } from "../components/Value";
import { useData } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import type { Candidate, Val } from "../lib/types";
import { PlannerHeatmap } from "../charts/plannerHeatmap";
import {
  Callout,
  type CandidateEvidenceFile,
  type CandidatesFile,
  CountCell,
  param,
  PlannerFormula,
  type PlannerFile,
  type PlannerGridCell,
  PRESET_BLURB,
  PRESET_LABEL,
  PresetWeights,
  PRESETS,
  type PresetKey,
} from "../charts/plannerShared";

const TOP_N = 30;

function usePlannerState() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("preset");
  const preset: PresetKey = PRESETS.includes(raw as PresetKey) ? (raw as PresetKey) : "balanced";
  const selected = sp.get("cell");
  const update = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setSp(next, { replace: true });
  };
  return { preset, selected, setPreset: (p: PresetKey) => update("preset", p === "balanced" ? null : p), select: (id: string | null) => update("cell", id) };
}

/** psi with kPa beside it. kPa comes from the cell when the build writes it, else from a candidate at the same pressure. */
function LevelPressure({ psi, gridP, kpaByPsi, cell }: { psi: number; gridP: string; kpaByPsi: Map<number, Val<number>>; cell?: PlannerGridCell }) {
  const psiVal = param(psi, gridP, "psi");
  const kpa = cell?.pressure_kpa ?? kpaByPsi.get(psi);
  if (kpa) return <Pressure psi={psiVal} kpa={kpa} />;
  return (
    <span className="whitespace-nowrap">
      <Value val={psiVal} digits={1} /> <span className="text-xs text-ink-3">(kPa not in snapshot)</span>
    </span>
  );
}

function NearestList({ cell }: { cell: PlannerGridCell }) {
  if (cell.nearest.length === 0) {
    return <span className="text-ink-3">none within the nearness threshold</span>;
  }
  return (
    <ul className="space-y-0.5">
      {cell.nearest.map((t) => (
        <li key={t.test_id} className="flex flex-wrap items-baseline gap-x-1.5">
          <Link className="mono text-xs underline decoration-ink-3 underline-offset-2 hover:decoration-solid" to={`/evidence?ids=${encodeURIComponent(t.test_id)}`}>
            {t.test_id}
          </Link>
          <span className="text-xs text-ink-3">{t.investigation},</span>
          <span className="text-xs"><Value val={t.distance} digits={2} /></span>
        </li>
      ))}
    </ul>
  );
}

function PresetPicker({ preset, onChange }: { preset: PresetKey; onChange: (p: PresetKey) => void }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span id="preset-label" className="text-sm font-medium">Weight preset</span>
      <div className="inline-flex max-w-full self-start overflow-hidden rounded-lg border border-line text-sm" role="group" aria-labelledby="preset-label">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preset === p}
            onClick={() => onChange(p)}
            className={`whitespace-nowrap border-line px-2.5 py-1.5 sm:px-3 [&:not(:first-child)]:border-l ${preset === p ? "bg-accent font-medium text-accent-ink" : "bg-surface-2 hover:bg-surface-3"}`}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
      </div>
      <span className="text-xs text-ink-2">{PRESET_BLURB[preset]}</span>
    </div>
  );
}

function HeatLegend({ top, preset }: { top?: PlannerGridCell; preset: PresetKey }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2" aria-label="Heat map legend">
      <li className="flex items-center gap-2">
        <span>Priority</span>
        <span className="relative inline-block h-3 w-28 overflow-hidden rounded-sm border border-line bg-surface-2" aria-hidden="true">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent to-accent opacity-90" />
        </span>
        <span>
          lower to higher{top && <> (highest in this preset: <Value val={top.priority[preset]} digits={3} />)</>}
        </span>
      </li>
      <li className="flex items-center gap-1.5">
        <span className="hatch-bg inline-block h-3 w-5 rounded-sm border border-line" aria-hidden="true" /> No tests recorded nearby (hatched)
      </li>
      <li className="flex items-center gap-1.5">
        <svg width={12} height={12} viewBox="-6 -6 12 12" aria-hidden="true">
          <circle r={4.5} fill="var(--surface-2)" stroke="var(--candidate)" strokeWidth={1.75} />
          <circle r={1.6} fill="var(--candidate)" />
        </svg>
        Candidate atmosphere in this cell
      </li>
      <li>Number in a cell: existing tests near it</li>
    </ul>
  );
}

function CellTable({ grid, preset, kpaByPsi, onSelect }: { grid: PlannerFile; preset: PresetKey; kpaByPsi: Map<number, Val<number>>; onSelect: (id: string) => void }) {
  const byId = new Map(grid.cells.map((c) => [c.id, c]));
  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">All {PRESET_LABEL[preset]} planner cells in the build's ranked order</caption>
        <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-3">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">Cell</th>
            <th scope="col" className="py-1 pr-3 font-medium">Material</th>
            <th scope="col" className="py-1 pr-3 font-medium">O2</th>
            <th scope="col" className="py-1 pr-3 font-medium">Pressure</th>
            <th scope="col" className="py-1 pr-3 font-medium">Tests near</th>
            <th scope="col" className="py-1 pr-3 font-medium">Relevance</th>
            <th scope="col" className="py-1 font-medium">Priority</th>
          </tr>
        </thead>
        <tbody>
          {grid.rankings[preset].map((id) => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <tr key={id} className="border-t border-line">
                <td className="py-1 pr-3">
                  <button type="button" className="mono text-xs underline decoration-ink-3 underline-offset-2" onClick={() => onSelect(id)}>{id}</button>
                </td>
                <td className="pr-3"><FuelMarker fuel={c.material} /> <span className="ml-1">{FUEL_LABEL[c.material]}</span></td>
                <td className="pr-3"><Value val={param(c.o2_pct, grid.p, "%")} /></td>
                <td className="pr-3"><LevelPressure psi={c.pressure_psi} gridP={grid.p} kpaByPsi={kpaByPsi} cell={c} /></td>
                <td className="pr-3"><CountCell val={c.n_near} compact /></td>
                <td className="pr-3"><Value val={c.relevance} digits={3} /></td>
                <td><Value val={c.priority[preset]} digits={3} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RankedList({ grid, preset, selected, onSelect, kpaByPsi, candAt }: {
  grid: PlannerFile;
  preset: PresetKey;
  selected: string | null;
  onSelect: (id: string) => void;
  kpaByPsi: Map<number, Val<number>>;
  candAt: Map<string, Candidate[]>;
}) {
  const byId = new Map(grid.cells.map((c) => [c.id, c]));
  const ids = grid.rankings[preset].slice(0, TOP_N);
  return (
    <section className="card min-w-0 p-4" aria-labelledby="ranked-h">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ranked-h" className="text-base font-semibold">Evidence gaps, in the build's order ({PRESET_LABEL[preset]})</h2>
        <span className="text-xs text-ink-3">First {TOP_N} cells of the ranking; select a row to see it on the heat map</span>
      </div>
      <p className="mb-3 max-w-3xl text-xs text-ink-2">
        Each row is an untested or thinly tested combination of atmosphere and material class. Its place says how much one more test there would add to the evidence near the habitat candidates, under the weights shown. It says nothing about the atmosphere itself.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">Planner cells ranked by priority under the {PRESET_LABEL[preset]} preset, with the nearest existing tests</caption>
          <thead className="text-left text-xs text-ink-3">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Rank</th>
              <th scope="col" className="py-1 pr-3 font-medium">Cell</th>
              <th scope="col" className="py-1 pr-3 font-medium">Material</th>
              <th scope="col" className="py-1 pr-3 font-medium">Tests near</th>
              <th scope="col" className="py-1 pr-3 font-medium">Priority</th>
              <th scope="col" className="py-1 font-medium">Nearest existing tests (distance)</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id, i) => {
              const c = byId.get(id);
              if (!c) return null;
              const on = id === selected;
              const cands = candAt.get(`${c.o2_pct}|${c.pressure_psi}`) ?? [];
              return (
                <tr key={id} className={`border-t border-line align-top ${on ? "bg-surface-3" : ""}`} aria-current={on ? "true" : undefined}>
                  <td className="num py-2 pr-3 text-ink-2">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-medium">
                        <Value val={param(c.o2_pct, grid.p, "%")} /> O2
                      </span>
                      <span className="text-ink-2">
                        <LevelPressure psi={c.pressure_psi} gridP={grid.p} kpaByPsi={kpaByPsi} cell={c} />
                      </span>
                    </div>
                    {cands.length > 0 && <div className="mt-0.5 text-xs text-ink-3">Candidate here: {cands.map((x) => x.short).join(", ")}</div>}
                    <button
                      type="button"
                      onClick={() => onSelect(id)}
                      aria-pressed={on}
                      aria-label={`Show ${c.o2_pct}% O2, ${c.pressure_psi} psi, ${FUEL_LABEL[c.material]} on the heat map`}
                      className="mt-1 rounded border border-line px-1.5 py-0.5 text-xs text-ink-2 hover:bg-surface-3"
                    >
                      {on ? "Shown on map" : "Show on map"}
                    </button>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3"><FuelMarker fuel={c.material} /> <span className="ml-1">{FUEL_LABEL[c.material]}</span></td>
                  <td className="py-2 pr-3"><CountCell val={c.n_near} /></td>
                  <td className="py-2 pr-3"><Value val={c.priority[preset]} digits={3} /></td>
                  <td className="py-2"><NearestList cell={c} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CellDetail({ cell, grid, kpaByPsi, cands, onClear }: { cell?: PlannerGridCell; grid: PlannerFile; kpaByPsi: Map<number, Val<number>>; cands: Candidate[]; onClear: () => void }) {
  if (!cell) {
    return (
      <section className="card p-4" aria-labelledby="cell-h">
        <h2 id="cell-h" className="text-base font-semibold">Selected cell</h2>
        <p className="mt-1 text-sm text-ink-2">Select a cell in the heat map (click it, or Tab into a panel, move with the arrow keys and press Enter) or a row of the list to see its numbers and nearest tests.</p>
      </section>
    );
  }
  return (
    <section className="card p-4" aria-labelledby="cell-h" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <h2 id="cell-h" className="text-base font-semibold">
          <FuelMarker fuel={cell.material} /> <span className="ml-1">{FUEL_LABEL[cell.material]}</span>
          <span className="block text-sm font-normal text-ink-2">
            <Value val={param(cell.o2_pct, grid.p, "%")} /> O2 at <LevelPressure psi={cell.pressure_psi} gridP={grid.p} kpaByPsi={kpaByPsi} cell={cell} />
          </span>
        </h2>
        <button type="button" onClick={onClear} className="rounded border border-line px-2 py-1 text-xs hover:bg-surface-3">Clear</button>
      </div>
      <p className="mono mt-1 text-xs text-ink-3">{cell.id}</p>
      {cands.length > 0 && (
        <p className="mt-2 text-sm">
          Candidate atmosphere in this cell:{" "}
          {cands.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link className="underline" to={`/dossiers/candidate/${c.id}`}>{c.short}</Link>
            </span>
          ))}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-2">Existing tests near</dt>
        <dd className="text-right"><CountCell val={cell.n_near} /></dd>
        <dt className="text-ink-2">Habitat relevance</dt>
        <dd className="text-right"><Value val={cell.relevance} digits={3} /></dd>
        {PRESETS.map((p) => (
          <div key={p} className="contents">
            <dt className="text-ink-2">Priority, {PRESET_LABEL[p].toLowerCase()}</dt>
            <dd className="text-right"><Value val={cell.priority[p]} digits={3} /></dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-4 text-sm font-semibold">Nearest existing tests</h3>
      <div className="mt-1 text-sm">
        <NearestList cell={cell} />
      </div>
      {cell.nearest.length > 0 && (
        <Link className="mt-2 inline-block text-xs underline" to={`/evidence?ids=${encodeURIComponent(cell.nearest.map((t) => t.test_id).join(","))}`}>
          Open these tests in the Evidence Explorer
        </Link>
      )}
      <p className="mt-3 text-xs text-ink-3">The full list of tests counted near this cell is in the provenance of its count (open the count above).</p>
    </section>
  );
}

export default function Planner() {
  const st = usePlannerState();
  const grid = useData<PlannerFile>("planner_grid.json");
  const cands = useData<CandidatesFile>("candidates.json");
  const ev = useData<CandidateEvidenceFile>("candidate_evidence.json");

  const kpaByPsi = useMemo(() => {
    const m = new Map<number, Val<number>>();
    for (const c of cands.data?.candidates ?? []) m.set(c.pressure_psi.v, c.pressure_kpa);
    for (const c of grid.data?.cells ?? []) if (c.pressure_kpa) m.set(c.pressure_psi, c.pressure_kpa);
    return m;
  }, [cands.data, grid.data]);

  const candAt = useMemo(() => {
    const m = new Map<string, Candidate[]>();
    for (const c of cands.data?.candidates ?? []) {
      const k = `${c.o2_pct.v}|${c.pressure_psi.v}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [cands.data]);

  if (grid.error) return <ErrorNote error={grid.error} />;
  if (!grid.data || !cands.data) return <Loading what="the test planner" />;
  const g = grid.data;
  const byId = new Map(g.cells.map((c) => [c.id, c]));
  const sel = st.selected ? byId.get(st.selected) : undefined;
  const top = byId.get(g.rankings[st.preset][0]);
  const selCands = sel ? candAt.get(`${sel.o2_pct}|${sel.pressure_psi}`) ?? [] : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Test Planner"
        lead={
          <>
            Where would one more microgravity fire test add the most to the evidence near the habitat candidates? The plane is cut into levels of oxygen and pressure, crossed with three material classes. Each cell gets a priority from how relevant it is to the habitat candidates, the weight of its material class, and how few tests already sit near it.
          </>
        }
      />

      <Callout title="The planner ranks gaps in the evidence, never atmospheres.">
        Weights, levels and the constant <Value val={param(g.params.evidence_constant, g.p)} /> are judgement. A high priority means a test there would add a lot to what is known; it says nothing about how an atmosphere behaves. Read the{" "}
        <Link className="underline" to="/methods#planner">method</Link>.
      </Callout>

      <PresetPicker preset={st.preset} onChange={st.setPreset} />

      <ChartFrame
        id={`planner-heat-map-${st.preset}`}
        title={`Evidence gaps by material class (${PRESET_LABEL[st.preset]} preset)`}
        caption={`Each panel is one material class; columns are the planner's oxygen levels and rows its pressure levels. Shading is priority under the ${PRESET_LABEL[st.preset]} preset, darker meaning a test would add more. Hatched cells have no tests recorded nearby: unknown, not low risk. Rings mark candidate atmospheres. Priorities are judgement-weighted and rank evidence gaps, not atmospheres.`}
        sources="planner_grid.json (Redshift build, from NASA PSI experiment tables); candidates.json."
        table={<CellTable grid={g} preset={st.preset} kpaByPsi={kpaByPsi} onSelect={st.select} />}
      >
        <PlannerHeatmap grid={g} preset={st.preset} candidates={cands.data.candidates} selected={st.selected} onSelect={st.select} kpaByPsi={kpaByPsi} />
        <div className="mt-3 flex flex-col gap-2">
          <HeatLegend top={top} preset={st.preset} />
          <FuelLegend classes={g.params.material_classes} />
          <p className="text-xs text-ink-3">
            The planner grid covers the solid, droplet and gas classes; the solid emulator (BRE) is not part of it. Under a preset that gives a class no weight, its cells are unshaded but still show their tests and gaps.
          </p>
        </div>
      </ChartFrame>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <RankedList grid={g} preset={st.preset} selected={st.selected} onSelect={st.select} kpaByPsi={kpaByPsi} candAt={candAt} />
        <div className="min-w-0 space-y-5">
          <CellDetail cell={sel} grid={g} kpaByPsi={kpaByPsi} cands={selCands} onClear={() => st.select(null)} />
          <section className="card p-4" aria-labelledby="formula-h">
            <h2 id="formula-h" className="text-base font-semibold">How the priority is worked out</h2>
            <PlannerFormula grid={g} nearness={ev.data?.params} nearP={ev.data?.p} />
            <h3 className="mt-4 text-sm font-semibold">Preset weights</h3>
            <PresetWeights grid={g} active={st.preset} />
            <p className="mt-3 text-xs text-ink-3">{g.params.judgement}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
