"""SLICE (PSI-106): Structure and Liftoff In Combustion Experiment, gas jet flames in co-flowing air.

The SLICE table has only two columns, and each row is one day of testing, not one flame: the "Fuel Type"
cell often adds what else was run that day (for example "including 1 pyrometry calibration test").

Column mapping (written out by hand so it can be audited):
- "Test Date" -> test_date, verbatim after trimming (for example "2012-FEB-09"). Several cells carry
  trailing prose after the date ("2012-FEB-13 SLICE testing with "); those cells are flagged
  date_inconsistent and kept as written.
- "Fuel Type" -> fuel, verbatim (for example "40% CH4 (balance N2) including 2 pyrometry calibration tests and
  2 fan calibrations"). No number is read out of this text; fuel_conc_pct is null.
- Line 13 reads "2012-MAR-23 Last day of testing: SPICE testing with 100% C3H8 and then 100%" with fuel
  "100% C2H4". It describes SPICE testing on the last day rather than a SLICE run. It is kept as a record,
  because it records a day of testing in this table and is not clearly a non-test row, and it is flagged
  implausible_value so it can be reviewed.
- o2_pct, pressure and flow: the table has no column for them, so they are null.
- gravity_level: "microgravity (ISS)", from the PSI page flight platform.
"""

from __future__ import annotations

import re

from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-106"

C_DATE = "Test Date"
C_FUEL = "Fuel Type"

_DATE = re.compile(r"^\d{4}-[A-Z]{3}-\d{2}$")


def adapt(ctx: Ctx) -> None:
    gravity = ctx.constant("gravity", "microgravity (ISS)", "SLICE.md: flight platform International Space Station.")
    for row in ctx.rows():
        date_raw = ctx.raw(row, C_DATE)
        if not _DATE.match(date_raw.strip()):
            ctx.flag(
                "date_inconsistent",
                row,
                C_DATE,
                date_raw,
                "Test Date carries text after the date.",
                "Raw kept verbatim; no text removed.",
            )
        if "SPICE" in date_raw:
            ctx.flag(
                "implausible_value",
                row,
                C_DATE,
                date_raw,
                "The Test Date cell describes SPICE testing (100% C3H8 and then 100% C2H4) on the last "
                "day, not a SLICE run.",
                "Row kept and flagged for review.",
            )
        ctx.emit(
            row,
            {
                "test_date": ctx.text(row, C_DATE),
                "fuel": ctx.text(row, C_FUEL),
                "o2_pct": ctx.missing("o2_pct", "The SLICE table has no oxygen column."),
                "pressure_kpa": ctx.missing("pressure_kpa", "The SLICE table has no pressure column."),
                "pressure_psi": ctx.missing("pressure_psi", "The SLICE table has no pressure column."),
                "gravity_level": gravity,
            },
        )


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="SLICE",
    fuel_class="gas",
    test_kind="flame",
    tables=(TableSpec("main", "SLICE/experiment_table/PSI-106_Experimental table_Slice.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
