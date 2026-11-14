// The plane, full screen, with the live evidence panel docked beside it. This page is the product:
// pick an atmosphere (drag, click, arrow keys or a candidate chip), see the evidence instantly, go deeper,
// take it with you. Every view state lives in the URL.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AccessGap, type AccessGapData } from "../charts/AccessGap";
import { Plane, type ProbeMode } from "../charts/Plane";
import { PlaneToolbar } from "../charts/planeToolbar";
import type { TradeMapData } from "../charts/TradeMap";
import { AskBox } from "../components/AskBox";
import { FuelMarker } from "../components/Common";
import { EvidencePanelView, flameAt, prebreatheFor, type FlameFile, type PanelData, type PrebreatheFile } from "../components/EvidencePanel";
import { KeyboardIcon, PinIcon } from "../components/Icons";
import { ShortcutSheet, SHORTCUTS_EVENT } from "../components/ShortcutSheet";
import { copyPageLink, toast } from "../components/Toaster";
import { Tour } from "../components/Tour";
import { Value } from "../components/Value";
import { coastFor, evidenceWord, type EvidenceWord } from "../lib/coast";
import { useData } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import { geiger } from "../lib/geiger";
import { useReducedMotion } from "../lib/motion";
import { decodeGrid, inGrid, nearInputs, nodeOf, readAt, totalsAlongO2, totalsAlongPressure, type ProbeGridFile } from "../lib/probe";
import type { Candidate, CandidateEvidence, Val } from "../lib/types";
import { shortcutFor } from "../lib/shortcuts";
import { useView, type Box } from "../lib/view";

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
  const pb = useData<PrebreatheFile>("prebreathe.json");
  const gap = useData<AccessGapData>("access_gap.json");

  const grid = useMemo(() => (probeFile.data ? decodeGrid(probeFile.data) : null), [probeFile.data]);
  const [preview, setPreview] = useState<{ o2: number; psi: number } | null>(null);
  const [drag, setDrag] = useState<{ o2: number; psi: number } | null>(null);
  const [brushMode, setBrushMode] = useState(false);
  const [sheet, setSheet] = useState(false);
  // Geiger clicks: off unless chosen on this device (lib/geiger.ts reads the choice, guarded).
  const [sound, setSound] = useState(() => geiger.enabled);
  const reduced = useReducedMotion();
  // Whether Solids only has changed while this page was open: only then does the land sink on screen and the
  // cited headline wait for it. A link that opens with Solids only on shows the end state at once.
  const [solidsSeen, setSolidsSeen] = useState(view.solids);
  const [scene, setScene] = useState(false);
  if (solidsSeen !== view.solids) {
    setSolidsSeen(view.solids);
    setScene(true);
  }

  // Each candidate's evidence word, read from the grid at its node for the current step size and mode. A word
  // about the recorded evidence there, never about risk (lib/coast.ts).
  const words = useMemo(() => {
    const out: Partial<Record<string, EvidenceWord>> = {};
    if (!grid || !cands.data) return out;
    const coast = coastFor(grid, view.m, view.solids ? "solids" : "all");
    for (const c of cands.data.candidates) {
      const n = nodeOf(grid, c.o2_pct.v, c.pressure_psi.v);
      if (n) out[c.id] = evidenceWord(coast, n.i, n.j);
    }
    return out;
  }, [grid, cands.data, view.m, view.solids]);

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
      // One row and one column of the build's totals through the probe: array reads, no counting.
      profiles: { o2: totalsAlongO2(grid, r.j, view.m), psi: totalsAlongPressure(grid, r.i, view.m) },
    };
  }, [grid, cands.data, candEv.data, flame.data, pb.data, gap.data, shown.o2, shown.psi, view.m, drag, preview]);

  // A brushed area: whether any placed test sits inside it, never how many. The browser does not make new
  // counts (D24 withdraws D20); the Evidence Explorer, filtered to the area, lists the tests themselves.
  const selection = useMemo(() => {
    if (!view.box || !grid) return null;
    const b = view.box;
    const any = grid.file.inputs.some((t) => t.o2?.v != null && t.kpa?.v != null && t.o2.v >= b.o2[0] && t.o2.v <= b.o2[1] && t.kpa.v / KPA_PER_PSI >= b.psi[0] && t.kpa.v / KPA_PER_PSI <= b.psi[1]);
    return { box: b, any };
  }, [view.box, grid]);

  // Geiger mode: the click rate follows the near-test total at the probe (a built value; open sea is silent).
  // Turned on only inside the Sound tool's click; when it was left on, it waits for the first tap or key press.
  const total = data?.reading.total.v ?? 0;
  useEffect(() => geiger.setTotal(sound ? total : 0), [sound, total]);
  useEffect(() => {
    if (sound) geiger.armOnGesture();
  }, [sound]);
  useEffect(() => () => geiger.pause(), []); // leaving the plane stops the clicks
  const onSound = () => {
    if (sound) {
      geiger.disable();
      setSound(false);
      toast("Geiger clicks off");
    } else if (geiger.enable()) {
      setSound(true);
      toast("Geiger clicks on: more tests near the probe, more clicks");
    } else {
      toast("Sound is not available in this browser");
    }
  };

  // Keyboard shortcuts (lib/shortcuts.ts): never while typing, never behind a modal dialog.
  const compareLink = data ? `/compare?pts=${data.reading.o2.v},${data.reading.psi.v}${data.candidate?.id === "c8_2_34" ? ";26.5,10.2" : ";34,8.2"}&m=${view.m}` : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = shortcutFor(e, !!document.querySelector('[aria-modal="true"]'));
      if (!s) return;
      if (s.kind === "candidate") {
        const c = cands.data?.candidates[s.index];
        if (!c) return;
        onProbe(c.o2_pct.v, c.pressure_psi.v, "commit");
      } else if (s.kind === "solids") setView({ solids: !view.solids });
      else if (s.kind === "gap") setView({ panel: "gap" }, { push: true });
      else if (s.kind === "compare") {
        if (!compareLink) return;
        navigate(compareLink);
      } else setSheet(true);
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cands.data, view.solids, compareLink, onProbe, setView, navigate]);
  useEffect(() => {
    const open = () => setSheet(true);
    window.addEventListener(SHORTCUTS_EVENT, open);
    return () => window.removeEventListener(SHORTCUTS_EVENT, open);
  }, []);

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
        <header className="px-4 pb-2 pt-4 lg:px-6">
          {/* The Heading role (plan, section 5): the panel's point readout keeps the larger Title role. The plane's
              controls float in its toolbar, so only the headline sits above it. Under Solids only the cited
              headline lands once the land has sunk (instantly under reduced motion). */}
          <h1 className="max-w-4xl text-heading" aria-live="polite">
            <span key={view.solids ? "solids" : "all"} className={scene ? (view.solids ? "lands-after-scene" : "swap-in") : undefined}>
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
            </span>
          </h1>
        </header>
        <div className="relative h-[62vh] min-h-[420px] px-2 pb-2 lg:h-auto lg:flex-1 lg:px-4" id="tour-plane">
          <Plane
            map={map.data}
            candidates={cands.data.candidates}
            grid={grid}
            flame={flame.data}
            prebreathe={pb.data?.points}
            view={view}
            probe={shown}
            words={words}
            scene={scene}
            toolbar={
              <PlaneToolbar
                solids={view.solids}
                onSolids={() => setView({ solids: !view.solids })}
                candidates={cands.data.candidates}
                words={words}
                activeCandidate={candId ?? null}
                onCandidate={(c) => onProbe(c.o2_pct.v, c.pressure_psi.v, "commit")}
                layers={view.layers}
                onLayer={(l) => { const s = new Set(view.layers); if (s.has(l)) s.delete(l); else s.add(l); setView({ layers: s }); }}
                zoom={view.zoom}
                onZoom={(zoom) => setView({ zoom })}
                brushMode={brushMode}
                onBrush={() => setBrushMode((b) => !b)}
                sound={sound}
                onSound={onSound}
                reducedMotion={reduced}
              />
            }
            brushMode={brushMode}
            onProbe={onProbe}
            onHoverEnd={() => setPreview(null)}
            onBrush={(box: Box | null) => { setView({ box }); setBrushMode(false); }}
            onOpenCandidate={(id) => navigate(`/dossiers/candidate/${id}`)}
            onToggleBrush={() => setBrushMode((b) => !b)}
          />
        </div>
        <Legend onShortcuts={() => setSheet(true)} />
      </section>

      {/* relative: the panel is the containing block for anything absolutely placed inside it (such as a
          visually hidden label), so nothing escapes its scroller and stretches the page. */}
      <aside className="relative border-t border-line bg-[color:var(--surface)] lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0" id="tour-panel" aria-label="Evidence near the probe">
        {selection && (
          <div className="animate-rise border-b border-line bg-[color:var(--surface-2)] px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">Selected area</span>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setView({ box: null })}>Clear</button>
            </div>
            <p className="mt-2 text-sm">
              {selection.any
                ? "Placed tests sit inside this area. The Evidence Explorer lists them, each with its source."
                : "No placed test sits inside this area. Empty means unknown, not safe."}
            </p>
            {selection.any && (
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
              compare: compareLink ?? "/compare",
              brief: `/brief?${pointQs}`,
            },
            onShare: copyPageLink,
            onOpenGap: () => setView({ panel: "gap" }, { push: true }),
          }}
          ask={<AskBox context={{ o2: data.reading.o2.v, psi: data.reading.psi.v, m: view.m }} initial={view.ask} onAsked={(q) => setView({ ask: q })} />}
        />
      </aside>

      {view.panel === "gap" && <GapDialog onClose={() => setView({ panel: "evidence" })} />}
      {sheet && <ShortcutSheet candidates={cands.data.candidates.map((c) => c.name)} onClose={() => setSheet(false)} />}
      <Tour onStep={onTourStep} />
    </div>
  );
}

