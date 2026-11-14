// Snapshot tests of every screen the redesign changed, rendered from the real data snapshot (web/public/data)
// with the query cache pre-filled, so they need no network. To accept an intended change, run
// `npx vitest run -u`, review the snapshot diff and commit it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DossierEvidenceBars } from "../charts/dossiersEvidenceBars";
import { FlexSuppression } from "../charts/FlexSuppression";
import css from "../index.css?raw";
import { decodeGrid, nearInputs, readAt, type ProbeGridFile } from "../lib/probe";
import { loadSnapshot } from "../lib/snapshot.fixture";
import type { Candidate, CandidateEvidence, Investigation } from "../lib/types";
import AtmosphereCompare from "../pages/AtmosphereCompare";
import Brief, { briefBibtex, briefCsv } from "../pages/Brief";
import Home from "../pages/Home";
import type { AccessGapData } from "../charts/AccessGap";
import { chartSvgMarkup } from "./Common";
import { Intro } from "./Intro";
import { Readout } from "./panelReadout";

const FILES = [
  "probe_grid.json", "trade_map.json", "candidates.json", "candidate_evidence.json", "flame_temperature_grid.json",
  "planner_grid.json", "prebreathe.json", "access_gap.json", "ai_text.json", "dataset_version.json", "investigations.json",
  "provenance.json", "flex_suppression.json",
];

function render(path: string, node: ReactNode): string {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  for (const f of FILES) client.setQueryData(["data", f], loadSnapshot(f));
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// Keep snapshots about content: drop React's generated ids, which change with render order.
const tidy = (html: string) => html.replace(/:r[0-9a-z]+:/g, ":id:");

describe("screens", () => {
  it("the plane at 8.2 psi and 34% O2", () => {
    const html = render("/?o2=34&p=8.2", <Home />);
    expect(html).toContain("37"); // tests near this candidate, from the build
    expect(html).toContain("None is a solid material.");
    expect(tidy(html)).toMatchSnapshot();
  });

  it("the plane with solids only", () => {
    const html = render("/?o2=34&p=8.2&solids=1", <Home />);
    expect(html).toContain("No solid burn in PSI&#x27;s tables records pressure.");
    expect(html).toContain("No solid-material test can be placed on this plane");
    expect(tidy(html)).toMatchSnapshot();
  });

  it("draws the plane as a map, with its controls in one toolbar, normal and solids only", () => {
    const at = (path: string) => {
      const host = document.createElement("div");
      host.innerHTML = render(path, <Home />);
      return host;
    };
    const normal = at("/?o2=34&p=8.2");
    // Only the headline sits above the plane; every control is in the plane's toolbar.
    const header = normal.querySelector('section[aria-label="The oxygen and pressure plane"] > header')!;
    expect(header.querySelectorAll("button").length).toBe(0);
    const tools = [...normal.querySelectorAll('[role="toolbar"][aria-label="Plane tools"] .tool')].map((b) => b.getAttribute("aria-label"));
    expect(tools).toEqual(["Solids only", "Candidates", "Layers", "Zoom", "Select area", "Geiger clicks"]);
    // Land, hatched sea and the coast; the mask that sinks the land is at rest.
    const mask = normal.querySelectorAll("#plane-land-mask path");
    expect(mask[0].getAttribute("d")?.startsWith("M")).toBe(true);
    expect(mask[1].getAttribute("style")).toContain("stroke-width:0");
    expect(normal.querySelector('path[fill="var(--land)"]')).not.toBeNull();
    expect(normal.querySelector('rect[fill="url(#hatch-sea)"]')).not.toBeNull();
    // Quiet layers: solid isotherms with labels along their path, and a halo without dashes.
    expect(normal.querySelectorAll('path[stroke="var(--isotherm)"][stroke-dasharray]')).toHaveLength(0);
    expect(normal.querySelectorAll("textPath").length).toBeGreaterThan(0);
    expect(normal.querySelector("ellipse[stroke-dasharray]")).toBeNull();
    const solids = at("/?o2=34&p=8.2&solids=1");
    // Solids only: the mask's stroke is wide enough to erase all the land, and every pin is at sea.
    const sink = solids.querySelectorAll("#plane-land-mask path")[1].getAttribute("style") ?? "";
    expect(Number(sink.match(/stroke-width:(\d+(?:\.\d+)?)/)?.[1])).toBeGreaterThan(100);
    const words = [...solids.querySelectorAll("svg[data-chart] text tspan")].map((t) => t.textContent).filter((t) => /inland|coast|sea/.test(t ?? ""));
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((w) => w === "at sea")).toBe(true);
  });

  it("the panel between candidates", () => {
    const html = render("/?o2=31&p=9", <Home />);
    expect(html).toContain("At the nearest computed point");
    expect(tidy(html)).toMatchSnapshot();
  });

  it("compare", () => {
    expect(tidy(render("/compare?pts=34,8.2;26.5,10.2;21,14.7", <AtmosphereCompare />))).toMatchSnapshot();
  });

  it("the cited brief", () => {
    const html = render("/brief?o2=34&p=8.2", <Brief />);
    expect(html).toContain("What is missing");
    expect(tidy(html)).toMatchSnapshot();
  });

  it("brief exports: CSV and BibTeX", () => {
    const g = decodeGrid(loadSnapshot<ProbeGridFile>("probe_grid.json"));
    const r = readAt(g, 34, 8.2, 1);
    const near = nearInputs(g, r.i, r.j, 1);
    const version = loadSnapshot<{ version: string; cite: string }>("dataset_version.json");
    const csv = briefCsv(r, near, version.version);
    expect(csv.trim().split("\n")).toHaveLength(near.length + 1);
    expect(csv).toMatchSnapshot();
    const bib = briefBibtex(near, loadSnapshot<{ investigations: Investigation[] }>("investigations.json").investigations, version.cite, version.version);
    expect(bib).toContain("@misc{redshift_dataset");
    expect(bib).toMatchSnapshot();
  });
});

