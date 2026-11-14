"""ACME CLD Flame (PSI-21) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import acme_cld as M
from redshift.normalise.base import Ctx
from redshift.paths import PSI_RAW
from redshift.provenance import Registry

FILL_DOWN_LINES = [*range(3, 13), 14, 15, *range(17, 24), *range(25, 30), 31, 33]
CLEAN_LINES = [2, 13, 16, 24, 30, 32]


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
    assert (r.records_in, r.tests_out) == (32, 32)
    assert r.blank_excluded == [] and r.duplicates_removed == [] and r.non_test_excluded == []
    assert sorted(recs) == list(range(2, 34))


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {
        "fill_down_error": 26, "non_numeric": 26, "missing_column": 7}
    assert {f.column for f in _flags(flags, "missing_column")} == {
        "o2_pct", "pressure_kpa", "pressure_psi", "flow_cm_s", "co2_pct", "he_pct", "n2_pct"}


def test_fill_down_flagged_once_per_cell_and_kept_verbatim(out):
    _, _, flags, recs = out
    fd = _flags(flags, "fill_down_error")
    assert [f.rows for f in fd] == [[ln] for ln in FILL_DOWN_LINES]
    assert all(f.column == M.C_FUEL and f.raw == recs[f.rows[0]].raw[M.C_FUEL] for f in fd)
    assert sorted(set(range(2, 34)) - set(FILL_DOWN_LINES)) == CLEAN_LINES
    # Labels are never corrected.
    assert recs[3].fields["fuel"]["v"] == "40% CH5"
    assert recs[12].fields["fuel"]["v"] == "40% CH14"
    assert recs[14].fields["fuel"]["v"] == "100% CH5"
    assert recs[17].fields["fuel"]["v"] == "100% C2H5"
    assert recs[23].fields["fuel"]["v"] == "100% C2H11"
    assert recs[31].fields["fuel"]["v"] == "30% C2H5"
    assert recs[33].fields["fuel"]["v"] == "40% CH5"
    # C2H6 is a real formula but sits inside the ethylene series.
    line18 = next(f for f in fd if f.rows == [18])
    assert line18.raw == "100% C2H6" and "real formula" in line18.detail


def test_fuel_concentration(out):
    _, reg, flags, recs = out
    assert recs[4].raw[M.C_CONC] == "40%" and recs[4].fields["fuel_conc_pct"]["v"] == 40.0
    assert reg.get(recs[4].fields["fuel_conc_pct"]["p"]).transforms == ["strip_percent_sign", "parse_number"]
    assert recs[23].raw[M.C_CONC] == "80%" and recs[23].fields["fuel_conc_pct"]["v"] == 80.0
    assert recs[2].raw[M.C_CONC] == "30%-40%" and recs[2].fields["fuel_conc_pct"]["v"] is None
    assert recs[30].raw[M.C_CONC] == "0%-30%" and recs[30].fields["fuel_conc_pct"]["v"] is None
    nn = _flags(flags, "non_numeric")
    assert all(f.column == M.C_CONC and "-" in f.raw for f in nn)
    singles = [ln for ln, r in recs.items() if r.fields["fuel_conc_pct"]["v"] is not None]
    assert singles == [4, 17, 22, 23, 24, 25]
    assert sorted(f.rows[0] for f in nn) == [ln for ln in range(2, 34) if ln not in singles]


def test_known_values(out):
    _, _, _, recs = out
    assert recs[2].fields["test_label"]["v"] == "17319"
    assert recs[2].fields["test_date"]["v"] == "17319"
    assert recs[11].fields["n_flames"]["v"] == 16.0 and recs[11].raw[M.C_FLAMES] == "16"
    assert sum(r.fields["n_flames"]["v"] for r in recs.values()) == 344
    assert recs[30].fields["notes"]["v"] == "Test type: Improved coflow tests"
    assert all(r.fields["o2_pct"]["v"] is None for r in recs.values())
    assert all("o2_basis" not in r.fields for r in recs.values())
    assert all(r.fields["pressure_kpa"]["v"] is None for r in recs.values())
