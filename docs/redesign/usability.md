# Usability, keyboard and screen reader checks

The checks of `EXCEPTIONAL_PLAN.md` (section 3, Phases 3, 5, 6 and 12) that need people. **None has been run yet.** Each section names what to do, what counts as a pass and where to write the result. The owners are for the team to name (`docs/OPEN_QUESTIONS.md`, Q23 to Q26); until they are run, Phases 3, 5, 6 and 12 are done in code with their acceptance pending.

Use the production build (`npm run build`, then `npm run preview`, `http://localhost:4173`) or the deployed site. Clear the site's storage before each first-visit session, so the story intro opens.

## 1. Five-second test (section 3)

- **Who:** five people who have not seen Redshift (friends or family of the team).
- **How:** show the bare address (the intro's first beat, then let it play to beat 3, about 20 s), then the plane after Explore for five seconds. Ask: "What did that page tell you?" Write their words down unprompted.
- **Pass:** four of five say, in their own words, that solid-fire evidence near Moon-base air is missing from the downloadable data.
- **Also covers:** Phase 5's acceptance (the intro alone tells the access-gap story to a newcomer) and Phase 3's hallway test (is the land sinking under Solids only the moment they remember?). Ask the second question after the first answer: "What, if anything, stuck with you?"

| # | Date | Tester (initials) | Their words | Missing solid evidence named? | Remembered moment |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

## 2. Timed cold task (section 3)

- **Who:** three testers, at least one with an engineering background.
- **Task, read aloud:** "Find what is known about fire at 10.2 psi and 26.5% oxygen, and export a brief you could put in a trade study."
- **Pass:** each finishes in under two minutes. Note every hesitation and what they said while thinking aloud.

| # | Date | Tester | Time | Route taken | Hesitations and quotes | Fix it suggests |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

## 3. Keyboard walkthrough (section 3, Phase 12)

A person walks every feature with the keyboard alone (no mouse, no touch), at 1440 x 900 and at 390 x 844 in device emulation for the sheet. The third column is what the automated tests already cover (`web/src/components/interaction.test.tsx` under jsdom, `web/src/lib/*.test.ts`); it does not replace the walk.

| Feature | What to do | Covered by a test | Person: pass, fail, note |
| --- | --- | --- | --- |
| Skip link | Tab once from the address bar; Enter jumps to the content | no | |
| Story intro | Arrows and Page Up or Down step the beats; Tab stays in the card; Escape skips; Explore hands focus to the plane | yes (intro tests) | |
| Plane probe | Arrows step one node, Alt and an arrow ten, Shift and an arrow the next candidate; Enter opens a candidate's dossier | yes (trail, badge tests) | |
| Glyph count badge | Land the probe on a glyph (Shift and Up from 10.2 psi / 26.5% O2); Tab reaches its count, Enter opens its source | yes (badge test) | |
| Area selection | B starts it; Escape clears it | no | |
| Shortcuts | 1 to 5, S, G, C, P (with its toast), ? from anywhere on the plane page; none while typing | yes (shortcut tests) | |
| Toolbar | Tab into it; every tool and menu (Candidates, Layers, Zoom, Sound) by Enter, Space, arrows and Escape | yes (toolbar test) | |
| Panel readout | Tab through the tiles' numbers; Enter opens each provenance card; Escape closes it and returns focus | partly (Value tests) | |
| What's missing | Each line's door opens its source | no | |
| Sparklines | Arrows move the cursor; each count reads as a Value | yes (sparkline test) | |
| Context strip | Its button expands and collapses; the step size scrubber by arrows | yes (context strip test) | |
| Action bar | Dossier (and why it is unavailable off a candidate), Tests, Compare, Brief, Share (with its toast) | yes (Dossier, Share tests) | |
| Ask | Type a question; Enter asks; the suggested questions by Tab and Enter | no | |
| Command palette | Ctrl+K opens; arrows move the active row; Enter runs it; "Nothing matches" with its example; Escape returns focus | yes (palette test) | |
| Bottom sheet (below lg) | Tab to the handle; Enter steps peek, half, full; arrows, Page Up or Down, Home and End; full traps Tab; Escape returns to half; Tab past the visible part opens full | yes (sheet test) | |
| Reference menu | Opens by Enter; every link reachable; Escape closes | no | |
| Compare, brief | Every control and every number's provenance card; the brief's downloads | no | |
| Theme toggle | Enter switches; focus stays on it | no | |

## 4. NVDA spot check (Phase 12, Phase 6)

NVDA on Windows with Chrome, browse and focus modes. Listen to each and write what NVDA says.

| Part | What to listen for | Notes |
| --- | --- | --- |
| Plane | Its role description and label: the probe's point, the candidate and its evidence word with "describes the recorded evidence, not fire risk", and the key help | |
| Panel | The point title, each tile's count and that it opens its source, the "no tests recorded" tiles, What's missing | |
| Bottom sheet | The handle's name and state (peek, half, full), the live announcement as it changes, the dialog when full | |
| Intro | Each beat's title and body announced as it changes; the cited counts read as numbers with their sources | |
| Toasts | "Link copied", "Pinned: ..." announced once | |

## 5. Presenter rehearsals (section 3, `DEMO.md`)

Two timed runs of the 30-second path by the presenter, on the production build, with no hesitation.

| # | Date | Presenter | Time | Hesitations | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
