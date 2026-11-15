"""ACME CLD Flame (PSI-21): coflow laminar diffusion flames of nitrogen-diluted methane and ethylene.

Each row of the PSI table summarises one test day (several flames), not a single flame.

Column mapping (written out by hand so it can be audited):
- "Test Day" -> test_label and test_date, as text. The line 2 note says the value is the two-digit year
  followed by the three-digit day of the year (for example "17319"); it is not converted to a date.
- "Fuel Bottle" -> fuel, verbatim. 26 of the 32 labels carry spreadsheet fill-down errors (for example
  "40% CH5" to "40% CH14", "100% C2H5" to "100% C2H11"). Each affected cell is flagged fill_down_error and
  the label is kept exactly as written; no formula is corrected.
- "Fuel conc. Range" -> fuel_conc_pct, read as a single percentage. Most cells are ranges such as
  "30%-40%"; a range is not one value, so those cells are flagged non_numeric and fuel_conc_pct is null.
  Single values such as "40%" are read as written.
- "Flames ignited" -> n_flames (the number ignited on that test day, as the line 2 note says).
- "Test Type" and "Notes" -> notes, as "Test type: ...; Notes: ...". The note on line 2 is a footnote for
  the whole table, kept on the row where it appears.
- "Fuel MFC" and "N2 MFC" are the maximum flow rates of the mass flow controllers used (slpm on a
  nitrogen basis, line 2 note). They are equipment ranges, not flow velocities, so they are not mapped to
  flow_cm_s; they stay in the raw row.
- diluent is "N2" (the fuel diluent), a table constant from the line 2 note ("as diluted with nitrogen on
  a volume basis").
- Oxygen, pressure and flow: the table has no column for any of them, so o2_pct, pressure_kpa,
  pressure_psi and flow_cm_s are null.
"""

from __future__ import annotations

from redshift.normalise import acme_shared as S
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-21"

C_TYPE = "Test Type"
C_DAY = "Test Day"
C_FUEL = "Fuel Bottle"
C_CONC = "Fuel conc. Range"
C_FLAMES = "Flames ignited"
C_NOTES = "Notes"


def adapt(ctx: Ctx) -> None:
    fill = S.FillDownCheck(ctx, C_FUEL)
    spelling = S.SpellingCheck(ctx, C_FUEL)
    for row in ctx.rows():
        fill.check(row)
        spelling.check(row)
        day = ctx.text(row, C_DAY)
        ctx.emit(
            row,
            {
                "test_label": day,
                "test_date": day,
                "fuel": ctx.text(row, C_FUEL),
                "fuel_conc_pct": ctx.num(row, C_CONC, "fuel_conc_pct", S.single_percent("Fuel conc. Range")),
                "n_flames": ctx.num(row, C_FLAMES, "n_flames"),
                "o2_pct": ctx.missing("o2_pct", "The table has no oxygen column."),
                "pressure_kpa": ctx.missing("pressure_kpa", "The table has no pressure column."),
                "pressure_psi": ctx.missing("pressure_psi", "The table has no pressure column."),
                "flow_cm_s": ctx.missing(
                    "flow_cm_s",
                    "The table has no flow velocity column; Fuel MFC and N2 MFC are controller "
                    "ranges in slpm, not flows.",
                ),
                "diluent": ctx.constant(
                    "diluent", "N2", "Table Notes line 2: fuel 'diluted with nitrogen on a volume basis'."
                ),
                "gravity_level": S.gravity(ctx),
                "notes": S.notes(ctx, row, [("Test type", C_TYPE, None), ("Notes", C_NOTES, None)]),
            },
        )
    spelling.finish()


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="ACME-CLD-Flame",
    fuel_class="gas",
    test_kind="flame",
    tables=(TableSpec("main", "ACME-CLD-Flame/experiment_table/PSI-21_Experimental table_CLD Flame.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
