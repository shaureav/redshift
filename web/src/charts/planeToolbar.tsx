// The plane's floating toolbar (plan, Phase 3), top left inside the plane: Solids only, the candidate
// atmospheres, layers, zoom and area selection. It replaces the two rows of controls that sat above the chart,
// so the data is the interface (principle 2). Every tool is a button with a name and a tooltip; arrow keys move
// between tools, Tab moves through them too. Sound (Phase 4) switches the Geiger clicks; a slot is marked for Time
// (Phase 8). On a phone (Phase 6) the tools fold into one menu button, whose rows hold the same controls.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronIcon, LayersIcon, MenuIcon, PinIcon, SelectIcon, SoundIcon, ZoomIcon } from "../components/Icons";
import { EVIDENCE_WORD_NOTE, type EvidenceWord } from "../lib/coast";
import type { Candidate } from "../lib/types";
import { LAYERS, ZOOMS, type Layer, type ZoomKey } from "../lib/view";

interface Props {
  solids: boolean;
  onSolids: () => void;
  candidates: Candidate[];
  words: Partial<Record<string, EvidenceWord>>;
  activeCandidate: string | null;
  onCandidate: (c: Candidate) => void;
  layers: Set<Layer>;
  onLayer: (l: Layer) => void;
  zoom: ZoomKey;
  onZoom: (z: ZoomKey) => void;
  /** A pinch left a window of its own (view.win): no preset is pressed until one is picked. */
  pinched?: boolean;
  brushMode: boolean;
  onBrush: () => void;
  /** Geiger clicks on (lib/geiger.ts). The handler runs inside the click, the gesture audio needs. */
  sound: boolean;
  onSound: () => void;
  /** The system asks for reduced motion, so the probe trail is off whatever its switch says. */
  reducedMotion: boolean;
  /** A phone: the tools fold into one menu button. */
  compact?: boolean;
}

/** A row of a menu: 44 px tall on a touch screen (index.css, .menu-row). */
const ROW = "menu-row flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-[color:var(--surface-3)]";

export function PlaneToolbar(p: Props) {
  const bar = useRef<HTMLDivElement>(null);
  if (p.compact) return <CompactToolbar {...p} />;
  // Left and right arrows step between the tools themselves (not the items of an open menu).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tools = [...(bar.current?.querySelectorAll<HTMLButtonElement>(":scope > .tool, :scope > div > .tool") ?? [])];
    const at = tools.indexOf(e.target as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    tools[(at + (e.key === "ArrowRight" ? 1 : tools.length - 1)) % tools.length].focus();
  };
  // A tooltip opens towards the middle of the screen: a tool in the right half right-aligns it (index.css), so
  // it never runs past the edge. Decided where the tool sits as the pointer or focus reaches it.
  const aimTip = (e: { target: EventTarget }) => {
    const t = e.target instanceof Element ? e.target.closest(".tool") : null;
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.toggleAttribute("data-tip-end", r.left + r.width / 2 > document.documentElement.clientWidth / 2);
  };
  return (
    <div ref={bar} role="toolbar" aria-label="Plane tools" className="toolbar flex-wrap" onKeyDown={onKeyDown} onPointerOver={aimTip} onFocus={aimTip}>
      <button type="button" role="switch" aria-checked={p.solids} aria-label="Solids only" data-tip="Keep only solid-material evidence (S)" onClick={p.onSolids} className="tool">
        <span className="switch" aria-hidden="true" /> Solids only
      </button>
      <span className="toolbar-sep" aria-hidden="true" />
      <ToolMenu label="Candidates" icon={<PinIcon />}>
        {(close) => <CandidateOptions p={p} done={close} />}
      </ToolMenu>
      <ToolMenu label="Layers" icon={<LayersIcon />}>
        {() => <LayerOptions p={p} />}
      </ToolMenu>
      <ToolMenu label="Zoom" tip={`Zoom: ${p.pinched ? "pinched" : ZOOMS[p.zoom].label}`} icon={<ZoomIcon />}>
        {(close) => <ZoomOptions p={p} done={close} />}
      </ToolMenu>
      <button type="button" className="tool" aria-pressed={p.brushMode} aria-label="Select area" data-tip="Select an area (B)" onClick={p.onBrush}>
        <SelectIcon />
      </button>
      <span className="toolbar-sep" aria-hidden="true" />
      {/* Geiger mode (plan decision D4): opt-in, off by default, never started without a user gesture, with the
          choice kept per device. */}
      <button
        type="button"
        role="switch"
        aria-checked={p.sound}
        aria-label="Geiger clicks"
        data-tip={p.sound ? "Geiger clicks on: the rate follows the tests near the probe" : "Geiger clicks: hear the tests near the probe"}
        onClick={p.onSound}
        className="tool"
      >
        <SoundIcon />
      </button>
      {/* Slot: Time (Phase 8, could). The year scrubber's button goes here. */}
    </div>
  );
}

function CandidateOptions({ p, done }: { p: Props; done: () => void }) {
  return (
    <>
      <div role="group" aria-label="Go to a candidate atmosphere">
        {p.candidates.map((c, k) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={p.activeCandidate === c.id}
            onClick={() => { p.onCandidate(c); done(); }}
            className="option flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-[color:var(--surface-3)]"
          >
            <span className="flex items-baseline gap-2">
              {k < 5 && <span className="kbd" aria-hidden="true">{k + 1}</span>}
              {c.name}
            </span>
            {p.words[c.id] && <span className="text-xs text-ink-3">{p.words[c.id]}</span>}
          </button>
        ))}
      </div>
      <p className="px-2 pb-1 pt-2 text-xs text-ink-3">{EVIDENCE_WORD_NOTE}</p>
    </>
  );
}

