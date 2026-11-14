"""ACME Flame Design (PSI-10): normal and inverse spherical diffusion flames on porous burners aboard the ISS.

There are two tables, one for normal flames (fuel, diluted with N2, flows from the burner into an
oxygen-bearing chamber) and one for inverse flames (an O2 and N2 stream flows from the burner into an
ethylene-bearing chamber). Columns are mapped by hand, by exact header text.

Normal Flame table ("normal"):
- "Test" -> test_label, verbatim (for example "19115A1").
- "Fuel" -> fuel, verbatim ("C2H4" or "C3H8").
- "XO2 (init)" -> o2_pct (fraction_to_pct). The values run from 0.1980 to 0.4000, so they are mole fractions.
  In a normal flame the oxygen is in the chamber, and the header marks this as the initial value (a separate
  "XO2 (final)" column gives the value at the end of the test), so o2_basis is "chamber initial". "XO2
  (final)" is not mapped.
- "pmean (atm)" -> pressure_kpa (atm_to_kpa) and pressure_psi. The header states the unit as atm. On lines
  189 to 208 (day 13, C3H8) "pmean (atm)", "pfinal (atm)" and "XO2 (final)" are blank, so pressure_kpa is
  null there. "pinit (atm)" is recorded on those lines but is a different quantity and is never substituted;
  the gap is flagged missing_column with the lines listed.
- "Xfuel" -> fuel_conc_pct (fraction_to_pct): the fuel mole fraction of the burner stream (1 where "mN2
  (mg/s)" is 0). Where the cell reads "RAMPED" (lines 3, 5 and 7) or "RAMP" (57 rows) the value is null and
  each cell is flagged non_numeric; no value is inferred from neighbouring tests.
- outcome_label is not set: the table has no outcome column.
- Not mapped (kept in the raw columns): "Flame Type", "Day", "mfuel (mg/s)", "mN2 (mg/s)", "mtot (mg/s)",
  "XO2 (final)", "pinit (atm)", "pfinal (atm)", "mean Zst" and "Tad (K)". These also hold "RAMPED" or "RAMP"
  on the same rows; cells in columns that are not read are not parsed, so they raise no value flags.

Inverse Flame table ("inverse"):
- "Test" -> test_label, verbatim.
- "XO2" -> o2_pct (fraction_to_pct). The values run from 0.2120 to 0.8500, so they are mole fractions. In an
  inverse flame this is the oxygen fraction of the oxidiser stream leaving the burner (the table gives its
  mass flows "mO2 (mg/s)" and "mN2 (mg/s)"), so o2_basis is "oxidiser stream (inverse flame)". Where XO2
  reads "RAMP" (lines 31 to 33, 77, 78, 87, 88, 94 and 104) or "LOW O2" (lines 89 and 90) the value is null
  and the cell is flagged non_numeric.
- "pmean (atm)" -> pressure_kpa (atm_to_kpa) and pressure_psi.
- fuel is null ("not recorded") for this table and flagged missing_column. The table has no Fuel column, and
  the PSI page does not state which fuel the inverse flames used: its Objectives (ACME-Flame-Design.md lines
  25 to 27) name both C2H4 and CH4 for normal and inverse flames. The headers "XC2H4 initial" and "XC2H4
  final" point to C2H4 in the chamber, but a fuel is set as a per-table constant only when the PSI page
  states it, so no fuel is filled in here; readers can see those headers in the raw columns.
- fuel_conc_pct is null for this table. "XC2H4 initial" is the fuel mole fraction of the chamber ambient, not
  of a burner stream, and there is no canonical field that records which stream a fuel fraction belongs to,
  so it is left in the raw columns rather than mixed with burner-stream values from other tables.
- outcome_label is not set: the table has no outcome column.
- Line 87 has the test label "22042M1" among day 6 tests whose labels all begin "22024"; it is flagged
  label_inconsistent and kept verbatim.
- Not mapped (kept in the raw columns): "Flame Type", "Day", "mO2 (mg/s)", "mN2 (mg/s)", "mtot (mg/s)",
  "XC2H4 initial", "XC2H4 final", "pinit (atm)", "pfinal (atm)", "mean Zst" and "Tad (K)".

Both tables:
- Flow: the burner flows are recorded as mass flow rates in mg/s, not as velocities in cm/s, so flow_cm_s is
  null. The tables have no CO2, He, N2 percentage or flame-count column, and no calendar date.
- gravity_level is "microgravity (ISS)" from the PSI page (flight platform: International Space Station).
- PSI shows no licence for this investigation (ACME-Flame-Design.md line 19 is a dash); this is recorded as a
  no_licence flag.
"""

from __future__ import annotations

from collections import Counter

from redshift import transforms as T
from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-10"

C_TEST = "Test"
C_DAY = "Day"
C_P = "pmean (atm)"

N_FUEL = "Fuel"
N_O2 = "XO2 (init)"
N_XF = "Xfuel"
N_PBLANK = ("pmean (atm)", "pfinal (atm)", "XO2 (final)")

