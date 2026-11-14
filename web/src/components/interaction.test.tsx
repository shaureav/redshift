// Interaction tests under jsdom: real clicks through react-dom/client and React's act, no testing library
// (decision D6, no new dependencies). Home renders from the real data snapshot (web/public/data) with the
// query cache pre-filled, as in panel.test.tsx, so nothing touches the network.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeGrid, readAt, totalsAlongO2, type ProbeGridFile } from "../lib/probe";
import { loadSnapshot } from "../lib/snapshot.fixture";
import { useView } from "../lib/view";
import Home from "../pages/Home";
import { ErrorBoundary, RouteBoundary } from "./ErrorBoundary";
import { Tour, TOUR_EVENT } from "./Tour";

const FILES = [
  "probe_grid.json", "trade_map.json", "candidates.json", "candidate_evidence.json", "flame_temperature_grid.json",
  "planner_grid.json", "prebreathe.json", "access_gap.json", "ai_text.json", "dataset_version.json", "investigations.json",
  "provenance.json",
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let lastSearch = "";

function LocationSpy() {
  lastSearch = useLocation().search;
  return null;
}

function mount(node: ReactNode, path = "/"): HTMLDivElement {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  for (const f of FILES) client.setQueryData(["data", f], loadSnapshot(f));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          {node}
          <LocationSpy />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return host;
}

function button(label: string): HTMLButtonElement {
  const b = [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === label);
  if (!b) throw new Error(`no button labelled ${label}`);
  return b;
}

function click(label: string) {
  act(() => {
    button(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** A key press where focus is, as the browser would send it (jsdom does not move focus on Tab itself). */
function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

const replayTour = () => act(() => window.dispatchEvent(new Event(TOUR_EVENT)));

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // jsdom has no layout: give the plane and the tour the browser APIs they call, doing nothing.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
  Element.prototype.scrollIntoView = () => {};
  localStorage.clear(); // a first visit, so the tour opens
  errors = vi.spyOn(console, "error");
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  errors.mockRestore();
  vi.unstubAllGlobals();
});

const updateDepthErrors = () => errors.mock.calls.filter((c: unknown[]) => c.some((a) => String(a instanceof Error ? a.message : a).includes("Maximum update depth")));

describe("tour", () => {
  it("steps through Home's tour without an update-depth loop", () => {
    const page = mount(<Home />, "/?o2=21&p=14.7");
    expect(page.textContent).toContain("Step 1 of 3");
    click("Next");
    expect(page.textContent).toContain("Step 2 of 3");
    click("Next");
    // Step 3 moves the probe to 8.2 psi and 34% and turns on solids only: once, not forever.
    expect(page.textContent).toContain("Step 3 of 3");
    expect(new URLSearchParams(lastSearch).get("o2")).toBe("34");
    expect(new URLSearchParams(lastSearch).get("p")).toBe("8.2");
    expect(new URLSearchParams(lastSearch).get("solids")).toBe("1");
    expect(page.querySelector('[aria-label="The oxygen and pressure plane"]')).not.toBeNull();
    expect(page.textContent).toContain("No solid burn in PSI's tables records pressure.");
    // Back and forward again, then finish: still no loop, and the plane stays on screen.
    click("Back");
    expect(page.textContent).toContain("Step 2 of 3");
    click("Next");
    expect(page.textContent).toContain("Step 3 of 3");
    click("Done");
    expect(page.textContent).not.toContain("Step 3 of 3");
    expect(page.querySelector('[aria-label="The oxygen and pressure plane"]')).not.toBeNull();
    expect(localStorage.getItem("redshift-tour-v1")).toBe("done");
    expect(updateDepthErrors()).toEqual([]);
  });

  it("replays from the command palette's event three times in a row, each time to the end, without a loop", () => {
    localStorage.setItem("redshift-tour-v1", "done"); // a returning visitor: the tour opens only on replay
    const page = mount(<Home />, "/?o2=21&p=14.7");
    expect(page.textContent).not.toContain("Step 1 of 3");
    for (let pass = 1; pass <= 3; pass++) {
      replayTour();
      expect(page.textContent).toContain("Step 1 of 3");
      click("Next");
      expect(page.textContent).toContain("Step 2 of 3");
      click("Next");
      expect(page.textContent).toContain("Step 3 of 3");
      expect(new URLSearchParams(lastSearch).get("solids")).toBe("1");
      expect(page.textContent).toContain("No solid burn in PSI's tables records pressure.");
      click("Done");
      expect(page.textContent).not.toContain("Step 3 of 3");
      expect(page.querySelector('[aria-label="The oxygen and pressure plane"]')).not.toBeNull();
    }
    expect(updateDepthErrors()).toEqual([]);
  });

  it("keeps Tab inside the card while open, and hands focus back when it closes", () => {
    localStorage.setItem("redshift-tour-v1", "done");
    mount(
      <>
        <button type="button">Outside</button>
        <Tour />
      </>,
    );
    const outside = button("Outside");
    act(() => outside.focus());
    replayTour();
    const dialog = document.querySelector('[role="dialog"]');
    expect(document.activeElement).toBe(dialog);
    // Shift+Tab from the card wraps to its last button, Tab from the last wraps to the first: never behind.
    press("Tab", { shiftKey: true });
    expect(document.activeElement?.textContent).toBe("Next");
    press("Tab");
    expect(document.activeElement?.textContent).toBe("Skip tour");
    press("Tab", { shiftKey: true });
    expect(document.activeElement?.textContent).toBe("Next");
    // Focus that has fallen outside the card is brought back in on the next Tab.
    act(() => outside.focus());
    press("Tab");
    expect(dialog?.contains(document.activeElement)).toBe(true);
    click("Next");
    click("Next");
    click("Done");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("closes on Escape and returns focus too", () => {
    localStorage.setItem("redshift-tour-v1", "done");
    mount(
      <>
        <button type="button">Outside</button>
        <Tour />
      </>,
    );
    const outside = button("Outside");
    act(() => outside.focus());
    replayTour();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    press("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("runs each step's action exactly once per step change, even when the parent passes a new callback every render", () => {
    const seen: number[] = [];
    function Parent() {
      const [, setRenders] = useState(0);
      // A fresh function on every render that also re-renders the parent: the shape that used to loop.
      return <Tour onStep={(i) => { seen.push(i); setRenders((n) => n + 1); }} />;
    }
    mount(<Parent />);
    expect(seen).toEqual([0]);
    click("Next");
    click("Next");
    expect(seen).toEqual([0, 1, 2]);
    click("Back");
    expect(seen).toEqual([0, 1, 2, 1]);
    expect(updateDepthErrors()).toEqual([]);
  });

  it("does not open again once finished", () => {
    localStorage.setItem("redshift-tour-v1", "done");
    const page = mount(<Home />);
    expect(page.textContent).not.toContain("Step 1 of 3");
  });
});

describe("view state", () => {
  it("setView keeps one identity while the view changes, so callbacks built on it stay stable", () => {
    const setters: unknown[] = [];
    function Mover() {
      const [view, setView] = useView();
      setters.push(setView);
      return <button type="button" onClick={() => setView({ o2: view.o2 + 1 })}>Move</button>;
    }
    mount(<Mover />, "/?o2=34&p=8.2");
    click("Move");
    click("Move");
    expect(new URLSearchParams(lastSearch).get("o2")).toBe("36");
    expect(new URLSearchParams(lastSearch).get("p")).toBe("8.2");
    expect(setters.length).toBeGreaterThan(2);
    expect(new Set(setters).size).toBe(1);
  });
});

function Boom(): ReactNode {
  throw new Error("render failed on purpose");
}

describe("error boundary", () => {
  it("shows the error screen, not a blank page, when a component throws while drawing", () => {
    errors.mockImplementation(() => {}); // React reports the caught error; keep the test output readable
    const reloads: number[] = [];
    const page = mount(
      <ErrorBoundary onReload={() => reloads.push(1)}>
        <Boom />
      </ErrorBoundary>,
    );
    // main stays the main landmark; only the short title is the alert; focus moves to the title.
    const main = page.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.getAttribute("role")).toBeNull();
    expect(main?.getAttribute("aria-labelledby")).toBe("app-error-title");
    expect(page.querySelector('[role="alert"]')?.textContent).toBe("Something failed while this screen was drawing.");
    expect(page.querySelector("h1")?.textContent).toBe("Something failed while this screen was drawing.");
    expect(document.activeElement).toBe(page.querySelector("h1"));
    expect(page.textContent).toContain("Redshift shows nothing it cannot source.");
    expect(page.textContent).toContain("What failed");
    expect(page.textContent).toContain("render failed on purpose");
    click("Reload the page");
    expect(reloads).toEqual([1]);
  });

  it("says when part of the app did not download", () => {
    errors.mockImplementation(() => {});
    function MissingChunk(): ReactNode {
      throw new TypeError("Failed to fetch dynamically imported module: /assets/Home-abc123.js");
    }
    const page = mount(<ErrorBoundary><MissingChunk /></ErrorBoundary>);
    expect(page.querySelector("h1")?.textContent).toBe("Part of Redshift did not download.");
  });

  it("clears the error when its reset key changes (App passes the route path)", () => {
    errors.mockImplementation(() => {});
    let go: (k: string) => void = () => {};
    function TwoPages() {
      const [path, setPath] = useState("/broken");
      go = setPath;
      return <ErrorBoundary resetKey={path}>{path === "/broken" ? <Boom /> : <p>Another page</p>}</ErrorBoundary>;
    }
    const page = mount(<TwoPages />);
    expect(page.textContent).toContain("Something failed while this screen was drawing.");
    act(() => go("/compare"));
    expect(page.textContent).toContain("Another page");
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it("App's RouteBoundary catches a route that throws and clears on navigation", () => {
    errors.mockImplementation(() => {});
    let navigateTo: (to: string) => void = () => {};
    function Navigator() {
      // Outside the boundary, as the browser's own Back button and address bar are.
      navigateTo = useNavigate();
      return null;
    }
    const page = mount(
      <>
        <Navigator />
        <RouteBoundary onReload={() => {}}>
          <Routes>
            <Route path="/" element={<p>The plane</p>} />
            <Route path="/broken" element={<Boom />} />
          </Routes>
        </RouteBoundary>
      </>,
      "/broken",
    );
    expect(page.querySelector("h1")?.textContent).toBe("Something failed while this screen was drawing.");
    expect(page.textContent).not.toContain("The plane");
    act(() => navigateTo("/"));
    expect(page.textContent).toContain("The plane");
    expect(page.querySelector('[role="alert"]')).toBeNull();
    // A second visit to the broken route shows the screen again: the boundary is not stuck either way.
    act(() => navigateTo("/broken"));
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe("instrument panel", () => {
  const grid = () => decodeGrid(loadSnapshot<ProbeGridFile>("probe_grid.json"));

  it("expands and collapses the context strip from its button", () => {
    localStorage.setItem("redshift-tour-v1", "done");
    mount(<Home />, "/?o2=34&p=8.2");
    const more = button("More");
    const region = document.getElementById(more.getAttribute("aria-controls") ?? "");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(region?.hidden).toBe(true);
    click("More");
    expect(button("Less").getAttribute("aria-expanded")).toBe("true");
    expect(region?.hidden).toBe(false);
    expect(region?.querySelector('[role="radiogroup"][aria-label="Nearness step size"]')).not.toBeNull();
    click("Less");
    expect(region?.hidden).toBe(true);
  });

  it("moves the sparkline cursor with the keyboard and reads each count from the grid row", () => {
    localStorage.setItem("redshift-tour-v1", "done");
    mount(<Home />, "/?o2=34&p=8.2");
    const g = grid();
    const r = readAt(g, 34, 8.2, 1);
    const row = totalsAlongO2(g, r.j, 1);
    const line = document.querySelector<HTMLElement>('[role="slider"]')!;
    const readout = () => line.previousElementSibling!.lastElementChild!;
    expect(line.getAttribute("aria-valuenow")).toBe(String(r.i));
    act(() => line.focus());
    press("ArrowRight");
    press("ArrowRight");
    expect(line.getAttribute("aria-valuenow")).toBe(String(r.i + 2));
    const at = readout().querySelectorAll("[data-prov]");
    expect(at[0].getAttribute("data-prov")).toBe(row.axis[r.i + 2].p);
    expect(at[0].textContent).toBe(`${row.axis[r.i + 2].v}%`);
    expect(at[1].getAttribute("data-prov")).toBe("probe:1:total");
    expect(at[1].textContent).toBe(`${row.counts[r.i + 2].v} tests`);
    press("End");
    expect(line.getAttribute("aria-valuenow")).toBe(String(g.o2.length - 1));
    press("Home");
    expect(line.getAttribute("aria-valuenow")).toBe("0");
  });

  it("copies the link from Share and says so in a toast", () => {
    localStorage.setItem("redshift-tour-v1", "done");
    mount(<Home />, "/?o2=34&p=8.2");
    const status = document.querySelector('nav[aria-label="Take this point further"]')!.parentElement!.querySelector('[role="status"]')!;
    expect(status.textContent).toBe("");
    click("Share");
    expect(status.textContent).toBe("Link copied");
  });
});
