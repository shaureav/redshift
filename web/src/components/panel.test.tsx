// Snapshot tests of every screen the redesign changed, rendered from the real data snapshot (web/public/data)
// with the query cache pre-filled, so they need no network. To accept an intended change, run
// `npx vitest run -u`, review the snapshot diff and commit it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { decodeGrid, nearInputs, readAt, type ProbeGridFile } from "../lib/probe";
import { loadSnapshot } from "../lib/snapshot.fixture";
import type { Investigation } from "../lib/types";
import AtmosphereCompare from "../pages/AtmosphereCompare";
import Brief, { briefBibtex, briefCsv } from "../pages/Brief";
import Home from "../pages/Home";

const FILES = [
  "probe_grid.json", "trade_map.json", "candidates.json", "candidate_evidence.json", "flame_temperature_grid.json",
  "planner_grid.json", "prebreathe.json", "access_gap.json", "ai_text.json", "dataset_version.json", "investigations.json",
  "provenance.json",
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
