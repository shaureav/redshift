"""SAME-R (PSI-101): Smoke Aerosol Measurement Experiment Reflight, smoke from overheated materials.

These are smoke tests: the samples were heated to produce smoke, not burned to a flame. Rows whose test
number ends in "a" (for example "51a", Description "aged") are a later measurement of the same smoke after
ageing; they are rows of the table and are kept as records.

Column mapping (written out by hand so it can be audited):
- "SAME Test #" -> test_label, verbatim.
- "Sample Type" -> material, verbatim (Kapton, Silicone, Lampwick, Teflon, Pyrell).
- "Date" -> test_date, verbatim (for example "21-Jul"). The dates have no year; the PSI page gives the flight
  tests as July 16 to September 9, 2010. No year is added.
- "Description" -> notes, verbatim.
- "Inlet velocity (cm/s)" -> flow_cm_s; the header states cm/s. A value of 0 is a recorded no-flow run.
- "Rt/R0", "Duration (sec)", "Primary aging time (sec)", "Primary mixing time (sec)" and "Net aging time
  (sec)" have no canonical field and stay in the raw record.
- Test 57 appears twice, as Lampwick (line 57) and as Teflon (line 75), with the same values in every other
  column. Both rows are kept and flagged near_duplicate.
- o2_pct and pressure: the table has no column for them, so they are null.
- gravity_level: "microgravity (ISS)", from the PSI page flight platform.
"""

from __future__ import annotations

from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-101"

C_TYPE = "Sample Type"
C_ID = "SAME Test #"
C_DESC = "Description"
C_DATE = "Date"
C_FLOW = "Inlet velocity (cm/s)"


def adapt(ctx: Ctx) -> None:
    gravity = ctx.constant("gravity", "microgravity (ISS)", "SAME-R.md: flight platform International Space Station.")
    seen: dict[str, RawRow] = {}
    type_idx = ctx.table.col(C_TYPE)
    for row in ctx.rows():
        ident = ctx.raw(row, C_ID).strip()
        if ident in seen:
            first = seen[ident]
            others_same = all(
                a == b for i, (a, b) in enumerate(zip(first.cells, row.cells, strict=True)) if i != type_idx
            )
            same_txt = "the same values in every other column" if others_same else "different values"
            ctx.flag(
                "near_duplicate",
                row,
                C_ID,
                ident,
                f"SAME Test # {ident} appears on line {first.line} ({ctx.raw(first, C_TYPE)}) and on "
                f"line {row.line} ({ctx.raw(row, C_TYPE)}) with {same_txt}.",
                "Both rows kept.",
                rows=[first.line, row.line],
            )
        else:
            seen[ident] = row
        ctx.emit(
            row,
            {
                "test_label": ctx.text(row, C_ID),
                "material": ctx.text(row, C_TYPE),
                "test_date": ctx.text(row, C_DATE),
                "notes": ctx.text(row, C_DESC),
                "flow_cm_s": ctx.num(row, C_FLOW, "flow_cm_s"),
                "o2_pct": ctx.missing("o2_pct", "The SAME-R table has no oxygen column."),
                "pressure_kpa": ctx.missing("pressure_kpa", "The SAME-R table has no pressure column."),
                "pressure_psi": ctx.missing("pressure_psi", "The SAME-R table has no pressure column."),
                "gravity_level": gravity,
            },
        )
    ctx.flag(
        "date_inconsistent",
        None,
        C_DATE,
        None,
        "Dates give day and month only (for example '21-Jul'), with no year. SAME-R.md gives the flight "
        "tests as July 16 to September 9, 2010.",
        "Raw kept; no year added.",
        rows=[],
    )


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="SAME-R",
    fuel_class="solid",
    test_kind="smoke",
    tables=(TableSpec("main", "SAME-R/experiment_table/PSI-101_Experimental table_SAME-R.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
