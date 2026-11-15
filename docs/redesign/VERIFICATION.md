# Verification: Phase 12, the completeness review fixes and the final audit fixes

Every check run for Phase 12 of `EXCEPTIONAL_PLAN.md` and, after it, for the completeness critic's gaps (decision D36), on 15 November 2026, on branch `redesign/plane-first`, with its exact result. Dataset `2026-11-14+86f35c56f2e0`. The web checks ran on the final source; the browser checks ran on the production build served by `vite preview` at `http://localhost:4173` in Chrome (through its DevTools protocol) on Windows 11.

**Status.** Every check below that a script can run passes. The checks that need people (the five-second test, the timed cold task, the hallway test, a newcomer reading the intro alone, the keyboard walkthrough by a person, the NVDA spot check, real phones and the presenter's rehearsals) have not been run and have no owner yet; `docs/redesign/usability.md` sets each out with an empty results table (`docs/OPEN_QUESTIONS.md`, Q23 to Q26). Until they are run, Phases 3, 5, 6 and 12 are done in code with their acceptance pending.

The final audit fixes (D37) came after these sections were written; every check was run again for them, and their results are in the last section, "Final audit fixes". Where an earlier section's measure changed, it now gives the new one and says so.

## Commands and results

From the repository root, with the project environment (`UV_PROJECT_ENVIRONMENT` set to the venv):

| Command | Result |
| --- | --- |
| `uv run python -m redshift.build` | `dataset 2026-11-14+86f35c56f2e0`; `tests 1942, flags 678, provenance coverage 100.0% of 60420`; `goldens: match=24, explained_difference=2`; `wrote data/processed and web/public/data`. No output file changed in content. |
| `uv run pytest -q` | `215 passed in 116.29s (0:01:56)` |
| `uv run ruff check redshift tests scripts` | `All checks passed!` |
| `uv run mypy` | `Success: no issues found in 10 source files` |
| `uv run python scripts/no_em_dash.py` | `no em dashes` (run again after the docs were written: same result) |

From `web/`:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0, no output |
| `npx eslint src --max-warnings 0` | exit 0, no output |
| `npm test` (now `contrast.mjs`, then `palette-hue.mjs`, then `vitest run`) | `All 480 enforced pairs pass in the dark, light and print themes; no red in the palette; print sets every light token.`; `palette hue check: 82 hex colours in 2 files, 0 red-adjacent (hue within 20 degrees of 0, saturation above 0.35)`; `Test Files 11 passed (11)`, `Tests 164 passed (164)` |
| `npm run build` | `built in 4.23s`; Home chunk 95.24 kB (gzip 31.94 kB), app chunk 237.74 kB (gzip 77.10 kB) |
| `node scripts/matrix.mjs` (new) | 56 views and 10 more shots, every one with 0 overlaps, 0 pins or glyphs under the toolbar, no sideways scroll, no chart text outside its chart and none under 12 px (below) |

`palette-hue.mjs` now runs in `npm test`, so `make check` and CI run it. New tests (D36): P and its toast, the command palette's arrow keys, active row and empty state, the glyph badge from the keyboard, the panel inert during the intro (`interaction.test.tsx`), `pinchTransform` (`gesture.test.ts`) and P in `shortcuts.test.ts`. `tokens.test.ts` no longer exempts the planner heat map from the type scale.

**Snapshot update** (`npx vitest run -u`, the diff read before accepting): at the fallback size used without layout (960 x 640, toolbar 300 x 40) the floating toolbar's box would cover the 14.7 psi glyphs, so the three plane screens now draw it in its band (toolbar top 6 px, plot top 52 px, so every plot coordinate moves); the base layers sit in one wrapper div and the overlay's marks and probe in two groups (the pinch transform); the O2-only strip's tooltips lose their counts; the "2,200 K" isotherm label finds no clear spot on the shorter plot and is not drawn there. No number in the panel changed.

## Lighthouse

Lighthouse 13.4.1 in Chrome, dark theme, on the final build.

| Page | Mode | Device | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- |
| `/` (bare address: storage reset, so the story intro opens) | navigation | desktop | 100 | 100 | 100 |
| `/` | navigation | mobile | 100 | 100 | 100 |
| `/` with the intro open | snapshot | desktop | 100 | 100 | 100 |
| `/?o2=34&p=8.2` (a view link) | navigation | desktop | 100 | 100 | 100 |
| `/?o2=34&p=8.2` | navigation | mobile | 100 | 100 | 100 |

Before the fix the bare address scored 97 for accessibility (the critic's snapshot run): while the intro played, the panel was dimmed to 15% but not inert, so its text failed colour contrast. It is now inert and aria-hidden until the hand-over (D36); after each navigation run the page showed the intro with the panel inert. Each run fails only `llms-txt` in the experimental "agentic browsing" group, which is outside the plan's targets.

## Load

Performance traces at 1440 x 900, no throttling, on the final build.

| Page | Largest contentful paint | Layout shift |
| --- | --- | --- |
| `/` with the intro open | 718 ms (render delay 708 ms) | 0.00 |
| `/?o2=34&p=8.2` | 886 ms (TTFB 70 ms, render delay 816 ms); 598 ms on an earlier build of this pass | 0.00 |

Target (section 3): under 2.0 s and under 0.02. **Data on first load**: 9 files (`probe_grid`, `trade_map`, `candidates`, `candidate_evidence`, `flame_temperature_grid`, `prebreathe`, `access_gap`, `dataset_version`, `ai_text`), 1,089 KB decoded, 89 KB gzip (the preview serves them gzip-encoded; budget 1.5 MB transferred). **Story intro**, beat 1 to beat 3 by its Next button with 2.5 s per beat at 1440 x 900 (budget: 60 fps, no layout shift between beats; the display runs at about 90 Hz). Final build: 568 frames, median 11.1 ms, p95 11.3 ms, 9 over 16.7 ms (longest 55.4 ms), one long task of 50 ms, layout shift 0. An earlier build of this pass: 579 frames, median 11.1 ms, p95 11.3 ms, 6 over 16.7 ms (longest 22.3 ms), no long task, layout shift 0.

## Drag and pinch smoothness

**Mouse drag**, 1440 x 900, dark, `/?o2=34&p=8.2`: pointer events on the plane's surface, one move per frame along a sine path across 60% of the plot, 120 frames, as in Phase 12. After a warm-up drag: median 11.1 ms, p95 11.4 ms, 2 frames over 16.7 ms (longest 22.3 ms), no long task. The first drags after a page load are slower (p95 14.7 and 22.2 ms on two cold runs, longest frames 44 and 54 ms), with no long task. During a drag the base layer changes only when the probe snaps onto or off a pin (that pin's label hides while the probe is on it, by design): 2 DOM mutations in 120 frames.

**Pinch** (new, D36), 390 x 844 touch, dark, `/?o2=34&p=8.2`: two pointers of type touch, one move each per frame, three gestures of 120 frames (spread to zoom in, close to zoom out, a two-finger pan). Two runs:

| Run | Median | p95 | Frames over 16.7 ms | Longest | Long tasks | Base layer DOM changes during the gestures |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 11.1 ms | 11.5 ms | 12 of 360 | 44.4 ms | one, 54 ms | 0 |
| 2 | 11.1 ms | 11.3 ms | 6 of 360 | 44.3 ms | none | 0 |

During a pinch the layers follow by a CSS transform and the base layer is never re-rendered (0 mutations); it is drawn once for the new window when the fingers lift (one redraw per gesture: 94 DOM changes for a single gesture in a first check, 711 for run 2's three). Run 1's one long task fell between gestures (no frame during a gesture took more than 44.4 ms), where the work is the redraw after a lift. Before the fix a pinch re-rendered the whole plane on every move (14 to 27 ms a move in the Phase 6 review, one 82 ms spike).

## Touch targets

Measured with `elementFromPoint` (so a pseudo-element's larger target counts) by `matrix.mjs` at 390 x 844 and 768 x 1024 with touch, both themes. Smallest across those views, width x height in px:

| Control | Before (critic, 390 px) | Now |
| --- | --- | --- |
| Logo link | 24 x 24 | 44 x 44 |
| Search | 34 x 44 | 44 x 44 |
| Theme toggle | 34 x 44 | 44 x 44 |
| Plane, Reference, Compare | | 55 x 44, 108 x 44, 86 x 44 (the matrix rerun for D37; this row said 99 x 44 for Reference, a figure the matrix never held) |
| Readout tiles' numbers | about 56 x 42 | 44 x 44 (one-digit counts) to 56 x 44 |

## The toolbar at 768 px

At 768 x 1024 with touch the floating toolbar covered the 14.7 psi / 21% O2 pin's head and 50 glyphs (critic). It now takes its band above the plot whenever its box would cover a pin's head or a glyph (D36): toolbar `[72, 142, 474, 196]`, 0 pin heads and 0 glyphs under it, in every 768 view of the matrix (`plane-768-*.png`).

This section used to say that at 1440 and 1920 the toolbar still floats. That was false at 1440 x 900 under Solids only: the O2-only strip grew 4 px there, which shortened the plot just enough for the 14.7 psi / 21% pin's head to reach under the toolbar, so the toolbar took its band (`[80, 142, 422, 184]` in `plane-solids-1440-*` of the earlier matrix) and the plot moved about 38 px between the intro's beats 2 and 3, at Explore and on S. Since D37 the strip keeps its height under Solids only, so the plot and the band decision are the same with it on or off: at 1440 and 1920 the toolbar floats (`[80, 160, 422, 202]`, nothing under it) in every view of the rerun matrix, Solids only and the intro's third beat included, and in the browser the 14.7 psi row stays at the same height through all three beats and Explore (last section).

## The demo path

Run twice in a row by script on the production build at 1440 x 900 in Phase 12, and run again by script for D37 on the final build (the new beat 2 copy, the cited counts, Explore landing on `?o2=34&p=8.2&solids=1` with the plane focused, the panel's "37 tests sit near this point. None is a solid material.", the Ask chip's "AI-assisted, awaiting human check"; last section). The presenter's timed rehearsals are open (`usability.md`, section 5; Q26).

## Screenshot matrix

In `docs/redesign/after/` (this set replaces the earlier images), made by `web/scripts/matrix.mjs` with a headless Chrome (scrollbars hidden) on the final build; `after/matrix.json` holds every measure. For each width (390 x 844 and 768 x 1024 with touch, 1440 x 900 and 1920 x 1080 without), each theme (dark, light) and each view below, the script saves the image and measures: any two overlapping boxes among the plane's SVG texts, pin heads, the probe's tag, the Solids only caption and the toolbar (a pin's own label beside its head not counted); pin heads and glyphs under the toolbar; chart text more than 3 px past its own SVG's edge (a text's box is its font's line box, a little larger than the ink); chart text under 12 px; sideways scroll.

| View | File pattern | Notes |
| --- | --- | --- |
| The plane at 8.2 psi / 34% O2 | `plane-{w}-{theme}.png` | sheet at peek below lg |
| The same under reduced motion | `plane-reduced-{w}-{theme}.png` | `prefers-reduced-motion: reduce` |
| The same with Solids only | `plane-solids-{w}-{theme}.png` | opened with Solids only on |
| The intro's third beat | `intro-beat3-{w}-{theme}.png` | storage cleared, Next twice |
| A provenance card | `provenance-{w}-{theme}.png` | the gas tile's count opened |
| Compare, 8.2 psi / 34% against 10.2 psi / 26.5% | `compare-{w}-{theme}.png` | full page |
| The brief for 8.2 psi / 34% | `brief-{w}-{theme}.png` | full page |

Result of the rerun for D37: 56 views (7 views x 4 widths x 2 themes), 1,799 plane items measured in 43 plane views (1,797 before: under Solids only at 1440 the "2,300 K" isotherm label finds a clear spot now that the plot keeps its size and the toolbar floats, in both themes): **0 overlaps, 0 pin heads or glyphs under the toolbar, no sideways scroll, no chart text outside its chart, none under 12 px**, in every view. The Phase 12 charts at 390 px: `planner-390-dark.png` (the heat map: every in-cell label 12 px; "no tests recorded" only where it fits, the hatch elsewhere) and `coverage-390-dark.png` (the coverage matrix: every rotated header inside the chart); both 0 outside, 0 under 12 px, no sideways scroll.

**Before and after pairs**: `after/pairs/` holds an after shot for each image in `docs/redesign/before/`, same name, 1440 x 900 dark (the phone one at 390 x 844): `landing-1440` and `map-1440` (both now the plane; `/map` redirects to it), `landing-phone`, `evidence-1440`, `investigations-1440`, `planner-1440`, `quality-1440`, `dossier-c8_2_34-1440`. The same measures on these: 0 overlaps, 0 outside, 0 under 12 px, no sideways scroll.

**Copy edit**: no separate record exists for Phase 12's "copy edit of every visible string"; what is checked by script is no em dash (`no_em_dash.py`) and no digit in the panel outside a Value (`panel.test.tsx`). A person's read of every string is part of the keyboard walkthrough in `usability.md`.

## The completeness review's gaps

| Gap | Check after the fix |
| --- | --- |
| Accessibility 97 on the bare address (dimmed panel not inert) | 100 in navigation mode on `/`, desktop and mobile, and in snapshot mode with the intro open; a test checks the panel is inert and aria-hidden until Explore |
| No 768 px or light-theme images; no reduced-motion images | The matrix above: 4 widths, 2 themes, reduced motion, 0 overlaps |
| Toolbar over the 14.7 psi pin and glyphs at 768 px | Band at 768 px; 0 pins and glyphs under it |
| Nav controls under 44 px wide on a phone | 44 x 44 or more (table above) |
| P and "Pinned" missing | P pins the point the panel reads and toasts "Pinned: the link in the address bar now opens this point" (tested) |
| Planner labels under 12 px, coverage headers past the edge at 390 px, test exemption | 12 px labels, headers inside, exemption removed, both charts captured at 390 px |
| Pinch re-rendered the plane on every move | CSS transform during the gesture, one redraw on lift; timings above |
| Strip tooltips printed counts outside a Value | Counts removed (the panel's What's missing gives, as Values, the tests near the probe's oxygen with no pressure recorded; the Evidence Explorer lists each); isotherm labels read as axis annotations (D36, to be ratified: Q27) |
| Checks that need people | Not run; set out in `usability.md`; the plan's status says acceptance pending |

Minor items fixed as well: the Load evidence (above), the plan's status and section 0, `palette-hue.mjs` in `npm test`, the overlap script committed (`matrix.mjs`), a palette navigation test, the glyph badge from the keyboard and a tap, and the before and after pairs.

## Known minor issues

Left open, each with its reason:

| Issue | Why it is left |
| --- | --- |
| Beat 1 shows four of the five candidates at the default habitat zoom (the spacesuit's 4.3 psi / 100% sits outside it), where Phase 5 says "the five candidates appear". | Accepted by Claude in D35, not by the team; a zoom that shows all five during beat 1 would move the plot between beats (plan section 9: no layout shift). Needs the team to ratify the change or ask for the zoom. |
| Q22: the "unknown, not safe" carrier. The sea hatch at 30% measures 1.35:1 dark and 1.24:1 light, and in the light theme land (#ffffff) and sea (#eef1f5) barely differ, so the coast line and the hatch carry it. | A team decision (Q22), not made. |
| Q20: the colour-blindness re-check of the light-theme glyph rings (plan decision D3). | Needs a named checker with a simulator. |
| Section 6 component states not built: the probe ring does not grow 2 px on hover or fill when active; a pin label does not lift on hover, and the active pin's label hides rather than the pin pulsing. | Not recorded as out of scope by the team; left for a later pass to keep this one to the gaps. |
| Pin tooltips never show on touch (they need a pointer resting on a pin or keyboard focus). | The pin's name and evidence word are in its label, the Candidates menu and the plane's accessible name. |
| During a pinch the base layers scale as a picture, so their text and axes stretch until the fingers lift and the plane is redrawn. | The cost of drawing nothing during the gesture; the redraw on lift is crisp. |
| The first frame of a pinch can take two or three display frames (up to 44 ms) while the browser composites the layer. | One frame per gesture; no long task during the gesture. |
| On a phone most pins lose their evidence word, and the two 10.2 psi pins show only their oxygen. | By design (D35): a shortened label is better than two labels printed over each other. |
| A pin label can still sit over glyphs (for example "26.5% O2" over the 10.2 psi droplet row on a phone). | Glyphs are a soft cost in placement; the label's surface-coloured outline keeps it readable. |
| On a narrow plot, if the probe's tag takes a corner other than above and right, a label can sit near it. | A full joint placement of tag and labels is not worth the risk now. |
| During the intro a band above the plot stays empty (the space the hidden headline and toolbar keep; at 768 px the toolbar's band too). | Keeping it stops the plot jumping at Explore (no layout shift between beats, plan section 9). |
| On a phone (390 x 844) the plot moves down 24 px at Explore, though not between beats: the hidden headline keeps the room of the headline for the view the intro opened on, and Explore turns Solids only on, whose headline is a line longer at that width. At 1440 and 1920 nothing moves. | Found in the D37 browser check; it predates D37 (the headline logic is unchanged). Reserving the longer headline during the intro would move the plot at Skip instead, so it is left for the team. |
| The Test Planner heat map's in-cell counts and a dossier's evidence bar labels are plain chart text, not Values (their charts name their sources underneath). | Pre-existing and outside the main flow; a team decision (Q29). README and `DEMO.md` no longer claim every number is a button. |
| Compare at 390 px: a zero-count row's "no tests recorded" wraps beside the hatch, and the two columns' rows do not line up when their headers differ in height. Compare shows "paper 0" beside every count, while the panel hides zero paper counts (D28). | Nothing overlaps or clips; belongs with a compare redesign. |
| At half, the sheet can end part way through the missing callout on a short phone. | By design (D34): half keeps 40% of the screen for the plane. |
| The coverage matrix at 390 px truncates investigation names more (its name column gives the rotated headers room). | Each row's full name is in its accessible name, its card and the table view. |
| Small planner cells (under 60 px) show no "no tests recorded" words, only the hatch. | The legend beside the chart says what the hatch means, and each cell's accessible name and tooltip say it in words. |
| The mouse drag's first runs after a page load have a p95 of 15 to 22 ms (steady state 11.4 ms). | Warm-up work (first layouts, JIT); no long task. |
| Stepping the intro to its third beat gave one 50 ms long task and one 55 ms frame in the final-build run (none, and 22 ms at most, in the earlier run): the Solids only sink and the glyphs fading under it. | At the 50 ms line, once per intro, during a scene change; not investigated further in this pass. |

## Final audit fixes (D37)

The final read-only audit's findings, each checked against the code and fixed where real (decision D37), on 15 November 2026, on the final source. Python checks used a virtual environment outside the repository, because the repository's `.venv` path is too long for Cantera on this machine; the commands are otherwise the ones above.

| Command | Result |
| --- | --- |
| `python -m redshift.build` | `dataset 2026-11-14+86f35c56f2e0`; `tests 1942, flags 678, provenance coverage 100.0% of 60420`; `goldens: match=24, explained_difference=2`; `wrote data/processed and web/public/data`. `git diff --stat --ignore-cr-at-eol -- data web/public/data` prints nothing: no data value changed. |
| `python -m pytest -q` | `215 passed in 112.98s (0:01:52)` |
| `uv run ruff check redshift tests scripts` | `All checks passed!` |
| `uv run mypy` | `Success: no issues found in 10 source files` |
| `python scripts/no_em_dash.py` | `no em dashes` |
| `npx tsc --noEmit` (in `web/`) | exit 0, no output |
| `npx eslint src --max-warnings 0` | exit 0, no output |
| `npm test` | `All 480 enforced pairs pass in the dark, light and print themes; no red in the palette; print sets every light token.`; `palette hue check: 82 hex colours in 2 files, 0 red-adjacent (hue within 20 degrees of 0, saturation above 0.35)`; `Test Files 11 passed (11)`, `Tests 176 passed (176)` |
| `npm run build` | `data snapshot OK (2026-11-14+86f35c56f2e0)`; `built in 4.17s`; Home chunk 96.37 kB (gzip 32.32 kB), app chunk 237.80 kB (gzip 77.11 kB) |
| `node scripts/matrix.mjs` | Rerun on the final build: 66 entries, 56 matrix views, 1,799 plane items in 43 plane views, 0 overlaps, 0 pin heads or glyphs under the toolbar, 0 chart texts outside their chart, 0 under 12 px, no sideways scroll. The toolbar in `plane-solids-1440-dark` and `-light` was `[80, 142, 422, 184]` and is now `[80, 160, 422, 202]`, the same as every other 1440 view. Smallest touch targets: logo 44 x 44, Plane 55 x 44, Reference 108 x 44, Compare 86 x 44, Search 44 x 44, theme 44 x 44, the tiles' numbers 44 x 44 to 56 x 44. |

**New tests** (12; vitest ran 164 tests before this pass and 176 now). In `interaction.test.tsx`: no sea in beat 1 and sea in beat 2; an Escape another dialog has already taken does not skip the intro; the shortcut sheet and the access gap draw above the intro's click catcher; Back to beat 1 keeps focus on Next; Skip of a replay returns focus to the panel control once the panel is no longer inert; the shortcut sheet and the palette give focus back to the plane; the phone's sheet drops to peek when the intro replays; every pin keeps a label on a phone's plot under Solids only (the plane's box as measured in Chrome at 390 x 844); a mouse pointerup cancels a pending move frame. In `panel.test.tsx`: the plot's size and the toolbar's place do not change with Solids only; the grid's dashed edge and caption in Whole plane and All tests, and none in the habitat range; the context strip says "loading" or "not available" before the flame grid arrives; no digit in the access gap chart's native tooltips. **Each new test was run with its fix reverted, and failed**: a script swapped each fix back, ran the test by name and restored the file, with exit 1 for all 14 reversions (the defaultPrevented check, the z-index, Back's focus, flushSync, the two SVG focus restores, the sheet's peek, the move frame, the beat 1 sea, the strip heights, the grid edge, the flame states, the gap tooltips and the second pin placement).

**Snapshot update** (`npx vitest run -u`, the diff read tag by tag before accepting): the o2-match heading's copy in the panel and the three plane screens, compare's row heading, the beat 2 title and body, the intro's text block class (`lg:min-h-[328px]`), and a wrapper group around the sea in the three plane screens. Under Solids only the plot at the fallback size is 428 px tall, as it is without Solids only, instead of 424, so that screen's plot coordinates moved; every text node in it is unchanged apart from the heading's copy. No number changed.

**Browser: the production preview in Chrome at 1440 x 900, dark** (a new isolated context with empty storage, so the intro opened):

| Check | Result |
| --- | --- |
| The plot through the intro (A2) | At beats 1, 2 and 3 and after Explore: overlay `translate(56,16)`, the 14.7 psi tick's top at 215.4 px, toolbar `[80, 160, 422, 202]`, every time. S off and on again after Explore: the same. At 1920 x 1080: `translate(56,16)`, the 14.7 tick at 240.5 px and the toolbar at `[80, 160, 422, 202]` at every beat and after Explore. |
| The card's buttons | Next's top at 481 px on all three beats (465, 481 and 465 before the text block took the new longest beat's height). |
| Beat 1 (B2) | The sea's group has `data-on="false"` and opacity 0: the bare plot and the pins only. At beat 2 it has `data-on="true"` and opacity 1, with the land. |
| Beat 2's copy (A1, B1) | "These are the fire tests PSI lets us place in this range." and "Each mark is one or more microgravity fire tests from NASA's PSI tables at one recorded oxygen and pressure, marked by fuel class." |
| Ctrl+K, then Escape, over beat 1 (C1) | The palette closed, the intro stayed on beat 1, focus went back to Next, and `redshift-intro-v1` stayed unset. |
| The shortcut sheet over the intro (C3) | Opened from the palette over beat 1, it draws above the card (screenshot); a real click on its close button closed it, with the intro still on beat 1 and focus back on Next. |
| Back on beat 2 (C4) | A real click: beat 1, with focus on Next. |
| `?` then Escape after Explore (C2) | The sheet closed with focus on the plane; the right arrow then moved the probe from 34 to 34.5% O2. |
| Skip of a replay (C5) | Focus on the panel's More button, then Ctrl+K, "replay the intro" and Escape: the intro closed, the panel was no longer inert, and focus was back on that button (now "Less", since the click had expanded it). |
| All tests zoom (B3) | The dashed edge runs round the grid at 14.75 and 100.25% O2 and at about 2.95 and 17.05 psi; the caption "Past the dashed line, beyond the probe grid: no coast computed" sits above it; the droplet marks at 12 to 13% O2 sit outside the line. |
| The demo path, by script | The beat titles above; beat 3's card "Of 263 solid-fuel burn rows, 129 record oxygen, 0 record pressure and 0 sit near a habitat candidate as downloadable rows."; the pins read "inland" four times at beat 2 and "at sea" four times at beat 3; the plane's caption; Explore to `?o2=34&p=8.2&solids=1` with the plane focused, the panel's "37 tests sit near this point. None is a solid material." and the tiles gas 20, droplet 17, solid 0 and BRE 0 ("no tests recorded"); the Ask chip's answer labelled "AI-assisted, awaiting human check", with 41 Values in the panel. |
| The panel's count fade (SWAP) | Shortcut 2 while pinned: two tiles' counts animate (`fade`, 200 ms, fill both), at opacity 0.00 at the start, 0.90 at 50 ms, 0.96 at 100 ms, 0.99 at 150 ms and 1.00 from 200 ms. Not a defect: a number looks blank only on a page that draws no frames (a background tab, a headless capture), and it fades in on the first frame drawn. |
| Console | No error or warning. One DevTools issue, "A form field element should have an id or name attribute", from the command palette's field; it predates this pass. |

**Browser: 390 x 844, touch, dark** (a second isolated context):

| Check | Result |
| --- | --- |
| The intro | Beats 1 to 3 by the arrow key: overlay `translate(50,58)` and the 14.7 psi tick at 242 px at every beat; the card at the bottom (610 to 828, 590 to 828 and 618 to 828 px), clear of the plot and the strip; the sheet at peek and inert; no sideways scroll (`scrollWidth` 390). Explore by a tap: `?o2=34&p=8.2&solids=1`, the sheet's peek shows the point and its four tiles, and focus is on the plane. The plot moves down 24 px at Explore (a known issue, above). |
| Replay over a full sheet (C6) | The handle tapped twice (full), then Search and "replay the intro": the intro opened with the sheet at peek and inert and the plane in view (screenshot). Escape closed the intro, with focus back on Search. |
| Pin labels under Solids only | `14.7 psi / 21% O2`, `26.5% O2` and `30% O2` (the probe's own pin hides its label), as before D37. |
| Console | No error or warning; the same DevTools issue as above. |

**Findings that needed no code change**: A3, A5 and B6 to B10 were documentation, corrected in `README.md`, `DEMO.md`, `usability.md` and above. SWAP was checked and left as it is (above).
