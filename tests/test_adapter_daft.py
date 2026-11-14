"""DAFT / DAFT-2 (PSI-47) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import daft
from redshift.normalise.base import Ctx
from redshift.normalise.base import TestRecord as Rec
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


@pytest.fixture(scope="module")
def run() -> tuple[Ctx, FlagLog, Registry]:
    spec = daft.SPEC
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
    s = daft.SPEC
    assert s.investigation_id == "PSI-47"
    assert s.folder == "DAFT-DAFT-2"
    assert (s.fuel_class, s.test_kind) == ("none", "dust")
    assert [t.table_key for t in s.tables] == ["main"]
    assert "\u2014" not in s.mapping_doc and "\u2014" not in open(daft.__file__, encoding="utf-8").read()
    assert "dangerous" not in s.mapping_doc.lower()


def test_reconciliation(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (2, 2)
    assert len(r.duplicates_removed) == 0
    assert len(r.blank_excluded) == 0
    assert len(r.non_test_excluded) == 0
    assert all(rec.fuel_class == "none" and rec.test_kind == "dust" for rec in ctx.records)


def test_known_values(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, reg = run
    r2, r3 = _rec(ctx, 2), _rec(ctx, 3)
    assert r2.fields["test_label"]["v"] == "D1" and r3.fields["test_label"]["v"] == "D2"
    assert r2.fields["test_date"]["v"] == "GMT 54 (2005)" and r3.fields["test_date"]["v"] == "GMT 63 (2005)"
    assert r2.fields["notes"]["v"] == "Contained the modified P-Trak with Alcohol Wick and batteries"
    assert r3.fields["notes"]["v"] == "Contained DustTrak and batteries"
    assert r2.fields["material"]["v"].startswith("Arizona Road Dust (ARD Fine)")
    assert reg.get(r2.fields["material"]["p"]).row == 2
    for rec in ctx.records:
        for f in ("o2_pct", "pressure_kpa", "pressure_psi", "flow_cm_s"):
            assert rec.fields[f]["v"] is None


def test_flags(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    li = _find(flags, "label_inconsistent")
    assert len(li) == 1 and li[0].rows == [2, 3] and "Arizona Red Dust" in li[0].detail
    assert set(_codes(flags)) == {"missing_column", "label_inconsistent"}
