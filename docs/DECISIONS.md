# Decisions log

Short record of every significant decision and why. Newest at the bottom.

| # | Date (IST) | Decision | Why | Decided by |
| --- | --- | --- | --- | --- |
| D1 | 2026-11-14 | The review PDF (`docs/Redshift_Idea_Review_and_Refined_Concept.pdf`) overrides the original draft wherever they disagree. | Stated in the brief. The draft's headline ("never burned in Moon-base air") is false because of Saffire V and VI. | Brief |
| D2 | 2026-11-14 | The master copy of the raw data is `Redshift_PSI_Combustion.zip` (SHA-256 `afe4cb9c80859cf1e7f2d2d78401dbbdf1b5cf7d1ba08e0557ebc98309dc2497`, 3,140,414 bytes). Identical copies exist in WhatsApp downloads and `~/Downloads`. | The review says to treat the zip as master. Loose project-folder copies include duplicate and mislabelled FLEX files. | Brief and review |
| D3 | 2026-11-14 | Code is MIT licensed; data keeps each source's licence. | Stated in the brief. | Brief |
| D4 | 2026-11-14 | `docs/BRIEF.md` is a verbatim copy of the master build brief; `docs/sources/` holds the draft PDF, the conversation export and the 24-record PSI search JSON as reference only (not pipeline inputs until hashed into `data/raw/`). | Keep every document the build depends on inside the repository. | Claude |

## Proposed, awaiting the team

| # | Proposal | Why |
| --- | --- | --- |
| P1 | Nearness uses Euclidean distance; flow counts only when both test and target have a value; any unknown input returns "unknown", never "not near". Frozen before any count runs. | The brief leaves the metric open and the golden counts depend on it (see OPEN_QUESTIONS Q11). |
| P2 | The deployed demo reads only the static JSON snapshot. FastAPI stays in the repo for researchers to run locally. | One data path removes the risk of live and snapshot numbers differing; avoids Vercel Python size limits with pandas and Cantera. |
| P3 | Every number on screen, including bins, unit conversions and funnel steps, is computed in the pipeline. The front end does no arithmetic except filter counts in one tested module. Planner weights become 3 or 4 precomputed presets. | Keeps the provenance lint meaningful. |
| P4 | AI summaries may not contain digits; numbers enter through template slots filled from provenance-tagged values. A deny-list blocks "safe", "unsafe", "recommend", "went out". | The number post-check alone passes misattributed numbers and number words. |
| P5 | A finding's numeric fields must appear literally inside its verified quote, and the PDF's SHA-256 is stored with it. | The quote check alone does not prove the stored number matches the quote. |
| P6 | Drop DuckDB and `mypy --strict`; keep ruff, plain mypy on core modules, hypothesis for unit round trips only. | DuckDB files are not byte-deterministic; strict typing with pandas costs hours. |
