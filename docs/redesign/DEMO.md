# The 30-second demo

The click path a presenter runs in front of judges, with what to say at each beat. It must run without a hesitation, rehearsed twice in a row on the production build (`EXCEPTIONAL_PLAN.md`, section 3).

**Status (15 November 2026, after the final audit fixes, D37).** The path below was run twice in a row by script on the production build at 1440 x 900, dark theme, in Phase 12, and once more on the final build after D37, with beat 2's new copy (`docs/redesign/VERIFICATION.md`, its last section): each beat's headline, the beat 3 counts, the hand-over to `?o2=34&p=8.2&solids=1`, the panel's "37 tests sit near this point. None is a solid material." and the Ask answer labelled "AI-assisted, awaiting human check" all came up as written here. A team member still has to rehearse it twice by hand, timing each beat, before the judges arrive.

The demo starts with the story intro (Phase 5, decision D2: it replaced the tour). Its three beats play over the live plane, and its **Explore** button hands over to the plane at 8.2 psi / 34% O2 with Solids only on.

## Before the judges arrive

1. Build and serve the production site from `web/`: `npm run build`, then `npm run preview` (serves `http://localhost:4173`). The build refuses to run if the data snapshot is missing or provenance coverage is below 100%.
2. Browser window at 1440 x 900, page zoom 100%, dark theme.
3. Make sure the intro will open. It shows once per browser, so after each rehearsal either open a fresh private window, or run `localStorage.removeItem("redshift-intro-v1")` in the browser console. It opens by itself only on the bare address `http://localhost:4173/`: a link that carries a view (such as `/?o2=21&p=14.7`) opens on that view instead.
4. Rehearse the path below twice, timing each beat. If any screen fails, Redshift shows its error screen with **Reload the page**; the address bar keeps the view, so a reload returns to the same point.

## The path

The numbers are the ones the screen shows from the current build (`web/public/data`). Say only numbers that are on screen; if the dataset is rebuilt, check them again here.

| Time | Do | On screen | Say |
| --- | --- | --- | --- |
| 0 to 6 s | Open `http://localhost:4173/`. Beat 1 of the intro plays. | A bare plot, with no land or sea yet (oxygen across, cabin pressure up); four candidate atmospheres appear as pins and pulse (the spacesuit's 4.3 psi / 100% sits outside the habitat range shown). The card: "NASA has not chosen the Moon-base atmosphere." | "NASA has not chosen the air for a Moon base. Each pin is an atmosphere on the table." |
| 6 to 12 s | Press the right arrow (or click the plane, or scroll). | Beat 2: the land rises with the hatched sea around it, and the tests fade in, one fuel class after another. "These are the fire tests PSI lets us place in this range." The plane shows the habitat range (15 to 45% O2, 6 to 17 psi); some placed tests lie outside it. | "Here are the microgravity fire tests NASA's own tables let us place in this range: each mark is one or more tests at one recorded oxygen and pressure. Land is where tests sit near; the hatched sea is unknown, not safe." |
| 12 to 16 s | Press the right arrow again. | Beat 3: the land sinks to the solid land left by NASA's papers alone (the outlined marks). The card: "Of 263 solid-fuel burn rows, 129 record oxygen, 0 record pressure and 0 sit near a habitat candidate as downloadable rows. The solid land left comes only from NASA's papers: 8 burns near a candidate, 0 downloadable as rows." | "Now only solid materials. PSI's tables hold 263 solid-fuel burn rows. 129 record the oxygen. None records the pressure. The only solid land left on the map comes from NASA's own papers: 8 burns near these candidates, and not one is downloadable." |
| 16 to 20 s | Press the right arrow. | Beat 4: "NASA did burn solids here, in papers." The outlined squares are the Saffire burns from NASA's papers: 8 near a candidate, 0 downloadable as rows. | "NASA did burn solid materials near these atmospheres, in the Saffire experiments. It is all in papers: none of it can be downloaded." |
| 20 to 23 s | Press the right arrow, then click the 263 in the card; Escape closes its card. | Beat 5: "Every number shows its source." and how to use the plane: drag the probe, S for solids, ask a question, take a brief or a data request. | "Every number on screen opens its source: the file and row, or the paper, page and quote." |
| 23 to 27 s | Click **Explore**. (If you stepped the beats with the arrow keys, Enter works too: focus stays on the button. A click on the plane takes focus off it, so after a click, click Explore.) | The plane is yours at 8.2 psi / 34% O2 with Solids only on; the probe sits on the pin and the panel reads "40 tests sit near this point. Solid material: 0 from PSI tables, 3 from verified papers." Gas flame 20, droplet 17, solid material 0 from PSI tables plus 3 from verified papers. | "At 8.2 psi and 34 percent oxygen, an atmosphere NASA has named, 40 tests sit nearby. Three are solid burns, and all three exist only in NASA's papers, not in its tables." |
| 27 to 30 s | Scroll the panel down to **Ask the evidence** and click the question chip "If NASA has already burned fabric in near-Moon-base air, why can't a researcher download it?" | The checked answer, with its citations, every number a button to its source, and its label "AI-assisted, awaiting human check". | "So we ask NASA: if you have already burned fabric in near-Moon-base air, why can't a researcher download it?" |

**Subtitles and the close.** For the recorded video, `docs/redesign/video-subtitles.srt` carries the English captions timed to this path. In the last beat, instead of the Ask chip, you may click **Ask NASA for the data** at the foot of the panel's What's missing: the data request page closes the story with the concrete ask.

## If something does not go to plan

| Problem | Recovery |
| --- | --- |
| The intro does not open | This browser has seen it, or the address carries a view. Press Ctrl+K, type "replay the intro" and press Enter: it plays over the plane from beat 1. |
| **Skip intro** or Escape was pressed by mistake | The same: Ctrl+K, "replay the intro". Skip leaves the view as it was. |
| A beat was skipped | Press the left arrow (or **Back**): every beat can be revisited before **Explore**. |
| On a phone, the card hides part of the panel | Expected: below 1024 px the intro's card sits at the bottom of the screen, over the dimmed evidence sheet, so the whole plot shows. The sheet comes back at Explore. |
| The probe is not on the 8.2 psi / 34% pin after Explore | Press 4 (the shortcut for the fourth candidate), or open the Candidates tool in the plane's toolbar and pick **8.2 psi / 34% O2**. |
| A screen shows the error screen | Click **Reload the page**. The view is in the address bar, so it comes back where it was. |

## What not to say

- Never call an atmosphere safe, dangerous, better or best. Redshift informs a decision; it does not rank or recommend an atmosphere.
- Never call an empty area safe. Empty means unknown.
- "Inland", "on the coast" and "at sea" describe the recorded evidence near a pin, never its fire risk.
- Do not call the Ask answer human-checked until a team member signs it off (`docs/OPEN_QUESTIONS.md`, Q18); its label on screen says which it is.
- Flame temperature explains, it does not predict. If asked about the isotherms, say so.

## If a judge asks for more (after the 30 seconds)

- Click any count or measured value in the intro's card, the panel, a glyph's count badge, compare, the brief or the access gap chart: its provenance card opens with the file, line and raw text, or the paper, page and quote. Not every number is a button: axis ticks, isotherm labels ("2,600 K" names a contour's level), the probe's own coordinates and the step size stops are plain text, so do not invite a click on those.
- **G** (or **Access gap chart** in the panel) opens the access gap step by step.
- **Brief** in the panel's action bar opens a one-page cited brief that prints to PDF and downloads the nearby tests as CSV and the sources as BibTeX.
- 63 findings from published papers are waiting for a team member to verify them against the source; none is shown as data until then.
