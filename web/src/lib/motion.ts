// Whether the person asked the system for reduced motion, kept up to date if they change it while the page is
// open. CSS already turns transitions off under the setting (index.css); this is for motion drawn by script, such
// as the probe trail, which is simply not drawn.
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const media = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => media()?.matches ?? false);
  useEffect(() => {
    const mq = media();
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}
