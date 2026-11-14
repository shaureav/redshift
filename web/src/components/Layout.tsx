// App shell. One primary destination (the plane) plus Compare; everything else lives under Reference.
// The plane is full bleed; every other page sits in a reading-width container with the footer.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useData } from "../lib/data";
import type { DatasetVersion } from "../lib/types";
import { CommandPalette, PALETTE_EVENT, THEME_EVENT } from "./CommandPalette";

const REFERENCE: [string, string, string][] = [
  ["/evidence", "Evidence Explorer", "Every test row with its source"],
  ["/investigations", "Investigations", "Every PSI combustion investigation"],
  ["/dossiers", "Dossiers", "Candidate atmospheres and materials"],
  ["/planner", "Test Planner", "Gaps worth testing next"],
  ["/quality", "Data Quality", "Flags, reconciliation, golden checks"],
  ["/methods", "Methods", "How every number is computed"],
  ["/about", "About", "Team, AI use, licences, citation"],
];

function useTheme(): ["dark" | "light", () => void] {
  const [theme, setTheme] = useState<"dark" | "light">(() => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"));
  useEffect(() => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f6f7f9" : "#0a1322");
    try {
      localStorage.setItem("redshift-theme", theme);
    } catch {
      /* storage blocked: the theme still applies for this visit */
    }
  }, [theme]);
  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  useEffect(() => {
    const on = () => setTheme((t) => (t === "light" ? "dark" : "light"));
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);
  return [theme, toggle];
}

function ReferenceMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const activeRef = REFERENCE.some(([to]) => loc.pathname.startsWith(to));
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={`btn btn-quiet max-sm:px-2 ${activeRef ? "text-ink" : ""}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        Reference
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        // On a phone the menu spans the screen under the nav, so it never runs past the right edge.
        <ul className="animate-rise absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-line-strong bg-surface-2 p-2 max-sm:fixed max-sm:inset-x-4 max-sm:top-14 max-sm:w-auto" style={{ boxShadow: "var(--shadow)" }}>
          {/* Below 640 px Compare lives here rather than in the nav row, so the row fits a 360 px screen. */}
          <li className="sm:hidden">
            <NavLink to="/compare" className={({ isActive }) => `block rounded-md px-3 py-2 ${isActive ? "bg-[color:var(--surface-3)]" : "hover:bg-[color:var(--surface-3)]"}`}>
              <span className="block text-sm text-ink">Compare</span>
              <span className="block text-xs text-ink-3">Two atmospheres side by side</span>
            </NavLink>
          </li>
          {REFERENCE.map(([to, label, hint]) => (
            <li key={to}>
              <NavLink to={to} className={({ isActive }) => `block rounded-md px-3 py-2 ${isActive ? "bg-[color:var(--surface-3)]" : "hover:bg-[color:var(--surface-3)]"}`}>
                <span className="block text-sm text-ink">{label}</span>
                <span className="block text-xs text-ink-3">{hint}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Layout() {
  const { data: version } = useData<DatasetVersion>("dataset_version.json");
  const [theme, toggleTheme] = useTheme();
  const loc = useLocation();
  const plane = loc.pathname === "/";
  const [isMac] = useState(() => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform));
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[90] focus:rounded focus:bg-surface-2 focus:p-2">Skip to content</a>
      {/* The nav must fit a 360 px screen: below 640 px the buttons are tighter, Compare moves into the
          Reference menu, and the logo never shrinks (images default to max-width 100%). */}
      <nav className="glass sticky top-0 z-40 h-14 border-b border-line backdrop-blur" aria-label="Main">
        <div className="flex h-full items-center gap-1 px-4 sm:gap-2 lg:px-6">
          <Link to="/" className="mr-1 flex flex-none items-center gap-2 sm:mr-2" aria-label="Redshift, the plane">
            <img src="/favicon.svg" alt="" className="h-6 w-6 max-w-none flex-none" />
            <span className="hidden text-base font-semibold tracking-tight sm:inline">Redshift</span>
            <span className="hidden text-xs text-ink-3 xl:inline">The Atmosphere Trade Studio</span>
          </Link>
          <NavLink to="/" end className={({ isActive }) => `btn btn-quiet max-sm:px-2 ${isActive ? "text-ink" : ""}`}>Plane</NavLink>
          <NavLink to="/compare" className={({ isActive }) => `btn btn-quiet max-sm:hidden ${isActive ? "text-ink" : ""}`}>Compare</NavLink>
          <ReferenceMenu />
          <span className="ml-auto flex flex-none items-center gap-1 sm:gap-2">
            <button type="button" className="btn btn-quiet max-sm:px-2" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))} aria-label="Search and jump (Command K)">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" /></svg>
              <span className="hidden md:inline">Search</span>
              <span className="kbd hidden md:inline">{isMac ? "⌘" : "Ctrl"} K</span>
            </button>
            <button type="button" className="btn btn-quiet max-sm:px-2" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
              {theme === "light" ? (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" fill="currentColor" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor" /><g stroke="currentColor" strokeWidth="1.5">{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="8" y1="1.5" x2="8" y2="3" transform={`rotate(${a} 8 8)`} />)}</g></svg>
              )}
            </button>
          </span>
        </div>
      </nav>
      <main id="main" className={plane ? "flex-1" : "mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 lg:px-8"}>
        <Outlet />
      </main>
      {!plane && (
        <footer className="border-t border-line text-xs text-ink-3">
          <div className="mx-auto grid max-w-[1280px] gap-2 px-4 py-6 sm:grid-cols-2 lg:px-8">
            <span>Dataset <span className="mono text-ink-2">{version?.version ?? "loading"}</span>, PSI data retrieved {version?.retrieved ?? ""}. Data: NASA Physical Sciences Informatics; cite each investigation by DOI. Code: MIT.</span>
            <span>Redshift informs a decision; it does not recommend an atmosphere. Code, pipeline and draft text were written with an AI assistant (Claude) under the team&apos;s direction. <Link className="underline underline-offset-2" to="/about">Details</Link></span>
          </div>
        </footer>
      )}
      <CommandPalette />
    </div>
  );
}
