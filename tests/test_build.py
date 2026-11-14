"""Whole-build tests: determinism, goldens, provenance coverage, reconciliation and snapshots.

Snapshots of the five candidate dossiers live in tests/snapshots. To accept an intended change, delete
the snapshot file, rerun the tests (which rewrite it) and review the diff before committing.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from redshift import build

SNAP = Path(__file__).parent / "snapshots"


@pytest.fixture(scope="module")
def result() -> dict:
    return build.compute()


def test_deterministic(result: dict) -> None:
    again = build.compute()
    for name, payload in result["payloads"].items():
        assert build.dumps(payload) == build.dumps(again["payloads"][name]), name
    assert result["version"] == again["version"]


def test_provenance_coverage_is_complete(result: dict) -> None:
    cov = result["quality"]["provenance_coverage"]
    assert cov["without_provenance"] == 0 and cov["percent"] == 100.0
    assert cov["numbers_checked"] > 5000


def test_no_unexplained_goldens(result: dict) -> None:
    bad = [g for g in result["golden_results"] if g["status"] == "unexplained_difference"]
    assert not bad, bad


def test_reconciliation_balances(result: dict) -> None:
    recons = result["quality"]["reconciliation"]
    assert len(recons) == 21 and all(r["balanced"] for r in recons)


def test_no_solid_test_near_low_pressure_candidates(result: dict) -> None:
    ev = {e["candidate_id"]: e for e in result["payloads"]["candidate_evidence.json"]["evidence"]}
    for cid in ("c10_2_26_5", "c10_2_30", "c8_2_34"):
        assert ev[cid]["near"]["solid"]["psi_table"]["v"] == 0


def test_unverified_findings_never_reach_ui(result: dict) -> None:
    status = result["payloads"]["key_findings.json"]["status"]
    shown = {f["id"] for f in result["payloads"]["key_findings.json"]["findings"]}
    assert shown == set(status["verified"])


@pytest.mark.parametrize("cid", ["c14_7_21", "c10_2_26_5", "c10_2_30", "c8_2_34", "c4_3_100"])
def test_candidate_snapshot(result: dict, cid: str) -> None:
    ev = next(e for e in result["payloads"]["candidate_evidence.json"]["evidence"] if e["candidate_id"] == cid)
    path = SNAP / f"candidate_{cid}.json"
    text = build.dumps(ev)
    if not path.exists():
        path.write_text(text, encoding="utf-8")
        pytest.skip("snapshot written; review and commit it")
    assert json.loads(text) == json.loads(path.read_text(encoding="utf-8"))
