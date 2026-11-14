"""Investigation records (investigations.json) and the coverage matrix, checked against the raw files."""

from __future__ import annotations

import csv
import json
from collections import Counter
from typing import Any

import pytest

from redshift import investigations as I
from redshift.export.lint import lint
from redshift.flags import FlagLog
from redshift.normalise.run import discover
from redshift.normalise.run import run as normalise
from redshift.paths import PSI_RAW, RAW, ROOT
from redshift.provenance import Registry

GROUND = {"PSI-60", "PSI-62", "PSI-115", "PSI-117", "PSI-142"}


def _index() -> dict[str, dict[str, str]]:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r for r in csv.DictReader(fh)}


@pytest.fixture(scope="module")
def built():
    reg, flags = Registry(), FlagLog()
    invs = I.build(reg, flags)
    return invs, reg, flags, {i["id"]: i for i in invs}


def _value_dicts(node: Any, path: str = "$"):
    if isinstance(node, dict):
        if "p" in node and "v" in node:
            yield path, node
        for k, v in node.items():
            yield from _value_dicts(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _value_dicts(v, f"{path}[{i}]")


def _md_line(folder: str, n: int) -> str:
    return (PSI_RAW / folder / f"{folder}.md").read_text(encoding="utf-8").splitlines()[n - 1]


# ---------- counts and identity ----------


def test_counts(built):
    invs, _, _, by_id = built
    assert len(invs) == 24
    assert sum(i["in_harvest"] for i in invs) == 19
    assert {i["id"] for i in invs if not i["in_harvest"]} == GROUND
    assert set(by_id) - GROUND == set(_index())
    assert [i["id"] for i in invs] == sorted(by_id, key=lambda a: int(a.split("-")[1]))
    search = json.loads((RAW / "psi_search_combustion.json").read_text(encoding="utf-8"))["investigations"]
    assert set(by_id) == {r["Accession"] for r in search}


def test_dois_match_index(built):
    _, reg, _, by_id = built
    for inv, row in _index().items():
        assert by_id[inv]["doi"]["v"] == row["doi"], inv
        prov = reg.get(by_id[inv]["doi"]["p"])
        assert prov.source_type == "psi_page" and prov.row == 7
        assert prov.file == f"data/raw/psi/{row['folder'].rstrip('/')}/{row['folder'].rstrip('/')}.md"
    for inv in GROUND:
        assert by_id[inv]["doi"]["v"] is None


def test_titles_and_acronyms_match_index(built):
    _, _, _, by_id = built
    for inv, row in _index().items():
        assert by_id[inv]["title"]["v"] == row["title"], inv
        assert by_id[inv]["acronym"]["v"] == row["acronym"], inv
        assert by_id[inv]["folder"]["v"] == row["folder"].rstrip("/")


# ---------- provenance ----------


def test_every_value_has_registered_provenance(built):
    invs, reg, _, _ = built
    n = 0
    for path, vd in _value_dicts(invs):
        assert vd["p"] in reg, path
        n += 1
    assert n > 2000
    checked, failures = lint({"investigations": invs}, set(reg.to_json()))
    assert failures == [] and checked > 0


def test_text_fields_are_value_dicts(built):
    invs, _, _, _ = built
    for i in invs:
        for k, v in i.items():
            if k == "id":
                assert isinstance(v, str)
            else:
                assert not isinstance(v, str | int | float) or isinstance(v, bool), (i["id"], k)


def test_page_provenance_points_at_exact_lines(built):
    _, reg, _, by_id = built
    r = by_id["PSI-98"]
    for key, line in (
        ("version", 5),
        ("acronym", 6),
        ("licence", 19),
        ("start_date", 16),
        ("end_date", 16),
        ("flight_platform", 12),
        ("hardware", 15),
        ("proposal_title", 11),
        ("title", 1),
    ):
        prov = reg.get(r[key]["p"])
        assert prov.row == line, key
        assert prov.file == "data/raw/psi/SAFFIRE-I/SAFFIRE-I.md"
        assert prov.quote == _md_line("SAFFIRE-I", line)
    obj = reg.get(r["objectives"]["p"])
    assert obj.row == 24 and "lines 24 to 26" in (obj.note or "")
    assert r["objectives"]["v"].startswith("The objectives of this investigation were to:\n(1) determine")
    assert r["objectives"]["v"].endswith("gravity material flammability screening test.")
    assert r["impacts"]["v"].startswith("The Saffire-I experiment provides a new way")
    assert reg.get(r["impacts"]["p"]).row == 38


def test_known_values(built):
    _, _, _, by_id = built
    r = by_id["PSI-98"]
    assert r["version"]["v"] == "4"
    assert (r["start_date"]["v"], r["end_date"]["v"]) == ("03-02-2001", "02-28-2008")
    assert r["licence"]["v"] == "Creative Commons Zero v1.0 Universal"
    assert r["flight_platform"]["v"] == "International Space Station (ISS)"
    assert r["sub_research_area"]["v"] == "Spacecraft Fire, Smoke Distribution"
    assert r["psi_url"]["v"] == "https://psi.nasa.gov/physci/repo/data/investigations/PSI-98"
    assert [c["v"] for c in r["contacts"]] == [_md_line("SAFFIRE-I", 42)[2:]]
    # "?" and blank dates become null; the raw row is kept in provenance.
    assert (by_id["PSI-100"]["start_date"]["v"], by_id["PSI-100"]["end_date"]["v"]) == ("04-18-2017", None)
    for inv in ("PSI-159", "PSI-106", "PSI-107"):
        assert (by_id[inv]["start_date"]["v"], by_id[inv]["end_date"]["v"]) == (None, None)
    assert by_id["PSI-106"]["sub_research_area"]["v"] is None
    assert by_id["PSI-106"]["hardware"]["v"] is None
    assert by_id["PSI-22"]["version"]["v"] == "7"
    assert by_id["PSI-159"]["version"]["v"] == "1"


def test_flame_design_licence_not_shown(built):
    _, reg, _, by_id = built
    lic = by_id["PSI-10"]["licence"]
    assert lic["v"] == "not shown"
    prov = reg.get(lic["p"])
    assert prov.row == 19 and prov.raw == "\u2014"
    others = [i for i in _index() if i != "PSI-10"]
    assert {by_id[i]["licence"]["v"] for i in others} == {"Creative Commons Zero v1.0 Universal"}


# ---------- publications, data files and tables ----------


def test_publications(built):
    _, reg, _, by_id = built
    idx = _index()
    for inv, row in idx.items():
        r = by_id[inv]
        assert r["publication_count"]["v"] == len(r["publications"])
        dups = len(r["publication_duplicates_removed"])
        assert r["publication_count"]["v"] + dups == int(row["publications"])
        prov = reg.get(r["publication_count"]["p"])
        assert prov.source_type == "derived" and prov.method == "count of rows in publications.csv"
        assert prov.inputs == []
    cld = by_id["PSI-21"]
    assert cld["publication_duplicates_removed"] == [{"line": 9, "duplicate_of": 4}]
    assert cld["publication_count"]["v"] == 17
    s1 = by_id["PSI-98"]["publications"]
    assert len(s1) == 6
    assert s1[2]["line"] == 4 and s1[2]["doi"]["v"] == "10.1016/j.combustflame.2018.10.012"
    assert s1[2]["title"]["v"] == "Flame spread: Effects of microgravity and scale"
    assert s1[0]["doi"]["v"] is None
    prov = reg.get(s1[2]["doi"]["p"])
    assert (prov.file, prov.row, prov.column) == ("data/raw/psi/SAFFIRE-I/publications.csv", 4, "doi")


def test_data_files_and_tables(built):
    _, _, _, by_id = built
    specs = {s.investigation_id: s for s in discover()}
    for inv, row in _index().items():
        r = by_id[inv]
        df = r["data_files"]
        assert df["total_size"]["v"] == row["total_data_size"]
        assert df["file_count"]["v"] == int(row["data_file_count"])
        assert sum(f["files"]["v"] for f in df["folders"]) == df["file_count"]["v"], inv
        folder = row["folder"].rstrip("/")
        on_disk = sorted(f"experiment_table/{p.name}" for p in (PSI_RAW / folder / "experiment_table").iterdir())
        assert sorted(t["v"] for t in r["table_files"]) == on_disk
        assert r["table_file_count"]["v"] == int(row["experiment_table_files"]) == len(on_disk)
        assert r["has_table"] is True
        assert r["fuel_class"]["v"] == specs[inv].fuel_class
    assert {by_id["PSI-20"]["fuel_class"]["v"], by_id["PSI-47"]["fuel_class"]["v"]} == {"emulator", "none"}


def test_ground_investigations(built):
    _, reg, _, by_id = built
    lines = (RAW / "psi_search_combustion.json").read_text(encoding="utf-8").splitlines()
    for inv in GROUND:
        r = by_id[inv]
        assert r["fuel_class"]["v"] == "model" and r["has_table"] is False
        assert r["project_type"]["v"] == "Ground Investigation"
        assert r["licence"]["v"] is None and r["version"]["v"] is None
        assert r["publications"] == [] and r["publication_count"]["v"] is None
        prov = reg.get(r["title"]["p"])
        assert (prov.source_type, prov.file, prov.note) == (
            "psi_page",
            "data/raw/psi_search_combustion.json",
            "PSI search record",
        )
        assert lines[prov.row - 1].strip().startswith('"Title": ')
        assert json.loads("{" + lines[prov.row - 1].strip().rstrip(",") + "}")["Title"] == r["title"]["v"]
        assert reg.get(r["psi_url"]["p"]).source_type == "derived"
    g60 = by_id["PSI-60"]
    assert (g60["start_date"]["v"], g60["end_date"]["v"]) == ("06-05-2019", "08-29-2022")
    assert by_id["PSI-142"]["flight_platform"]["v"] == "Not Applicable"
    assert by_id["PSI-142"]["hardware"]["v"] == "Principal Investigator Laboratory Hardware"
    hw = reg.get(by_id["PSI-142"]["hardware"]["p"])
    assert hw.column == "Experiment Hardware.Name" and lines[hw.row - 1].strip().startswith('"Name": ')
    assert by_id["PSI-60"]["flight_platform"]["v"] is None and by_id["PSI-60"]["acronym"]["v"] is None


# ---------- metadata flags ----------


def _flags(flags: FlagLog, inv: str, code: str):
    return [f for f in flags.items if f.investigation_id == inv and f.code == code]


def test_flag_counts(built):
    _, _, flags, _ = built
    assert Counter((f.investigation_id, f.code) for f in flags.items) == {
        ("PSI-98", "metadata_inconsistent"): 3,
        ("PSI-100", "metadata_inconsistent"): 1,
        ("PSI-39", "metadata_inconsistent"): 1,
        ("PSI-10", "no_licence"): 1,
    }


def test_saffire1_flags(built):
    _, _, flags, _ = built
    fs = {f.column: f for f in _flags(flags, "PSI-98", "metadata_inconsistent")}
    assert set(fs) == {"Investigation dates", "Proposal title", "Flight platform"}
    for f in fs.values():
        assert f.file == "data/raw/psi/SAFFIRE-I/SAFFIRE-I.md"
    dates = fs["Investigation dates"]
    assert dates.rows == [16] and dates.raw == "03-02-2001 to 02-28-2008"
    assert "data/raw/psi/SAME/SAME.md line 16" in fs["Investigation dates"].detail
    assert fs["Proposal title"].rows == [11]
    assert "publications.csv lines 7, 8" in fs["Proposal title"].detail
    assert fs["Flight platform"].rows == [12, 15, 30]
    assert "Cygnus" in fs["Flight platform"].detail


def test_saffire3_platform_flag(built):
    _, _, flags, _ = built
    (f,) = _flags(flags, "PSI-100", "metadata_inconsistent")
    assert f.file == "data/raw/psi/SAFFIRE-III/SAFFIRE-III.md" and f.rows == [12, 15, 29]
    assert f.raw == "International Space Station (ISS)"
    assert not _flags(flags, "PSI-99", "metadata_inconsistent")  # SAFFIRE-II says Cygnus Spacecraft


def test_flame_design_no_licence_flag(built):
    _, _, flags, _ = built
    (f,) = _flags(flags, "PSI-10", "no_licence")
    assert (f.file, f.rows, f.column, f.raw) == (
        "data/raw/psi/ACME-Flame-Design/ACME-Flame-Design.md",
        [19],
        "License",
        "\u2014",
    )


def test_cfi_dates_flag(built):
    _, _, flags, _ = built
    (f,) = _flags(flags, "PSI-39", "metadata_inconsistent")
    assert (f.file, f.rows, f.raw) == ("data/raw/psi/CFI/CFI.md", [16], "10-01-2020 to 10-20-2021")
    assert "all 87 Test Date cells" in f.detail and "lines 2 to 88" in f.detail


def test_flags_never_change_values(built):
    _, _, _, by_id = built
    assert by_id["PSI-98"]["start_date"]["v"] == "03-02-2001"
    assert by_id["PSI-98"]["flight_platform"]["v"] == "International Space Station (ISS)"
    assert by_id["PSI-39"]["end_date"]["v"] == "10-20-2021"


def test_deterministic(built):
    invs, reg, flags, _ = built
    reg2, flags2 = Registry(), FlagLog()
    assert I.build(reg2, flags2) == invs
    assert reg2.to_json() == reg.to_json()
    assert [f.key() for f in flags2.items] == [f.key() for f in flags.items]


# ---------- coverage ----------


@pytest.fixture(scope="module")
def cov():
    return I.coverage(normalise().records)


def test_coverage_shape(cov):
    assert len(cov) == 24
    for inv, fields in cov.items():
        assert tuple(fields) == I.COVERAGE_FIELDS
        if inv in GROUND:
            assert set(fields.values()) == {None}
        else:
            assert all(isinstance(v, bool) for v in fields.values()), inv


def test_coverage_known(cov):
    # FLEX records O2, pressure, CO2 and He; BASS and SAME have no O2 column; no solid table has pressure.
    assert cov["PSI-69"]["o2_pct"] and cov["PSI-69"]["pressure_kpa"] and cov["PSI-69"]["co2_pct"]
    assert cov["PSI-69"]["he_pct"] and cov["PSI-69"]["outcome_label"]
    for inv in ("PSI-26", "PSI-100", "PSI-101", "PSI-102"):
        assert cov[inv]["o2_pct"] is False, inv
    for inv in ("PSI-25", "PSI-26", "PSI-98", "PSI-99", "PSI-100", "PSI-101", "PSI-102"):
        assert cov[inv]["pressure_kpa"] is False, inv
        assert cov[inv]["material"] is True, inv


def test_coverage_rule_matches_records():
    res = normalise()
    cov = I.coverage(res.records)
    for inv, fields in cov.items():
        recs = [r for r in res.records if r.investigation_id == inv]
        for f, recorded in fields.items():
            if recorded is None:
                assert not recs
                continue
            ids = [r.fields[f]["p"] for r in recs if f in r.fields]
            assert recorded == any(not p.startswith("missing:") for p in ids), (inv, f)


def test_no_em_dash_in_module():
    for path in (ROOT / "redshift" / "investigations.py", ROOT / "tests" / "test_investigations.py"):
        assert "\u2014" not in path.read_text(encoding="utf-8"), path
