"""Read PSI experiment tables exactly, keeping physical line numbers and raw strings."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from pathlib import Path

from redshift.paths import PSI_RAW, rel


@dataclass
class RawRow:
    line: int  # physical line on which this record starts (header is line 1)
    cells: list[str]

    def is_blank(self) -> bool:
        return all(c.strip() == "" for c in self.cells)


@dataclass
class RawTable:
    investigation_id: str
    table_key: str
    path: str  # relative to repository root
    encoding: str
    file_transforms: list[str]
    header: list[str]
    rows: list[RawRow] = field(default_factory=list)

    def col(self, name: str) -> int:
        """Index of a column by its exact header text (after trimming whitespace)."""
        names = [h.strip() for h in self.header]
        if name.strip() not in names:
            raise KeyError(f"{self.path}: no column {name!r}; columns are {names}")
        return names.index(name.strip())


def read_table(investigation_id: str, table_key: str, relpath: str) -> RawTable:
    """Read one CSV. ``relpath`` is relative to data/raw/psi."""
    path: Path = PSI_RAW / relpath
    data = path.read_bytes()
    transforms: list[str] = []
    try:
        textdata = data.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        textdata = data.decode("cp1252")
        encoding = "cp1252"
        transforms.append("decode_cp1252")
    if textdata.startswith("﻿"):
        textdata = textdata[1:]
        transforms.append("strip_bom")
    reader = csv.reader(io.StringIO(textdata, newline=""))
    header = next(reader)
    rows: list[RawRow] = []
    prev_end = reader.line_num
    for cells in reader:
        rows.append(RawRow(line=prev_end + 1, cells=cells))
        prev_end = reader.line_num
    return RawTable(investigation_id, table_key, rel(path), encoding, transforms, header, rows)
