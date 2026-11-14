"""ACME CFI-G (PSI-159): Cool Flames Investigation with Gases, spherical porous-burner flames on the ISS.

There are two tables, one for normal flames (fuel flows from the burner into an oxygen-bearing chamber) and
one for inverse flames (an oxygen stream flows from the burner into a fuel-bearing chamber). Columns are
mapped by hand, by exact header text.

Normal Flames table ("normal"):
- "Test" -> test_label, verbatim (for example "21088A1", "21088 B1"; the spacing varies and is kept).
- "Fuel" -> fuel, verbatim (for example "ethane", "50% butane", "30% propane").
- " XO2 before test" -> o2_pct (fraction_to_pct). The values run from 0.1797 to 0.3997, so they are mole
  fractions, not percentages. In a normal flame the oxygen is in the chamber, and this column gives the
  chamber value at the start of each test (within a run of tests, a test's "before" value usually equals the
  previous test's "XO2  after test"), so o2_basis is "chamber initial". The "after test" column is not mapped.
- "approx p (bar)" -> pressure_kpa (bar_to_kpa) and pressure_psi. The header states the unit as bar.
- "Xf" -> fuel_conc_pct (fraction_to_pct): the fuel mole fraction of the burner stream, written as a fraction
  (0 to 1). Lines 69 and 77 record Xf = 0 with mHC = 0, while the other tests of that series record Xf =
  0.02717, and the PI's derived Tad and Zst read "#DIV/0!" on those rows. The values are kept and the rows
  are flagged implausible_value for review.
- "Self-ext or flow term" -> outcome_label, verbatim ("SE", "FT" or "-"). A comment on line 5 reads "FC=flow
  cut", but the table does not define SE or FT, so they are never paraphrased. "-" appears where there was
  no ignition.
- "Comments" -> notes, verbatim.
- Not mapped (kept in the raw columns): "Flame Type", "Day" (a campaign day number, not a date), "Cool
  flame?", "XO2  after test", "mHC (mg/s)", "TFP", "Tad (K)" and "Zst" (quantities computed by the PI; lines
  69 and 77 hold "#DIV/0!" there), "Hot ignition", "burn time (sec)" and "Peak burner T (C )". Cells in
  columns that are not read are not parsed, so they raise no value flags.

Inverse Flames table ("inverse"):
- "Test" -> test_label; "Fuel" -> fuel (ethane, propane, butane), both verbatim.
- "XO2" -> o2_pct (fraction_to_pct). The values run from 0.12 to 0.85, so they are mole fractions. In an
  inverse flame this is the oxygen fraction of the oxidiser stream leaving the burner (the table also gives
  "O2 flow rate (mg/s)"), so o2_basis is "oxidiser stream (inverse flame)".
- "approx p (bar)" -> pressure_kpa (bar_to_kpa) and pressure_psi.
- "Self -ext or flow term" -> outcome_label, verbatim; "Comments" -> notes, verbatim.
- fuel_conc_pct is null for this table. "Xf  before test" is the fuel mole fraction of the chamber ambient,
  not of a burner stream, and there is no canonical field that records which stream a fuel fraction belongs
  to, so it is left in the raw columns rather than mixed with burner-stream values from other tables.
- Not mapped (kept in the raw columns): "Flame Type", "Day", "Xf  after test", "HC burnrate (mg/s)", "O2 flow
  rate (mg/s)", "TFP", "Tad (K)", "Zst", "Hot ignition", "burn time (sec)", "Peak burner Temp (C)", "Peak
  burner temp (K)" (lines 96 and 97 hold "#VALUE!"), and "Color".
- The file ends with 861 empty rows (lines 156 to 1016), which are excluded as blank rows.
- Label spellings that differ only in letter case ("Inverse" and "inverse" in Flame Type; "Yes" and "yes",
  "No" and "no" in Hot ignition; "Blue" and "blue", "Yellow" and "yellow" in Color) are flagged
  label_inconsistent and kept verbatim.

Both tables:
- Flow: the burner flows are recorded as mass flow rates in mg/s, not as velocities in cm/s, so flow_cm_s is
  null. The tables have no CO2, He, N2 or flame-count column, and no calendar date.
- gravity_level is "microgravity (ISS)" from the PSI page (flight platform: International Space Station).
- A test label whose leading day code differs from the other tests of the same Day would be flagged
  label_inconsistent; none do in these tables.
"""

from __future__ import annotations

from collections import Counter

from redshift import transforms as T
from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-159"

C_TEST = "Test"
C_FUEL = "Fuel"
C_DAY = "Day"
C_P = "approx p (bar)"
C_COMMENTS = "Comments"

N_O2 = "XO2 before test"
N_XF = "Xf"
N_MHC = "mHC (mg/s)"
N_END = "Self-ext or flow term"

I_O2 = "XO2"
I_END = "Self -ext or flow term"
I_CASE_COLS = ("Flame Type", "Hot ignition", "Color")

GRAVITY_NOTE = "PSI page ACME-CFI-G.md line 12: flight platform International Space Station (ISS)."
FLOW_NOTE = "Burner flows are recorded as mass flow rates in mg/s, not cm/s."
TABLE_DIR = "ACME-CFI-G/experiment_table"


