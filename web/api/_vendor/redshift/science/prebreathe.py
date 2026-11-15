"""Prebreathe: only NASA's published points, each with its quote and page. No interpolation.

A point appears only when a paper finding of kind 'prebreathe' has been verified by a named team member.
Until then the layer lists the pending figures and shows nothing on the map. Source: NASA's 2022 Exploration
Atmospheres briefing (NTRS 20220011152, p. 6), which gives figures for all three habitat candidates.
"""

from __future__ import annotations

import re
from typing import Any

from redshift.papers.findings import CheckedFinding, register
from redshift.provenance import Prov, Registry, value


def build(registry: Registry, findings: list[CheckedFinding]) -> dict[str, Any]:
    from redshift.export.evidence import load_paper_map
    from redshift.quotes import normalise

    by_id = {cf.id: cf for cf in findings}
    points = []
    for m in load_paper_map()["prebreathe"]:
        cf = by_id.get(m["finding"])
        if cf is None:
            raise KeyError(f"prebreathe mapping cites unknown finding {m['finding']}")
        # Every time written in the display text must appear in the quote.
        for tok in re.findall(r"\d+:\d\d", m["duration_text"]):
            if tok not in normalise(cf.draft["quote"]):
                raise ValueError(f"prebreathe text {tok} not in quote of {m['finding']}")
        if not cf.verified:
            continue
        pid = register(registry, cf)
        vals = {v["name"]: v for v in cf.draft.get("values", [])}
        points.append(
            {
                "finding_id": cf.id,
                "atmosphere": m["atmosphere"],
                "pressure_psi": value(vals[m["pressure_psi"]]["value"], "psi", pid),
                "o2_pct": value(vals[m["o2_pct"]]["value"], "%", pid),
                "duration_text": m["duration_text"],
                "quote": cf.draft["quote"],
                "page": cf.draft["page"],
                "ntrs_id": cf.draft.get("ntrs_id"),
                "p": pid,
            }
        )
    have = {p["atmosphere"] for p in points}
    pending = []
    for m in load_paper_map()["prebreathe"]:
        if m["atmosphere"] not in have:
            pending.append(
                {
                    "atmosphere": m["atmosphere"],
                    "finding_id": m["finding"],
                    "status": "published figure found; awaiting human verification",
                }
            )
    pid = registry.add(
        Prov(
            id="prebreathe:layer",
            source_type="derived",
            method="prebreathe layer",
            method_version="1",
            note="Published points only; never interpolated.",
        )
    )
    return {
        "points": points,
        "pending": pending,
        "p": pid,
        "caveat": "NASA labels these 'Unvalidated estimates (i.e., not yet available for flight use)' and "
        "assumes a 6 h EVA at 4.3 psia (NTRS 20220011152, p. 6).",
    }
