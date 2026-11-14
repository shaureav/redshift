"""SPICE (PSI-107) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import spice
from redshift.normalise.base import Ctx
from redshift.normalise.base import TestRecord as Rec
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


@pytest.fixture(scope="module")
def run() -> tuple[Ctx, FlagLog, Registry]:
    spec = spice.SPEC
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
    s = spice.SPEC
    assert s.investigation_id == "PSI-107"
    assert s.folder == "SPICE"
    assert (s.fuel_class, s.test_kind) == ("gas", "flame")
    assert [t.table_key for t in s.tables] == ["main"]
    assert "\u2014" not in s.mapping_doc and "\u2014" not in open(spice.__file__, encoding="utf-8").read()
    assert "dangerous" not in s.mapping_doc.lower()


def test_reconciliation(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (469, 435)
    assert len(r.duplicates_removed) == 34
    assert len(r.blank_excluded) == 0
    assert len(r.non_test_excluded) == 0
    assert all(rec.fuel_class == "gas" and rec.test_kind == "flame" for rec in ctx.records)


def test_duplicates(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    d = {x["line"]: x["duplicate_of"] for x in ctx.recon.duplicates_removed}
    assert d[3] == 2 and d[7] == 6 and d[336] == 330
    assert d[131] == 129 and d[132] == 129
    assert d[235] == 234 and d[236] == 234 and d[241] == 240 and d[242] == 240


def test_negative_air_rate(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, flags, reg = run
    oor = _find(flags, "out_of_range", column="Air Rate (cm/s)")
    assert sorted((f.rows[0], f.raw) for f in oor) == [
        (296, "-0.28"),
        (298, "-0.28"),
        (299, "-0.28"),
        (300, "-0.28"),
        (301, "-0.28"),
        (337, "-5.92"),
        (338, "-5.92"),
        (339, "-5.92"),
    ]
    r296 = _rec(ctx, 296)
    assert r296.fields["flow_cm_s"]["v"] is None and _raw(reg, r296, "flow_cm_s") == "-0.28"


def test_known_values(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, reg = run
    r2 = _rec(ctx, 2)
    assert _raw(reg, r2, "flow_cm_s") == "36.39" and r2.fields["flow_cm_s"]["v"] == pytest.approx(36.39)
    assert r2.fields["fuel"]["v"] == "Ethylene"
    assert r2.fields["test_date"]["v"] == "45"
    assert r2.fields["test_label"]["v"] == "14:37:08"
    assert r2.fields["o2_pct"]["v"] is None and r2.fields["pressure_kpa"]["v"] is None
    assert "o2_basis" not in r2.fields or r2.fields["o2_basis"]["v"] is None
    r31 = _rec(ctx, 31)
    assert r31.fields["flow_cm_s"]["v"] is None and _raw(reg, r31, "flow_cm_s") == ""
    blank_air = [r.source_row for r in ctx.records if r.raw["Air Rate (cm/s)"].strip() == ""]
    assert len(blank_air) == 20  # 25 blank cells in the raw file, 5 of them on removed duplicate lines


def test_fuel_spelling(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, flags, _ = run
    li = _find(flags, "label_inconsistent")
    assert len(li) == 1
    assert li[0].raw == "75 % Propylene | 75% Propylene"
    assert 94 in li[0].rows and 95 in li[0].rows
    assert _rec(ctx, 94).fields["fuel"]["v"] == "75% Propylene"
    assert _rec(ctx, 95).fields["fuel"]["v"] == "75 % Propylene"
    assert sum(1 for r in ctx.records if r.fields["fuel"]["v"] == "75% Propylene") == 16


def test_time_flags(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    dotted = [f for f in _find(flags, "date_inconsistent") if f.raw and "." in f.raw]
    assert len({f.rows[0] for f in dotted}) == 62  # 66 rows with dotted times, 4 of them removed duplicates
    assert [f.raw for f in _find(flags, "date_inconsistent", 29, "GMT ignition")] == ["14.34.57"]
    assert [f.raw for f in _find(flags, "date_inconsistent", 95, "GMT ignition")] == ["no ku"]
    assert [f.raw for f in _find(flags, "date_inconsistent", 337, "GMT ignition")] == ["LOS"]
    assert [f.raw for f in _find(flags, "date_inconsistent", 258, "GMT ignition")] == ["n/a"]
    assert [f.raw for f in _find(flags, "date_inconsistent", 234, "GMT  Flame Off")] == ["Ku LOS"]
    assert any(f.rows == [] and "no year" in f.detail for f in _find(flags, "date_inconsistent"))


def test_flag_counts(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    c = _codes(flags)
    assert c["exact_duplicate"] == 34
    assert c["out_of_range"] == 8
    assert c["label_inconsistent"] == 1
    assert c["date_inconsistent"] == 137
