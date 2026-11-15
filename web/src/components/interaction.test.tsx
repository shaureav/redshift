// Interaction tests under jsdom: real clicks through react-dom/client and React's act, no testing library
// (decision D6, no new dependencies). Home renders from the real data snapshot (web/public/data) with the
// query cache pre-filled, as in panel.test.tsx, so nothing touches the network.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, lazy, Suspense, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geiger, SOUND_KEY } from "../lib/geiger";
import { requestPlane } from "../lib/planeRequest";
import { decodeGrid, readAt, totalsAlongO2, type ProbeGridFile } from "../lib/probe";
import { loadSnapshot } from "../lib/snapshot.fixture";
import { useView } from "../lib/view";
import Home from "../pages/Home";
import { CommandPalette } from "./CommandPalette";
import { ErrorBoundary, RouteBoundary } from "./ErrorBoundary";
import { Toaster } from "./Toaster";
import { INTRO_KEY } from "./Intro";

const FILES = [
  "probe_grid.json", "trade_map.json", "candidates.json", "candidate_evidence.json", "flame_temperature_grid.json",
  "planner_grid.json", "prebreathe.json", "access_gap.json", "ai_text.json", "dataset_version.json", "investigations.json",
  "provenance.json",
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let lastSearch = "";
let lastPath = "";

function LocationSpy() {
  const loc = useLocation();
  lastSearch = loc.search;
  lastPath = loc.pathname;
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

/** Opens the palette with Ctrl+K, types into its field as a person would, and runs the first result. */
function runFromPalette(text: string) {
  press("k", { ctrlKey: true });
  const field = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** Where the plane's plot starts inside its overlay, in px (charts/Plane.tsx translates the plot by its margins). */
const plotOrigin = (): [number, number] => {
  const t = document.querySelector('svg[role="application"] > g')!.getAttribute("transform")!;
  const [, x, y] = t.match(/translate\(([\d.]+),([\d.]+)\)/)!;
  return [Number(x), Number(y)];
};

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // jsdom has no layout: give the plane and the intro the browser APIs they call, doing nothing.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
  Element.prototype.scrollIntoView = () => {};
  localStorage.clear(); // a first visit, so the story intro opens on the bare plane
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

describe("story intro", () => {
  const BEAT_TITLES = ["NASA has not chosen the Moon-base atmosphere.", "These are the fire tests PSI lets us place in this range.", "Now only solid materials."];
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="intro-title"]');
  const title = () => document.getElementById("intro-title")?.textContent;
  /** The beat the live plane is drawing (charts/Plane.tsx, data-intro), or null once the intro has handed over. */
  const stage = () => document.querySelector('section[aria-label="The oxygen and pressure plane"] [data-intro]')?.getAttribute("data-intro") ?? null;
  const q = () => new URLSearchParams(lastSearch);

  it("opens on a first visit and walks all three beats with the arrow keys over the live plane, writing nothing to the address bar", () => {
    const page = mount(<Home />, "/");
    const cands = loadSnapshot<{ candidates: unknown[] }>("candidates.json").candidates;
    expect(dialog()).not.toBeNull();
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Next");
    // The dimmed panel behind it is inert and hidden from assistive technology until the hand-over.
    const panel = () => document.querySelector("aside.sheet")!;
    expect(panel().hasAttribute("inert")).toBe(true);
    expect(panel().getAttribute("aria-hidden")).toBe("true");
    // Beat 1: the bare plot, the pins appear and pulse, and they carry their names alone (no land yet). No sea
    // either: sea says "no tests near", which the build's counts contradict wherever tests sit (D37).
    const sea = () => page.querySelector('rect[fill="var(--sea)"]')?.closest("g.layer")?.getAttribute("data-on");
    expect(title()).toBe(BEAT_TITLES[0]);
    expect(stage()).toBe("pins");
    expect(sea()).toBe("false");
    expect(page.querySelectorAll(".pin-pulse")).toHaveLength(cands.length);
    expect([...page.querySelectorAll("svg[data-chart] text tspan")].some((t) => /inland|coast|sea/.test(t.textContent ?? ""))).toBe(false);
    // Beat 2: the land rises with the sea around it, and the glyphs come in by fuel class.
    press("ArrowRight");
    expect(title()).toBe(BEAT_TITLES[1]);
    expect(stage()).toBe("land");
    expect(sea()).toBe("true");
    expect(page.querySelectorAll(".pin-pulse")).toHaveLength(0);
    expect(page.querySelectorAll(".glyph-class").length).toBeGreaterThan(1);
    // Beat 3: the land sinks; the plane says no solid test can be placed.
    press("ArrowDown");
    expect(title()).toBe(BEAT_TITLES[2]);
    expect(stage()).toBe("solids");
    expect(page.textContent).toContain("No solid-material test can be placed on this plane");
    // The last beat stays the last; back and forward again.
    press("ArrowRight");
    expect(title()).toBe(BEAT_TITLES[2]);
    press("ArrowLeft");
    expect(stage()).toBe("land");
    press("PageDown");
    expect(stage()).toBe("solids");
    // Nothing was written to the address bar while the intro played: only Explore hands over.
    expect(lastSearch).toBe("");
    click("Explore");
    expect(dialog()).toBeNull();
    expect(stage()).toBeNull();
    expect(panel().hasAttribute("inert")).toBe(false);
    expect(panel().hasAttribute("aria-hidden")).toBe(false);
    expect([q().get("o2"), q().get("p"), q().get("solids")]).toEqual(["34", "8.2", "1"]);
    expect(localStorage.getItem(INTRO_KEY)).toBe("done");
    // The keyboard is handed to the plane, so the arrow keys move the probe at once.
    expect(document.activeElement?.getAttribute("aria-roledescription")).toBe("plane");
    expect(page.textContent).toContain("No solid burn in PSI's tables records pressure.");
    expect(updateDepthErrors()).toEqual([]);
  });

  it("cites the access-gap counts in its last beat, each through Value with its provenance", () => {
    mount(<Home />, "/");
    press("ArrowRight");
    press("ArrowRight");
    const steps = loadSnapshot<{ psi_steps: { count: { p: string; v: number } }[] }>("access_gap.json").psi_steps;
    const cited = [...dialog()!.querySelectorAll("[data-prov]")].map((e) => [e.getAttribute("data-prov"), e.textContent]);
    expect(cited).toEqual(steps.map((s) => [s.count.p, String(s.count.v)]));
    // No other digit anywhere in the card.
    const walk = document.createTreeWalker(dialog()!, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (/\d/.test(n.textContent ?? "")) expect(n.parentElement?.closest("[data-prov]")).not.toBeNull();
    }
  });

  it("skips with Escape at any beat, keeps the view, and does not open again on this device", () => {
    mount(<Home />, "/");
    press("ArrowRight");
    press("Escape");
    expect(dialog()).toBeNull();
    expect(stage()).toBeNull();
    expect(lastSearch).toBe("");
    expect(localStorage.getItem(INTRO_KEY)).toBe("done");
    act(() => root?.unmount());
    host?.remove();
    mount(<Home />, "/");
    expect(dialog()).toBeNull();
  });

  it("steps on a click on the plane, and one beat per scroll gesture without scrolling the page", () => {
    mount(<Home />, "/");
    const catcher = document.querySelector("[data-intro-catcher]")!;
    act(() => { catcher.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(stage()).toBe("land");
    const layer = catcher.parentElement!;
    const wheel = (deltaY: number) => {
      const e = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
      act(() => { layer.dispatchEvent(e); });
      return e;
    };
    // A burst of wheel events is one gesture: one beat.
    for (let k = 0; k < 6; k++) expect(wheel(30).defaultPrevented).toBe(true);
    expect(stage()).toBe("solids");
    expect(wheel(-30).defaultPrevented).toBe(true); // still the same gesture
    expect(stage()).toBe("solids");
  });

  it("keeps Tab inside its card", () => {
    mount(<Home />, "/");
    press("ArrowRight"); // Skip intro, Back, Next
    expect(document.activeElement?.textContent).toBe("Next");
    press("Tab");
    expect(document.activeElement?.textContent).toBe("Skip intro");
    press("Tab", { shiftKey: true });
    expect(document.activeElement?.textContent).toBe("Next");
  });

  it("waits on a shared link, replays from the palette, and Skip leaves the link's view as it was", async () => {
    mount(<><CommandPalette /><Home /></>, "/?o2=21&p=14.7");
    expect(dialog()).toBeNull();
    runFromPalette("replay the intro");
    await settle();
    expect(title()).toBe(BEAT_TITLES[0]);
    expect(lastSearch).toBe("?o2=21&p=14.7");
    click("Skip intro");
    expect(dialog()).toBeNull();
    expect(lastSearch).toBe("?o2=21&p=14.7");
    expect(updateDepthErrors()).toEqual([]);
  });

  it("leaves an Escape that a dialog over it has already taken, so closing the palette never skips the story", () => {
    mount(<Home />, "/");
    // In a browser the command palette's (or the shortcut sheet's) own Escape handler closes it and hands focus back
    // to this card before the key reaches the document; a listener that takes the key stands in for it here.
    const taken = (e: KeyboardEvent) => { if (e.key === "Escape") e.preventDefault(); };
    document.body.addEventListener("keydown", taken);
    try {
      expect(dialog()?.contains(document.activeElement)).toBe(true);
      press("Escape");
    } finally {
      document.body.removeEventListener("keydown", taken);
    }
    expect(dialog()).not.toBeNull();
    expect(localStorage.getItem(INTRO_KEY)).toBeNull();
    press("Escape"); // its own Escape still skips
    expect(dialog()).toBeNull();
  });

  it("draws the shortcut sheet and the access gap above its click catcher when either opens over it", () => {
    mount(<Home />, "/?view=gap");
    act(() => requestPlane("intro"));
    act(() => requestPlane("shortcuts"));
    expect(dialog()).not.toBeNull();
    const z = (el: Element | null | undefined) => Number(el?.getAttribute("class")?.match(/\bz-\[(\d+)\]/)?.[1] ?? Number.NaN);
    const introLayer = z(document.querySelector("[data-intro-catcher]")?.parentElement);
    expect(introLayer).toBe(58);
    expect(z(document.querySelector('[aria-labelledby="shortcut-title"]')?.parentElement)).toBeGreaterThan(introLayer);
    expect(z(document.querySelector('[aria-label="The access gap"]')?.parentElement)).toBeGreaterThan(introLayer);
  });

  it("keeps focus in its card when Back returns to the first beat, which has no Back button", () => {
    mount(<Home />, "/");
    press("ArrowRight");
    act(() => button("Back").focus());
    click("Back");
    expect(title()).toBe(BEAT_TITLES[0]);
    expect(document.activeElement).toBe(button("Next"));
  });

  it("on Skip of a replay, gives focus back to the panel control it came from once the panel is no longer inert", async () => {
    mount(<><CommandPalette /><Home /></>, "/?o2=21&p=14.7");
    const more = button("More");
    act(() => more.focus());
    let inertAtFocus: boolean | null = null;
    more.addEventListener("focus", () => { inertAtFocus = !!more.closest("[inert]"); });
    runFromPalette("replay the intro");
    await settle();
    expect(title()).toBe(BEAT_TITLES[0]);
    expect(more.closest("[inert]")).not.toBeNull();
    inertAtFocus = null;
    click("Skip intro");
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(inertAtFocus).toBe(false);
  });

  it("under reduced motion shows the same three beats as still frames, with no pulse", () => {
    vi.stubGlobal("matchMedia", (m: string) => ({ matches: m.includes("reduce"), media: m, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
    const page = mount(<Home />, "/");
    const seen: (string | null | undefined)[] = [];
    for (let k = 0; k < 3; k++) {
      seen.push(title());
      expect(page.querySelectorAll(".pin-pulse")).toHaveLength(0);
      press("ArrowRight");
    }
    expect(seen).toEqual(BEAT_TITLES);
    expect(stage()).toBe("solids");
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
    localStorage.setItem(INTRO_KEY, "done");
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
    localStorage.setItem(INTRO_KEY, "done");
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

  it("runs the plane's controls from its floating toolbar, by click and by keyboard", () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<Home />, "/?o2=34&p=8.2");
    const tool = (name: string) => document.querySelector<HTMLButtonElement>(`[role="toolbar"] [aria-label="${name}"]`)!;
    const press1 = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    // Candidates: a menu of the five pins, each with its evidence word; picking one moves the probe there.
    press1(tool("Candidates"));
    expect(tool("Candidates").getAttribute("aria-expanded")).toBe("true");
    const menu = document.querySelector('[aria-label="Go to a candidate atmosphere"]')!;
    expect(menu.querySelectorAll("button")).toHaveLength(5);
    expect(menu.parentElement?.textContent).toContain("not fire risk");
    // Each row shows its shortcut key (1 to 5) before the name.
    expect([...menu.querySelectorAll(".kbd")].map((k) => k.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    press1([...menu.querySelectorAll("button")].find((b) => b.textContent?.includes("10.2 psi / 26.5% O2"))!);
    expect(new URLSearchParams(lastSearch).get("o2")).toBe("26.5");
    expect(new URLSearchParams(lastSearch).get("p")).toBe("10.2");
    expect(document.activeElement).toBe(tool("Candidates"));
    // Zoom and Solids only write the view; Escape closes an open menu and hands focus back to its tool.
    press1(tool("Zoom"));
    press1([...document.querySelectorAll('[aria-label="Zoom"][role="group"] button')].find((b) => b.textContent === "Whole plane")!);
    expect(new URLSearchParams(lastSearch).get("zoom")).toBe("plane");
    press1(tool("Layers"));
    expect(document.querySelector('[role="group"][aria-label="Layers"]')).not.toBeNull();
    press("Escape");
    expect(document.querySelector('[role="group"][aria-label="Layers"]')).toBeNull();
    expect(document.activeElement).toBe(tool("Layers"));
    press1(tool("Solids only"));
    expect(new URLSearchParams(lastSearch).get("solids")).toBe("1");
    // Arrow keys step between the tools.
    act(() => tool("Solids only").focus());
    press("ArrowRight");
    expect(document.activeElement).toBe(tool("Candidates"));
    press("ArrowLeft");
    press("ArrowLeft");
    expect(document.activeElement).toBe(tool("Geiger clicks"));
    press("ArrowLeft");
    expect(document.activeElement).toBe(tool("Select area"));
    // Focus leaving an open menu (the arrow keys to the next tool) closes it: two menus are never open at once.
    press1(tool("Candidates"));
    expect(tool("Candidates").getAttribute("aria-expanded")).toBe("true");
    act(() => tool("Layers").focus());
    expect(tool("Candidates").getAttribute("aria-expanded")).toBe("false");
    press1(tool("Layers"));
    expect(document.querySelectorAll('[role="toolbar"] [aria-expanded="true"]')).toHaveLength(1);
  });

  it("keeps Dossier focusable away from a named atmosphere, and says why in a toast", () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<><Home /><Toaster /></>, "/?o2=40&p=4");
    const dossier = [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Take this point further"] button')].find((b) => b.textContent?.startsWith("Dossier"))!;
    expect(dossier.disabled).toBe(false);
    expect(dossier.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(dossier.getAttribute("aria-describedby")!)?.textContent).toContain("named atmospheres");
    act(() => { dossier.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(document.querySelector('[role="status"].fixed')?.textContent).toContain("snap the probe to one");
  });

  it("copies the link from Share and says so in a toast", async () => {
    localStorage.setItem(INTRO_KEY, "done");
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    try {
      mount(<><Home /><Toaster /></>, "/?o2=34&p=8.2");
      // One live region for the whole app, always in the page.
      const status = document.querySelector('[role="status"].fixed')!;
      expect(status.textContent).toBe("");
      await act(async () => {
        button("Share").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(status.textContent).toBe("Link copied");
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });
});

describe("feel (Phase 4)", () => {
  const q = () => new URLSearchParams(lastSearch);

  it("runs the plane's shortcuts from anywhere on the page: 1 to 5, S, G, ? and C", () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<Home />, "/?o2=31&p=9");
    expect(document.activeElement).toBe(document.body);
    press("2");
    expect([q().get("o2"), q().get("p")]).toEqual(["26.5", "10.2"]);
    press("5");
    expect([q().get("o2"), q().get("p")]).toEqual(["100", "4.3"]);
    press("1");
    expect([q().get("o2"), q().get("p")]).toEqual(["21", "14.7"]);
    press("s");
    expect(q().get("solids")).toBe("1");
    press("S");
    expect(q().get("solids")).toBeNull();
    // ? opens the sheet, a modal dialog: the page behind it ignores shortcuts until it closes.
    press("?");
    const sheet = document.querySelector('[role="dialog"][aria-labelledby="shortcut-title"]');
    expect(sheet?.textContent).toContain("Keyboard shortcuts");
    expect(sheet?.textContent).toContain("10.2 psi / 26.5% O2");
    expect(sheet?.contains(document.activeElement)).toBe(true);
    press("s");
    expect(q().get("solids")).toBeNull();
    press("Escape");
    expect(document.querySelector('[aria-labelledby="shortcut-title"]')).toBeNull();
    // G opens the access gap; behind it, 3 does nothing.
    press("g");
    expect(q().get("view")).toBe("gap");
    expect(document.querySelector('[role="dialog"][aria-label="The access gap"]')).not.toBeNull();
    act(() => (document.activeElement as HTMLElement).blur());
    press("3");
    expect(q().get("o2")).toBe("21");
    press("Escape");
    // C opens Compare with this point and a candidate.
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    press("c");
    expect(q().get("pts")).toBe("21,14.7;34,8.2");
    expect(updateDepthErrors()).toEqual([]);
  });

  it("draws the probe trail as the probe moves, and none under reduced motion, where Layers says why", () => {
    localStorage.setItem(INTRO_KEY, "done");
    const moveProbe = () => {
      const plane = document.querySelector<SVGSVGElement>('svg[role="application"]')!;
      act(() => plane.focus());
      for (let k = 0; k < 4; k++) press("ArrowRight");
      return plane;
    };
    mount(<Home />, "/?o2=31&p=9");
    expect(moveProbe().querySelectorAll(".trail line").length).toBe(4);
    act(() => root?.unmount());
    host?.remove();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
    mount(<Home />, "/?o2=31&p=9");
    expect(moveProbe().querySelectorAll(".trail line").length).toBe(0);
    act(() => { document.querySelector('[role="toolbar"] [aria-label="Layers"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const trailSwitch = [...document.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Layers"] button')].find((b) => b.textContent?.startsWith("Probe trail"))!;
    expect(trailSwitch.disabled).toBe(true);
    expect(trailSwitch.getAttribute("aria-checked")).toBe("false");
    expect(trailSwitch.textContent).toContain("reduced motion");
  });

  it("never fires a shortcut while someone types in a field", () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<Home />, "/?o2=31&p=9");
    const field = document.getElementById("ask-input") as HTMLInputElement;
    act(() => field.focus());
    for (const k of ["1", "2", "s", "g", "c", "?"]) press(k);
    expect([q().get("o2"), q().get("p"), q().get("solids"), q().get("view")]).toEqual(["31", "9", null, null]);
    expect(document.querySelector('[aria-labelledby="shortcut-title"]')).toBeNull();
  });

  it("has sound off by default, and says so when this browser has no audio", () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<><Home /><Toaster /></>, "/?o2=34&p=8.2");
    const sound = document.querySelector<HTMLButtonElement>('[role="toolbar"] [aria-label="Geiger clicks"]')!;
    expect(sound.getAttribute("role")).toBe("switch");
    expect(sound.getAttribute("aria-checked")).toBe("false");
    act(() => { sound.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); // jsdom has no WebAudio
    expect(sound.getAttribute("aria-checked")).toBe("false");
    expect(localStorage.getItem(SOUND_KEY)).not.toBe("on");
    expect(document.querySelector('[role="status"].fixed')?.textContent).toBe("Sound is not available in this browser");
  });

  it("left on from a last visit, makes no AudioContext until the first tap", () => {
    localStorage.setItem(INTRO_KEY, "done");
    localStorage.setItem(SOUND_KEY, "on");
    let made = 0;
    class FakeCtx {
      currentTime = 0;
      sampleRate = 8000;
      destination = {};
      constructor() { made++; }
      createGain() { return { gain: { value: 1 }, connect() {} }; }
      createBuffer(_c: number, n: number) { const d = new Float32Array(n); return { getChannelData: () => d }; }
      createBufferSource() { return { connect() {}, start() {} }; }
      resume() { return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
    }
    vi.stubGlobal("AudioContext", FakeCtx);
    mount(<Home />, "/?o2=34&p=8.2");
    const sound = document.querySelector('[role="toolbar"] [aria-label="Geiger clicks"]')!;
    expect(sound.getAttribute("aria-checked")).toBe("true");
    expect(made).toBe(0);
    act(() => { document.dispatchEvent(new Event("pointerup")); });
    expect(made).toBe(1);
  });
});

describe("plane requests from the command palette, and sound under Solids only (Phase 4 review)", () => {
  const sheet = () => document.querySelector('[role="dialog"][aria-labelledby="shortcut-title"]');

  it("opens the shortcut sheet from another page, even while the plane page is still downloading", async () => {
    localStorage.setItem(INTRO_KEY, "done");
    // The plane page arrives only when the test says so, long after the old 50 ms event would have been lost.
    let arrive: () => void = () => {};
    const SlowHome = lazy(() => new Promise<{ default: typeof Home }>((r) => { arrive = () => r({ default: Home }); }));
    mount(
      <>
        <CommandPalette />
        <Routes>
          <Route path="/" element={<Suspense fallback={<p>Loading the plane</p>}><SlowHome /></Suspense>} />
          <Route path="/evidence" element={<p>Evidence</p>} />
        </Routes>
      </>,
      "/evidence",
    );
    runFromPalette("keyboard shortcuts");
    await settle();
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(lastPath).toBe("/");
    expect(sheet()).toBeNull(); // still downloading
    await act(async () => { arrive(); await Promise.resolve(); });
    await settle();
    expect(sheet()?.textContent).toContain("Keyboard shortcuts");
  });

  it("on the plane, opens the sheet and keeps the view in the address bar", async () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<><CommandPalette /><Home /></>, "/?o2=21&p=14.7&solids=1");
    runFromPalette("keyboard shortcuts");
    await settle();
    expect(sheet()).not.toBeNull();
    expect(lastSearch).toBe("?o2=21&p=14.7&solids=1");
  });

  it("keeps the Geiger clicks silent at a habitat candidate under Solids only, and follows the total without it", () => {
    localStorage.setItem(INTRO_KEY, "done");
    localStorage.setItem(SOUND_KEY, "on");
    const set = vi.spyOn(geiger, "setTotal");
    try {
      mount(<Home />, "/?o2=21&p=14.7&solids=1");
      const last = () => set.mock.calls[set.mock.calls.length - 1]?.[0];
      expect(document.querySelector('svg[role="application"]')?.getAttribute("aria-label")).toContain("at sea");
      expect(last()).toBe(0);
      press("s"); // Solids only off: the land the clicks follow is back
      const total = readAt(decodeGrid(loadSnapshot<ProbeGridFile>("probe_grid.json")), 21, 14.7, 1).total.v;
      expect(total).toBeGreaterThan(0);
      expect(last()).toBe(total);
      press("s");
      expect(last()).toBe(0);
    } finally {
      set.mockRestore();
    }
  });
});

describe("phone (Phase 6)", () => {
  const q = () => new URLSearchParams(lastSearch);
  /** A phone's screen: every width query (the sheet's, below lg, and the toolbar's, below sm) matches. */
  const asPhone = () => vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
  /** A pointer event as the browser sends it (jsdom has no PointerEvent): a mouse event with the pointer's id and kind. */
  const pointer = (el: Element, type: string, { id = 1, x = 0, y = 0, kind = "touch", t }: { id?: number; x?: number; y?: number; kind?: string; t?: number }) => {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(ev, "pointerId", { value: id });
    Object.defineProperty(ev, "pointerType", { value: kind });
    if (t !== undefined) Object.defineProperty(ev, "timeStamp", { value: t });
    act(() => { el.dispatchEvent(ev); });
  };
  const sheet = () => document.querySelector<HTMLElement>("aside.sheet")!;
  const handle = () => sheet().querySelector<HTMLButtonElement>(":scope > button")!;
  const tap = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

  it("puts the panel in a bottom sheet that steps peek, half and full by tap and keys, and holds focus when full", () => {
    localStorage.setItem(INTRO_KEY, "done");
    asPhone();
    mount(<Home />, "/?o2=34&p=8.2");
    expect(sheet().getAttribute("data-snap")).toBe("peek");
    expect(sheet().getAttribute("aria-label")).toBe("Evidence near the probe");
    expect(handle().getAttribute("aria-label")).toBe("Evidence sheet, peek, showing the readout");
    // The phone's readout leads with its tiles: the peek is the point and its counts.
    const header = sheet().querySelector('[data-testid="evidence-panel"] > header')!;
    expect(header.children[2].matches("[data-sheet-peek]")).toBe(true);
    tap(handle());
    expect(sheet().getAttribute("data-snap")).toBe("half");
    expect(sheet().getAttribute("role")).toBeNull();
    act(() => handle().focus());
    press("ArrowUp");
    expect(sheet().getAttribute("data-snap")).toBe("full");
    expect(sheet().getAttribute("role")).toBe("dialog");
    expect(sheet().getAttribute("aria-modal")).toBe("true");
    // Full is modal: the plane's shortcuts wait, Tab wraps inside the sheet, Escape brings it back to half.
    press("s");
    expect(q().get("solids")).toBeNull();
    press("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(button("Share"));
    press("Tab");
    expect(document.activeElement).toBe(handle());
    press("Escape");
    expect(sheet().getAttribute("data-snap")).toBe("half");
    expect(document.activeElement).toBe(handle());
    press("End");
    expect(sheet().getAttribute("data-snap")).toBe("full");
    press("Home");
    expect(sheet().getAttribute("data-snap")).toBe("peek");
    press("PageUp");
    expect(sheet().getAttribute("data-snap")).toBe("half");
    press("ArrowDown");
    expect(sheet().getAttribute("data-snap")).toBe("peek");
    // A tap steps on round: peek, half, full, peek.
    for (const s of ["half", "full", "peek"]) {
      tap(handle());
      expect(sheet().getAttribute("data-snap")).toBe(s);
    }
  });

  it("follows a finger or the pointer dragging the handle, and rests at the nearest snap point", () => {
    localStorage.setItem(INTRO_KEY, "done");
    asPhone();
    mount(<Home />, "/?o2=34&p=8.2");
    // Unmeasured (jsdom has no layout), the sheet peeks 280 px and halves at 440 px.
    pointer(handle(), "pointerdown", { id: 7, y: 700, t: 1 });
    pointer(handle(), "pointermove", { id: 7, y: 600, t: 500 });
    expect(sheet().hasAttribute("data-dragging")).toBe(true);
    expect(sheet().style.getPropertyValue("--sheet-drag")).toBe("380px");
    pointer(handle(), "pointermove", { id: 7, y: 540, t: 1000 });
    pointer(handle(), "pointerup", { id: 7, y: 540, t: 1100 });
    tap(handle()); // the click that ends a drag is not a tap
    expect(sheet().getAttribute("data-snap")).toBe("half");
    expect(sheet().hasAttribute("data-dragging")).toBe(false);
    expect(sheet().style.getPropertyValue("--sheet-drag")).toBe("");
    // A mouse drags it down from full to peek.
    act(() => handle().focus());
    press("End");
    pointer(handle(), "pointerdown", { id: 1, kind: "mouse", y: 100, t: 1 });
    pointer(handle(), "pointermove", { id: 1, kind: "mouse", y: 500, t: 800 });
    pointer(handle(), "pointermove", { id: 1, kind: "mouse", y: 560, t: 1600 });
    pointer(handle(), "pointerup", { id: 1, kind: "mouse", y: 560, t: 1700 });
    expect(sheet().getAttribute("data-snap")).toBe("peek");
  });

  it("folds the plane's tools into one menu button, whose rows hold every tool", () => {
    localStorage.setItem(INTRO_KEY, "done");
    asPhone();
    mount(<Home />, "/?o2=34&p=8.2");
    expect(document.querySelector('[role="toolbar"][aria-label="Plane tools"]')).toBeNull();
    const menu = document.querySelector<HTMLButtonElement>('button[aria-label="Plane tools"]')!;
    expect(menu.textContent?.trim()).toBe("Tools");
    const open = () => {
      tap(menu);
      return document.querySelector('[role="group"][aria-label="Plane tools"]')!;
    };
    const rows = (g: Element) => [...g.querySelectorAll(":scope > button, :scope > div > button")].map((b) => b.textContent);
    expect(rows(open())).toEqual(["Solids only", "Candidates", "Layers", "Zoom: Habitat range", "Select area", "Geiger clicks"]);
    // Candidates opens in place; a pick moves the probe and closes the menu, focus back on its button.
    tap(button("Candidates"));
    expect(button("Candidates").getAttribute("aria-expanded")).toBe("true");
    tap([...document.querySelectorAll('[aria-label="Go to a candidate atmosphere"] button')].find((b) => b.textContent?.includes("10.2 psi / 26.5% O2"))!);
    expect([q().get("o2"), q().get("p")]).toEqual(["26.5", "10.2"]);
    expect(document.querySelector('[role="group"][aria-label="Plane tools"]')).toBeNull();
    expect(document.activeElement).toBe(menu);
    tap(open().querySelector('[role="switch"]')!);
    expect(q().get("solids")).toBe("1");
    open();
    tap(button("Zoom: Habitat range"));
    tap(button("Whole plane"));
    expect(q().get("zoom")).toBe("plane");
    open();
    press("Escape");
    expect(document.querySelector('[role="group"][aria-label="Plane tools"]')).toBeNull();
    expect(document.activeElement).toBe(menu);
  });

  it("pins with a tap, previews with a press and hold, and zooms with a pinch that the address bar keeps", () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<Home />, "/?o2=31&p=9");
    const surface = document.querySelector('svg[role="application"] rect[fill="transparent"]')!;
    // jsdom has no layout: the plane is its 960 x 640 fallback; the plot's offset is read from the overlay (16 px
    // down under a floating toolbar, lower when the toolbar takes its band).
    const [ox, oy] = plotOrigin();
    const at = (px: number, py: number) => ({ x: ox + px, y: oy + py });
    const pin = [...document.querySelectorAll("svg[data-chart] g[transform] > text")].find((t) => t.textContent?.startsWith("10.2 psi / 26.5% O2"))!;
    const [cx, cy] = pin.parentElement!.getAttribute("transform")!.match(/translate\(([\d.]+),([\d.]+)\)/)!.slice(1).map(Number);
    // A tap 18 px from a pin snaps to it (a fingertip's magnet is wider than a pointer's 14 px).
    pointer(surface, "pointerdown", { id: 1, ...at(cx + 18, cy) });
    pointer(surface, "pointerup", { id: 1, ...at(cx + 18, cy) });
    expect([q().get("o2"), q().get("p")]).toEqual(["26.5", "10.2"]);
    const eyebrow = () => document.querySelector('[data-testid="evidence-panel"] .eyebrow')?.textContent;
    expect(eyebrow()).toBe("Candidate atmosphere");
    // Press and hold: a preview of the point under the finger, gone when it lifts; nothing is pinned.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      pointer(surface, "pointerdown", { id: 2, ...at(100, 100) });
      expect(eyebrow()).toBe("Candidate atmosphere");
      act(() => { vi.advanceTimersByTime(500); });
      expect(eyebrow()).toBe("Preview");
      pointer(surface, "pointerup", { id: 2, ...at(100, 100) });
      expect(eyebrow()).toBe("Candidate atmosphere");
      expect([q().get("o2"), q().get("p")]).toEqual(["26.5", "10.2"]);
    } finally {
      vi.useRealTimers();
    }
    // Two fingers spreading to twice their distance halve the window; the address bar keeps it, and the probe stays.
    pointer(surface, "pointerdown", { id: 3, ...at(300, 200) });
    pointer(surface, "pointerdown", { id: 4, ...at(400, 200) });
    pointer(surface, "pointermove", { id: 4, ...at(500, 200) });
    pointer(surface, "pointerup", { id: 4, ...at(500, 200) });
    pointer(surface, "pointerup", { id: 3, ...at(300, 200) });
    const win = q().get("win")!.split(",").map(Number);
    expect(win[1] - win[0]).toBeCloseTo(15, 2);
    expect([q().get("o2"), q().get("p")]).toEqual(["26.5", "10.2"]);
    const zoom = document.querySelector<HTMLButtonElement>('[role="toolbar"] [aria-label="Zoom"]')!;
    expect(zoom.getAttribute("data-tip")).toBe("Zoom: pinched");
    // A preset puts the plane back on its range.
    tap(zoom);
    tap(button("Habitat range"));
    expect(q().get("win")).toBeNull();
    expect(updateDepthErrors()).toEqual([]);
  });
});

describe("completeness review fixes", () => {
  const q = () => new URLSearchParams(lastSearch);
  const pointer = (el: Element, type: string, { id = 1, x = 0, y = 0, kind = "touch" }: { id?: number; x?: number; y?: number; kind?: string }) => {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(ev, "pointerId", { value: id });
    Object.defineProperty(ev, "pointerType", { value: kind });
    act(() => { el.dispatchEvent(ev); });
  };
  const toastText = () => document.querySelector('[role="status"].fixed')?.textContent;

  it("P pins the point the panel previews into the address bar and says so in a toast", () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<><Home /><Toaster /></>, "/?o2=31&p=9");
    const surface = document.querySelector('svg[role="application"] rect[fill="transparent"]')!;
    const eyebrow = () => document.querySelector('[data-testid="evidence-panel"] .eyebrow')?.textContent;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // Press and hold previews a point; P pins it.
      const [ox, oy] = plotOrigin();
      pointer(surface, "pointerdown", { id: 2, x: ox + 100, y: oy + 100 });
      act(() => { vi.advanceTimersByTime(500); });
      expect(eyebrow()).toBe("Preview");
      press("p");
      const pinned = [q().get("o2"), q().get("p")];
      expect(pinned).not.toEqual(["31", "9"]);
      expect(toastText()).toBe("Pinned: the link in the address bar now opens this point");
      pointer(surface, "pointerup", { id: 2, x: ox + 100, y: oy + 100 });
      expect([q().get("o2"), q().get("p")]).toEqual(pinned);
      expect(eyebrow()).not.toBe("Preview");
    } finally {
      vi.useRealTimers();
    }
  });

  it("steps through the command palette's results with the arrow keys, runs one with Enter, and says when nothing matches", async () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<><CommandPalette /><Home /></>, "/?o2=31&p=9");
    press("k", { ctrlKey: true });
    const field = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    const key = (k: string) => act(() => { field.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); });
    const type = (text: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    const selected = () => options().filter((o) => o.getAttribute("aria-selected") === "true").map((o) => o.id);
    expect(options().length).toBeGreaterThan(2);
    const [first, second] = options().map((o) => o.id);
    expect(field.getAttribute("aria-activedescendant")).toBe(first);
    expect(selected()).toEqual([first]);
    key("ArrowDown");
    expect(field.getAttribute("aria-activedescendant")).toBe(second);
    expect(selected()).toEqual([second]);
    key("ArrowUp");
    key("ArrowUp"); // stays on the first
    expect(field.getAttribute("aria-activedescendant")).toBe(first);
    // Nothing matches: the empty state gives an example, and no option is active.
    type("zzzz qqqq xxxx");
    expect(options()).toHaveLength(0);
    expect(field.hasAttribute("aria-activedescendant")).toBe(false);
    expect(document.querySelector('[role="listbox"]')?.textContent).toContain("Nothing matches. Try an oxygen and pressure such as");
    // A query, then Enter runs the active row.
    type("keyboard shortcuts");
    key("Enter");
    await settle();
    expect(document.querySelector('[role="dialog"][aria-labelledby="shortcut-title"]')).not.toBeNull();
  });

  it("shows a glyph's count badge when the keyboard probe lands on it, and Tab reaches its Value", () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<Home />, "/?o2=26.5&p=10.2");
    const plane = document.querySelector<SVGSVGElement>('svg[role="application"]')!;
    const badge = () => document.querySelector('section[aria-label="The oxygen and pressure plane"] div.floating [data-prov]');
    act(() => plane.focus());
    expect(badge()).toBeNull();
    // Shift and up: the next candidate above, Earth's sea-level air, where droplet and gas tests sit.
    press("ArrowUp", { shiftKey: true });
    expect([q().get("o2"), q().get("p")]).toEqual(["21", "14.7"]);
    expect(badge()).not.toBeNull();
    expect(badge()?.querySelector("button")).not.toBeNull();
  });
});

