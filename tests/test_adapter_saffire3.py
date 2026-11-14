"""SAFFIRE-III (PSI-100) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import saffire3 as M
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


def _cell(reg, rec, field):
    v = rec.fields[field]
    return v["v"], reg.get(v["p"]).raw


def test_reconciliation(out):
    ctx, _, _, recs = out
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (2, 2)
    assert r.blank_excluded == [] and r.duplicates_removed == [] and r.non_test_excluded == []
    assert sorted(recs) == [2, 3]


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {"missing_column": 8}


def test_known_values(out):
    _, reg, flags, recs = out
    assert _cell(reg, recs[2], "test_label") == ("S1", "S1")
    assert _cell(reg, recs[3], "material") == ("SIBAL Fabric", "SIBAL Fabric")
    assert _cell(reg, recs[2], "notes") == ("Concurrent", "Concurrent ")
    assert _cell(reg, recs[3], "flow_cm_s") == (30.0, "30 cm/s")  # strip_stated_unit
    assert not _flags(flags, "non_numeric")
    # Length and width agree with the SAFFIRE-I page; no flag is raised here.
    assert recs[2].raw["Sample Length"] == "94 cm" and recs[2].raw["Sample Width"] == "40.6 cm"
    assert recs[2].fields["gravity_level"]["v"] == "microgravity (Cygnus)"


def test_no_o2_or_pressure(out):
    _, _, flags, recs = out
    for rec in recs.values():
        for f in ("o2_pct", "pressure_kpa", "pressure_psi"):
            assert rec.fields[f]["v"] is None
        assert "o2_basis" not in rec.fields
    missing = {f.column for f in _flags(flags, "missing_column")}
    assert {"o2_pct", "pressure_kpa", "pressure_psi"} <= missing
