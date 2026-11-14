import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useData } from "../lib/data";
import type { DatasetVersion } from "../lib/types";

const TABS: [string, string][] = [
  ["/map", "Trade Map"],
  ["/dossiers", "Dossiers"],
  ["/planner", "Test Planner"],
  ["/investigations", "Investigations"],
  ["/evidence", "Evidence Explorer"],
  ["/quality", "Data Quality"],
  ["/methods", "Methods"],
  ["/about", "About"],
];

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => {
    try {
      return localStorage.getItem("redshift-theme");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
    try {
      if (theme) localStorage.setItem("redshift-theme", theme);
      else localStorage.removeItem("redshift-theme");
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
  }, [theme]);
  const next = theme === "dark" ? "light" : theme === "light" ? null : "dark";
  const label = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";
  return (
    <button type="button" className="rounded border border-line px-2 py-1 text-xs text-ink-2 hover:bg-surface-3" onClick={() => setTheme(next)} aria-label={`Colour theme: ${label}. Change`}>
      Theme: {label}
    </button>
  );
}

export function Layout() {
  const { data: version } = useData<DatasetVersion>("dataset_version.json");
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface-2 focus:p-2">
        Skip to content
      </a>
      <nav className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur" aria-label="Main">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            <span>Redshift</span>
            <span className="hidden text-xs font-normal text-ink-3 sm:inline">The Atmosphere Trade Studio</span>
          </Link>
          <ul className="flex flex-1 flex-wrap gap-1 text-sm">
            {TABS.map(([to, label]) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `rounded-md px-2.5 py-1.5 ${isActive ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:text-ink"}`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
          <ThemeToggle />
        </div>
      </nav>
      <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-line text-xs text-ink-3">
        <div className="mx-auto flex max-w-[1600px] flex-wrap gap-x-6 gap-y-1 px-4 py-4">
          <span>
            Dataset <span className="mono text-ink-2">{version?.version ?? "loading"}</span>, PSI data retrieved {version?.retrieved ?? ""}
          </span>
          <span>Data: NASA Physical Sciences Informatics (cite each investigation by DOI). Code: MIT.</span>
          <span>
            AI disclosure: code, pipeline and draft text were written with an AI assistant (Claude) under the team's direction; every paper finding is verified by a named person. <Link className="underline" to="/about">Details</Link>
          </span>
          <span>Redshift informs a decision; it does not recommend an atmosphere.</span>
        </div>
      </footer>
    </div>
  );
}
