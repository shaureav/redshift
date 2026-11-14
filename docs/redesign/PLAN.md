# Plan: plane-first redesign

Chosen on 2026-11-14: docked evidence panel; cached answers plus a live `/ask` endpoint; step slider with the three documented multipliers (0.75x, 1x, 1.5x). The audit behind this plan is `docs/REDESIGN_AUDIT.md`.

## Backend
1. `redshift/science/probe.py`: nearness counts on a dense grid (O2 15 to 100% in 0.5 point steps, pressure 3.0 to 17.0 psi in 0.1 psi steps), per fuel class and source type, for each documented multiplier. Run-length encoded. Also "O2 matches, pressure not recorded" per O2 column, and the nearness inputs (one entry per placed test, with provenance) so the client can list which tests are near.
2. Build writes `probe_grid.json`; the provenance lint covers it.
3. Tests: grid counts at every candidate equal `candidate_evidence.json` and `sensitivity.json`; a sample of grid nodes equals `nearness.evaluate`; determinism.
4. API: typed `GET /probe?o2=&p=&m=` (snaps to the grid, returns the panel payload with provenance and the near test ids); `POST /ask` (retrieval over the dataset, Claude when a key is set, deterministic post-check).

## Frontend
1. Tokens: IBM Plex Sans (tabular figures) plus IBM Plex Mono; type scale 12/14/16/20/28/40; 8 px spacing; two radii; dark navy default, light theme; one accent.
2. `/` is the plane: full screen, draggable probe (pointer, arrows, Shift snaps to candidates), hover previews, click pins, brush selects. Docked evidence panel updates live from the grid. Layers animate; "solids only" makes the gap the headline.
3. Panel: point headline, fuel class rows (colour and shape, hatched zeros), step scrubber, flame temperature (nearest computed point, never interpolated), prebreathe (published and verified only), access gap, deep links, Ask the evidence.
4. Command palette (Cmd+K), three-step first-visit tour, redesigned provenance popover.
5. `/compare` (two to four atmospheres side by side), `/brief` (one page, print to PDF, CSV, BibTeX), share link holding the exact view.
6. Secondary navigation: Investigations, Evidence Explorer, Test Planner, Data Quality, Methods, About.
7. Every chart gets a takeaway headline computed from the data, with a neutral fallback if the data stops supporting it.
8. Tests: TypeScript nearness parity against the grid at every node; snapshot tests of the panel, brief and compare views.

## Verify
`make check` equivalents, grep for em dashes and red, contrast check, Lighthouse, after screenshots at 1440 px and phone, demo click path.
