"""ACME E-FIELD Flames (PSI-22): laminar diffusion flames of methane and ethylene under an electric field.

Each row of the PSI table summarises one test day (several flames), not a single flame.

Column mapping (written out by hand so it can be audited):
- "Test Day" -> test_label, as text (YYDDD: two-digit year and day of the year in GMT, line 2 note).
- "Year", "Month" and "Date" -> test_date: the three cells joined with spaces exactly as written
  (for example "2018 3 14"). Each Test Day is checked against these cells; a mismatch would be flagged
  date_inconsistent (none is found).
- "Fuel Bottle" -> fuel, verbatim.
- "Fuel Conc" -> fuel_conc_pct, read as a single percentage (the trailing '%' is removed).
- "Flames Ignited" -> n_flames (the number ignited on that day, as the line 5 note says).
- "Test Type", "Mesh Polarity" and "Notes" -> notes, as "Test type: ...; Mesh polarity: ...; Notes: ...".
  The notes on lines 2 to 5 are footnotes for the whole table, kept on the rows where they appear.
- diluent is "N2" (the fuel diluent), a table constant from the line 4 note ("diluted with nitrogen on a
  volume basis").
- Oxygen, pressure and flow: the table has no column for any of them, so o2_pct, pressure_kpa,
  pressure_psi and flow_cm_s are null.

Continuation rows: some rows have an empty Test Type and carry only a Fuel Conc (for example
",,,,,,,100%,,"), apparently a further fuel concentration used on the test day above. They are kept as
test rows with only fuel_conc_pct (and, on line 4, notes) recorded. Nothing is filled down from the row
above, so their test day, fuel and flame count are null. Rows that are byte-identical to an earlier row are
removed automatically. Lines 30 to 33 repeat lines 26 to 29 (the 18319 test day), and the "100%" stubs
on lines 15, 19, 25, 29 and 33 are identical to the stub on line 7, so all eight are recorded as removed
copies (line 33 as a copy of line 7, its first occurrence). Because a stub carries no test day, an
identical stub under a different test day cannot be told apart from a repeat, so the automatic rule
applies; the removed lines are listed in the reconciliation.
"""

from __future__ import annotations

from redshift.normalise import acme_shared as S
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-22"

C_TYPE = "Test Type"
C_DAY = "Test Day"
C_YEAR = "Year"
C_MONTH = "Month"
C_DATE = "Date"
C_POL = "Mesh Polarity"
C_FUEL = "Fuel Bottle"
C_CONC = "Fuel Conc"
C_FLAMES = "Flames Ignited"
C_NOTES = "Notes"


def adapt(ctx: Ctx) -> None:
    fill = S.FillDownCheck(ctx, C_FUEL)
    spelling = S.SpellingCheck(ctx, C_FUEL)
    for row in ctx.rows():
        fill.check(row)
        spelling.check(row)
        S.check_day_of_year(ctx, row, C_DAY, C_YEAR, C_MONTH, C_DATE)
        ctx.emit(
            row,
            {
                "test_label": ctx.text(row, C_DAY),
                "test_date": S.date_text(ctx, row, C_YEAR, C_MONTH, C_DATE),
                "fuel": ctx.text(row, C_FUEL),
                "fuel_conc_pct": ctx.num(row, C_CONC, "fuel_conc_pct", S.single_percent("Fuel Conc")),
                "n_flames": ctx.num(row, C_FLAMES, "n_flames"),
                "o2_pct": ctx.missing("o2_pct", "The table has no oxygen column."),
                "pressure_kpa": ctx.missing("pressure_kpa", "The table has no pressure column."),
                "pressure_psi": ctx.missing("pressure_psi", "The table has no pressure column."),
                "flow_cm_s": ctx.missing("flow_cm_s", "The table has no flow column."),
                "diluent": ctx.constant(
                    "diluent", "N2", "Table Notes line 4: fuel 'diluted with nitrogen on a volume basis'."
                ),
                "gravity_level": S.gravity(ctx),
                "notes": S.notes(
                    ctx, row, [("Test type", C_TYPE, None), ("Mesh polarity", C_POL, None), ("Notes", C_NOTES, None)]
                ),
            },
        )
    spelling.finish()


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="ACME-E-FIELD-Flames",
    fuel_class="gas",
    test_kind="flame",
    tables=(
        TableSpec("main", "ACME-E-FIELD-Flames/experiment_table/PSI-22_Experimental table_ACME E-FIELD Flames.csv"),
    ),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
