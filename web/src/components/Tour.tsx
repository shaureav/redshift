// First-visit tour: three steps that end on the access gap. Skippable; once finished or skipped it never
// shows again (remembered in this browser only). The command palette can replay it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const KEY = "redshift-tour-v1";
export const TOUR_EVENT = "redshift:tour";

const STEPS = [
  {
    target: "tour-plane",
    title: "One plane: oxygen across, cabin pressure up",
    body: "Every microgravity fire test that PSI's tables let us place sits here, shaped and coloured by fuel class. Hatched areas have no tests: unknown, not safe.",
  },
  {
    target: "tour-panel",
    title: "Drag the probe anywhere",
    body: "The panel answers one question for that atmosphere: what do we actually know about fire here, and what is missing? Arrow keys move the probe; Shift with an arrow jumps between the named candidates. Every number opens its source.",
  },
  {
    target: "sec-gap",
    title: "The access gap",
    body: "At 8.2 psi and 34% oxygen, with solids only on: PSI's tables record no pressure for any solid-material burn, so none can be placed near a habitat atmosphere. A published Saffire paper describes solid burns close to these atmospheres; its figures appear here once a team member has verified them against the source.",
  },
];

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
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(280); // measured once the card is drawn, so it never runs off screen
  const card = useRef<HTMLDivElement>(null);
  // The latest onStep, read when a step starts. A parent may pass a new function on every render; the step
  // action must still run once per step, not once per render (it can change the view, which re-renders).
  const onStepRef = useRef(onStep);
  useLayoutEffect(() => {
    onStepRef.current = onStep;
  });

  useEffect(() => {
    if (!seen()) setStep(0);
    const replay = () => setStep(0);
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, []);

  const measure = useCallback(() => {
    if (step === null) return;
    const el = document.getElementById(STEPS[step].target);
    if (!el) return setRect(null);
    el.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setRect(el.getBoundingClientRect());
    if (card.current?.offsetHeight) setCardH(card.current.offsetHeight);
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
    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  const finish = () => {
    remember();
    setStep(null);
  };

  useEffect(() => {
    if (step === null) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && finish();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [step]);

  if (step === null) return null;
  const s = STEPS[step];
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(360, vw - 32);
  let left = 16;
  let top = vh - cardH - 16;
  if (rect) {
    const roomRight = vw - rect.right;
    if (roomRight > cardW + 32) { left = rect.right + 16; top = rect.top; }
    else if (rect.left > cardW + 32) { left = rect.left - cardW - 16; top = rect.top; }
    else { left = Math.max(16, Math.min(rect.left, vw - cardW - 16)); top = rect.bottom + 16 + cardH < vh - 16 ? rect.bottom + 16 : rect.top - cardH - 16; }
  }
  // Keep the whole card, buttons included, inside the viewport.
  top = Math.max(16, Math.min(top, vh - cardH - 16));

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-lg transition-all duration-300 ease-out"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(4, 9, 18, 0.72), 0 0 0 2px var(--accent)" }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-[rgba(4,9,18,0.72)]" />
      )}
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="animate-rise fixed rounded-lg border border-line-strong bg-surface-2 p-5 outline-none"
        style={{ left, top, width: cardW, boxShadow: "var(--shadow)" }}
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
