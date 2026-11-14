"""CFI (PSI-39): Cool Flames Investigation, n-dodecane and n-dodecane/iso-dodecane droplets in the MDCA.

Column mapping (written out by hand so it can be audited):
- "Flex Number" -> test_label. The first column of the CFI table is headed "Flex Number"; its values
  (1206 to 1387) are kept verbatim as the test label.
- "Test Date" -> test_date (raw text, for example "9-Mar-17").
- "Fuel " -> fuel (verbatim, for example "[.60]/[.40] C12H26/iso-dodecane").
- "Oxygen" -> o2_pct (fraction_to_pct). The header gives no unit; the values (0.17 and 0.21) sum with
  "Nitrogen" and "Helium" to about 1, so they are mole fractions, as in the sibling FLEX table.
  o2_basis is "ambient": the value is the MDCA chamber atmosphere around the droplet.
- "Nitrogen" -> n2_pct and "Helium" -> he_pct (fraction_to_pct, same reasoning).
- diluent: a text label from the recorded fractions, "N2" when helium is 0 and "N2 + He" when helium is
  above 0; null if either fraction is unknown. It describes the row and adds no new value.
- "Pressure" -> not mapped to a number. The header has no unit; every cell holds a number followed by a
  unit, for example "1 atm" or "0.75 atm ". No allowed transform removes a unit suffix from a cell, so
  pressure_kpa and pressure_psi are null and each cell is flagged non_numeric. The raw pressure text is
  kept in notes so the recorded condition stays visible.
- "Local Time", "CIR " and "Fiber" have no canonical field; they stay in the raw record. They are used
  only for checks: the CIR code (for example "f068a03") carries the day of year, which is compared with
  "Test Date", and within one CIR day the local times are checked to run in CIR sequence order.
- gravity_level: "microgravity (ISS)", from the PSI page flight platform.
- outcome_label and flow are not recorded in this table.
- Byte-identical duplicates (lines 81 to 88 repeat lines 24 to 31) are removed by the framework.
"""

from __future__ import annotations

import re
from datetime import datetime

from redshift import transforms as T
from redshift.ingest.tables import RawRow
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-39"

C_ID = "Flex Number"
C_DATE = "Test Date"
C_TIME = "Local Time"
C_CIR = "CIR"
C_P = "Pressure"
C_O2 = "Oxygen"
C_N2 = "Nitrogen"
C_HE = "Helium"
C_FUEL = "Fuel"

_CIR = re.compile(r"^f(\d{3})([a-z])(\d+)$")
_PAGE_DATES = "10-01-2020 to 10-20-2021"
P_REASON = ("The CFI Pressure header gives no unit and each cell holds a number with a unit suffix "
            "(for example '1 atm'); no allowed transform removes the suffix, so no pressure value is "
            "produced.")


def _parse_date(raw: str) -> datetime | None:
    try:
        return datetime.strptime(raw.strip(), "%d-%b-%y")
    except ValueError:
        return None


