# Project Redshift: working rules for Claude Code

The full brief is `docs/BRIEF.md`. The newest idea is `docs/Redshift_Idea_Review_and_Refined_Concept.pdf` and overrides older documents where they disagree. Read both before starting a stage.

## Non-negotiables
- Data integrity is the cornerstone. Raw files in `data/raw/` are immutable and hash-checked. Every displayed number carries provenance. No imputation, no "fixing" values: anomalies are flags. Paper-derived values stay `verified: false` until a named team member confirms quote and page.
- A plane, not a score. Never rank, score or recommend an atmosphere. Empty means unknown (hatched), never safe.
- Evidence always split by fuel class (gas, droplet, solid, emulator) and source type (psi_table, published_paper, derived).
- Flame temperature explains, it does not predict. Outcome labels are verbatim.
- Never claim a check passed without running it and showing the output.
- Work in stages; stop at every STOP gate in the brief and wait for the team.

## Style
British English. Metric, with psi alongside kPa for pressure. No em dashes anywhere (UI, code comments, docs). No red in the palette. No NASA logos.

## Git
Commit at the end of each meaningful step. "Box-Box" means commit and push. Never force-push or rewrite published history.

## Docs to keep current
`docs/OPEN_QUESTIONS.md`, `docs/DECISIONS.md`, `docs/EXPLAINER.md` (two or three plain sentences per module, for the team to explain to judges).
