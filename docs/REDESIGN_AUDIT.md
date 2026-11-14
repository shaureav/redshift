# Redesign audit

**The one job.** "If we pick this cabin atmosphere, what do we actually know about fire there, and what's missing?"

Every screen, panel, chart and control in the current app (commit `4f8886d`) is listed below and tested against that sentence. Scores run from 1 (does not serve the job) to 5 (is the job). Screenshots of the app before the redesign are in `docs/redesign/before/` (1440 px wide and a 390 px phone, dark theme).

No code was changed for this audit.

## 1. Global chrome

| Element | Serves the job? | Score | Verdict | Why |
| --- | --- | --- | --- | --- |
| Top navigation, 8 peer tabs (Trade Map, Dossiers, Test Planner, Investigations, Evidence Explorer, Data Quality, Methods, About) | Partly | 2 | Merge | Eight equal tabs say "eight products". Only the map and dossiers answer the job; the rest are reference. On a phone the tabs wrap into a five-row block that pushes the content below the fold (`before/landing-phone.png`). |
| Theme toggle ("Theme: System", cycles three states) | No | 2 | Keep, redesign | Needed, but a text button that cycles through a hidden third state is hard to predict. |
| Skip link | Yes (access) | 4 | Keep | |
| Footer: dataset version, retrieval date, licences, AI disclosure, "does not recommend" | Yes (trust) | 4 | Keep, tighten | The version string is the citation anchor. Four run-on sentences at 12 px read as fine print. |

## 2. Landing (`/`)

| Element | Serves the job? | Score | Verdict | Why |
| --- | --- | --- | --- | --- |
| Eyebrow "Redshift: The Atmosphere Trade Studio" | No | 1 | Cut | Repeats the logo. |
| Headline: "PSI's tables hold 263 solid-fuel burn rows; 129 record oxygen; 0 record pressure; 0 sit near a habitat candidate." | Yes | 4 | Keep, move | The strongest sentence in the app, with four cited numbers. Better as the plane's headline, and as the end of the first-visit tour. |
| Question to NASA | Yes | 4 | Keep | It is the pitch. |
| "A plane, not a score" paragraph | Partly | 2 | Merge into tour | True and important, but nobody reads a paragraph before the chart. |
| Trade map panel (compact) | Yes | 5 | Keep, rebuild as the landing | It *is* the job, but it sits 330 px down the page at a fixed 560 px height. You cannot put a point on it: only the five candidates are clickable, and clicking one leaves the page. |
| Map control: "Solids only" checkbox | Yes | 5 | Keep, make dramatic | Turning it on removes glyphs silently; nothing marks the gap that appears. |
| Map control: zoom presets (All tests, Habitat range, Suit corner) | Partly | 3 | Keep | Useful, but three tiny buttons with no visual hierarchy. |
| Map control: View as table, Download SVG | Yes (access, export) | 3 | Keep, move to an overflow menu | Two buttons per chart, repeated nine times across the app, are the biggest source of clutter. |
| Map: candidate markers and halos | Yes | 5 | Keep | The halo only appears on hover or selection, so the nearness region is invisible until you find it. |
| Map: evidence glyphs (colour plus shape) | Yes | 5 | Keep | Good encoding. Up to 40 overlapping glyphs at 14.7 psi form an unreadable smear. |
| Map: "O2 recorded, pressure not recorded" strips under the plot | Yes | 5 | Keep | This is where the access gap is physically visible, but at 18 px high with labels on the right edge it reads as an axis artefact. |
| Map: hatched blind spots | Yes | 4 | Keep | Planner cells, so 7 by 6 coarse blocks; fine as a background layer. |
| Map: flame temperature isotherms | Yes | 4 | Keep | Labels collide with glyphs; the "explains, does not predict" caveat is only in the caption. |
| Map: tooltip | Yes | 3 | Merge into the side panel | A hover tooltip disappears the moment you move; it cannot be read, pinned, cited or shared. |
| Map caption: nearness rule, fuel legend, source legend, inverse-flame note, prebreathe note | Yes | 3 | Keep, restructure | Five stacked lines of 12 px text under every map. The legend belongs on the chart; the rule belongs in a provenance popover. |
| Access gap chart | Yes | 5 | Keep, give it a headline | The story graphic. The title "The access gap: solid-material burns, step by step" describes the chart instead of saying the finding. |
| Evidence strips (five candidates, small multiples) | Yes | 4 | Merge into the side panel | The live panel shows the same split for any point, including the candidates. |
| FLEX suppression chart | Weakly | 2 | Move to the 10.2 psi dossier and the FLEX investigation | Good chart, but about CO2 suppression chemistry at about 10.4 psi, not about the atmosphere you picked. On the landing page it competes with the gap. |
| Ask Redshift (six cached questions) | Yes | 4 | Keep, move into the side panel | Buried at the bottom of a 3,000 px page. Chips only, no input box, so it does not feel like asking. |
| "Ways in" cards (Dossiers, Investigations, Evidence Explorer) | No | 1 | Cut | Generic three-card row; replaced by deep links from the panel and the command palette. |

