# Redshift methods

Technical description of how every number in Redshift is produced. Every count below is copied from a built file; the file is named beside it. All built files are in `data/processed/` and are rewritten by `uv run python -m redshift.build`. The dataset version described here is `2026-11-14+6121a570500e` (`dataset_version.json`); counts can change in later builds, for example once paper findings are verified.

Contents: 1 units; 2 pipeline overview; 3 canonical schema; 4 allowed transforms; 5 flags; 6 adapters; 7 reconciliation; 8 provenance and lint; 9 determinism and versioning; 10 candidate atmospheres; 11 nearness; 12 sensitivity; 13 flame temperature; 14 planner; 15 prebreathe; 16 access gap; 17 FLEX suppression; 18 golden checks; 19 paper findings; 20 AI text; 21 API; 22 limitations.

---

## 1. Units and exact constants

All unit conversions live in `redshift/units.py`. Every pressure is stored internally in kPa and shown in psi with kPa alongside. The constants are exact definitions, so every route between two units gives the same answer:

| Unit | Constant in code | Value |
| --- | --- | --- |
| 1 atm | `KPA_PER_ATM` | 101.325 kPa (exact by definition) |
| 1 mmHg (conventional) | `KPA_PER_MMHG` | 101.325 / 760 kPa (exact by definition) |
| 1 bar | `KPA_PER_BAR` | 100 kPa |
| 1 psi | `KPA_PER_PSI` | 0.45359237 x 9.80665 / 0.0254^2 / 1000 kPa = 6.894757293168361 kPa |

Mole fractions are converted to percent by `fraction_to_pct(x) = round(x x 100, 9)`; the rounding to 9 decimal places removes binary floating-point artefacts (no recorded value has more than 4 decimal places). An unknown pressure unit is treated as a pipeline bug and raises an error. Round trips between units are property-tested with `hypothesis` (`tests/test_core.py`).

## 2. Pipeline overview

`python -m redshift.build` (`redshift/build.py`) runs these steps in order and writes nothing to the snapshot if any integrity check fails:

1. Verify the SHA-256 hash and size of every raw file against `data/raw/MANIFEST.json` (`redshift/ingest/manifest.py`). A mismatch stops the build.
2. Read every PSI experiment table exactly, keeping physical line numbers and raw strings (`redshift/ingest/tables.py`).
3. Run one hand-written adapter per investigation (`redshift/normalise/`), producing canonical test records with provenance on every value and flags for every anomaly.
4. Build the investigation records (`redshift/investigations.py`) and per-investigation statistics.
5. Build the candidate atmospheres from exact quotes, compute flame temperatures, load and check paper findings, compute nearness, sensitivity, the access gap, the FLEX suppression table, the planner grid, the prebreathe layer and the trade map layers.
6. Evaluate the golden checks.
7. Check and render the AI-assisted text.
8. Run the provenance lint over every published payload.
9. Compute the dataset version and write `data/processed/` and `web/public/data/`.

The build exits non-zero (and writes nothing) if: a hash fails; a test has an O2 value without an O2 basis; any number lacks provenance; any golden check differs without a written explanation; any table's reconciliation does not balance; or any AI text fails its checks.

## 3. Canonical schema

One record per test (`redshift/normalise/base.py`). Test ids are `<PSI id>-<table key>-L<physical line>`, for example `PSI-69-main-L115`.

Numeric fields and the physical range used for range checks:

| Field | Unit | Range |
| --- | --- | --- |
| `o2_pct` | % | 0 to 100 |
| `pressure_kpa` | kPa | 0 to 600 (CFI ran up to 5 atm); a pressure of 0 or less is out of range |
| `pressure_psi` | psi | derived from `pressure_kpa` |
| `co2_pct`, `he_pct`, `n2_pct`, `fuel_conc_pct` | % | 0 to 100 |
| `flow_cm_s` | cm/s | 0 to 1000 |
| `n_flames` | count | 0 to 10000 |

List field: `o2_list_pct` (%, each element 0 to 100), used where a cell lists several O2 levels (ACME BRE).

Text fields: `test_label`, `test_date`, `fuel`, `material`, `diluent`, `outcome_label` (verbatim), `suppressant`, `gravity_level`, `o2_basis`, `notes`.

Each record also has `fuel_class` (gas, droplet, solid, emulator, or none), `test_kind` (flame, burn, smoke or dust), and `raw`, a copy of every original cell keyed by its original column header.

Every value is stored as `{v, u, p}`: value, unit and provenance id.

## 4. Allowed transforms

These are the only changes allowed between a raw cell and a clean value (`redshift/transforms.py`, dictionary `ALLOWED`). Each transform that is applied is recorded in the value's provenance. Anything else is a flag, not a fix.

