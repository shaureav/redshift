"""Flag definitions and the flag log.

A flag records a data problem. It never changes a value. Each flag names the exact file, line,
column and raw string, what is wrong, what action was taken and why.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Severity = Literal["info", "warning", "error"]


@dataclass(frozen=True)
class FlagDef:
    code: str
    severity: Severity
    title: str
    description: str


DEFS: dict[str, FlagDef] = {
    d.code: d
    for d in [
        FlagDef("non_numeric", "warning", "Text in a numeric field",
                "A numeric column holds text (for example RAMP, ~6, #VALUE!). Raw kept; value set to null."),
        FlagDef("spreadsheet_error", "warning", "Spreadsheet error value",
                "A cell holds a spreadsheet error such as #VALUE! or #DIV/0!. Raw kept; value set to null."),
        FlagDef("out_of_range", "error", "Value outside the physical range",
                "The value is outside its physical range (for example O2 above 100%, pressure 0). "
                "Raw kept; value set to null so it cannot be plotted or counted."),
        FlagDef("implausible_value", "warning", "Implausible value",
                "The value is physically possible but inconsistent with its context. Raw and value kept; "
                "row flagged for review."),
        FlagDef("fill_down_error", "warning", "Spreadsheet fill-down error",
                "A label appears to have been auto-incremented by a spreadsheet fill-down (for example CH5, CH6). "
                "Raw kept verbatim; no correction attempted."),
        FlagDef("swapped_columns", "warning", "Columns appear swapped",
                "Values look swapped between two columns when compared with the investigation page or a sibling "
                "investigation. Raw kept; no swap applied."),
        FlagDef("missing_column", "info", "Condition not recorded in table",
                "The table has no column for this condition. Values are null ('not recorded')."),
        FlagDef("exact_duplicate", "info", "Exact duplicate row removed",
                "The row is byte-identical to an earlier row in the same table and was removed."),
        FlagDef("near_duplicate", "warning", "Possible duplicate test",
                "Two rows share an identifier or timestamp but differ in some values. Both kept."),
        FlagDef("blank_row", "info", "Blank row excluded",
                "The row has no content in any cell and was excluded."),
        FlagDef("non_test_row", "info", "Row is not a test",
                "The row is a note, a continuation stub or a non-test entry. Excluded from the test table; listed "
                "here verbatim."),
        FlagDef("metadata_inconsistent", "warning", "Investigation metadata inconsistent",
                "PSI metadata for the investigation appears wrong or copied from another investigation."),
        FlagDef("no_licence", "warning", "No licence shown",
                "PSI shows no licence for this investigation."),
        FlagDef("date_inconsistent", "info", "Date inconsistent",
                "A date is malformed or disagrees with another field. Raw kept."),
        FlagDef("composition_sum", "info", "Gas composition does not sum to 1",
                "Mole fractions of the ambient gas sum to more than 0.01 away from 1. Values kept."),
        FlagDef("label_inconsistent", "info", "Inconsistent label spelling",
                "The same category is written in different ways. Raw labels kept verbatim."),
        FlagDef("unit_unclear", "warning", "Unit unclear",
                "The unit of a value cannot be determined with confidence. Raw kept; value set to null."),
        FlagDef("encoding", "info", "File encoding",
                "The file is not valid UTF-8 and was decoded as Windows-1252."),
    ]
}


@dataclass
class Flag:
    code: str
    investigation_id: str
    file: str | None
    rows: list[int]
    column: str | None
    raw: str | None
    detail: str
    action: str
    test_ids: list[str] = field(default_factory=list)

    @property
    def severity(self) -> Severity:
        return DEFS[self.code].severity

    def key(self) -> tuple[str, str, str, tuple[int, ...], str, str]:
        return (self.investigation_id, self.file or "", self.code, tuple(self.rows), self.column or "",
                self.raw or "")

    def to_json(self, idx: int) -> dict[str, object]:
        d = DEFS[self.code]
        return {
            "id": f"F{idx:04d}",
            "code": self.code,
            "severity": d.severity,
            "title": d.title,
            "investigation_id": self.investigation_id,
            "file": self.file,
            "rows": self.rows,
            "column": self.column,
            "raw": self.raw,
            "detail": self.detail,
            "action": self.action,
            "test_ids": sorted(self.test_ids),
        }


class FlagLog:
    def __init__(self) -> None:
        self.items: list[Flag] = []

    def add(self, flag: Flag) -> Flag:
        if flag.code not in DEFS:
            raise ValueError(f"unknown flag code {flag.code}")
        self.items.append(flag)
        return flag

    def sorted(self) -> list[Flag]:
        return sorted(self.items, key=lambda f: f.key())