/** A token as the dark theme sets it in index.css (the first block that sets it), unresolved: var() stays. */
function cssToken(name: string): string {
  return css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim() ?? "";
}

function chartSvg(node: ReactNode): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = render("/", node);
  const svg = host.querySelector<SVGSVGElement>("svg[data-chart]");
  if (!svg) throw new Error("no svg[data-chart] rendered");
  return svg;
}

describe("chart SVG download", () => {
  // The downloaded file has no app stylesheet: every token it draws with must travel inside it. A fixed list
  // once left out the -edge and -ring tokens, and outlined marks lost their only distinguishing stroke.
  const cands = loadSnapshot<{ candidates: Candidate[] }>("candidates.json").candidates;
  const ev = loadSnapshot<{ evidence: CandidateEvidence[] }>("candidate_evidence.json").evidence;
  const c = cands.find((x) => x.id === "c10_2_26_5")!;
  const charts: [string, () => ReactNode][] = [
    ["FLEX suppression", () => <FlexSuppression />],
    ["evidence bars on a dossier", () => <DossierEvidenceBars c={c} ev={ev.find((e) => e.candidate_id === c.id)!} domainMax={40} />],
  ];

  it.each(charts)("embeds every token the %s chart uses", (_, make) => {
    const out = chartSvgMarkup(chartSvg(make()), { title: "T", caption: "C.", sources: "S" }, cssToken);
    const style = out.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
    const decls = [...style.matchAll(/(--[\w-]+):([^;]*)/g)];
    const defined = new Set(decls.map((m) => m[1]));
    const used = new Set([...out.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(5);
    expect([...used].some((n) => /-(edge|ring)$/.test(n))).toBe(true);
    expect([...used].filter((n) => !defined.has(n))).toEqual([]);
    expect(decls.filter((m) => m[2].trim() === "").map((m) => m[1])).toEqual([]);
    expect(out).toContain("<desc>T. C. Sources: S</desc>");
  });
});

// The spacing scale (tailwind.config.js) in px, for the focus ring check below.
const SPACE: Record<string, number> = { 0: 0, px: 1, "0.5": 4, 1: 4, "1.5": 8, 2: 8, "2.5": 8, 3: 16, "3.5": 16, 4: 16, 5: 24, 6: 24, 7: 32, 8: 32 };
type Room = { t: number; r: number; b: number; l: number };

/** Padding (on the element) or margin (on the control) its classes give, at a phone's width (no prefixes). */
function room(el: Element, kind: "p" | "m"): Room {
  const out: Room = { t: 0, r: 0, b: 0, l: 0 };
  for (const cls of el.classList) {
    const m = cls.match(/^([pm])([xytrbl]?)-([\w.]+)$/);
    if (!m || m[1] !== kind) continue;
    const v = SPACE[m[3]] ?? (/^\d+$/.test(m[3]) ? 40 : 0);
    const sides = { "": "trbl", x: "rl", y: "tb", t: "t", r: "r", b: "b", l: "l" }[m[2]] ?? "";
    for (const s of sides) out[s as keyof Room] += v;
  }
  return out;
}

const CLIPS = /^(overflow(-[xy])?-(auto|hidden|scroll)|truncate|line-clamp-\d)$/;

/** Controls whose focus ring an ancestor would clip: the ring reaches 4 px past the control (2 px offset, 2 px
 *  wide), so every clipping ancestor must leave 4 px of padding (or margin) around it on every side. A control
 *  with no ring (outline-none) or an inset one (a .seg segment, an inset offset) is exempt. */
function clippedRings(html: string): string[] {
  const host = document.createElement("div");
  host.innerHTML = html;
  const bad: string[] = [];
  for (const el of host.querySelectorAll("button, a[href], input, select, textarea, summary, [tabindex]")) {
    if (el.getAttribute("tabindex") === "-1") continue;
    const cls = el.getAttribute("class") ?? "";
    if (/(^|\s)(focus-visible:|focus:)?outline-none(\s|$)|outline-offset-\[-/.test(cls) || el.parentElement?.classList.contains("seg")) continue;
    const r = room(el, "m");
    for (let a = el.parentElement; a && a !== host; a = a.parentElement) {
      const p = room(a, "p");
      r.t += p.t; r.r += p.r; r.b += p.b; r.l += p.l;
      if ([...a.classList].some((c) => CLIPS.test(c)) && Math.min(r.t, r.r, r.b, r.l) < 4) {
        bad.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}" in .${[...a.classList].join(".")}`);
        break;
      }
    }
  }
  return bad;
}

describe("focus rings", () => {
  const screens: [string, string, () => ReactNode][] = [
    ["the plane", "/?o2=34&p=8.2", () => <Home />],
    ["compare", "/compare?pts=34,8.2;26.5,10.2;21,14.7", () => <AtmosphereCompare />],
    ["the brief", "/brief?o2=34&p=8.2", () => <Brief />],
  ];
  it.each(screens)("no clipping ancestor cuts a control's ring on %s", (_, path, make) => {
    expect(clippedRings(render(path, make()))).toEqual([]);
  });
  it("flags a control flush with a scroller's edge, and passes one with room", () => {
    // The phone control row on the plane before the fix: no top padding, so the ring's top edge was cut.
    expect(clippedRings('<div class="overflow-x-auto px-4 pb-1"><span><button>Layers</button></span></div>')).toHaveLength(1);
    expect(clippedRings('<div class="overflow-x-auto px-4 pb-1 pt-1"><span><button>Layers</button></span></div>')).toEqual([]);
    expect(clippedRings('<div class="overflow-hidden"><button class="outline-none">Card</button></div>')).toEqual([]);
  });
});

/** Text in the panel that shows a digit outside a Value (an element with data-prov). Exempt, each for a stated
 *  reason: "O2" is a formula, not a number; .mono marks ids (test and finding ids), never quantities; and
 *  data-setting marks the step size stops, labels of a setting the reader picks (each count at a stop is a
 *  Value with that multiplier in its provenance); data-prompt marks Ask's suggested questions, which are prompts
 *  the reader can send, not readouts (an answer's numbers are slots filled from sourced values, D8). */
function bareNumbers(root: Element): string[] {
  const bad: string[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = (n.textContent ?? "").replace(/\bO2\b/g, "");
    if (!/\d/.test(text)) continue;
    if (n.parentElement?.closest("[data-prov], .mono, [data-setting], [data-prompt]")) continue;
    bad.push(text.trim());
  }
  return bad;
}

function panelOf(path: string): Element {
  const host = document.createElement("div");
  host.innerHTML = render(path, <Home />);
  const panel = host.querySelector('[data-testid="evidence-panel"]');
  if (!panel) throw new Error("no evidence panel rendered");
  return panel;
}

describe("the instrument panel", () => {
  const points: [string, string][] = [
    ["on a candidate, 8.2 psi and 34% O2", "/?o2=34&p=8.2"],
    ["between candidates, 9 psi and 31% O2", "/?o2=31&p=9"],
    ["at sea, 4 psi and 40% O2", "/?o2=40&p=4"],
  ];

  it.each(points)("renders every number through Value %s", (_, path) => {
    const panel = panelOf(path);
    expect(panel.querySelectorAll("[data-prov]").length).toBeGreaterThan(20);
    expect(bareNumbers(panel)).toEqual([]);
  });

  it("flags a bare number, and passes the same number inside a Value", () => {
    const host = document.createElement("div");
    host.innerHTML = '<p>37 tests</p><p><span data-prov="probe:1:total"><button>37</button></span> tests near O2</p><span class="mono">BASS-L12</span>';
    expect(bareNumbers(host)).toEqual(["37 tests"]);
  });

  it.each(points)("matches its snapshot %s", (_, path) => {
    expect(tidy(panelOf(path).outerHTML)).toMatchSnapshot();
  });

  it("shows the readout, hatched empty tiles, what is missing and both profiles at a point with no tests", () => {
    const panel = panelOf("/?o2=40&p=4");
    const tiles = [...panel.querySelectorAll('[aria-label="Tests near this point by fuel class"] > li')];
    expect(tiles).toHaveLength(4);
    expect(tiles.every((t) => t.getAttribute("data-empty") === "true" && t.textContent?.includes("no tests recorded"))).toBe(true);
    expect(panel.querySelector("h2.text-title")?.textContent).toContain("40%");
    const missing = panel.querySelector('[aria-labelledby="sec-gap"]')?.textContent ?? "";
    expect(missing).toContain("Tests of any fuel class near this point");
    expect(missing).toContain("Near this oxygen (within the step size), but no pressure recorded");
    expect(missing).toContain("BRE sessions (chamber pressure)");
    expect(panel.querySelectorAll('[role="slider"]')).toHaveLength(2);
    expect(panel.querySelectorAll('[role="slider"] .hatch-bg').length).toBeGreaterThan(0);
  });

  it("shows paper counts only when they are not zero", () => {
    // No verified paper places a test anywhere on the grid yet, so no tile names papers...
    expect(panelOf("/?o2=34&p=8.2").textContent).not.toContain("from verified papers");
    // ...and a reading with a paper count (made up here, to test the branch) shows it, through a Value.
    const g = decodeGrid(loadSnapshot<ProbeGridFile>("probe_grid.json"));
    const r = readAt(g, 34, 8.2, 1);
    const withPaper = { ...r, near: { ...r.near, gas: { ...r.near.gas, published_paper: { v: 2, u: "tests", p: "probe:1:gas:published_paper" } } } };
    const html = render("/", <Readout r={withPaper} candidate={null} preview={false} outside={false} />);
    expect(html).toMatch(/plus <span[^>]*data-prov="probe:1:gas:published_paper"[^>]*><button[^>]*>2<\/button><\/span> from verified papers/);
  });

  it("pins five actions to the bottom of the panel", () => {
    const bar = panelOf("/?o2=34&p=8.2").querySelector('nav[aria-label="Take this point further"]');
    expect([...(bar?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual(["Dossier", "Tests", "Compare", "Brief", "Share"]);
    expect(bar?.parentElement?.className).toContain("sticky bottom-0");
  });
});

describe("the story intro", () => {
  const gap = loadSnapshot<AccessGapData>("access_gap.json");
  const beat = (b: number) => {
    const host = document.createElement("div");
    host.innerHTML = render("/", <Intro beat={b} gap={gap} onBeat={() => {}} onClose={() => {}} />);
    return host;
  };

  it.each([0, 1, 2])("beat %i matches its snapshot, with every number through Value", (b) => {
    const host = beat(b);
    expect(bareNumbers(host)).toEqual([]);
    expect(tidy(host.innerHTML)).toMatchSnapshot();
  });

  it("cites the four access-gap steps in the last beat, and only there", () => {
    expect(beat(0).querySelectorAll("[data-prov]")).toHaveLength(0);
    expect(beat(1).querySelectorAll("[data-prov]")).toHaveLength(0);
    expect([...beat(2).querySelectorAll("[data-prov]")].map((e) => e.getAttribute("data-prov"))).toEqual(gap.psi_steps.map((s) => s.count.p));
  });

  it("says the counts are loading rather than show a number it does not have", () => {
    const host = document.createElement("div");
    host.innerHTML = render("/", <Intro beat={2} gap={null} onBeat={() => {}} onClose={() => {}} />);
    expect(host.textContent).toContain("The cited counts are still loading.");
    expect(bareNumbers(host)).toEqual([]);
  });
});
