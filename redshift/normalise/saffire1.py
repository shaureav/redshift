"""SAFFIRE-I (PSI-98): Spacecraft Fire Safety Experiment I, a large SIBAL fabric sample burned in Cygnus.

The burns took place in the Saffire flow duct on the Cygnus cargo vehicle after it left the ISS.

Column mapping (written out by hand so it can be audited):
- "Sample Number " -> test_label (raw text, "S1" or "S2")
- "Material" -> material, verbatim ("SIBAL Fabric")
- "Percent O2" -> o2_pct (percent). The value is the oxygen in the cabin air drawn through the duct, so
  o2_basis is "ambient". Both cells are written as a range or an approximation ("21.5 - 21.7" and
  "~ 21.5"); no number is taken from such text, so both are flagged non_numeric and o2_pct is null.
- "Air Flow (cm/s)" -> flow_cm_s (the header states cm/s)
- "Flow Direction " -> notes, verbatim ("Concurrent" or "Opposed")
- pressure_kpa and pressure_psi are null: the table has no pressure column.
- gravity_level is the constant "microgravity (Cygnus)", from the PSI page Approach text. (The page's
  flight platform field says ISS, but the Approach and hardware fields say the burns ran in Cygnus.)
- Sample thickness, length and width, ignition power and time, burn time and the camera file names are
  not canonical fields; they are kept in the raw record.
- The table has no test date column, so test_date is not recorded.

Rows that are not tests: lines 4 and 5 ("F1C1/F1C2" and "F2C1/F2C2", "Pre-test flow visulation data for
sample 1" and "... sample 2") list flow-visualisation camera files recorded before the burns. They hold
no burn data and are excluded. Lines 2 and 3 are the two burns.

Checks (each one only adds a flag; no value is changed):
- swapped_columns on "Sample Length (cm)" and "Sample Width (cm)" when the length is shorter than the
  width. Lines 2 and 3 give length 40.6 and width 94. The SAFFIRE-I page Approach says the sample was
  about 0.94 m long and 0.4 m wide, and the SAFFIRE-III table gives length 94 cm and width 40.6 cm for
  the same SIBAL sample size. The values are kept as written; no swap is applied.
- unit_unclear on "Sample Thickness (cm)": 0.37 cm here and ".33 cm" in SAFFIRE-III, but SAFFIRE-II
  lists SIBAL as "037 mm", which cannot be read as a number and is in a different unit. The files do not
  settle which unit is right.
"""

from __future__ import annotations

from redshift import transforms as T
from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-98"

C_ID = "Sample Number"
C_MAT = "Material"
C_THICK = "Sample Thickness (cm)"
C_LEN = "Sample Length (cm)"
C_WID = "Sample Width (cm)"
C_FLOW = "Air Flow (cm/s)"
C_O2 = "Percent O2"
C_DIR = "Flow Direction"

FLOW_VIS_MARKER = "pre-test flow visulation data"
GRAVITY_NOTE = ("SAFFIRE-I.md Approach: performed on the Cygnus resupply vehicle after it deberthed from the "
                "ISS; hardware 'Saffire 1 enclosure in Cygnus'.")


def _is_flow_visualisation(ctx: Ctx, row: RawRow) -> bool:
    others = [c for i, c in enumerate(row.cells) if i not in (ctx.table.col(C_ID), ctx.table.col(C_MAT))]
    marked = ctx.raw(row, C_MAT).strip().lower().startswith(FLOW_VIS_MARKER)
    return marked and all(not c.strip() for c in others)


def check_dimensions(ctx: Ctx, row: RawRow) -> None:
    raw_l, raw_w = ctx.raw(row, C_LEN), ctx.raw(row, C_WID)
    try:
        length, _ = T.number(raw_l)
        width, _ = T.number(raw_w)
    except T.NotClean:
        return
    if length is not None and width is not None and length < width:
        ctx.flag("swapped_columns", row, C_LEN, f"{raw_l},{raw_w}",
                 f"Sample Length {raw_l} cm is shorter than Sample Width {raw_w} cm. SAFFIRE-I.md "
                 "Approach (quoted): 'The sample was approximately 0.94 meters long and 0.4 meters wide'; "
                 "the SAFFIRE-III table (lines 2 and 3) gives Length 94 cm and Width 40.6 cm.",
                 "Raw kept; no swap applied (length and width are not canonical fields).")


def check_thickness(ctx: Ctx, row: RawRow) -> None:
    raw = ctx.raw(row, C_THICK)
    if raw.strip():
        ctx.flag("unit_unclear", row, C_THICK, raw,
                 f"SIBAL thickness {raw} cm here and '.33 cm' in SAFFIRE-III (lines 2 and 3), but "
                 "SAFFIRE-II gives '037 mm' for SIBAL (line 6); the tables do not settle which unit is "
                 "right.",
                 "Raw kept; not a canonical field, no value read.")


def adapt(ctx: Ctx) -> None:
    no_p = "The table has no pressure column; the PSI table does not record chamber pressure for these burns."
    for row in ctx.rows():
        if _is_flow_visualisation(ctx, row):
            ctx.exclude(row, "Pre-test flow-visualisation entry (camera files only, no burn data); recorded "
                             "before the burn of the sample it names.")
            continue
        check_dimensions(ctx, row)
        check_thickness(ctx, row)
        fields = {
            "test_label": ctx.text(row, C_ID),
            "material": ctx.text(row, C_MAT),
            "o2_pct": ctx.num(row, C_O2, "o2_pct", T.percent),
            "flow_cm_s": ctx.num(row, C_FLOW, "flow_cm_s"),
            "pressure_kpa": ctx.missing("pressure_kpa", reason=no_p),
            "pressure_psi": ctx.missing("pressure_psi", reason=no_p),
            "notes": ctx.text(row, C_DIR),
            "gravity_level": ctx.constant("gravity_level", "microgravity (Cygnus)", GRAVITY_NOTE),
        }
        if ctx.raw(row, C_O2).strip():
            fields["o2_basis"] = ctx.constant(
                "o2_basis", "ambient",
                "SAFFIRE-I.md Approach: air is drawn through the flow duct, so Percent O2 is the cabin air.")
        ctx.emit(row, fields)


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="SAFFIRE-I",
    fuel_class="solid",
    test_kind="burn",
    tables=(TableSpec("main", "SAFFIRE-I/experiment_table/PSI-98_Experimental table_SAFFIRE-1.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
