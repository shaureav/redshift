# References

Every external resource Redshift uses, for the submission's References field. DOIs and titles are copied from `data/raw/psi/index.csv`, `data/processed/investigations.json` and `data/papers/sources.json`. All PSI and NTRS material was retrieved on 2026-11-14.

## NASA Physical Sciences Informatics (PSI)

NASA Physical Sciences Informatics system: https://psi.nasa.gov/

### The 19 microgravity combustion investigations (data used)

Each dataset is cited by its DOI. Licence as shown on the PSI page (`investigations.json`).

| PSI id | Acronym | Title | DOI | Licence |
| --- | --- | --- | --- | --- |
| PSI-10 | ACME/Flame Design | Advanced Combustion via Microgravity Experiments / Flame Design | https://doi.org/10.60555/w4zy-bt45 | not shown on PSI |
| PSI-20 | ACME BRE | Advanced Combustion via Microgravity Experiments - Burning Rate Emulator | https://doi.org/10.60555/vb93-3y72 | CC0-1.0 |
| PSI-21 | ACME CLD Flame | Advanced Combustion via Microgravity Experiments / Coflow Laminar Diffusion Flame | https://doi.org/10.60555/23e1-9950 | CC0-1.0 |
| PSI-22 | ACME E-FIELD Flames | Advanced Combustion via Microgravity Experiments Electric-Field Effects on Laminar Diffusion Flames | https://doi.org/10.60555/se5a-8c73 | CC0-1.0 |
| PSI-23 | ACME s-Flame | Advanced Combustion via Microgravity Experiments-Structure and Response of Spherical Diffusion Flames | https://doi.org/10.60555/k57n-p030 | CC0-1.0 |
| PSI-25 | BASS-II | Burning and Suppression of Solids - II | https://doi.org/10.60555/4qc4-de67 | CC0-1.0 |
| PSI-26 | BASS | Burning and Suppression of Solids | https://doi.org/10.60555/58h4-dy80 | CC0-1.0 |
| PSI-39 | CFI | Cool Flames Investigation | https://doi.org/10.60555/m6pj-a914 | CC0-1.0 |
| PSI-47 | DAFT / DAFT-2 | Dust and Aerosol Measurement Feasibility Test / Dust and Aerosol Measurement Feasibility Test-2 | https://doi.org/10.60555/ztgj-d202 | CC0-1.0 |
| PSI-68 | FLEX-2 | Flame Extinguishment Experiment - 2 | https://doi.org/10.60555/byp8-h018 | CC0-1.0 |
| PSI-69 | FLEX | Flame Extinguishment Experiment | https://doi.org/10.60555/mbq8-0451 | CC0-1.0 |
| PSI-98 | SAFFIRE-I | Spacecraft Fire Safety Experiment-I | https://doi.org/10.60555/0t15-1z43 | CC0-1.0 |
| PSI-99 | SAFFIRE-II | Spacecraft Fire Experiment-II | https://doi.org/10.60555/2chp-m469 | CC0-1.0 |
| PSI-100 | SAFFIRE-III | Spacecraft Fire Experiment-III | https://doi.org/10.60555/040q-4h36 | CC0-1.0 |
| PSI-101 | SAME-R | Smoke Aerosol Measurement Experiment-Reflight | https://doi.org/10.60555/2np7-jv14 | CC0-1.0 |
| PSI-102 | SAME | Smoke and Aerosol Measurement Experiment | https://doi.org/10.60555/gd4k-8h62 | CC0-1.0 |
| PSI-106 | SLICE | Structure and Liftoff In Combustion Experiment | https://doi.org/10.60555/pm12-rg61 | CC0-1.0 |
| PSI-107 | SPICE | Smoke Point In Co-flow Experiment | https://doi.org/10.60555/9kbh-e962 | CC0-1.0 |
| PSI-159 | ACME CFI-G | Advanced Combustion via Microgravity Experiments / Cool Flames Investigation with Gases | https://doi.org/10.60555/cyt1-kh64 | CC0-1.0 |