/** The plane's key, read as a map: land, sea and coast, the fuel classes, pins and isotherms; and, where there is
 *  room for a keyboard, the door to the shortcut sheet. */
function Legend({ onShortcuts }: { onShortcuts: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-4 text-xs text-ink-2 lg:px-6" id="tour-legend">
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded-sm border border-[color:var(--coast)] bg-[color:var(--land)]" /> Land: tests near</span>
      <span className="flex items-center gap-1.5"><span className="hatch-bg inline-block h-3 w-5 rounded-sm border border-line bg-[color:var(--sea)]" /> Sea: no tests near, unknown, not safe</span>
      {(["gas", "droplet", "solid", "emulator"] as const).map((f) => (
        <span key={f} className="flex items-center gap-1.5"><FuelMarker fuel={f} /> {FUEL_LABEL[f]}</span>
      ))}
      <span className="flex items-center gap-1.5"><FuelMarker fuel="solid" outlined /> Verified paper</span>
      <span className="flex items-center gap-1.5"><PinIcon className="text-ink" /> Candidate: inland, on the coast or at sea describes the evidence, not risk</span>
      <span className="flex items-center gap-1.5"><svg width="20" height="8" aria-hidden="true"><line x1="0" y1="4" x2="20" y2="4" stroke="var(--isotherm)" /></svg> Flame temperature (explains, does not predict)</span>
      <button type="button" className="btn btn-sm btn-quiet ml-auto max-lg:hidden" onClick={onShortcuts}>
        <KeyboardIcon /> Shortcuts <span className="kbd" aria-hidden="true">?</span>
      </button>
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
    <div className="animate-fade scrim fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
        <div className="relative flex-1 overflow-hidden rounded-lg border border-line bg-[color:var(--sea)]" style={{ minHeight: 420 }}>
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
