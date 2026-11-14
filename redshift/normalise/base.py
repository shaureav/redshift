"""Adapter framework: turns one raw PSI table into canonical test records.

Each investigation has its own small adapter module that maps columns by hand. The framework
here does the generic, audited work: blank and exact-duplicate removal, cell provenance,
the allowed transforms, range checks and the reconciliation count. An adapter can only
produce a value through ``Ctx`` methods, so every value carries provenance.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any, Literal

from redshift import transforms as T
from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import RawRow, RawTable
from redshift.provenance import Prov, Registry, value

FuelClass = Literal["gas", "droplet", "solid", "emulator", "none"]
TestKind = Literal["flame", "burn", "smoke", "dust"]

FUEL_CLASSES: tuple[str, ...] = ("gas", "droplet", "solid", "emulator", "none")

# Canonical fields: name -> (unit, physical range or None). Order is the output column order.
NUMERIC_FIELDS: dict[str, tuple[str, tuple[float, float] | None]] = {
    "o2_pct": ("%", (0.0, 100.0)),
    "pressure_kpa": ("kPa", (0.0, 400.0)),
    "pressure_psi": ("psi", None),
    "co2_pct": ("%", (0.0, 100.0)),
    "he_pct": ("%", (0.0, 100.0)),
    "n2_pct": ("%", (0.0, 100.0)),
    "flow_cm_s": ("cm/s", (0.0, 1000.0)),
    "fuel_conc_pct": ("%", (0.0, 100.0)),
    "n_flames": ("count", (0.0, 10000.0)),
}
TEXT_FIELDS: tuple[str, ...] = (
    "test_label", "test_date", "fuel", "material", "diluent", "outcome_label", "suppressant",
    "gravity_level", "o2_basis", "notes",
)

_SPREADSHEET_ERROR = re.compile(r"^#(VALUE|DIV/0|REF|NAME\?|N/A|NUM|NULL)!?$", re.I)


@dataclass
class TestRecord:
    test_id: str
    investigation_id: str
    table_key: str
    table_file: str
    source_row: int
    fuel_class: str
    test_kind: str
    fields: dict[str, dict[str, Any]]
    raw: dict[str, str]
    flag_refs: list[int] = field(default_factory=list)  # indices into the FlagLog


@dataclass
class Reconciliation:
    investigation_id: str
    table_key: str
    table_file: str
    physical_lines: int
    header_lines: int
    records_in: int
    blank_excluded: list[int] = field(default_factory=list)
    duplicates_removed: list[dict[str, int]] = field(default_factory=list)
    non_test_excluded: list[dict[str, Any]] = field(default_factory=list)
    tests_out: int = 0

    def balanced(self) -> bool:
        return self.records_in == (
            self.tests_out + len(self.blank_excluded) + len(self.duplicates_removed) + len(self.non_test_excluded)
        )

    def to_json(self) -> dict[str, Any]:
        return {
            "investigation_id": self.investigation_id,
            "table_key": self.table_key,
            "table_file": self.table_file,
            "physical_lines": self.physical_lines,
            "header_lines": self.header_lines,
            "records_in": self.records_in,
            "blank_excluded": len(self.blank_excluded),
            "blank_excluded_lines": self.blank_excluded,
            "duplicates_removed": len(self.duplicates_removed),
            "duplicates_removed_detail": self.duplicates_removed,
            "non_test_excluded": len(self.non_test_excluded),
            "non_test_excluded_detail": self.non_test_excluded,
            "tests_out": self.tests_out,
            "balanced": self.balanced(),
        }


class Ctx:
    """Everything an adapter may do to one table."""

    def __init__(self, table: RawTable, registry: Registry, flags: FlagLog, *, doi: str, fuel_class: str,
                 test_kind: str) -> None:
        self.table = table
        self.registry = registry
        self.flags = flags
        self.doi = doi
        self.default_fuel_class = fuel_class
        self.default_test_kind = test_kind
        self.records: list[TestRecord] = []
        self.recon = Reconciliation(
            investigation_id=table.investigation_id,
            table_key=table.table_key,
            table_file=table.path,
            physical_lines=len(table.rows) + 1 if not table.rows else table.rows[-1].line,
            header_lines=1,
            records_in=len(table.rows),
        )
        self._row_flags: dict[int, list[int]] = {}
        if "decode_cp1252" in table.file_transforms:
            self.flag("encoding", None, None, None, "File is not valid UTF-8; decoded as Windows-1252.",
                      "Decoded; no characters changed.")

    # ---------- identity ----------
    @property
    def inv(self) -> str:
        return self.table.investigation_id

    def test_id(self, row: RawRow) -> str:
        return f"{self.inv}-{self.table.table_key}-L{row.line}"

    def raw(self, row: RawRow, col: str) -> str:
        return row.cells[self.table.col(col)]

    # ---------- flags ----------
    def flag(self, code: str, row: RawRow | None, col: str | None, raw: str | None, detail: str, action: str,
             *, rows: list[int] | None = None) -> None:
        lines = rows if rows is not None else ([row.line] if row is not None else [])
        f = Flag(code=code, investigation_id=self.inv, file=self.table.path, rows=lines, column=col, raw=raw,
                 detail=detail, action=action)
        self.flags.add(f)
        idx = len(self.flags.items) - 1
        for ln in lines:
            self._row_flags.setdefault(ln, []).append(idx)

    # ---------- row iteration ----------
    def rows(self) -> Iterator[RawRow]:
        """Rows after removing blank rows and byte-identical duplicates (both recorded)."""
        seen: dict[tuple[str, ...], int] = {}
        blanks: list[int] = []
        for row in self.table.rows:
            if row.is_blank():
                blanks.append(row.line)
                self.recon.blank_excluded.append(row.line)
                continue
            key = tuple(row.cells)
            if key in seen:
                self.recon.duplicates_removed.append({"line": row.line, "duplicate_of": seen[key]})
                self.flag("exact_duplicate", row, None, ",".join(row.cells),
                          f"Byte-identical to line {seen[key]}.", "Removed (remove_exact_duplicate).")
                continue
            seen[key] = row.line
            yield row
        if blanks:
            self.flag("blank_row", None, None, None,
                      f"{len(blanks)} blank rows (lines {blanks[0]} to {blanks[-1]}).",
                      "Excluded (exclude_blank_row).", rows=[])

    def exclude(self, row: RawRow, reason: str) -> None:
        """Exclude a non-test row (a note, a continuation stub). It is listed verbatim in the report."""
        self.recon.non_test_excluded.append({"line": row.line, "reason": reason, "raw": row.cells})
        self.flag("non_test_row", row, None, ",".join(row.cells), reason, "Excluded from tests; kept in report.")

    # ---------- provenance ----------
    def _prov(self, row: RawRow, col: str, raw: str, applied: list[str], suffix: str = "") -> str:
        col_idx = self.table.col(col)
        pid = f"cell:{self.inv}:{self.table.table_key}:L{row.line}:C{col_idx}{suffix}"
        return self.registry.add(Prov(
            id=pid, source_type="psi_table", investigation_id=self.inv, file=self.table.path, row=row.line,
            column=self.table.header[col_idx], raw=raw, transforms=[*self.table.file_transforms, *applied],
            doi=self.doi,
        ))

    def missing(self, field_name: str, reason: str = "The table has no column for this condition.") -> dict[str, Any]:
        """A field the table does not record. Null, with provenance saying why."""
        pid = f"missing:{self.inv}:{self.table.table_key}:{field_name}"
        if pid not in self.registry:
            self.registry.add(Prov(id=pid, source_type="psi_table", investigation_id=self.inv,
                                   file=self.table.path, note=reason, doi=self.doi))
            self.flag("missing_column", None, field_name, None, reason, "Value is null ('not recorded').", rows=[])
        unit = NUMERIC_FIELDS[field_name][0] if field_name in NUMERIC_FIELDS else None
        return value(None, unit, pid)

    # ---------- value readers ----------
    def num(self, row: RawRow, col: str, field_name: str,
            parser: Callable[[str | None], tuple[float | None, list[str]]] = T.number,
            *, rng: tuple[float, float] | None | Literal["default"] = "default") -> dict[str, Any]:
        """Read a numeric cell. Text becomes a flag and a null; out-of-range becomes a flag and a null."""
        raw = self.raw(row, col)
        unit, default_rng = NUMERIC_FIELDS[field_name]
        bounds = default_rng if rng == "default" else rng
        try:
            v, applied = parser(raw)
        except T.NotClean as exc:
            s = raw.strip()
            code = "spreadsheet_error" if _SPREADSHEET_ERROR.match(s) else exc.code
            pid = self._prov(row, col, raw, ["trim"] if s != raw else [])
            self.flag(code, row, col, raw, exc.detail, "Raw kept; value set to null.")
            return value(None, unit, pid)
        pid = self._prov(row, col, raw, applied)
        if v is not None and bounds is not None and not (bounds[0] <= v <= bounds[1]) or (
            v is not None and field_name.startswith("pressure") and v <= 0
        ):
            self.flag("out_of_range", row, col, raw,
                      f"{field_name} = {v:g} {unit} is outside the physical range {bounds}.",
                      "Raw kept; value set to null.")
            return value(None, unit, pid)
        return value(v, unit, pid)

    def pressure(self, row: RawRow, col: str, unit: str) -> tuple[dict[str, Any], dict[str, Any]]:
        """Read a pressure in ``unit``; return (pressure_kpa, pressure_psi) value dicts."""
        kpa = self.num(row, col, "pressure_kpa", lambda r: T.pressure_kpa(r, unit))
        base = self.registry.get(kpa["p"])
        psi_id = kpa["p"] + ":psi"
        self.registry.add(base.model_copy(update={"id": psi_id, "transforms": [*base.transforms, "kpa_to_psi"]}))
        from redshift.units import kpa_to_psi
        return kpa, value(None if kpa["v"] is None else kpa_to_psi(kpa["v"]), "psi", psi_id)

    def text(self, row: RawRow, col: str) -> dict[str, Any]:
        raw = self.raw(row, col)
        v, applied = T.text(raw)
        return value(v, None, self._prov(row, col, raw, applied))

    def constant(self, field_name: str, v: str, note: str) -> dict[str, Any]:
        """A per-table constant stated by the investigation (for example the fuel class). Text only."""
        pid = f"const:{self.inv}:{self.table.table_key}:{field_name}"
        if pid not in self.registry:
            self.registry.add(Prov(id=pid, source_type="psi_page", investigation_id=self.inv,
                                   file=self.table.path, note=note, doi=self.doi))
        return value(v, None, pid)

    def derived_text(self, row: RawRow, field_name: str, v: str | None, method: str,
                     inputs: list[dict[str, Any]]) -> dict[str, Any]:
        """A text label computed from other recorded values of the same row (never a number)."""
        pid = f"derived:{self.inv}:{self.table.table_key}:L{row.line}:{field_name}"
        self.registry.add(Prov(id=pid, source_type="derived", investigation_id=self.inv, file=self.table.path,
                               row=row.line, method=method, method_version="1",
                               inputs=[i["p"] for i in inputs], doi=self.doi))
        return value(v, None, pid)

    # ---------- output ----------
    def emit(self, row: RawRow, fields: dict[str, dict[str, Any]], *, fuel_class: str | None = None,
             test_kind: str | None = None) -> TestRecord:
        for k in fields:
            if k not in NUMERIC_FIELDS and k not in TEXT_FIELDS:
                raise KeyError(f"unknown canonical field {k}")
        full: dict[str, dict[str, Any]] = {}
        for k in (*NUMERIC_FIELDS, *TEXT_FIELDS):
            if k in fields:
                full[k] = fields[k]
            elif k == "pressure_psi" and "pressure_kpa" not in fields:
                full[k] = self.missing("pressure_psi")
            elif k in NUMERIC_FIELDS and k != "pressure_psi":
                full[k] = self.missing(k)
        fc = fuel_class or self.default_fuel_class
        if fc not in FUEL_CLASSES:
            raise ValueError(f"bad fuel class {fc}")
        rec = TestRecord(
            test_id=self.test_id(row), investigation_id=self.inv, table_key=self.table.table_key,
            table_file=self.table.path, source_row=row.line, fuel_class=fc,
            test_kind=test_kind or self.default_test_kind, fields=full,
            raw={self.table.header[i]: c for i, c in enumerate(row.cells)},
        )
        self.records.append(rec)
        self.recon.tests_out += 1
        return rec

    def finish(self) -> None:
        """Attach flag references to records. Called by the build after the adapter runs."""
        by_line = {r.source_row: r for r in self.records}
        for ln, idxs in self._row_flags.items():
            if ln in by_line:
                by_line[ln].flag_refs.extend(idxs)
        if not self.recon.balanced():
            raise AssertionError(f"reconciliation failed for {self.table.path}: {self.recon.to_json()}")


@dataclass(frozen=True)
class TableSpec:
    table_key: str
    relpath: str  # relative to data/raw/psi


@dataclass(frozen=True)
class AdapterSpec:
    investigation_id: str
    folder: str
    fuel_class: str
    test_kind: str
    tables: tuple[TableSpec, ...]
    adapt: Callable[[Ctx], None]
    mapping_doc: str  # plain-English description of the column mapping, shown on the Methods page
