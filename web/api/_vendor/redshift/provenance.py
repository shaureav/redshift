"""Provenance: where every value came from.

Every value that can reach the screen is stored as ``{"v": value, "u": unit, "p": prov_id}``.
``prov_id`` keys into a single registry (``provenance.json``) of ``Prov`` records.

Source types:
- ``psi_table``: a cell of a PSI experiment table (file, physical line, column, raw string).
- ``psi_page``: a quoted line of a harvested PSI investigation page (file, line, exact quote).
- ``published_paper``: a value quoted from a paper (DOI or NTRS ID, page, exact quote). These
  start ``verified=False`` and only reach the UI after a named team member verifies them.
- ``reference_document``: an exact quote from a reference document held in data/raw/reference (the
  official challenge statement), checked automatically against the file.
- ``derived``: computed by the pipeline (method, version, parameters, inputs).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SourceType = Literal["psi_table", "psi_page", "published_paper", "reference_document", "derived"]


class Prov(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source_type: SourceType
    investigation_id: str | None = None
    file: str | None = None
    row: int | None = Field(default=None, description="Physical line number in the file; header is line 1")
    column: str | None = None
    raw: str | None = None
    transforms: list[str] = Field(default_factory=list)
    doi: str | None = None
    ntrs: str | None = None
    page: int | None = None
    quote: str | None = None
    method: str | None = None
    method_version: str | None = None
    params: dict[str, Any] | None = None
    inputs: list[str] | None = None
    note: str | None = None
    verified: bool = True
    verified_by: str | None = None
    verified_at: str | None = None


class Registry:
    """Deterministic store of provenance records keyed by id."""

    def __init__(self) -> None:
        self._items: dict[str, Prov] = {}

    def add(self, prov: Prov) -> str:
        existing = self._items.get(prov.id)
        if existing is not None and existing != prov:
            raise ValueError(f"provenance id collision with different content: {prov.id}")
        self._items[prov.id] = prov
        return prov.id

    def get(self, prov_id: str) -> Prov:
        return self._items[prov_id]

    def __contains__(self, prov_id: object) -> bool:
        return prov_id in self._items

    def __len__(self) -> int:
        return len(self._items)

    def to_json(self) -> dict[str, dict[str, Any]]:
        return {k: self._items[k].model_dump(exclude_none=True) for k in sorted(self._items)}


def value(v: float | int | str | None, unit: str | None, prov_id: str) -> dict[str, Any]:
    """The only shape in which a value leaves the pipeline."""
    out: dict[str, Any] = {"v": v, "p": prov_id}
    if unit is not None:
        out["u"] = unit
    return out
