"""SLICE (PSI-106) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import slice
from redshift.normalise.base import Ctx
from redshift.normalise.base import TestRecord as Rec
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


@pytest.fixture(scope="module")
def run() -> tuple[Ctx, FlagLog, Registry]:
    spec = slice.SPEC
    t = spec.tables[0]
    reg, flags = Registry(), FlagLog()
    ctx = Ctx(
        read_table(spec.investigation_id, t.table_key, t.relpath),
        reg,
        flags,
        doi=_doi(spec.investigation_id),
        fuel_class=spec.fuel_class,
        test_kind=spec.test_kind,
    )
    spec.adapt(ctx)
    ctx.finish()
    return ctx, flags, reg


def _rec(ctx: Ctx, line: int) -> Rec:
    return next(r for r in ctx.records if r.source_row == line)


def _codes(flags: FlagLog) -> Counter[str]:
    return Counter(f.code for f in flags.items)


def _find(flags: FlagLog, code: str, line: int | None = None, column: str | None = None) -> list[Flag]:
    return [
        f
        for f in flags.items
        if f.code == code and (line is None or line in f.rows) and (column is None or f.column == column)
    ]


def _raw(reg: Registry, rec: Rec, field: str) -> str | None:
    return reg.get(rec.fields[field]["p"]).raw


def test_spec() -> None:
    s = slice.SPEC
    assert s.investigation_id == "PSI-106"
    assert s.folder == "SLICE"
    assert (s.fuel_class, s.test_kind) == ("gas", "flame")
    assert [t.table_key for t in s.tables] == ["main"]
    assert "\u2014" not in s.mapping_doc and "\u2014" not in open(slice.__file__, encoding="utf-8").read()
    assert "dangerous" not in s.mapping_doc.lower()


def test_reconciliation(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (12, 12)
    assert len(r.duplicates_removed) == 0
    assert len(r.blank_excluded) == 0
    assert len(r.non_test_excluded) == 0
    assert all(rec.fuel_class == "gas" and rec.test_kind == "flame" for rec in ctx.records)


def test_known_values(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, reg = run
    r2 = _rec(ctx, 2)
    assert r2.fields["test_date"]["v"] == "2012-FEB-09" and r2.fields["fuel"]["v"] == "100% CH4"
    r10 = _rec(ctx, 10)
    assert r10.fields["fuel"]["v"] == "100% CH4" and reg.get(r10.fields["fuel"]["p"]).raw == " 100% CH4"
    r3 = _rec(ctx, 3)
    assert r3.fields["test_date"]["v"] == "2012-FEB-13 SLICE testing with"
    assert r3.fields["fuel"]["v"].startswith("40% CH4 (balance N2) including 2 pyrometry")
    assert r3.fields["fuel_conc_pct"]["v"] is None
    for rec in ctx.records:
        assert rec.fields["o2_pct"]["v"] is None and rec.fields["pressure_kpa"]["v"] is None


def test_line_13_spice_text(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, flags, _ = run
    r13 = _rec(ctx, 13)
    assert r13.fields["fuel"]["v"] == "100% C2H4"
    iv = _find(flags, "implausible_value", 13, "Test Date")
    assert len(iv) == 1 and "SPICE" in (iv[0].raw or "")
    assert _codes(flags)["implausible_value"] == 1


def test_date_prose_flags(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    lines = sorted(f.rows[0] for f in _find(flags, "date_inconsistent", column="Test Date"))
    assert lines == [3, 8, 12, 13]
