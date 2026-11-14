// Interaction tests under jsdom: real clicks through react-dom/client and React's act, no testing library
// (decision D6, no new dependencies). Home renders from the real data snapshot (web/public/data) with the
// query cache pre-filled, as in panel.test.tsx, so nothing touches the network.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSnapshot } from "../lib/snapshot.fixture";
import { useView } from "../lib/view";
import Home from "../pages/Home";
import { ErrorBoundary } from "./ErrorBoundary";
import { Tour } from "./Tour";

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
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    expect(page.querySelector("h1")?.textContent).toBe("Something failed while this screen was drawing.");
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
});
