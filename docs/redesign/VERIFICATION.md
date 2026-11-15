# Verification: Phase 12 (polish and verification)

Every check run for Phase 12 of `EXCEPTIONAL_PLAN.md`, on 15 November 2026, on branch `redesign/plane-first`, with its exact result. Dataset `2026-11-14+86f35c56f2e0`. The web checks ran on the final source; the browser checks ran on the production build served by `vite preview` at `http://localhost:4173` in Chrome (via its DevTools protocol) on Windows 11.

## Commands and results

From the repository root, with the project environment (`UV_PROJECT_ENVIRONMENT` set to the venv):

| Command | Result |
| --- | --- |
| `uv run python -m redshift.build` | `dataset 2026-11-14+86f35c56f2e0`; `tests 1942, flags 678, provenance coverage 100.0% of 60420`; `goldens: match=24, explained_difference=2`; `wrote data/processed and web/public/data`. No output file changed in content. |
| `uv run pytest -q` | `215 passed in 153.55s (0:02:33)` |
| `uv run ruff check redshift tests scripts` | `All checks passed!` |
| `uv run mypy` | `Success: no issues found in 10 source files` |
| `uv run python scripts/no_em_dash.py` | `no em dashes` (run again after the docs were written: same result) |

From `web/`:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0, no output |
| `npx eslint src --max-warnings 0` | exit 0, no output |
| `npx vitest run` | `Test Files 11 passed (11)`, `Tests 160 passed (160)` |
| `npm run build` | `built in 4.05s`; Home chunk 92.92 kB (gzip 31.16 kB), app chunk 237.46 kB (gzip 77.00 kB) |
| `node scripts/contrast.mjs` | `All 480 enforced pairs pass in the dark, light and print themes; no red in the palette; print sets every light token.` |
| `node scripts/palette-hue.mjs` (new) | `palette hue check: 82 hex colours in 2 files, 0 red-adjacent (hue within 20 degrees of 0, saturation above 0.35)` |

Snapshot updates (`npx vitest run -u`, each diff read before accepting): the Dossier action's `disabled:` classes became `aria-disabled:` classes with a visually hidden description; "nearest point" gained `whitespace-nowrap`; the intro card's classes moved it to the bottom below lg; beat 1's headline wraps "Moon-base" in a no-wrap span; beat 3's copy changed as recorded in D35; the brief title's "(56.5 kPa)" sits in a no-wrap span; the spacesuit pin's label (4.3 psi / 100% O2, outside the habitat zoom of the snapshot, so off the plot and clipped) is no longer emitted. No number changed.

## Lighthouse

Lighthouse 13.4.1, navigation mode, on `http://localhost:4173/?o2=34&p=8.2` (a link with a view, so the intro does not open), dark theme.

| Device | Accessibility | Best practices | SEO |
| --- | --- | --- | --- |
| Desktop | 100 | 100 | 100 |
| Mobile | 100 | 100 | 100 |

The first desktop run also flagged `label-content-name-mismatch` (weight 0, so the score was already 100): the logo link and the search button showed words their accessible names did not hold. Fixed (D35); the final desktop run fails only `llms-txt` in the experimental "agentic browsing" group (67), which is outside the plan's targets.

## Drag smoothness

Production preview, 1440 x 900, dark, `/?o2=34&p=8.2`. A script dispatches pointer events on the plane's pointer surface: pointer down, one pointer move per animation frame along a sine path across 60% of the plot's width, pointer up. One warm-up drag of 60 frames, then the measured drag of 120 frames, with a `longtask` PerformanceObserver running. The readout changed 12 times during the measured drag and the probe was committed at `?o2=40&p=8.7`, so the drag did real work.

| Measure | Result |
| --- | --- |
| Frame gap, median | 11.1 ms |
| Frame gap, p95 | 11.5 ms (target: under 16.7 ms) |
| Frame gap, minimum and maximum | 10.3 ms and 22.3 ms (one late frame in 120) |
| Long tasks during the drag | none |

The display ran at about 90 Hz (an 11.1 ms frame), so the steady state holds the display's own rate.

## The demo path

Run twice in a row by script on the production build at 1440 x 900 (local storage for the intro cleared before each run): beat titles "NASA has not chosen the Moon-base atmosphere.", "These are the fire tests PSI lets us place.", "Now only solid materials."; beat 3 card "No solid burn in PSI's tables records pressure. Of 263 solid-fuel burn rows, 129 record oxygen, 0 record pressure and 0 sit near a habitat candidate as downloadable rows."; every pin reads "at sea" and the plane says "No solid-material test can be placed on this plane"; focus on Explore; Explore lands on `?o2=34&p=8.2&solids=1` with the plane focused; the panel reads "37 tests sit near this point. None is a solid material."; the Ask chip's answer is labelled "AI-assisted, awaiting human check". A timed rehearsal by the presenter is still open (`docs/OPEN_QUESTIONS.md`, Q26).

## The Phase 6 review findings

| Finding | Check after the fix |
| --- | --- |
| The sheet covered the Reference menu on a phone | 390 x 844 touch, dark: with the sheet at peek (top 592), half (top 377) and full (top 64), `elementFromPoint` at the centre of every one of the 8 menu links hits the link. |
| The legend showed through the dimmed sheet in the intro | 390 x 844, intro beat 1: the sheet's computed opacity is 1 and its children's 0.15; the intro card covers it (y 610 to 828). |
| The intro card hid the 14.7 psi row | The card now sits at the bottom of the screen below lg; the whole plot, with the 14.7 psi / 21% O2 pin and label, shows above it in every beat (`intro-beat3-390-dark.png`). |

