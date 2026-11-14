"""SAFFIRE-I (PSI-98) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import saffire1 as M
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


def _cell(reg, rec, field):
    v = rec.fields[field]
    return v["v"], reg.get(v["p"]).raw


def test_reconciliation(out):
    ctx, _, _, recs = out
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (4, 2)
    assert r.blank_excluded == [] and r.duplicates_removed == []
    assert [x["line"] for x in r.non_test_excluded] == [4, 5]
    assert all("flow-visualisation" in x["reason"] for x in r.non_test_excluded)
    assert sorted(recs) == [2, 3]


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {
        "missing_column": 7, "swapped_columns": 2, "unit_unclear": 2, "non_numeric": 2, "non_test_row": 2,
    }


def test_known_values(out):
    _, reg, _, recs = out
    assert _cell(reg, recs[2], "test_label") == ("S1", "S1")
    assert _cell(reg, recs[3], "material") == ("SIBAL Fabric", "SIBAL Fabric")
    assert _cell(reg, recs[2], "flow_cm_s") == (20.0, "20")
    assert _cell(reg, recs[3], "notes") == ("Opposed", "Opposed")
    assert recs[2].fields["gravity_level"]["v"] == "microgravity (Cygnus)"
    for ln in (2, 3):
        assert recs[ln].fields["pressure_kpa"]["v"] is None
        assert recs[ln].fields["pressure_psi"]["v"] is None


def test_o2_text_is_not_parsed(out):
    _, reg, flags, recs = out
    assert _cell(reg, recs[2], "o2_pct") == (None, "21.5 - 21.7")
    assert _cell(reg, recs[3], "o2_pct") == (None, "~ 21.5")
    got = {(f.rows[0], f.column, f.raw) for f in _flags(flags, "non_numeric")}
    assert got == {(2, "Percent O2", "21.5 - 21.7"), (3, "Percent O2", "~ 21.5")}
    assert all(recs[ln].fields["o2_basis"]["v"] == "ambient" for ln in (2, 3))


def test_length_width_swap_flagged_not_fixed(out):
    _, _, flags, recs = out
    sw = _flags(flags, "swapped_columns")
    assert sorted(f.rows[0] for f in sw) == [2, 3]
    assert all(f.raw == "40.6,94" and f.column == "Sample Length (cm)" for f in sw)
    assert all("0.94 meters long" in f.detail and "SAFFIRE-III" in f.detail for f in sw)
    assert recs[2].raw["Sample Length (cm)"] == "40.6" and recs[2].raw["Sample Width (cm)"] == "94"


def test_thickness_unit_unclear(out):
    _, _, flags, _ = out
    got = {(f.rows[0], f.column, f.raw) for f in _flags(flags, "unit_unclear")}
    assert got == {(2, "Sample Thickness (cm)", "0.37"), (3, "Sample Thickness (cm)", "0.37")}
    assert all("'.33 cm'" in f.detail and "'037 mm'" in f.detail for f in _flags(flags, "unit_unclear"))
