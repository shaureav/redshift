"""DAFT / DAFT-2 (PSI-47): Dust and Aerosol Measurement Feasibility Test, aerosol counter checks on the ISS.

DAFT tested particle counters with a dust aerosol; nothing was burned. The 2 rows are dust sampling
sessions. They are kept as records with fuel class "none" and test kind "dust", so they never mix with
fire evidence.

Column mapping (written out by hand so it can be audited):
- "Session Name" -> test_label, verbatim ("D1", "D2").
- "Actual Day" -> test_date, verbatim (for example "GMT 54 (2005)").
- "Sample Material" -> material, verbatim ("Arizona Road Dust (ARD Fine) in combination with ISS GN2 ...").
  The PSI page Approach calls the same standard "Arizona Red Dust (ARD)"; the two names are kept as written
  and flagged label_inconsistent.
- "Hardware Description" -> notes, verbatim (which counter the session used).
- "Sampled Location" has no canonical field and stays in the raw record.
- o2_pct, pressure and flow: the table has no column for them, so they are null.
- gravity_level: "microgravity (ISS)", from the PSI page flight platform.
"""

from __future__ import annotations

from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-47"

C_ID = "Session Name"
C_DAY = "Actual Day"
C_HW = "Hardware Description"
C_MAT = "Sample Material"


def adapt(ctx: Ctx) -> None:
    gravity = ctx.constant(
        "gravity", "microgravity (ISS)", "DAFT-DAFT-2.md: flight platform International Space Station."
    )
    road_lines: list[int] = []
    for row in ctx.rows():
        if "Arizona Road Dust" in ctx.raw(row, C_MAT):
            road_lines.append(row.line)
        ctx.emit(
            row,
            {
                "test_label": ctx.text(row, C_ID),
                "test_date": ctx.text(row, C_DAY),
                "material": ctx.text(row, C_MAT),
                "notes": ctx.text(row, C_HW),
                "o2_pct": ctx.missing("o2_pct", "The DAFT table has no oxygen column; nothing was burned."),
                "pressure_kpa": ctx.missing("pressure_kpa", "The DAFT table has no pressure column."),
                "pressure_psi": ctx.missing("pressure_psi", "The DAFT table has no pressure column."),
                "gravity_level": gravity,
            },
        )
    if road_lines:
        ctx.flag(
            "label_inconsistent",
            None,
            C_MAT,
            "Arizona Road Dust (ARD Fine)",
            "The table names the aerosol standard 'Arizona Road Dust (ARD Fine)'; DAFT-DAFT-2.md "
            "Approach calls it 'Arizona Red Dust (ARD)'.",
            "Raw labels kept verbatim.",
            rows=road_lines,
        )


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="DAFT-DAFT-2",
    fuel_class="none",
    test_kind="dust",
    tables=(TableSpec("main", "DAFT-DAFT-2/experiment_table/PSI-47_Experimental table_DAFT.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
