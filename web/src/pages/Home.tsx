// The plane, full screen, with the live evidence panel docked beside it. This page is the product:
// pick an atmosphere (drag, click, arrow keys or a candidate chip), see the evidence instantly, go deeper,
// take it with you. Every view state lives in the URL. Below lg (plan, Phase 6) the panel is a bottom sheet over
// the plane (components/Sheet.tsx), and the plane and its headline fill the screen above the sheet's peek.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AccessGap, type AccessGapData } from "../charts/AccessGap";
import { Plane, type ProbeMode } from "../charts/Plane";
import { PlaneToolbar } from "../charts/planeToolbar";
import type { TradeMapData } from "../charts/TradeMap";
import { AskBox } from "../components/AskBox";
import { FuelMarker } from "../components/Common";
import { EvidencePanelView, flameAt, prebreatheFor, type FlameFile, type PanelData, type PrebreatheFile } from "../components/EvidencePanel";
import { KeyboardIcon, PinIcon } from "../components/Icons";
import { EXPLORE_AT, Intro, INTRO_STAGES, introSeen } from "../components/Intro";
import { EvidenceSheet } from "../components/Sheet";
import { ShortcutSheet } from "../components/ShortcutSheet";
import { copyPageLink, toast } from "../components/Toaster";
import { Value } from "../components/Value";
import { coastFor, evidenceWord, isLand, type EvidenceWord } from "../lib/coast";
import { useData } from "../lib/data";
import { FUEL_LABEL } from "../lib/format";
import { geiger, soundTotal } from "../lib/geiger";
import { PHONE_QUERY, SHEET_QUERY, useMedia } from "../lib/media";
import { PLANE_REQUEST_EVENT, takePlaneRequest } from "../lib/planeRequest";
import { useReducedMotion } from "../lib/motion";
import { decodeGrid, inGrid, nearInputs, nodeOf, readAt, totalsAlongO2, totalsAlongPressure, type ProbeGridFile } from "../lib/probe";
import type { Candidate, CandidateEvidence, Val } from "../lib/types";
import { shortcutFor } from "../lib/shortcuts";
import { useView, type Box, type Layer, type View } from "../lib/view";

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
  // Below lg the panel is a bottom sheet: its readout leads with the tiles, and the page keeps the plane clear of
  // the sheet's peek (measured by the sheet). Below sm the plane's tools fold into one menu button.
  const sheetMode = useMedia(SHEET_QUERY);
  const phone = useMedia(PHONE_QUERY);
  const [peek, setPeek] = useState<number | null>(null);
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

  // The story intro (components/Intro.tsx): its beat, or null once it has handed over. It opens by itself on a
  // device's first visit to the plane, unless the link carries a view (a shared link opens on that view, not on
  // a story), and from the command palette. While it plays the plane draws each beat from a stage of its own:
  // nothing is written to the address bar until Explore, inside its click.
  const { search } = useLocation();
  const [beat, setBeat] = useState<number | null>(() => (search === "" && !introSeen() ? 0 : null));
  const stage = beat === null ? null : INTRO_STAGES[beat];
  const closeIntro = useCallback(
    (explore: boolean) => {
      setBeat(null);
      if (explore) setView({ ...EXPLORE_AT, solids: true });
    },
    [setView],
  );
  // What the plane draws: the view, except during the intro, when the beat decides Solids only and the glyphs,
  // pins and sea hatching are always on (the strip below the plot stays as set, so the plot keeps its size).
  const planeView = useMemo<View>(() => {
    if (!stage) return view;
    const layers = new Set<Layer>(["ev", "cand", "blind"]);
    if (view.layers.has("strip")) layers.add("strip");
    return { ...view, solids: stage === "solids", layers };
  }, [view, stage]);

  // Each candidate's evidence word, read from the grid at its node for the current step size and the mode that
  // is drawn. A word about the recorded evidence there, never about risk (lib/coast.ts). The intro's first beat
  // shows no land yet, so its pins carry their names alone.
  const words = useMemo(() => {
    const out: Partial<Record<string, EvidenceWord>> = {};
    if (!grid || !cands.data || stage === "pins") return out;
    const coast = coastFor(grid, view.m, planeView.solids ? "solids" : "all");
    for (const c of cands.data.candidates) {
      const n = nodeOf(grid, c.o2_pct.v, c.pressure_psi.v);
      if (n) out[c.id] = evidenceWord(coast, n.i, n.j);
    }
    return out;
  }, [grid, cands.data, view.m, planeView.solids, stage]);

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
      // The page does not wait for the flame grid, so the panel is told whether it has arrived: while it loads, or
      // if it failed, a missing flame value is not a statement that the point lies outside the grid.
      flameFile: flame.data ? "ready" : flame.error ? "failed" : "loading",
      prebreathe: prebreatheFor(pb.data, candidate),
      gap: gap.data ?? null,
      steps: candEv.data.steps,
      multipliers: grid.multipliers,
      preview: !!(drag || preview),
      outside: !inGrid(grid, shown.o2, shown.psi),
      // One row and one column of the build's totals through the probe: array reads, no counting.
      profiles: { o2: totalsAlongO2(grid, r.j, view.m), psi: totalsAlongPressure(grid, r.i, view.m) },
    };
  }, [grid, cands.data, candEv.data, flame.data, flame.error, pb.data, gap.data, shown.o2, shown.psi, view.m, drag, preview]);

  // A brushed area: whether any placed test sits inside it, never how many. The browser does not make new
  // counts (D24 withdraws D20); the Evidence Explorer, filtered to the area, lists the tests themselves.
  const selection = useMemo(() => {
    if (!view.box || !grid) return null;
    const b = view.box;
    const any = grid.file.inputs.some((t) => t.o2?.v != null && t.kpa?.v != null && t.o2.v >= b.o2[0] && t.o2.v <= b.o2[1] && t.kpa.v / KPA_PER_PSI >= b.psi[0] && t.kpa.v / KPA_PER_PSI <= b.psi[1]);
    return { box: b, any };
  }, [view.box, grid]);

  // Geiger mode: the click rate follows the built near-test total of the coast that is drawn, so open sea is
  // silent; under Solids only that is the solid land alone (lib/geiger.ts, soundTotal). Turned on only inside the
  // Sound tool's click; when it was left on, it waits for the first tap or key press. Quiet while the story intro
  // plays: the probe it would follow is not on the plane until Explore.
  const solidCoast = useMemo(() => (grid ? coastFor(grid, view.m, "solids") : null), [grid, view.m]);
  const total = data && solidCoast && !stage ? soundTotal(data.reading, view.solids, isLand(solidCoast, data.reading.i, data.reading.j)) : 0;
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
  // P pins the grid node the panel reads (a hover or a press and hold included): the address bar then holds it.
  const readO2 = data?.reading.o2.v ?? null;
  const readPsi = data?.reading.psi.v ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = shortcutFor(e, !!document.querySelector('[aria-modal="true"]'));
      if (!s) return;
      if (s.kind === "candidate") {
        const c = cands.data?.candidates[s.index];
        if (!c) return;
        onProbe(c.o2_pct.v, c.pressure_psi.v, "commit");
      } else if (s.kind === "pin") {
        if (readO2 === null || readPsi === null) return;
        onProbe(readO2, readPsi, "commit");
        toast("Pinned: the link in the address bar now opens this point");
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
  }, [cands.data, view.solids, compareLink, readO2, readPsi, onProbe, setView, navigate]);
  // Requests from the command palette (lib/planeRequest.ts): one made from another page waits for this page to
  // mount; one made here arrives through the event. Neither touches the view in the address bar.
  useEffect(() => {
    const take = () => {
      const r = takePlaneRequest();
      if (r === "shortcuts") setSheet(true);
      else if (r === "intro") setBeat(0);
    };
    take();
    window.addEventListener(PLANE_REQUEST_EVENT, take);
    return () => window.removeEventListener(PLANE_REQUEST_EVENT, take);
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
    <div
      className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:h-[calc(100vh-56px)] lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-1 lg:overflow-hidden"
      data-intro={stage ?? undefined}
      style={peek ? ({ "--sheet-peek": `${peek}px` } as CSSProperties) : undefined}
    >
      {/* Below lg the headline and the plane fill the screen above the sheet's peek (.plane-stage), and the page
          leaves room for the peek under the legend (.sheet-pad); at lg the stage is not a box at all. */}
      <section className="sheet-pad flex min-h-0 flex-col" aria-label="The oxygen and pressure plane">
        <div className="plane-stage">
        <header className="intro-hide px-4 pb-2 pt-4 lg:px-6">
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
        <div className="relative min-h-0 flex-1 px-2 pb-2 lg:px-4">
          <Plane
            map={map.data}
            candidates={cands.data.candidates}
            grid={grid}
            flame={flame.data}
            prebreathe={pb.data?.points}
            view={planeView}
            probe={shown}
            words={words}
            scene={scene || stage !== null}
            stage={stage}
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
                onZoom={(zoom) => setView({ zoom, win: null })}
                pinched={!!view.win}
                brushMode={brushMode}
                onBrush={() => setBrushMode((b) => !b)}
                sound={sound}
                onSound={onSound}
                reducedMotion={reduced}
                compact={phone}
              />
            }
            brushMode={brushMode}
            onProbe={onProbe}
            // The pointer left, a preview ended, or a drag gave way to a pinch: the probe shows the pinned point.
            onHoverEnd={() => { setPreview(null); setDrag(null); }}
            onBrush={(box: Box | null) => { setView({ box }); setBrushMode(false); }}
            onOpenCandidate={(id) => navigate(`/dossiers/candidate/${id}`)}
            onToggleBrush={() => setBrushMode((b) => !b)}
            onWindow={(win) => setView({ win })}
          />
        </div>
        </div>
        <Legend onShortcuts={() => setSheet(true)} />
      </section>

      {/* At lg the docked panel. lg:relative: it is the containing block for anything absolutely placed inside it
          (such as a visually hidden label), so nothing escapes its scroller and stretches the page. Below lg the
          bottom sheet (fixed, index.css). */}
      <EvidenceSheet
        label="Evidence near the probe"
        resetKey={selection ? "area" : ""}
        onPeek={setPeek}
        inert={stage !== null}
        className="intro-dim lg:relative lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-line lg:bg-[color:var(--surface)]"
      >
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
          compact={sheetMode}
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
      </EvidenceSheet>

      {view.panel === "gap" && <GapDialog onClose={() => setView({ panel: "evidence" })} />}
      {sheet && <ShortcutSheet candidates={cands.data.candidates.map((c) => c.name)} onClose={() => setSheet(false)} />}
      {beat !== null && <Intro beat={beat} gap={gap.data ?? null} onBeat={setBeat} onClose={closeIntro} />}
    </div>
  );
}

/** The plane's key, read as a map: land, sea and coast, the fuel classes, pins and isotherms; and, where there is
 *  room for a keyboard, the door to the shortcut sheet. */
function Legend({ onShortcuts }: { onShortcuts: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-4 text-xs text-ink-2 lg:px-6">
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
    // Taken (preventDefault), so the story intro, should it be playing underneath, does not also skip.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    // Above the story intro and its click catcher (z-[58]), like the shortcut sheet; below a source card (z-[60]).
    <div className="animate-fade scrim fixed inset-0 z-[59] flex items-start justify-center overflow-y-auto p-4 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
