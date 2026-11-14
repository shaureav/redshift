"""Ask the evidence: the post-check must block any answer that is not grounded in the retrieved context.

The model is replaced by a stub, so these tests never call an API and need no key.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from redshift.ai import ask as A
from redshift.api.app import app, probe
from redshift.paths import PROCESSED

pytestmark = pytest.mark.skipif(not (PROCESSED / "probe_grid.json").exists(), reason="run the build first")


def _load(name: str) -> Any:
    return json.loads((PROCESSED / name).read_text(encoding="utf-8"))


def _ctx() -> A.Context:
    p = probe(o2=34, p=8.2, m=1.0)
    return A.build_context(
        p,
        _load("access_gap.json"),
        _load("key_findings.json")["findings"],
        _load("investigations.json")["investigations"],
    )


def _slot(ctx: A.Context, what: str) -> str:
    return next(k for k, v in ctx.values.items() if v["label"] == what)


def _stub(answer: dict[str, Any]) -> A.ModelCall:
    return lambda question, context: answer


def test_grounded_answer_passes_and_keeps_provenance() -> None:
    ctx = _ctx()
    total_gas = _slot(ctx, "tests near the point, gas, from psi table")
    test_id = ctx.body["nearest_tests"][0]["id"]
    good = {
        "paragraphs": [
            {"text": f"In the PSI tables, {{{{{total_gas}}}}} gas-flame tests sit near this point.", "cites": [test_id]}
        ],
        "not_covered": "PSI does not cover solid-material burns with pressure recorded at this point.",
    }
    out = A.answer("What tests exist here?", ctx, _stub(good))
    assert out["status"] == "answered", out["problems"]
    val = next(s["val"] for s in out["paragraphs"][0]["segments"] if "val" in s)
    assert val["p"].startswith("probe:") and isinstance(val["v"], int)


@pytest.mark.parametrize(
    ("text", "cites", "not_covered", "problem"),
    [
        ("There are 37 tests near this point.", ["PSI-69"], "No solids.", "number '37' written outside a slot"),
        ("Tests sit near this point {{v9999}}.", ["PSI-69"], "No solids.", "slot v9999 is not in the context"),
        ("Gas tests sit near this point.", ["PSI-999"], "No solids.", "citation 'PSI-999' is not in the context"),
        ("Gas tests sit near this point.", [], "No solids.", "paragraph without a citation"),
        ("This atmosphere is the safest choice.", ["PSI-69"], "No solids.", "banned wording 'safest'"),
        ("We recommend this atmosphere.", ["PSI-69"], "No solids.", "banned wording 'recommend'"),
        ("Gas tests sit near this point.", ["PSI-69"], "", "no statement of what the data does not cover"),
    ],
)
def test_post_check_rejects_ungrounded_answers(text: str, cites: list[str], not_covered: str, problem: str) -> None:
    ctx = _ctx()
    out = A.answer("q", ctx, _stub({"paragraphs": [{"text": text, "cites": cites}], "not_covered": not_covered}))
    assert out["status"] == "rejected"
    assert problem in out["problems"], out["problems"]
    assert out["paragraphs"] == []


def test_refusal_and_endpoint_without_credentials() -> None:
    ctx = _ctx()
    assert A.answer("q", ctx, lambda q, c: None)["status"] == "rejected"
    client = TestClient(app)
    r = client.post("/ask", json={"question": "What tests exist near 8.2 psi?", "o2": 34, "psi": 8.2})
    assert r.status_code == 200
    assert r.json()["status"] in {"unavailable", "answered", "rejected"}


def test_every_context_value_carries_provenance() -> None:
    ctx = _ctx()
    assert ctx.values and all(isinstance(v["p"], str) and v["p"] for v in ctx.values.values())