## 3. Trade Map (`/map`)

| Element | Serves the job? | Score | Verdict | Why |
| --- | --- | --- | --- | --- |
| Whole page | Yes | 4 | Merge into the landing | A second copy of the landing map with a layers fieldset. Two places to do the same thing. |
| Layers fieldset (six checkboxes) | Yes | 4 | Keep, animate | Layers pop in and out with no transition, so you cannot see what changed. |

## 4. Dossiers

| Element | Serves the job? | Score | Verdict | Why |
| --- | --- | --- | --- | --- |
| Dossiers index (candidate cards, materials list, Saffire materials from papers) | Partly | 3 | Merge | An index page you have to choose from before you see anything. The command palette and the plane replace it. |
| Candidate dossier: AI summary | Yes | 4 | Keep | |
| Candidate dossier: evidence bars | Yes | 5 | Keep | |
| Candidate dossier: "O2 matches, pressure not recorded" | Yes | 5 | Keep | The access gap for this atmosphere. |
| Candidate dossier: flame temperature | Yes | 4 | Keep | |
| Candidate dossier: "What is missing" | Yes | 5 | Keep, promote | Half of the job, placed fourth. |
| Candidate dossier: nearest tests table | Yes | 4 | Keep | |
| Candidate dossier: prebreathe | Yes | 4 | Keep | |
| Candidate dossier: verified paper findings | Yes | 4 | Keep | Empty until verification; needs a designed empty state. |
| Material dossier: mini-map, tests table, tests by investigation, verified findings, Saffire VI detection | Yes (secondary user) | 3 | Keep | Reached from the palette and from test rows. |

## 5. Test Planner (`/planner`)

| Element | Serves the job? | Score | Verdict | Why |
| --- | --- | --- | --- | --- |
| Weight presets and sliders, heat map per material class, ranked list, selected cell, formula | "What's missing", for a different user | 3 | Move to secondary navigation | It answers "what should be tested next", which follows from the job but is not the job. Keep it intact for experiment planners. |

## 6. Investigations

| Element | Serves the job? | Score | Verdict | Why |
| --- | --- | --- | --- | --- |
| Filters (fuel class chips, with or without table, order by) | Reference | 2 | Keep, secondary | |
| Investigation timeline | Reference | 2 | Keep, secondary | Answers the challenge's "summarise, rank and interpret", not the atmosphere question. |
| Coverage matrix ("What each table records") | Yes, indirectly | 3 | Keep, secondary | It shows that the pressure column is hatched for every solid-fuel investigation: the gap again. Its title should say so. |
| Investigation cards | Reference | 2 | Keep, secondary | |
| Compare view (2 to 4 investigations) | Reference | 3 | Keep | The new flow's "compare" is atmospheres side by side; investigation compare stays in Investigations. |

## 7. Evidence Explorer, Data Quality, Methods, About

| Element | Serves the job? | Score | Verdict | Why |
| --- | --- | --- | --- | --- |
| Evidence Explorer (filters, search, table, provenance drawer, CSV export) | Yes, as "go deeper" | 4 | Keep | The panel's "see these tests" link lands here, pre-filtered to the probe point. |
| Data Quality (summary, coverage, reconciliation, goldens, findings, flags) | Trust | 3 | Secondary navigation | Essential for validity; not a step in the flow. |
| Methods (13 sections) | Trust | 3 | Secondary navigation | Linked from every provenance popover. |
| About (team, AI use, licences, citation, references) | Trust | 2 | Secondary navigation | |

## 8. Why the app looks vibe coded

The data work underneath is careful. The surface does not show it. Specifically:

