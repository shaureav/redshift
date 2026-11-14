# Redshift: plan for an exceptional interface

Status: **approved by the team as "musts plus shoulds" (phases 0 to 6 and 12), with the section 12 decisions taken as recommended and no new npm dependencies (`docs/DECISIONS.md`, D22).** Phase 0 is done (D23).
Follows `docs/redesign/PLAN.md` (the plane-first redesign, done) and `docs/REDESIGN_AUDIT.md`.

> **The one job.** "If we pick this cabin atmosphere, what do we actually know about fire there, and what's missing?"

---

## 0. Where we are

| Area | State |
| --- | --- |
| Working | Plane-first home page, dense probe grid with parity tests, live evidence panel, command palette, provenance card, compare, cited brief (PDF, CSV, BibTeX), `/probe`, grounded `/ask`, URL state for every view. 215 Python tests and 23 web tests pass. Lighthouse 100 for accessibility, best practice and SEO on desktop and mobile. Steady drag p95 12 ms on the production build. |
| Broken | Tour step 3 loops (React error 185) and, with no error boundary, the page goes blank. |
| Weak | Plane textures compete (hatching, dashed isotherms, dashed halo, crosshair). The 14.7 psi cluster smears. Two rows of controls sit above the chart. The panel is a long, flat scroll with dotted underlines on every number. No signature moment; the first screen is dense. Isotherm labels collide at phone width. In the light theme three fuel fills are under 3:1 against white. |
| Uncommitted | Phone layout fixes and refreshed snapshots from the last session. |

---

## 1. North star

**Promise.** In 30 seconds a habitat engineer sees where NASA's fire evidence ends. In three minutes they leave with a cited brief they would put in a trade study.

**Signature image: the coastline of knowledge.** The plane becomes a map. Where tests exist near a point there is land; where none do there is open sea, hatched and labelled *unknown, not safe*. The coastline is drawn from the build's probe grid as the boundary where the near-test count is zero. Turn on "Solids only" and the land sinks: no solid-material test in PSI's tables can be placed anywhere. That image is the access gap, and every feature below hangs on the same metaphor: explore, chart, find the edge.

---

## 2. Design principles (tie-breakers for every decision)

1. **One question per screen.** If an element does not help answer the one job, it moves to Reference or goes.
2. **The data is the interface.** Controls float over the plane; no chrome bands. Charts carry their own legends.
3. **Every number is a door.** Each opens its provenance card. Doors are quiet until you look for them.
4. **Unknown is a place, not a colour.** Absence is sea and hatching, never green, never "low".
5. **Motion explains change.** Things move to show what changed. Numbers never count up through values that are not data.
6. **Calm by default, depth on demand.** First look shows the answer; one click shows why; two clicks show the source row.
7. **Honest delight.** Curiosity, feedback and collecting, yes. Scores, streaks, rankings of atmospheres, nags, no.

---

## 3. Success criteria (how we know it is exceptional)

| Criterion | Target | How measured |
| --- | --- | --- |
| Five-second test | 4 of 5 people say, unprompted, that solid-fire evidence near Moon-base air is missing from downloadable data | Team members' friends or family, screen shown five seconds |
| Cold task | Find what is known at 10.2 psi / 26.5% and export a brief in under two minutes | Three testers, timed, think-aloud notes in `docs/redesign/usability.md` |
| Demo | The 30-second click path runs without a hesitation | Rehearsed twice on the production build |
| Drag smoothness | p95 frame under 16.7 ms in steady state; no long task over 50 ms after first interaction | Scripted drag on `vite preview` (already used) |
| Load | Largest contentful paint under 2.0 s, layout shift under 0.02 on desktop | Performance trace on `vite preview` |
| Accessibility | Lighthouse 100; WCAG AA for all text; 3:1 for all data glyphs and control boundaries in both themes; full keyboard path through every feature | Lighthouse, contrast script (already written), keyboard walkthrough checklist |
| Visual quality | No label collisions or clipping at 390, 768, 1440 and 1920 px in both themes | Screenshot matrix in `docs/redesign/after/` reviewed against a checklist |
| Integrity | Provenance coverage 100%; no em dash; no red; every count from the build | Existing build lint, `scripts/no_em_dash.py`, palette hue check, parity tests |

---

## 4. Journeys we design for

