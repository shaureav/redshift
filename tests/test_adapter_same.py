"""SAME (PSI-102) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import same
from redshift.normalise.base import Ctx
from redshift.normalise.base import TestRecord as Rec
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


@pytest.fixture(scope="module")
def run() -> tuple[Ctx, FlagLog, Registry]:
    spec = same.SPEC
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
    s = same.SPEC
    assert s.investigation_id == "PSI-102"
    assert s.folder == "SAME"
    assert (s.fuel_class, s.test_kind) == ("solid", "smoke")
    assert [t.table_key for t in s.tables] == ["main"]
    assert "\u2014" not in s.mapping_doc and "\u2014" not in open(same.__file__, encoding="utf-8").read()
    assert "dangerous" not in s.mapping_doc.lower()


def test_reconciliation(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (8, 8)
    assert len(r.duplicates_removed) == 0
    assert len(r.blank_excluded) == 0
    assert len(r.non_test_excluded) == 0
    assert all(rec.fuel_class == "solid" and rec.test_kind == "smoke" for rec in ctx.records)


def test_known_values(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, reg = run
    r2 = _rec(ctx, 2)
    assert r2.fields["test_label"]["v"] == "1" and r2.fields["material"]["v"] == "Teflon"
    assert _raw(reg, r2, "flow_cm_s") == "5" and r2.fields["flow_cm_s"]["v"] == 5.0
    r5 = _rec(ctx, 5)
    assert _raw(reg, r5, "flow_cm_s") == "10" and r5.fields["flow_cm_s"]["v"] == 10.0
    for rec in ctx.records:
        assert rec.fields["o2_pct"]["v"] is None and rec.fields["pressure_kpa"]["v"] is None


def test_reference_rows_are_kept_without_fill(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, flags, reg = run
    for line, mat in [(6, "Kapton"), (7, "Silicone Rubber"), (8, "Lampwick"), (9, "Dibutyl Phthalate")]:
        rec = _rec(ctx, line)
        assert rec.fields["material"]["v"] == f"{mat}: same conditions as 1-4"
        assert rec.fields["flow_cm_s"]["v"] is None and _raw(reg, rec, "flow_cm_s") == ""
    assert not _find(flags, "non_test_row")


def test_flag_counts(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    assert set(_codes(flags)) == {"missing_column"}