describe("final audit fixes", () => {
  const q = () => new URLSearchParams(lastSearch);
  const plane = () => document.querySelector<SVGSVGElement>('svg[role="application"]')!;
  const pointer = (el: Element, type: string, { id = 1, x = 0, y = 0, kind = "mouse" }: { id?: number; x?: number; y?: number; kind?: string }) => {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(ev, "pointerId", { value: id });
    Object.defineProperty(ev, "pointerType", { value: kind });
    act(() => { el.dispatchEvent(ev); });
  };

  it("gives focus back to the plane (an SVG element) when the shortcut sheet or the command palette closes", async () => {
    localStorage.setItem(INTRO_KEY, "done");
    mount(<><CommandPalette /><Home /></>, "/?o2=34&p=8.2");
    act(() => plane().focus());
    press("?");
    expect(document.querySelector('[aria-labelledby="shortcut-title"]')?.contains(document.activeElement)).toBe(true);
    press("Escape");
    expect(document.querySelector('[aria-labelledby="shortcut-title"]')).toBeNull();
    expect(document.activeElement).toBe(plane());
    press("k", { ctrlKey: true });
    await settle();
    expect(document.activeElement?.getAttribute("role")).toBe("combobox");
    press("Escape");
    expect(document.activeElement).toBe(plane());
  });

  it("drops the phone's sheet to peek when the intro replays over it, so the plane shows behind the story", () => {
    localStorage.setItem(INTRO_KEY, "done");
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
    mount(<Home />, "/?o2=34&p=8.2");
    const sheet = () => document.querySelector<HTMLElement>("aside.sheet")!;
    const handle = sheet().querySelector<HTMLButtonElement>(":scope > button")!;
    for (let k = 0; k < 2; k++) act(() => { handle.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(sheet().getAttribute("data-snap")).toBe("full");
    act(() => requestPlane("intro"));
    expect(document.getElementById("intro-title")).not.toBeNull();
    expect(sheet().getAttribute("data-snap")).toBe("peek");
    expect(sheet().hasAttribute("inert")).toBe(true);
  });

  it("labels every pin on a phone's plot under Solids only before it gives any pin its evidence word", () => {
    localStorage.setItem(INTRO_KEY, "done");
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
    // The plane's box at 390 x 844 under Solids only, as measured in Chrome: 374 x 392, its Tools button 76 x 46.
    // With the plot the same height as without Solids only (D37), placing the evidence words first gave 14.7 psi
    // its word and left both 10.2 psi pins with no label.
    const rect = (w: number, h: number) => ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}) }) as DOMRect;
    const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("plane-tools")) return rect(76, 46);
      if (this.querySelector(':scope > svg[role="application"]')) return rect(374, 392);
      return rect(0, 0);
    });
    try {
      mount(<Home />, "/?o2=34&p=8.2&solids=1");
      expect(plotOrigin()).toEqual([50, 58]);
      const pins = [...document.querySelectorAll("svg[data-chart] g[transform]")].filter((g) => g.querySelector(':scope > path[d^="M0,0C"]'));
      // In the build's order: 14.7 / 21, 10.2 / 26.5, 10.2 / 30, 8.2 / 34 (the probe is on it, so its label hides)
      // and the spacesuit's 4.3 / 100, outside the habitat range.
      expect(pins.map((g) => g.querySelector(":scope > text")?.textContent ?? null)).toEqual(["14.7 psi / 21% O2", "26.5% O2", "30% O2", null, null]);
    } finally {
      box.mockRestore();
    }
  });

  it("cancels a mouse drag's pending move frame at pointerup, so the panel never goes back to Preview after the pin", () => {
    localStorage.setItem(INTRO_KEY, "done");
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.set(nextId, cb); return nextId++; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
    const runFrames = () => act(() => { for (const [id, cb] of [...frames]) { frames.delete(id); cb(0); } });
    mount(<Home />, "/?o2=31&p=9");
    const surface = document.querySelector('svg[role="application"] rect[fill="transparent"]')!;
    const eyebrow = () => document.querySelector('[data-testid="evidence-panel"] .eyebrow')?.textContent;
    const [ox, oy] = plotOrigin();
    pointer(surface, "pointerdown", { x: ox + 100, y: oy + 100 });
    expect(eyebrow()).toBe("Preview");
    pointer(surface, "pointermove", { x: ox + 140, y: oy + 100 }); // its frame has not run yet
    pointer(surface, "pointerup", { x: ox + 140, y: oy + 100 });
    const pinned = [q().get("o2"), q().get("p")];
    expect(pinned).not.toEqual(["31", "9"]);
    expect(eyebrow()).not.toBe("Preview");
    runFrames(); // a frame left pending would set the drag again here
    expect(eyebrow()).not.toBe("Preview");
    expect([q().get("o2"), q().get("p")]).toEqual(pinned);
  });
});
