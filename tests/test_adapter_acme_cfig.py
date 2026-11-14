"""ACME CFI-G (PSI-159) adapter, run on its own against the raw PSI tables."""

from __future__ import annotations

import csv

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import acme_cfig
from redshift.normalise.base import Ctx
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(psi_id: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[psi_id]


def _run(key: str) -> tuple[Ctx, FlagLog, Registry]:
    spec = acme_cfig.SPEC
    t = next(t for t in spec.tables if t.table_key == key)
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


def test_spec() -> None:
    s = acme_cfig.SPEC
    assert s.investigation_id == "PSI-159"
    assert s.folder == "ACME-CFI-G"
    assert (s.fuel_class, s.test_kind) == ("gas", "flame")
    assert [t.table_key for t in s.tables] == ["normal", "inverse"]
    assert chr(0x2014) not in s.mapping_doc


def test_normal_reconciliation(normal) -> None:
    ctx, _, _ = normal
    r = ctx.recon
    assert r.balanced()
    assert r.physical_lines == 180
    assert r.records_in == 179
    assert r.tests_out == 179
    assert r.blank_excluded == []
    assert r.duplicates_removed == []
    assert r.non_test_excluded == []


def test_inverse_reconciliation(inverse) -> None:
    ctx, flags, _ = inverse
    r = ctx.recon
    assert r.balanced()
    assert r.physical_lines == 1016
    assert r.records_in == 1015
    assert r.tests_out == 154
    assert len(r.blank_excluded) == 861
    assert r.blank_excluded[0] == 156 and r.blank_excluded[-1] == 1016
    assert r.duplicates_removed == []
    assert r.non_test_excluded == []
    blank = [f for f in flags.items if f.code == "blank_row"]
    assert len(blank) == 1 and "lines 156 to 1016" in blank[0].detail


def test_normal_values(normal) -> None:
    ctx, _, reg = normal
    r = _rec(ctx, 2)
    assert r.raw["Test"] == "21088A1"
    assert r.fields["test_label"]["v"] == "21088A1"
    assert r.fields["fuel"]["v"] == "ethane"
    assert r.raw[" XO2 before test"] == "0.3939"
    assert r.fields["o2_pct"]["v"] == pytest.approx(39.39)
    assert r.fields["o2_basis"]["v"] == "chamber initial"
    assert r.raw["approx p (bar)"] == "0.9443956"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(94.43956)
    assert r.fields["pressure_psi"]["v"] == pytest.approx(94.43956 / 6.894757293168361)
    assert r.fields["fuel_conc_pct"]["v"] == pytest.approx(100.0)
    assert r.fields["outcome_label"]["v"] == "SE"
    assert r.fields["gravity_level"]["v"] == "microgravity (ISS)"
    assert r.fields["flow_cm_s"]["v"] is None
    prov = reg.get(r.fields["o2_pct"]["p"])
    assert prov.row == 2 and prov.raw == "0.3939" and "fraction_to_pct" in prov.transforms
    assert "bar_to_kpa" in reg.get(r.fields["pressure_kpa"]["p"]).transforms

    r = _rec(ctx, 32)
    assert r.raw["approx p (bar)"] == "0.50665"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(50.665)
    assert r.fields["fuel"]["v"] == "50% butane"
    assert r.fields["fuel_conc_pct"]["v"] == pytest.approx(25.0)

    r = _rec(ctx, 21)
    assert r.fields["outcome_label"]["v"] == "-"
    assert r.fields["notes"]["v"].startswith("Igniter voltage: 2V and 2.5V")

    r = _rec(ctx, 102)
    assert r.raw["approx p (bar)"] == "3.0399"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(303.99)

    r = _rec(ctx, 14)
    assert r.raw[" XO2 before test"] == "0.1802"
    assert r.fields["o2_pct"]["v"] == pytest.approx(18.02)


def test_normal_zero_fuel_flagged(normal) -> None:
    ctx, flags, _ = normal
    imp = [f for f in flags.items if f.code == "implausible_value"]
    assert sorted(f.rows[0] for f in imp) == [69, 77]
    assert all(f.column == "Xf" and f.raw == "0" for f in imp)
    assert all("'#DIV/0!'" in f.detail for f in imp)
    r = _rec(ctx, 69)
    assert r.fields["fuel_conc_pct"]["v"] == 0.0
    # Preflight F: "#DIV/0!" in Tad and Zst on lines 69 and 77. Those columns are not read; raw kept.
    for line in (69, 77):
        rr = _rec(ctx, line)
        assert rr.raw["Tad (K)"] == "#DIV/0!" and rr.raw["Zst"] == "#DIV/0!"


def test_normal_flag_counts(normal) -> None:
    _, flags, _ = normal
    assert _codes(flags) == {"implausible_value": 2, "missing_column": 5}
    missing = sorted(f.column for f in flags.items if f.code == "missing_column")
    assert missing == ["co2_pct", "flow_cm_s", "he_pct", "n2_pct", "n_flames"]


def test_inverse_values(inverse) -> None:
    ctx, _, _ = inverse
    r = _rec(ctx, 2)
    assert r.raw["XO2"] == "0.21"
    assert r.fields["o2_pct"]["v"] == pytest.approx(21.0)
    assert r.fields["o2_basis"]["v"] == "oxidiser stream (inverse flame)"
    assert r.raw["approx p (bar)"] == "1.10"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(110.0)
    assert r.fields["fuel_conc_pct"]["v"] is None
    assert r.fields["outcome_label"]["v"] == "-"
    assert r.fields["notes"]["v"] == "Failed to ignite"

    r = _rec(ctx, 18)
    assert r.raw["XO2"] == "0.85"
    assert r.fields["o2_pct"]["v"] == pytest.approx(85.0)
    assert r.raw["approx p (bar)"] == "2.2066"
    assert r.fields["pressure_kpa"]["v"] == pytest.approx(220.66)

    r = _rec(ctx, 155)
    assert r.fields["test_label"]["v"] == "21277 P1"
    assert r.fields["fuel"]["v"] == "butane"
    assert r.fields["outcome_label"]["v"] == "FT"

    # Preflight C11: "#VALUE!" in Peak burner temp (K) on lines 96-97, and line 131 blank C with K = 273.15.
    # Those columns are not read, so the raw strings are kept and no value flag is raised.
    assert _rec(ctx, 96).raw["Peak burner temp (K)"] == "#VALUE!"
    assert _rec(ctx, 97).raw["Peak burner temp (K)"] == "#VALUE!"
    assert _rec(ctx, 131).raw["Peak burner Temp (C)"] == ""
    assert _rec(ctx, 131).raw["Peak burner temp (K)"] == "273.15"


def test_inverse_label_case_flags(inverse) -> None:
    _, flags, _ = inverse
    lab = {(f.column, f.raw): f for f in flags.items if f.code == "label_inconsistent"}
    ft = lab[("Flame Type", "inverse; Inverse")]
    assert "'inverse' on 90 rows" in ft.detail and "'Inverse' on 64 rows" in ft.detail
    assert ft.rows == list(range(2, 66))
    yes = lab[("Hot ignition", "Yes; yes")]
    assert len(yes.rows) == 17 and yes.rows[0] == 136
    no = lab[("Hot ignition", "No; no")]
    assert no.rows == [18, 147]
    assert len(lab[("Color", "blue; Blue")].rows) == 12
    assert len(lab[("Color", "yellow; Yellow")].rows) == 4
    assert len(lab) == 5


def test_inverse_flag_counts(inverse) -> None:
    _, flags, _ = inverse
    codes = _codes(flags)
    assert codes["blank_row"] == 1
    assert codes["label_inconsistent"] == 5
    assert "non_numeric" not in codes and "spreadsheet_error" not in codes and "out_of_range" not in codes
    assert set(codes) == {"blank_row", "label_inconsistent", "missing_column"}
    missing = sorted(f.column for f in flags.items if f.code == "missing_column")
    assert missing == ["co2_pct", "flow_cm_s", "fuel_conc_pct", "he_pct", "n2_pct", "n_flames"]


def test_no_invented_values(normal, inverse) -> None:
    for ctx, _, _ in (normal, inverse):
        for r in ctx.records:
            o2 = r.fields["o2_pct"]["v"]
            assert o2 is not None and 0 < o2 < 100
            assert ("o2_basis" in r.fields) == (o2 is not None)
            assert r.fields["pressure_kpa"]["v"] is not None
            assert set(r.raw) == {h for h in ctx.table.header}
