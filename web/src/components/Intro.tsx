// The story intro (plan, Phase 5; decision D2: it replaces the tour). Three beats over the live plane tell the
// access-gap story to someone who has never seen Redshift, then Explore hands the plane over at 8.2 psi / 34% O2
// with Solids only on. Advanced by a click on the plane, a scroll, a swipe or the arrow keys; Skip (or Escape) at
// any time; shown once per device and replayable from the command palette.
//
// This is a pure view of the beat the plane page holds (pages/Home.tsx). It never writes the view in the address
// bar while it plays: the plane draws each beat from a stage passed down (charts/Plane.tsx, IntroStage), and the
// one view change, the hand-over, happens inside the Explore click. Every count it shows is a built value from
// access_gap.json rendered through Value.
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { AccessGapData } from "../charts/AccessGap";
import type { IntroStage } from "../charts/Plane";
import { Value } from "./Value";

export const INTRO_KEY = "redshift-intro-v1";
/** Where Explore hands over: the 8.2 psi / 34% O2 candidate, with Solids only on. */
export const EXPLORE_AT = { o2: 34, psi: 8.2 } as const;
/** The plane's stage for each beat, in order. */
export const INTRO_STAGES: readonly IntroStage[] = ["pins", "land", "solids"];
/** One scroll gesture is one beat: wheel events closer together than this belong to the gesture already counted. */
const WHEEL_QUIET_MS = 300;
/** A vertical swipe at least this long steps a beat on a touch screen. */
const SWIPE_PX = 40;

/** Whether this device has seen the intro. Blocked storage counts as seen: the intro never nags on every visit. */
export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "done";
  } catch {
    return true;
  }
}

function rememberIntro() {
  try {
    localStorage.setItem(INTRO_KEY, "done");
  } catch {
    /* storage blocked: the intro is simply not offered again this visit */
  }
}

const ORDINAL = ["One", "Two", "Three"];

function GapCounts({ gap }: { gap: AccessGapData | null }): ReactNode {
  const s = gap?.psi_steps;
  if (!s || s.length < 4) return <>The cited counts are still loading.</>;
  const n = (k: number) => <Value val={s[k].count} unit={false} />;
  return s[2].count.v === 0 ? (
    <>No solid burn in PSI&apos;s tables records pressure. Of {n(0)} solid-fuel burn rows, {n(1)} record oxygen, {n(2)} record pressure and {n(3)} sit near a habitat candidate as downloadable rows.</>
  ) : (
    <>Of {n(0)} solid-fuel burn rows in PSI&apos;s tables, {n(1)} record oxygen, {n(2)} record pressure and {n(3)} sit near a habitat candidate as downloadable rows.</>
  );
}

const BEATS: { title: ReactNode; body: (gap: AccessGapData | null) => ReactNode }[] = [
  {
    // "Moon-base" never breaks at its hyphen in the 40 px headline.
    title: <>NASA has not chosen the <span className="whitespace-nowrap">Moon-base</span> atmosphere.</>,
    body: () => <>Oxygen runs across, cabin pressure up. Each pin is an atmosphere on the table, from Earth&apos;s sea-level air to thinner, oxygen-richer cabins.</>,
  },
  {
    // "In this range": the intro shows the default habitat zoom, and some placed tests sit outside it (D37).
    title: "These are the fire tests PSI lets us place in this range.",
    // A mark is a trade-map bin: one or more tests at the same recorded oxygen and pressure (charts/Plane.tsx).
    body: () => <>Each mark is one or more microgravity fire tests from NASA&apos;s PSI tables at one recorded oxygen and pressure, marked by fuel class. Land means tests sit near; hatched sea is unknown, not safe.</>,
  },
  {
    title: "Now only solid materials.",
    body: (gap) => <GapCounts gap={gap} />,
  },
];

export const INTRO_BEATS = BEATS.length;

interface IntroProps {
  beat: number;
  /** access_gap.json, for the cited counts of the last beat (null while it loads). */
  gap: AccessGapData | null;
  onBeat: (beat: number) => void;
  /** The intro is over: Explore (true) hands the plane over at EXPLORE_AT with Solids only on; Skip (false)
   *  leaves the view as it was. */
  onClose: (explore: boolean) => void;
}