I_O2 = "XO2"

GRAVITY_NOTE = "PSI page ACME-Flame-Design.md line 12: flight platform International Space Station (ISS)."
FLOW_NOTE = "Burner flows are recorded as mass flow rates in mg/s, not cm/s."
N2_NOTE = "N2 is recorded only as a burner mass flow 'mN2 (mg/s)', not as a percentage."
TABLE_DIR = "ACME-Flame-Design/experiment_table"
FUEL_NOTE = (
    "The Inverse Flame table has no Fuel column, and the PSI page (ACME-Flame-Design.md lines 25 to "
    "27) names both C2H4 and CH4 without saying which the inverse flames used. The headers 'XC2H4 "
    "initial' and 'XC2H4 final' point to C2H4 but are not used to fill the field."
)


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
            ctx.flag(
                "label_inconsistent",
                row,
                C_TEST,
                label,
                f"Test label {label} begins {label[:5]}, while the other Day {day} tests begin {common}.",
                "Raw label kept verbatim; no correction attempted.",
            )


def _common(ctx: Ctx, row: RawRow) -> dict[str, dict]:
    kpa, psi = ctx.pressure(row, C_P, "atm")
    return {
        "test_label": ctx.text(row, C_TEST),
        "pressure_kpa": kpa,
        "pressure_psi": psi,
        "flow_cm_s": ctx.missing("flow_cm_s", FLOW_NOTE),
        "n2_pct": ctx.missing("n2_pct", N2_NOTE),
        "gravity_level": ctx.constant("gravity", "microgravity (ISS)", GRAVITY_NOTE),
    }


def _no_licence(ctx: Ctx) -> None:
    if ctx.table.table_key == "normal":
        ctx.flag(
            "no_licence",
            None,
            None,
            None,
            "ACME-Flame-Design.md line 19 shows a dash placeholder in the License row and names no licence.",
            "Recorded once for the investigation; data cited by the PSI DOI.",
            rows=[],
        )


def adapt_normal(ctx: Ctx) -> None:
    rows = list(ctx.rows())
    flag_day_code(ctx, rows)
    blank_p = [row.line for row in rows if all(ctx.raw(row, c).strip() == "" for c in N_PBLANK)]
    if blank_p:
        ctx.flag(
            "missing_column",
            None,
            C_P,
            "",
            f"'pmean (atm)', 'pfinal (atm)' and 'XO2 (final)' are blank on {len(blank_p)} rows (lines "
            f"{blank_p[0]} to {blank_p[-1]}). 'pinit (atm)' is recorded there but is not substituted.",
            "pressure_kpa and pressure_psi are null ('not recorded') on these rows.",
            rows=blank_p,
        )
    for row in rows:
        o2 = ctx.num(row, N_O2, "o2_pct", T.fraction_as_pct)
        fields = _common(ctx, row)
        fields.update(
            {
                "fuel": ctx.text(row, N_FUEL),
                "o2_pct": o2,
                "fuel_conc_pct": ctx.num(row, N_XF, "fuel_conc_pct", T.fraction_as_pct),
            }
        )
        if o2["v"] is not None:
            fields["o2_basis"] = ctx.constant(
                "o2_basis",
                "chamber initial",
                "Header 'XO2 (init)' in the Normal Flame table: chamber O2 at the start of each test.",
            )
        ctx.emit(row, fields)


def adapt_inverse(ctx: Ctx) -> None:
    rows = list(ctx.rows())
    flag_day_code(ctx, rows)
    for row in rows:
        o2 = ctx.num(row, I_O2, "o2_pct", T.fraction_as_pct)
        fields = _common(ctx, row)
        fields.update(
            {
                "fuel": ctx.missing("fuel", FUEL_NOTE),
                "o2_pct": o2,
                "fuel_conc_pct": ctx.missing(
                    "fuel_conc_pct",
                    "Inverse flames: 'XC2H4 initial' is the chamber-ambient fuel fraction, not a burner-stream "
                    "fuel concentration; it stays in the raw columns.",
                ),
            }
        )
        if o2["v"] is not None:
            fields["o2_basis"] = ctx.constant(
                "o2_basis",
                "oxidiser stream (inverse flame)",
                "Header 'XO2' in the Inverse Flame table: O2 fraction of the burner oxidiser stream.",
            )
        ctx.emit(row, fields)


def adapt(ctx: Ctx) -> None:
    _no_licence(ctx)
    if ctx.table.table_key == "normal":
        adapt_normal(ctx)
    elif ctx.table.table_key == "inverse":
        adapt_inverse(ctx)
    else:
        raise KeyError(f"unknown table key {ctx.table.table_key}")


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="ACME-Flame-Design",
    fuel_class="gas",
    test_kind="flame",
    tables=(
        TableSpec("normal", f"{TABLE_DIR}/PSI-10_Experimental table_Flame Design_Normal Flame.csv"),
        TableSpec("inverse", f"{TABLE_DIR}/PSI-10_Experimental table_Flame Design_Inverse Flame.csv"),
    ),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
