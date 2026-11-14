"""Golden checks: values from earlier analyses that the pipeline must reproduce or explain.

Expected values live in redshift/goldens.json. A golden either matches, or differs with a written
explanation (an explained finding), or differs without one. An unexplained difference stops the build.
Explanations are written by a person after looking at the evidence; the pipeline is never tuned to match.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

GOLDENS = Path(__file__).with_name("goldens.json")


def evaluate(actual: dict[str, Any]) -> list[dict[str, Any]]:
    spec = json.loads(GOLDENS.read_text(encoding="utf-8"))
    out = []
    for g in spec["checks"]:
        a = actual.get(g["id"])
        exp = g["expected"]
        tol = g.get("tolerance", 0)
        if isinstance(exp, int | float) and isinstance(a, int | float):
            match = abs(a - exp) <= tol
        else:
            match = a == exp
        status = "match" if match else ("explained_difference" if g.get("explanation") else "unexplained_difference")
        out.append(
            {
                "id": g["id"],
                "description": g["description"],
                "source": g.get("source"),
                "expected": exp,
                "actual": a,
                "status": status,
                "explanation": g.get("explanation"),
            }
        )
    return out
