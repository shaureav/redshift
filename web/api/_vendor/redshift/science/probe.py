"""Probe grid: nearness counts precomputed over the oxygen and pressure plane.

The website lets a user drag a probe anywhere on the plane. Counts shown for the probe must come from
the pipeline, never from the browser, so the build evaluates the nearness rule at every node of a dense
grid (O2 every 0.5 percentage points, pressure every 0.1 psi) for each documented step multiplier. The
probe snaps to the nearest node and says which node it shows. Every candidate atmosphere sits exactly on
a node, so the grid reproduces candidate_evidence.json and sensitivity.json there (tested).

Counts are computed with numpy for speed. Any distance within 1e-9 of the threshold is recomputed with
redshift.science.nearness.distance itself, so the grid agrees with nearness.evaluate exactly.

The payload also carries the nearness inputs: one entry per test that can be placed on the plane, with
the provenance of its O2 and pressure, and one entry per test whose pressure is not recorded. The
browser uses them only to list which tests are near the probe; a test checks that its listing agrees
with these counts at every node.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from redshift.normalise.base import TestRecord
from redshift.provenance import Prov, Registry, value
from redshift.science.nearness import FUEL_CLASSES, SOURCE_TYPES, Evidence, Steps, classify, distance, o2_only_match
from redshift.units import psi_to_kpa

AXES = {
    "o2_pct": {"start": 15.0, "stop": 100.0, "step": 0.5},
    "pressure_psi": {"start": 3.0, "stop": 17.0, "step": 0.1},
}
PLACED = ("near", "not_near")
EPS = 1e-9


def axis(name: str) -> list[float]:
    a = AXES[name]
    n = int(round((a["stop"] - a["start"]) / a["step"])) + 1
    return [round(a["start"] + i * a["step"], 4) for i in range(n)]


def rle(values: np.ndarray) -> list[int]:
    """Run-length encode a flat integer array as [value, run, value, run, ...]."""
    out: list[int] = []
    flat = values.ravel()
    if flat.size == 0:
        return out
    change = np.flatnonzero(np.diff(flat)) + 1
    starts = np.concatenate(([0], change))
    ends = np.concatenate((change, [flat.size]))
    for s, e in zip(starts, ends, strict=True):
        out += [int(flat[s]), int(e - s)]
    return out


def unrle(pairs: list[int]) -> list[int]:
    out: list[int] = []
    for i in range(0, len(pairs), 2):
        out += [pairs[i]] * pairs[i + 1]
    return out


def _near_mask(ev: Evidence, o2: np.ndarray, kpa: np.ndarray, steps: Steps) -> np.ndarray:
    """Boolean (n_o2, n_p) mask of nodes within the threshold of this test, exactly as nearness.distance."""
    assert ev.o2_pct is not None and ev.pressure_kpa is not None
    o2e = np.clip(o2, ev.o2_range[0], ev.o2_range[1]) if ev.o2_range else np.full_like(o2, ev.o2_pct)
    pe = (
        np.clip(kpa, ev.pressure_range_kpa[0], ev.pressure_range_kpa[1])
        if ev.pressure_range_kpa
        else np.full_like(kpa, ev.pressure_kpa)
    )
    a = ((o2e - o2) / steps.o2) ** 2
    b = (np.log(pe / kpa) / steps.log_p) ** 2
    d = np.sqrt(a[:, None] + b[None, :])
    mask = d <= steps.threshold
    edge = np.argwhere(np.abs(d - steps.threshold) < EPS)
    for i, j in edge:
        exact = distance(ev, float(o2[i]), float(kpa[j]), steps)
        mask[i, j] = exact is not None and exact <= steps.threshold
    return mask


def _input_entry(ev: Evidence, rec: TestRecord | None, registry: Registry, doi: str | None) -> dict[str, Any]:
    if rec is not None:
        o2 = rec.fields.get("o2_pct")
        kpa = rec.fields.get("pressure_kpa")
    else:
        # A verified paper value: provenance points back to the paper test it was read from.
        pid = registry.add(
            Prov(
                id=f"probe:input:{ev.id}",
                source_type="derived",
                method="verified paper values used as a nearness input",
                method_version="1",
                inputs=[ev.id],
            )
        )
        o2 = value(ev.o2_pct, "%", pid)
        kpa = value(ev.pressure_kpa, "kPa", pid)
    entry: dict[str, Any] = {
        "id": ev.id,
        "investigation_id": ev.investigation_id,
        "investigation": ev.investigation,
        "fuel_class": ev.fuel_class,
        "source_type": ev.source_type,
        "label": ev.label,
        "doi": doi,
        "o2": o2,
        "kpa": kpa,
    }
    if ev.o2_range:
        entry["o2_range"] = {"v": list(ev.o2_range), "u": "%", "p": (o2 or {}).get("p", "probe:grid")}
    if ev.pressure_range_kpa:
        entry["pressure_range_kpa"] = {
            "v": list(ev.pressure_range_kpa),
            "u": "kPa",
            "p": (kpa or {}).get("p", "probe:grid"),
        }
    if ev.o2_list:
        lst = rec.fields.get("o2_list_pct") if rec is not None else None
        entry["o2_list"] = lst if lst is not None else {"v": list(ev.o2_list), "u": "%", "p": "probe:grid"}
    return entry


def build(
    registry: Registry,
    records: list[TestRecord],
    evidence: list[Evidence],
    near_params: dict[str, Any],
    dois: dict[str, str | None],
) -> dict[str, Any]:
    o2_axis = axis("o2_pct")
    psi_axis = axis("pressure_psi")
    o2 = np.array(o2_axis, dtype=float)
    kpa = np.array([psi_to_kpa(p) for p in psi_axis], dtype=float)
    bases = near_params["o2_basis_counted"]
    by_id = {r.test_id: r for r in records}

    # A test's state (placed, pressure unknown, basis differs...) does not depend on the point.
    states: dict[str, str] = {}
    for ev in evidence:
        state, _ = classify(ev, 21.0, 101.325, Steps.from_params(near_params), bases)
        states[ev.id] = "placed" if state in PLACED else state
    placed = [ev for ev in evidence if states[ev.id] == "placed"]
    p_unknown = [ev for ev in evidence if states[ev.id] == "unknown_pressure"]

    grid_pid = registry.add(
        Prov(
            id="probe:grid",
            source_type="derived",
            method="nearness counts on the probe grid",
            method_version="1",
            params={"axes": AXES, "nearness": near_params},
            note="The probe snaps to the nearest grid node. Candidate atmospheres sit exactly on nodes.",
        )
    )
    axes_pid = registry.add(
        Prov(
            id="probe:axes",
            source_type="derived",
            method="probe grid axes (pressure in psi; kPa by psi_to_kpa)",
            method_version="1",
            params={"axes": AXES},
        )
    )

    layers = []
    for mult in near_params["sensitivity_multipliers"]:
        steps = Steps.from_params(near_params, mult)
        tag = f"{mult:g}"
        counts = {fc: {st: np.zeros((len(o2), len(kpa)), dtype=np.int32) for st in SOURCE_TYPES} for fc in FUEL_CLASSES}
        for ev in placed:
            counts[ev.fuel_class][ev.source_type] += _near_mask(ev, o2, kpa, steps)
        total = sum(
            (counts[fc][st] for fc in FUEL_CLASSES for st in SOURCE_TYPES), np.zeros_like(counts["gas"]["psi_table"])
        )
        near_out: dict[str, Any] = {}
        for fc in FUEL_CLASSES:
            near_out[fc] = {}
            for st in SOURCE_TYPES:
                pid = registry.add(
                    Prov(
                        id=f"probe:{tag}:{fc}:{st}",
                        source_type="derived",
                        method="nearness count on the probe grid",
                        method_version="1",
                        params={"multiplier": mult, "fuel_class": fc, "source_type": st},
                        note="Tests near the grid node, by fuel class and source type. The tests counted at a node "
                        "are listed in the evidence panel and by the API at /probe.",
                    )
                )
                near_out[fc][st] = {"rle": rle(counts[fc][st]), "u": "tests", "p": pid}
        total_pid = registry.add(
            Prov(
                id=f"probe:{tag}:total",
                source_type="derived",
                method="nearness count on the probe grid, all fuel classes and sources",
                method_version="1",
                params={"multiplier": mult},
            )
        )
        o2m_out: dict[str, Any] = {}
        for fc in FUEL_CLASSES:
            evs = [ev for ev in p_unknown if ev.fuel_class == fc]
            col = [sum(1 for ev in evs if o2_only_match(ev, float(x), steps)) for x in o2_axis]
            pid = registry.add(
                Prov(
                    id=f"probe:{tag}:o2match:{fc}",
                    source_type="derived",
                    method="O2 within threshold, pressure not recorded, per O2 column of the probe grid",
                    method_version="1",
                    params={"multiplier": mult, "fuel_class": fc},
                    inputs=sorted(ev.id for ev in evs),
                )
            )
            o2m_out[fc] = {"by_o2": col, "u": "tests", "p": pid}
        layers.append(
            {
                "multiplier": mult,
                "near": near_out,
                "total": {"rle": rle(total), "u": "tests", "p": total_pid},
                "o2_match_pressure_unknown": o2m_out,
            }
        )

    unknown: dict[str, Any] = {}
    for state in ("unknown_pressure", "unknown_o2", "unknown_both", "basis_differs"):
        ids = sorted(ev.id for ev in evidence if states[ev.id] == state)
        pid = registry.add(
            Prov(
                id=f"probe:state:{state}",
                source_type="derived",
                method=f"tests in state {state} (the same at every point)",
                method_version="1",
                inputs=ids,
            )
        )
        unknown[state] = value(len(ids), "tests", pid)

    inputs = [
        _input_entry(ev, by_id.get(ev.id), registry, dois.get(ev.id)) for ev in sorted(placed, key=lambda e: e.id)
    ]
    p_unknown_inputs = [
        _input_entry(ev, by_id.get(ev.id), registry, dois.get(ev.id)) for ev in sorted(p_unknown, key=lambda e: e.id)
    ]
    steps1 = Steps.from_params(near_params)
    return {
        "about": "Nearness counts at every node of the probe grid. Series are run-length encoded as "
        "[value, run, value, run, ...] over index = i_o2 * n_pressure + j_pressure.",
        "axes": {
            "o2_pct": {**AXES["o2_pct"], "n": len(o2_axis), "values": o2_axis},
            "pressure_psi": {**AXES["pressure_psi"], "n": len(psi_axis), "values": psi_axis},
            # Full precision: the browser's nearness listing must use exactly the kPa the grid used.
            "pressure_kpa": {"values": [float(k) for k in kpa]},
            "p": axes_pid,
        },
        "nearness": {
            "o2_step": near_params["o2_step_pct_points"],
            "log_pressure_step": math.log(near_params["pressure_step_log"]),
            "threshold": steps1.threshold,
            "o2_basis_counted": bases,
            "p": "params:nearness",
        },
        "layers": layers,
        "unknown": unknown,
        "inputs": inputs,
        "pressure_unknown_inputs": p_unknown_inputs,
        "p": grid_pid,
    }
