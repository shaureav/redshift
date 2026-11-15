"""BASS-II (PSI-25): Burning and Suppression of Solids II, solid samples in a small wind tunnel on the ISS.

Column mapping (written out by hand so it can be audited):
- "Test #" -> test_label (raw text, for example "B1" or "P22a")
- "Date" -> test_date (raw text, never reformatted)
- "Fuel Sample Material" -> material, verbatim (for example "1/4"" black rod" as PSI writes it)
- "Calibrated  initial O2 % by vol " -> o2_pct (percent, read as written). The header says this is the
  initial composition of the working volume, so o2_basis is "chamber initial". The PSI page says oxygen
  was varied below 21% by adding nitrogen, so diluent is the constant "N2".
- "Initial CO2 % by vol" -> co2_pct (percent, read as written)
- "Calibrated final O2 % by vol", "Final CO2 % by vol", "Initial CO (ppm)", "Final CO (ppm)" and
  "Total Frames Shot" are not canonical fields. They are kept in the raw record and only checked (below).
- "Fan display", "Air display" and "Flow restrictor" are instrument display settings written as free
  text sequences (for example "5   down to ext"). They are not velocities in cm/s, so flow_cm_s is null
  ('not recorded'). "Radiometer gain", "PI", "GMT" and "Sample #" are kept in the raw record only.
- pressure_kpa and pressure_psi are null: the table has no pressure column.
- gravity_level is the constant "microgravity (ISS)", from the PSI page (flight platform ISS, hardware MSG).

Every row is a test; none is excluded.

Checks (each one only adds a flag; no value is changed):
- implausible_value on "Calibrated final O2 % by vol" when the final O2 differs from the initial O2 of
  the same row by more than 5 percentage points. Burning in the closed working volume changes O2 by a
  few tenths to about 3 points in every other test, so a final value such as 1.6 or 40.4 cannot be the
  real final composition. On the split a/b rows (P22a/P22b, T28a/T28b) the values look shifted between
  columns; nothing is moved, and the initial O2 and initial CO2 on those rows are kept as written.
- implausible_value on "Initial CO2 % by vol" when it reads 0 while every other numeric initial CO2 in
  the table is above zero (line 15, B14: 0 against 0.19 to 1.85 elsewhere; the final O2, final CO2 and
  final CO on that row are "none"). The value 0 is kept as written.
- non_numeric on the non-canonical numeric columns above when a cell holds text such as "none", "video",
  "OR", "over", ">500" or "300+   +102". Blank cells are not flagged.
- date_inconsistent on "Date" when the date is not written as month/day/four-digit year, or when its
  year differs from the years of both neighbouring rows of the same PI (T9 and T18 are dated 2018 among
  2014 rows; their GMT day and sample numbers match the 6/24/2014 run of T10).
- date_inconsistent on "GMT" when the GMT day of year does not match the day of year of the written date
  (line 60, O10: GMT 213 against 7/22/2014, which is day 203).
- label_inconsistent for the misspellings "blac rod" and "2ide" in the material text.
"""

from __future__ import annotations

import datetime as dt
import re

from redshift import transforms as T
from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-25"

C_PI = "PI"
C_TEST = "Test #"
C_DATE = "Date"
C_GMT = "GMT"
C_MAT = "Fuel Sample Material"
C_O2I = "Calibrated  initial O2 % by vol"
C_O2F = "Calibrated final O2 % by vol"
C_CO2I = "Initial CO2 % by vol"
C_CO2F = "Final CO2 % by vol"
C_COI = "Initial CO (ppm)"
C_COF = "Final CO (ppm)"
C_FRAMES = "Total Frames Shot"