1. **Too many type sizes.** The source uses 17 distinct sizes: Tailwind `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, plus hand-tuned `text-[11px]`, `text-[15px]`, `text-[1.6rem]`, `text-[2rem]`, and SVG `fontSize` values of 9.5, 10, 10.5, 11, 12, 13 and 14. 272 elements are `text-xs`, so most of the interface is 12 px grey text. The brief allows six sizes: 12, 14, 16, 20, 28, 40.
2. **Three typefaces.** Inter for UI, IBM Plex Sans for numbers, IBM Plex Mono for IDs. Inter and Plex Sans side by side in one sentence look like a font-loading bug.
3. **Uneven spacing.** 715 spacing classes are off the 8 px grid (`py-2.5`, `gap-1.5`, `px-3`, `mt-1`) against 322 on it. Card padding is 16 px; gaps between cards are 24 px; chart internals use 4, 6 and 10 px.
4. **Five corner radii** (`rounded-sm`, `rounded`, `rounded-md`, `rounded-lg` and `rounded-full`, plus a hard-coded 12 px on `.card`).
5. **Everything is a card.** 30 bordered `card` boxes and 9 chart frames with identical chrome. Nothing has more visual weight than anything else, so the eye has no entry point. The landing page is a 3,000 px scroll of equal boxes.
6. **Default controls.** Native checkboxes, a native `<select>`, and text buttons with a 1 px border. Two buttons ("View as table", "Download SVG") on every chart.
7. **Charts with no takeaway.** Titles describe the chart: "Trade Map: oxygen against cabin pressure", "Tests near each candidate, by fuel class and source", "What each table records", "Investigation timeline". None says what the reader should see. The finding is in a 12 px caption below.
8. **Generic labels.** "Ways in", "Summary", "Ask Redshift", "Theme: System", "View".
9. **Nothing to interact with on the main question.** You cannot ask about an arbitrary atmosphere. Only five points on the map respond, and responding means navigating away. Hover tooltips vanish. Nothing animates, so toggling a layer gives no sense of what changed.
10. **Accent colour everywhere.** Teal marks the active tab, the selected candidate, the halo, links, badges and focus rings all at once; amber marks both "solid material" data and warning badges.
11. **Phone layout is an afterthought.** The navigation takes the first 340 px of an 844 px screen, and the chart controls stack into a column of bordered buttons.
12. **Loading and error states are one line of grey text** ("Loading the trade map..."), identical everywhere.

## 9. New structure

| Current | New |
| --- | --- |
| Landing, Trade Map | **The plane** (`/`): full-screen oxygen against pressure, draggable probe, live evidence panel |
| Evidence strips, candidate tooltip | Side panel, live for any point |
| Access gap chart | Side panel section and a focused view (`/?view=gap`) |
| Ask Redshift | "Ask the evidence" in the side panel |
| Dossiers index | Command palette, plus links from the panel |
| Candidate and material dossiers | Kept: "Go deeper" |
| Evidence Explorer | Kept: "Go deeper", pre-filtered to the probe point |
| New | Side-by-side compare of two to four atmospheres (`/compare`) |
| New | Cited one-page brief (`/brief`): print to PDF, CSV, BibTeX |
| Test Planner, Investigations, Data Quality, Methods, About | Secondary navigation (a "Reference" menu), unchanged content in the new visual system |
| FLEX suppression on landing | Moved to the 10.2 psi / 26.5% dossier, where it is about the atmosphere |
| "Ways in" cards, eyebrow | Cut |

## 10. Where the redesign brief meets the integrity rules

These are the places where a design idea had to bend so that no number on screen is invented. Integrity wins in each case.

1. **The probe cannot show counts for a point the pipeline never computed.** Rule C1.6 says every count comes from a tested pipeline function, never from the frontend. So the build precomputes nearness counts on a dense grid (0.5 O2 points by 0.1 psi), and the probe snaps to the nearest grid node and says which node it is showing. All five candidates sit exactly on grid nodes. The list of which tests are near is drawn by a TypeScript copy of the nearness rule, and a test checks it against every grid node; if they ever disagree, the test fails.
2. **The step-size slider cannot be continuous.** Counts exist only for the step multipliers the build computes and documents (0.75x, 1x and 1.5x, from `redshift/params.json`). The slider snaps to those three stops. A continuous slider would display counts for step sizes nobody chose or tested.
3. **Flame temperature is not interpolated.** Cantera values exist for the five candidates and on a 2.5 O2 point by 0.5 psi grid. Away from a candidate, the panel shows the nearest computed point and names its coordinates, rather than inventing a value at the probe.
4. **Prebreathe appears only where a figure is published and verified.** At this build none is verified, so the panel says a published figure is awaiting verification for three candidates, and "no published figure" elsewhere.
5. **The access gap for an arbitrary point** uses only counts that exist: solid tests near the point (from the grid), solid and emulator tests whose oxygen matches but whose pressure is not recorded (from the grid), and the global funnel from `access_gap.json`.
6. **"Ask the evidence"** answers from checked templates whose every number is a slot filled from the built data. A live answer, if a model key is configured on the API host, passes the same post-check: any number not in the retrieved input rejects the answer. The deployed static site shows cached answers and says so.
