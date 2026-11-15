// The evidence panel's frame. At lg and up it is the panel docked beside the plane. Below lg it is a bottom sheet
// over the plane (plan, Phase 6) that rests at one of three snap points: peek shows the readout tiles, half shows
// what is missing too, full shows everything. Its handle is a button: a tap or Enter steps peek, half, full and
// back to peek; a finger or the pointer drags it (a flick carries on to the next point); the arrow keys, Page Up
// and Page Down step it, Home and End go to peek and full. Full, it is a modal dialog: Tab stays inside it and
// Escape brings it back to half. CSS (index.css, .sheet) does the layout, so the same markup serves both widths.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { snapFor, stepSnap, type Snap } from "../lib/gesture";
import { SHEET_QUERY, useMedia } from "../lib/media";

const SNAP_TEXT: Record<Snap, string> = {
  peek: "peek, showing the readout",
  half: "half, showing what is missing",
  full: "full, showing everything",
};
const CYCLE: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };
/** A press that moves less than this is a tap on the handle, not a drag. */
const DRAG_SLOP = 6;
/** Until the content is measured (the first paint, a test without layout): a peek and a half that fit a phone. */
const FALLBACK = { peek: 280, half: 440 };
/** The handle's bar at rest, in px (index.css, .sheet-grip). */
const GRIP = 32;
/** The most of the sheet's height that half may show. */
const HALF_MAX = 0.6;

type Stops = Record<Snap, number>;

/** The bottom edge of el, in px from the top of root (an offsetParent above it). */
function bottomOf(el: HTMLElement, root: HTMLElement): number {
  let y = el.offsetHeight;
  for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** The controls Tab can reach inside root: not hidden, not inside a closed details (its summary excepted). */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest("[hidden]")) return false;
    const details = el.closest("details");
    return !details || details.open || el.tagName === "SUMMARY";
  });
}

interface Props {
  label: string;
  /** Changes when the content above the tiles changes shape (a selected area shown or cleared), so the snap
   *  points are measured afresh rather than only ever growing. */
  resetKey: string;
  /** The visible height at peek, for the page to keep the plane clear of it (--sheet-peek). */
  onPeek: (px: number) => void;
  /** While the story intro plays the panel is dimmed and unused: inert (no focus, no pointer) and hidden from
   *  assistive technology, so its dimmed text is neither read nor checked as page text. */
  inert?: boolean;
  className?: string;
  children: ReactNode;
}

