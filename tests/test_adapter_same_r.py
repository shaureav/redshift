"""SAME-R (PSI-101) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import same_r
from redshift.normalise.base import Ctx
from redshift.normalise.base import TestRecord as Rec
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


@pytest.fixture(scope="module")
def run() -> tuple[Ctx, FlagLog, Registry]:
    spec = same_r.SPEC
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
    s = same_r.SPEC
    assert s.investigation_id == "PSI-101"
    assert s.folder == "SAME-R"
    assert (s.fuel_class, s.test_kind) == ("solid", "smoke")
    assert [t.table_key for t in s.tables] == ["main"]
    assert "\u2014" not in s.mapping_doc and "\u2014" not in open(same_r.__file__, encoding="utf-8").read()
    assert "dangerous" not in s.mapping_doc.lower()


def test_reconciliation(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (109, 109)
    assert len(r.duplicates_removed) == 0
    assert len(r.blank_excluded) == 0
    assert len(r.non_test_excluded) == 0
    assert all(rec.fuel_class == "solid" and rec.test_kind == "smoke" for rec in ctx.records)


def test_known_values(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, reg = run
    r2 = _rec(ctx, 2)
    assert r2.fields["test_label"]["v"] == "51" and r2.fields["material"]["v"] == "Kapton"
    assert r2.fields["test_date"]["v"] == "21-Jul" and r2.fields["notes"]["v"] == "B.L. new formula"
    assert _raw(reg, r2, "flow_cm_s") == "8.1" and r2.fields["flow_cm_s"]["v"] == pytest.approx(8.1)
    r24 = _rec(ctx, 24)
    assert _raw(reg, r24, "flow_cm_s") == "0" and r24.fields["flow_cm_s"]["v"] == 0.0
    r28 = _rec(ctx, 28)
    assert r28.fields["flow_cm_s"]["v"] == 1.0
    r3 = _rec(ctx, 3)
    assert r3.fields["test_label"]["v"] == "51a"
    labels = [r.fields["test_label"]["v"] for r in ctx.records]
    base_ids = [x for x in labels if not x.endswith("a")]
    # SAME-R.md reports 66 test points; test 57 appears twice.
    assert len(base_ids) == 67 and len(set(base_ids)) == 66


def test_test_57_near_duplicate(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, flags, _ = run
    nd = _find(flags, "near_duplicate")
    assert len(nd) == 1 and nd[0].rows == [57, 75] and nd[0].raw == "57"
    assert "same values in every other column" in nd[0].detail
    assert _rec(ctx, 57).fields["material"]["v"] == "Lampwick"
    assert _rec(ctx, 75).fields["material"]["v"] == "Teflon"
    f_idx = next(i for i, f in enumerate(flags.items) if f.code == "near_duplicate")
    assert f_idx in _rec(ctx, 57).flag_refs and f_idx in _rec(ctx, 75).flag_refs


def test_flag_counts(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    c = _codes(flags)
    assert c["near_duplicate"] == 1
    assert c["date_inconsistent"] == 1
    assert "out_of_range" not in c and "non_numeric" not in c
