"""FLEX-2 (PSI-68) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import flex2
from redshift.normalise.base import Ctx
from redshift.normalise.base import TestRecord as Rec
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


@pytest.fixture(scope="module")
def run() -> tuple[Ctx, FlagLog, Registry]:
    spec = flex2.SPEC
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
    s = flex2.SPEC
    assert s.investigation_id == "PSI-68"
    assert s.folder == "FLEX-2"
    assert (s.fuel_class, s.test_kind) == ("droplet", "burn")
    assert [t.table_key for t in s.tables] == ["main"]
    assert "\u2014" not in s.mapping_doc and "\u2014" not in open(flex2.__file__, encoding="utf-8").read()
    assert "dangerous" not in s.mapping_doc.lower()


def test_reconciliation(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (8, 8)
    assert len(r.duplicates_removed) == 0
    assert len(r.blank_excluded) == 0
    assert len(r.non_test_excluded) == 0
    assert all(rec.fuel_class == "droplet" and rec.test_kind == "burn" for rec in ctx.records)


def test_rows_are_a_test_matrix(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, flags, reg = run
    r2 = _rec(ctx, 2)
    assert r2.fields["fuel"]["v"] == "IsoOctane (pure)"
    assert r2.fields["test_label"]["v"] == "IsoOctane (pure)"
    assert r2.fields["diluent"]["v"] == "O2/N2 or O2/He"
    assert reg.get(r2.fields["diluent"]["p"]).raw == "O2/N2 or O2/He"
    assert r2.fields["o2_basis"]["v"] == "ambient"
    assert _rec(ctx, 9).fields["fuel"]["v"] == "Propanol (80%) Glycerol (20%) (mixture)"
    for rec in ctx.records:
        for f in ("o2_pct", "pressure_kpa", "pressure_psi", "flow_cm_s"):
            assert rec.fields[f]["v"] is None
    assert _raw(reg, r2, "o2_pct") == "0.17; 0.21;0.25; 0.3"
    assert _raw(reg, r2, "pressure_kpa") == "0.5; 1.0; 1.5; 2.0; or 3.0 "
    assert _raw(reg, r2, "flow_cm_s") == "0.1 - 5"


def test_flags(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    c = _codes(flags)
    assert c["non_numeric"] == 24
    for line in range(2, 10):
        cols = sorted(f.column or "" for f in _find(flags, "non_numeric", line))
        assert cols == ["Ambient Pressure (atm)", "Flow Velocity (cm/s)", "Oxygen Mole Fraction"]
    assert "exact_duplicate" not in c and "non_test_row" not in c