function LayerOptions({ p }: { p: Props }) {
  return (
    <div role="group" aria-label="Layers">
      {LAYERS.map((l) => {
        // The trail is motion, so reduced motion turns it off and its switch says why.
        const held = l.id === "trail" && p.reducedMotion;
        const on = !held && p.layers.has(l.id);
        return (
          <button key={l.id} type="button" role="switch" aria-checked={on} disabled={held} onClick={() => p.onLayer(l.id)} className={`${ROW} disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent`}>
            <span>
              {l.label}
              {held && <span className="block text-xs">Off: your system asks for reduced motion</span>}
            </span>
            <span className="switch" aria-checked={on} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function ZoomOptions({ p, done }: { p: Props; done: () => void }) {
  return (
    <div role="group" aria-label="Zoom">
      {(Object.keys(ZOOMS) as ZoomKey[]).map((k) => (
        <button key={k} type="button" aria-pressed={!p.pinched && p.zoom === k} onClick={() => { p.onZoom(k); done(); }} className="option flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-[color:var(--surface-3)]">
          {ZOOMS[k].label}
        </button>
      ))}
      {p.pinched && <p className="px-2 pb-1 pt-2 text-xs text-ink-3">Pinched to a window of your own; pick a range to go back to it.</p>}
    </div>
  );
}

const COMPACT_W = 320;

/** The phone's toolbar: one menu button, "Tools". Its menu holds every tool as a row: Solids only, then
 *  Candidates, Layers and Zoom, each opening in place, then Select area and Geiger clicks. A choice that changes
 *  what the plane shows (Solids only, a candidate, a zoom, area selection) closes the menu so the change is in
 *  sight; layer and sound switches leave it open. */
function CompactToolbar(p: Props) {
  const [section, setSection] = useState<"cand" | "layers" | "zoom" | null>(null);
  const toggle = (s: "cand" | "layers" | "zoom") => setSection((cur) => (cur === s ? null : s));
  return (
    <div className="toolbar p-0">
      <ToolMenu label="Plane tools" icon={<><MenuIcon /> Tools</>} width={COMPACT_W}>
        {(close) => (
          <div role="group" aria-label="Plane tools">
            <button type="button" role="switch" aria-checked={p.solids} onClick={() => { p.onSolids(); close(); }} className={ROW}>
              <span>Solids only</span>
              <span className="switch" aria-hidden="true" />
            </button>
            <Section label="Candidates" open={section === "cand"} onToggle={() => toggle("cand")}>
              <CandidateOptions p={p} done={close} />
            </Section>
            <Section label="Layers" open={section === "layers"} onToggle={() => toggle("layers")}>
              <LayerOptions p={p} />
            </Section>
            <Section label={`Zoom: ${p.pinched ? "pinched" : ZOOMS[p.zoom].label}`} open={section === "zoom"} onToggle={() => toggle("zoom")}>
              <ZoomOptions p={p} done={close} />
            </Section>
            <button type="button" role="switch" aria-checked={p.brushMode} onClick={() => { p.onBrush(); close(); }} className={ROW}>
              <span>Select area</span>
              <span className="switch" aria-hidden="true" />
            </button>
            <button type="button" role="switch" aria-checked={p.sound} onClick={p.onSound} className={ROW}>
              <span>Geiger clicks</span>
              <span className="switch" aria-hidden="true" />
            </button>
            <p className="px-2 pb-1 pt-2 text-xs text-ink-3">Pinch or drag with two fingers to zoom and pan. Tap to pin the probe; press and hold to preview a point.</p>
          </div>
        )}
      </ToolMenu>
    </div>
  );
}

/** A part of the phone's tools menu that opens in place. */
function Section({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className={ROW}>
        <span>{label}</span>
        <ChevronIcon dir={open ? "down" : "right"} className="flex-none text-ink-3" />
      </button>
      <div id={id} hidden={!open} className="pb-2 pl-2">{open && children}</div>
    </div>
  );
}

const MENU_W = 256;
const GUTTER = 16;

/** Where a menu opened under a tool starts, relative to the tool's left edge: 0 when it fits, otherwise shifted
 *  left just far enough that its right edge stays a gutter inside the viewport (never past the left gutter). */
export function menuShift(toolLeft: number, viewportW: number, menuW = MENU_W): { left: number; width: number } {
  const width = Math.min(menuW, viewportW - 2 * GUTTER);
  const left = Math.min(0, viewportW - GUTTER - toolLeft - width);
  return { left: Math.max(left, GUTTER - toolLeft), width };
}

/** A tool that opens a menu under it. The menu sits right after its button in the DOM, so Tab moves from the
 *  button into it; Escape or a click outside closes it and hands focus back to the button. */
function ToolMenu({ label, tip, icon, width = MENU_W, children }: { label: string; tip?: string; icon: ReactNode; width?: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; width: number }>({ left: 0, width });
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // On a phone a tool right of centre would open its menu past the screen's right edge: measured as it opens
  // (before paint) and again on a resize, the menu shifts left until it fits.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (r) setAt(menuShift(r.left, document.documentElement.clientWidth, width));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, width]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  return (
    <div ref={ref} className="relative">
      <button ref={btn} type="button" className="tool" aria-label={label} data-tip={tip ?? label} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {icon}
      </button>
      {/* Placed under its tool, shifted left when it would run past the viewport (menuShift): a fixed menu would
          be placed against the toolbar instead of the viewport, because the toolbar's backdrop blur contains it.
          For the same reason its own blur would see only the toolbar, so the menu takes a solid surface. */}
      {open && (
        <div className="floating animate-rise absolute top-full z-30 mt-2 max-h-[60vh] overflow-y-auto p-2" style={{ left: at.left, width: at.width, background: "var(--surface-2)" }}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
