"""AI-assisted text: summaries and cached answers, made safe by construction.

AI-drafted text lives in data/ai/*.json as templates. A template may not contain any number of its own;
every number enters through a slot such as {{candidate_evidence.json#evidence[candidate_id=c8_2_34].near_total}},
which the build resolves to a provenance-carrying value from the published data. The deterministic
checker rejects a template if:
1. it contains a bare number outside a slot (digits inside names such as O2, CO2 or FLEX-2 are allowed);
2. a slot does not resolve to a {v, u, p} value;
3. it uses a banned word (safe, unsafe, dangerous) or recommends anything;
4. it cites a test id, investigation id or finding id that does not exist;
5. an answer lacks a "not covered" statement.
Segments that cite paper findings are shown only when those findings are human-verified.
A named team member then checks each text (scripts/check_ai_text.py); the UI labels every text
"AI-assisted" and shows whether a person has checked it.
"""

from __future__ import annotations

import json
import re
from typing import Any

from redshift.paths import DATA

AI_DIR = DATA / "ai"
SLOT = re.compile(r"\{\{([^}]+)\}\}")
BARE_NUMBER = re.compile(r"(?<![A-Za-z0-9\-_])\d+(?:[.,:]\d+)*(?![A-Za-z0-9])")
BANNED = re.compile(r"\b(safe|safer|safest|unsafe|dangerous|recommend\w*|should choose|best atmosphere)\b", re.I)
SELECTOR = re.compile(r"^([A-Za-z_][\w]*)(?:\[(\w+)=([^\]]+)\])?$")


def resolve(payloads: dict[str, Any], ref: str) -> Any:
    """Resolve 'file.json#a.b[key=val].c' against the published payloads."""
    if "#" not in ref:
        raise KeyError(f"slot {ref!r} has no '#'")
    name, path = ref.split("#", 1)
    node: Any = payloads[name]
    for part in path.split("."):
        m = SELECTOR.match(part)
        if not m:
            raise KeyError(f"bad slot path segment {part!r} in {ref!r}")
        key, sel_k, sel_v = m.groups()
        node = node[key]
        if sel_k is not None:
            matches = [x for x in node if str(x.get(sel_k)) == sel_v]
            if len(matches) != 1:
                raise KeyError(f"selector [{sel_k}={sel_v}] matched {len(matches)} items in {ref!r}")
            node = matches[0]
    return node


def check_template(text: str, payloads: dict[str, Any]) -> list[str]:
    problems = []
    stripped = SLOT.sub(" ", text)
    for m in BARE_NUMBER.finditer(stripped):
        problems.append(f"bare number {m.group(0)!r} outside a slot")
    if BANNED.search(stripped):
        problems.append(f"banned wording: {BANNED.search(stripped).group(0)!r}")  # type: ignore[union-attr]
    for ref in SLOT.findall(text):
        try:
            v = resolve(payloads, ref.strip())
        except (KeyError, IndexError, TypeError) as exc:
            problems.append(f"slot does not resolve: {exc}")
            continue
        if not (isinstance(v, dict) and "v" in v and "p" in v):
            problems.append(f"slot {ref!r} is not a provenance value")
    return problems


def render(text: str, payloads: dict[str, Any]) -> list[dict[str, Any]]:
    """Split into text and value segments; values keep their provenance for the UI popover."""
    out: list[dict[str, Any]] = []
    pos = 0
    for m in SLOT.finditer(text):
        if m.start() > pos:
            out.append({"t": text[pos : m.start()]})
        v = resolve(payloads, m.group(1).strip())
        out.append({"val": {k: v[k] for k in ("v", "u", "p") if k in v}})
        pos = m.end()
    if pos < len(text):
        out.append({"t": text[pos:]})
    return out


def _load(name: str) -> list[dict[str, Any]]:
    path = AI_DIR / name
    return json.loads(path.read_text(encoding="utf-8"))["items"] if path.exists() else []


def _checks(name: str) -> dict[str, dict[str, Any]]:
    path = AI_DIR / "checks.json"
    log = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    return {e["item_id"]: e for e in log if e.get("file") == name}


def build(payloads: dict[str, Any], verified_findings: set[str], known_ids: set[str]) -> dict[str, Any]:
    """Check and render every AI text item. Returns the payload and a list of rejected items."""
    out: dict[str, Any] = {}
    rejected: list[dict[str, Any]] = []
    for name in ("summaries.json", "qa.json"):
        checks = _checks(name)
        items = []
        for it in _load(name):
            segs_out = []
            problems: list[str] = []
            for seg in it["segments"]:
                problems += check_template(seg["text"], payloads)
                for c in seg.get("cites", []):
                    if c not in known_ids:
                        problems.append(f"unknown citation {c}")
            if name == "qa.json" and not it.get("not_covered"):
                problems.append("answer has no 'not covered' statement")
            if it.get("not_covered"):
                problems += check_template(it["not_covered"], payloads)
            if problems:
                rejected.append({"file": name, "id": it["id"], "problems": problems})
                continue
            for seg in it["segments"]:
                needs = seg.get("requires_verified", [])
                if any(f not in verified_findings for f in needs):
                    if seg.get("pending_text"):
                        segs_out.append({"segments": [{"t": seg["pending_text"]}], "cites": [], "pending": True})
                    continue
                segs_out.append({"segments": render(seg["text"], payloads), "cites": seg.get("cites", [])})
            chk = checks.get(it["id"])
            items.append(
                {
                    "id": it["id"],
                    "target": it.get("target"),
                    "question": it.get("question"),
                    "paragraphs": segs_out,
                    "not_covered": it.get("not_covered"),
                    "ai_assisted": True,
                    "human_checked": bool(chk and chk.get("decision") == "accept"),
                    "checked_by": chk.get("checked_by") if chk and chk.get("decision") == "accept" else None,
                    "checked_at": chk.get("checked_at") if chk and chk.get("decision") == "accept" else None,
                }
            )
        out[name.replace(".json", "")] = items
    return {"ai": out, "rejected": rejected}
