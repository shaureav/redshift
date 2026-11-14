"""The fixed, named set of transforms allowed between a raw cell and a clean value.

Anything not listed here is a flag, not a fix: the raw string is kept and the clean value is
null or unchanged. Each function returns the clean value and the list of transform names it
applied, so provenance records exactly what happened.
"""

from __future__ import annotations

import re

from redshift import units

ALLOWED: dict[str, str] = {
    "trim": "Remove leading and trailing whitespace.",
    "empty_to_null": "An empty cell becomes an explicit null, displayed as 'not recorded'.",
    "parse_number": "Read a plain decimal number (digits, one optional point, optional sign or exponent).",
    "strip_stated_unit": "Read '<number> <unit>' when the unit written in the cell is exactly the unit expected "
                         "for the column (for example '0.75 atm' in a pressure column read as atm).",
    "strip_percent_sign": "Remove a single trailing '%' from a number already in percent.",
    "fraction_to_pct": "Multiply a mole fraction by 100 to give percent.",
    "mmhg_to_kpa": "Multiply by 101.325/760 (exact definition of the conventional mmHg).",
    "atm_to_kpa": "Multiply by 101.325 (exact definition of the standard atmosphere).",
    "bar_to_kpa": "Multiply by 100.",
    "psi_to_kpa": "Multiply by 6.894757293168361.",
    "kpa_to_psi": "Divide kPa by 6.894757293168361.",
    "remove_exact_duplicate": "Drop a row that is byte-identical (after CSV parsing) to an earlier row.",
    "exclude_blank_row": "Drop a row whose every cell is empty.",
    "decode_cp1252": "Decode the file as Windows-1252 because it is not valid UTF-8.",
    "strip_bom": "Remove a UTF-8 byte-order mark from the start of the file.",
}

_NUMBER = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")


class NotClean(Exception):
    """Raised when a raw string cannot be turned into a value by allowed transforms alone."""

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


def text(raw: str | None) -> tuple[str | None, list[str]]:
    """Trim a text cell; empty becomes null."""
    if raw is None:
        return None, ["empty_to_null"]
    s = raw.strip()
    applied = ["trim"] if s != raw else []
    if s == "":
        return None, [*applied, "empty_to_null"]
    return s, applied


def number(raw: str | None) -> tuple[float | None, list[str]]:
    """Parse a plain number. Raises NotClean for anything else (for example '~6', 'RAMP', '037 mm')."""
    s, applied = text(raw)
    if s is None:
        return None, applied
    if not _NUMBER.match(s):
        raise NotClean("non_numeric", f"expected a number, found {raw!r}")
    return float(s), [*applied, "parse_number"]


def percent(raw: str | None) -> tuple[float | None, list[str]]:
    """Parse a value in percent, optionally written with a trailing '%'."""
    s, applied = text(raw)
    if s is None:
        return None, applied
    if s.endswith("%"):
        s = s[:-1].strip()
        applied = [*applied, "strip_percent_sign"]
    if not _NUMBER.match(s):
        raise NotClean("non_numeric", f"expected a percentage, found {raw!r}")
    return float(s), [*applied, "parse_number"]


def fraction_as_pct(raw: str | None) -> tuple[float | None, list[str]]:
    """Parse a mole fraction (0 to 1) and express it in percent."""
    v, applied = number(raw)
    if v is None:
        return None, applied
    return units.fraction_to_pct(v), [*applied, "fraction_to_pct"]


_PRESSURE_TRANSFORM = {"mmHg": "mmhg_to_kpa", "atm": "atm_to_kpa", "bar": "bar_to_kpa", "psi": "psi_to_kpa"}


def number_with_unit(raw: str | None, unit: str) -> tuple[float | None, list[str]]:
    """Parse a plain number, or a number followed by exactly ``unit`` (for example '0.75 atm')."""
    s, applied = text(raw)
    if s is None:
        return None, applied
    if s.endswith(unit) and _NUMBER.match(s[: -len(unit)].strip()):
        return float(s[: -len(unit)].strip()), [*applied, "strip_stated_unit", "parse_number"]
    return number(raw)


def pressure_kpa(raw: str | None, unit: str) -> tuple[float | None, list[str]]:
    """Parse a pressure written in ``unit`` (optionally with that unit written in the cell) and convert to kPa."""
    v, applied = number_with_unit(raw, unit)
    if v is None:
        return None, applied
    if unit == "kPa":
        return v, applied
    return units.to_kpa(v, unit), [*applied, _PRESSURE_TRANSFORM[unit]]
