"""Evidence views: per-candidate evidence, sensitivity, the access gap and the FLEX suppression table.

Every count here is computed from canonical records or verified findings and registered as a derived
value whose inputs are the test ids counted, so any count on screen can be traced to its rows.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from redshift.normalise.base import TestRecord
from redshift.papers.findings import CheckedFinding
from redshift.provenance import Prov, Registry, value
from redshift.science.nearness import FUEL_CLASSES, SOURCE_TYPES, Evidence, count, evaluate
from redshift.units import KPA_PER_MMHG, psi_to_kpa

FIRE_KINDS = {"burn", "flame"}


def _v(rec: TestRecord, f: str) -> Any:
    cell = rec.fields.get(f)
    return None if cell is None else cell["v"]


def record_evidence(records: Iterable[TestRecord], inv_names: dict[str, str]) -> list[Evidence]:
    out = []
    for r in records:
        if r.test_kind not in FIRE_KINDS or r.fuel_class not in FUEL_CLASSES:
            continue
        out.append(
            Evidence(
                id=r.test_id,
                investigation_id=r.investigation_id,
                investigation=inv_names.get(r.investigation_id, r.investigation_id),
                fuel_class=r.fuel_class,
                source_type="psi_table",
                o2_pct=_v(r, "o2_pct"),
                pressure_kpa=_v(r, "pressure_kpa"),
                flow_cm_s=_v(r, "flow_cm_s"),
                o2_basis=_v(r, "o2_basis"),
                label=str(_v(r, "fuel") or _v(r, "material") or ""),
                outcome_label=_v(r, "outcome_label"),
                o2_list=tuple(_v(r, "o2_list_pct")) if _v(r, "o2_list_pct") else None,
            )
        )
    return out


def load_paper_map() -> dict[str, Any]:
    import json

    from redshift.paths import FINDINGS

    path = FINDINGS / "paper_tests.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"tests": [], "prebreathe": []}


def _finding_value(by_id: dict[str, CheckedFinding], ref: list[str]) -> tuple[float, str] | None:
    """(value, provenance-bearing finding id) for a [finding id, value name] reference, if verified."""
    fid, name = ref
    cf = by_id.get(fid)
    if cf is None:
        raise KeyError(f"paper_tests.json cites unknown finding {fid}")
    vals = {v["name"]: v for v in cf.draft.get("values", [])}
    if name not in vals:
        raise KeyError(f"paper_tests.json: finding {fid} has no value named {name!r}")
    return (float(vals[name]["value"]), fid) if cf.verified else None


def paper_evidence(findings: list[CheckedFinding]) -> list[Evidence]:
    """Tests described in verified papers (for example Saffire V-2), placed by their stated O2 and pressure.
    A test appears only when every finding it cites has been verified by a named team member."""
    by_id = {cf.id: cf for cf in findings}
    out = []
    for t in load_paper_map()["tests"]:
        o2 = _finding_value(by_id, t["o2"])
        p = _finding_value(by_id, t["pressure_kpa"])
        flow = _finding_value(by_id, t["flow_cm_s"]) if t.get("flow_cm_s") else None
        if o2 is None or p is None:
            continue
        out.append(
            Evidence(
                id=f"paper:{t['id']}",
                investigation_id=t["investigation"],
                investigation=t["investigation"],
                fuel_class=t["fuel_class"],
                source_type="published_paper",
                o2_pct=o2[0],
                pressure_kpa=p[0],
                flow_cm_s=None if flow is None else flow[0],
                o2_basis="ambient",
                label=t["label"],
            )
        )
    return out


def _count_value(
    registry: Registry, pid: str, n: int, method: str, params: dict[str, Any], ids: list[str]
) -> dict[str, Any]:
    registry.add(
        Prov(id=pid, source_type="derived", method=method, method_version="1", params=params, inputs=sorted(ids))
    )
    return value(n, "tests", pid)


def candidate_evidence(
    registry: Registry,
    evidence: list[Evidence],
    candidates: list[dict[str, Any]],
    near_params: dict[str, Any],
    flame_t: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    out = []
    for c in candidates:
        o2, kpa = c["o2_pct"]["v"], c["pressure_kpa"]["v"]
        res = evaluate(evidence, o2, kpa, near_params, 1.0)
        near_ids = [e.id for _, e in res["near"]]
        split = {}
        for fc in FUEL_CLASSES:
            split[fc] = {}
            for st in SOURCE_TYPES:
                ids = [e.id for _, e in res["near"] if e.fuel_class == fc and e.source_type == st]
                split[fc][st] = _count_value(
                    registry,
                    f"near:{c['id']}:{fc}:{st}",
                    len(ids),
                    "nearness count (1x steps)",
                    {"candidate": c["id"], "fuel_class": fc, "source_type": st},
                    ids,
                )
        unknown = {}
        for state in ("unknown_pressure", "unknown_o2", "unknown_both", "basis_differs"):
            n = count(res["counts"], state)
            unknown[state] = _count_value(
                registry, f"state:{c['id']}:{state}", n, f"tests in state {state}", {"candidate": c["id"]}, []
            )
        o2m = res["o2_match_pressure_unknown"]
        o2m_split = {}
        for fc in FUEL_CLASSES:
            ids = [e.id for e in o2m if e.fuel_class == fc]
            o2m_split[fc] = _count_value(
                registry,
                f"o2match:{c['id']}:{fc}",
                len(ids),
                "O2 within threshold, pressure not recorded",
                {"candidate": c["id"], "fuel_class": fc},
                ids,
            )
        nearest = [
            {
                "test_id": e.id,
                "investigation": e.investigation,
                "fuel_class": e.fuel_class,
                "source_type": e.source_type,
                "distance": value(
                    round(d, 4),
                    "steps",
                    registry.add(
                        Prov(
                            id=f"dist:{c['id']}:{e.id}",
                            source_type="derived",
                            method="nearness distance",
                            method_version="1",
                            params={"candidate": c["id"]},
                            inputs=[e.id],
                        )
                    ),
                ),
            }
            for d, e in res["near"][:25]
        ]
        out.append(
            {
                "candidate_id": c["id"],
                "near_total": _count_value(
                    registry,
                    f"near:{c['id']}:total",
                    len(near_ids),
                    "nearness count (1x steps)",
                    {"candidate": c["id"]},
                    near_ids,
                ),
                "near": split,
                "o2_match_pressure_unknown": o2m_split,
                "unknown": unknown,
                "nearest": nearest,
                "flame_temperature": flame_t[c["id"]],
            }
        )
    return out


def sensitivity(
    registry: Registry, evidence: list[Evidence], candidates: list[dict[str, Any]], near_params: dict[str, Any]
) -> dict[str, Any]:
    rows = []
    variants = [(m, None, f"{m:g}x steps") for m in near_params["sensitivity_multipliers"]]
    variants.append((1.0, 0.0, "1x steps, flow used against a quiescent target (0 cm/s) where recorded"))
    for c in candidates:
        for mult, flow, label in variants:
            res = evaluate(evidence, c["o2_pct"]["v"], c["pressure_kpa"]["v"], near_params, mult, flow)
            cells = {}
            for fc in FUEL_CLASSES:
                ids = [e.id for _, e in res["near"] if e.fuel_class == fc]
                tag = f"{mult:g}" + ("" if flow is None else "-flow0")
                cells[fc] = _count_value(
                    registry,
                    f"sens:{c['id']}:{tag}:{fc}",
                    len(ids),
                    "nearness count (sensitivity)",
                    {"candidate": c["id"], "multiplier": mult, "target_flow_cm_s": flow, "fuel_class": fc},
                    ids,
                )
            rows.append(
                {
                    "candidate_id": c["id"],
                    "variant": label,
                    "multiplier": mult,
                    "target_flow_cm_s": flow,
                    "counts": cells,
                }
            )
    pid = registry.add(
        Prov(
            id="sensitivity",
            source_type="derived",
            method="nearness sensitivity",
            method_version="1",
            params=near_params,
        )
    )
    return {"rows": rows, "p": pid}


def access_gap(
    registry: Registry,
    records: list[TestRecord],
    paper_ev: list[Evidence],
    all_evidence: list[Evidence],
    candidates: list[dict[str, Any]],
    near_params: dict[str, Any],
    findings_status: dict[str, Any],
) -> dict[str, Any]:
    habitats = [c for c in candidates if c["role"] in {"habitat", "scenario"}]
    solid_rows = [r for r in records if r.fuel_class == "solid" and r.test_kind in FIRE_KINDS]
    with_o2 = [r for r in solid_rows if _v(r, "o2_pct") is not None]
    with_p = [r for r in solid_rows if _v(r, "pressure_kpa") is not None]
    psi_solid_ev = [e for e in all_evidence if e.fuel_class == "solid" and e.source_type == "psi_table"]
    near_psi: set[str] = set()
    for c in habitats:
        res = evaluate(psi_solid_ev, c["o2_pct"]["v"], c["pressure_kpa"]["v"], near_params)
        near_psi.update(e.id for _, e in res["near"])
    near_paper: set[str] = set()
    for c in habitats:
        res = evaluate(
            [e for e in paper_ev if e.fuel_class == "solid"], c["o2_pct"]["v"], c["pressure_kpa"]["v"], near_params
        )
        near_paper.update(e.id for _, e in res["near"])
    m = "access gap step count"
    psi_steps = [
        ("Solid-fuel burn rows in PSI experiment tables", [r.test_id for r in solid_rows]),
        ("... with oxygen recorded", [r.test_id for r in with_o2]),
        ("... with pressure recorded", [r.test_id for r in with_p]),
        ("... near a habitat candidate (downloadable as rows)", sorted(near_psi)),
    ]
    paper_steps = [
        ("Solid burns near a habitat candidate, described in papers (human-verified)", sorted(near_paper)),
        ("... of those, available as rows in PSI tables", []),
    ]
    out_psi = [
        {"label": lab, "count": _count_value(registry, f"gap:psi:{i}", len(ids), m, {"step": lab}, ids)}
        for i, (lab, ids) in enumerate(psi_steps)
    ]
    out_paper = [
        {"label": lab, "count": _count_value(registry, f"gap:paper:{i}", len(ids), m, {"step": lab}, ids)}
        for i, (lab, ids) in enumerate(paper_steps)
    ]
    pending = len(findings_status["awaiting_verification"])
    return {
        "psi_steps": out_psi,
        "paper_steps": out_paper,
        "paper_findings_awaiting_verification": value(
            pending,
            "findings",
            registry.add(
                Prov(
                    id="gap:pending",
                    source_type="derived",
                    method="count of findings awaiting human verification",
                    method_version="1",
                    inputs=sorted(findings_status["awaiting_verification"]),
                )
            ),
        ),
        "note": "Paper-derived burns appear only after a named team member verifies the quote and page.",
    }


def _label_counts(registry: Registry, prefix: str, recs: list[TestRecord], field: str) -> dict[str, dict[str, Any]]:
    """Counts of each verbatim label, each with the ids of the tests carrying it."""
    by: dict[str, list[str]] = {}
    for r in recs:
        by.setdefault(str(_v(r, field)), []).append(r.test_id)
    return {
        k: _count_value(registry, f"{prefix}:{k}", len(ids), f"count of tests with {field} {k!r} (verbatim)", {}, ids)
        for k, ids in sorted(by.items())
    }


def flex_suppression(registry: Registry, records: list[TestRecord], bands: dict[str, Any]) -> dict[str, Any]:
    flex = [r for r in records if r.investigation_id == "PSI-69"]
    lo, hi = bands["near_10_4_psi_mmhg"]

    def mmhg(r: TestRecord) -> float | None:
        k = _v(r, "pressure_kpa")
        return None if k is None else k / KPA_PER_MMHG

    in_band = [r for r in flex if (p := mmhg(r)) is not None and lo <= p <= hi]
    groups = []
    for i, g in enumerate(bands["co2_groups"]):
        sel = [
            r
            for r in in_band
            if _v(r, "o2_pct") is not None
            and _v(r, "co2_pct") is not None
            and g["o2_pct"][0] <= _v(r, "o2_pct") <= g["o2_pct"][1]
            and g["co2_pct"][0] <= _v(r, "co2_pct") <= g["co2_pct"][1]
            and (_v(r, "he_pct") or 0) == 0
        ]
        ext = [r for r in sel if _v(r, "outcome_label") == bands["extinguished_label"]]
        labels = _label_counts(registry, f"flex:co2:{i}:label", sel, "outcome_label")
        groups.append(
            {
                "label": g["label"],
                "total": _count_value(
                    registry,
                    f"flex:co2:{i}:total",
                    len(sel),
                    "FLEX CO2 group count",
                    {**g, "pressure_mmhg": [lo, hi]},
                    [r.test_id for r in sel],
                ),
                "extinguished": _count_value(
                    registry,
                    f"flex:co2:{i}:ext",
                    len(ext),
                    "FLEX CO2 group count with outcome label 'Extinction'",
                    {**g, "pressure_mmhg": [lo, hi]},
                    [r.test_id for r in ext],
                ),
                "outcome_labels": labels,
            }
        )
    hb = bands["high_o2_no_suppressant"]
    high = [
        r
        for r in flex
        if (p := mmhg(r)) is not None
        and hb["pressure_mmhg"][0] <= p <= hb["pressure_mmhg"][1]
        and _v(r, "o2_pct") is not None
        and hb["o2_pct"][0] <= _v(r, "o2_pct") <= hb["o2_pct"][1]
        and _v(r, "suppressant") == "none"
    ]
    high_labels = _label_counts(registry, "flex:high:label", high, "outcome_label")
    high_fuels = _label_counts(registry, "flex:high:fuel", high, "fuel")
    high_ext = [r for r in high if _v(r, "outcome_label") == bands["extinguished_label"]]
    band_id = registry.add(
        Prov(
            id="flex:band:limits",
            source_type="derived",
            method="FLEX pressure band limits converted from mmHg (mmhg_to_kpa, kpa_to_psi)",
            method_version="1",
            params={"pressure_mmhg": [lo, hi]},
            note="Band frozen in redshift/params.json before any count was run.",
        )
    )
    zero_p = [r.test_id for r in flex if _v(r, "pressure_kpa") is None]
    return {
        "band_mmhg": [lo, hi],
        "band_kpa": [value(lo * KPA_PER_MMHG, "kPa", band_id), value(hi * KPA_PER_MMHG, "kPa", band_id)],
        "band_psi": [
            value(lo * KPA_PER_MMHG / psi_to_kpa(1.0), "psi", band_id),
            value(hi * KPA_PER_MMHG / psi_to_kpa(1.0), "psi", band_id),
        ],
        "in_band": _count_value(
            registry,
            "flex:band",
            len(in_band),
            "FLEX tests in pressure band",
            {"pressure_mmhg": [lo, hi]},
            [r.test_id for r in in_band],
        ),
        "groups": groups,
        "high_o2_no_suppressant": {
            "total": _count_value(
                registry,
                "flex:high:total",
                len(high),
                "FLEX high-O2 no-suppressant count",
                hb,
                [r.test_id for r in high],
            ),
            "outcome_labels": high_labels,
            "fuels": high_fuels,
            "extinguished": _count_value(
                registry,
                "flex:high:ext",
                len(high_ext),
                "FLEX high-O2 count with outcome label 'Extinction'",
                hb,
                [r.test_id for r in high_ext],
            ),
        },
        "pressure_not_recorded": zero_p,
        "annotation": "CO2 at 35% or more is far beyond what a crew can breathe; these tests show "
        "suppression chemistry, not a cabin atmosphere.",
        "p": registry.add(
            Prov(
                id="flex:suppression",
                source_type="derived",
                method="FLEX suppression table",
                method_version="1",
                params=bands,
            )
        ),
    }


def trade_map(registry: Registry, evidence: list[Evidence]) -> dict[str, Any]:
    """Binned glyphs for the trade map. Tests at identical recorded (O2, pressure) for the same fuel class
    and source type share one glyph; the count and the test ids travel with it. Tests whose pressure is
    not recorded are listed in O2-only strips, never placed on the plane."""
    bins: dict[tuple[str, str, float, float], list[Evidence]] = {}
    strips: dict[tuple[str, str], dict[float, list[Evidence]]] = {}
    other_basis: list[Evidence] = []
    for e in evidence:
        if e.o2_pct is not None and e.o2_basis not in {"ambient", "chamber initial"}:
            other_basis.append(e)
            continue
        if e.o2_pct is not None and e.pressure_kpa is not None:
            key = (e.fuel_class, e.source_type, round(e.o2_pct, 2), round(e.pressure_kpa, 2))
            bins.setdefault(key, []).append(e)
        elif e.o2_pct is not None:
            strips.setdefault((e.fuel_class, e.source_type), {}).setdefault(round(e.o2_pct, 1), []).append(e)
        elif e.o2_list and e.pressure_kpa is None:
            for v in sorted(set(e.o2_list)):
                strips.setdefault((e.fuel_class, e.source_type), {}).setdefault(round(v, 1), []).append(e)
    points = []
    for key, evs in sorted(bins.items()):
        fc, st, o2, kpa = key
        ids = sorted(e.id for e in evs)
        pid = registry.add(
            Prov(
                id=f"map:bin:{fc}:{st}:{o2}:{kpa}",
                source_type="derived",
                method="trade map bin (identical recorded O2 and pressure)",
                method_version="1",
                inputs=ids,
            )
        )
        invs = sorted({e.investigation for e in evs})
        points.append(
            {
                "fuel_class": fc,
                "source_type": st,
                "o2_pct": o2,
                "pressure_kpa": kpa,
                "pressure_psi": round(kpa / psi_to_kpa(1.0), 4),
                "n": len(evs),
                "test_ids": ids[:50],
                "investigations": invs,
                "outcomes": dict(
                    sorted(
                        {
                            str(k): sum(1 for e in evs if e.outcome_label == k) for k in {e.outcome_label for e in evs}
                        }.items()
                    )
                ),
                "p": pid,
            }
        )
    strip_out = []
    for (fc, st), by_o2 in sorted(strips.items()):
        items = []
        for o2, evs in sorted(by_o2.items()):
            ids = sorted(e.id for e in evs)
            pid = registry.add(
                Prov(
                    id=f"map:strip:{fc}:{st}:{o2}",
                    source_type="derived",
                    method="O2 recorded, pressure not recorded",
                    method_version="1",
                    inputs=ids,
                )
            )
            items.append(
                {
                    "o2_pct": o2,
                    "n": len(evs),
                    "investigations": sorted({e.investigation for e in evs}),
                    "test_ids": ids[:50],
                    "p": pid,
                }
            )
        unit = "sessions" if fc == "emulator" else "tests"
        strip_out.append({"fuel_class": fc, "source_type": st, "unit": unit, "items": items})
    ob_id = registry.add(
        Prov(
            id="map:other_basis",
            source_type="derived",
            method="inverse flames (O2 in burner stream, not the atmosphere)",
            method_version="1",
            inputs=sorted(e.id for e in other_basis),
        )
    )
    return {
        "points": points,
        "strips": strip_out,
        "inverse_flames": value(len(other_basis), "tests", ob_id),
        "p": registry.add(Prov(id="map", source_type="derived", method="trade map layers", method_version="1")),
    }


def investigation_stats(registry: Registry, records: list[TestRecord]) -> dict[str, dict[str, Any]]:
    """Per-investigation summary: test count, ranges of recorded conditions, fuels, materials, outcome labels.
    Each range is registered with the ids of the tests that set its minimum and maximum."""
    out: dict[str, dict[str, Any]] = {}
    by_inv: dict[str, list[TestRecord]] = {}
    for r in records:
        by_inv.setdefault(r.investigation_id, []).append(r)
    for inv, recs in sorted(by_inv.items()):
        stats: dict[str, Any] = {}
        ids = sorted(r.test_id for r in recs)
        stats["n_tests"] = _count_value(registry, f"stats:{inv}:n", len(recs), "tests in canonical table", {}, ids)
        for f, unit in (
            ("o2_pct", "%"),
            ("pressure_kpa", "kPa"),
            ("pressure_psi", "psi"),
            ("flow_cm_s", "cm/s"),
            ("co2_pct", "%"),
            ("he_pct", "%"),
        ):
            vals = [(r.fields[f]["v"], r) for r in recs if f in r.fields and r.fields[f]["v"] is not None]
            recorded = len(vals)
            rid = registry.add(
                Prov(
                    id=f"stats:{inv}:{f}:n",
                    source_type="derived",
                    method=f"tests with {f} recorded",
                    method_version="1",
                    inputs=sorted(r.test_id for _, r in vals),
                )
            )
            if not vals:
                stats[f] = {"recorded": value(0, "tests", rid), "min": None, "max": None}
                continue
            lo = min(vals, key=lambda t: (t[0], t[1].test_id))
            hi = max(vals, key=lambda t: (t[0], t[1].test_id))
            stats[f] = {
                "recorded": value(recorded, "tests", rid),
                "min": value(lo[0], unit, lo[1].fields[f]["p"]),
                "max": value(hi[0], unit, hi[1].fields[f]["p"]),
            }
        for f in ("fuel", "material", "outcome_label", "suppressant", "diluent"):
            counts: dict[str, int] = {}
            for r in recs:
                v = r.fields.get(f, {}).get("v")
                if v is not None:
                    counts[str(v)] = counts.get(str(v), 0) + 1
            cid = registry.add(
                Prov(
                    id=f"stats:{inv}:{f}",
                    source_type="derived",
                    method=f"count of {f} labels (verbatim)",
                    method_version="1",
                    inputs=ids,
                )
            )
            stats[f + "_counts"] = {"labels": dict(sorted(counts.items())), "p": cid}
        out[inv] = stats
    return out
