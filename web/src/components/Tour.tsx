// First-visit tour: three steps that end on the access gap. Skippable; once finished or skipped it never
// shows again (remembered in this browser only). The command palette can replay it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const KEY = "redshift-tour-v1";
export const TOUR_EVENT = "redshift:tour";

const byId = (...ids: string[]) => () => ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);

interface Step {
  /** What the spotlight covers: the union of these elements' boxes. The first one is scrolled into view. */
  targets: () => Element[];
  block: ScrollLogicalPosition;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    targets: byId("tour-plane", "tour-legend"),
    block: "nearest",
    title: "One plane: oxygen across, cabin pressure up",
    body: "Every microgravity fire test that PSI's tables let us place sits here, shaped and coloured by fuel class. Hatched areas have no tests: unknown, not safe.",
  },
  {
    targets: byId("tour-panel"),
    block: "nearest",
    title: "Drag the probe anywhere",
    body: "The panel answers one question for that atmosphere: what do we actually know about fire here, and what is missing? Arrow keys move the probe; Shift with an arrow jumps between the named candidates. Every number opens its source.",
  },
  {
    // The whole access-gap section, not just its heading, scrolled to the top so its figures are in view.
    targets: () => {
      const section = document.getElementById("sec-gap")?.closest("section");
      return section ? [section] : [];
    },
    block: "start",
    title: "The access gap",
    body: "At 8.2 psi and 34% oxygen, with solids only on: PSI's tables record no pressure for any solid-material burn, so none can be placed near a habitat atmosphere. A published Saffire paper describes solid burns close to these atmospheres; its figures appear here once a team member has verified them against the source.",
  },
];

interface Box { left: number; top: number; right: number; bottom: number; width: number; height: number }

