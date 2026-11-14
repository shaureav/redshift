# Project Redshift — PSI combustion investigations

Pulled 2026-11-14 from NASA Physical Sciences Informatics (psi.nasa.gov) via the same JSON endpoints the PSI site uses. 19 microgravity combustion investigations, one folder per acronym.

Each folder has:
- `<ACRONYM>.md` — full page content: overview, DOI, objectives, approach, hypothesis, impacts, contacts, hardware, data-file folder summary (Raw/Analyzed, reduced vs Earth gravity, counts and sizes), and publications with DOIs
- `experiment_table/` — the Experiment Table file(s) exactly as PSI serves them
- `publications.csv` — title, authors, DOI
- `representative_image.*` — one image for the card (where one exists)

Top level: `index.csv` (one row per investigation), `publications_all.csv` (325 publications, 264 with DOIs).

## Image provenance

- Official PSI representative image: ACME CFI-G, ACME/Flame Design, ACME E-FIELD Flames, BASS-II, DAFT/DAFT-2.
- Still frame pulled from a flight video (not an official PSI image): CFI, SAME, SAME-R, SPICE, SLICE, ACME CLD Flame, ACME BRE, ACME s-Flame, BASS, FLEX.
- Weak — replace manually: ACME CLD Flame (dark frame), FLEX-2 (only stills are event-log screenshots), SLICE (grayscale camera frame).
- None available: SAFFIRE-I, SAFFIRE-II, SAFFIRE-III (their images and video sit only inside zipped raw data).

## Not included

- Raw video and image data (skipped by design).
- The 5 ground/modeling investigations returned by a "combustion" search (PSI-60, 62, 115, 117, 142), plus PSI-181 (materials) and PSI-108 (fluids).

Cite every dataset by its DOI (see index.csv).
