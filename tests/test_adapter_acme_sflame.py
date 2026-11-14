"""ACME s-Flame (PSI-23) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import acme_sflame as M
from redshift.normalise.base import Ctx
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


def _doi(inv: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[inv]


@pytest.fixture(scope="module")
def out():
    spec = M.SPEC
    t = spec.tables[0]
    reg, flags = Registry(), FlagLog()
    ctx = Ctx(read_table(spec.investigation_id, t.table_key, t.relpath), reg, flags,
              doi=_doi(spec.investigation_id), fuel_class=spec.fuel_class, test_kind=spec.test_kind)
    spec.adapt(ctx)
    ctx.finish()
    return ctx, reg, flags, {r.source_row: r for r in ctx.records}


def _flags(flags, code):
    return [f for f in flags.items if f.code == code]


def test_reconciliation(out):
    ctx, _, _, recs = out
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (18, 18)
    assert r.blank_excluded == [] and r.duplicates_removed == [] and r.non_test_excluded == []
    assert sorted(recs) == list(range(2, 20))


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {
        "non_numeric": 18, "fill_down_error": 8, "implausible_value": 1, "metadata_inconsistent": 1,
        "missing_column": 7,
    }
    assert {f.column for f in _flags(flags, "missing_column")} == {
        "pressure_kpa", "pressure_psi", "fuel_conc_pct", "flow_cm_s", "co2_pct", "he_pct", "n2_pct"}


def test_fill_down_cells(out):
    _, _, flags, recs = out
    got = sorted((f.rows[0], f.column, f.raw) for f in _flags(flags, "fill_down_error"))
    assert got == [
        (3, M.C_ATM, "~21% O2 with N3"), (3, M.C_FUEL, "50% C2H4 with N3"), (4, M.C_ATM, "~21% O2 with N4"),
        (5, M.C_FUEL, "45% CH4 with N3"), (7, M.C_ATM, "~21% O2 with N3"), (8, M.C_ATM, "~21% O2 with N4"),
        (9, M.C_ATM, "~21% O2 with N5"), (10, M.C_ATM, "~21% O2 with N6"),
    ]
    assert recs[3].fields["fuel"]["v"] == "50% C2H4 with N3"
    assert recs[5].fields["fuel"]["v"] == "45% CH4 with N3"


def test_atmosphere_is_free_text_not_parsed(out):
    _, reg, flags, recs = out
    nn = _flags(flags, "non_numeric")
    assert sorted(f.rows[0] for f in nn) == list(range(2, 20))
    assert all(f.column == M.C_ATM for f in nn)
    for rec in recs.values():
        assert rec.fields["o2_pct"]["v"] is None
        assert rec.fields["o2_basis"]["v"] == "ambient"
    assert recs[3].raw[M.C_ATM] == "~21% O2 with N3"
    assert reg.get(recs[3].fields["o2_pct"]["p"]).raw == "~21% O2 with N3"
    assert "Atmosphere: ~21% O2 with N3" in recs[3].fields["notes"]["v"]
    assert recs[14].raw[M.C_ATM] == "~30% and ~21% O2 with He"
    assert "Atmosphere: ~30% and ~21% O2 with He" in recs[14].fields["notes"]["v"]


def test_pressure_missing_quotes_table_note(out):
    ctx, reg, _, recs = out
    quote = "*Atmosphere is ~1 atm but pressure increases and O2% drops with vitiation."
    assert ctx.raw(next(r for r in ctx.table.rows if r.line == 3), M.C_NOTES).strip() == quote
    for f in ("pressure_kpa", "pressure_psi"):
        assert recs[3].fields[f]["v"] is None
        assert quote in reg.get(recs[3].fields[f]["p"]).note


def test_known_values(out):
    _, reg, flags, recs = out
    assert recs[2].fields["test_label"]["v"] == "19254"
    assert recs[2].fields["test_date"]["v"] == "2019 Sept. 11"
    assert recs[11].fields["fuel"]["v"] == "25% H2, 20% CH4, with He"
    assert recs[18].raw[M.C_FLAMES] == "23" and recs[18].fields["n_flames"]["v"] == 23.0
    assert reg.get(recs[18].fields["n_flames"]["p"]).row == 18
    assert sum(r.fields["n_flames"]["v"] for r in recs.values()) == 276
    (iv,) = _flags(flags, "implausible_value")
    assert iv.rows == [11] and iv.column == M.C_TYPE
    (md,) = _flags(flags, "metadata_inconsistent")
    assert md.rows == list(range(6, 20))
    assert _flags(flags, "date_inconsistent") == []


def test_page_end_date_matches_psi_page():
    page = (PSI_RAW / "ACME-s-Flame" / "ACME-s-Flame.md").read_text(encoding="utf-8").splitlines()
    assert page[15] == "| Investigation dates | 02-05-2015 to 11-24-2019 |"
    assert M.PAGE_END.isoformat() == "2019-11-24"