export function Intro({ beat, gap, onBeat, onClose }: IntroProps) {
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  // Where focus was when the intro opened (a replay from the palette); it goes back there on Skip.
  const returnTo = useRef<Element | null>(null);
  const wheelAt = useRef(-Infinity);
  const touchY = useRef<number | null>(null);
  const last = INTRO_BEATS - 1;
  const b = Math.max(0, Math.min(last, beat));

  const go = useCallback((to: number) => {
    const next = Math.max(0, Math.min(last, to));
    if (next !== b) onBeat(next);
  }, [b, last, onBeat]);

  const close = useCallback((explore: boolean) => {
    rememberIntro();
    const back = returnTo.current;
    returnTo.current = null;
    // Committed at once, so the panel is no longer inert (components/Sheet.tsx lifts it before paint) when focus
    // goes back into it: focus() on an inert control does nothing, and the focused Skip button then unmounts.
    flushSync(() => onClose(explore));
    // Explore hands the keyboard to the plane, so the arrow keys move the probe at once; Skip goes back to where
    // focus was, or to the plane on a first visit.
    const plane = document.querySelector<SVGElement>('[aria-roledescription="plane"]');
    if (!explore && back instanceof HTMLElement && back !== document.body && back.isConnected) back.focus();
    else plane?.focus();
  }, [onClose]);

  // Opening: remember where focus was, start at the top of the page, and put focus on the way forward.
  useLayoutEffect(() => {
    returnTo.current = document.activeElement;
    if (window.scrollY > 0) window.scrollTo(0, 0);
    primary.current?.focus();
  }, []);

  // Keys, anywhere on the page: the arrows and Page Up or Down step, Escape skips, and Tab stays in the card
  // (aria-modal). Another dialog on top, such as the command palette or a number's source card, keeps its keys:
  // a key it has already handled (its Escape, which closes it and may hand focus back to this card before the key
  // reaches the document) is not this card's.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const box = card.current;
      if (!box || e.defaultPrevented) return;
      const at = document.activeElement;
      if (at instanceof Element && !box.contains(at) && at.closest('[role="dialog"]')) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        go(b + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        go(b - 1);
      } else if (e.key === "Tab") {
        const items = [...box.querySelectorAll<HTMLElement>("button:not([disabled])")];
        if (!items.length) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        if (!(at instanceof Element) || !box.contains(at)) {
          e.preventDefault();
          (e.shiftKey ? lastItem : first).focus();
        } else if (e.shiftKey && at === first) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && at === lastItem) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [b, go, close]);

  // A scroll steps one beat per gesture, and never scrolls the page behind (a native listener: React's is passive).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 2) return;
      const now = performance.now();
      const fresh = now - wheelAt.current > WHEEL_QUIET_MS;
      wheelAt.current = now;
      if (fresh) go(b + (e.deltaY > 0 ? 1 : -1));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [b, go]);

  const t = BEATS[b];
  return (
    <div
      ref={root}
      className="fixed inset-0 z-[58]"
      style={{ touchAction: "none" }}
      onTouchStart={(e) => { touchY.current = e.touches[0]?.clientY ?? null; }}
      onTouchEnd={(e) => {
        const y0 = touchY.current;
        const y1 = e.changedTouches[0]?.clientY;
        touchY.current = null;
        if (y0 !== null && y1 !== undefined && Math.abs(y1 - y0) >= SWIPE_PX) go(b + (y1 < y0 ? 1 : -1));
      }}
    >
      {/* The plane shows through. A click anywhere on it is the next beat. */}
      <div className="absolute inset-0 cursor-pointer" aria-hidden="true" data-intro-catcher onClick={() => go(b + 1)} />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        aria-describedby="intro-body"
        className="floating animate-rise fixed inset-x-4 bottom-4 p-3 lg:bottom-auto lg:left-auto lg:right-4 lg:top-[calc(var(--nav-h)+16px)] lg:w-[368px] lg:p-6"
      >
        {/* Below lg the card sits at the bottom of the screen, over the evidence sheet (dimmed and unused while
            the intro plays), so the whole plot shows, the 14.7 psi row included. On a phone the bars below say
            which beat this is. */}
        <span className="eyebrow max-lg:sr-only">{ORDINAL[b]} of three</span>
        {/* The text of each beat crossfades in; a screen reader hears the new beat. The block keeps the height of
            the longest beat on a wide screen (now the second: four lines of title, five of body), so the buttons
            stay where the pointer left them. */}
        <div aria-live="polite" className="lg:min-h-[328px]">
          <h2 key={`t${b}`} id="intro-title" className="swap-in text-heading lg:mt-2 lg:text-display">{t.title}</h2>
          <p key={`b${b}`} id="intro-body" className="swap-in mt-2 text-sm text-ink-2 lg:mt-4 lg:text-base">{t.body(gap)}</p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 lg:mt-6">
          <span className="flex gap-1" aria-hidden="true">
            {BEATS.map((_, i) => <span key={i} className="h-1 w-6 rounded-full" style={{ background: i <= b ? "var(--accent)" : "var(--line-strong)" }} />)}
          </span>
          <span className="flex items-center gap-2">
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => close(false)}>Skip intro</button>
            {/* Back to the first beat removes this button, so focus moves to Next first and stays in the card. */}
            {b > 0 && <button type="button" className="btn btn-sm" onClick={() => { if (b === 1) primary.current?.focus(); go(b - 1); }}>Back</button>}
            <button ref={primary} type="button" className="btn btn-sm btn-primary" onClick={() => (b < last ? go(b + 1) : close(true))}>
              {b < last ? "Next" : "Explore"}
            </button>
          </span>
        </div>
        <p className="mt-3 text-xs text-ink-3 max-lg:hidden">Click the plane, scroll or use the arrow keys. Esc skips.</p>
      </div>
    </div>
  );
}
