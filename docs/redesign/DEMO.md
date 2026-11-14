# The 30-second demo

The click path a presenter runs in front of judges, with what to say at each beat. It must run without a hesitation, rehearsed twice in a row on the production build (`EXCEPTIONAL_PLAN.md`, section 3).

> **Update this file in Phase 5.** The story intro replaces the tour (decision D2). Once it lands, the demo starts from the intro's **Explore** button, which hands over to the plane at 8.2 psi / 34% with solids only on, and beats 1 to 3 below change.

## Before the judges arrive

1. Build and serve the production site from `web/`: `npm run build`, then `npm run preview` (serves `http://localhost:4173`). The build refuses to run if the data snapshot is missing or provenance coverage is below 100%.
2. Browser window at 1440 x 900, page zoom 100%, dark theme.
3. Dismiss the tour once beforehand with **Skip tour** (the browser remembers it). The tour also runs cleanly to the end now (Phase 0 fixed the step 3 crash), but it is not part of the 30 seconds.
4. Open `http://localhost:4173/?o2=21&p=14.7`. The probe starts on Earth sea-level air, so the drag in beat 2 has somewhere to go.
5. Rehearse the path below twice. If any screen fails, Redshift shows its error screen with **Reload the page**; the address bar keeps the view, so a reload returns to the same point.

## The path

The numbers are the ones the screen shows from the current build (`web/public/data`). Say only numbers that are on screen; if the dataset is rebuilt, check them again here.

| Time | Do | On screen | Say |
| --- | --- | --- | --- |
| 0 to 6 s | Land on the plane. Sweep a hand across it. | The plane: oxygen across, cabin pressure up, every placed test shaped and coloured by fuel class, the candidate habitat atmospheres pinned, hatched areas with no tests. | "NASA has not chosen the air for a Moon base. Here is every microgravity fire test NASA's own tables let us place." |
| 6 to 12 s | Drag the probe down and to the right, onto the **8.2 psi / 34%** pin. It snaps to the pin. | Panel: candidate atmosphere 34% O2, 8.2 psi (56.5 kPa). "37 tests sit near this point." | "Drag to 8.2 psi and 34 percent oxygen, an atmosphere NASA has named. 37 tests nearby." |
| 12 to 17 s | Point at the fuel-class rows; then switch on **Solids only**. | Gas flame 20, droplet 17, solid material 0 (hatched, "no tests recorded"). With Solids only, the plane empties ("No solid-material test can be placed on this plane") and the headline reads "No solid burn in PSI's tables records pressure." | "Not one is a solid material. Hatched means unknown, not safe." |
| 17 to 23 s | In the panel's **The access gap** section, click **Open the access gap chart**. | The chart, step by step: 263 solid-fuel burn rows in PSI tables, 129 with oxygen recorded, 0 with pressure recorded, 0 near a habitat candidate. | "NASA's tables hold 263 solid burns. 129 record the oxygen. None records the pressure, so none can be placed." |
| 23 to 30 s | Close the chart (Escape). In **Ask the evidence**, click the question chip "If NASA has already burned fabric in near-Moon-base air, why can't a researcher download it?" | The checked answer, with its citations, every number a button to its source, and its label "AI-assisted, awaiting human check". | "So we ask NASA: if you have already burned fabric in near-Moon-base air, why can't a researcher download it?" |

## If something does not go to plan

| Problem | Recovery |
| --- | --- |
| The drag misses the pin | Click the **8.2 psi / 34%** chip above the plane, or focus the plane and press Shift with an arrow key to jump between candidates. |
| The panel is scrolled away from the access gap section | Scroll the panel; the section sits under prebreathe. The command palette (Ctrl+K) also reaches every view. |
| The tour opens | Click **Skip tour**. It does not open again in this browser. |
| A screen shows the error screen | Click **Reload the page**. The view is in the address bar, so it comes back where it was. |

## What not to say

- Never call an atmosphere safe, dangerous, better or best. Redshift informs a decision; it does not rank or recommend an atmosphere.
- Never call an empty area safe. Empty means unknown.
- Do not call the Ask answer human-checked until a team member signs it off (`docs/OPEN_QUESTIONS.md`, Q18); its label on screen says which it is.
- Flame temperature explains, it does not predict. If asked about the isotherms, say so.

## If a judge asks for more (after the 30 seconds)

- Click any number: its provenance card opens with the file, line and raw text, or the paper, page and quote.
- **Cited brief** in the panel opens a one-page brief that prints to PDF and downloads the nearby tests as CSV and the sources as BibTeX.
- 63 findings from published papers are waiting for a team member to verify them against the source; none is shown as data until then.
