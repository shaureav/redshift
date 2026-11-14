"""BASS-II (PSI-25) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import bass2 as M
from redshift.normalise.base import Ctx
from redshift.paths import PSI_RAW
from redshift.provenance import Registry

C_O2F = "Calibrated final O2 % by vol"


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
    assert (r.records_in, r.tests_out) == (129, 129)
    assert r.blank_excluded == [] and r.duplicates_removed == [] and r.non_test_excluded == []
    assert sorted(recs) == list(range(2, 131))
    assert "strip_bom" in ctx.table.file_transforms


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {
        "non_numeric": 26,
        "missing_column": 7,
        "implausible_value": 6,
        "date_inconsistent": 3,
        "label_inconsistent": 2,
    }


def test_initial_o2_all_numeric(out):
    _, reg, flags, recs = out
    vals = [rec.fields["o2_pct"]["v"] for rec in recs.values()]
    assert all(v is not None for v in vals)
    assert (min(vals), max(vals)) == (13.6, 22.2)
    assert not [f for f in flags.items if f.column == M.C_O2I]
    assert _cell(reg, recs[2], "o2_pct") == (22.2, "22.2")
    assert _cell(reg, recs[62], "o2_pct") == (13.6, "13.6")
    assert _cell(reg, recs[98], "o2_pct") == (20.0, "20")
    assert reg.get(recs[2].fields["o2_pct"]["p"]).column == "Calibrated  initial O2 % by vol "
    assert all(rec.fields["o2_basis"]["v"] == "chamber initial" for rec in recs.values())
    assert all(rec.fields["diluent"]["v"] == "N2" for rec in recs.values())


def test_co2_and_known_values(out):
    _, reg, flags, recs = out
    assert _cell(reg, recs[2], "co2_pct") == (0.44, "0.44")
    assert _cell(reg, recs[34], "co2_pct") == (1.42, "1.42")
    for ln in (98, 129):
        assert _cell(reg, recs[ln], "co2_pct") == (None, "none")
    co2_flags = {f.rows[0] for f in _flags(flags, "non_numeric") if f.column == "Initial CO2 % by vol"}
    assert co2_flags == {98, 129}
    assert _cell(reg, recs[97], "test_label") == ("P22a", "P22a")
    assert _cell(reg, recs[48], "material") == ('1/4" clear rod', '1/4" clear rod')
    assert recs[2].fields["gravity_level"]["v"] == "microgravity (ISS)"


def test_not_recorded(out):
    _, _, flags, recs = out
    for rec in recs.values():
        for f in ("pressure_kpa", "pressure_psi", "flow_cm_s"):
            assert rec.fields[f]["v"] is None
    missing = {f.column: f.detail for f in _flags(flags, "missing_column")}
    assert "display settings" in missing["flow_cm_s"]
    assert "no pressure column" in missing["pressure_kpa"]


def test_final_o2_implausible(out):
    _, _, flags, _ = out
    final = [f for f in _flags(flags, "implausible_value") if f.column == C_O2F]
    got = {(f.rows[0], f.raw) for f in final}
    assert got == {(3, "1.6"), (97, "0.6"), (98, "39.1"), (128, "0.9"), (129, "40.4")}
    assert all("initial CO2 (kept as written)" in f.detail for f in final)
    none_rows = {f.rows[0] for f in _flags(flags, "non_numeric") if f.column == C_O2F}
    assert none_rows == {15, 26}


def test_final_o2_threshold_separates_cleanly():
    """Every unflagged test changes O2 by at most 3.2 points; every flagged one by more than 19."""
    path = PSI_RAW / M.SPEC.tables[0].relpath
    with path.open(newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.reader(fh))
    head = [h.strip() for h in rows[0]]
    changes = {}
    for line, r in enumerate(rows[1:], start=2):
        try:
            changes[line] = abs(float(r[head.index(C_O2F)]) - float(r[head.index(M.C_O2I)]))
        except ValueError:
            pass
    flagged = {3, 97, 98, 128, 129}
    assert max(v for k, v in changes.items() if k not in flagged) <= 3.2 + 1e-9
    assert min(changes[k] for k in flagged) > 19


def test_free_text_in_numeric_columns(out):
    _, _, flags, _ = out
    got = {(f.rows[0], f.column, f.raw) for f in _flags(flags, "non_numeric")}
    for item in [
        (32, "Total Frames Shot", "300+   +102"),
        (72, "Total Frames Shot", "video"),
        (52, "Final CO (ppm)", "OR"),
        (62, "Initial CO (ppm)", "OR"),
        (64, "Final CO (ppm)", "over"),
        (32, "Final CO (ppm)", ">500"),
        (3, "Total Frames Shot", "none"),
    ]:
        assert item in got


def test_dates(out):
    _, _, flags, _ = out
    got = {(f.rows[0], f.column, f.raw) for f in _flags(flags, "date_inconsistent")}
    assert got == {(60, "GMT", "213"), (109, "Date", "6/24/2018"), (118, "Date", "6/24/2018")}


def test_spelling(out):
    _, _, flags, _ = out
    got = {(f.raw, tuple(f.rows)) for f in _flags(flags, "label_inconsistent")}
    assert got == {("blac rod", (88,)), ("2ide", (46,))}


def test_zero_initial_co2_flagged_not_changed(out):
    _, reg, flags, recs = out
    got = [f for f in _flags(flags, "implausible_value") if f.column == "Initial CO2 % by vol"]
    assert [(f.rows, f.raw) for f in got] == [([15], "0")]
    assert "0.19 to 1.85" in got[0].detail
    assert _cell(reg, recs[15], "co2_pct") == (0.0, "0")
    assert _cell(reg, recs[15], "o2_pct") == (15.0, "15")
