# REDSHIFT: THE ATMOSPHERE TRADE STUDIO
## Master build brief for Claude Code

You are the sole engineer on Project Redshift, a NASA Space Apps Challenge 2026 entry for the challenge "Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data". I am Reyansh, lead of a four-person team. None of us can code. You write all code; we own the idea and must be able to explain every part of it to a NASA judge. The official rules require AI-written code, data and text to be disclosed, and the idea must be ours.

The goal is not a hackathon demo. The goal is a tool a NASA habitat engineer or combustion researcher could open on Monday and trust, that could be cited in a paper, and that wins on every judging criterion. **Data integrity is the cornerstone of this software. If a single number in the app is wrong, untraceable, or silently altered, the project has failed, however good it looks.** The backend (data pipeline, validation, provenance, API) is the main engineering effort. The frontend must still be excellent, because judges see the frontend first.

Read this whole brief before doing anything. Then read, in order: `CLAUDE.md`, `docs/Redshift_Idea_Review_and_Refined_Concept.pdf` (the newest idea; it overrides older documents wherever they disagree), `docs/KNOWLEDGE.md`, `docs/PSI_CATALOGUE.md`, then inspect `data/raw/` and `analysis/`. Then do Stage 0 and stop.

---

## PART A. WHAT WE ARE BUILDING AND WHY