export function EvidenceSheet({ label, resetKey, onPeek, inert = false, className = "", children }: Props) {
  const below = useMedia(SHEET_QUERY);
  const [snap, setSnap] = useState<Snap>("peek");
  const [stops, setStops] = useState<Stops | null>(null);
  const ref = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const full = below && snap === "full";

  // ---- the snap points: peek ends under the tiles, half under the missing callout, full is the whole sheet ----
  // Measured from the content and only ever raised while the width (and resetKey) stay the same, so the sheet
  // and the plane above it keep still while the probe moves and the readout's lines come and go.
  const most = useRef({ key: "", peek: 0, half: 0 });
  const measure = useCallback(() => {
    const el = ref.current;
    const peekEl = el?.querySelector<HTMLElement>("[data-sheet-peek]");
    if (!el || !peekEl || !el.clientHeight) return;
    const halfEl = el.querySelector<HTMLElement>("[data-sheet-half]");
    const key = `${window.innerWidth}|${resetKey}`;
    if (most.current.key !== key) most.current = { key, peek: 0, half: 0 };
    const m = most.current;
    // Measured as if the handle were its resting 32 px bar: full, it is 44 px tall (index.css, .sheet-grip).
    const shift = GRIP - (handle.current?.offsetHeight || GRIP);
    m.peek = Math.max(m.peek, bottomOf(peekEl, el) + shift + 16);
    m.half = Math.max(m.half, halfEl ? bottomOf(halfEl, el) + shift : m.peek);
    const H = el.clientHeight;
    // A short screen (a phone on its side) keeps half of itself for the plane. Half never takes more than 60% of
    // the sheet, so some of the plane always shows above it: a long missing callout runs on past the edge, and
    // full (or Tab, which opens full) reaches the rest.
    const peek = Math.round(Math.min(m.peek, H / 2));
    const half = Math.round(Math.min(Math.max(m.half, peek), Math.max(peek, H * HALF_MAX)));
    setStops((s) => (s && s.peek === peek && s.half === half && s.full === H ? s : { peek, half, full: H }));
  }, [resetKey]);

  useLayoutEffect(() => {
    if (!below) return;
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const content = el.querySelector<HTMLElement>("[data-testid='evidence-panel']");
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [below, measure]);

  useLayoutEffect(() => {
    if (below && stops) onPeek(stops.peek);
  }, [below, stops, onPeek]);

  // React 18 has no inert prop, so the attribute is set here, before paint. The story intro plays over the plane,
  // so a sheet left at half or full (opaque while the intro dims its contents) drops to peek as it starts.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.toggleAttribute("inert", inert);
    if (inert) {
      el.setAttribute("aria-hidden", "true");
      setSnap("peek");
    } else el.removeAttribute("aria-hidden");
  }, [inert]);

  // Leaving full, the sheet shows its top again: peek and half always begin with the readout.
  useEffect(() => {
    if (snap !== "full" && ref.current) ref.current.scrollTop = 0;
  }, [snap]);

  const at: Stops = stops ?? { peek: FALLBACK.peek, half: FALLBACK.half, full: Math.max(FALLBACK.half, (typeof window !== "undefined" ? window.innerHeight : 800) - 64) };

  // ---- dragging the handle ----
  const drag = useRef<{ id: number; y0: number; from: number; visible: number; y: number; t: number; speed: number; moved: boolean } | null>(null);
  const dragged = useRef(false); // the click that ends a drag is not a tap
  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    dragged.current = false;
    if (!below || e.button > 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no capture (a synthetic pointer): the drag still follows while the pointer stays on the handle */
    }
    const from = snap === "full" ? at.full : at[snap];
    drag.current = { id: e.pointerId, y0: e.clientY, from, visible: from, y: e.clientY, t: e.timeStamp, speed: 0, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || d.id !== e.pointerId || !el) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      el.setAttribute("data-dragging", "");
    }
    const dt = e.timeStamp - d.t;
    // Speed in px per millisecond, positive while the sheet grows, smoothed over the last few moves.
    if (dt > 0) d.speed = 0.7 * ((d.y - e.clientY) / dt) + 0.3 * d.speed;
    d.y = e.clientY;
    d.t = e.timeStamp;
    d.visible = Math.min(at.full, Math.max(at.peek, d.from - dy));
    el.style.setProperty("--sheet-drag", `${d.visible}px`);
  };
  const onUp = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return; // a tap: the click that follows steps through the snap points
    dragged.current = true;
    ref.current?.removeAttribute("data-dragging");
    ref.current?.style.removeProperty("--sheet-drag");
    if (!cancelled) setSnap(snapFor(d.visible, d.speed, at));
  };
  const onClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setSnap((s) => CYCLE[s]);
  };
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const to: Partial<Record<string, Snap>> = {
      ArrowUp: stepSnap(snap, 1), PageUp: stepSnap(snap, 1), ArrowDown: stepSnap(snap, -1), PageDown: stepSnap(snap, -1), Home: "peek", End: "full",
    };
    const next = to[e.key];
    if (!next) return;
    e.preventDefault();
    setSnap(next);
  };

  // ---- full: a modal dialog. Tab wraps inside it; Escape brings it back to half, focus on the handle ----
  // Keys from a number's source card (a portal, outside this element in the page) are its own.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const el = ref.current;
    if (!full || !el || !el.contains(e.target as Node)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setSnap("half");
      handle.current?.focus();
      return;
    }
    if (e.key !== "Tab") return;
    const f = focusables(el);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  // Tab reaching a control below the part that shows opens the sheet in full, so focus is never off screen.
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const el = ref.current;
    if (!below || snap === "full" || !el || e.target === handle.current || !el.contains(e.target)) return;
    if (e.target.getBoundingClientRect().bottom > window.innerHeight) setSnap("full");
  };

  const visible = snap === "full" ? "100%" : `${at[snap]}px`;
  return (
    <aside
      ref={ref}
      className={`sheet ${className}`}
      data-snap={snap}
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
      aria-label={label}
      style={{ "--sheet-visible": visible } as CSSProperties}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      {/* The handle across the sheet's top (a 44 px target, index.css), sticky while a full sheet scrolls. Its ring is drawn
          inside it, since the sheet clips anything past its edges. */}
      <button
        ref={handle}
        type="button"
        className="sheet-grip sticky top-0 z-20 flex w-full items-center justify-center bg-[color:var(--surface-2)] focus-visible:outline-offset-[-4px] lg:hidden"
        style={{ touchAction: "none" }}
        aria-label={`Evidence sheet, ${SNAP_TEXT[snap]}`}
        aria-describedby={hintId}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => onUp(e, false)}
        onPointerCancel={(e) => onUp(e, true)}
        onClick={onClick}
        onKeyDown={onHandleKey}
      >
        <span className="sheet-handle" aria-hidden="true" />
      </button>
      <span id={hintId} hidden>Press to step through peek, half and full; drag it, or use the arrow keys, to resize. Escape leaves full.</span>
      <span className="sr-only" aria-live="polite">{below ? `Evidence sheet ${SNAP_TEXT[snap]}` : ""}</span>
      {children}
    </aside>
  );
}