| Transform | What it does |
| --- | --- |
| `trim` | Remove leading and trailing whitespace. |
| `empty_to_null` | An empty cell becomes an explicit null, displayed as "not recorded". |
| `parse_number` | Read a plain decimal number (digits, one optional point, optional sign or exponent). |
| `strip_stated_unit` | Read "<number> <unit>" when the unit written in the cell is exactly the unit expected for the column (for example "0.75 atm" in a pressure column read as atm). |
| `split_number_list` | Read a cell listing plain numbers separated by ";" (for example "21; 26.5; 40") as that list, in the order written. Every element must be a plain number. |
| `strip_percent_sign` | Remove a single trailing "%" from a number already in percent. |
| `fraction_to_pct` | Multiply a mole fraction by 100 to give percent. |
| `mmhg_to_kpa` | Multiply by 101.325/760 (exact definition of the conventional mmHg). |
| `atm_to_kpa` | Multiply by 101.325 (exact definition of the standard atmosphere). |
| `bar_to_kpa` | Multiply by 100. |
| `psi_to_kpa` | Multiply by 6.894757293168361. |
| `kpa_to_psi` | Divide kPa by 6.894757293168361. |
| `remove_exact_duplicate` | Drop a row that is byte-identical (after CSV parsing) to an earlier row. |
| `exclude_blank_row` | Drop a row whose every cell is empty. |
| `decode_cp1252` | Decode the file as Windows-1252 because it is not valid UTF-8. |
| `strip_bom` | Remove a UTF-8 byte-order mark from the start of the file. |

A test (`test_every_applied_transform_is_allowed`) checks that every transform named in any provenance record is in this list.

## 5. Flags

A flag records a data problem. It never changes a value: the raw text is kept and, where the value cannot be used, the clean value is null. Each flag names the investigation, file, line(s), column, raw text, what is wrong and what was done (`redshift/flags.py`). Counts below are from `quality_report.json` (678 flags in total: 11 error, 247 warning, 420 info).

