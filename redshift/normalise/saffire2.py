"""SAFFIRE-II (PSI-99): Spacecraft Fire Experiment II, nine 5 cm by 29 cm solid samples burned in Cygnus.

The burns took place in the Saffire flow duct on the Cygnus cargo vehicle after it left the ISS.

Column mapping (written out by hand so it can be audited):
- "Sample Number" -> test_label (raw text, "2-1" to "2-9")
- "Material" -> material, verbatim. The cell is blank on lines 7 (2-6) and 10 (2-9); material is then
  null ('not recorded') and the row is flagged. No material is copied from a neighbouring row.
- "Percent O2 (Note 1)" -> o2_pct (percent). Note 1 of the table (line 13) says the value is derived from
  measured CO2 production and referenced to the initial O2 reported by ISS: it describes the cabin air
  drawn through the duct, so o2_basis is "ambient". Every cell is written as an approximation or a range
  ("~ 22.1", "22.1 to 22.0"); no number is taken from such text, so each is flagged non_numeric and
  o2_pct is null.
- "Air Flow (cm/s)" -> flow_cm_s. Every cell repeats the unit ("20 cm/s"); removing a unit written in the
  cell is not an allowed transform, so each is flagged non_numeric and flow_cm_s is null.
- "Flow Direction" -> notes, verbatim ("Concurrent" or "Opposed")
- pressure_kpa and pressure_psi are null: the table has no pressure column.
- gravity_level is the constant "microgravity (Cygnus)", from the PSI page (flight platform Cygnus).
- Thickness, length, width, ignition, burn time, the low-gravity and 1-g burn and spread columns and the
  camera file names are not canonical fields; they are kept in the raw record.
- The table has no test date column, so test_date is not recorded.

Rows that are not tests: lines 11 and 12 ("Pre-test flow visulation data for sample 2-1" and "... 2-2")
list flow-visualisation camera files with no burn data; lines 13 to 16 are the table's Notes 1 to 4. All
six are excluded. Lines 2 to 10 are the nine burns.

Checks (each one only adds a flag; no value is changed):
- non_numeric on "Samle Thickness" for "037 mm" (lines 5 to 7): a number with a leading zero and no
  decimal point, so the intended thickness cannot be read from the cell.
- missing_column on "Material" for a blank material cell on a test row.
- label_inconsistent on "Camera 1" and "Camera 2" when a camera file name is blank or does not follow the
  pattern S<sample>C<camera> used on the other rows (line 4 Camera 1 blank, line 5 Camera 2 "S4C1",
  line 7 Camera 2 "S56C2"). "n/a" is accepted.
- label_inconsistent for header text: "Samle Thickness " (a typo for Sample) and "?-g Burn Length" and
  "?-g Spread Length", where the micro sign was lost and is a literal "?".
"""

from __future__ import annotations

import re

from redshift import transforms as T
from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-99"

C_ID = "Sample Number"
C_MAT = "Material"
C_THICK = "Samle Thickness"
C_FLOW = "Air Flow (cm/s)"
C_O2 = "Percent O2 (Note 1)"
C_DIR = "Flow Direction"
C_CAM = ("Camera 1", "Camera 2")
C_MICRO = ("?-g Burn Length", "?-g Spread Length")

FLOW_VIS_MARKER = "pre-test flow visulation data"
GRAVITY_NOTE = ("SAFFIRE-II.md: flight platform Cygnus Spacecraft; Approach: performed on the Cygnus "
                "resupply vehicle after it deberthed from the ISS.")
_NOTE = re.compile(r"^Note \d+ ")
_SAMPLE = re.compile(r"^\d+-(\d+)$")
_MALFORMED_THICKNESS = re.compile(r"^0\d+ mm$")


def _others_blank(ctx: Ctx, row: RawRow, keep: tuple[str, ...]) -> bool:
    idx = {ctx.table.col(c) for c in keep}
    return all(not c.strip() for i, c in enumerate(row.cells) if i not in idx)


def non_test_reason(ctx: Ctx, row: RawRow) -> str | None:
    first = ctx.raw(row, C_ID).strip()
    marked = ctx.raw(row, C_MAT).strip().lower().startswith(FLOW_VIS_MARKER)
    if marked and _others_blank(ctx, row, (C_ID, C_MAT)):
        return ("Pre-test flow-visualisation entry (camera files only, no burn data); recorded before the "
                "burn of the sample it names.")
    if _NOTE.match(first) and _others_blank(ctx, row, (C_ID,)):
        return f"Table footnote ({first.split(' ', 2)[0]} {first.split(' ', 2)[1]}), not a test."
    return None


def header_flags(ctx: Ctx) -> None:
    ctx.flag("label_inconsistent", None, C_THICK, ctx.table.header[ctx.table.col(C_THICK)],
             "Header reads 'Samle Thickness', a typo for 'Sample Thickness'.", "Header kept verbatim.",
             rows=[])
    for col in C_MICRO:
        ctx.flag("label_inconsistent", None, col, col,
                 "The micro sign was lost from this header and is a literal '?'; it means micro-g "
                 "(low gravity).",
                 "Header kept verbatim.", rows=[])


def check_row(ctx: Ctx, row: RawRow) -> None:
    raw_t = ctx.raw(row, C_THICK)
    if _MALFORMED_THICKNESS.match(raw_t.strip()):
        ctx.flag("non_numeric", row, C_THICK, raw_t,
                 f"Thickness {raw_t!r} has a leading zero and no decimal point, so the intended thickness "
                 "cannot be read from the cell.", "Raw kept; not a canonical field, no value read.")
    if not ctx.raw(row, C_MAT).strip():
        ctx.flag("missing_column", row, C_MAT, ctx.raw(row, C_MAT), "Material cell is blank on this test row",
                 "Value is null ('not recorded').")
    m = _SAMPLE.match(ctx.raw(row, C_ID).strip())
    for k, col in enumerate(C_CAM, start=1):
        raw = ctx.raw(row, col)
        s = raw.strip()
        if s.lower() == "n/a":
            continue
        expected = f"S{m[1]}C{k}" if m else None
        if not s:
            ctx.flag("label_inconsistent", row, col, raw, f"{col} file name is blank; other rows give a name "
                     "or 'n/a'.", "Raw kept verbatim; no name filled in.")
        elif expected is not None and s != expected:
            ctx.flag("label_inconsistent", row, col, raw,
                     f"{col} file name {s!r} does not follow the pattern of the other rows (expected form "
                     f"{expected!r}).", "Raw kept verbatim; no correction attempted.")


def adapt(ctx: Ctx) -> None:
    header_flags(ctx)
    no_p = "The table has no pressure column; the PSI table does not record chamber pressure for these burns."
    for row in ctx.rows():
        reason = non_test_reason(ctx, row)
        if reason is not None:
            ctx.exclude(row, reason)
            continue
        check_row(ctx, row)
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
                "SAFFIRE-II table Note 1 (line 13): Percent O2 is derived from measured CO2 production "
                "and referenced to the initial O2 reported by ISS; air is drawn through the duct "
                "(SAFFIRE-II.md).")
        ctx.emit(row, fields)


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="SAFFIRE-II",
    fuel_class="solid",
    test_kind="burn",
    tables=(TableSpec("main", "SAFFIRE-II/experiment_table/PSI-99_Experimental table_SAFFIRE-2.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
