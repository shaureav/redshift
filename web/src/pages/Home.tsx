// The plane, full screen, with the live evidence panel docked beside it. This page is the product:
// pick an atmosphere (drag, click, arrow keys or a candidate chip), see the evidence instantly, go deeper,
// take it with you. Every view state lives in the URL.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AccessGap, type AccessGapData } from "../charts/AccessGap";
import { Plane, type ProbeMode } from "../charts/Plane";
import type { PlannerCell, TradeMapData } from "../charts/TradeMap";
import { AskBox } from "../components/AskBox";
import { FuelMarker } from "../components/Common";
import { EvidencePanelView, flameAt, prebreatheFor, type FlameFile, type PanelData, type PrebreatheFile } from "../components/EvidencePanel";
import { Tour } from "../components/Tour";
import { Value } from "../components/Value";
import { useData } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import { decodeGrid, inGrid, nearInputs, readAt, type ProbeGridFile } from "../lib/probe";
import type { Candidate, CandidateEvidence, Val } from "../lib/types";
import { LAYERS, useView, ZOOMS, type Box, type ZoomKey } from "../lib/view";

const KPA_PER_PSI = 6.894757293168361; // selection filter only; never printed

type CandEvFile = { evidence: CandidateEvidence[]; steps: { threshold: Val<number>; o2_step: Val<number>; pressure_ratio: Val<number> } };

