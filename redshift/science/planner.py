"""Test planner: where would a new test add the most evidence?

The plane is cut into 7 O2 levels x 6 pressures x 3 material classes = 126 cells. For each cell,
n is the number of existing tests of that class near the cell (the nearness rule at 1x steps).
priority = habitat relevance x material weight x (1 - n / (n + 5)).
Habitat relevance falls off with the cell's distance to the nearest habitat candidate. Weights, levels,
the relevance function and the constant 5 are judgement, listed on the Methods page. The planner
ranks gaps in the evidence, never atmospheres.
"""

from __future__ import annotations

import math
from typing import Any

from redshift.provenance import Prov, Registry, value
from redshift.science.nearness import Evidence, Steps, evaluate
from redshift.units import psi_to_kpa

METHOD_VERSION = "1"


def relevance(o2: float, p_psi: float, habitats: list[dict[str, Any]], steps: Steps) -> float:
    d = min(
        math.hypot((o2 - h["o2_pct"]["v"]) / steps.o2, math.log(p_psi / h["pressure_psi"]["v"]) / steps.log_p)
        for h in habitats
    )
    return math.exp(-(d**2) / (2 * steps.threshold**2))


def build(
    registry: Registry,
    evidence: list[Evidence],
    habitats: list[dict[str, Any]],
    near_params: dict[str, Any],
    params: dict[str, Any],
) -> dict[str, Any]:
    steps = Steps.from_params(near_params, 1.0)
    k = params["evidence_constant"]
    cells = []
    for p_psi in params["pressure_levels_psi"]:
        for o2 in params["o2_levels_pct"]:
            ev = evaluate(evidence, o2, psi_to_kpa(p_psi), near_params, 1.0)
            rel = relevance(o2, p_psi, habitats, steps)
            for mat in params["material_classes"]:
                near = [(d, e) for d, e in ev["near"] if e.fuel_class == mat]
                n = len(near)
                cid = f"cell:{o2:g}:{p_psi:g}:{mat}"
                base: dict[str, Any] = {"source_type": "derived", "method_version": METHOD_VERSION}
                n_id = registry.add(
                    Prov(
                        id=f"planner:{cid}:n",
                        method="nearness count (1x steps)",
                        params={"o2_pct": o2, "pressure_psi": p_psi, "material": mat},
                        inputs=[e.id for _, e in near],
                        **base,
                    )
                )  # type: ignore[arg-type]
                r_id = registry.add(
                    Prov(
                        id=f"planner:{cid}:relevance",
                        method="habitat relevance",
                        params={"formula": params["relevance"], "o2_pct": o2, "pressure_psi": p_psi},
                        note="Judgement.",
                        **base,
                    )
                )  # type: ignore[arg-type]
                prios = {}
                for preset, weights in params["presets"].items():
                    w = weights[mat]
                    prio = rel * w * (1 - n / (n + k))
                    pid = registry.add(
                        Prov(
                            id=f"planner:{cid}:priority:{preset}",
                            method="planner priority",
                            params={
                                "formula": "relevance x weight x (1 - n/(n+5))",
                                "weight": w,
                                "k": k,
                                "preset": preset,
                            },
                            inputs=[n_id, r_id],
                            note="Judgement-weighted; ranks evidence gaps, not atmospheres.",
                            **base,
                        )
                    )  # type: ignore[arg-type]
                    prios[preset] = value(round(prio, 6), None, pid)
                cells.append(
                    {
                        "id": cid,
                        "o2_pct": o2,
                        "pressure_psi": p_psi,
                        "material": mat,
                        "n_near": value(n, "tests", n_id),
                        "relevance": value(round(rel, 6), None, r_id),
                        "priority": prios,
                        "nearest": [
                            {
                                "test_id": e.id,
                                "investigation": e.investigation,
                                "distance": value(round(d, 4), "steps", n_id),
                            }
                            for d, e in near[:3]
                        ],
                    }
                )
    rankings = {}
    for preset in params["presets"]:
        ordered = sorted(cells, key=lambda c: (-c["priority"][preset]["v"], c["id"]))
        rankings[preset] = [c["id"] for c in ordered]
    grid_id = registry.add(
        Prov(
            id="planner:grid",
            source_type="derived",
            method="planner grid",
            method_version=METHOD_VERSION,
            params=params,
            note="Grid levels and presets are judgement.",
        )
    )
    return {"cells": cells, "rankings": rankings, "params": params, "p": grid_id}