function unionBox(els: Element[]): Box | null {
  if (!els.length) return null;
  const rs = els.map((el) => el.getBoundingClientRect());
  const left = Math.min(...rs.map((r) => r.left));
  const top = Math.min(...rs.map((r) => r.top));
  const right = Math.max(...rs.map((r) => r.right));
  const bottom = Math.max(...rs.map((r) => r.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** The visible area in the coordinates fixed elements use. On a phone the visual viewport can be smaller than, or offset within, the layout viewport. */
function visibleArea() {
  const vv = window.visualViewport;
  const de = document.documentElement;
  return {
    x: vv?.offsetLeft ?? 0,
    y: vv?.offsetTop ?? 0,
    w: vv?.width ?? (de.clientWidth || window.innerWidth),
    h: vv?.height ?? (de.clientHeight || window.innerHeight),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "done";
  } catch {
    return true; // storage blocked: do not nag on every visit
  }
}
function remember() {
  try {
    localStorage.setItem(KEY, "done");
  } catch {
    /* storage blocked: the tour simply shows again next time */
  }
}

export function Tour({ onStep }: { onStep?: (i: number) => void }) {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(280); // measured once the card is drawn, so it never runs off screen
  const [, setArea] = useState(0); // bumped when the visible area changes, so the card is placed again
  const card = useRef<HTMLDivElement>(null);
  // Where focus was when the tour opened; it goes back there when the tour closes.
  const returnTo = useRef<Element | null>(null);
  // The latest onStep, read when a step starts. A parent may pass a new function on every render; the step
  // action must still run once per step, not once per render (it can change the view, which re-renders).
  const onStepRef = useRef(onStep);
  useLayoutEffect(() => {
    onStepRef.current = onStep;
  });

  useEffect(() => {
    const open = () => {
      // A replay while the tour is open keeps the original place to return to.
      if (!card.current?.contains(document.activeElement)) returnTo.current = document.activeElement;
      setStep(0);
    };
    if (!seen()) open();
    window.addEventListener(TOUR_EVENT, open);
    return () => window.removeEventListener(TOUR_EVENT, open);
  }, []);

  const measure = useCallback(() => {
    if (step === null) return;
    setRect(unionBox(STEPS[step].targets()));
    if (card.current?.offsetHeight) setCardH(card.current.offsetHeight);
    setArea((n) => n + 1);
  }, [step]);

  // Each step's action runs exactly once per step change. Step 3 moves the probe and turns on solids only;
  // keyed on anything but the step, that view change re-ran the action forever (React error 185).
  useLayoutEffect(() => {
    if (step === null) return;
    onStepRef.current?.(step);
    card.current?.focus();
  }, [step]);

  useLayoutEffect(() => {
    if (step === null) return;
    const t = setTimeout(() => {
      const first = STEPS[step].targets()[0];
      first?.scrollIntoView({ block: STEPS[step].block, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      measure();
    }, 60);
    const vv = window.visualViewport;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [step, measure]);

  const finish = useCallback(() => {
    remember();
    setStep(null);
    // Hand focus back to where it was, or to the plane on a first visit (focus was on the page itself).
    const back = returnTo.current;
    returnTo.current = null;
    if (back instanceof HTMLElement && back !== document.body && back.isConnected) back.focus();
    else document.querySelector<HTMLElement>('#tour-plane [tabindex="0"]')?.focus();
  }, []);

  // aria-modal means focus stays in the card: Tab and Shift+Tab cycle through its buttons. Another dialog
  // opened on top (the command palette) keeps its own keys.
  useEffect(() => {
    if (step === null) return;
    const key = (e: KeyboardEvent) => {
      const box = card.current;
      if (!box) return;
      const at = document.activeElement;
      if (at instanceof Element && !box.contains(at) && at.closest('[aria-modal="true"]')) return;
      if (e.key === "Escape") return finish();
      if (e.key !== "Tab") return;
      const items = [...box.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!(at instanceof Element) || !box.contains(at)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (at === first || at === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [step, finish]);

  if (step === null) return null;
  const s = STEPS[step];
  const pad = 8;
  const vp = visibleArea();
  const cardW = Math.min(360, vp.w - 32);
  const minL = vp.x + 16;
  const maxL = vp.x + vp.w - cardW - 16;
  const minT = vp.y + 16;
  const maxT = vp.y + vp.h - cardH - 16;
  let left = minL;
  let top = maxT;
  if (rect) {
    const roomRight = vp.x + vp.w - rect.right;
    const roomLeft = rect.left - vp.x;
    if (roomRight > cardW + 32) { left = rect.right + 16; top = rect.top; }
    else if (roomLeft > cardW + 32) { left = rect.left - cardW - 16; top = rect.top; }
    else { left = rect.left; top = rect.bottom + 16 + cardH < vp.y + vp.h - 16 ? rect.bottom + 16 : rect.top - cardH - 16; }
  }
  // Keep the whole card, buttons included, inside the visible area.
  left = clamp(left, minL, maxL);
  top = clamp(top, minT, maxT);

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-lg transition-all duration-move ease-out"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px var(--veil), 0 0 0 2px var(--accent)" }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-[color:var(--veil)]" />
      )}
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="floating animate-rise fixed p-5 outline-none"
        style={{ left, top, width: cardW }}
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow">Step {step + 1} of {STEPS.length}</span>
          <button type="button" className="btn btn-sm btn-quiet" onClick={finish}>Skip tour</button>
        </div>
        <h2 id="tour-title" className="mt-2 text-lg font-semibold leading-snug">{s.title}</h2>
        <p className="mt-2 text-sm text-ink-2">{s.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="flex gap-1" aria-hidden="true">
            {STEPS.map((_, i) => <span key={i} className="h-1 w-6 rounded-full" style={{ background: i <= step ? "var(--accent)" : "var(--line-strong)" }} />)}
          </span>
          <span className="flex gap-2">
            {step > 0 && <button type="button" className="btn btn-sm" onClick={() => setStep(step - 1)}>Back</button>}
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setStep(step + 1)}>Next</button>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" onClick={finish}>Done</button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