## Screenshot matrix

In `docs/redesign/after/` (this set replaces the earlier images). Each was checked for collisions, clipping and misalignment by eye and by a script that measures every visible SVG text, pin, caption, tag and toolbar box on the plane and reports any two that overlap: zero overlaps on every plane view below, and no horizontal scroll at any width.

| File | View |
| --- | --- |
| `plane-1440-dark.png` | The plane at 8.2 psi / 34% O2, 1440 x 900, dark |
| `plane-solids-1440-dark.png` | The same with Solids only, after Explore |
| `intro-beat3-1440-dark.png` | The intro's third beat |
| `provenance-1440-dark.png` | The gas tile's count with its provenance card open |
| `compare-1440-dark.png` | Compare, 8.2 psi / 34% against 10.2 psi / 26.5% |
| `brief-1440-dark.png` | The brief for 8.2 psi / 34% |
| `plane-390-dark.png` | The plane at 8.2 psi / 34% O2, 390 x 844 touch, dark, sheet at peek |
| `plane-solids-390-dark.png` | The same with Solids only, after Explore |
| `intro-beat3-390-dark.png` | The intro's third beat, card at the bottom |
| `provenance-390-dark.png` | The gas tile's provenance card |
| `compare-390-dark.png` | Compare (full page) |
| `brief-390-dark.png` | The brief (first screen) |
| `plane-1440-light.png` | The plane at 8.2 psi / 34% O2, 1440 x 900, light |
| `plane-1920-light.png` | The same at 1920 x 1080 |

The same overlap script on the other zooms at 1440 x 900 (`zoom=plane`, `zoom=all`, and `zoom=all` with Solids only): zero overlaps. At All tests, where the two 10.2 psi pins sit a few pixels apart, the 26.5% pin shows "26.5% O2" and the 30% pin shows its head alone (its name is in the Candidates menu), where the Phase 3 review saw "10.2 10.2 ps" overprinted.

Found and fixed during the pass: on a phone the Solids only caption sat over the 8.2 psi / 34% pin's label (the caption is now placed first and the labels keep off it), the 10.2 psi pins' labels overprinted each other or were dropped (they now shorten to "26.5% O2" and "30% O2"), and the brief's title broke after its opening bracket.

## Deferred minor findings

Fixed in this phase: the Share toast (already fixed in Phase 4: `copyPageLink` says "Link copied" only once the clipboard accepts it, otherwise "Copy the link from the address bar"); the probe drawn at the fallback width on a phone's first frame; Dossier's explanation out of reach of keyboard and touch; "nearest point" wrapping; two toolbar menus open at once; "1 tests" and the missing fuel class on the hover badge; the land sinking as a snap; pin labels overprinting; the probe's tag over a pin's word on a phone; the Solids only caption over the 8.2 psi pin in the intro's last beat; beat 3's list and the "Moon-base" break; half leaving no plane in sight on a phone; the 2,700 K label over the gas cluster at 375 to 390 px (not reproduced: at 390 x 844 the label sits by the coast at about 10.2 psi, clear of the 14.7 psi cluster, `plane-390-dark.png`).

### Known minor issues

Left open, each with its reason:

| Issue | Why it is left |
| --- | --- |
| A pinch re-renders the whole plane on every move (14 to 27 ms a move in the Phase 6 review, one 82 ms spike). | Moving the pinch to a CSS transform during the gesture and committing the window on lift touches the plane's gesture and frame code; too risky this close to the freeze for a gesture most judges will not use. |
| Beat 1 shows four of the five candidates at the default habitat zoom. | Accepted (D35): the copy gives no count, and the hidden one is the spacesuit point, not a cabin atmosphere. |
| On a phone most pins lose their evidence word, and the two 10.2 psi pins show only their oxygen. | By design (D35): a shortened label is better than two labels printed over each other. The words are in the Candidates menu and the legend explains them. |
| A pin label can still sit over glyphs (for example "26.5% O2" over the 10.2 psi droplet row on a phone). | Glyphs are a soft cost in placement; the label's surface-coloured outline keeps it readable. |
| On a narrow plot the pins keep off the probe's tag where it first goes (above and right); if the tag takes another corner, a label can sit near it. | The tag already takes the corner clear of every label; a full joint placement of tag and labels is not worth the risk now. |
| During the intro on a phone a band above the plot stays empty (the space the hidden headline and toolbar keep). | Keeping it stops the plot jumping at Explore (no layout shift between beats, plan section 9). |
| Compare at 390 px: a zero-count row's "no tests recorded" wraps beside the hatch, and the second column's rows do not line up with the first's when their headers differ in height. | Nothing overlaps or clips; aligning rows across a sideways-scrolling compare is a layout change beyond this pass. |
| Compare shows "paper 0" beside every count, while the panel hides zero paper counts (D28). | Compare was outside Phase 2's scope; the change belongs with a compare redesign. |
| At half, the sheet can end part way through the missing callout on a short phone. | By design (D34): half keeps 40% of the screen for the plane; full, or Tab, shows the rest. |
| The planner heat map's in-cell labels (sized to the cell, under 12 px) and the coverage matrix's rotated headers at 390 px (from the Phase 1 review). | Not part of phases 0 to 6; not re-checked in this pass. |
| Light-theme glyph rings still need the colour-blindness re-check (plan decision D3). | Needs a named checker with a simulator (Q20). |
