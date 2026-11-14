"""Ask the evidence: live answers grounded only in the built dataset, checked by code before anyone sees them.

How it stays honest:
1. Retrieval: the context is built from the built files only (the probe payload for the point being asked
   about, the access gap, verified paper findings and the investigation list). Every number in it is a
   value with provenance, given a slot id such as v3.
2. The model may not write a number. It writes slots ({{v3}}) and cites ids from the context. This is the
   same rule as the cached, human-checked templates in data/ai (see redshift/ai/text.py).
3. A deterministic post-check rejects the answer if it contains a bare number, a slot that is not in the
   context, a citation that is not in the context, banned wording (safe, recommend, best atmosphere ...),
   or no statement of what the data does not cover. A rejected answer is never shown.

The model is called only when ANTHROPIC_API_KEY (or another credential the Anthropic SDK resolves) is set
on the API host and the optional 'ai' extra is installed (uv sync --extra ai). Otherwise /ask says live
answers are unavailable and the website shows its cached answers.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable
from typing import Any

from redshift.ai.text import BANNED, BARE_NUMBER

MODEL = "claude-opus-5-5"
SLOT = re.compile(r"\{\{\s*(v\d+)\s*\}\}")

SYSTEM = "\n".join(
    [
        "You answer questions about microgravity fire tests for engineers choosing a cabin atmosphere for a lunar",
        "habitat. You use ONLY the JSON context in the user message. It comes from the Redshift dataset, built from",
        "NASA's Physical Sciences Informatics (PSI) experiment tables and human-verified papers.",
        "",
        "Rules, all of which a program checks before your answer is shown:",
        "- Never write a digit as a number. Every number you mention must be written as a slot from context.values,",
        '  for example "{{v3}} tests". Identifiers such as PSI-69, O2, CO2 or FLEX-2 are fine as written.',
        "- Each paragraph must cite at least one id that appears in the context: a test id, an investigation id",
        "  (PSI-n), a DOI or a finding id. Put citations in the cites array, not in the text.",
        "- Do not rank, score or recommend an atmosphere. Never call anything safe, unsafe, safer or dangerous. If",
        "  the question asks which atmosphere to choose, say that Redshift does not recommend an atmosphere, then",
        "  describe what evidence exists and what is missing.",
        '- Empty means unknown: say "no tests recorded", never that an absence means low risk.',
        "- Flame temperature explains how hot a flame can get; it does not predict ignition or spread.",
        "- Outcome labels are verbatim; do not interpret them.",
        "- not_covered must say plainly, without any number or slot, what the data does not cover for this",
        '  question. Say "PSI does not cover this" when that is true.',
        "- British English, short plain sentences, no em dashes. Two or three paragraphs at most.",
    ]
)

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "paragraphs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"text": {"type": "string"}, "cites": {"type": "array", "items": {"type": "string"}}},
                "required": ["text", "cites"],
                "additionalProperties": False,
            },
        },
        "not_covered": {"type": "string"},
    },
    "required": ["paragraphs", "not_covered"],
    "additionalProperties": False,
}


class Context:
    """Retrieved context: values with slot ids, plus the citable ids."""

    def __init__(self) -> None:
        self.values: dict[str, dict[str, Any]] = {}
        self.ids: set[str] = set()
        self.body: dict[str, Any] = {}

    def slot(self, val: dict[str, Any] | None, label: str) -> str | None:
        if not val or not isinstance(val.get("v"), int | float) or isinstance(val.get("v"), bool):
            return None
        sid = f"v{len(self.values) + 1}"
        self.values[sid] = {"v": val["v"], "u": val.get("u"), "p": val["p"], "label": label}
        return sid

    def for_model(self) -> str:
        values = {k: {"value": v["v"], "unit": v["u"], "what": v["label"]} for k, v in self.values.items()}
        return json.dumps({"values": values, **self.body}, ensure_ascii=False, sort_keys=True)


def build_context(
    probe: dict[str, Any], gap: dict[str, Any], findings: list[dict[str, Any]], investigations: list[dict[str, Any]]
) -> Context:
    c = Context()
    node = probe["node"]
    point = {
        "o2": c.slot(node["o2_pct"], "oxygen of the point asked about, %"),
        "pressure_psi": c.slot(node["pressure_psi"], "pressure of the point asked about, psi"),
        "pressure_kpa": c.slot(node["pressure_kpa"], "pressure of the point asked about, kPa"),
        "candidate_atmosphere": probe.get("candidate_id"),
        "nearness_step_multiplier_slot": c.slot(
            {"v": probe["multiplier"], "u": "x", "p": "params:nearness"}, "nearness step multiplier"
        ),
    }
    near = {
        fc: {st: c.slot(v, f"tests near the point, {fc}, from {st.replace('_', ' ')}") for st, v in by.items()}
        for fc, by in probe["near"].items()
    }
    o2m = {
        fc: c.slot(v, f"{fc} tests whose O2 matches but whose pressure is not recorded")
        for fc, v in probe["o2_match_pressure_unknown"].items()
    }
    tests = []
    for t in probe["near_tests"][:30]:
        c.ids.add(t["test_id"])
        c.ids.add(t["investigation_id"])
        if t.get("doi"):
            c.ids.add(t["doi"])
        tests.append(
            {
                "id": t["test_id"],
                "investigation": t["investigation"],
                "investigation_id": t["investigation_id"],
                "fuel_class": t["fuel_class"],
                "label": t["label"],
                "doi": t.get("doi"),
                "o2": c.slot(t["o2"], f"O2 of test {t['test_id']}"),
                "pressure_kpa": c.slot(t["pressure_kpa"], f"pressure of test {t['test_id']}, kPa"),
            }
        )
    ft = probe["flame_temperature"]
    flame = {
        "value": c.slot(ft.get("value"), "adiabatic flame temperature of stoichiometric methane, K"),
        "exact_for_this_point": ft["exact"],
        "note": ft["note"],
    }
    gap_steps = [
        {"step": s["label"], "count": c.slot(s["count"], f"access gap: {s['label']}")} for s in gap.get("psi_steps", [])
    ]
    paper_steps = [
        {"step": s["label"], "count": c.slot(s["count"], f"access gap: {s['label']}")}
        for s in gap.get("paper_steps", [])
    ]
    pending = c.slot(gap.get("paper_findings_awaiting_verification"), "paper findings awaiting human verification")
    verified = []
    for f in findings:
        c.ids.add(f["id"])
        verified.append(
            {
                "id": f["id"],
                "investigation": f.get("investigation"),
                "finding": (f.get("finding") or {}).get("v"),
                "page": f.get("page"),
                "ntrs": f.get("ntrs_id"),
                "doi": f.get("doi"),
            }
        )
    invs = []
    for i in investigations:
        c.ids.add(i["id"])
        doi = (i.get("doi") or {}).get("v")
        if doi:
            c.ids.add(doi)
        invs.append({"id": i["id"], "acronym": (i.get("acronym") or {}).get("v"), "doi": doi})
    c.body = {
        "point": point,
        "tests_near_by_fuel_class_and_source": near,
        "o2_matches_pressure_not_recorded": o2m,
        "nearest_tests": tests,
        "flame_temperature": flame,
        "prebreathe": probe["prebreathe"],
        "access_gap_psi_tables": gap_steps,
        "access_gap_papers": paper_steps,
        "paper_findings_awaiting_verification": pending,
        "verified_paper_findings": verified,
        "investigations": invs,
    }
    return c


def check(answer: dict[str, Any], ctx: Context) -> list[str]:
    """Problems that block the answer. Empty list means it may be shown."""
    problems: list[str] = []
    paras = answer.get("paragraphs") or []
    if not paras:
        problems.append("no paragraphs")
    texts = [p.get("text", "") for p in paras] + [answer.get("not_covered", "")]
    for t in texts:
        for sid in SLOT.findall(t):
            if sid not in ctx.values:
                problems.append(f"slot {sid} is not in the context")
        bare = SLOT.sub(" ", t)
        for m in BARE_NUMBER.finditer(bare):
            problems.append(f"number {m.group(0)!r} written outside a slot")
        b = BANNED.search(bare)
        if b:
            problems.append(f"banned wording {b.group(0)!r}")
        if chr(0x2014) in t:  # the house style forbids the em dash; written as a code point so this file has none
            problems.append("em dash")
    for p in paras:
        cites = p.get("cites") or []
        if not cites:
            problems.append("paragraph without a citation")
        for cid in cites:
            if cid not in ctx.ids:
                problems.append(f"citation {cid!r} is not in the context")
    if not (answer.get("not_covered") or "").strip():
        problems.append("no statement of what the data does not cover")
    if SLOT.search(answer.get("not_covered") or ""):
        problems.append("numbers belong in the paragraphs, not in what the data does not cover")
    return problems


def render(answer: dict[str, Any], ctx: Context) -> dict[str, Any]:
    """Text and value segments; every value keeps its provenance id for the website's source popover."""
    paras = []
    for p in answer["paragraphs"]:
        segs: list[dict[str, Any]] = []
        pos = 0
        text = p["text"]
        for m in SLOT.finditer(text):
            if m.start() > pos:
                segs.append({"t": text[pos : m.start()]})
            v = ctx.values[m.group(1)]
            segs.append({"val": {k: v[k] for k in ("v", "u", "p") if v.get(k) is not None}})
            pos = m.end()
        if pos < len(text):
            segs.append({"t": text[pos:]})
        paras.append({"segments": segs, "cites": p["cites"]})
    return {"status": "answered", "paragraphs": paras, "not_covered": answer["not_covered"], "problems": []}


ModelCall = Callable[[str, str], dict[str, Any] | None]


def call_claude(question: str, context_json: str) -> dict[str, Any] | None:
    """One Messages API call with structured output. Returns the parsed answer, or None if refused."""
    import anthropic  # optional dependency: uv sync --extra ai

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": f"Context (JSON):\n{context_json}\n\nQuestion: {question}"}],
    )
    if response.stop_reason == "refusal":
        return None
    text = next((b.text for b in response.content if b.type == "text"), None)
    return json.loads(text) if text else None


def live_available() -> bool:
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def answer(question: str, ctx: Context, call: ModelCall | None = None) -> dict[str, Any]:
    if call is None:
        if not live_available():
            return {
                "status": "unavailable",
                "paragraphs": [],
                "not_covered": None,
                "problems": ["no model credential on this server"],
            }
        call = call_claude
    draft = call(question, ctx.for_model())
    if draft is None:
        return {
            "status": "rejected",
            "paragraphs": [],
            "not_covered": None,
            "problems": ["the model declined to answer"],
        }
    problems = check(draft, ctx)
    if problems:
        return {"status": "rejected", "paragraphs": [], "not_covered": None, "problems": problems[:10]}
    return render(draft, ctx)