export default function Home() {
  const [view, setView] = useView();
  const navigate = useNavigate();
  const probeFile = useData<ProbeGridFile>("probe_grid.json");
  const map = useData<TradeMapData>("trade_map.json");
  const cands = useData<{ candidates: Candidate[] }>("candidates.json");
  const candEv = useData<CandEvFile>("candidate_evidence.json");
  const flame = useData<FlameFile>("flame_temperature_grid.json");
  const planner = useData<{ cells: PlannerCell[] }>("planner_grid.json");
  const pb = useData<PrebreatheFile>("prebreathe.json");
  const gap = useData<AccessGapData>("access_gap.json");

  const grid = useMemo(() => (probeFile.data ? decodeGrid(probeFile.data) : null), [probeFile.data]);
  const [preview, setPreview] = useState<{ o2: number; psi: number } | null>(null);
  const [drag, setDrag] = useState<{ o2: number; psi: number } | null>(null);
  const [brushMode, setBrushMode] = useState(false);
  const [copied, setCopied] = useState(false);

  // The tour's step 3 shows the access gap: 8.2 psi, 34% O2, solids only. A stable callback (setView is
  // stable), and the tour runs it once per step, so the view change cannot re-trigger it.
  const onTourStep = useCallback(
    (step: number) => {
      if (step === 2) setView({ o2: 34, psi: 8.2, solids: true });
    },
    [setView],
  );

  const pinned = { o2: view.o2, psi: view.psi };
  const shown = drag ?? preview ?? pinned;

  const onProbe = useCallback(
    (o2: number, psi: number, mode: ProbeMode) => {
      if (mode === "hover") return setPreview({ o2, psi });
      if (mode === "drag") return setDrag({ o2, psi });
      setDrag(null);
      setPreview(null);
      setView({ o2, psi });
    },
    [setView],
  );

  const data: PanelData | null = useMemo(() => {
    if (!grid || !cands.data || !candEv.data) return null;
    const r = readAt(grid, shown.o2, shown.psi, view.m);
    const candidate = cands.data.candidates.find((c) => c.o2_pct.v === r.o2.v && c.pressure_psi.v === r.psi.v) ?? null;
    const ce = candidate ? candEv.data.evidence.find((e) => e.candidate_id === candidate.id) ?? null : null;
    return {
      reading: r,
      near: nearInputs(grid, r.i, r.j, view.m),
      o2match: [],
      candidate,
      candEv: ce,
      flame: flameAt(flame.data, r.o2.v, r.psi.v, ce),
      prebreathe: prebreatheFor(pb.data, candidate),
      gap: gap.data ?? null,
      steps: candEv.data.steps,
      multipliers: grid.multipliers,
      preview: !!(drag || preview),
      outside: !inGrid(grid, shown.o2, shown.psi),
    };
  }, [grid, cands.data, candEv.data, flame.data, pb.data, gap.data, shown.o2, shown.psi, view.m, drag, preview]);

  // Tests inside a brushed area: a filter of the reader's own making, like the Evidence Explorer's.
  const selection = useMemo(() => {
    if (!view.box || !grid) return null;
    const b = view.box;
    const ids = grid.file.inputs
      .filter((t) => t.o2?.v != null && t.kpa?.v != null && t.o2.v >= b.o2[0] && t.o2.v <= b.o2[1] && t.kpa.v / KPA_PER_PSI >= b.psi[0] && t.kpa.v / KPA_PER_PSI <= b.psi[1])
      .map((t) => t.id);
    return { box: b, ids };
  }, [view.box, grid]);

  const share = () => {
    try {
      void navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable: the address bar holds the same link */
    }
  };

  const habitatHeadline = useMemo(() => {
    if (!cands.data || !candEv.data) return null;
    const habitats = cands.data.candidates.filter((c) => c.role !== "suit");
    const ev = habitats.map((c) => candEv.data!.evidence.find((e) => e.candidate_id === c.id)!);
    const noSolid = ev.every((e) => e.near.solid.psi_table.v === 0 && e.near.solid.published_paper.v === 0);
    const someOther = ev.some((e) => e.near.gas.psi_table.v + e.near.droplet.psi_table.v > 0);
    return noSolid && someOther;
  }, [cands.data, candEv.data]);

  const loading = !grid || !map.data || !cands.data || !candEv.data;
  const failed = probeFile.error || map.error || cands.error || candEv.error;
  const gapSteps = gap.data?.psi_steps;

  if (failed) return <LoadError onRetry={() => window.location.reload()} />;
  if (loading || !data) return <PlaneSkeleton />;

  const candId = data.candidate?.id;
  const pointQs = `o2=${data.reading.o2.v}&p=${data.reading.psi.v}${view.m !== 1 ? `&m=${view.m}` : ""}`;

  return (
    <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:h-[calc(100vh-56px)] lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-1 lg:overflow-hidden">
      <section className="flex min-h-0 flex-col" aria-label="The oxygen and pressure plane">
        <header className="flex flex-col gap-3 px-4 pb-2 pt-4 lg:px-6">
          <h1 className="max-w-4xl text-lg font-semibold leading-snug lg:text-xl" aria-live="polite">
            {view.solids ? (
              gapSteps && gapSteps[2]?.count.v === 0 ? (
                <>No solid burn in PSI&apos;s tables records pressure.{" "}
                  <span className="text-ink-2">Of <Value val={gapSteps[0].count} unit={false} /> solid-fuel burn rows, <Value val={gapSteps[1].count} unit={false} /> record oxygen and <Value val={gapSteps[2].count} unit={false} /> record pressure.</span></>
              ) : (
                <>Solid-material tests by oxygen and cabin pressure.</>
              )
            ) : habitatHeadline ? (
              <>Near the candidate habitat atmospheres, PSI&apos;s tables hold gas and droplet tests, but no solid burns.</>
            ) : (
              <>Microgravity fire tests by oxygen and cabin pressure.</>
            )}
          </h1>
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {/* On a phone the controls scroll sideways in one row, so the plane stays above the fold. */}
            <button type="button" role="switch" aria-checked={view.solids} onClick={() => setView({ solids: !view.solids })} className={`chip ${view.solids ? "border-[color:var(--solid)] text-ink" : ""}`} id="tour-solids">
              <span className="switch" aria-checked={view.solids} aria-hidden="true" /> Solids only
            </button>
            <span className="mx-1 hidden h-6 w-px bg-[color:var(--line)] sm:block" aria-hidden="true" />
            <span className="flex flex-none gap-1 sm:flex-wrap" role="group" aria-label="Snap to a candidate atmosphere">
              {cands.data.candidates.map((c) => (
                <button key={c.id} type="button" className="chip h-8 px-3 text-xs" aria-pressed={candId === c.id} onClick={() => onProbe(c.o2_pct.v, c.pressure_psi.v, "commit")}>
                  {c.name.replace(" O2", "")}
                </button>
              ))}
            </span>
            <span className="ml-auto flex flex-none items-center gap-2">
              <LayerMenu layers={view.layers} onToggle={(l) => { const s = new Set(view.layers); if (s.has(l)) s.delete(l); else s.add(l); setView({ layers: s }); }} />
              <span className="seg" role="group" aria-label="Zoom">
                {(Object.keys(ZOOMS) as ZoomKey[]).map((k) => (
                  <button key={k} type="button" aria-pressed={view.zoom === k} onClick={() => setView({ zoom: k })}>{ZOOMS[k].label}</button>
                ))}
              </span>
              <button type="button" className="btn" aria-pressed={brushMode} onClick={() => setBrushMode((b) => !b)} title="Select an area (B)">
                {brushMode ? "Selecting…" : "Select area"}
              </button>
            </span>
          </div>
        </header>
        <div className="relative h-[62vh] min-h-[420px] px-2 pb-2 lg:h-auto lg:flex-1 lg:px-4" id="tour-plane">
          <Plane
            map={map.data}
            candidates={cands.data.candidates}
            grid={grid}
            flame={flame.data}
            planner={planner.data?.cells}
            prebreathe={pb.data?.points}
            view={view}
            probe={shown}
            brushMode={brushMode}
            onProbe={onProbe}
            onHoverEnd={() => setPreview(null)}
            onBrush={(box: Box | null) => { setView({ box }); setBrushMode(false); }}
            onOpenCandidate={(id) => navigate(`/dossiers/candidate/${id}`)}
            onToggleBrush={() => setBrushMode((b) => !b)}
          />
        </div>
        <Legend />
      </section>

      <aside className="border-t border-line bg-[color:var(--surface)] lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0" id="tour-panel" aria-label="Evidence near the probe">
        {selection && (
          <div className="animate-rise border-b border-line bg-[color:var(--surface-2)] px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">Selected area</span>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setView({ box: null })}>Clear</button>
            </div>
            <p className="mt-2 text-sm">
              {selection.ids.length === 0 ? "No placed tests in this area." : `${selection.ids.length} placed ${selection.ids.length === 1 ? "test" : "tests"} in this area (your selection).`}
            </p>
            {selection.ids.length > 0 && (
              <button type="button" className="btn btn-sm mt-2" onClick={() => navigate(`/evidence?box=${[selection.box.o2[0], selection.box.o2[1], selection.box.psi[0], selection.box.psi[1]].join(",")}`)}>
                Filter the Evidence Explorer to this area
              </button>
            )}
          </div>
        )}
        <EvidencePanelView
          data={data}
          actions={{
            onMultiplier: (m) => setView({ m }),
            links: {
              dossier: candId ? `/dossiers/candidate/${candId}` : undefined,
              evidence: `/evidence?near=${data.reading.o2.v},${data.reading.psi.v},${view.m}`,
              compare: `/compare?pts=${data.reading.o2.v},${data.reading.psi.v}${candId === "c8_2_34" ? ";26.5,10.2" : ";34,8.2"}&m=${view.m}`,
              brief: `/brief?${pointQs}`,
            },
            onShare: share,
            shareLabel: copied ? "Link copied" : "Copy link",
            onOpenGap: () => setView({ panel: "gap" }, { push: true }),
          }}
          ask={<AskBox context={{ o2: data.reading.o2.v, psi: data.reading.psi.v, m: view.m }} initial={view.ask} onAsked={(q) => setView({ ask: q })} />}
        />
        <p className="border-t border-line px-5 py-4 text-xs text-ink-3">Redshift informs a decision; it does not rank or recommend an atmosphere. Empty means unknown, never safe.</p>
      </aside>

      {view.panel === "gap" && <GapDialog onClose={() => setView({ panel: "evidence" })} />}
      <Tour onStep={onTourStep} />
    </div>
  );
}

