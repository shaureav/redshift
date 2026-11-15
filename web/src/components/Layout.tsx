// App shell. One primary destination (the plane) plus Compare; everything else lives under Reference.
// The plane is full bleed; every other page sits in a reading-width container with the footer.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useData } from "../lib/data";
import type { DatasetVersion } from "../lib/types";
import { CommandPalette, PALETTE_EVENT, THEME_EVENT } from "./CommandPalette";
import { ChevronIcon, MoonIcon, SearchIcon, SunIcon } from "./Icons";
import { Toaster } from "./Toaster";

const REFERENCE: [string, string, string][] = [
  ["/evidence", "Evidence Explorer", "Every test row with its source"],
  ["/investigations", "Investigations", "Every PSI combustion investigation"],
  ["/dossiers", "Dossiers", "Candidate atmospheres and materials"],
  ["/planner", "Test Planner", "Gaps worth testing next"],
  ["/quality", "Data Quality", "Flags, reconciliation, golden checks"],
  ["/methods", "Methods", "How every number is computed"],
  ["/about", "About", "Team, AI use, licences, citation"],
  ["/verify", "Verify findings", "Check AI-drafted paper findings"],
];

function useTheme(): ["dark" | "light", () => void] {
  const [theme, setTheme] = useState<"dark" | "light">(() => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"));
  useEffect(() => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    // The browser chrome takes the page surface, read from the token so no colour is written twice.
    const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
    if (surface) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", surface);
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
        <ChevronIcon dir="down" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        // On a phone the menu spans the screen under the nav, so it never runs past the right edge.
        <ul className="floating animate-rise absolute left-0 top-full z-50 mt-2 w-72 p-2 max-sm:fixed max-sm:inset-x-4 max-sm:top-14 max-sm:w-auto">
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
          Reference menu, and the logo never shrinks (images default to max-width 100%). The nav (and so its
          Reference menu) sits above the phone's evidence sheet (z-40); a number's source card (z-60), the
          command palette (z-80) and toasts (z-85) sit above the nav. Each accessible name holds the words shown
          (WCAG 2.5.3, label in name): the logo link "Redshift The Atmosphere Trade Studio", the search button
          "Search" and its shortcut. On a touch screen every one of them is at least 44 by 44 px (index.css). */}
      <nav className="glass sticky top-0 z-50 h-[var(--nav-h)] border-b border-line backdrop-blur" aria-label="Main">
        <div className="flex h-full items-center gap-1 px-4 sm:gap-2 lg:px-6">
          <Link to="/" className="tap-box mr-1 flex flex-none items-center gap-2 sm:mr-2" aria-label="Redshift The Atmosphere Trade Studio, the plane">
            <img src="/favicon.svg" alt="" className="h-6 w-6 max-w-none flex-none" />
            <span className="hidden text-base font-semibold tracking-tight sm:inline">Redshift</span>{" "}
            <span className="hidden text-xs text-ink-3 xl:inline">The Atmosphere Trade Studio</span>
          </Link>
          <NavLink to="/" end className={({ isActive }) => `btn btn-quiet max-sm:px-2 ${isActive ? "text-ink" : ""}`}>Plane</NavLink>
          <NavLink to="/compare" className={({ isActive }) => `btn btn-quiet max-sm:hidden ${isActive ? "text-ink" : ""}`}>Compare</NavLink>
          <ReferenceMenu />
          <span className="ml-auto flex flex-none items-center gap-1 sm:gap-2">
            <button type="button" className="btn btn-quiet justify-center max-sm:px-2" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))} aria-label={`Search (${isMac ? "Command" : "Ctrl"} K)`}>
              <SearchIcon />
              <span className="hidden md:inline">Search</span>{" "}
              <span className="kbd hidden md:inline">{isMac ? "⌘" : "Ctrl"} K</span>
            </button>
            <button type="button" className="btn btn-quiet justify-center max-sm:px-2" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
              {theme === "light" ? (
                <MoonIcon />
              ) : (
                <SunIcon />
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
      <Toaster />
    </div>
  );
}
