// Media queries read by script, kept up to date while the page is open. CSS lays the page out at each breakpoint
// (index.css); script asks only where behaviour differs, such as the phone's evidence sheet trapping focus when it
// is full, or the plane's tools folding into one menu button. Without matchMedia (a server render) every query
// reads false, so the page renders as it does on a desktop.
import { useEffect, useState } from "react";

/** Below Tailwind's lg breakpoint (1024 px) the evidence panel is a bottom sheet (index.css uses the same query). */
export const SHEET_QUERY = "(max-width: 1023.98px)";
/** Below sm (640 px) the plane's floating toolbar folds into a single menu button. */
export const PHONE_QUERY = "(max-width: 639.98px)";

const media = (q: string) => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(q) : null);

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => media(query)?.matches ?? false);
  useEffect(() => {
    const mq = media(query);
    if (!mq) return;
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, [query]);
  return on;
}
