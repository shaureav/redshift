"""Nearness: which tests sit close to a point on the O2 and pressure plane.

Distance is Euclidean in steps: one step is 5 percentage points of O2, a 25% change in pressure on a log
scale (ln 1.25), and 10 cm/s of flow. A test is "near" when its distance is at most 1.5 steps. Flow is
used only when both the test and the target record it; candidate atmospheres have no flow, so their
nearness uses O2 and pressure only. A test whose O2 or pressure is not recorded is "unknown", never
"not near", and is reported separately. Inverse flames (oxygen in the burner stream, not the
atmosphere) are reported separately and never counted as near a cabin atmosphere.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

State = Literal["near", "not_near", "unknown_pressure", "unknown_o2", "unknown_both", "basis_differs"]

FUEL_CLASSES = ("gas", "droplet", "solid", "emulator")
SOURCE_TYPES = ("psi_table", "published_paper")


@dataclass(frozen=True)
class Evidence:
    """One test, from a PSI table or a verified paper, reduced to what nearness needs."""

    id: str
    investigation_id: str
    investigation: str
    fuel_class: str
    source_type: str
    o2_pct: float | None
    pressure_kpa: float | None
    flow_cm_s: float | None
    o2_basis: str | None
    label: str
    outcome_label: str | None = None
    # Published papers often state a range (for example 29 to 31% O2). When a range is given, distance is
    # measured to the closest point of the range; o2_pct and pressure_kpa then hold the range midpoint for
    # plotting only.
    o2_range: tuple[float, float] | None = None
    # A session that lists several O2 levels (ACME BRE). Used only for 'O2 matches, pressure unknown'.
    o2_list: tuple[float, ...] | None = None
    pressure_range_kpa: tuple[float, float] | None = None


@dataclass(frozen=True)
class Steps:
    o2: float
    log_p: float
    flow: float
    threshold: float

    @classmethod
    def from_params(cls, p: dict[str, Any], multiplier: float = 1.0) -> Steps:
        return cls(
            o2=p["o2_step_pct_points"] * multiplier,
            log_p=math.log(p["pressure_step_log"]) * multiplier,
            flow=p["flow_step_cm_s"] * multiplier,
            threshold=p["threshold"],
        )


def distance(
    ev: Evidence, o2_pct: float, pressure_kpa: float, steps: Steps, target_flow: float | None = None
) -> float | None:
    """Distance in steps, or None if the test lacks O2 or pressure."""
    if ev.o2_pct is None or ev.pressure_kpa is None or ev.pressure_kpa <= 0:
        return None
    o2 = min(max(o2_pct, ev.o2_range[0]), ev.o2_range[1]) if ev.o2_range else ev.o2_pct
    p = (
        min(max(pressure_kpa, ev.pressure_range_kpa[0]), ev.pressure_range_kpa[1])
        if ev.pressure_range_kpa
        else ev.pressure_kpa
    )
    d2 = ((o2 - o2_pct) / steps.o2) ** 2 + (math.log(p / pressure_kpa) / steps.log_p) ** 2
    if target_flow is not None and ev.flow_cm_s is not None:
        d2 += ((ev.flow_cm_s - target_flow) / steps.flow) ** 2
    return math.sqrt(d2)


def classify(
    ev: Evidence,
    o2_pct: float,
    pressure_kpa: float,
    steps: Steps,
    counted_bases: list[str],
    target_flow: float | None = None,
) -> tuple[State, float | None]:
    if ev.o2_pct is not None and ev.o2_basis is not None and ev.o2_basis not in counted_bases:
        return "basis_differs", None
    if ev.o2_pct is None and ev.o2_list and ev.pressure_kpa is None:
        return "unknown_pressure", None
    if ev.o2_pct is None and ev.pressure_kpa is None:
        return "unknown_both", None
    if ev.pressure_kpa is None:
        return "unknown_pressure", None
    if ev.o2_pct is None:
        return "unknown_o2", None
    d = distance(ev, o2_pct, pressure_kpa, steps, target_flow)
    assert d is not None
    return ("near" if d <= steps.threshold else "not_near"), d


def o2_only_match(ev: Evidence, o2_pct: float, steps: Steps) -> bool:
    """True when the test's O2 alone is within the threshold (used for 'O2 matches, pressure unknown')."""
    if ev.o2_pct is None and ev.o2_list:
        return any(abs(v - o2_pct) / steps.o2 <= steps.threshold for v in ev.o2_list)
    if ev.o2_pct is None:
        return False
    o2 = min(max(o2_pct, ev.o2_range[0]), ev.o2_range[1]) if ev.o2_range else ev.o2_pct
    return abs(o2 - o2_pct) / steps.o2 <= steps.threshold


def evaluate(
    evidence: list[Evidence],
    o2_pct: float,
    pressure_kpa: float,
    params: dict[str, Any],
    multiplier: float = 1.0,
    target_flow: float | None = None,
) -> dict[str, Any]:
    """Counts by state, fuel class and source type, plus the near tests sorted by distance."""
    steps = Steps.from_params(params, multiplier)
    bases = params["o2_basis_counted"]
    counts: dict[str, dict[str, dict[str, int]]] = {}
    near: list[tuple[float, Evidence]] = []
    o2_match_p_unknown: list[Evidence] = []
    for ev in evidence:
        state, d = classify(ev, o2_pct, pressure_kpa, steps, bases, target_flow)
        counts.setdefault(state, {}).setdefault(ev.fuel_class, {}).setdefault(ev.source_type, 0)
        counts[state][ev.fuel_class][ev.source_type] += 1
        if state == "near" and d is not None:
            near.append((d, ev))
        if state == "unknown_pressure" and o2_only_match(ev, o2_pct, steps):
            o2_match_p_unknown.append(ev)
    near.sort(key=lambda t: (t[0], t[1].id))
    return {"counts": counts, "near": near, "o2_match_pressure_unknown": o2_match_p_unknown}


def count(
    counts: dict[str, dict[str, dict[str, int]]],
    state: str,
    fuel_class: str | None = None,
    source_type: str | None = None,
) -> int:
    total = 0
    for fc, by_src in counts.get(state, {}).items():
        if fuel_class is not None and fc != fuel_class:
            continue
        for st, n in by_src.items():
            if source_type is not None and st != source_type:
                continue
            total += n
    return total
