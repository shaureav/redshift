"""Shared checks for the ACME summary tables (PSI-20, PSI-21, PSI-22 and PSI-23).

This module defines no SPEC, so the runner skips it. Every helper here either raises a flag or builds a
text label from cells of the same row; none of them produces or changes a number.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any

from redshift import transforms as T
from redshift.ingest.tables import RawRow
from redshift.normalise.base import Ctx

# Month names as written in the ACME tables, used only to compare dates for checks.
MONTHS: dict[str, int] = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

# Formulas of real gases that may appear at the end of a label; used only to word a flag.
REAL_FORMULAS = frozenset({"H2", "N2", "O2", "CH4", "C2H4", "C2H6", "C3H8"})

GRAVITY_NOTE = "PSI page: flight platform International Space Station (ISS)."

_TRAILING_INT = re.compile(r"^(.*\D)(\d+)$")


def gravity(ctx: Ctx) -> dict[str, Any]:
    return ctx.constant("gravity_level", "microgravity (ISS)", GRAVITY_NOTE)


def single_percent(what: str):
    """A parser for one percentage. A list, a range or free text is a non_numeric flag; nothing is split."""

    def parse(raw: str | None) -> tuple[float | None, list[str]]:
        try:
            return T.percent(raw)
        except T.NotClean as exc:
            raise T.NotClean(
                "non_numeric",
                f"{what} cell {raw!r} is not a single percentage (it is a list, a range or free text); "
                "no number is read out of it.",
            ) from exc

    return parse


def month_number(raw: str) -> int | None:
    s = raw.strip().rstrip(".").lower()
    if s.isdigit():
        return int(s)
    return MONTHS.get(s[:3])


def row_date(ctx: Ctx, row: RawRow, c_year: str, c_month: str, c_date: str) -> dt.date | None:
    """The calendar date of a row, for comparisons only (it is never emitted)."""
    y, m, d = (ctx.raw(row, c).strip() for c in (c_year, c_month, c_date))
    mn = month_number(m) if m else None
    if not (y.isdigit() and d.isdigit() and mn):
        return None
    try:
        return dt.date(int(y), mn, int(d))
    except ValueError:
        return None


def date_text(ctx: Ctx, row: RawRow, c_year: str, c_month: str, c_date: str) -> dict[str, Any]:
    """test_date as the Year, Month and Date cells joined by spaces, each written exactly as recorded."""
    parts = [ctx.text(row, c) for c in (c_year, c_month, c_date)]
    words = [p["v"] for p in parts if p["v"] is not None]
    return ctx.derived_text(
        row,
        "test_date",
        " ".join(words) if words else None,
        f"Cells '{c_year}', '{c_month}' and '{c_date}' joined with spaces, verbatim.",
        parts,
    )


def check_day_of_year(ctx: Ctx, row: RawRow, c_day: str, c_year: str, c_month: str, c_date: str) -> None:
    """Flag a YYDDD Test Day that disagrees with the Year, Month and Date cells of the same row."""
    raw_day = ctx.raw(row, c_day).strip()
    d = row_date(ctx, row, c_year, c_month, c_date)
    if d is None or not re.fullmatch(r"\d{5}", raw_day):
        return
    expected = f"{d.year % 100:02d}{d.timetuple().tm_yday:03d}"
    if expected != raw_day:
        ctx.flag(
            "date_inconsistent",
            row,
            c_day,
            raw_day,
            f"Test Day {raw_day} (YYDDD) does not match the Year, Month and Date cells "
            f"({d.isoformat()}, day {expected}).",
            "Both kept as recorded.",
        )


class FillDownCheck:
    """Flags a label whose final number is one more than the label on the row above with the same stem.

    That is the pattern a spreadsheet fill-down leaves (for example '40% CH4', '40% CH5', '40% CH6').
    The raw label is never changed. An empty cell breaks the series.
    """

    def __init__(self, ctx: Ctx, col: str) -> None:
        self.ctx = ctx
        self.col = col
        self.prev: tuple[str, int, str, int] | None = None
        self.flagged: list[int] = []

    def check(self, row: RawRow) -> None:
        raw = self.ctx.raw(row, self.col).strip()
        m = _TRAILING_INT.match(raw)
        if not m:
            self.prev = None
            return
        stem, n = m.group(1), int(m.group(2))
        if self.prev is not None and self.prev[0] == stem and n == self.prev[1] + 1:
            last = raw.split()[-1]
            extra = (
                f" '{last}' is itself a real formula, but it sits inside an incrementing series."
                if last in REAL_FORMULAS
                else ""
            )
            self.ctx.flag(
                "fill_down_error",
                row,
                self.col,
                raw,
                f"'{raw}' follows '{self.prev[2]}' (line {self.prev[3]}) with its final number increased "
                f"by 1, the pattern of a spreadsheet fill-down.{extra}",
                "Raw label kept verbatim; no correction attempted.",
            )
            self.flagged.append(row.line)
        self.prev = (stem, n, raw, row.line)


class SpellingCheck:
    """Flags labels that differ only in spacing from a more common spelling of the same label."""

    def __init__(self, ctx: Ctx, col: str) -> None:
        self.ctx = ctx
        self.col = col
        self.seen: dict[str, dict[str, list[int]]] = {}

    def check(self, row: RawRow) -> None:
        raw = self.ctx.raw(row, self.col).strip()
        if raw:
            key = re.sub(r"\s+", "", raw).lower()
            self.seen.setdefault(key, {}).setdefault(raw, []).append(row.line)

    def finish(self) -> None:
        for spellings in self.seen.values():
            if len(spellings) < 2:
                continue
            main = max(spellings, key=lambda s: (len(spellings[s]), -spellings[s][0]))
            for sp, lines in spellings.items():
                if sp == main:
                    continue
                self.ctx.flag(
                    "label_inconsistent",
                    None,
                    self.col,
                    sp,
                    f"'{sp}' (lines {', '.join(map(str, lines))}) is written differently from '{main}' "
                    f"(lines {', '.join(map(str, spellings[main]))}).",
                    "Raw labels kept verbatim.",
                    rows=lines,
                )


def notes(ctx: Ctx, row: RawRow, items: list[tuple[str, str, dict[str, Any] | None]]) -> dict[str, Any]:
    """notes as 'Label: cell' pairs joined by '; ', each cell trimmed and otherwise verbatim.

    ``items`` holds (label, column, value dict or None). When a value dict is already held for the column
    (for example the null o2_pct read from the same cell) it is used as the provenance input; otherwise the
    cell is read with ctx.text.
    """
    inputs: list[dict[str, Any]] = []
    parts: list[str] = []
    for label, col, held in items:
        inputs.append(held if held is not None else ctx.text(row, col))
        s = ctx.raw(row, col).strip()
        if s:
            parts.append(f"{label}: {s}")
    cols = ", ".join(f"'{c}'" for _, c, _ in items)
    method = f"Trimmed cells {cols} written as 'Label: text' joined by '; '."
    return ctx.derived_text(row, "notes", "; ".join(parts) if parts else None, method, inputs)
