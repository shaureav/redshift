"""FastAPI service for researchers: uv run uvicorn redshift.api.app:app

Serves exactly the files written by `python -m redshift.build` (data/processed). It filters and slices
them but never computes a new number, so the API, the static snapshot and the website always agree.
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
from pydantic import BaseModel

from redshift.paths import PROCESSED

app = FastAPI(
    title="Redshift API",
    version="1.0",
    description="Microgravity fire evidence near candidate lunar habitat atmospheres, with provenance on every "
    "value. Every numeric value is an object {v, u, p}: value, unit and a provenance id resolvable at "
    "/provenance/{id}. Data: NASA Physical Sciences Informatics (cite each investigation by DOI).",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


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
