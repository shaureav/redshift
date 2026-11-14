"""BASS (PSI-26) adapter, run on its own against the raw PSI table."""

from __future__ import annotations

import csv
from collections import Counter

import pytest

from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise import bass as M
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
    assert (r.records_in, r.tests_out) == (122, 121)
    assert r.blank_excluded == [] and r.duplicates_removed == []
    assert [x["line"] for x in r.non_test_excluded] == [67]
    assert "SOOT Cleaning" in r.non_test_excluded[0]["reason"]
    assert sorted(recs) == [ln for ln in range(2, 124) if ln != 67]
    assert all(rec.fuel_class == "solid" and rec.test_kind == "burn" for rec in recs.values())


def test_flag_counts(out):
    _, _, flags, _ = out
    assert Counter(f.code for f in flags.items) == {
        "date_inconsistent": 9,
        "near_duplicate": 9,
        "missing_column": 9,
        "label_inconsistent": 2,
        "non_test_row": 1,
    }


def test_known_values(out):
    _, reg, _, recs = out
    assert _cell(reg, recs[2], "test_label") == ("1", "1")
    assert _cell(reg, recs[2], "material") == ("SIBAL 2 cm", "SIBAL 2 cm")
    assert _cell(reg, recs[26], "test_label") == ("12-R2", "12-R2")
    # Trailing whitespace is trimmed; inner text is kept verbatim.
    assert _cell(reg, recs[46], "material") == ("SIBAL 2 cm   opposed flow", "SIBAL 2 cm   opposed flow ")
    assert _cell(reg, recs[44], "test_date") == ("6/29/`12", "6/29/`12")
    assert _cell(reg, recs[111], "test_date") == ("5/15/2103", "5/15/2103")
    assert recs[2].fields["gravity_level"]["v"] == "microgravity (ISS)"


def test_conditions_not_recorded(out):
    _, _, flags, recs = out
    for rec in recs.values():
        for f in ("o2_pct", "pressure_kpa", "pressure_psi", "flow_cm_s", "co2_pct"):
            assert rec.fields[f]["v"] is None
        assert "o2_basis" not in rec.fields
    missing = {f.column: f.detail for f in _flags(flags, "missing_column")}
    assert set(missing) >= {"o2_pct", "pressure_kpa", "pressure_psi", "flow_cm_s"}
    assert "no pressure column" in missing["pressure_kpa"]


def test_dates(out):
    _, _, flags, _ = out
    got = {(f.rows[0], f.column, f.raw) for f in _flags(flags, "date_inconsistent")}
    assert got == {
        (44, "Date", "6/29/`12"),
        (111, "Date", "5/15/2103"),
        (100, "GMT", "113"),
        (118, "GMT", "137"),
        *((ln, "GMT", "150") for ln in range(119, 124)),
    }


def test_repeated_numbers(out):
    _, _, flags, _ = out
    got = {(f.column, f.raw, tuple(f.rows)) for f in _flags(flags, "near_duplicate")}
    assert got == {
        ("As Run Test #", "24", (25, 26)),
        ("As Run Test #", "85", (88, 89)),
        ("As Run Test #", "89", (93, 96)),
        ("As Run Test #", "90", (94, 97)),
        ("As Run Test #", "91", (95, 98)),
        ("Test #", "114", (61, 85)),
        ("Test #", "118", (66, 105)),
        ("Test #", "75", (82, 121)),
        ("Test #", "53", (114, 122)),
    }


def test_spelling(out):
    _, _, flags, _ = out
    got = {(f.raw, tuple(f.rows)) for f in _flags(flags, "label_inconsistent")}
    assert got == {("parrafin", (82, 107)), ("oppsed", (104,))}


def test_flags_attached_to_records(out):
    _, _, flags, recs = out
    assert any(flags.items[i].code == "date_inconsistent" for i in recs[111].flag_refs)
    assert any(flags.items[i].code == "near_duplicate" for i in recs[96].flag_refs)
