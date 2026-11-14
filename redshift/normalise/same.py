"""SAME (PSI-102): Smoke and Aerosol Measurement Experiment, smoke from overheated spacecraft materials.

These are smoke tests: the samples were heated to produce smoke, not burned to a flame.

Column mapping (written out by hand so it can be audited):
- "Sample #" -> test_label, verbatim.
- "Sample Material  " -> material, verbatim.
- "Air Flow (cm/s)" -> flow_cm_s; the header states cm/s.
- "Weight loss rate (mg/min)" and "Aging Duration (minutes)" have no canonical field and stay in the raw
  record.
- Lines 6 to 9 (samples 5 to 8) give only a material and the note "same conditions as 1-4", for example
  "Kapton: same conditions as 1-4", with the other cells empty. Each names a sample that was tested, so they
  are kept as test records. The material text is kept verbatim and the conditions of samples 1 to 4 are not
  copied into them, so their flow is null (not recorded).
- o2_pct and pressure: the table has no column for them, so they are null.
- gravity_level: "microgravity (ISS)", from the PSI page flight platform.
"""

from __future__ import annotations

from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-102"

C_ID = "Sample #"
C_MAT = "Sample Material"
C_FLOW = "Air Flow (cm/s)"


def adapt(ctx: Ctx) -> None:
    gravity = ctx.constant("gravity", "microgravity (ISS)", "SAME.md: flight platform International Space Station.")
    for row in ctx.rows():
        ctx.emit(
            row,
            {
                "test_label": ctx.text(row, C_ID),
                "material": ctx.text(row, C_MAT),
                "flow_cm_s": ctx.num(row, C_FLOW, "flow_cm_s"),
                "o2_pct": ctx.missing("o2_pct", "The SAME table has no oxygen column."),
                "pressure_kpa": ctx.missing("pressure_kpa", "The SAME table has no pressure column."),
                "pressure_psi": ctx.missing("pressure_psi", "The SAME table has no pressure column."),
                "gravity_level": gravity,
            },
        )


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="SAME",
    fuel_class="solid",
    test_kind="smoke",
    tables=(TableSpec("main", "SAME/experiment_table/PSI-102_Experimental table_SAME.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
