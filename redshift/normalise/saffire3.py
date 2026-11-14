"""SAFFIRE-III (PSI-100): Spacecraft Fire Experiment III, a large SIBAL fabric sample burned in Cygnus.

The burns took place in the Saffire flow duct on the Cygnus cargo vehicle after it left the ISS.

Column mapping (written out by hand so it can be audited):
- "Sample Number " -> test_label (raw text, "S1" or "S2")
- "Material" -> material, verbatim ("SIBAL Fabric")
- "Air Flow " -> flow_cm_s. The header gives no unit and every cell repeats one ("30 cm/s"); removing a
  unit written in the cell is not an allowed transform, so each cell is flagged non_numeric and flow_cm_s
  is null. (The PSI page Approach gives 30 cm/s for SAFFIRE-III; that page value is not copied in.)
- "Direction" -> notes, verbatim ("Concurrent" or "Opposed")
- o2_pct is null: the table has no oxygen column.
- pressure_kpa and pressure_psi are null: the table has no pressure column.
- gravity_level is the constant "microgravity (Cygnus)", from the PSI page Approach text. (The page's
  flight platform field says ISS, but the Approach and hardware fields say the burns ran in Cygnus.)
- Sample thickness, length and width and the camera file names are not canonical fields; they are kept
  in the raw record.
- The table has no test date column, so test_date is not recorded.

Both rows (lines 2 and 3) are burns; none is excluded.
"""

from __future__ import annotations

from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-100"

C_ID = "Sample Number"
C_MAT = "Material"
C_FLOW = "Air Flow"
C_DIR = "Direction"
GRAVITY_NOTE = ("SAFFIRE-III.md Approach: performed on the Cygnus resupply vehicle after it deberthed from "
                "the ISS; hardware 'Saffire III enclosure in Cygnus'.")


def adapt(ctx: Ctx) -> None:
    no_p = "The table has no pressure column; the PSI table does not record chamber pressure for these burns."
    for row in ctx.rows():
        ctx.emit(row, {
            "test_label": ctx.text(row, C_ID),
            "material": ctx.text(row, C_MAT),
            "o2_pct": ctx.missing("o2_pct", "The table has no oxygen column."),
            "flow_cm_s": ctx.num(row, C_FLOW, "flow_cm_s"),
            "pressure_kpa": ctx.missing("pressure_kpa", reason=no_p),
            "pressure_psi": ctx.missing("pressure_psi", reason=no_p),
            "notes": ctx.text(row, C_DIR),
            "gravity_level": ctx.constant("gravity_level", "microgravity (Cygnus)", GRAVITY_NOTE),
        })


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="SAFFIRE-III",
    fuel_class="solid",
    test_kind="burn",
    tables=(TableSpec("main", "SAFFIRE-III/experiment_table/PSI-100_Experimental table_SAFFIRE-3.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
