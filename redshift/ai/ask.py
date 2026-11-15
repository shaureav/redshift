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

import functools
import json
import os
import re
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from redshift.ai.text import BANNED, BARE_NUMBER

MODEL = "claude-opus-5-5"
SLOT = re.compile(r"\{\{\s*(v\d+)\s*\}\}")

# D49: what may follow a value. The page draws every value with its own unit, so the same unit written after it
# is said twice ("55.2 kPa kPa") and is removed. A different unit right after it means the number was put to
# another quantity (a count of tests "at 0 tests cm/s"), and the answer is rejected.
UNIT_WORDS: dict[str, tuple[str, ...]] = {
    "%": ("percent", "per cent", "pct", "%"),
    "K": ("kelvin", "K"),
    "kPa": ("kPa",),
    "psi": ("psia", "psi"),
}
# A count (unit "tests" or "findings") is drawn as a bare number on the page (components/AskBox.tsx), so the noun the
# model writes after it is its own and stays. "psi" is matched in lower case only: "PSI" is NASA's Physical Sciences
# Informatics (PSI-69, "PSI tables"), not a pressure.
MEASURE_UNIT = re.compile(
    r"\s*(%|percent\b|per cent\b|kelvin\b|K\b|°C|kPa\b|(?-i:psia?)(?![\w-])|cm/s|mm/s|m/s|seconds?\b|minutes?\b"
    r"|min\b|mm\b|cm\b|kW\b|ppm\b|atm\b)",
    re.I,
)
# A draft that fails the check is sent back once with its faults, if the first answer came quickly enough to stay
# well inside the host's 60 s (web/vercel.json).
RETRY_WITHIN_S = 20.0
# Every model call for one question ends by then (the host stops the function at 60 s).
ANSWER_WITHIN_S = 55.0


def tidy_units(text: str, ctx: Context) -> str:
    """Remove a unit written again right after a value that is drawn with it ("{{v3}} kPa" when v3 is in kPa)."""
    out: list[str] = []
    pos = 0
    for m in SLOT.finditer(text):
        out.append(text[pos : m.end()])
        pos = m.end()
        unit = (ctx.values.get(m.group(1)) or {}).get("u") or ""
        for word in UNIT_WORDS.get(unit, ()):
            tail = r"(?![\w/])" if word[-1].isalnum() else ""
            same = re.match(r"\s*" + re.escape(word) + tail, text[pos:], 0 if word.startswith("psi") else re.I)
            if same:
                pos += same.end()
                break
    out.append(text[pos:])
    return "".join(out)


def unit_clashes(text: str, ctx: Context) -> list[str]:
    """Values followed by a unit that is not their own: the number was put to another quantity."""
    found = []
    for m in SLOT.finditer(text):
        v = ctx.values.get(m.group(1))
        after = MEASURE_UNIT.match(text, m.end())
        if v is None or after is None:
            continue
        said = after.group(1).lower()
        own = [w.lower() for w in UNIT_WORDS.get(v.get("u") or "", ())]
        if said not in own:
            found.append(f"value {m.group(1)} ({v.get('label')}) is followed by the unit {after.group(1)!r}")
    return found

