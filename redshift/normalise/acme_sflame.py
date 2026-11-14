"""ACME s-Flame (PSI-23): spherical diffusion flames from a porous spherical burner.

Each row of the PSI table summarises one test day (several flames), not a single flame. Fuel mixed with a
diluent issues from the spherical burner into an oxidising atmosphere, so the oxygen is the ambient.

Column mapping (written out by hand so it can be audited):
- "Test Day*" -> test_label, as text (YYDDD: two-digit year and day of the year in GMT, line 2 note).
- "Year", "Month" and "Date" -> test_date: the three cells joined with spaces exactly as written
  (for example "2019 Sept. 11"). Each Test Day is checked against these cells; a mismatch would be flagged
  date_inconsistent (none is found).
- "Atmosphere*" -> o2_pct. Every cell is free text such as "~21% O2 with N2" or "~30% and ~21% O2 with He".
  An approximate percentage inside text is not read as a number, so each cell is flagged non_numeric and
  o2_pct is null. The text is kept in notes. o2_basis is "ambient" on every row with an Atmosphere cell.
- "Fuel Bottle" -> fuel, verbatim (for example "50% C2H4 with N2"). The fuel percentage inside the label is
  not read as a number, so fuel_conc_pct is null.
- Fill-down errors: "~21% O2 with N3" (lines 3 and 7), "N4" (lines 4 and 8), "N5" (line 9) and "N6"
  (line 10) in Atmosphere, and "50% C2H4 with N3" (line 3) and "45% CH4 with N3" (line 5) in Fuel Bottle,
  follow the row above with the final number increased by 1. Each cell is flagged fill_down_error and kept
  verbatim; no diluent is corrected.
- "Flames Ignited*" -> n_flames (the number ignited on that day, as the line 4 note says).
- "Test Type", "Atmosphere*" and "Notes" -> notes, as "Test type: ...; Atmosphere: ...; Notes: ...". The
  notes on lines 2 to 4 are footnotes for the whole table, kept on the rows where they appear.
- Pressure: the table has no pressure column. The line 3 note says the atmosphere is about 1 atm and that
  pressure rises with vitiation; that approximate statement is not used as a value, so pressure_kpa and
  pressure_psi are null.
- Flow: the table has no flow column, so flow_cm_s is null.
- diluent is not set: it differs between rows (nitrogen or helium) and is recorded only inside free text.

Checks: line 11 is labelled "First round of tests with nitrogen-diluted fuel and oxygen" while its
Atmosphere and Fuel Bottle both say "with He"; it is flagged implausible_value and kept as written. The PSI
page gives investigation dates of 02-05-2015 to 11-24-2019 (month-day-year), but 14 rows (lines 6 to 19,
from 2019 Dec. 18 onwards) are dated after that end date; they are listed in one metadata_inconsistent
flag, and both the row dates and the page dates are kept.
"""

from __future__ import annotations

import datetime as dt

from redshift.normalise import acme_shared as S
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-23"

C_TYPE = "Test Type"
C_DAY = "Test Day*"
C_YEAR = "Year"
C_MONTH = "Month"
C_DATE = "Date"
C_ATM = "Atmosphere*"
C_FUEL = "Fuel Bottle"
C_FLAMES = "Flames Ignited*"
C_NOTES = "Notes"

# PSI page (ACME-s-Flame.md line 16): "Investigation dates | 02-05-2015 to 11-24-2019". Used only for a check.
PAGE_END = dt.date(2019, 11, 24)

PRESSURE_NOTE = ("No pressure column. The table note on line 3 says \"*Atmosphere is ~1 atm but pressure "
                 "increases and O2% drops with vitiation.\" An approximate statement is not used as a value.")


def adapt(ctx: Ctx) -> None:
    fill_atm = S.FillDownCheck(ctx, C_ATM)
    fill_fuel = S.FillDownCheck(ctx, C_FUEL)
    spelling = S.SpellingCheck(ctx, C_FUEL)
    late: list[int] = []
    for row in ctx.rows():
        fill_atm.check(row)
        fill_fuel.check(row)
        spelling.check(row)
        S.check_day_of_year(ctx, row, C_DAY, C_YEAR, C_MONTH, C_DATE)
        d = S.row_date(ctx, row, C_YEAR, C_MONTH, C_DATE)
        if d is not None and d > PAGE_END:
            late.append(row.line)

        ttype, atm, fuel_raw = (ctx.raw(row, c) for c in (C_TYPE, C_ATM, C_FUEL))
        if "nitrogen-diluted" in ttype and "with He" in atm and "with He" in fuel_raw:
            ctx.flag("implausible_value", row, C_TYPE, ttype.strip(),
                     f"Test Type says nitrogen-diluted, but Atmosphere ('{atm.strip()}') and Fuel Bottle "
                     f"('{fuel_raw.strip()}') on this row both say helium.",
                     "All three cells kept as recorded; row kept.")

        o2 = ctx.num(row, C_ATM, "o2_pct", S.single_percent("Atmosphere*"))
        fields = {
            "test_label": ctx.text(row, C_DAY),
            "test_date": S.date_text(ctx, row, C_YEAR, C_MONTH, C_DATE),
            "fuel": ctx.text(row, C_FUEL),
            "o2_pct": o2,
            "n_flames": ctx.num(row, C_FLAMES, "n_flames"),
            "fuel_conc_pct": ctx.missing(
                "fuel_conc_pct", "The fuel percentage appears only inside the Fuel Bottle label (for example "
                "'50% C2H4 with N2'); it is not read out of text."),
            "pressure_kpa": ctx.missing("pressure_kpa", PRESSURE_NOTE),
            "pressure_psi": ctx.missing("pressure_psi", PRESSURE_NOTE),
            "flow_cm_s": ctx.missing("flow_cm_s", "The table has no flow column."),
            "gravity_level": S.gravity(ctx),
            "notes": S.notes(ctx, row, [("Test type", C_TYPE, None), ("Atmosphere", C_ATM, o2),
                                        ("Notes", C_NOTES, None)]),
        }
        if atm.strip():
            fields["o2_basis"] = ctx.constant(
                "o2_basis", "ambient",
                "PSI page Approach: fuel and diluent issue from a spherical porous burner into an oxidising "
                "environment; the table column is headed 'Atmosphere'.")
        ctx.emit(row, fields)
    spelling.finish()
    if late:
        ctx.flag("metadata_inconsistent", None, C_YEAR, None,
                 f"{len(late)} rows (lines {late[0]} to {late[-1]}) are dated after the investigation end "
                 "date given on the PSI page (ACME-s-Flame.md line 16: 02-05-2015 to 11-24-2019).",
                 "Row dates and page metadata kept as recorded.", rows=late)


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="ACME-s-Flame",
    fuel_class="gas",
    test_kind="flame",
    tables=(TableSpec("main", "ACME-s-Flame/experiment_table/PSI-23_Experimental table_ACME s-Flame.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
