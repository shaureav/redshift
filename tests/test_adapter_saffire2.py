"""SAFFIRE-II (PSI-99) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import saffire2 as M
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
    assert (r.records_in, r.tests_out) == (15, 9)
    assert r.blank_excluded == [] and r.duplicates_removed == []
    excl = {x["line"]: x["reason"] for x in r.non_test_excluded}
    assert sorted(excl) == [11, 12, 13, 14, 15, 16]
    assert all("flow-visualisation" in excl[ln] for ln in (11, 12))
    assert all("footnote" in excl[ln] for ln in (13, 14, 15, 16))
    assert sorted(recs) == list(range(2, 11))


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {
        "non_numeric": 12,
        "missing_column": 9,
        "label_inconsistent": 6,
        "non_test_row": 6,
    }


def test_known_values(out):
    _, reg, _, recs = out
    assert _cell(reg, recs[2], "test_label") == ("2-1", "2-1")
    assert _cell(reg, recs[6], "material") == ("Cotton-Fiberglass (SIBAL)", "Cotton-Fiberglass (SIBAL)")
    assert _cell(reg, recs[5], "notes") == ("Opposed", "Opposed")
    assert recs[2].fields["gravity_level"]["v"] == "microgravity (Cygnus)"


def test_o2_and_flow_text_not_parsed(out):
    _, reg, flags, recs = out
    assert _cell(reg, recs[2], "o2_pct") == (None, "~ 21.5")
    assert _cell(reg, recs[9], "o2_pct") == (None, "22.1 to 22.0")
    assert _cell(reg, recs[10], "o2_pct") == (None, "22.0 to 21.9")
    assert _cell(reg, recs[2], "flow_cm_s") == (20.0, "20 cm/s")  # strip_stated_unit
    nn = _flags(flags, "non_numeric")
    assert sorted(f.rows[0] for f in nn if f.column == "Percent O2 (Note 1)") == list(range(2, 11))
    assert not [f for f in nn if f.column == "Air Flow (cm/s)"]  # read via strip_stated_unit
    assert all(rec.fields["o2_basis"]["v"] == "ambient" for rec in recs.values())


def test_thickness_037(out):
    _, _, flags, _ = out
    got = {(f.rows[0], f.raw) for f in _flags(flags, "non_numeric") if f.column == "Samle Thickness"}
    assert got == {(5, "037 mm"), (6, "037 mm"), (7, "037 mm")}
    # The flag says the value cannot be read; it does not propose a corrected number.
    assert not any("0.37" in f.detail for f in _flags(flags, "non_numeric") if f.column == "Samle Thickness")


def test_blank_material(out):
    _, reg, flags, recs = out
    for ln in (7, 10):
        assert _cell(reg, recs[ln], "material") == (None, "")
    got = [f for f in _flags(flags, "missing_column") if f.column == "Material"]
    assert sorted(f.rows[0] for f in got) == [7, 10]
    assert all(f.detail == "Material cell is blank on this test row" for f in got)
    assert all(f.action == "Value is null ('not recorded')." for f in got)


def test_camera_names_and_headers(out):
    _, _, flags, _ = out
    li = _flags(flags, "label_inconsistent")
    rows = {(f.rows[0], f.column, f.raw) for f in li if f.rows}
    assert rows == {(4, "Camera 1", ""), (5, "Camera 2", "S4C1"), (7, "Camera 2", "S56C2")}
    headers = {f.column for f in li if not f.rows}
    assert headers == {"Samle Thickness", "?-g Burn Length", "?-g Spread Length"}