def flag_case_variants(ctx: Ctx, rows: list[RawRow], col: str) -> None:
    """Flag labels in ``col`` that differ only in letter case. The rarer spelling's lines are attached."""
    lines: dict[str, list[int]] = {}
    for row in rows:
        s = ctx.raw(row, col).strip()
        if s:
            lines.setdefault(s, []).append(row.line)
    groups: dict[str, list[str]] = {}
    for s in lines:
        groups.setdefault(s.lower(), []).append(s)
    for spellings in groups.values():
        if len(spellings) < 2:
            continue
        ranked = sorted(spellings, key=lambda s: (-len(lines[s]), lines[s][0]))
        counts = ", ".join(f"{s!r} on {len(lines[s])} rows" for s in ranked)
        flagged = sorted(ln for s in ranked[1:] for ln in lines[s])
        ctx.flag("label_inconsistent", None, col, "; ".join(ranked),
                 f"The same label is written with different letter case: {counts}.",
                 "Raw labels kept verbatim; the rarer spelling's lines are listed.", rows=flagged)


def flag_day_code(ctx: Ctx, rows: list[RawRow]) -> None:
    """Flag a test label whose leading five-character day code differs from the rest of its Day."""
    by_day: dict[str, Counter[str]] = {}
    for row in rows:
        by_day.setdefault(ctx.raw(row, C_DAY).strip(), Counter())[ctx.raw(row, C_TEST).strip()[:5]] += 1
    for row in rows:
        day = ctx.raw(row, C_DAY).strip()
        label = ctx.raw(row, C_TEST).strip()
        common, n = by_day[day].most_common(1)[0]
        if label[:5] != common and n > 1:
            ctx.flag("label_inconsistent", row, C_TEST, label,
                     f"Test label {label} begins {label[:5]}, while the other Day {day} tests begin "
                     f"{common}.",
                     "Raw label kept verbatim; no correction attempted.")


def _common(ctx: Ctx, row: RawRow, end_col: str) -> dict[str, dict]:
    kpa, psi = ctx.pressure(row, C_P, "bar")
    return {
        "test_label": ctx.text(row, C_TEST),
        "fuel": ctx.text(row, C_FUEL),
        "pressure_kpa": kpa,
        "pressure_psi": psi,
        "outcome_label": ctx.text(row, end_col),
        "notes": ctx.text(row, C_COMMENTS),
        "flow_cm_s": ctx.missing("flow_cm_s", FLOW_NOTE),
        "gravity_level": ctx.constant("gravity", "microgravity (ISS)", GRAVITY_NOTE),
    }


def adapt_normal(ctx: Ctx) -> None:
    rows = list(ctx.rows())
    flag_day_code(ctx, rows)
    for row in rows:
        o2 = ctx.num(row, N_O2, "o2_pct", T.fraction_as_pct)
        xf = ctx.num(row, N_XF, "fuel_conc_pct", T.fraction_as_pct)
        if xf["v"] == 0:
            ctx.flag("implausible_value", row, N_XF, ctx.raw(row, N_XF),
                     f"Xf = 0 and {N_MHC} = {ctx.raw(row, N_MHC).strip()} for a listed flame test: no fuel "
                     f"flow is recorded, and Tad (K) and Zst read {ctx.raw(row, 'Tad (K)').strip()!r} and "
                     f"{ctx.raw(row, 'Zst').strip()!r} on this row.",
                     "Raw and value kept; flagged for review.")
        fields = _common(ctx, row, N_END)
        fields.update({
            "o2_pct": o2,
            "fuel_conc_pct": xf,
        })
        if o2["v"] is not None:
            fields["o2_basis"] = ctx.constant(
                "o2_basis", "chamber initial",
                "Header ' XO2 before test' in the Normal Flames table: chamber O2 at the start of each test.")
        ctx.emit(row, fields)


def adapt_inverse(ctx: Ctx) -> None:
    rows = list(ctx.rows())
    for col in I_CASE_COLS:
        flag_case_variants(ctx, rows, col)
    flag_day_code(ctx, rows)
    for row in rows:
        o2 = ctx.num(row, I_O2, "o2_pct", T.fraction_as_pct)
        fields = _common(ctx, row, I_END)
        fields.update({
            "o2_pct": o2,
            "fuel_conc_pct": ctx.missing(
                "fuel_conc_pct",
                "Inverse flames: 'Xf  before test' is the chamber-ambient fuel fraction, not a burner-stream "
                "fuel concentration; it stays in the raw columns."),
        })
        if o2["v"] is not None:
            fields["o2_basis"] = ctx.constant(
                "o2_basis", "oxidiser stream (inverse flame)",
                "Header 'XO2' in the Inverse Flames table: O2 fraction of the burner oxidiser stream.")
        ctx.emit(row, fields)


def adapt(ctx: Ctx) -> None:
    if ctx.table.table_key == "normal":
        adapt_normal(ctx)
    elif ctx.table.table_key == "inverse":
        adapt_inverse(ctx)
    else:
        raise KeyError(f"unknown table key {ctx.table.table_key}")


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="ACME-CFI-G",
    fuel_class="gas",
    test_kind="flame",
    tables=(
        TableSpec("normal", f"{TABLE_DIR}/PSI-159_Experimental table_CFI-G_Normal Flames.csv"),
        TableSpec("inverse", f"{TABLE_DIR}/PSI-159_Experimental table_CFI-G_Inverse Flames.csv"),
    ),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
