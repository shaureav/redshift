"""CFI (PSI-39) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import cfi
from redshift.normalise.base import Ctx
from redshift.normalise.base import TestRecord as Rec
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


@pytest.fixture(scope="module")
def run() -> tuple[Ctx, FlagLog, Registry]:
    spec = cfi.SPEC
    t = spec.tables[0]
    reg, flags = Registry(), FlagLog()
    ctx = Ctx(read_table(spec.investigation_id, t.table_key, t.relpath), reg, flags,
              doi=_doi(spec.investigation_id), fuel_class=spec.fuel_class, test_kind=spec.test_kind)
    spec.adapt(ctx)
    ctx.finish()
    return ctx, flags, reg


def _rec(ctx: Ctx, line: int) -> Rec:
    return next(r for r in ctx.records if r.source_row == line)


def _codes(flags: FlagLog) -> Counter[str]:
    return Counter(f.code for f in flags.items)


def _find(flags: FlagLog, code: str, line: int | None = None, column: str | None = None) -> list[Flag]:
    return [f for f in flags.items if f.code == code and (line is None or line in f.rows)
            and (column is None or f.column == column)]


def _raw(reg: Registry, rec: Rec, field: str) -> str | None:
    return reg.get(rec.fields[field]["p"]).raw


def test_spec() -> None:
    s = cfi.SPEC
    assert s.investigation_id == "PSI-39"
    assert s.folder == "CFI"
    assert (s.fuel_class, s.test_kind) == ("droplet", "burn")
    assert [t.table_key for t in s.tables] == ["main"]
    assert "\u2014" not in s.mapping_doc and "\u2014" not in open(cfi.__file__, encoding="utf-8").read()
    assert "dangerous" not in s.mapping_doc.lower()


def test_reconciliation(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (87, 79)
    assert len(r.duplicates_removed) == 8
    assert len(r.blank_excluded) == 0
    assert len(r.non_test_excluded) == 0
    assert all(rec.fuel_class == "droplet" and rec.test_kind == "burn" for rec in ctx.records)


def test_duplicates_are_lines_81_to_88(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, _ = run
    assert ctx.recon.duplicates_removed == [{"line": 81 + i, "duplicate_of": 24 + i} for i in range(8)]


def test_known_values(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, _, reg = run
    r2 = _rec(ctx, 2)
    assert r2.fields["test_label"]["v"] == "1206"
    assert r2.fields["test_date"]["v"] == "9-Mar-17"
    assert _raw(reg, r2, "o2_pct") == "0.21" and r2.fields["o2_pct"]["v"] == pytest.approx(21.0)
    assert _raw(reg, r2, "n2_pct") == "0.79" and r2.fields["n2_pct"]["v"] == pytest.approx(79.0)
    assert r2.fields["he_pct"]["v"] == 0.0
    assert r2.fields["fuel"]["v"] == "C12H26"
    assert r2.fields["o2_basis"]["v"] == "ambient"
    assert r2.fields["diluent"]["v"] == "N2"
    r8 = _rec(ctx, 8)
    assert _raw(reg, r8, "o2_pct") == "0.17" and r8.fields["o2_pct"]["v"] == pytest.approx(17.0)
    r75 = _rec(ctx, 75)
    assert _raw(reg, r75, "he_pct") == "0.59" and r75.fields["he_pct"]["v"] == pytest.approx(59.0)
    assert r75.fields["diluent"]["v"] == "N2 + He"
    r24 = _rec(ctx, 24)
    assert r24.fields["fuel"]["v"] == "[.75]/[.25] C12H26/iso-dodecane"
    assert reg.get(r24.fields["fuel"]["p"]).raw == "[.75]/[.25] C12H26/iso-dodecane "


def test_pressure_is_never_a_number(run: tuple[Ctx, FlagLog, Registry]) -> None:
    ctx, flags, _ = run
    for r in ctx.records:
        assert r.fields["pressure_kpa"]["v"] is None and r.fields["pressure_psi"]["v"] is None
    r60 = _rec(ctx, 60)
    assert r60.raw["Pressure"] == "0.75 atm" and r60.fields["notes"]["v"] == "0.75 atm"
    r64 = _rec(ctx, 64)
    assert r64.fields["notes"]["v"] == "0.5 atm"
    nn = _find(flags, "non_numeric", column="Pressure")
    assert len(nn) == 79
    assert [f.raw for f in _find(flags, "non_numeric", 12, "Pressure")] == ["1 atm "]
    assert _find(flags, "missing_column", column="pressure_kpa")


def test_composition_sum_lines_13_to_16(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    cs = _find(flags, "composition_sum")
    assert sorted(ln for f in cs for ln in f.rows) == [13, 14, 15, 16]
    assert cs[0].raw == "0.21,0.76,0"


def test_date_and_time_flags(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    d38 = _find(flags, "date_inconsistent", 38, "Test Date")
    assert len(d38) == 1 and d38[0].raw == "29-Jul-17" and "f180d02" in d38[0].detail
    t52 = _find(flags, "date_inconsistent", 52, "Local Time")
    assert len(t52) == 1 and t52[0].raw == "02:22:xx pm est"
    order = [f.rows for f in _find(flags, "date_inconsistent", column="Local Time") if len(f.rows) == 2]
    assert order == [[37, 38], [55, 56], [62, 63], [78, 79]]
    assert _codes(flags)["date_inconsistent"] == 6


def test_page_dates_disagree(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    m = _find(flags, "metadata_inconsistent")
    assert len(m) == 1 and "9-Mar-17" in m[0].detail and "21-Aug-17" in m[0].detail and "2020" in m[0].detail


def test_flag_counts(run: tuple[Ctx, FlagLog, Registry]) -> None:
    _, flags, _ = run
    c = _codes(flags)
    assert c["exact_duplicate"] == 8
    assert c["non_numeric"] == 79
    assert c["composition_sum"] == 4
    assert c["metadata_inconsistent"] == 1
    assert "out_of_range" not in c