| Journey | Path | What must feel great |
| --- | --- | --- |
| J1 Judge, first visit | Story intro (three beats, about 20 s) then Explore lands on 8.2 psi / 34% | The land sinking under "Solids only" |
| J2 Habitat engineer | Drags to a point, reads the readout, opens what is missing, compares two points, prints the brief | The loop drag, read, source, export never stalls |
| J3 Researcher | Cmd+K, types a test id, lands on its source row | Reaching any record in two keystrokes |
| J4 Phone | Plane on top, panel in a bottom sheet, tap to pin | Thumb reach, no horizontal scroll, readable labels |
| J5 Returning visitor | The link they saved reopens the exact view and notebook | Nothing to set up twice |

---

## 5. Visual design system, version 2

The current tokens stay; this section adds what is missing and fixes what is weak. Everything lives in `web/src/index.css` and `web/tailwind.config.js` so no component invents its own value.

**Type roles** (IBM Plex Sans, tabular figures; Plex Mono for ids only; weights 400, 500, 600 only)

| Role | Size / line | Use |
| --- | --- | --- |
| Display | 40 / 48 | Story intro headlines, brief title only |
| Title | 28 / 36 | Page titles, panel point readout |
| Heading | 20 / 28 | Plane headline, card headlines, tile numbers |
| Body | 16 / 24 | Prose |
| Body small | 14 / 20 | Panel text, controls |
| Label | 12 / 16, caps, 0.08em | Eyebrows, axis titles, legends |