def _parse_time(raw: str) -> datetime | None:
    s = raw.strip()
    if s.lower().endswith(" est"):
        s = s[:-4].strip()
    for fmt in ("%I:%M:%S %p", "%I:%M %p"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _check_date_and_time(ctx: Ctx, row: RawRow, prev: tuple[RawRow, str, int, datetime] | None
                         ) -> tuple[RawRow, str, int, datetime] | None:
    """Flag date or time cells that disagree with the CIR code; return this row's sequence key."""
    cir = ctx.raw(row, C_CIR).strip()
    date_raw = ctx.raw(row, C_DATE)
    time_raw = ctx.raw(row, C_TIME)
    m = _CIR.match(cir)
    d = _parse_date(date_raw)
    if m is None:
        ctx.flag("date_inconsistent", row, C_CIR, ctx.raw(row, C_CIR),
                 "CIR code does not have the form fDDDxNN.", "Raw kept.")
        return None
    if d is None:
        ctx.flag("date_inconsistent", row, C_DATE, date_raw, "Test Date is not in the form D-Mon-YY.",
                 "Raw kept.")
    elif d.timetuple().tm_yday != int(m.group(1)):
        ctx.flag("date_inconsistent", row, C_DATE, date_raw,
                 f"Test Date {date_raw.strip()} is day {d.timetuple().tm_yday} of the year, but CIR code "
                 f"{cir} gives day {int(m.group(1))}.", "Raw kept; no correction attempted.")
    t = _parse_time(time_raw)
    if t is None:
        ctx.flag("date_inconsistent", row, C_TIME, time_raw, "Local Time is not a complete clock time.",
                 "Raw kept.")
        return None
    day_key = cir[:4]
    seq = int(m.group(3))
    if prev is not None and prev[1] == day_key and seq > prev[2] and t < prev[3]:
        p_row = prev[0]
        ctx.flag("date_inconsistent", row, C_TIME, time_raw,
                 f"Local Time on line {row.line} ({time_raw.strip()}, CIR {cir}) is earlier than on line "
                 f"{p_row.line} ({ctx.raw(p_row, C_TIME).strip()}, CIR {ctx.raw(p_row, C_CIR).strip()}), "
                 "although the CIR sequence number is later; an am or pm marker may be wrong.",
                 "Raw kept; no correction attempted.", rows=[p_row.line, row.line])
    return row, day_key, seq, t


def adapt(ctx: Ctx) -> None:
    prev: tuple[RawRow, str, int, datetime] | None = None
    dates: list[tuple[datetime, str]] = []
    o2_basis = ctx.constant("o2_basis", "ambient",
                            "CFI.md Approach: the MDCA chamber is filled with the gas mixture around the "
                            "droplet; the Oxygen column is that chamber atmosphere.")
    gravity = ctx.constant("gravity", "microgravity (ISS)",
                           "CFI.md: flight platform International Space Station.")
    p_kpa = ctx.missing("pressure_kpa", P_REASON)
    p_psi = ctx.missing("pressure_psi", P_REASON)
    for row in ctx.rows():
        o2 = ctx.num(row, C_O2, "o2_pct", T.fraction_as_pct)
        n2 = ctx.num(row, C_N2, "n2_pct", T.fraction_as_pct)
        he = ctx.num(row, C_HE, "he_pct", T.fraction_as_pct)

        parts = [x["v"] for x in (o2, n2, he)]
        if all(p is not None for p in parts):
            total = sum(parts) / 100.0  # type: ignore[arg-type]
            if abs(total - 1.0) > 0.01:
                ctx.flag("composition_sum", row, None, ",".join(ctx.raw(row, c) for c in (C_O2, C_N2, C_HE)),
                         f"Oxygen + Nitrogen + Helium mole fractions sum to {total:.3f}.",
                         "Values kept as recorded.")

        p_raw = ctx.raw(row, C_P)
        ctx.flag("non_numeric", row, C_P, p_raw,
                 f"Pressure cell {p_raw!r} holds a number with a unit suffix and the header gives no unit; "
                 "no allowed transform removes the suffix.", "Raw kept (also in notes); value set to null.")

        prev = _check_date_and_time(ctx, row, prev)
        d = _parse_date(ctx.raw(row, C_DATE))
        if d is not None:
            dates.append((d, ctx.raw(row, C_DATE).strip()))

        he_v = he["v"]
        if n2["v"] is None or he_v is None:
            dil = None
        else:
            dil = "N2 + He" if he_v > 0 else "N2"
        diluent = ctx.derived_text(row, "diluent", dil,
                                   "Label from recorded fractions: 'N2 + He' if Helium > 0, else 'N2'; "
                                   "null if Nitrogen or Helium is unknown.", [n2, he])
        ctx.emit(row, {
            "test_label": ctx.text(row, C_ID),
            "test_date": ctx.text(row, C_DATE),
            "fuel": ctx.text(row, C_FUEL),
            "o2_pct": o2, "n2_pct": n2, "he_pct": he,
            "o2_basis": o2_basis,
            "diluent": diluent,
            "pressure_kpa": p_kpa, "pressure_psi": p_psi,
            "notes": ctx.text(row, C_P),
            "flow_cm_s": ctx.missing("flow_cm_s",
                                     "CFI droplets burned in a quiescent chamber; no flow column."),
            "gravity_level": gravity,
        })

    if dates:
        first = min(dates)[1]
        last = max(dates)[1]
        ctx.flag("metadata_inconsistent", None, C_DATE, None,
                 f"Test Date values run from {first} to {last}, but the PSI page gives investigation dates "
                 f"{_PAGE_DATES}.", "Table dates kept as recorded; page dates not used for tests.", rows=[])


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="CFI",
    fuel_class="droplet",
    test_kind="burn",
    tables=(TableSpec("main", "CFI/experiment_table/PSI-39_Experimental table_CFI.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
