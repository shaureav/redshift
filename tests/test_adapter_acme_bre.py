"""ACME BRE (PSI-20) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import acme_bre as M
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


def test_reconciliation(out):
    ctx, _, _, recs = out
    r = ctx.recon
    assert r.balanced()
    assert (r.records_in, r.tests_out) == (18, 18)
    assert r.blank_excluded == [] and r.duplicates_removed == [] and r.non_test_excluded == []
    assert sorted(recs) == list(range(2, 20))
    assert all(rec.fuel_class == "emulator" and rec.test_kind == "flame" for rec in recs.values())


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {
        "non_numeric": 16,
        "out_of_range": 2,
        "date_inconsistent": 1,
        "label_inconsistent": 1,
        "missing_column": 7,
    }
    assert {f.column for f in _flags(flags, "missing_column")} == {
        "pressure_kpa",
        "pressure_psi",
        "fuel_conc_pct",
        "flow_cm_s",
        "co2_pct",
        "he_pct",
        "n2_pct",
    }


@pytest.mark.parametrize("line,raw", [(6, "3400%"), (9, "2100%")])
def test_percent_format_errors_are_out_of_range_and_null(out, line, raw):
    _, reg, flags, recs = out
    rec = recs[line]
    assert rec.raw[M.C_O2] == raw
    assert rec.fields["o2_pct"]["v"] is None
    assert reg.get(rec.fields["o2_pct"]["p"]).raw == raw
    hits = [f for f in _flags(flags, "out_of_range") if f.rows == [line]]
    assert len(hits) == 1 and hits[0].column == M.C_O2 and hits[0].raw == raw


def test_no_o2_value_is_invented(out):
    _, _, _, recs = out
    # Every O2 cell is a list or a percent-format error: nothing becomes a number, never 34 or 21.
    assert all(rec.fields["o2_pct"]["v"] is None for rec in recs.values())


def test_o2_lists_are_non_numeric(out):
    _, _, flags, recs = out
    nn = _flags(flags, "non_numeric")
    assert sorted(f.rows[0] for f in nn) == [ln for ln in range(2, 20) if ln not in (6, 9)]
    line2 = next(f for f in nn if f.rows == [2])
    assert line2.raw == "21; 26.5; 40" and line2.column == M.C_O2
    assert recs[4].raw[M.C_O2] == "21; 26.5; 34; 40"


def test_o2_basis_ambient_on_every_row(out):
    _, _, _, recs = out
    assert all(rec.fields["o2_basis"]["v"] == "ambient" for rec in recs.values())


def test_pressure_missing_quotes_table_note(out):
    ctx, reg, _, recs = out
    quote = "The chamber pressures were also varied but are not identified in this summary table."
    assert quote in ctx.raw(next(r for r in ctx.table.rows if r.line == 2), M.C_NOTES)
    for f in ("pressure_kpa", "pressure_psi"):
        v = recs[2].fields[f]
        assert v["v"] is None
        assert quote in reg.get(v["p"]).note


def test_known_values(out):
    _, reg, _, recs = out
    assert recs[2].fields["test_label"]["v"] == "Session 2019 Feb 8"
    assert recs[2].fields["test_date"]["v"] == "2019 Feb 8"
    assert recs[13].fields["n_flames"]["v"] == 21.0 and recs[13].raw[M.C_FLAMES] == "21"
    assert recs[9].fields["n_flames"]["v"] == 0.0 and recs[9].raw[M.C_FLAMES] == "0"
    assert reg.get(recs[13].fields["n_flames"]["p"]).row == 13
    assert sum(r.fields["n_flames"]["v"] for r in recs.values()) == 194
    assert recs[8].fields["fuel"]["v"] == "100%C2H4"
    assert recs[13].fields["fuel"]["v"] == "100% CH4"
    assert recs[11].fields["notes"]["v"] == "Burner size (mm): 50"
    assert recs[2].fields["diluent"]["v"] == "N2"
    assert recs[2].fields["gravity_level"]["v"] == "microgravity (ISS)"


def test_date_order_and_spelling_flags(out):
    _, _, flags, _ = out
    (d,) = _flags(flags, "date_inconsistent")
    assert d.rows == [13, 14]
    (s,) = _flags(flags, "label_inconsistent")
    assert s.rows == [8, 9, 10] and s.raw == "100%C2H4" and s.column == M.C_FUEL
    assert _flags(flags, "fill_down_error") == []


def test_o2_basis_note_quotes_its_sources(out):
    ctx, reg, _, recs = out
    note = reg.get(recs[2].fields["o2_basis"]["p"]).note
    page = (PSI_RAW / "ACME-BRE" / "ACME-BRE.md").read_text(encoding="utf-8")
    line2 = ctx.raw(next(r for r in ctx.table.rows if r.line == 2), M.C_NOTES)
    diluted = "as diluted with nitrogen on a volume basis"
    assert diluted in note and diluted in line2
    for quote in ("O2/N2 ambients", "a quiescent microgravity ambient", "the chamber contents"):
        assert quote in note and quote in page
