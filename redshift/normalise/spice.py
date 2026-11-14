"""SPICE (PSI-107): Smoke Point In Co-flow Experiment, gas jet flames in co-flowing air in the MSG.

Each row is one fuel flow setting of a flame; one ignition (same "GMT ignition" time) can have several rows
with different fuel rates.

Column mapping (written out by hand so it can be audited):
- "GMT ignition" -> test_label, verbatim (a clock time, or a marker such as "Ku LOS").
- "GMT date" -> test_date, verbatim. It holds the day of year only (45 to 174) with no year; the PSI page
  gives no investigation dates either.
- "Fuel" -> fuel, verbatim. Two spellings of one fuel occur ("75 % Propylene" and "75% Propylene"); both
  are kept as written and one label_inconsistent flag lists them.
- "Air Rate (cm/s)" -> flow_cm_s; the header states cm/s. It is the co-flow air velocity. Negative values
  (-0.28 and -5.92) are outside the physical range, flagged out_of_range and set to null. Blank cells are
  null.
- "GMT  Flame Off ", "Nozzle (mm)", "Fuel Rate (sccm)", "Fuel Rate (mg/s)" and "HC Fuel Rate (mg/s)" have no
  canonical field and stay in the raw record. The two GMT time columns are checked: times written with dots
  (for example "11.38.51"), or holding a marker instead of a time, are flagged date_inconsistent.
- o2_pct and pressure: the table has no oxygen or pressure column, so both are null.
- gravity_level: "microgravity (ISS)", from the PSI page flight platform.
- Byte-identical duplicates (34 extra copies) are removed by the framework.
"""

from __future__ import annotations

import re

from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-107"

C_DAY = "GMT date"
C_IGN = "GMT ignition"
C_OFF = "GMT  Flame Off"
C_FUEL = "Fuel"
C_AIR = "Air Rate (cm/s)"

_COLON_TIME = re.compile(r"^\d{1,2}:\d{2}:\d{2}$")
_DOT_TIME = re.compile(r"^\d{1,2}\.\d{2}\.\d{2}$")


def _check_time(ctx: Ctx, row: RawRow, col: str) -> None:
    raw = ctx.raw(row, col)
    s = raw.strip()
    if s == "" or _COLON_TIME.match(s):
        return
    if _DOT_TIME.match(s):
        detail = f"{col} is written with dots ({s}) rather than colons."
    else:
        detail = f"{col} holds {s!r} instead of a clock time."
    ctx.flag("date_inconsistent", row, col, raw, detail, "Raw kept.")


def adapt(ctx: Ctx) -> None:
    gravity = ctx.constant("gravity", "microgravity (ISS)",
                           "SPICE.md: flight platform International Space Station.")
    o2_reason = "SPICE flames burned in co-flowing air; the table has no oxygen column."
    p_reason = "The SPICE table has no pressure column."
    spellings: dict[str, list[int]] = {}
    for row in ctx.rows():
        _check_time(ctx, row, C_IGN)
        _check_time(ctx, row, C_OFF)
        fuel_raw = ctx.raw(row, C_FUEL).strip()
        if fuel_raw.endswith("Propylene") and fuel_raw.startswith("75"):
            spellings.setdefault(fuel_raw, []).append(row.line)
        ctx.emit(row, {
            "test_label": ctx.text(row, C_IGN),
            "test_date": ctx.text(row, C_DAY),
            "fuel": ctx.text(row, C_FUEL),
            "flow_cm_s": ctx.num(row, C_AIR, "flow_cm_s"),
            "o2_pct": ctx.missing("o2_pct", o2_reason),
            "pressure_kpa": ctx.missing("pressure_kpa", p_reason),
            "pressure_psi": ctx.missing("pressure_psi", p_reason),
            "gravity_level": gravity,
        })
    ctx.flag("date_inconsistent", None, C_DAY, None,
             "GMT date holds the day of the year only (for example '45'), with no year; the PSI page gives "
             "no investigation dates.", "Raw kept; no year assumed.", rows=[])
    if len(spellings) > 1:
        lines = sorted(ln for v in spellings.values() for ln in v)
        detail = "; ".join(f"{k!r} on {len(v)} kept rows (lines {v[0]} to {v[-1]})"
                           for k, v in sorted(spellings.items()))
        ctx.flag("label_inconsistent", None, C_FUEL, " | ".join(sorted(spellings)),
                 f"One fuel is written in {len(spellings)} ways: {detail}.", "Raw labels kept verbatim.",
                 rows=lines)


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="SPICE",
    fuel_class="gas",
    test_kind="flame",
    tables=(TableSpec("main", "SPICE/experiment_table/PSI-107_Experimental table_Spice.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