CHECKED_NUMERIC = (C_FRAMES, C_O2F, C_CO2F, C_COI, C_COF)
FINAL_O2_MAX_CHANGE = 5.0  # percentage points
SPELLING_VARIANTS = {"blac rod": "black rod", "2ide": "wide"}

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
    by_pi: dict[str, list[RawRow]] = {}
    for r in rows:
        by_pi.setdefault(ctx.raw(r, C_PI).strip(), []).append(r)
    for group in by_pi.values():
        dates = [_parse_date(ctx.raw(r, C_DATE)) for r in group]
        for i, row in enumerate(group):
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
            nb = [
                x
                for x in (dates[i - 1] if i > 0 else None, dates[i + 1] if i + 1 < len(group) else None)
                if x is not None
            ]
            if nb and all(n.year != d.year for n in nb):
                years = " and ".join(sorted({str(n.year) for n in nb}))
                ctx.flag(
                    "date_inconsistent",
                    row,
                    C_DATE,
                    raw_date,
                    f"Year {d.year} differs from the neighbouring rows of the same PI ({years}).",
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


def check_columns(ctx: Ctx, row: RawRow, o2_initial: float | None) -> None:
    """Flag text and implausible values in the non-canonical numeric columns. Nothing is read into a field."""
    for col in CHECKED_NUMERIC:
        raw = ctx.raw(row, col)
        if not raw.strip():
            continue
        try:
            v, _ = T.number(raw)
        except T.NotClean as exc:
            ctx.flag("non_numeric", row, col, raw, exc.detail, "Not a canonical field; raw kept, no value read.")
            continue
        if col == C_O2F and v is not None and o2_initial is not None and (abs(v - o2_initial) > FINAL_O2_MAX_CHANGE):
            ctx.flag(
                "implausible_value",
                row,
                col,
                raw,
                f"Final O2 {raw.strip()} % against initial O2 {o2_initial:g} % on the same row: a "
                f"change of more than {FINAL_O2_MAX_CHANGE:g} percentage points, far beyond every other "
                "test. The values on this row may be shifted between columns, so its initial O2 and "
                "initial CO2 (kept as written) may also be affected.",
                "Not a canonical field; raw kept, no value read, no shift applied.",
            )


def _numeric_values(ctx: Ctx, rows: list[RawRow], col: str) -> dict[int, float]:
    """Plain numbers in one column by line, read for checking only (text and blanks left out)."""
    out: dict[int, float] = {}
    for r in rows:
        try:
            v, _ = T.number(ctx.raw(r, col))
        except T.NotClean:
            continue
        if v is not None:
            out[r.line] = v
    return out


def check_zero_co2(ctx: Ctx, rows: list[RawRow]) -> None:
    """Flag an initial CO2 of 0 when every other numeric initial CO2 in the table is above zero."""
    vals = _numeric_values(ctx, rows, C_CO2I)
    zeros = [ln for ln, v in vals.items() if v == 0]
    others = [v for ln, v in vals.items() if v != 0]
    if not others or min(others) <= 0:
        return
    by_line = {r.line: r for r in rows}
    for ln in zeros:
        row = by_line[ln]
        ctx.flag(
            "implausible_value",
            row,
            C_CO2I,
            ctx.raw(row, C_CO2I),
            f"Initial CO2 0 % while every other numeric initial CO2 in the table reads "
            f"{min(others):g} to {max(others):g} %; the final O2, final CO2 and final CO cells on this "
            "row read " + ", ".join(repr(ctx.raw(row, c).strip()) for c in (C_O2F, C_CO2F, C_COF)) + ".",
            "Raw and value kept; row flagged for review.",
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
    rows = list(ctx.rows())
    check_dates(ctx, rows)
    check_spelling(ctx, rows)
    check_zero_co2(ctx, rows)

    no_p = "The table has no pressure column; the PSI table does not record chamber pressure for these burns."
    no_flow = (
        "Fan display, Air display and Flow restrictor are instrument display settings, not velocities "
        "in cm/s; the table has no flow velocity column."
    )
    for row in rows:
        o2 = ctx.num(row, C_O2I, "o2_pct", T.percent)
        check_columns(ctx, row, o2["v"])
        fields = {
            "test_label": ctx.text(row, C_TEST),
            "test_date": ctx.text(row, C_DATE),
            "material": ctx.text(row, C_MAT),
            "o2_pct": o2,
            "co2_pct": ctx.num(row, C_CO2I, "co2_pct", T.percent),
            "pressure_kpa": ctx.missing("pressure_kpa", reason=no_p),
            "pressure_psi": ctx.missing("pressure_psi", reason=no_p),
            "flow_cm_s": ctx.missing("flow_cm_s", no_flow),
            "diluent": ctx.constant(
                "diluent", "N2", "BASS-II.md Approach: oxygen varied below 21% by adding nitrogen."
            ),
            "gravity_level": ctx.constant(
                "gravity_level",
                "microgravity (ISS)",
                "BASS-II.md: flight platform International Space Station (ISS), "
                "hardware Microgravity Science Glovebox (MSG).",
            ),
        }
        if ctx.raw(row, C_O2I).strip():
            fields["o2_basis"] = ctx.constant(
                "o2_basis",
                "chamber initial",
                "BASS-II table header 'Calibrated  initial O2 % by vol': the initial working volume composition.",
            )
        ctx.emit(row, fields)


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="BASS-II",
    fuel_class="solid",
    test_kind="burn",
    tables=(TableSpec("main", "BASS-II/experiment_table/PSI-25_Experimental table_BASS-II.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
