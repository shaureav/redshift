"""FastAPI service for researchers: uv run uvicorn redshift.api.app:app

Serves exactly the files written by `python -m redshift.build` (data/processed). It filters and slices
them but never computes a new number, so the API, the static snapshot and the website always agree.
/probe reads the build's probe grid; to list which tests are near a node it runs the pipeline's own
nearness rule and refuses to answer if that listing disagrees with the build's counts.
OpenAPI schema: /openapi.json; interactive docs: /docs.
"""

from __future__ import annotations

import io
import json
from functools import lru_cache
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from redshift.paths import PROCESSED
from redshift.science.nearness import FUEL_CLASSES, SOURCE_TYPES, Evidence, Steps, distance
from redshift.science.probe import unrle

app = FastAPI(
    title="Redshift API",
    version="1.0",
    description="Microgravity fire evidence near candidate lunar habitat atmospheres, with provenance on every "
    "value. Every numeric value is an object {v, u, p}: value, unit and a provenance id resolvable at "
    "/provenance/{id}. Data: NASA Physical Sciences Informatics (cite each investigation by DOI).",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


class Val(BaseModel):
    v: float | int | str | None
    u: str | None = None
    p: str


class Version(BaseModel):
    version: str
    retrieved: str
    content_sha256: str
    cite: str


class TestPage(BaseModel):
    total: Val
    offset: int
    limit: int
    tests: list[dict[str, Any]]


@lru_cache(maxsize=32)
def load(name: str) -> Any:
    path = PROCESSED / name
    if not path.exists():
        raise HTTPException(503, f"{name} not built; run python -m redshift.build")
    return json.loads(path.read_text(encoding="utf-8"))


def _tests() -> list[dict[str, Any]]:
    return list(load("tests.json")["tests"])


@app.get("/version", response_model=Version)
def version() -> dict[str, Any]:
    return dict(load("dataset_version.json"))


@app.get("/tests", response_model=TestPage)
def tests(
    investigation: str | None = None,
    fuel_class: Literal["gas", "droplet", "solid", "emulator", "none"] | None = None,
    has_pressure: bool | None = None,
    flagged: bool | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> dict[str, Any]:
    rows = _tests()
    if investigation:
        rows = [t for t in rows if t["investigation_id"] == investigation]
    if fuel_class:
        rows = [t for t in rows if t["fuel_class"] == fuel_class]
    if has_pressure is not None:
        rows = [t for t in rows if (t["fields"]["pressure_kpa"]["v"] is not None) == has_pressure]
    if flagged is not None:
        rows = [t for t in rows if bool(t["flags"]) == flagged]
    total = {
        "v": len(rows),
        "u": "tests",
        "p": "summary",
        "filter": {
            "investigation": investigation,
            "fuel_class": fuel_class,
            "has_pressure": has_pressure,
            "flagged": flagged,
        },
    }
    return {"total": total, "offset": offset, "limit": limit, "tests": rows[offset : offset + limit]}


@app.get("/tests/{test_id}")
def test(test_id: str) -> dict[str, Any]:
    for t in _tests():
        if t["test_id"] == test_id:
            prov = load("provenance.json")
            return {**t, "provenance": {f: prov.get(v["p"]) for f, v in t["fields"].items()}}
    raise HTTPException(404, "no such test")


@app.get("/provenance/{prov_id:path}")
def provenance(prov_id: str) -> dict[str, Any]:
    p = load("provenance.json").get(prov_id)
    if p is None:
        raise HTTPException(404, "no such provenance id")
    return dict(p)


@app.get("/investigations")
def investigations() -> dict[str, Any]:
    return dict(load("investigations.json"))


@app.get("/investigations/{inv_id}")
def investigation(inv_id: str) -> dict[str, Any]:
    for i in load("investigations.json")["investigations"]:
        if i["id"] == inv_id:
            return dict(i)
    raise HTTPException(404, "no such investigation")


@app.get("/compare")
def compare(ids: str = Query(..., description="2 to 4 comma-separated PSI ids, e.g. PSI-69,PSI-25")) -> dict[str, Any]:
    wanted = [s.strip() for s in ids.split(",") if s.strip()]
    if not 2 <= len(wanted) <= 4:
        raise HTTPException(422, "give 2 to 4 investigation ids")
    by_id = {i["id"]: i for i in load("investigations.json")["investigations"]}
    missing = [w for w in wanted if w not in by_id]
    if missing:
        raise HTTPException(404, f"unknown ids: {missing}")
    return {"investigations": [by_id[w] for w in wanted]}


@app.get("/candidates")
def candidates() -> dict[str, Any]:
    return dict(load("candidates.json"))


@app.get("/candidates/{cand_id}/dossier")
def candidate_dossier(cand_id: str) -> dict[str, Any]:
    cands = {c["id"]: c for c in load("candidates.json")["candidates"]}
    if cand_id not in cands:
        raise HTTPException(404, "no such candidate")
    ev = next(e for e in load("candidate_evidence.json")["evidence"] if e["candidate_id"] == cand_id)
    pb = [p for p in load("prebreathe.json")["points"] if p["atmosphere"] == cands[cand_id]["name"]]
    return {
        "candidate": cands[cand_id],
        "evidence": ev,
        "prebreathe": pb,
        "findings": load("key_findings.json")["findings"],
    }


@app.get("/materials/{name}/dossier")
def material_dossier(name: str) -> dict[str, Any]:
    rows = [
        t for t in _tests() if name in {t["fields"].get("material", {}).get("v"), t["fields"].get("fuel", {}).get("v")}
    ]
    if not rows:
        raise HTTPException(404, "no tests record that material or fuel label (labels are verbatim)")
    return {"material": name, "tests": rows, "total": {"v": len(rows), "u": "tests", "p": "summary"}}


@app.get("/trade-map")
def trade_map() -> dict[str, Any]:
    return {
        "map": load("trade_map.json"),
        "candidates": load("candidates.json")["candidates"],
        "evidence": load("candidate_evidence.json")["evidence"],
        "flame_temperature": load("flame_temperature_grid.json"),
        "prebreathe": load("prebreathe.json"),
    }


@app.get("/planner")
def planner(
    preset: Literal["balanced", "equal", "solids_only"] = "balanced", top: int = Query(30, ge=1, le=126)
) -> dict[str, Any]:
    g = load("planner_grid.json")
    cells = {c["id"]: c for c in g["cells"]}
    return {
        "preset": preset,
        "params": g["params"],
        "ranked": [cells[i] for i in g["rankings"][preset][:top]],
        "p": g["p"],
    }


@app.get("/quality")
def quality() -> dict[str, Any]:
    return dict(load("quality_report.json"))


class ProbeTest(BaseModel):
    test_id: str
    investigation_id: str
    investigation: str
    fuel_class: str
    source_type: str
    label: str
    doi: str | None
    o2: Val
    pressure_kpa: Val


class FlameAtProbe(BaseModel):
    value: Val | None
    exact: bool
    approximate: bool | None
    at: dict[str, Val] | None
    note: str


class ProbeResponse(BaseModel):
    requested: dict[str, float]
    inside_grid: bool
    node: dict[str, Val]
    multiplier: float
    candidate_id: str | None
    near: dict[str, dict[str, Val]]
    near_total: Val
    o2_match_pressure_unknown: dict[str, Val]
    unknown: dict[str, Val]
    near_tests: list[ProbeTest]
    flame_temperature: FlameAtProbe
    prebreathe: dict[str, Any]
    dataset_version: str


@lru_cache(maxsize=1)
def _grid() -> dict[str, Any]:
    g = load("probe_grid.json")
    n = g["axes"]["o2_pct"]["n"] * g["axes"]["pressure_psi"]["n"]
    layers = {}
    for layer in g["layers"]:
        series = {(fc, st): unrle(layer["near"][fc][st]["rle"]) for fc in FUEL_CLASSES for st in SOURCE_TYPES}
        assert all(len(s) == n for s in series.values()), "probe grid series length mismatch"
        layers[layer["multiplier"]] = {"series": series, "total": unrle(layer["total"]["rle"]), "raw": layer}
    return {"file": g, "layers": layers}


def _snap(values: list[float], v: float) -> int:
    step = values[1] - values[0]
    return max(0, min(len(values) - 1, round((v - values[0]) / step)))


@app.get("/probe", response_model=ProbeResponse)
def probe(
    o2: float = Query(..., ge=0, le=100, description="Oxygen, % by volume"),
    p: float = Query(..., gt=0, le=50, description="Cabin pressure, psi"),
    m: float = Query(1.0, description="Nearness step multiplier; one of the documented stops (0.75, 1, 1.5)"),
) -> dict[str, Any]:
    """Everything the evidence panel shows for one point of the plane, with provenance.

    The point snaps to the nearest node of the build's probe grid (O2 every 0.5 points, pressure every
    0.1 psi); `node` says which node is shown. Counts come from probe_grid.json. `near_tests` lists the
    tests counted, found with redshift.science.nearness; the endpoint fails rather than answer if the
    listing and the build's counts disagree.
    """
    G = _grid()
    g = G["file"]
    if m not in G["layers"]:
        raise HTTPException(422, f"m must be one of {sorted(G['layers'])}")
    L = G["layers"][m]
    o2s, psis, kpas = (
        g["axes"]["o2_pct"]["values"],
        g["axes"]["pressure_psi"]["values"],
        g["axes"]["pressure_kpa"]["values"],
    )
    i, j = _snap(o2s, o2), _snap(psis, p)
    idx = i * len(psis) + j
    ap = g["axes"]["p"]
    raw = L["raw"]
    near = {
        fc: {st: {"v": L["series"][(fc, st)][idx], "u": "tests", "p": raw["near"][fc][st]["p"]} for st in SOURCE_TYPES}
        for fc in FUEL_CLASSES
    }
    nz = g["nearness"]
    steps = Steps(o2=nz["o2_step"] * m, log_p=nz["log_pressure_step"] * m, flow=0.0, threshold=nz["threshold"])
    listed: list[tuple[float, dict[str, Any]]] = []
    for t in g["inputs"]:
        ev = Evidence(
            id=t["id"],
            investigation_id=t["investigation_id"],
            investigation=t["investigation"],
            fuel_class=t["fuel_class"],
            source_type=t["source_type"],
            o2_pct=t["o2"]["v"],
            pressure_kpa=t["kpa"]["v"],
            flow_cm_s=None,
            o2_basis="ambient",
            label=t["label"],
            o2_range=tuple(t["o2_range"]["v"]) if t.get("o2_range") else None,  # type: ignore[arg-type]
            pressure_range_kpa=tuple(t["pressure_range_kpa"]["v"]) if t.get("pressure_range_kpa") else None,  # type: ignore[arg-type]
        )
        d = distance(ev, o2s[i], kpas[j], steps)
        if d is not None and d <= steps.threshold:
            listed.append((d, t))
    listed.sort(key=lambda x: (x[0], x[1]["id"]))
    for fc in FUEL_CLASSES:
        for st in SOURCE_TYPES:
            n_listed = sum(1 for _, t in listed if t["fuel_class"] == fc and t["source_type"] == st)
            if n_listed != near[fc][st]["v"]:
                raise HTTPException(
                    500, f"probe listing disagrees with the build at {o2s[i]}% {psis[j]} psi ({fc}/{st})"
                )

    cands = load("candidates.json")["candidates"]
    cand = next((c for c in cands if c["o2_pct"]["v"] == o2s[i] and c["pressure_psi"]["v"] == psis[j]), None)
    if cand is not None:
        ev = next(e for e in load("candidate_evidence.json")["evidence"] if e["candidate_id"] == cand["id"])
        ft = ev["flame_temperature"]
        flame = {
            "value": {k: ft[k] for k in ("v", "u", "p")},
            "exact": True,
            "approximate": ft.get("approximate"),
            "at": None,
            "note": "Computed for this candidate atmosphere. Explains how hot a flame can get; "
            "does not predict ignition or spread.",
        }
    else:
        fg = load("flame_temperature_grid.json")
        xs, ys = fg["o2_pct"], fg["pressure_psi"]
        if xs[0] <= o2s[i] <= xs[-1] and ys[0] <= psis[j] <= ys[-1]:
            fi = min(range(len(xs)), key=lambda k: abs(xs[k] - o2s[i]))
            fj = min(range(len(ys)), key=lambda k: abs(ys[k] - psis[j]))
            flame = {
                "value": {"v": fg["temperature_K"][fj][fi], "u": "K", "p": fg["p"]},
                "exact": False,
                "approximate": fg["approximate"][fj][fi],
                "at": {
                    "o2_pct": {"v": xs[fi], "u": "%", "p": fg["p"]},
                    "pressure_psi": {"v": ys[fj], "u": "psi", "p": fg["p"]},
                },
                "note": "Nearest computed grid point; values between computed points are not interpolated.",
            }
        else:
            flame = {
                "value": None,
                "exact": False,
                "approximate": None,
                "at": None,
                "note": "Not computed at this point.",
            }
    pb = load("prebreathe.json")
    pb_point = next((x for x in pb["points"] if cand and x["atmosphere"] == cand["name"]), None)
    pb_pending = next((x for x in pb["pending"] if cand and x["atmosphere"] == cand["name"]), None)
    prebreathe = (
        {"status": "published", "point": pb_point, "caveat": pb["caveat"]}
        if pb_point
        else {"status": "awaiting_verification", "finding_id": pb_pending["finding_id"]}
        if pb_pending
        else {"status": "no_published_figure"}
    )
    return {
        "requested": {"o2_pct": o2, "pressure_psi": p},
        "inside_grid": o2s[0] <= o2 <= o2s[-1] and psis[0] <= p <= psis[-1],
        "node": {
            "o2_pct": {"v": o2s[i], "u": "%", "p": ap},
            "pressure_psi": {"v": psis[j], "u": "psi", "p": ap},
            "pressure_kpa": {"v": kpas[j], "u": "kPa", "p": ap},
        },
        "multiplier": m,
        "candidate_id": cand["id"] if cand else None,
        "near": near,
        "near_total": {"v": L["total"][idx], "u": "tests", "p": raw["total"]["p"]},
        "o2_match_pressure_unknown": {
            fc: {
                "v": raw["o2_match_pressure_unknown"][fc]["by_o2"][i],
                "u": "tests",
                "p": raw["o2_match_pressure_unknown"][fc]["p"],
            }
            for fc in FUEL_CLASSES
        },
        "unknown": g["unknown"],
        "near_tests": [
            {
                "test_id": t["id"],
                "investigation_id": t["investigation_id"],
                "investigation": t["investigation"],
                "fuel_class": t["fuel_class"],
                "source_type": t["source_type"],
                "label": t["label"],
                "doi": t["doi"],
                "o2": t["o2"],
                "pressure_kpa": t["kpa"],
            }
            for _, t in listed
        ],
        "flame_temperature": flame,
        "prebreathe": prebreathe,
        "dataset_version": load("dataset_version.json")["version"],
    }


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)
    o2: float = Field(34.0, ge=0, le=100)
    psi: float = Field(8.2, gt=0, le=50)
    m: float = 1.0


class AskResponse(BaseModel):
    status: Literal["answered", "rejected", "unavailable"]
    paragraphs: list[dict[str, Any]]
    not_covered: str | None
    problems: list[str]


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> dict[str, Any]:
    """Ask the evidence. Retrieves only from the built dataset around the given point, asks the model to answer
    in slots (it may not write numbers), and rejects any answer with a bare number, an unknown slot or citation,
    banned wording or no 'not covered' statement. Needs ANTHROPIC_API_KEY on this host; otherwise 'unavailable'."""
    from redshift.ai import ask as A

    p = probe(o2=req.o2, p=req.psi, m=req.m)
    findings = load("key_findings.json")["findings"]
    ctx = A.build_context(p, load("access_gap.json"), findings, load("investigations.json")["investigations"])
    return A.answer(req.question, ctx)


@app.get("/sensitivity")
def sensitivity() -> dict[str, Any]:
    return dict(load("sensitivity.json"))


@app.get("/export/{kind}", response_class=PlainTextResponse)
def export(kind: Literal["tests.csv", "flags.csv", "bibtex"]) -> str:
    if kind == "bibtex":
        out = io.StringIO()
        for i in load("investigations.json")["investigations"]:
            doi = (i.get("doi") or {}).get("v")
            title = (i.get("title") or {}).get("v") or i["id"]
            if doi:
                key = i["id"].replace("-", "")
                out.write(
                    f"@misc{{{key},\n  title = {{{title}}},\n  howpublished = {{NASA Physical Sciences "
                    f"Informatics}},\n  doi = {{{doi}}},\n  note = {{{i['id']}}}\n}}\n\n"
                )
        return out.getvalue()
    path = PROCESSED / kind
    return path.read_text(encoding="utf-8")
