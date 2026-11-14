// The trade map with its controls. Every control lives in the URL so a view can be shared.
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChartFrame, FuelLegend, SourceLegend } from "../components/Common";
import { Value } from "../components/Value";
import { useData } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import type { Candidate, CandidateEvidence, Val } from "../lib/types";
import { ALL_LAYERS, type FlameGrid, type Layer, type PlannerCell, type PrebreathePoint, TradeMap, type TradeMapData, ZOOMS, type ZoomKey } from "./TradeMap";

const DEFAULT_LAYERS: Layer[] = ["cand", "ev", "strip", "blind", "ft", "pb"];

export function useMapState(defaults: { zoom?: ZoomKey; solids?: boolean; highlight?: string } = {}) {
  const [sp, setSp] = useSearchParams();
  const layers = new Set<Layer>((sp.get("layers")?.split(",").filter(Boolean) as Layer[]) ?? DEFAULT_LAYERS);
  const zoom = (sp.get("zoom") as ZoomKey) || defaults.zoom || "habitat";
  const solidsOnly = sp.has("solids") ? sp.get("solids") === "1" : !!defaults.solids;
  const highlight = sp.get("sel") ?? defaults.highlight;
  const update = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setSp(next, { replace: true });
  };
  return {
    layers, zoom, solidsOnly, highlight,
    toggleLayer: (l: Layer) => {
      const s = new Set(layers);
      if (s.has(l)) s.delete(l);
      else s.add(l);
      update("layers", [...s].join(","));
    },
    setZoom: (z: ZoomKey) => update("zoom", z),
    setSolids: (on: boolean) => update("solids", on ? "1" : "0"),
    setHighlight: (id: string | null) => update("sel", id),
  };
}

export function TradeMapPanel({ height = 620, defaults = {}, compact = false }: { height?: number; defaults?: { zoom?: ZoomKey; solids?: boolean; highlight?: string }; compact?: boolean }) {
  const st = useMapState(defaults);
  const map = useData<TradeMapData>("trade_map.json");
  const cands = useData<{ candidates: Candidate[] }>("candidates.json");
  const ev = useData<{ evidence: CandidateEvidence[]; steps: { threshold: Val<number>; o2_step: Val<number>; pressure_ratio: Val<number> } }>("candidate_evidence.json");
  const grid = useData<FlameGrid>("flame_temperature_grid.json");
  const planner = useData<{ cells: PlannerCell[] }>("planner_grid.json");
  const pb = useData<{ points: PrebreathePoint[]; pending: { atmosphere: string; status: string }[]; caveat: string }>("prebreathe.json");

  const table = useMemo(() => {
    if (!cands.data || !ev.data) return null;
    const byId = new Map(ev.data.evidence.map((e) => [e.candidate_id, e]));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Tests near each candidate atmosphere, by fuel class and source</caption>
          <thead className="text-left text-xs text-ink-3">
            <tr>
              <th className="py-1 pr-3">Candidate</th>
              {(["gas", "droplet", "solid", "emulator"] as const).map((f) => <th key={f} className="pr-3">{FUEL_LABEL[f]} (PSI / paper)</th>)}
              <th className="pr-3">O2 matches, pressure not recorded</th>
              <th>Flame temperature</th>
            </tr>
          </thead>
          <tbody>
            {cands.data.candidates.map((c) => {
              const e = byId.get(c.id)!;
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-1.5 pr-3"><Link className="underline" to={`/dossiers/candidate/${c.id}`}>{c.name}</Link></td>
                  {(["gas", "droplet", "solid", "emulator"] as const).map((f) => (
                    <td key={f} className="pr-3"><Value val={e.near[f].psi_table} unit={false} /> / <Value val={e.near[f].published_paper} unit={false} /></td>
                  ))}
                  <td className="pr-3">
                    {(["gas", "droplet", "solid", "emulator"] as const).map((f) => (
                      <span key={f} className="mr-2">{f[0].toUpperCase()}: <Value val={e.o2_match_pressure_unknown[f]} unit={false} /></span>
                    ))}
                  </td>
                  <td><Value val={e.flame_temperature} digits={0} approximate={e.flame_temperature.approximate} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }, [cands.data, ev.data]);

  if (!map.data || !cands.data || !ev.data) return <p className="p-6 text-sm text-ink-3">Loading the trade map...</p>;

  return (
    <ChartFrame
      id="trade-map"
      title="Trade Map: oxygen against cabin pressure"
      caption="Each glyph is one or more microgravity fire tests at the recorded oxygen and pressure, coloured and shaped by fuel class. Hover or select a candidate to see its nearness region. Hatched cells have no tests nearby: unknown, not low risk. Flame temperature lines explain how hot a flame can get; they do not predict ignition or spread."
      sources="NASA PSI experiment tables (DOI per investigation); human-verified papers (NTRS); Cantera with GRI-Mech 3.0."
      table={table}
      actions={
        <>
          <label className="flex items-center gap-1.5 rounded border border-line px-2 py-1">
            <input type="checkbox" checked={st.solidsOnly} onChange={(e) => st.setSolids(e.target.checked)} />
            Solids only
          </label>
          <span className="flex overflow-hidden rounded border border-line" role="group" aria-label="Zoom">
            {(Object.keys(ZOOMS) as ZoomKey[]).map((k) => (
              <button key={k} type="button" aria-pressed={st.zoom === k} onClick={() => st.setZoom(k)} className={`px-2 py-1 ${st.zoom === k ? "bg-surface-3 font-medium" : "hover:bg-surface-3"}`}>
                {ZOOMS[k].label}
              </button>
            ))}
          </span>
        </>
      }
    >
      {!compact && (
        <fieldset className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <legend className="sr-only">Layers</legend>
          {ALL_LAYERS.map((l) => (
            <label key={l.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={st.layers.has(l.id)} onChange={() => st.toggleLayer(l.id)} />
              {l.label}
            </label>
          ))}
        </fieldset>
      )}
      <TradeMap
        map={map.data}
        candidates={cands.data.candidates}
        evidence={ev.data.evidence}
        grid={grid.data}
        planner={planner.data?.cells}
        prebreathe={pb.data?.points}
        layers={st.layers}
        solidsOnly={st.solidsOnly}
        zoom={st.zoom}
        highlight={st.highlight}
        height={height}
        steps={ev.data.steps}
      />
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-ink-2">
          Near means within <Value val={ev.data.steps.threshold} digits={1} /> of a candidate, where one step is <Value val={ev.data.steps.o2_step} /> or a pressure ratio of <Value val={ev.data.steps.pressure_ratio} digits={2} />. <Link className="underline" to="/methods">How this was chosen</Link>
        </p>
        <FuelLegend />
        <SourceLegend />
        <p className="text-xs text-ink-3">
          Inverse flames (oxygen supplied through the burner, not the atmosphere) are not placed on this plane: <Value val={map.data.inverse_flames} />.
          {pb.data && pb.data.points.length === 0 && (
            <> Prebreathe: published figures exist for {pb.data.pending.length} candidates and appear here once a team member has verified them against the source.</>
          )}
        </p>
      </div>
    </ChartFrame>
  );
}
