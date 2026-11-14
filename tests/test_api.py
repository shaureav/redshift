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
