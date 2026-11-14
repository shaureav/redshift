# Redshift: The Atmosphere Trade Studio

A NASA Space Apps Challenge 2026 entry for **Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data**.

NASA has not yet chosen the cabin atmosphere for lunar surface habitats and pressurised rovers. Lower pressure with more oxygen shortens the oxygen prebreathe before a spacewalk, but it changes how materials burn. Redshift puts every microgravity fire test it can trace onto one map of oxygen against cabin pressure, pins the candidate atmospheres on it, and shows what is known about fire near each one and what is missing.

Redshift is a plane, not a score. It never ranks or scores an atmosphere, and it never tells anyone which one to choose. Where there are no tests it says "no tests recorded" and draws the area hatched.

## Why it matters: the access gap

The finding Redshift is built around is an **access gap**: the fire tests that matter most for a Moon base exist, but a researcher cannot download them as data or place them on a map.

- **The PSI tables hold solid-fuel burns, but none record pressure.** NASA's Physical Sciences Informatics (PSI) experiment tables contain 263 solid-fuel burn rows. 129 of them record oxygen; 0 record pressure; so 0 can be placed near a habitat candidate as downloadable rows. (Counts from `data/processed/access_gap.json`.)
- **Near the habitat candidates, the PSI tables hold only gas and droplet tests.** At 8.2 psi / 34% O2 the build finds 37 PSI-table tests nearby: 17 droplet (FLEX) and 20 gas (ACME CFI-G), and 0 solid. At 10.2 psi / 26.5% O2 it finds 72, all droplet. (From `data/processed/candidate_evidence.json`.)
- **NASA did burn solid materials near these atmospheres, in Saffire V and VI**, but the results are published in conference papers, not as table rows. The Saffire V paper (NTRS 20210011521, p. 3, Table 1) gives ambient pressures of 70.7, 71.3 and 72.6 kPa with 26.2, 25.4 and 25.7 mol % oxygen. The Saffire VI paper (NTRS 20240002981, p. 3, Table 1) gives 54.1, 54.6 and 55.2 kPa with 31.0, 30.3 and 28.8 mol % oxygen. These values are drafted from the papers with exact quotes and are **awaiting human verification**; until a named team member verifies them, they do not appear in the app (see `data/findings/drafts.json` and `docs/TEAM_TASKS.md`).
- **ACME BRE lists the candidate oxygen levels but no pressure.** Its PSI page names "14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen" (`data/raw/psi/ACME-BRE/ACME-BRE.md`, line 26). Its summary table lists the oxygen levels used in each session, and its own note (table line 2) says the chamber pressures "were also varied but are not identified in this summary table".

The question we put to NASA: *If NASA has already burned fabric in near-Moon-base air, why can't a researcher download it?*

## What is in the app

Four tabs, plus three pages reachable from every screen.

| Tab or page | What it answers |
| --- | --- |
| **Trade Map** | Oxygen percent against cabin pressure (psi, with kPa alongside). Every candidate atmosphere pinned. Layers for test evidence (split by fuel class and by source type), tests with pressure not recorded, blind spots (hatched), flame temperature lines and prebreathe points. A "Solids only" toggle and zoom presets (all tests, habitat range, suit corner). |
| **Dossiers** | One page per candidate atmosphere and per material: what tests exist nearby, what is missing, and why. |
| **Test Planner** | Ranks gaps in the evidence (combinations of oxygen, pressure and material class) by how much a new test would add. It ranks experiments to run, never atmospheres. |
| **Investigations** | A card for every PSI combustion investigation, a timeline, a coverage matrix, and a compare view of 2 to 4 investigations. |
| **Evidence Explorer** | Every test in one filterable table, with the source of every value. |
| **Data Quality** | The public quality report: every flag, the reconciliation of rows, the golden checks. |
| **Methods** | How every number is computed, in plain English and with equations. |

Every number on screen is a button. Clicking it opens a popover with its source: source type, investigation, file, line, column, the raw text, any transforms applied, DOI or NTRS link, and verification status.

## Data integrity, in brief

