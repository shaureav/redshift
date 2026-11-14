"""ACME Flame Design (PSI-10) adapter, run on its own against the raw PSI tables."""

from __future__ import annotations

import csv

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import acme_flame_design
from redshift.normalise.base import Ctx
from redshift.paths import PSI_RAW
from redshift.provenance import Registry

RAMP_INV_LINES = [31, 32, 33, 77, 78, 87, 88, 94, 104]


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


def _run(key: str) -> tuple[Ctx, FlagLog, Registry]:
    spec = acme_flame_design.SPEC
    t = next(t for t in spec.tables if t.table_key == key)
    reg, flags = Registry(), FlagLog()
    ctx = Ctx(read_table(spec.investigation_id, t.table_key, t.relpath), reg, flags,
              doi=_doi(spec.investigation_id), fuel_class=spec.fuel_class, test_kind=spec.test_kind)
    spec.adapt(ctx)
    ctx.finish()
    return ctx, flags, reg


@pytest.fixture(scope="module")
def normal() -> tuple[Ctx, FlagLog, Registry]:
    return _run("normal")


@pytest.fixture(scope="module")
def inverse() -> tuple[Ctx, FlagLog, Registry]:
    return _run("inverse")


def _rec(ctx: Ctx, line: int):
    return next(r for r in ctx.records if r.source_row == line)


def _codes(flags: FlagLog) -> dict[str, int]:
    out: dict[str, int] = {}
    for f in flags.items:
        out[f.code] = out.get(f.code, 0) + 1
    return out


def _cells(ctx: Ctx, text: str) -> tuple[int, list[int]]:
    hits = [(row.line, c) for row in ctx.table.rows for c in row.cells if c.strip() == text]
    return len(hits), sorted({ln for ln, _ in hits})


def test_spec() -> None:
    s = acme_flame_design.SPEC
    assert s.investigation_id == "PSI-10"
    assert s.folder == "ACME-Flame-Design"
    assert (s.fuel_class, s.test_kind) == ("gas", "flame")
    assert [t.table_key for t in s.tables] == ["normal", "inverse"]
    assert chr(0x2014) not in s.mapping_doc


def test_normal_reconciliation(normal) -> None:
    ctx, _, _ = normal
    r = ctx.recon
    assert r.balanced()
    assert r.physical_lines == 208
    assert (r.records_in, r.tests_out) == (207, 207)
    assert r.blank_excluded == [] and r.duplicates_removed == [] and r.non_test_excluded == []


def test_inverse_reconciliation(inverse) -> None:
    ctx, _, _ = inverse
    r = ctx.recon
    assert r.balanced()
    assert r.physical_lines == 121
    assert (r.records_in, r.tests_out) == (120, 120)
    assert r.blank_excluded == [] and r.duplicates_removed == [] and r.non_test_excluded == []


def test_normal_values(normal) -> None:
    ctx, _, reg = normal
    r = _rec(ctx, 2)
    assert r.fields["test_label"]["v"] == "19115A1"
    assert r.fields["fuel"]["v"] == "C2H4"
    assert r.raw["XO2 (init)"] == "0.207128374"
    assert r.fields["o2_pct"]["v"] == pytest.approx(20.7128374)
    assert r.fields["o2_basis"]["v"] == "chamber initial"
    assert r.raw["pmean (atm)"] == "1.01796816"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(1.01796816 * 101.325)
    assert "atm_to_kpa" in reg.get(r.fields["pressure_kpa"]["p"]).transforms
    assert r.fields["fuel_conc_pct"]["v"] == pytest.approx(100.0)
    assert r.fields["gravity_level"]["v"] == "microgravity (ISS)"
    assert "outcome_label" not in r.fields

    r = _rec(ctx, 189)
    assert r.fields["fuel"]["v"] == "C3H8"
    assert r.raw["pmean (atm)"] == "" and r.raw["pinit (atm)"] == "0.931972789"
    assert r.fields["pressure_kpa"]["v"] is None and r.fields["pressure_psi"]["v"] is None
    assert r.fields["o2_pct"]["v"] == pytest.approx(40.0)

    r = _rec(ctx, 100)
    assert r.raw["pmean (atm)"] == "1.26395445"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(1.26395445 * 101.325)


def test_normal_ramped_and_ramp(normal) -> None:
    ctx, flags, reg = normal
    r3 = _rec(ctx, 3)
    assert r3.raw["Xfuel"] == "RAMPED" and reg.get(r3.fields["fuel_conc_pct"]["p"]).raw == "RAMPED"
    n, lines = _cells(ctx, "RAMPED")
    assert (n, lines) == (18, [3, 5, 7])
    n, lines = _cells(ctx, "RAMP")
    assert n == 342 and len(lines) == 57
    nn = [f for f in flags.items if f.code == "non_numeric"]
    assert len(nn) == 60 and all(f.column == "Xfuel" for f in nn)
    assert sorted(f.rows[0] for f in nn if f.raw == "RAMPED") == [3, 5, 7]
    assert sorted(f.rows[0] for f in nn if f.raw == "RAMP") == lines
    for line in (3, 27, 52):
        r = _rec(ctx, line)
        assert r.fields["fuel_conc_pct"]["v"] is None
        assert r.fields["o2_pct"]["v"] is not None  # O2 and pressure were recorded on ramp rows
        assert r.fields["pressure_kpa"]["v"] is not None