**Colour.** Add `--land` (a faint lift of the plane surface, dark #12223a, light #ffffff over #eef1f5 sea), `--sea-hatch`, `--coast` (ink-2 at 60%), `--trail`. Keep teal as the only accent, for interactive state only. Light theme: keep the colour-blind-validated fuel hues as fills and add a 1 px darker ring per class so every glyph reaches 3:1 (to be re-checked with a simulator, see decision D3).

**Elevation.** Three levels only: flat (plane), raised (cards: 1 px line), floating (toolbar, popovers, sheet: line plus `--shadow` plus 8 px backdrop blur).

**Icons.** One custom 16 px stroke set (1.5 px, round joins) drawn as inline SVG components: probe, pin, layers, compare, brief, share, sound, time, notebook, keyboard, close, chevron. No icon font, no library look.

**Motion tokens.**

| Token | Value | Use |
| --- | --- | --- |
| `--t-fast` | 120 ms | Hover, press |
| `--t-base` | 200 ms | Panel content swap, toggles |
| `--t-move` | 320 ms | Probe glide, layer fades |
| `--t-scene` | 600 ms | Story beats, land sinking |
| `--ease-out` | cubic-bezier(0.2, 0.8, 0.2, 1) | Everything that arrives |
| Reduced motion | All durations 0, except opacity crossfades at 120 ms | Respect the setting everywhere |

**Texture.** One hatch spec: 45 degrees, 7 px pitch, 1 px line; sea hatch at 30% opacity, empty tile hatch at 60%.

---

## 6. Component inventory and states

Every component ships with all its states designed, not just the happy path.

| Component | Default | Hover / focus | Active | Loading | Empty | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Plane base (land, sea, coast, glyphs, pins, axes) | yes | pin label lifts | pin pulses | grid-line skeleton | sea everywhere, caption says why | error screen |
| Probe overlay (ring, crosshair, tag, halo, trail) | yes | ring grows 2 px | ring fills; ping on snap | hidden | n/a | n/a |
| Floating toolbar | yes | tooltip with shortcut | pressed state | disabled until data | n/a | n/a |
| Readout tile | number and shape | source affordance appears | n/a | shimmer | hatched, "no tests recorded" | n/a |
| What's missing callout | list of gaps | each item links to its source | n/a | shimmer | "Nothing missing that this dataset can see" (should not occur) | n/a |
| Sparklines | two profiles with you-are-here marker | value tooltip as a Value | n/a | shimmer | flat hatched line | n/a |
| Context strip (flame temperature, prebreathe, step) | compact row | expands | n/a | shimmer | "not computed here" | n/a |
| Action bar | five actions | labels | pressed | n/a | n/a | n/a |
| Provenance card | trace | n/a | copied state | skeleton | "no record found" | "could not load" |
| Command palette | results grouped | active row | runs action | n/a | "nothing matches" with an example | n/a |
| Story intro | beat 1 | n/a | n/a | n/a | n/a | falls back to plane |
| Bottom sheet (phone) | peek | drag handle | half, full | n/a | n/a | n/a |
| Notebook drawer | pins list | n/a | n/a | n/a | "Pin a point to start a notebook" | n/a |
| Time scrubber | year ticks | year preview | playing | n/a | n/a | n/a |
| Toast | message | n/a | n/a | n/a | n/a | n/a |
| App error screen | n/a | n/a | n/a | n/a | n/a | what failed, why nothing is guessed, reload |

---

## 7. Phases

Each phase lists goal, interaction specification, data and integrity, accessibility, files, tests and acceptance. Complexity: S under 2 h, M 2 to 5 h, L over 5 h.

### Phase 0. Stabilise (S, must)
- **Fix** the tour loop: `Tour.tsx` calls its step action once per step change (ref to the latest callback, effect keyed on step only); `Home.tsx` passes a stable callback.
- **Add** an app-wide error boundary (`components/ErrorBoundary.tsx`) around routes with the designed error screen and a reload button.
- **Commit** the pending phone fixes and snapshots; write `docs/redesign/DEMO.md` (30-second path).
- **Tests:** a jsdom interaction test that steps through the tour three times without an update-depth error; a test that a thrown render error shows the error screen.
- **Acceptance:** two clicks on Next in the production build never blank the page.

### Phase 1. Design system v2 foundation (S to M, must)
- Type roles, motion tokens, elevation levels, icon set, land and sea tokens (section 5).
- Refactor `.btn`, `.chip`, `.seg`, `.switch` to the new tokens; add `.toolbar`, `.tile`, `.sheet`.
- Light theme glyph rings for 3:1.
- **Tests:** contrast script extended to non-text pairs; snapshot update reviewed.
- **Acceptance:** every component uses tokens only (grep for raw hex outside `index.css` returns nothing).

### Phase 2. The instrument panel (M, must)
- **Readout:** point title (28 px) with candidate name; four tiles (gas, droplet, solid, BRE) with large numbers and fuel shapes; zero tiles hatched with "no tests recorded". Tiles crossfade on change; numbers never count.
- **What's missing callout** directly under the tiles, built only from built values. Examples: solid tests near this point (zero), solid burns with this oxygen but no pressure (count), BRE sessions with no chamber pressure (count), prebreathe figure status, paper findings awaiting verification (count). Each line is a door to its source.
- **Sparklines:** tests near points along oxygen at this pressure, and along pressure at this oxygen, read from one row and one column of `probe_grid.json` (totals). A marker shows the probe; hatched where zero. Hovering a bar shows the count as a Value.
- **Context strip:** flame temperature (nearest computed point when not a candidate), prebreathe status, step size scrubber, in one compact row that expands.
- **Quieter numbers:** dotted underline only on hover and keyboard focus; "paper" counts shown only when not zero (the source card still splits sources).
- **Action bar** pinned to the bottom of the panel: Dossier, Tests, Compare, Brief, Share (with toast).
- **Data and integrity:** no new numbers; sparkline values are grid values with the series provenance id.
- **Files:** `components/EvidencePanel.tsx` (split into `Readout`, `MissingCallout`, `Sparklines`, `ContextStrip`, `ActionBar`), `lib/probe.ts` (row and column readers), `components/Value.tsx`.
- **Tests:** unit tests for row and column readers against the grid; snapshots of the panel at three points; a test that every number in the panel renders through `Value`.
- **Acceptance:** at 1440 x 900 the readout, the missing callout and the sparklines are visible without scrolling.

### Phase 3. The coastline of knowledge (M, must)
- **Land and sea:** contour of the probe grid total (current multiplier) at the threshold "more than zero" drawn with `d3.contours` as filled land; everything else sea with hatching; the coast as a 1 px line. Recomputed per multiplier and per "Solids only" (solid series), cached.
- **Solids only:** land sinks over 600 ms (clip-path wipe from the coast inward), then the cited headline lands. Reduced motion: instant swap.
- **Pins:** candidates as map pins with name and a one-word evidence state ("inland", "on the coast", "at sea") derived from the grid at that node. These describe evidence, never risk, and say so in their tooltip.
- **Glyph clusters:** bins at identical recorded values already carry counts; draw each bin once, sized by its count, with a count badge only on hover.
- **Floating toolbar** inside the plane (top left): Solids only, Layers, Zoom, Select area, Time (phase 8), Sound (phase 4). Replaces the two rows of controls.
- **Quieter layers:** isotherms solid 1 px at low contrast with labels along the path; halo as a soft filled ellipse without dashes.
- **Integrity:** the coastline is geometry on build values; no new counts.
- **Files:** `charts/Plane.tsx` (new `CoastLayer`, `Pins`, `Toolbar`), `pages/Home.tsx`, `index.css`.
- **Tests:** a unit test that the land polygon covers exactly the grid nodes with a non-zero total (sampled); snapshots of plane in normal and solids-only states.
- **Acceptance:** the solids-only transition is the most memorable moment in a hallway test.

### Phase 4. Feel (S to M, should)
- **Snap ping:** a ring expands and fades when the probe snaps to a pin.
- **Edge pulse:** the coast segment nearest the probe brightens when the probe crosses from land to sea.
- **Trail:** a fading path of the last 40 probe positions, shaded by land or sea. Toggle in Layers; off for reduced motion.
- **Shortcuts:** 1 to 5 jump to candidates; S solids only; G access gap; C compare; P pin; ? shows a shortcut sheet.
- **Toasts:** "Link copied", "Pinned", "Brief ready".
- **Geiger mode (opt-in, off by default):** a soft click rate proportional to the near-test total at the probe, using WebAudio; doubles as a non-visual cue. Respects a mute setting kept per device.
- **Haptics (phones):** a short vibration when crossing the coast.
- **Tests:** shortcut handler unit tests; audio module never starts without a user gesture.

### Phase 5. Story intro (M to L, must for the demo)
- Replaces the tour. Three beats over the live plane, each about six seconds, advanced by scroll, click or the arrow keys:
  1. "NASA has not chosen the Moon-base atmosphere." The five candidates appear and pulse.
  2. "These are the fire tests PSI lets us place." The land rises; glyphs fade in by fuel class.
  3. "Now only solid materials." The land sinks; headline with cited counts (263, 129, 0, 0 from `access_gap.json`).
- Ends on **Explore**, which hands over to the plane at 8.2 psi / 34% with solids only on. Skip at any time; shown once per device; replayable from the palette.
- Reduced motion: three static frames with the same text.
- **Files:** new `components/Intro.tsx`; remove `Tour.tsx`.
- **Tests:** snapshot of each beat; keyboard path through all beats; numbers come from `Value`.
- **Acceptance:** the intro alone tells the access-gap story to someone who has never seen Redshift.

### Phase 6. Phone excellence (M, should)
- Bottom sheet with three snap points (peek shows the readout tiles; half shows the missing callout; full shows everything), drag handle, focus-trapped when full.
- Pinch to zoom and two-finger pan on the plane; tap to pin; long press to preview.
- 44 px minimum touch targets; toolbar collapses into a single menu button.
- **Tests:** screenshot matrix at 390 and 768; keyboard and screen reader check on the sheet.

### Phase 7. Ghost compare (M, could)
- Pin point A, keep dragging B: the panel shows A and B side by side tile by tile, with each side's counts from the grid. Differences are highlighted visually (bar lengths), not computed as a score.
- "Open in Compare" carries both points into `/compare`.

### Phase 8. Time machine (M, could)
- A year scrubber in the toolbar. Glyphs and land appear in the order of each investigation's PSI period. Investigations without dates sit in a hatched "date not recorded" tray; nothing is estimated.
- **Pipeline addition (required for integrity):** `redshift/export/timeline.py` writes `timeline.json`: per year, cumulative counts by fuel class of placed tests, each with provenance (inputs are test ids and the investigation date fields). The browser never counts by year itself.
- **Tests:** pipeline unit tests; determinism; a golden check that the final year equals the current totals.

### Phase 9. Field notebook (M, could)
- Pin any point with an optional note; pins live in the URL (`pins=`) and on the device. A drawer lists them with their readout tiles.
- "Brief from notebook" produces one cited brief covering all pins, with CSV and BibTeX.

### Phase 10. Missions (M, could)
- Five short challenges that teach the data, for example: find a point with droplet tests but no gas tests; find where solid evidence would start if BRE recorded pressure; find a candidate whose prebreathe figure awaits verification.
- Each completes when the probe meets a condition checked on the grid, then shows the tests that prove it and opens the related dossier. No points, no leaderboard.

### Phase 11. Postcards and context-aware Ask (S to M, could)
- **Postcard:** export the current view as a PNG or SVG with its cited headline, dataset version and source list embedded.
- **Ask:** suggestion chips change with the point (for example "Why can't BRE be placed here?" when BRE sessions match the oxygen).

### Phase 12. Polish and verification (M, must)
- Collision and clipping audit across the screenshot matrix in both themes.
- Copy edit of every visible string (British English, no em dashes, plain sentences, cited numbers).
- Performance pass, Lighthouse, keyboard walkthrough, screen reader spot check (NVDA on Windows).
- Usability sessions (section 3) and fixes.
- Final before and after screenshots; `docs/redesign/DEMO.md` rehearsed; README updated.

---

## 8. Integrity checklist per feature

| Feature | New numbers on screen? | Source | Guard |
| --- | --- | --- | --- |
| Readout tiles | No | `probe_grid.json` series | Parity test, `Value` only |
| Missing callout | No | grid, `access_gap.json`, `prebreathe.json` | Snapshot, `Value` only |
| Sparklines | No | grid row and column | Unit test against grid |
| Coastline | No (geometry) | grid totals | Coverage test |
| Pins' evidence state | No (word) | grid at candidate node | Unit test |
| Ghost compare | No | grid | Snapshot |
| Time machine | Yes, per-year counts | new `timeline.json` from the pipeline | Pipeline tests, golden final year |
| Notebook brief | No | grid | Snapshot of export |
| Missions | No | grid | Unit tests per mission |
| Postcard | No | current view | Embeds dataset version and sources |
| Live Ask | Only slots | API retrieval | Existing post-check |

Rule kept from D18: no number ever animates through values that are not data.

---

## 9. Performance budget

| Item | Budget |
| --- | --- |
| Home JavaScript (gzip) | under 120 KB beyond today's 92 KB (d3 contours already bundled) |
| Data on first load | under 1.5 MB transferred (probe grid, trade map, candidates, flame grid, planner, access gap) |
| Coastline compute | under 20 ms per multiplier, cached |
| Drag frame | p95 under 16.7 ms; the base layer never re-renders during a drag |
| Story intro | 60 fps on a mid-range laptop; no layout shift between beats |

---

## 10. Testing strategy

- **Python:** existing 215 tests plus `timeline.json` tests (phase 8).
- **Web unit:** grid row and column readers, coastline coverage, shortcuts, mission checks.
- **Interaction (jsdom):** tour and intro stepping, palette navigation, sheet focus trap. Written with `react-dom/client` and React's `act`, no new dependency (decision D6 as taken by the team; pattern in `web/src/components/interaction.test.tsx`).
- **Snapshots:** every changed screen, each update diffed and explained in its commit message.
- **Manual matrix:** 390, 768, 1440, 1920 px x dark, light x reduced motion on and off.

---

## 11. Schedule against the deadline

The brief sets submission by Sunday 15 November 2026, 21:00 IST, with feature freeze at 18:00.

| Order | Phases | Running total (rough) |
| --- | --- | --- |
| Must | 0, 1, 2, 3, 5, 12 | 18 to 24 h |
| Should | 4, 6 | plus 5 to 8 h |
| Could | 7, 8, 9, 10, 11 | plus 12 to 18 h |

The musts alone fill most of the time left before the freeze. If the team wants more than the musts before submission, the cut order (first to go) is: 10 missions, 11 postcards and Ask chips, 9 notebook, 7 ghost compare, 8 time machine, Geiger mode, phone pinch zoom. Never cut: phase 0, the coastline, the instrument panel, the story intro, the polish pass.

---

## 12. Decisions the team needs to make

| # | Decision | Options |
| --- | --- | --- |
| D1 | Which phases before the freeze | Musts only (recommended), musts plus shoulds, everything |
| D2 | Story intro replaces the tour | Replace (recommended) or keep both |
| D3 | Light-theme glyph rings | Approve the 1 px darker ring and re-run the colour-blindness check (who?) |
| D4 | Sound | Include opt-in Geiger mode, or drop it |
| D5 | Time machine dates | Use investigation periods from PSI pages as the timeline (the only dated source), labelled as such |
| D6 | Testing dependency | Add `@testing-library/react` for interaction tests |
| D7 | Live Ask hosting | Host the API with a key for judging, or keep cached answers only (open question Q17) |

---

## 13. Definition of done

- Every must phase meets its acceptance criteria.
- Section 3 targets met and evidenced in `docs/redesign/` (screenshots, timings, Lighthouse output, usability notes).
- All tests and checks pass: build, pytest, ruff, mypy, typecheck, lint, vitest, em dash check, palette check.
- README, `docs/DECISIONS.md`, `docs/EXPLAINER.md` and `docs/OPEN_QUESTIONS.md` updated.
- The 30-second demo runs cleanly twice in a row on the production build.