CC0-1.0 is "Creative Commons Zero v1.0 Universal", as written on the PSI pages.

### The 5 ground investigations (metadata only, no tables)

Returned by the PSI "combustion" search (`data/raw/psi_search_combustion.json`). No DOI is recorded for them in the harvest; they are listed with their PSI pages.

| PSI id | Title | PSI page |
| --- | --- | --- |
| PSI-60 | Computational and Experimental Analysis of SPICE Data Sets | https://psi.nasa.gov/physci/repo/data/investigations/PSI-60 |
| PSI-62 | Concurrent Flame Spread Modeling using Flamelet Generated Manifolds in Microgravity with Comparison to BASS Experiments using Two-Color Tomography | https://psi.nasa.gov/physci/repo/data/investigations/PSI-62 |
| PSI-115 | Utilization of the Smoke Aerosol Measurement Experiment Data for Advanced Modeling and Simulation of Smoke Generation in Micro-Gravity | https://psi.nasa.gov/physci/repo/data/investigations/PSI-115 |
| PSI-117 | Effect of External Thermo-Convective Perturbation on Cool Flame Dynamics: A Multidimensional Multi-Physics CFD Analysis | https://psi.nasa.gov/physci/repo/data/investigations/PSI-117 |
| PSI-142 | Quantitative Studies of Cool Flame Transitions at Radiation / Stretch Extinction Using Counterflow Flames | https://psi.nasa.gov/physci/repo/data/investigations/PSI-142 |

## NASA Technical Reports Server (NTRS) documents

Used only for quoted findings (`data/papers/sources.json`). None of these records lists a DOI on NTRS.

| NTRS id | Title | Authors (first) and year | Venue | Link |
| --- | --- | --- | --- | --- |
| 20240002981 | Preliminary Results from the Saffire VI Experiment | Urban, D. L., et al., 2024 | 53rd International Conference on Environmental Systems | https://ntrs.nasa.gov/citations/20240002981 |
| 20210011521 | Fire Safety Implications of Preliminary Results from Saffire IV and V Experiments on Large Scale Spacecraft Fires | Urban, D. L., et al., 2021 | 50th International Conference on Environmental Systems | https://ntrs.nasa.gov/citations/20210011521 |
| 20220011152 | Open Atmospheres Forum: Exploration Atmospheres Validation Study | Garbino, A., et al., 2022 | Open Atmospheres Forum (presentation) | https://ntrs.nasa.gov/citations/20220011152 |
| 20220009536 | Validation of Decompression Sickness Risk Mitigation Protocols for Planetary Spaceflight Missions | Abercromby, A. F. J., et al., 2022 | International Conference in Aerospace Medicine (ICAM2022) | https://ntrs.nasa.gov/citations/20220009536 |
| 20240003211 | Moon to Mars (M2M): Exploration Atmosphere | Walton, M., and Norcross, J., 2024 | Trilateral Safety and Mission Assurance Conference 2024 (presentation; abstract only, no PDF on NTRS) | https://ntrs.nasa.gov/citations/20240003211 |
| 20220013669 | Internal Layout of a Lunar Surface Habitat | Burke, C., et al., 2022 | 2022 ASCEND | https://ntrs.nasa.gov/citations/20220013669 |
| 20210021781 | Recent Research on Flames of Gaseous Fuel Aboard the International Space Station | Stocker, D. P., 2021 | 33rd Japanese Conference on Microgravity Science and Application | https://ntrs.nasa.gov/citations/20210021781 |
| 20170009141 | Emulation of Condensed Fuel Flames Using a Burning Rate Emulator (BRE) in Microgravity | Markan, A., et al., 2017 | U.S. National Combustion Meeting 2017 | https://ntrs.nasa.gov/citations/20170009141 |
| 20150023456 | Detailed Results from the Flame Extinguishment Experiment (FLEX) March 2009 to December 2011 | Dietrich, D. L., et al., 2015 | NASA technical publication | https://ntrs.nasa.gov/citations/20150023456 |
| 20210022617 | Isolated Single Droplet Combustion: FLEX Experiments onboard the International Space Station | Nayagam, V., et al., 2021 | 33rd Academic Lecture Meeting of the Japan Society of Microgravity Application (JASMAC-33) (presentation) | https://ntrs.nasa.gov/citations/20210022617 |

