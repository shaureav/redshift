// The plane's floating toolbar (plan, Phase 3), top left inside the plane: Solids only, the candidate
// atmospheres, layers, zoom and area selection. It replaces the two rows of controls that sat above the chart,
// so the data is the interface (principle 2). Every tool is a button with a name and a tooltip; arrow keys move
// between tools, Tab moves through them too. Slots are marked for Sound (Phase 4) and Time (Phase 8).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { LayersIcon, PinIcon, SelectIcon, ZoomIcon } from "../components/Icons";
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
  brushMode: boolean;
  onBrush: () => void;
}

export function PlaneToolbar(p: Props) {
  const bar = useRef<HTMLDivElement>(null);
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
      <button type="button" role="switch" aria-checked={p.solids} aria-label="Solids only" data-tip="Keep only solid-material evidence" onClick={p.onSolids} className="tool" id="tour-solids">
        <span className="switch" aria-hidden="true" /> Solids only
      </button>
      <span className="toolbar-sep" aria-hidden="true" />
      <ToolMenu label="Candidates" icon={<PinIcon />}>
        {(close) => (
          <>
            <div role="group" aria-label="Go to a candidate atmosphere">
              {p.candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={p.activeCandidate === c.id}
                  onClick={() => { p.onCandidate(c); close(); }}
                  className="option flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-[color:var(--surface-3)]"
                >
                  <span>{c.name}</span>
                  {p.words[c.id] && <span className="text-xs text-ink-3">{p.words[c.id]}</span>}
                </button>
              ))}
            </div>
            <p className="px-2 pb-1 pt-2 text-xs text-ink-3">{EVIDENCE_WORD_NOTE}</p>
          </>
        )}
      </ToolMenu>
      <ToolMenu label="Layers" icon={<LayersIcon />}>
        {() => (
          <div role="group" aria-label="Layers">
            {LAYERS.map((l) => (
              <button key={l.id} type="button" role="switch" aria-checked={p.layers.has(l.id)} onClick={() => p.onLayer(l.id)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-[color:var(--surface-3)]">
                {l.label}
                <span className="switch" aria-checked={p.layers.has(l.id)} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </ToolMenu>
      <ToolMenu label="Zoom" tip={`Zoom: ${ZOOMS[p.zoom].label}`} icon={<ZoomIcon />}>
        {(close) => (
          <div role="group" aria-label="Zoom">
            {(Object.keys(ZOOMS) as ZoomKey[]).map((k) => (
              <button key={k} type="button" aria-pressed={p.zoom === k} onClick={() => { p.onZoom(k); close(); }} className="option flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-[color:var(--surface-3)]">
                {ZOOMS[k].label}
              </button>
            ))}
          </div>
        )}
      </ToolMenu>
      <button type="button" className="tool" aria-pressed={p.brushMode} aria-label="Select area" data-tip="Select an area (B)" onClick={p.onBrush}>
        <SelectIcon />
      </button>
      {/* Slot: Sound (Phase 4). Geiger mode goes here, after a toolbar-sep: opt-in, off by default, never
          started without a user gesture, with its mute kept per device (plan decision D4). */}
      {/* Slot: Time (Phase 8, could). The year scrubber's button goes here. */}
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
function ToolMenu({ label, tip, icon, children }: { label: string; tip?: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; width: number }>({ left: 0, width: MENU_W });
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // On a phone a tool right of centre would open its menu past the screen's right edge: measured as it opens
  // (before paint) and again on a resize, the menu shifts left until it fits.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (r) setAt(menuShift(r.left, document.documentElement.clientWidth));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
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