| Code | Severity | Count | Meaning |
| --- | --- | ---: | --- |
| `non_numeric` | warning | 179 | A numeric column holds text (for example RAMP, ~6, #VALUE!). Raw kept; value set to null. |
| `date_inconsistent` | info | 161 | A date is malformed or disagrees with another field. Raw kept. |
| `missing_column` | info | 146 | The table has no column for this condition. Values are null ("not recorded"). |
| `exact_duplicate` | info | 50 | The row is byte-identical to an earlier row in the same table and was removed. |
| `fill_down_error` | warning | 34 | A label appears to have been auto-incremented by a spreadsheet fill-down (for example CH5, CH6). Raw kept verbatim; no correction attempted. |
| `composition_sum` | info | 33 | Mole fractions of the ambient gas sum to more than 0.01 away from 1. Values kept. |
| `label_inconsistent` | info | 19 | The same category is written in different ways. Raw labels kept verbatim. |
| `near_duplicate` | warning | 11 | Two rows share an identifier or timestamp but differ in some values. Both kept. |
| `out_of_range` | error | 11 | The value is outside its physical range (for example O2 above 100%, pressure 0). Raw kept; value set to null so it cannot be plotted or counted. |
| `implausible_value` | warning | 10 | The value is physically possible but inconsistent with its context. Raw and value kept; row flagged for review. |
| `non_test_row` | info | 9 | The row is a note, a continuation stub or a non-test entry. Excluded from the test table; listed verbatim. |
| `metadata_inconsistent` | warning | 7 | PSI metadata for the investigation appears wrong or copied from another investigation. |
| `no_licence` | warning | 2 | PSI shows no licence for this investigation. |
| `swapped_columns` | warning | 2 | Values look swapped between two columns when compared with the investigation page or a sibling investigation. Raw kept; no swap applied. |
| `unit_unclear` | warning | 2 | The unit of a value cannot be determined with confidence. Raw kept; value set to null. |
| `blank_row` | info | 1 | The row has no content in any cell and was excluded. |
| `encoding` | info | 1 | The file is not valid UTF-8 and was decoded as Windows-1252. |
| `spreadsheet_error` | warning | 0 | A cell holds a spreadsheet error such as #VALUE! or #DIV/0!. Raw kept; value set to null. |

Examples from this build: the two `no_licence` flags both concern ACME Flame Design (PSI-10), whose PSI page License row holds only a dash placeholder. The two ACME BRE oxygen cells "3400%" and "2100%" are flagged `out_of_range` and set to null; they are not reinterpreted as 34 or 21. FLEX test `PSI-69-main-L115` records a pressure of 0 mmHg, which is flagged and set to null. The full list, with file and line for each flag, is in `quality_report.md` and `flags.csv`.

## 6. Adapters

Each PSI table has different columns, so each investigation has its own small adapter in `redshift/normalise/` (19 adapters, listed in `adapters.json`). There is no automatic guessing of column meanings. Each adapter:

- states, in a plain-English docstring, which raw column maps to which canonical field and why (this text is published in `adapters.json` for the Methods page);
- sets the investigation's fuel class and test kind;
- can only produce a value through the framework's `Ctx` methods (`num`, `pressure`, `num_list`, `text`, `constant`, `missing`, `derived_text`), so every value it emits carries provenance and every transform is one of the allowed set;
- calls `exclude` for a non-test row (which keeps the row verbatim in the report) and `flag` for any anomaly.

The framework (`redshift/normalise/base.py`) does the generic work: removing blank rows and byte-identical duplicates (both recorded), range checks, and the reconciliation count. A field that a table does not record at all is null with a `missing:` provenance record saying why, and is flagged `missing_column` once per table.

Examples of documented mapping choices:

- **ACME BRE (PSI-20)**: each row is a test day (a session of several flames). Cells listing several O2 levels are read with `split_number_list` into `o2_list_pct`; `o2_pct` stays null because no single value applies. There is no pressure column.
- **FLEX-2 (PSI-68)**: the table is a test matrix, not a list of tests. Each of its 8 rows names a fuel and gives lists or ranges of conditions, so the numeric fields are null and each such cell is flagged `non_numeric`.
- **Inverse flames** (ACME Flame Design and ACME CFI-G inverse tables): the oxygen is in the burner stream, so `o2_basis` records that it is not an atmosphere.

## 7. Reconciliation

For every table the build asserts: records in = tests out + exact duplicates removed + blank rows excluded + non-test rows excluded. If any table does not balance, the build fails. From `quality_report.json`:

| Investigation | Table | Records in | Tests out | Duplicates | Blank | Non-test |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| PSI-10 | Flame Design, Normal Flame | 207 | 207 | 0 | 0 | 0 |
| PSI-10 | Flame Design, Inverse Flame | 120 | 120 | 0 | 0 | 0 |
| PSI-20 | ACME BRE | 18 | 18 | 0 | 0 | 0 |
| PSI-21 | CLD Flame | 32 | 32 | 0 | 0 | 0 |
| PSI-22 | ACME E-FIELD Flames | 32 | 24 | 8 | 0 | 0 |
| PSI-23 | ACME s-Flame | 18 | 18 | 0 | 0 | 0 |
| PSI-25 | BASS-II | 129 | 129 | 0 | 0 | 0 |
| PSI-26 | BASS | 122 | 121 | 0 | 0 | 1 |
| PSI-39 | CFI | 87 | 79 | 8 | 0 | 0 |
| PSI-47 | DAFT | 2 | 2 | 0 | 0 | 0 |
| PSI-68 | FLEX-2 | 8 | 8 | 0 | 0 | 0 |
| PSI-69 | FLEX | 274 | 274 | 0 | 0 | 0 |
| PSI-98 | SAFFIRE-I | 4 | 2 | 0 | 0 | 2 |
| PSI-99 | SAFFIRE-II | 15 | 9 | 0 | 0 | 6 |
| PSI-100 | SAFFIRE-III | 2 | 2 | 0 | 0 | 0 |
| PSI-101 | SAME-R | 109 | 109 | 0 | 0 | 0 |
| PSI-102 | SAME | 8 | 8 | 0 | 0 | 0 |
| PSI-106 | SLICE | 12 | 12 | 0 | 0 | 0 |
| PSI-107 | SPICE | 469 | 435 | 34 | 0 | 0 |
| PSI-159 | CFI-G, Normal Flames | 179 | 179 | 0 | 0 | 0 |
| PSI-159 | CFI-G, Inverse Flames | 1015 | 154 | 0 | 861 | 0 |

Totals (`quality_report.json` summary): 21 tables from 19 investigations; 1942 tests in the canonical table; 50 exact duplicates removed; 861 blank rows excluded (all in the CFI-G inverse table); 9 non-test rows excluded. The non-blank record count across all tables before removing duplicates is 2001, which matches the earlier review harvest (golden check `harvest_nonblank_records`). The canonical table holds 1181 gas, 361 droplet, 380 solid, 18 emulator and 2 "none" (dust) tests.

## 8. Provenance model and lint

Every value that can reach the screen is stored as `{"v": value, "u": unit, "p": provenance id}`. The id keys into one registry, written as `provenance.json`. A provenance record (`redshift/provenance.py`, class `Prov`) has a source type and the fields that apply to it:

| Source type | Meaning | Key fields |
| --- | --- | --- |
| `psi_table` | A cell of a PSI experiment table | investigation, file, physical line (header is line 1), original column name, raw string, transforms, DOI |
| `psi_page` | A quoted line of a harvested PSI investigation page | file, line, exact quote, DOI |
| `published_paper` | A value quoted from a paper | file, page, exact quote, NTRS id or DOI, `verified`, `verified_by`, `verified_at` |
| `reference_document` | An exact quote from a reference document (the challenge statement) | file, line, quote |
| `derived` | Computed by the pipeline | method, method version, parameters, inputs (for a count, the ids of the tests counted) |

Id patterns include `cell:<inv>:<table>:L<line>:C<col>` for a table cell, `missing:` for a field a table does not record, `const:` for a per-table constant stated by the investigation, `cand:` for candidate atmospheres, `ft:` for flame temperatures, `near:`, `state:`, `o2match:` and `dist:` for nearness, `sens:` for sensitivity, `gap:` for the access gap, `flex:` for the FLEX table, `planner:` for the planner, `map:` for map layers, `stats:` for investigation statistics, and `paper:` for verified findings. The registry refuses two different records with the same id.

**Lint.** `redshift/export/lint.py` walks every published payload. A number passes if the nearest enclosing object has a `p` key that is a provenance id present in the registry. A small set of structural keys is exempt because they are themselves provenance or bookkeeping (for example `row`, `page`, `line`, `source_row`, `multiplier`, `records_in`, `tests_out`). Coverage must be 100% or the build fails. This build checked 11698 numbers, with 0 lacking provenance: 100.0% (`quality_report.json`, `provenance_coverage`). The website build (`web/scripts/check-data.mjs`) refuses to run unless this is 100%.

## 9. Determinism and versioning

- JSON is written with sorted keys and fixed indentation, and records, flags and counts are produced in a fixed order. `tests/test_build.py` runs the whole computation twice and asserts every payload is byte-identical.
- The dataset version is `<retrieval date>+<first 12 hex characters of a SHA-256>` computed over the name and content of every published payload (including `provenance.json`). This build: `2026-11-14+6121a570500e`; full hash `6121a570500ec9ae6a300a811342e2bd6d6ad24251d6bd787d73dbde307d802f` (`dataset_version.json`).
- Any change to raw data, parameters (`redshift/params.json`), code output or verifications changes the version.
- Snapshot tests store the evidence for each of the five candidates in `tests/snapshots/`, so any accidental change is caught.

## 10. Candidate atmospheres

Each candidate is defined by an exact quote that the build finds in a raw file at build time (`redshift/science/candidates.py`); if the quote is missing, the build fails. No candidate is ranked, scored or put forward as the choice.

| Candidate | Role | Source |
| --- | --- | --- |
| 14.7 psi / 21% O2 | habitat | ACME BRE PSI page, line 26: "14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen" |
| 10.2 psi / 26.5% O2 | habitat | same quote |
| 8.2 psi / 34% O2 | habitat | same quote |
| 10.2 psi / 30% O2 | challenge statement scenario | challenge statement: "The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less." This is a bound from the challenge text, not a named NASA candidate. |
| 4.3 psi / 100% O2 | spacesuit | challenge statement: "spacesuits are filled with 100% oxygen to only 4.3 psi" |

## 11. Nearness

Nearness decides which tests sit close to a point on the O2 and pressure plane (`redshift/science/nearness.py`, parameters in `redshift/params.json` under `nearness`).

**Distance**, in steps:

```
d = sqrt( ((O2_test - O2_target) / s_O2)^2
        + (ln(p_test / p_target) / s_p)^2
        + ((v_test - v_target) / s_v)^2 )      <- flow term only if both sides record flow
```

| Parameter | Value in params.json |
| --- | --- |
| O2 step `s_O2` | 5.0 percentage points |
| Pressure step `s_p` | ln(1.25), a 25% change in pressure on a log scale |
| Flow step `s_v` | 10.0 cm/s |
| Threshold | near if d <= 1.5 |
| Metric | Euclidean |
| O2 bases counted | "ambient", "chamber initial" |

Rules:

- **Flow** is used only when both the test and the target record it. Candidate atmospheres have no flow value, so nearness to a candidate uses O2 and pressure only.
- **Ranges.** A paper that states a range (for example of O2) is measured at the closest point of the range to the target.
- **Sensitivity multiplier.** In the sensitivity table, the three steps are multiplied by 0.75, 1 or 1.5; the threshold stays 1.5.

**The three states.** Each test is classified against each target as one of:

1. **near**: both O2 and pressure recorded, and d <= 1.5;
2. **not near**: both recorded, and d > 1.5;
3. **unknown**: O2 or pressure (or both) not recorded. Unknown is never treated as "not near". Sub-states are `unknown_pressure`, `unknown_o2` and `unknown_both`. Where the O2 alone is within the threshold (|O2_test - O2_target| / s_O2 <= 1.5, or any listed O2 level for ACME BRE), the test is reported as **"O2 matches, pressure not recorded"**.

**Inverse flames** (state `basis_differs`): in inverse-flame tests the oxygen is in the burner stream, not in the atmosphere, so they are reported separately and never counted as near a cabin atmosphere. This build has 263 such tests (`trade_map.json`, `inverse_flames`; 154 ACME CFI-G and 109 ACME Flame Design).

Only fire tests (test kinds "flame" and "burn") are used; smoke (SAME, SAME-R) and dust (DAFT) tests are not.

**Results at 1x steps** (`candidate_evidence.json`):

| Candidate | Near, total | Gas | Droplet | Solid | Emulator | O2 matches, pressure not recorded |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 14.7 psi / 21% | 295 | 106 | 189 | 0 | 0 | solid 129, emulator 15, droplet 1 |
| 10.2 psi / 26.5% | 72 | 0 | 72 | 0 | 0 | solid 51, emulator 16, droplet 1 |
| 10.2 psi / 30% | 52 | 0 | 52 | 0 | 0 | emulator 16 |
| 8.2 psi / 34% | 37 | 20 | 17 | 0 | 0 | gas 20, emulator 16 |
| 4.3 psi / 100% | 0 | 0 | 0 | 0 | 0 | none |

All near counts above are PSI-table tests; the published-paper count is 0 for every candidate because no paper finding is yet verified. The same unknown counts apply to every candidate, because they do not depend on the target: 665 with neither O2 nor pressure recorded, 166 with pressure not recorded, 11 with O2 not recorded, and 263 inverse flames.

The solid rows with "O2 matches, pressure not recorded" are BASS-II (PSI-25) burns, whose table records O2 but has no pressure column (inputs of `o2match:c14_7_21:solid` and `o2match:c10_2_26_5:solid` in `provenance.json`).

## 12. Sensitivity

The step sizes are judgement, so the build recomputes the near counts at 0.75x, 1x and 1.5x the steps, and once more at 1x with flow used against a quiescent target (0 cm/s) where tests record flow (`sensitivity.json`).

| Candidate | Steps | Gas | Droplet | Solid | Emulator |
| --- | --- | ---: | ---: | ---: | ---: |
| 14.7 psi / 21% | 0.75x | 106 | 158 | 0 | 0 |
| | 1x | 106 | 189 | 0 | 0 |
| | 1.5x | 112 | 299 | 0 | 0 |
| 10.2 psi / 26.5% | 0.75x | 0 | 54 | 0 | 0 |
| | 1x | 0 | 72 | 0 | 0 |
| | 1.5x | 118 | 203 | 0 | 0 |
| 10.2 psi / 30% | 0.75x | 0 | 23 | 0 | 0 |
| | 1x | 0 | 52 | 0 | 0 |
| | 1.5x | 68 | 97 | 0 | 0 |
| 8.2 psi / 34% | 0.75x | 19 | 9 | 0 | 0 |
| | 1x | 20 | 17 | 0 | 0 |
| | 1.5x | 20 | 26 | 0 | 0 |
| 4.3 psi / 100% | 0.75x, 1x, 1.5x | 0 | 0 | 0 | 0 |

The flow variant gives the same counts as 1x for every candidate. **Reading:** the gas and droplet counts move with the rule, but the solid count is 0 at every step size for every candidate. The solid gap does not depend on the nearness rule, because no PSI solid-fuel table records pressure.

## 13. Flame temperature

`redshift/science/flame_temperature.py`. Adiabatic flame temperature of stoichiometric methane:

- Mechanism GRI-Mech 3.0 (`gri30.yaml`) in Cantera **3.2.0** (version recorded in the provenance record `ft:grid` in `provenance.json`).
- Fuel CH4 at equivalence ratio 1.0, in an oxidiser of x O2 and (1 - x) N2 by mole, where x is the O2 percentage / 100 (pure O2 at 100%).
- Initial temperature 298.15 K at the target pressure; equilibrated at constant enthalpy and pressure (HP).
- Values above 2700 K are marked approximate, because dissociation dominates there and the result depends strongly on how it is modelled.
- `params.json` notes that helium would be modelled as argon (GRI-Mech 3.0 has no helium); the current computation covers O2/N2 mixtures only.
- Contour grid: O2 from 15 to 100% in steps of 2.5, pressure from 3 to 16 psi in steps of 0.5; isotherms at 2200 to 2900 K every 100 K (levels chosen for legibility, a judgement).

Candidate values (`candidate_evidence.json`):

| Candidate | Flame temperature |
| --- | --- |
| 14.7 psi / 21% | 2224.2 K |
| 10.2 psi / 26.5% | 2415.4 K |
| 10.2 psi / 30% | 2504.6 K |
| 8.2 psi / 34% | 2570.4 K |
| 4.3 psi / 100% | 2903.5 K (approximate) |

**Flame temperature explains; it does not predict.** It shows how hot a methane flame can get in each atmosphere. It says nothing about whether a particular material ignites, how fast a flame spreads, or how it behaves in microgravity flow. Every place it appears says so.

## 14. Test planner

`redshift/science/planner.py`, parameters under `planner` in `params.json`. The planner ranks gaps in the evidence, never atmospheres.

Grid: 7 O2 levels (21, 26.5, 30, 34, 40, 50, 100%) x 6 pressures (4.3, 6.0, 8.2, 10.2, 12.0, 14.7 psi) x 3 material classes (solid, droplet, gas) = 126 cells (`planner_grid.json`).

For each cell:

```
n          = number of existing tests of that material class near the cell (nearness rule at 1x steps)
relevance  = exp( -d^2 / (2 x 1.5^2) ), where d is the nearness distance from the cell to the
             nearest habitat candidate (habitat candidates and the challenge scenario; suit excluded)
priority   = relevance x weight(material) x (1 - n / (n + 5))
```

Presets (weights for solid, droplet, gas):

| Preset | Solid | Droplet | Gas |
| --- | ---: | ---: | ---: |
| balanced | 1.0 | 0.6 | 0.4 |
| equal | 1.0 | 1.0 | 1.0 |
| solids_only | 1.0 | 0.0 | 0.0 |

The O2 and pressure levels, the weights, the relevance function and the constant 5 are all judgement, and are labelled so. Each cell carries its count, its relevance, its priority under each preset and its three nearest existing tests, each with provenance. In this build the top-ranked cell under all three presets is solid at 21% O2 and 14.7 psi (`planner_grid.json`, `rankings`).

## 15. Prebreathe

`redshift/science/prebreathe.py`. Only NASA's published points, each with its quote and page; nothing is interpolated. The source is NASA's 2022 Exploration Atmospheres briefing (NTRS 20220011152, p. 6), which gives figures for all three habitat candidates. A point appears on the map only when its finding (`FND-EA-PB-14.7`, `FND-EA-PB-10.2`, `FND-EA-PB-8.2`) has been verified by a named team member. Every time written in the display text must appear in the quote, or the build fails.

In this build all three are "published figure found; awaiting human verification" and `prebreathe.json` has no points. The caveat shown with the layer: NASA labels these "Unvalidated estimates (i.e., not yet available for flight use)" and assumes a 6 h EVA at 4.3 psia.

## 16. Access gap

`redshift/export/evidence.py`, function `access_gap`. Each step is a count whose provenance lists the ids of the tests counted (`access_gap.json`).

PSI tables:

| Step | Count |
| --- | ---: |
| Solid-fuel burn rows in PSI experiment tables | 263 |
| ... with oxygen recorded | 129 |
| ... with pressure recorded | 0 |
| ... near a habitat candidate (downloadable as rows) | 0 |

Published papers (verified only):

| Step | Count |
| --- | ---: |
| Solid burns near a habitat candidate, described in papers (human-verified) | 0 |
| ... of those, available as rows in PSI tables | 0 |

Paper findings awaiting verification: 63.

The 263 solid burn rows are BASS-II (129), BASS (121), SAFFIRE-II (9), SAFFIRE-I (2) and SAFFIRE-III (2) (inputs of `gap:psi:0`). The 129 with oxygen are all BASS-II (`gap:psi:1`). "Habitat candidate" here means the three habitat candidates and the challenge scenario; the suit is excluded. The paper step counts Saffire tests listed in `data/findings/paper_tests.json` (Saffire IV-1, IV-2, V-2, V-3, V-4, VI-2, VI-3, VI-4) only after the findings that give their O2 and pressure are verified. It is 0 now because none is verified yet; it is not a finding that such burns do not exist.

## 17. FLEX suppression groups

`flex_suppression.json`. FLEX (PSI-69) droplet tests in the pressure band 480 to 600 mmHg (near 10.4 psi): 103 tests. Groups by O2 and CO2, with no helium; "extinguished" means the verbatim outcome label "Extinction".

| Group | Extinguished / total | Outcome labels (verbatim) |
| --- | --- | --- |
| 25% O2 + 15% CO2 | 0 / 6 | Disruption 6 |
| 23 to 24% O2 + 20 to 25% CO2 | 14 / 23 | Extinction 14, Disruption 7, Completion 2 |
| 21% O2 + 30% CO2 | 4 / 6 | Extinction 4, Completion 2 |
| 15 to 20% O2 + 35 to 50% CO2 | 22 / 22 | Extinction 22 |

High oxygen, no suppressant (30 to 34% O2, 534 to 543 mmHg): 17 tests; labels Disruption 15, Completion 2; fuels Methanol 9, Heptane 8.

One FLEX test, `PSI-69-main-L115`, records a pressure of 0 mmHg; it is flagged and its pressure is null, so it is not in any group. Annotation shown with the chart: CO2 at 35% or more is far beyond what a crew can breathe; these tests show suppression chemistry, not a cabin atmosphere. FLEX's "Disruption" is not defined on its PSI page; the label is shown verbatim.

## 18. Golden checks

Golden checks are values from earlier analyses that the pipeline must reproduce or explain (`redshift/goldens.json`, results in `quality_report.json`). A mismatch is never tuned away: it either matches, differs with a written explanation, or stops the build.

| Check | Expected | Actual | Status | What it shows |
| --- | --- | --- | --- | --- |
| Microgravity combustion investigations with a harvest folder | 19 | 19 | match | The harvest count is reproduced. |
| Experiment table files | 21 | 21 | match | |
| Non-blank data records across all tables (before removing duplicates) | 2001 | 2001 | match | |
| FLEX, 30 to 34% O2, no suppressant, 534 to 543 mmHg: tests | 17 | 17 | match | |
| ... outcome labels | Disruption 15, Completion 2 | Disruption 15, Completion 2 | match | |
| ... fuels | Methanol 9, Heptane 8 | Methanol 9, Heptane 8 | match | |
| FLEX tests between 480 and 600 mmHg | 103 | 103 | match | The review's 103 is reproduced (an earlier draft said 104). |
| 25% O2 + 15% CO2: extinguished / total | 0/6 | 0/6 | match | |
| 23 to 24% O2 + 20 to 25% CO2 | 14/23 | 14/23 | match | |
| 21% O2 + 30% CO2 | 4/6 | 4/6 | match | |
| 15 to 20% O2 + 35 to 50% CO2 | 22/22 | 22/22 | match | The review's 22/22 is reproduced (an earlier draft said 23/23). |
| Flame temperature, 14.7 psi / 21% (K) | 2224 | 2224.2 | match (tolerance 1 K) | |
| Flame temperature, 10.2 psi / 26.5% (K) | 2415 | 2415.4 | match | |
| Flame temperature, 10.2 psi / 30% (K) | 2505 | 2504.6 | match | |
| Flame temperature, 8.2 psi / 34% (K) | 2570 | 2570.4 | match | |
| Flame temperature, 4.3 psi / 100% (K, approximate) | 2903 | 2903.5 | match | |
| PSI-table tests near 14.7 psi / 21% (gas, droplet, solid; BRE excluded) | 432 | 295 | explained difference | 432 = 295 + 129 + 8. The 129 are BASS-II solid burns (PSI-25), whose table records O2 but no pressure; the earlier count must have assumed 1 atm, which Redshift does not impute. They are reported as "O2 matches, pressure not recorded". The 8 are byte-identical duplicate CFI rows (PSI-39 lines 81 to 88 repeat lines 24 to 31), removed by the pipeline. |
| ... of which solid | 129 | 0 | explained difference | All 129 are BASS-II rows with O2 recorded (13.6 to 22.2%) but no pressure column. They would be near 14.7 psi / 21% only if a pressure of 1 atm were assumed. |
| PSI-table tests near 10.2 psi / 26.5% | 72 | 72 | match | |
| PSI-table tests near 10.2 psi / 30% | 52 | 52 | match | |
| PSI-table tests near 8.2 psi / 34% | 37 | 37 | match | |
| ... of which droplet (FLEX) | 17 | 17 | match | |
| ... of which gas (CFI-G) | 20 | 20 | match | |
| PSI-table tests near 4.3 psi / 100% | 0 | 0 | match | |
| PSI solid tests near any habitat candidate other than 14.7/21 | 0 | 0 | match | The central gap claim, reproduced from the tables. |
| ACME BRE flames ignited, summed over rows | 194 | 194 | match | |

Summary: 26 checks, 24 matches, 2 explained differences, 0 unexplained.

## 19. Paper findings workflow

`redshift/papers/findings.py`, `scripts/verify_findings.py`.

1. **Draft.** An AI assistant read the papers listed in `data/papers/sources.json` and drafted findings in `data/findings/drafts.json`. Each has finding text, an exact verbatim quote, the page, the source file, the NTRS id, and each number it states together with the exact text ("as written") that states it. Drafts are always `verified: false` and are never edited by people.
2. **Automatic checks** (a draft failing any is rejected and listed in the quality report):
   1. the quote occurs verbatim on the stated page of the extracted PDF text in `data/papers/text/` (after the typographic normalisation listed in `redshift/quotes.py`: ligatures, curly quotes, dashes, non-breaking spaces and whitespace; no digit, unit or word is changed); for the one abstract-only record (NTRS 20240003211, no PDF on NTRS) the quote is checked against the saved abstract text;
   2. every stated number's "as written" text occurs inside the quote, and the number itself occurs in that text;
   3. the finding text contains none of the banned words (pattern `BANNED` in `redshift/papers/findings.py`), and may describe a recommendation only when the quoted source itself makes one (as NASA's own recommendation of 8.2 psi / 34% O2 in NTRS 20220009536 does).
3. **Human verification.** A team member runs `uv run python scripts/verify_findings.py`, opens the PDF at the stated page, and answers yes or no for each finding. Each answer is appended, with name and time, to `data/findings/verifications.json` (append-only; the latest answer for a finding wins).
4. **Publication.** Only findings that pass the checks and have an accepting verification reach the app, labelled "from published paper, human verified", with the verifier's name. A Saffire test appears on the map only when every finding that gives its O2 and pressure is verified (`data/findings/paper_tests.json`).

Status in this build (`quality_report.json`): 63 drafted, 0 failed checks, 63 awaiting verification, 0 verified, 0 rejected.

## 20. AI text workflow

`redshift/ai/text.py`, `scripts/check_ai_text.py`. AI-assisted summaries (`data/ai/summaries.json`, one per candidate) and cached answers to demo questions (`data/ai/qa.json`) are stored as **templates**. A template contains no numbers of its own. Every number enters through a slot such as `{{candidate_evidence.json#evidence[candidate_id=c8_2_34].near_total}}`, which the build resolves to a value in the published data, keeping its provenance so the website can show its source.

The build rejects a template, and fails, if:

1. it contains a bare number outside a slot (digits inside names such as O2, CO2 or FLEX-2 are allowed);
2. a slot does not resolve to a `{v, u, p}` value;
3. it uses banned wording: the words and phrases in the regular expression `BANNED` in `redshift/ai/text.py` (words that judge an atmosphere's hazard, any word advising a choice, and phrases such as "should choose" and "best atmosphere");
4. it cites a test id, investigation id or finding id that does not exist;
5. an answer lacks a "not covered" statement.

Segments that rely on paper findings are shown only when those findings are verified; until then a pending text is shown. A team member then reads each rendered text with `uv run python scripts/check_ai_text.py`; answers are appended to `data/ai/checks.json`. The website labels every such text "AI-assisted" and shows whether, and by whom, it was checked. There is no live question box: no model key is held on any server, and only cached answers are shown.

This build (`ai_text.json`): 5 summaries and 6 cached answers, none yet human-checked.

## 21. API

`uv run uvicorn redshift.api.app:app`; interactive documentation at `/docs`, schema at `/openapi.json`. The API serves exactly the files written by the build and never computes a new number, so the API, the static snapshot and the website always agree. Endpoints: `/version`, `/tests` (filter by investigation, fuel class, pressure recorded, flagged; paginated), `/tests/{id}` (with full provenance), `/provenance/{id}`, `/investigations`, `/investigations/{id}`, `/compare?ids=` (2 to 4 ids), `/candidates`, `/candidates/{id}/dossier`, `/materials/{name}/dossier`, `/trade-map`, `/planner?preset=`, `/quality`, `/sensitivity`, `/export/tests.csv`, `/export/flags.csv`, `/export/bibtex`.

## 22. Limitations

- No partial-gravity combustion data exists in PSI; everything here is microgravity.
- No PSI solid-fuel table records pressure, so no solid burn row can be placed on the pressure axis.
- ACME BRE records no chamber pressure in its summary table.
- The FLEX-2 table is a test matrix, not a list of tests.
- Flame temperature is for stoichiometric methane only, and explains rather than predicts.
- The nearness rule, the planner weights and the FLEX bands are judgement; the sensitivity table shows the effect of the step sizes.
- Paper findings appear only after human verification; at this build none is verified.
- Prebreathe figures are NASA's unvalidated estimates.
- Outcome labels are verbatim and are not harmonised between investigations.
- Paper values come from the papers we read (`data/papers/sources.json`); we did not survey every publication.
