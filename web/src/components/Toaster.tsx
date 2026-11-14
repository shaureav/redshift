// Toasts (plan, Phase 4): one short line such as "Link copied" or "Brief CSV ready", near the bottom of the
// screen for a moment. Any component calls toast(); the app shell renders the one Toaster. Its live region
// (role="status") is always in the page, so a screen reader announces each message as it arrives.
import { useEffect, useState } from "react";

export const TOAST_EVENT = "redshift:toast";
const SHOW_MS = 2400;

export function toast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}

/** Copy this page's link (every view lives in its URL), and say in a toast whether it worked. */
export function copyPageLink() {
  const where = "Copy the link from the address bar";
  try {
    if (!navigator.clipboard) return toast(where);
    navigator.clipboard.writeText(window.location.href).then(() => toast("Link copied"), () => toast(where));
  } catch {
    toast(where);
  }
}

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMsg((m) => ({ text: (e as CustomEvent<string>).detail, n: (m?.n ?? 0) + 1 }));
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    // Over the panel's action bar on a wide screen, centred above the bottom edge on a phone.
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-[85] flex justify-center lg:inset-x-auto lg:right-4">
      {msg && <p key={msg.n} className="floating animate-rise px-3 py-2 text-sm text-ink">{msg.text}</p>}
    </div>
  );
}