function LayerMenu({ layers, onToggle }: { layers: Set<string>; onToggle: (l: (typeof LAYERS)[number]["id"]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>Layers</button>
      {open && (
        <div className="animate-rise absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-line-strong bg-surface-2 p-2" style={{ boxShadow: "var(--shadow)" }} role="group" aria-label="Layers">
          {LAYERS.map((l) => (
            <button key={l.id} type="button" role="switch" aria-checked={layers.has(l.id)} onClick={() => onToggle(l.id)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-[color:var(--surface-3)]">
              {l.label}
              <span className="switch" aria-checked={layers.has(l.id)} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-4 text-xs text-ink-2 lg:px-6">
      {(["gas", "droplet", "solid", "emulator"] as const).map((f) => (
        <span key={f} className="flex items-center gap-1.5"><FuelMarker fuel={f} /> {FUEL_LABEL[f]}</span>
      ))}
      <span className="flex items-center gap-1.5"><FuelMarker fuel="solid" outlined /> Verified paper</span>
      <span className="flex items-center gap-1.5"><span className="hatch-bg inline-block h-3 w-5 rounded-sm border border-line" /> No tests: unknown, not safe</span>
      <span className="flex items-center gap-1.5"><svg width="20" height="8" aria-hidden="true"><line x1="0" y1="4" x2="20" y2="4" stroke="var(--isotherm)" strokeDasharray="4 4" /></svg> Flame temperature (explains, does not predict)</span>
    </div>
  );
}

function GapDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--bg)]/80 p-4 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="The access gap" className="animate-rise w-full max-w-3xl outline-none">
        <div className="mb-2 flex justify-end"><button type="button" className="btn" onClick={onClose}>Close</button></div>
        <AccessGap />
      </div>
    </div>
  );
}

function PlaneSkeleton() {
  return (
    <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]" aria-busy="true" aria-label="Loading the evidence">
      <div className="flex flex-col gap-4 p-6">
        <div className="skeleton h-7 w-2/3" />
        <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-8 w-24 rounded-full" />)}</div>
        <div className="relative flex-1 overflow-hidden rounded-lg border border-line bg-[color:var(--surface-2)]" style={{ minHeight: 420 }}>
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={`${(i + 1) * 10}%`} x2={`${(i + 1) * 10}%`} y1="0" y2="100%" stroke="var(--line)" />)}
            {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} y1={`${(i + 1) * 16}%`} y2={`${(i + 1) * 16}%`} x1="0" x2="100%" stroke="var(--line)" />)}
          </svg>
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">Placing every test on the plane…</p>
        </div>
      </div>
      <div className="space-y-4 border-l border-line p-6">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-6 w-full" />
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-6 w-full" />)}
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-start justify-center gap-4 px-6">
      <span className="eyebrow">Could not load the evidence</span>
      <h1 className="text-xl font-semibold">The data snapshot did not arrive.</h1>
      <p className="text-sm text-ink-2">Redshift reads a static snapshot written by the Python build (web/public/data). It shows nothing it cannot source, so it shows nothing rather than guess. Check your connection and try again.</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>
    </div>
  );
}