1. **Raw files are never edited.** Every file in `data/raw/` has a SHA-256 hash in `data/raw/MANIFEST.json`, checked on every build. Any mismatch stops the build.
2. **Every value carries provenance**: where it came from, down to file, line and column, or paper, page and exact quote.
3. **Only named, tested transforms** (for example trimming spaces or converting mmHg to kPa). Anything else is a **flag**, not a fix: the raw text is kept and the value is set to null.
4. **No invented data.** Missing means "not recorded". Nothing is interpolated or assumed. In particular, Redshift never assumes a pressure of 1 atm for a table that does not record pressure.
5. **Paper values are quarantined** until a named team member has checked the quote on the stated page.
6. **The build fails rather than ship bad data**: hash checks, reconciliation, golden checks and a provenance lint (every number in every output must have a source) must all pass.
7. **Versioned dataset**: each build writes a version (date plus content hash) shown in the footer and every export.

Details: `docs/METHODS.md`. The current quality report: `data/processed/quality_report.md`.

## How to run

You need [uv](https://docs.astral.sh/uv/) (Python) and Node.js with npm.

```bash
uv sync                                   # install the Python environment
uv run python -m redshift.build           # rebuild every output from the raw files
uv run pytest                             # run the test suite
uv run uvicorn redshift.api.app:app       # start the API; interactive docs at /docs
```

Website (in a second terminal):

```bash
cd web
npm install
npm run dev
```

`npm run build` refuses to build the site if the data snapshot is missing, if provenance coverage is below 100%, or if any golden check has an unexplained difference (`web/scripts/check-data.mjs`).

## How to rebuild every figure from the raw files

One command rebuilds everything: `uv run python -m redshift.build`. It verifies the raw hashes, runs one adapter per investigation, computes the science, checks the goldens and the provenance lint, then writes `data/processed/` and an identical static snapshot in `web/public/data/`. The website reads only that snapshot, so every chart is a direct view of these files.

| Figure | Built from |
| --- | --- |
| Trade Map | `trade_map.json`, `candidates.json`, `candidate_evidence.json`, `flame_temperature_grid.json`, `prebreathe.json`, `planner_grid.json` |
| Access Gap chart | `access_gap.json` |
| Evidence strips per candidate | `candidate_evidence.json` |
| Sensitivity table | `sensitivity.json` |
| FLEX suppression chart | `flex_suppression.json` |
| Investigation timeline, coverage matrix, compare view | `investigations.json`, `investigation_stats.json` |
| Test Planner | `planner_grid.json` |
| Evidence Explorer | `tests.json` (also `tests.csv`, `tests.parquet`) |
| Data Quality | `quality_report.json`, `quality_report.md`, `flags.csv` |
| Source popovers | `provenance.json` |

Two consecutive builds produce byte-identical files (tested in `tests/test_build.py`).

## Data sources and licences

- **NASA Physical Sciences Informatics (PSI).** 19 microgravity combustion investigations with 21 experiment tables (`data/raw/psi/`, harvested 2026-11-14), plus the PSI search records for 5 ground investigations that have no tables. Licences are recorded per investigation in `data/processed/investigations.json`: 18 of the 19 harvested investigations show Creative Commons Zero v1.0 Universal (CC0-1.0). **ACME Flame Design (PSI-10) shows no licence on its PSI page**; see the flags with code `no_licence` in `data/processed/quality_report.json`. Cite each investigation by its DOI (prefix 10.60555); the full list is in `docs/REFERENCES.md`.
- **NASA Technical Reports Server (NTRS) papers** listed in `data/papers/sources.json`, used only for quoted findings. The PDFs are kept locally and are not committed (`.gitignore`); the extracted page text used for automatic quote checks is in `data/papers/text/`.
- **The official challenge statement**, quoted for the 10.2 psi / 30% O2 scenario and the 4.3 psi / 100% O2 suit point (`data/raw/reference/challenge_statement.md`).
- **Code**: MIT licence (`LICENSE`). Data keeps the licence of its source.

## How to cite

Cite the dataset with the text in `data/processed/dataset_version.json`. For the current build:

> Project Redshift (2026). Redshift microgravity fire evidence dataset, version 2026-11-14+6121a570500e. Derived from NASA Physical Sciences Informatics (cite each investigation by its DOI).

The version changes whenever the published content changes (for example after paper findings are verified), so always copy the cite text from the build you used. Also cite each PSI investigation you rely on by its DOI (see `docs/REFERENCES.md`). The API serves BibTeX for all PSI DOIs at `/export/bibtex`.

## Limitations

- **No partial-gravity data.** PSI holds no partial-gravity combustion data (as the challenge statement notes). Everything here is microgravity.
- **The solid-fuel tables record no pressure.** None of the PSI solid-fuel burn tables has a pressure column, so those burns cannot be placed on the pressure axis. They appear in a separate "pressure not recorded" strip.
- **ACME BRE records no pressure** in its summary table, so its sessions appear only on the oxygen axis.
- **The FLEX-2 table is a test matrix, not a list of tests.** Each of its 8 rows names a fuel and the lists of conditions used with it, so no single condition can be read from a row.
- **Flame temperature explains; it does not predict.** It is the adiabatic flame temperature of stoichiometric methane only, computed with Cantera. It shows how hot a flame can get in each atmosphere, not whether a material ignites or spreads. The 4.3 psi / 100% O2 value is approximate.
- **The nearness rule is a judgement.** Which tests count as "near" a candidate depends on step sizes chosen by the team. The sensitivity table shows how counts change at 0.75x, 1x and 1.5x the steps (`data/processed/sensitivity.json`).
- **Paper findings appear only after human verification.** At this build, 63 findings are drafted and 0 are verified (`data/processed/quality_report.json`), so no paper-derived test is yet on the map.
- **Prebreathe figures are NASA's unvalidated estimates.** The source slide (NTRS 20220011152, p. 6) labels them "Unvalidated estimates (i.e., not yet available for flight use)".
- **Inverse flames are not counted.** In inverse-flame tests the oxygen is in the burner stream, not in the atmosphere, so they are reported separately and never counted as near a cabin atmosphere.

## AI disclosure

- **Code, pipeline and draft text.** Claude, an AI coding assistant made by Anthropic, wrote all of the code, the data pipeline, the tests and the draft documentation in this repository, under the direction of the Project Redshift team.
- **The idea is the team's.** The team chose the problem and the Atmosphere Trade Studio concept and directed every design decision. During planning the team also used an AI assistant in a chat for background research and to review the team's draft concept; that review is kept in `docs/` for transparency.
- **Paper findings** were drafted by AI with exact quotes and page numbers, checked automatically by code (the quote must appear verbatim on the stated page and every number must appear in the quote), and appear in the app only after a named team member has verified each one against the PDF.
- **Summaries and cached answers** are AI-assisted templates. They contain no numbers of their own: every number is filled in from the built data, with its source, and a checker rejects any text with a bare number, banned wording or an unknown citation. Each is labelled "AI-assisted" and shows whether a team member has checked it.
- **No AI writes data values.** Every value comes from a raw file, a verified quote or a documented calculation.

## Repository layout

| Path | Contents |
| --- | --- |
| `data/raw/` | PSI files exactly as downloaded, never edited; `MANIFEST.json` holds their hashes; `reference/` holds the challenge statement |
| `data/papers/` | `sources.json` (the NTRS documents used), extracted page text in `text/`; PDFs are local only |
| `data/findings/` | AI-drafted paper findings (`drafts.json`), the map from findings to tests (`paper_tests.json`), and the verification log once anyone verifies |
| `data/ai/` | AI-assisted summary and answer templates, and the human check log once anyone checks |
| `data/processed/` | Every build output (rebuilt from raw files) |
| `redshift/` | Python package: `ingest/`, `normalise/` (one adapter per investigation), `units.py`, `transforms.py`, `flags.py`, `provenance.py`, `science/`, `papers/`, `ai/`, `export/`, `api/`, `build.py`, `goldens.json`, `params.json` |
| `scripts/` | `verify_findings.py`, `check_ai_text.py`, `commit.py` |
| `tests/` | pytest suite, including golden, determinism, reconciliation and snapshot tests |
| `web/` | React and TypeScript website; `web/public/data/` is the committed data snapshot |
| `docs/` | Brief, methods, explainer, references, submission drafts, team tasks, decisions log, open questions |
