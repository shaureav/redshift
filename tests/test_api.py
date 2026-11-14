"""API tests: endpoints serve the built files unchanged and every numeric value keeps its provenance id."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from redshift.api.app import app
from redshift.paths import PROCESSED

pytestmark = pytest.mark.skipif(not (PROCESSED / "tests.json").exists(), reason="run the build first")
client = TestClient(app)


def test_version_matches_file() -> None:
    assert client.get("/version").json() == json.loads((PROCESSED / "dataset_version.json").read_text())


def test_tests_filter_and_provenance() -> None:
    r = client.get("/tests", params={"investigation": "PSI-69", "limit": 5}).json()
    assert r["total"]["v"] == 274
    t = client.get(f"/tests/{r['tests'][0]['test_id']}").json()
    assert t["provenance"]["o2_pct"]["file"].endswith("PSI-69_Experimental table_FLEX.csv")


def test_candidate_dossier_and_planner() -> None:
    d = client.get("/candidates/c8_2_34/dossier").json()
    assert d["candidate"]["o2_pct"]["v"] == 34.0
    assert d["evidence"]["near"]["solid"]["psi_table"]["v"] == 0
    p = client.get("/planner", params={"preset": "solids_only", "top": 5}).json()
    assert len(p["ranked"]) == 5


def test_compare_bounds() -> None:
    assert client.get("/compare", params={"ids": "PSI-69"}).status_code == 422
    assert client.get("/compare", params={"ids": "PSI-69,PSI-25"}).status_code == 200


def test_openapi_schema() -> None:
    schema = client.get("/openapi.json").json()
    assert "/tests" in schema["paths"] and "/candidates/{cand_id}/dossier" in schema["paths"]
    assert "/probe" in schema["paths"]


def test_probe_matches_candidate_evidence_at_every_candidate() -> None:
    cands = json.loads((PROCESSED / "candidates.json").read_text())["candidates"]
    evs = {e["candidate_id"]: e for e in json.loads((PROCESSED / "candidate_evidence.json").read_text())["evidence"]}
    for c in cands:
        r = client.get("/probe", params={"o2": c["o2_pct"]["v"], "p": c["pressure_psi"]["v"]}).json()
        assert r["candidate_id"] == c["id"]
        ev = evs[c["id"]]
        for fc, by_src in ev["near"].items():
            for st, val in by_src.items():
                assert r["near"][fc][st]["v"] == val["v"], (c["id"], fc, st)
            assert r["o2_match_pressure_unknown"][fc]["v"] == ev["o2_match_pressure_unknown"][fc]["v"]
        assert r["near_total"]["v"] == ev["near_total"]["v"] == len(r["near_tests"])
        assert r["flame_temperature"]["exact"] and r["flame_temperature"]["value"]["v"] == ev["flame_temperature"]["v"]


def test_probe_snaps_and_rejects_undocumented_steps() -> None:
    r = client.get("/probe", params={"o2": 33.8, "p": 8.23}).json()
    assert r["node"]["o2_pct"]["v"] == 34.0 and r["node"]["pressure_psi"]["v"] == 8.2
    assert client.get("/probe", params={"o2": 34, "p": 8.2, "m": 2}).status_code == 422
    off = client.get("/probe", params={"o2": 60, "p": 30}).json()
    assert off["inside_grid"] is False
    mid = client.get("/probe", params={"o2": 31, "p": 9}).json()
    assert mid["flame_temperature"]["exact"] is False and mid["flame_temperature"]["at"] is not None


def test_probe_snapshot_8_2_psi_34_pct() -> None:
    """The demo point. To accept an intended change, delete the file, rerun, review the diff and commit."""
    from pathlib import Path

    path = Path(__file__).parent / "snapshots" / "probe_c8_2_34.json"
    body = client.get("/probe", params={"o2": 34, "p": 8.2}).json()
    body.pop("dataset_version")
    text = json.dumps(body, indent=1, sort_keys=True) + "\n"
    if not path.exists():
        path.write_text(text, encoding="utf-8", newline="\n")
        pytest.skip("snapshot written; review and commit it")
    assert body == json.loads(path.read_text(encoding="utf-8"))
