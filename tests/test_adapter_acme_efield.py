"""ACME E-FIELD Flames (PSI-22) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import acme_efield as M
from redshift.normalise.base import Ctx
from redshift.paths import PSI_RAW
from redshift.provenance import Registry

CONTINUATION_KEPT = [4, 7, 27, 28]


def _doi(inv: str) -> str:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}[inv]


@pytest.fixture(scope="module")
def out():
    spec = M.SPEC
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
    return ctx, reg, flags, {r.source_row: r for r in ctx.records}


def _flags(flags, code):
    return [f for f in flags.items if f.code == code]


def test_reconciliation(out):
    ctx, _, _, recs = out
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (32, 24)
    assert r.blank_excluded == [] and r.non_test_excluded == []
    assert r.duplicates_removed == [
        {"line": 15, "duplicate_of": 7},
        {"line": 19, "duplicate_of": 7},
        {"line": 25, "duplicate_of": 7},
        {"line": 29, "duplicate_of": 7},
        {"line": 30, "duplicate_of": 26},
        {"line": 31, "duplicate_of": 27},
        {"line": 32, "duplicate_of": 28},
        {"line": 33, "duplicate_of": 7},
    ]
    assert sorted(recs) == [ln for ln in range(2, 34) if ln not in (15, 19, 25, 29, 30, 31, 32, 33)]


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {"exact_duplicate": 8, "missing_column": 7}
    assert sorted(f.rows[0] for f in _flags(flags, "exact_duplicate")) == [15, 19, 25, 29, 30, 31, 32, 33]
    assert {f.column for f in _flags(flags, "missing_column")} == {
        "o2_pct",
        "pressure_kpa",
        "pressure_psi",
        "flow_cm_s",
        "co2_pct",
        "he_pct",
        "n2_pct",
    }


def test_continuation_rows_kept_without_fill_down(out):
    _, reg, _, recs = out
    for ln in CONTINUATION_KEPT:
        rec = recs[ln]
        assert rec.raw[M.C_TYPE] == "" and rec.raw[M.C_DAY] == ""
        for f in ("test_label", "test_date", "fuel", "n_flames"):
            assert rec.fields[f]["v"] is None, (ln, f)
    assert recs[4].fields["fuel_conc_pct"]["v"] == 100.0
    assert recs[7].raw[M.C_CONC] == "100%" and recs[7].fields["fuel_conc_pct"]["v"] == 100.0
    assert recs[27].raw[M.C_CONC] == "50%" and recs[27].fields["fuel_conc_pct"]["v"] == 50.0
    assert recs[28].raw[M.C_CONC] == "80%" and recs[28].fields["fuel_conc_pct"]["v"] == 80.0
    assert reg.get(recs[28].fields["fuel_conc_pct"]["p"]).row == 28
    assert recs[4].fields["notes"]["v"].startswith("Notes: Fuel Conc. (diluted with nitrogen")


def test_known_values(out):
    _, reg, _, recs = out
    assert recs[2].fields["test_label"]["v"] == "18073"
    assert recs[2].fields["test_date"]["v"] == "2018 3 14"
    assert recs[2].fields["fuel"]["v"] == "100% CH4"
    assert recs[3].raw[M.C_CONC] == "70%" and recs[3].fields["fuel_conc_pct"]["v"] == 70.0
    assert recs[26].raw[M.C_CONC] == "25%" and recs[26].fields["fuel_conc_pct"]["v"] == 25.0
    assert recs[12].raw[M.C_FLAMES] == "15" and recs[12].fields["n_flames"]["v"] == 15.0
    assert reg.get(recs[12].fields["n_flames"]["p"]).row == 12
    assert sum(r.fields["n_flames"]["v"] or 0 for r in recs.values()) == 219
    assert recs[9].fields["notes"]["v"] == (
        "Test type: First round of tests with coflow burner; Mesh polarity: positive"
    )
    assert all(r.fields["o2_pct"]["v"] is None and "o2_basis" not in r.fields for r in recs.values())
    assert all(r.fields["pressure_kpa"]["v"] is None for r in recs.values())
