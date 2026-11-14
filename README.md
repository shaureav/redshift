# Redshift: The Atmosphere Trade Studio

A NASA Space Apps Challenge 2026 entry for **Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data**.

NASA has not yet chosen the cabin atmosphere for lunar surface habitats and pressurised rovers. Redshift places every microgravity fire test near the candidate atmospheres on one oxygen-against-pressure map, from NASA's Physical Sciences Informatics (PSI) tables and from published papers, and shows how much of that evidence a researcher can actually download and use.

Redshift is a plane, not a score: it never ranks or recommends an atmosphere.

> Status: early build (Stage 0, repository set-up). Nothing in this repository is a verified result yet.

## Repository layout (planned)

| Path | Contents |
| --- | --- |
| `data/raw/` | PSI files exactly as downloaded, never edited, with SHA-256 hashes in `MANIFEST.json` |
| `data/papers/` | Paper PDFs used for human-verified findings (not committed) |
| `data/processed/` | Pipeline outputs, rebuilt from raw files |
| `redshift/` | Python data pipeline, science modules and API |
| `web/` | React front end |
| `docs/` | Brief, decisions log, open questions, methods, explainer |

## Data integrity

Every number shown in the app carries provenance back to a raw file, row and column, or to a paper quote and page verified by a named team member. See `docs/BRIEF.md`, Part C.

## Licences

Code: MIT (see `LICENSE`). Data keeps its source licence; most PSI datasets are CC0-1.0 and are cited by DOI (prefix 10.60555).

## AI disclosure

The code, data pipeline and draft documentation in this repository are written by an AI coding assistant (Claude Code) under the direction of the Project Redshift team, who own the idea and review the work. This will be expanded before submission.