def test_normal_blank_pressure_flagged(normal) -> None:
    ctx, flags, _ = normal
    header = ctx.table.header
    blank_cells = [(row.line, h) for row in ctx.table.rows for h, c in zip(header, row.cells, strict=True)
                   if c.strip() == ""]
    assert len(blank_cells) == 60
    assert {h for _, h in blank_cells} == {"XO2 (final)", "pfinal (atm)", "pmean (atm)"}
    gap = [f for f in flags.items if f.code == "missing_column" and f.rows]
    assert len(gap) == 1 and gap[0].rows == list(range(189, 209)) and gap[0].column == "pmean (atm)"
    assert all(_rec(ctx, ln).fields["pressure_kpa"]["v"] is None for ln in range(189, 209))
    assert sum(r.fields["pressure_kpa"]["v"] is None for r in ctx.records) == 20


def test_normal_flag_counts(normal) -> None:
    _, flags, _ = normal
    assert _codes(flags) == {"no_licence": 1, "missing_column": 6, "non_numeric": 60}
    lic = next(f for f in flags.items if f.code == "no_licence")
    assert "line 19" in lic.detail


def test_inverse_values(inverse) -> None:
    ctx, _, _ = inverse
    r = _rec(ctx, 2)
    assert r.fields["test_label"]["v"] == "21328A1"
    # No Fuel column, and the PSI page does not say which fuel the inverse flames used: null, not "C2H4".
    assert r.fields["fuel"]["v"] is None
    assert r.fields["fuel"]["p"] == "missing:PSI-10:inverse:fuel"
    assert all(rec.fields["fuel"]["v"] is None for rec in ctx.records)
    assert r.raw["XO2"] == "0.37082819"
    assert r.fields["o2_pct"]["v"] == pytest.approx(37.082819)
    assert r.fields["o2_basis"]["v"] == "oxidiser stream (inverse flame)"
    assert r.raw["pmean (atm)"] == "1.00401873"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(1.00401873 * 101.325)
    assert r.fields["fuel_conc_pct"]["v"] is None

    r = _rec(ctx, 24)
    assert r.raw["pmean (atm)"] == "0.42596796"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(0.42596796 * 101.325)
    assert r.raw["XO2"] == "0.849977932"
    assert r.fields["o2_pct"]["v"] == pytest.approx(84.9977932)

    r = _rec(ctx, 91)
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(3.00491136 * 101.325)


def test_inverse_ramp_and_low_o2(inverse) -> None:
    ctx, flags, reg = inverse
    r89 = _rec(ctx, 89)
    assert r89.raw["XO2"] == "LOW O2" and reg.get(r89.fields["o2_pct"]["p"]).raw == "LOW O2"
    n, lines = _cells(ctx, "RAMP")
    assert (n, lines) == (51, RAMP_INV_LINES)
    n, lines = _cells(ctx, "LOW O2")
    assert (n, lines) == (12, [89, 90])
    nn = [f for f in flags.items if f.code == "non_numeric"]
    assert all(f.column == "XO2" for f in nn)
    assert sorted(f.rows[0] for f in nn if f.raw == "RAMP") == RAMP_INV_LINES
    assert sorted(f.rows[0] for f in nn if f.raw == "LOW O2") == [89, 90]
    for line in [*RAMP_INV_LINES, 89, 90]:
        r = _rec(ctx, line)
        assert r.fields["o2_pct"]["v"] is None
        assert "o2_basis" not in r.fields
        assert r.fields["pressure_kpa"]["v"] is not None


def test_inverse_label_flag(inverse) -> None:
    _, flags, _ = inverse
    lab = [f for f in flags.items if f.code == "label_inconsistent"]
    assert len(lab) == 1 and lab[0].rows == [87] and lab[0].raw == "22042M1"


def test_inverse_flag_counts(inverse) -> None:
    _, flags, _ = inverse
    assert _codes(flags) == {"missing_column": 7, "non_numeric": 11, "label_inconsistent": 1}
    missing = sorted(f.column for f in flags.items if f.code == "missing_column")
    assert missing == ["co2_pct", "flow_cm_s", "fuel", "fuel_conc_pct", "he_pct", "n2_pct", "n_flames"]


def test_no_invented_values(normal, inverse) -> None:
    for ctx, _, _ in (normal, inverse):
        for r in ctx.records:
            o2 = r.fields["o2_pct"]["v"]
            assert ("o2_basis" in r.fields) == (o2 is not None)
            assert set(r.raw) == set(ctx.table.header)