Full author lists are in `data/papers/sources.json`.

## NASA Space Apps Challenge

- Challenge: "Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data", NASA Space Apps Challenge 2026. The challenge text used is kept verbatim in `data/raw/reference/challenge_statement.md` (source given there as https://www.spaceappschallenge.org/). Add the exact challenge page URL from the Space Apps site before submitting.
- Judging and Awards Guide: https://www.spaceappschallenge.org/resources/judging-awards-guide/
- Project Submission Guide: https://www.spaceappschallenge.org/resources/project-submission-guide/

## Science software and data

- Cantera, an open-source suite for chemical kinetics, thermodynamics and transport: https://cantera.org (version 3.2.0 used, as recorded in `data/processed/provenance.json`).
- GRI-Mech 3.0 (Smith, G. P., Golden, D. M., Frenklach, M., et al.), the natural gas combustion mechanism, used through Cantera's bundled `gri30.yaml`: http://combustion.berkeley.edu/gri-mech/

## Software libraries

Python (constraints from `pyproject.toml`; exact versions in `uv.lock`):

| Library | Use |
| --- | --- |
| pandas (>=2.2) | Tables and Parquet export |
| pyarrow (>=17) | Parquet writer |
| pydantic (>=2.8) | Provenance model and API response types |
| cantera (>=3.0) | Flame temperature |
| fastapi (>=0.115) | API |
| uvicorn (>=0.30) | API server |
| pypdf (>=5.0) | PDF reading |
| pytest (>=8), hypothesis (>=6.100), httpx (>=0.27) | Tests (development) |
| ruff (>=0.6), mypy (>=1.11) | Linting and type checks (development) |
| dulwich (>=0.22) | Pure-Python git commits (development) |

Website (exact versions from `web/package.json`):

| Library | Version | Use |
| --- | --- | --- |
| react, react-dom | 18.3.1 | User interface |
| react-router-dom | 6.27.0 | Tabs with shareable URLs |
| @tanstack/react-query | 5.59.0 | Data loading |
| @tanstack/react-table | 8.20.5 | Evidence Explorer table |
| d3 | 7.9.0 | Trade map and charts |
| vite, @vitejs/plugin-react | 5.4.10, 4.3.3 | Build tool |
| typescript | 5.6.3 | Type checking |
| tailwindcss, postcss, autoprefixer | 3.4.14, 8.4.47, 10.4.20 | Styling |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, globals | 9.13.0, 9.13.0, 8.11.0, 5.0.0, 15.11.0 | Linting |
| vitest, jsdom | 2.1.3, 25.0.1 | Front-end tests |
| @types/d3, @types/react, @types/react-dom | 7.4.3, 18.3.11, 18.3.1 | Type definitions |

Tools: uv (Python package manager), Node.js and npm, Vercel (hosting).

## AI tools

- Claude (Anthropic), used as an AI coding assistant for all code, the pipeline, draft findings and draft text, and as a chat assistant for background research and review during planning. See the AI disclosure in `README.md`.

## Referred to but not used for any value

These appear in the project's planning documents or open questions but were not opened by the pipeline and supply no number in the app:

- ACME BRE flight results journal paper, Combustion and Flame 228 (2021), DOI 10.1016/j.combustflame.2021.01.035 (not openly available on NTRS; see `docs/OPEN_QUESTIONS.md`, Q7).
- Aerospace Medicine and Human Performance 89(9), 2018, p. 792 (physiology source listed in `docs/OPEN_QUESTIONS.md`, Q8; not yet opened).
