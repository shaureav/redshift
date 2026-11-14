# The 30-second demo

The click path a presenter runs in front of judges, with what to say at each beat. It must run without a hesitation, rehearsed twice in a row on the production build (`EXCEPTIONAL_PLAN.md`, section 3).

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
| 0 to 6 s | Open `http://localhost:4173/`. Beat 1 of the intro plays. | An empty, hatched plane (oxygen across, cabin pressure up); the candidate atmospheres appear as pins and pulse. The card: "NASA has not chosen the Moon-base atmosphere." | "NASA has not chosen the air for a Moon base. Each pin is an atmosphere on the table." |
| 6 to 12 s | Press the right arrow (or click the plane, or scroll). | Beat 2: the land rises and the tests fade in, one fuel class after another. "These are the fire tests PSI lets us place." | "Here is every microgravity fire test NASA's own tables let us place. Land is where tests sit near; the hatched sea is unknown, not safe." |
| 12 to 18 s | Press the right arrow again. | Beat 3: the land sinks, every pin reads "at sea", and the plane says "No solid-material test can be placed on this plane". The card: 263 solid-fuel burn rows, 129 record oxygen, 0 record pressure, 0 near a habitat candidate can be downloaded. | "Now only solid materials. PSI's tables hold 263 solid-fuel burn rows. 129 record the oxygen. None records the pressure, so none can be placed." |
| 18 to 23 s | Click **Explore** (or press Enter: focus is already on it). | The plane is yours at 8.2 psi / 34% O2 with Solids only on; the probe sits on the pin and the panel reads "37 tests sit near this point. None is a solid material." Gas flame 20, droplet 17, solid material 0 (hatched, "no tests recorded"). | "At 8.2 psi and 34 percent oxygen, an atmosphere NASA has named, 37 tests sit nearby. Not one is a solid material." |
| 23 to 30 s | Scroll the panel down to **Ask the evidence** and click the question chip "If NASA has already burned fabric in near-Moon-base air, why can't a researcher download it?" | The checked answer, with its citations, every number a button to its source, and its label "AI-assisted, awaiting human check". | "So we ask NASA: if you have already burned fabric in near-Moon-base air, why can't a researcher download it?" |

## If something does not go to plan

| Problem | Recovery |
| --- | --- |
| The intro does not open | This browser has seen it, or the address carries a view. Press Ctrl+K, type "replay the intro" and press Enter: it plays over the plane from beat 1. |
| **Skip intro** or Escape was pressed by mistake | The same: Ctrl+K, "replay the intro". Skip leaves the view as it was. |
| A beat was skipped | Press the left arrow (or **Back**): every beat can be revisited before **Explore**. |
| The probe is not on the 8.2 psi / 34% pin after Explore | Press 4 (the shortcut for the fourth candidate), or open the Candidates tool in the plane's toolbar and pick **8.2 psi / 34% O2**. |
| A screen shows the error screen | Click **Reload the page**. The view is in the address bar, so it comes back where it was. |

## What not to say

- Never call an atmosphere safe, dangerous, better or best. Redshift informs a decision; it does not rank or recommend an atmosphere.
- Never call an empty area safe. Empty means unknown.
- "Inland", "on the coast" and "at sea" describe the recorded evidence near a pin, never its fire risk.
- Do not call the Ask answer human-checked until a team member signs it off (`docs/OPEN_QUESTIONS.md`, Q18); its label on screen says which it is.
- Flame temperature explains, it does not predict. If asked about the isotherms, say so.

## If a judge asks for more (after the 30 seconds)

- Click any number, in the intro's card or anywhere else: its provenance card opens with the file, line and raw text, or the paper, page and quote.
- **G** (or **Access gap chart** in the panel) opens the access gap step by step.
- **Cited brief** in the panel opens a one-page brief that prints to PDF and downloads the nearby tests as CSV and the sources as BibTeX.
- 63 findings from published papers are waiting for a team member to verify them against the source; none is shown as data until then.
