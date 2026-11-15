"""BASS (PSI-26): Burning and Suppression of Solids, solid samples burned in a small flow duct on the ISS.

The PSI table has six columns only. It records which sample was burned and when, but no oxygen, pressure
or flow condition.

Column mapping (written out by hand so it can be audited):
- "Test #" -> test_label (raw text, for example "12-R2" or "82a")
- "Date" -> test_date (raw text, never reformatted)
- "Fuel Sample Material" -> material, verbatim. The cell often carries a short remark after the material
  (for example "SIBAL 2 cm   opposed flow" or "2 cm sphere   wake ign"); it is kept as written.
- "GMT" (day of year), "As Run Test #" and "Sample #" are not canonical fields. They are kept in the raw
  record and used only for the checks below.
- o2_pct, pressure_kpa, pressure_psi and flow_cm_s are null ('not recorded'): the table has no column for
  them. The PSI page says the fan gave air flows of up to 40 cm/s, but no per-test flow is recorded.
- gravity_level is the constant "microgravity (ISS)", from the PSI page (flight platform ISS, hardware MSG).

Rows that are not tests: line 67 ("SOOT Cleaning", dated 8/3/2012, with no test or sample number) is a
hardware cleaning entry and is excluded. Every other row is kept.

Checks (each one only adds a flag; no value is changed):
- date_inconsistent on "Date" when the date is not written as month/day/four-digit year (line 44 reads
  "6/29/`12"), or when its year differs from the years of both neighbouring test rows (line 111 reads
  "5/15/2103" between two rows dated 2013).
- date_inconsistent on "GMT" when the GMT day of year does not match the day of year of the written date
  (line 100, and lines 118 to 123).
- near_duplicate on "As Run Test #" and on "Test #" when the same number appears on more than one row.
  All the rows are kept, because they differ in date, sample or material.
- label_inconsistent for the spellings "parrafin" (written "paraffin" elsewhere) and "oppsed".
"""

from __future__ import annotations

import datetime as dt
import re

from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-26"

C_DATE = "Date"
C_GMT = "GMT"
C_ASRUN = "As Run Test #"
C_TEST = "Test #"
C_SAMPLE = "Sample #"
C_MAT = "Fuel Sample Material"

NON_TEST_MATERIAL = "SOOT Cleaning"
SPELLING_VARIANTS = {"parrafin": "paraffin", "oppsed": "opposed"}

_DATE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")


def _parse_date(raw: str) -> dt.date | None:
    """Read a month/day/year date for checking only. Returns None if it is not cleanly written."""
    m = _DATE.match(raw.strip())
    if not m:
        return None
    try:
        return dt.date(int(m[3]), int(m[1]), int(m[2]))
    except ValueError:
        return None


def check_dates(ctx: Ctx, rows: list[RawRow]) -> None:
    dates = [_parse_date(ctx.raw(r, C_DATE)) for r in rows]
    for i, row in enumerate(rows):
        raw_date = ctx.raw(row, C_DATE)
        d = dates[i]
        if d is None:
            ctx.flag(
                "date_inconsistent",
                row,
                C_DATE,
                raw_date,
                f"Date {raw_date!r} is not written as month/day/four-digit year.",
                "Raw kept verbatim; no correction attempted.",
            )
            continue
        before = dates[i - 1] if i > 0 else None
        after = dates[i + 1] if i + 1 < len(rows) else None
        neighbours = [x for x in (before, after) if x is not None]
        if neighbours and all(n.year != d.year for n in neighbours):
            years = " and ".join(sorted({str(n.year) for n in neighbours}))
            ctx.flag(
                "date_inconsistent",
                row,
                C_DATE,
                raw_date,
                f"Year {d.year} differs from the neighbouring test rows ({years}).",
                "Raw kept verbatim; no correction attempted.",
            )
        raw_gmt = ctx.raw(row, C_GMT)
        doy = d.timetuple().tm_yday
        if raw_gmt.strip() != str(doy):
            ctx.flag(
                "date_inconsistent",
                row,
                C_GMT,
                raw_gmt,
                f"GMT day {raw_gmt.strip()} does not match the date {raw_date} (day {doy} of the year).",
                "Raw kept verbatim; no correction attempted.",
            )


def check_repeats(ctx: Ctx, rows: list[RawRow], col: str) -> None:
    seen: dict[str, list[int]] = {}
    for row in rows:
        v = ctx.raw(row, col).strip()
        if v:
            seen.setdefault(v, []).append(row.line)
    for v, lines in seen.items():
        if len(lines) > 1:
            where = ", ".join(str(x) for x in lines)
            ctx.flag(
                "near_duplicate",
                None,
                col,
                v,
                f"{col} {v} appears on lines {where}, which differ in other values.",
                "All rows kept.",
                rows=lines,
            )


def check_spelling(ctx: Ctx, rows: list[RawRow]) -> None:
    for variant, usual in SPELLING_VARIANTS.items():
        lines = [r.line for r in rows if variant in ctx.raw(r, C_MAT).lower()]
        if lines:
            ctx.flag(
                "label_inconsistent",
                None,
                C_MAT,
                variant,
                f"'{variant}' is written '{usual}' elsewhere in the table.",
                "Raw labels kept verbatim.",
                rows=lines,
            )


def adapt(ctx: Ctx) -> None:
    tests: list[RawRow] = []
    for row in ctx.rows():
        if (
            ctx.raw(row, C_MAT).strip() == NON_TEST_MATERIAL
            and not ctx.raw(row, C_TEST).strip()
            and not ctx.raw(row, C_SAMPLE).strip()
        ):
            ctx.exclude(
                row, "Hardware cleaning entry ('SOOT Cleaning'), with no test or sample number; no burn took place."
            )
            continue
        tests.append(row)

    check_dates(ctx, tests)
    check_repeats(ctx, tests, C_ASRUN)
    check_repeats(ctx, tests, C_TEST)
    check_spelling(ctx, tests)

    no_p = "The table has no pressure column; the PSI table does not record chamber pressure for these burns."
    no_flow = (
        "The table has no flow column; the PSI page gives only the fan range (up to 40 cm/s), not a flow per test."
    )
    for row in tests:
        ctx.emit(
            row,
            {
                "test_label": ctx.text(row, C_TEST),
                "test_date": ctx.text(row, C_DATE),
                "material": ctx.text(row, C_MAT),
                "o2_pct": ctx.missing("o2_pct", "The table has no oxygen column."),
                "pressure_kpa": ctx.missing("pressure_kpa", reason=no_p),
                "pressure_psi": ctx.missing("pressure_psi", reason=no_p),
                "flow_cm_s": ctx.missing("flow_cm_s", no_flow),
                "gravity_level": ctx.constant(
                    "gravity_level",
                    "microgravity (ISS)",
                    "BASS.md: flight platform International Space Station (ISS), "
                    "hardware Microgravity Science Glovebox.",
                ),
            },
        )


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="BASS",
    fuel_class="solid",
    test_kind="burn",
    tables=(TableSpec("main", "BASS/experiment_table/PSI-26_Experimental table_BASS.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