### A1. The problem
NASA has not yet chosen the atmosphere for lunar surface habitats and pressurised rovers. Candidates named in NASA exploration-atmosphere documents include 14.7 psi / 21% O2 (Earth and ISS reference), 10.2 psi / 26.5% O2, and 8.2 psi / 34% O2 (recommended by NASA's Exploration Atmospheres Working Group as a compromise between prebreathe time, hypoxia and flammability, assuming a 4.3 psi suit). The spacesuit itself runs at about 4.3 psi / 100% O2. Lower pressure and higher oxygen shorten the oxygen prebreathe a crew member needs before a spacewalk (NASA figures: about 6:30 to 7:00 h at 14.7 psi / 21%, about 0:00 to 0:30 at 8.2 psi / 34%), but raise flame temperature and change how fires behave. Fire management work for these habitats is still forward work.

### A2. The insight (verify every number before it reaches the UI or pitch)
- NASA's Physical Sciences Informatics (PSI) system holds public experiment tables for its microgravity combustion investigations: roughly 2,000 test rows.
- Among those rows, gas and droplet tests exist near the lower-pressure candidates (FLEX ran many droplet tests near 10.4 psi), but **no solid fabric or plastic burn in the PSI tables sits near any candidate habitat atmosphere.** Every solid-material test in the PSI tables is near 1 atm and roughly 13.6 to 22.2% O2.
- NASA *did* burn solid materials near these atmospheres in the Saffire flight experiments (the review reports Saffire V at about 26% O2 and 10.4 psi, and Saffire VI at about 29 to 31% O2 and 54 to 55 kPa, about 8 psi), but those results live in conference papers (NTRS 20210011521, ICES 2021; NTRS 20240002981, ICES 2024), not in downloadable PSI tables.
- ACME BRE, the PSI experiment designed around exactly these atmospheres (its objectives name 14.7/21, 10.2/26.5 and 8.2/34), does not record chamber pressure in its summary table.
- So the finding is an **access gap**: the burns that matter most exist, but a researcher cannot download them or place them on a map. The question we put to judges: *"If NASA has already burned fabric in near-Moon-base air, why can't a researcher download it?"*

These claims came from earlier analysis and a review. **None may appear in the app or pitch until the pipeline reproduces it from raw files or you have opened the cited paper and recorded an exact quote and page number.** If any claim fails verification, tell me immediately with the evidence. Do not soften it into something vaguer and carry on.

### A3. The product
One web application with four tabs and a data backend:
1. **Trade Map (hero):** oxygen percent against cabin pressure. Every candidate atmosphere pinned. Layers for prebreathe, flame temperature, test evidence (split by fuel class and by source type), and blind spots. Unknown is hatched, never shown as safe.
2. **Dossiers:** one page per candidate atmosphere and per material, answering "what do we actually know about fire here, and what is missing?"
3. **Test Planner:** ranks untested combinations of atmosphere and material class by how much a test would add.
4. **Investigations:** cards for every PSI combustion investigation, plus a compare view of 2 to 4 investigations, answering the challenge's request to "summarise, rank and interpret" investigations.
Plus an **Evidence Explorer** (a full, filterable table of every test with its provenance) and a **Data Quality** page (the public quality report rendered in-app). Both are reachable from every screen.

### A4. Who it is for
Primary user: a habitat atmosphere engineer preparing a trade study. Secondary: materials and flammability engineers, fire detection and suppression designers, microgravity experiment planners, researchers and students who need clean data. Design every screen so the primary user can go from "which atmosphere?" to "what evidence exists, what is missing, what should be tested?" in under two minutes, and export what they found with citations.

### A5. Principles that define the product (never violate)
1. **A plane, not a score.** No single risk number, no ranking of atmospheres, no "safe" or "unsafe", no recommendation. Show trade-offs side by side.
2. **Empty means unknown.** Absence of tests is drawn with hatching and labelled "no tests", never coloured as low risk.
3. **Evidence is always split** by fuel class (gas, droplet, solid, emulator) and by source type (PSI table, published paper not in PSI, derived calculation). Counts never merge these silently.
4. **Flame temperature explains; it does not predict.** In our FLEX analysis it separated outcomes no better than O2 fraction alone. Every place it appears says so. The 4.3 psi / 100% O2 value is shown as approximate because it depends strongly on how dissociation is modelled.
5. **Outcome labels are verbatim.** FLEX's "Disruption" is not defined on its PSI page. Show the recorded label and a definition only if one is found in a source with quote and page.
6. **Never recommend an atmosphere.** The tool informs a decision; it does not make it.

---

## PART B. JUDGING: WHAT WINS AND HOW EACH FEATURE EARNS IT

The official Space Apps Judging and Awards Guide (https://www.spaceappschallenge.org/resources/judging-awards-guide/) applies five criteria at Local, Global and Executive judging, with no published weighting, and asks judges to give Presentation equal attention:

| Criterion | What judges ask | How Redshift must score highest |
| --- | --- | --- |
| **Influence** | How much positive impact, in quality and quantity; big or small problem; helps or inspires many or few? | Ties microgravity fire data to a live, consequential NASA decision (Moon-base atmosphere) that affects every future lunar crew. Open data, open code, reusable cleaned dataset, so researchers worldwide benefit beyond the event. The access-gap finding is actionable for NASA itself. |
| **Creativity** | Novel, or incremental? | Reframes a data archive as a trade study on a decision plane. Nobody else will put prebreathe, flame temperature and evidence density on one map, or measure the gap between "tested" and "downloadable". |
| **Validity** | Scientifically sound; does what it says; works in the real world? | Reproducible pipeline from raw PSI files, provenance on every number, public quality report, unit-tested calculations, honest limits shown in the UI, no prediction claims, human-verified paper findings with quotes and page numbers. |
| **Relevance** | Responds to the challenge; completeness; technical feasibility; usability? | Uses the challenge's own data (PSI), summarises, ranks and interprets investigations (Investigations tab), uses SI meaningfully (three grounded AI jobs), fully working deployed app, usable without training. |
| **Presentation** | How well the challenge, solution and why it matters were communicated | A 30 second demo that tells one story (map, click 8.2 psi / 34%, see the gap, see why), a striking hero graphic, a clear README, a methods page a scientist respects. |

Target Global Awards: **Best Use of Data** (makes space data more accessible or applies it in a unique way: this is literally our finding and our product), **Best Use of Science** (most valid use of the scientific method), and **Best Mission Concept** (most plausible concept and design). Every feature you build should strengthen at least one of these. When you face a trade-off, choose the option that increases Validity and data trust.

Eligibility essentials you must help me meet: official challenge only; all submission fields in English; every external resource listed in the References field; original work confirmed; video demo with English subtitles; submitted by the deadline.

---

## PART C. DATA INTEGRITY: THE CORNERSTONE

This section is the most important in the brief. Build the backend so that it is impossible for an untraceable, altered or invented number to reach the screen.

### C1. Non-negotiable integrity rules
1. **Raw is immutable.** Files in `data/raw/` are never edited. Record a SHA-256 hash of every raw file in `data/raw/MANIFEST.json` (file, size, hash, source URL, retrieval timestamp, licence). The pipeline verifies every hash on every run and fails loudly on any mismatch.
2. **Every value carries provenance.** Each cleaned value knows: source type (`psi_table`, `published_paper`, `derived`), investigation ID, file, row number, original column name, original raw string, transformation applied (if any), and DOI or NTRS ID. Derived values (flame temperature, nearness counts) carry the method name, version, parameters and inputs.
3. **No silent transformation.** Every change from raw to clean is one of a fixed, named, tested set of transforms (unit conversion, whitespace trim, exact-duplicate removal, explicit null for an empty cell). Anything else is a **flag**, not a fix: the raw value is kept, the cleaned value is null or unchanged, and the issue goes into the quality report. You may never "correct" a value based on what you think it should be.
4. **No invented data.** A missing value is null and displays as "not recorded". Never interpolate, impute, guess or fill from memory or from another investigation. Never let an AI model write a data value.
5. **Paper-derived values are quarantined until verified.** Values taken from papers (Saffire IV to VI, BRE pressures, key findings) carry `verified: false` until a named team member confirms them against the exact quote and page. The UI shows only verified values, labelled "from published paper, human verified", and visually distinct from PSI-table values.
6. **Counts are reproducible.** Every count shown in the UI is produced by a pipeline function with a test. Nothing is hard-coded in the frontend.
7. **The build fails rather than ship bad data.** If schema validation, hash checks, reconciliation checks, golden tests or provenance coverage fail, `python -m redshift.build` exits non-zero and the frontend build refuses to run.
8. **The frontend cannot display a number without a source.** Every numeric value the UI renders comes from the API with a provenance reference. A shared `<Value>` / `<Cite>` component renders the number and a source popover. A lint test scans built data payloads and fails if any numeric field lacks provenance.
9. **Versioned dataset.** Each build writes a dataset version (date plus content hash). The UI footer shows it, every export includes it, and the README explains how to cite it.

### C2. Known data problems to detect, verify and flag
Confirm each against raw files; there will be others. For each, record investigation, file, row(s), raw value, what is wrong, action taken, and why.
- **Count discrepancy (resolve first).** My original harvest: 24 combustion investigations, 22 experiment tables, 2,009 data rows. The review harvest: 19 investigations, 21 table files, 2,001 data rows. Reconcile from raw files and report exactly which investigations, tables and rows explain every difference (search scope, non-combustion records, duplicate table copies such as a FLEX table mislabelled FLEX-2, header or blank rows). Do not choose a number without showing the evidence.
- **ACME BRE:** O2 values such as "3400%" and "2100%" (apparent unit or decimal error: flag, do not "fix"); about 194 flames at 21 to 40% O2; **no pressure column** (notes say chamber pressures varied but are not identified in the summary table). Show as "material-emulator evidence, pressure not recorded" as a band on the O2 axis.
- **CLD Flame and s-Flame:** fill-down errors (for example "40% CH5...CH14", "N3...N6").
- **SAFFIRE-I:** length and width appear swapped; PSI metadata dates (2001 to 2008) and proposal title appear copied from SAME. Badge the investigation.
- **SAFFIRE-II:** "037 mm" value and blank material fields.
- **FLEX:** rows with pressure 0 mmHg.
- **SPICE:** negative airflow values; 34 duplicate rows. **E-FIELD:** 8 duplicates. **CFI:** 8 duplicates. Remove only byte-identical duplicates and list every removal; near-duplicates are flagged, not removed.
- **Flame Design (PSI-10):** "RAMPED" in numeric fields; no licence shown on PSI.
- **CFI-G inverse table:** about 1,015 lines but about 154 data rows. Explain the structure.
- **BASS and BASS-II:** BASS-II has 129 rows with O2 13.6 to 22.2%; the BASS table lacks O2 and pressure columns, so its conditions must come from its documents (quarantined until verified).
- **Licences:** most PSI data is CC0-1.0; record each investigation's licence; flag where none is shown. Citation is by DOI (PSI prefix 10.60555).

### C3. Golden checks (expected values to reproduce, not to trust)
Write each as a test that compares the pipeline result to the value below and **reports** the difference. A mismatch is a finding to explain to me, not something to tune away.
- FLEX, 30 to 34% O2, no suppressant, about 534 to 543 mmHg: 17 tests; outcomes 15 "Disruption", 2 "Completion", 0 "Extinction"; fuels 9 methanol, 8 heptane.
- FLEX CO2 suppression near 10.4 psi: 25% O2 + 15% CO2: 0 of 6 extinguished; 23 to 24% O2 + 20 to 25% CO2: 14 of 23; 21% O2 + 30% CO2: 4 of 6; 15 to 20% O2 + 35 to 50% CO2: 22 of 22 (review) versus 23 of 23 (earlier draft). Resolve.
- FLEX tests near 10.4 psi: 103 between 480 and 600 mmHg (review) versus 104 (draft). State the band used.
- Nearby tests per candidate (earlier draft, PSI only, before adding BRE or Saffire): 14.7/21: 432 (129 solid); 10.2/26.5: 72 (0 solid); 10.2/30: 52 (0 solid); 8.2/34: 37 (0 solid; 17 FLEX droplet, 20 CFI-G gas); 4.3/100: 0.
- Flame temperatures (Cantera, GRI-Mech 3.0, stoichiometric methane, 298.15 K, constant H and P): 2,224 K; 2,415 K; 2,505 K; 2,570 K; about 2,903 K for the five candidates above.

### C4. Validation layers
- **Schema:** define the canonical test schema with `pandera` (DataFrame) and `pydantic` (JSON outputs). Types, units, ranges (O2 0 to 100%, pressure greater than 0 and below 30 psi, flow at least 0) and allowed categories. Range violations become flags, not crashes, except where they indicate a pipeline bug.
- **Unit conversion:** single module, exact constants (1 atm = 101.325 kPa = 14.6959 psi; 1 mmHg = 0.133322 kPa), property-based tests with `hypothesis` for round trips.
- **Reconciliation:** row counts in = row counts out + removed duplicates + excluded rows, per table, asserted.
- **Cross-checks:** where two sources describe the same test (PSI metadata vs table vs paper), compare and flag disagreements.
- **Provenance coverage:** 100% of displayed numeric values must have provenance. Report the percentage; anything below 100% fails the build.
- **Determinism:** two consecutive builds produce byte-identical outputs (sort keys, fixed float formatting).
- **Snapshot tests:** the API responses for the five candidate atmospheres and the demo screens are snapshot-tested so any accidental change is caught.

### C5. Integrity visible in the UI
- Every number has a hover or tap popover: value, unit, source type, investigation, file, row, raw value, transform, DOI link, and verification status.
- Flags appear as small badges on affected rows, investigations and dossiers, linking to the exact quality-report entry.
- A visible legend for source types: PSI table (solid marker), published paper human-verified (outlined marker), derived calculation (italic label), unknown (hatched).
- A "Data Quality" page: summary counts, every flag searchable and filterable, download as CSV.
- A "How this was computed" panel on every derived figure, showing formula, parameters and inputs.
- Dataset version and retrieval date in the footer and in every export.

---

## PART D. BACKEND ARCHITECTURE (MAIN ENGINEERING FOCUS)

### D1. Structure
Create a Python package `redshift/` (Python 3.11+, `uv` or `pip` with a lockfile):
```
redshift/
  ingest/        read raw PSI JSON and CSVs; verify MANIFEST hashes
  normalise/     per-investigation adapters mapping raw columns to the canonical schema
  units.py       all unit conversions
  transforms.py  the fixed, named set of allowed transforms
  flags.py       flag definitions (code, severity, description) and detection
  provenance.py  provenance model attached to every value
  papers/        paper-derived values (quarantined) and key findings
  science/
    flame_temperature.py   Cantera computations and contour grid
    nearness.py            nearness rule and per-candidate evidence
    planner.py             blind-spot grid and priority
    candidates.py          candidate atmospheres with sources
    prebreathe.py          only published points, with sources
  export/        writes processed outputs and the API snapshot
  api/           FastAPI app serving the processed data
  build.py       single entry point: python -m redshift.build
tests/           pytest, hypothesis, golden and snapshot tests
```
Each investigation gets its own small, explicit adapter in `normalise/`, because each PSI table has different columns. No clever generic guessing of column meanings: write the mapping out by hand and document it, so a scientist can audit it.

### D2. Outputs (`data/processed/`)
- `tests.parquet` and `tests.csv`: canonical one-row-per-test table. Columns include `test_id`, `investigation_id`, `investigation_name`, `source_type`, `table_file`, `source_row`, `doi`, `fuel_class` (gas, droplet, solid, emulator), `fuel`, `material`, `o2_pct`, `pressure_kpa`, `pressure_psi`, `diluent`, `co2_pct`, `flow_cm_s`, `gravity_level`, `outcome_label` (verbatim), `suppressant`, `verified`, `flags`, and a `raw` JSON column holding every original cell.
- `investigations.json`: ID, title, DOI, licence, version, objectives, hypothesis, fuels and samples, conditions and variables, sensors and hardware, publications with DOIs, data files, flags, and computed summary statistics (with provenance).
- `candidate_evidence.json`, `flame_temperature_grid.json`, `planner_grid.json`, `key_findings.json` (only fields that exist), `quality_report.json` and `quality_report.md`, `dataset_version.json`.
- A DuckDB file for fast ad-hoc queries by researchers.

### D3. Science modules
- **Flame temperature:** Cantera with GRI-Mech 3.0. Stoichiometric methane, 298.15 K initial, equilibrate at constant enthalpy and pressure. Helium (where present) modelled as argon, documented as an approximation. Compute the five candidates and a grid over O2 15 to 100% and 3 to 16 psi for contours. Record Cantera version and mechanism in provenance. Flag points where the model is less reliable (very high O2 and low pressure).
- **Nearness rule:** distance in three axes: O2 step 5 percentage points, pressure step a 25% change on a log scale (ln 1.25), flow step 10 cm/s; "near" is distance at most 1.5. Missing flow is handled explicitly (document the choice and show its effect). Tests with unknown pressure (BRE) are never counted as "near" on the plane; they are reported separately as "O2 matches, pressure unknown". Step sizes are parameters, exposed in the API and UI, and a sensitivity table shows how counts change at 0.75x, 1x and 1.5x the steps.
- **Planner:** grid of 7 O2 levels x 6 pressures x 3 material classes = 126 cells. Priority = habitat relevance x material weight x (1 minus n / (n + 5)), where n is nearby tests. Weights are explicit parameters with defaults documented as judgement. Return the ranked list with the nearest existing tests per cell.
- **Prebreathe:** only NASA's published points, each with source. The 10.2 psi / 26.5% value is "no published figure found" until a team member supplies one with a source. No interpolation.

### D4. API
FastAPI with typed pydantic responses and an auto-generated OpenAPI schema (researchers can use it directly). Endpoints, at minimum: `/tests` (filterable, paginated), `/tests/{id}` (with full provenance), `/investigations`, `/investigations/{id}`, `/compare?ids=`, `/candidates`, `/candidates/{id}/dossier`, `/materials/{name}/dossier`, `/trade-map` (layers), `/planner` (with weight parameters), `/quality`, `/version`, `/export/{kind}`. Generate TypeScript types from the OpenAPI schema so the frontend and backend cannot drift.

**Reliability for judging:** the build also writes a complete static JSON snapshot of every endpoint the demo needs. The frontend uses the live API when available and falls back to the snapshot automatically, so the deployed demo never breaks. Deploy the API as a Vercel Python function (or another free host if Vercel's Python runtime is unsuitable; tell me why).

### D5. AI layer (three grounded jobs; the "SI-powered" part of the challenge)
All model calls go through one server-side function. The API key lives in an environment variable on the host; never in the repo, never in client code, never pasted into chat. Tell me the variable name and where to set it.
1. **Read the papers into findings.** A script reads PDFs I place in `data/papers/` (Final Reports and key papers for BASS, BASS-II, SAFFIRE-I to III, SAME, SAME-R, FLEX, FLEX-2, ACME BRE, and the Saffire IV to VI papers). It drafts `key_findings.json` entries: finding text, **exact verbatim quote**, page number, source DOI or NTRS ID, investigation, and `verified: false`. A deterministic check confirms the quote string actually exists in the extracted PDF text on that page; if not, the finding is rejected automatically. Build `verify_findings.py`, a simple command-line tool where a team member reads each quote and marks it verified with their name and timestamp. Only verified findings reach the UI.
2. **Write summaries.** Dossier and investigation summaries generated only from the structured data passed in. A deterministic post-check extracts every number and citation from the generated text and rejects the summary if any is not present in the input data. Summaries for the five candidates and the demo screens are pre-generated, checked by a human, cached and snapshot-tested.
3. **Answer questions.** A question box answering only from the verified dataset via retrieval over tests, investigations and verified findings. Every claim cites a test row or DOI; every answer ends with what the data does not cover; it says "PSI does not cover this" when true; it refuses to recommend an atmosphere. The same post-check applies. Cache the demo questions. If the API or key is unavailable, the box shows cached answers and says so.
Show "AI-assisted, human-checked" labels wherever AI text appears, and disclose AI use in the footer and README.

### D6. Testing and quality
- `pytest` with unit, property-based (`hypothesis`), golden (Part C3), reconciliation, snapshot and provenance-coverage tests. Target: every science function and every adapter tested.
- `ruff` and `mypy --strict` on the backend; `tsc --noEmit` and ESLint on the frontend.
- A `make check` (or `just check`) that runs everything. GitHub Actions runs it on every push and fails the build on any failure.
- Never claim a check passed without running it and showing me the output.

---

## PART E. FRONTEND AND GRAPHICS

The frontend is how judges meet the science. It must look like a serious scientific instrument: calm, precise, information-dense where it helps, and beautiful. If skills for data visualisation or frontend design are available in this environment, read them before building charts or layout.

### E1. Stack
React + TypeScript + Vite, Tailwind, D3 for the bespoke trade map and custom charts (Plotly or Observable Plot acceptable for simple ones), TanStack Query for data, TanStack Table for the Evidence Explorer, React Router for tabs with shareable URLs (every view state, including selected candidate, layers and filters, is in the URL so a researcher can share a link).

### E2. Visual system
- **Palette:** no red anywhere. Dark navy background option and a light option; accents in teal, amber, slate blue, violet. Fuel classes: gas, droplet, solid, emulator each a distinct colour that remains distinguishable under the common colour-blindness types (check with a simulator) and also differ in marker shape. Source types differ by fill: PSI table solid, verified paper outlined, derived italic label, unknown diagonal hatch.
- **Type:** one clean sans for UI, a tabular-figures font for numbers, a monospace for IDs and DOIs.
- **Units:** pressure shown as psi with kPa beside it (both everywhere), O2 as percent, temperatures in K.
- **Motion:** subtle transitions when layers toggle; respects reduced-motion settings.
- **Accessibility:** WCAG AA contrast, keyboard navigation for every control including the map, ARIA labels on charts, text alternatives (each chart has a "view as table" toggle).
- **Responsive:** excellent at 1280 to 1920 px (judging), usable on a phone.
- No NASA logos or insignia anywhere.

### E3. Signature graphics (build these well; they carry the Presentation score)
1. **The Trade Map (hero).** O2 percent (x) against pressure (y, psi with kPa on a secondary axis). Layers:
   - flame temperature contours with labelled isotherms ("explains, does not predict" in the legend);
   - prebreathe points with labels and sources (no fake gradient);
   - test evidence as glyphs coloured and shaped by fuel class, sized or binned by count, with PSI-table and verified-paper evidence visually distinct;
   - BRE as a translucent band along the O2 axis labelled "pressure not recorded";
   - candidate markers with labelled halos;
   - blind-spot cells hatched with priority shading;
   - a "solids only" toggle that makes the gap visually obvious.
   Hover shows the nearest tests; click opens the dossier. Include zoom presets (all, habitat range, suit corner).
2. **The Access Gap chart.** A funnel or stepped bar for solid-material burns near the candidates: "burned by NASA" → "described in papers" → "in PSI tables" → "with pressure recorded" → "downloadable as rows". Every step's count is computed and cited. This is the single image that tells our story; make it striking and honest.
3. **Evidence strips per candidate:** small multiples, one per candidate, showing gas, droplet, solid and emulator counts side by side with hatched zeros.
4. **FLEX suppression chart:** extinguished versus total for each O2 and CO2 group at about 10.4 psi, with exact fractions labelled, verbatim outcome labels, and an annotation that 35% CO2 or more is far beyond a breathable cabin.
5. **Investigation timeline:** every combustion investigation on a time axis, coloured by fuel class, showing which have data tables and which do not.
6. **Coverage matrix:** investigations (rows) against conditions and measured variables (columns), filled or hatched, so researchers see what each investigation measured.
7. **Compare view:** 2 to 4 investigations in aligned columns (objectives, fuels, conditions ranges as small range bars, variables, sensors, publications, flags).
8. **Planner heat map:** the 126-cell grid on the O2 and pressure plane, one panel per material class, with the ranked list beside it and live weight sliders.
9. **Material dossier mini-map:** where that material has been tested on the plane, and where the candidates sit.

### E4. Screens
- **Landing (doubles as the demo's first frame):** the trade map at full width with the 8.2 psi / 34% marker highlighted and a one-line statement of the access gap, citing its sources.
- **Trade Map**, **Dossiers**, **Test Planner**, **Investigations** (cards and compare), **Evidence Explorer** (every test, every column, filter, sort, search, provenance drawer, CSV export of the filtered set with citations), **Data Quality**, **Methods** (plain-English and technical explanations of every calculation, with equations), **About** (team, AI disclosure, licences, how to cite, dataset version).
- **Exports:** dossier PDF (no red), CSV, BibTeX for all cited DOIs, PNG and SVG of any chart with its caption and sources embedded.

### E5. Copy and tone
Plain, precise, never alarmist. Every claim on screen is supported by a cited number. Use "no tests recorded" rather than "dangerous" or "unsafe". British English. No em dashes anywhere in UI text, code comments or docs.

---

## PART F. STAGES, GATES AND SCHEDULE

Deadline: **Sunday 15 November 2026, 23:59 local time of our Local Event** (we are in India, IST; the team is confirming with the Local Lead). Submit by **Sunday 21:00**. Feature freeze **Sunday 18:00**. It is now Saturday afternoon. Plan accordingly and tell me early if the scope does not fit.

At every **STOP**: summarise in plain English, show evidence (test output, counts, screenshots), list uncertainties and anything my team must verify, commit, then wait for me.

**Stage 0: Orientation (no code, about 20 minutes).** Report in under 500 words: your understanding of the product; the five biggest risks to data integrity and to winning; your plan for the count discrepancy; what you need from me. Set up the repo: `git init`, `.gitignore`, MIT licence for code (data keeps source licences), README stub, `docs/OPEN_QUESTIONS.md`, `docs/DECISIONS.md` (short log of every significant decision and why). Ask which GitHub repository to push to. **STOP.**

**Stage 1: Ingest, manifest and reconciliation.** MANIFEST with hashes; adapters for every table; reconciliation of investigations, tables and rows with a written explanation of the 24/22/2,009 versus 19/21/2,001 discrepancy. **STOP** and show the reconciliation.

**Stage 2: Canonical dataset, flags and quality report.** Schema validation, transforms, flags, `tests.parquet`, `investigations.json`, `quality_report.md`, golden checks with differences reported, determinism check. **STOP** and show the top 20 flags, golden-check results and test output.

**Stage 3: Science modules and API.** Flame temperature (with grid), nearness with sensitivity table, planner, prebreathe, candidate evidence; FastAPI with OpenAPI; static snapshot; generated TypeScript types; provenance-coverage report at 100%. **STOP** and show the candidate evidence table and sensitivity table.

**Stage 4: Trade Map and Access Gap chart.** The hero screen and the story graphic, fully wired to the API with provenance popovers. **STOP** with the local URL and a click-through list.

**Stage 5: Dossiers, Investigations (cards and compare), Evidence Explorer, Data Quality page.** **STOP** for review.

**Stage 6: AI layer.** Paper reading with quote verification, `verify_findings.py`, summaries with post-check, Q&A with citations and caching. **STOP** and show three example outputs and their checks. (This stage depends on me placing PDFs in `data/papers/`; tell me exactly which files you need as early as Stage 0.)

**Stage 7: Planner and remaining graphics** (timeline, coverage matrix, planner heat map).

**Stage 8: Ship.** Deploy frontend and API; I do any sign-ins myself (never enter passwords or tokens). CI green. README (what it is, why it matters, how to rebuild every figure from raw files, data sources and licences, how to cite, limitations, AI disclosure). `docs/METHODS.md`. `docs/REFERENCES.md` listing every external resource (needed for the submission's References field). Final checks: loads signed out on phone and laptop; every displayed number traceable; no red; no em dashes (grep for them); no NASA logos; no console errors; Lighthouse accessibility 95+; every DOI link resolves.

**Stage 9: Submission support.** Draft, for us to rewrite in our own words: the 30 second demo script with English subtitles (story: the decision NASA faces, the map, click 8.2 psi / 34%, the gap appears, the access-gap chart, the question to NASA, the link), a 7-slide backup outline, the project description mapped to the five criteria, and the AI disclosure text. The video is screen capture only (no faces, as some team members are under 18).

Rough timing: Stages 0 to 2 Saturday afternoon and evening; Stage 3 Saturday night; Stages 4 and 5 Saturday night to Sunday morning; Stages 6 and 7 Sunday morning to midday; Stage 8 Sunday afternoon; Stage 9 alongside Stage 8; freeze 18:00.

**Cut order if behind** (cut from the top): planner facility filter; marker dragging; planner heat map (keep the ranked list); live Q&A (keep cached answers); investigation timeline; material detection section (keep the verified Saffire VI detection finding if verified). **Never cut:** data integrity rules, provenance popovers, quality report, Trade Map, Access Gap chart, candidate dossiers, Investigations tab with compare, Evidence Explorer, verified findings, Methods page.

---

## PART G. HOW TO WORK WITH ME

- Plain English, short updates. Maintain a task list and keep it current.
- Say what you are about to do in one sentence before any large step. Do not ask permission for routine work; do ask when a decision changes the product, the science, or the schedule.
- **Be direct about problems.** If a source contradicts this brief, a golden check fails, a claim cannot be verified, or the idea has a weakness, tell me immediately with evidence. Never quietly adjust a number to match an expectation.
- Keep `docs/OPEN_QUESTIONS.md` current. Already open: the definition of FLEX "Disruption"; the 10.2 psi / 26.5% prebreathe figure; BRE chamber pressures; the five physiology sources to verify (NTRS 20220009536, NTRS 20240003211, the 2022 JSC exploration atmospheres briefing, the AIAA habitat layout paper, the 2018 Aerospace Medicine paper); the Saffire V and VI conditions and the Saffire VI detection findings; the exact deadline.
- Commit at the end of every meaningful step with clear messages. **When I say "Box-Box", commit and push.** Never force-push, never rewrite published history.
- Explain each module in two or three plain sentences in `docs/EXPLAINER.md` as you build it, so my team can explain it to judges in their own words.
- Style everywhere: British English, metric (psi alongside kPa for pressure), no em dashes, no red.

Begin with Stage 0.