SYSTEM = "\n".join(
    [
        "You answer questions about microgravity fire tests for engineers choosing a cabin atmosphere for a lunar",
        "habitat. You use ONLY the JSON context in the user message. It comes from the Redshift dataset, built from",
        "NASA's Physical Sciences Informatics (PSI) experiment tables and human-verified papers.",
        "",
        "Rules, all of which a program checks before your answer is shown:",
        "- Never write a digit as a number. Every number you mention must be written as a slot from context.values,",
        '  for example "{{v3}} solid burn rows". Identifiers such as PSI-69, O2, CO2 or FLEX-2 are fine as written.',
        "- The page shows a pressure, an oxygen share or a temperature slot with its unit (kPa, psi, %, K), so never",
        "  write that unit after the slot. A count slot is shown as a bare number, so say what it counts.",
        "- Each paragraph must cite at least one id that appears in the context: a test id, an investigation id",
        "  (PSI-n), a DOI or a finding id. Put citations in the cites array, not in the text.",
        "- Do not rank or score an atmosphere, and do not advise which to pick. Only when the question asks which",
        '  atmosphere to choose, say that "Redshift leaves that choice to the people responsible for it", then',
        "  describe what evidence exists and what is missing. Otherwise do not write that sentence.",
        "- Use a slot only for the exact quantity its label in context.values names, for the same test, investigation",
        "  or finding. Never use a slot for a different quantity. If no slot names the quantity the question asks",
        "  about, say the context does not give it rather than use a nearby slot.",
        "- Name an investigation or finding only where the context ties it to what you say about it.",
        "- These words are rejected by the checker wherever they appear, even in a negative sentence, so never write",
        '  them: "safe", "safer", "safest", "unsafe", "dangerous", any word starting with "recommend", "should',
        '  choose", "best atmosphere".',
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
        problems.extend(unit_clashes(p.get("text", ""), ctx))
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


# D48: Google's Gemini may answer instead of Claude, chosen by which key the host has (GEMINI_API_KEY first). The
# prompt, the context, the answer schema and the post-check are the same, so the same rules hold whichever writes it.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest")
# Tried next when Google reports the first model overloaded or rate limited (503, 429, 500) or does not answer in
# time. On 15 November 2026 gemini-flash-latest returned 503 or nothing, and gemini-flash-lite-latest
# answered in 2 to 3 s.
GEMINI_FALLBACK = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-flash-latest")
CHOICE_SENTENCE = "Redshift leaves that choice to the people responsible for it."
CHOICE_QUESTION = re.compile(r"\b(choose|chose|choice|pick|select|should|best|which atmosphere|recommend\w*)\b", re.I)
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _gemini_schema(node: Any) -> Any:
    """The answer schema as Gemini's responseSchema takes it: the same shape, without additionalProperties."""
    if isinstance(node, dict):
        return {k: _gemini_schema(v) for k, v in node.items() if k != "additionalProperties"}
    if isinstance(node, list):
        return [_gemini_schema(v) for v in node]
    return node


def call_gemini(question: str, context_json: str, deadline: float | None = None) -> dict[str, Any] | None:
    """One generateContent call with a JSON answer. Returns the parsed answer, or None if Gemini declined.
    With a deadline (time.monotonic()), no try runs past it, so a retried answer still ends inside the host's limit."""
    prompt = "Context (JSON):" + chr(10) + context_json + chr(10) * 2 + "Question: " + question
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": _gemini_schema(SCHEMA)},
    }
    data: dict[str, Any] = {}
    models = [GEMINI_MODEL] + ([GEMINI_FALLBACK] if GEMINI_FALLBACK and GEMINI_FALLBACK != GEMINI_MODEL else [])
    for k, model in enumerate(models):
        req = urllib.request.Request(
            GEMINI_URL.format(model=model),
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]},
            method="POST",
        )
        last = k + 1 == len(models)
        # An overloaded model can take about 30 s just to answer 503, so the first try is cut short: the fallback
        # then still fits inside the host's 60 s limit.
        timeout = 40.0 if last else 12.0
        if deadline is not None:
            left = deadline - time.monotonic()
            if left < 2:
                raise TimeoutError("no time left for the model")
            timeout = min(timeout, left)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                data = json.loads(res.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as err:
            if err.code in (429, 500, 503) and not last:
                continue
            raise
        except (TimeoutError, urllib.error.URLError):
            if not last:
                continue
            raise
    cands = data.get("candidates") or []
    if not cands or cands[0].get("finishReason") in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}:
        return None
    parts = (cands[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    return json.loads(text) if text else None


def live_available() -> bool:
    if os.environ.get("GEMINI_API_KEY"):
        return True
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def live_model() -> str | None:
    """The model family that answers live on this host, for the page to name (D49), or None. Never the key."""
    if os.environ.get("GEMINI_API_KEY"):
        return "Gemini"
    return "Claude" if live_available() else None


def answer(question: str, ctx: Context, call: ModelCall | None = None) -> dict[str, Any]:
    if call is None:
        if not live_available():
            return {
                "status": "unavailable",
                "paragraphs": [],
                "not_covered": None,
                "problems": ["no model credential on this server"],
            }
        if os.environ.get("GEMINI_API_KEY"):
            call = functools.partial(call_gemini, deadline=time.monotonic() + ANSWER_WITHIN_S)
        else:
            call = call_claude
    started = time.monotonic()
    try:
        draft = call(question, ctx.for_model())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, OSError) as err:
        # The model service failed or sent no usable JSON: say so, never show a half answer. No key is logged.
        return {
            "status": "unavailable",
            "paragraphs": [],
            "not_covered": None,
            "problems": [f"the live model could not be reached ({type(err).__name__})"],
        }
    if draft is None:
        return {
            "status": "rejected",
            "paragraphs": [],
            "not_covered": None,
            "problems": ["the model declined to answer"],
        }
    _tidy(draft, question, ctx)
    problems = check(draft, ctx)
    # The Claude call has no deadline of its own, so only a bounded call (Gemini, or a test's stub) is retried.
    if problems and call is not call_claude and time.monotonic() - started < RETRY_WITHIN_S:
        # D49: one more draft, told exactly what failed. It passes the same check or nothing is shown.
        again = (
            question
            + chr(10) * 2
            + "(A first draft of this answer was rejected by the evidence check for: "
            + "; ".join(problems[:6])
            + ". Write the answer again without these faults.)"
        )
        try:
            redo = call(again, ctx.for_model())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, OSError):
            redo = None
        if redo is not None:
            _tidy(redo, question, ctx)
            if not check(redo, ctx):
                return render(redo, ctx)
    if problems:
        return {"status": "rejected", "paragraphs": [], "not_covered": None, "problems": problems[:10]}
    return render(draft, ctx)


def _tidy(draft: dict[str, Any], question: str, ctx: Context) -> None:
    """Code-only clean-ups before the check: no word of the model's is changed, only removed."""
    keep_choice = bool(CHOICE_QUESTION.search(question))
    for para in draft.get("paragraphs") or []:
        if isinstance(para, dict) and isinstance(para.get("text"), str):
            text = para["text"]
            if not keep_choice:
                # The model sometimes opens every answer with the choice sentence; it belongs only to a question
                # about choosing.
                text = text.replace(CHOICE_SENTENCE, "").strip()
            para["text"] = tidy_units(text, ctx)
    draft["paragraphs"] = [p for p in draft.get("paragraphs") or [] if not isinstance(p, dict) or p.get("text")]
