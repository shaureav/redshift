"""Paper findings: drafted by AI with exact quotes, checked by code, verified by a named person.

Three files under data/findings:
- drafts.json: AI-drafted findings. Each has an exact quote, a page number, a source PDF and the numbers
  it states (each with the substring of the quote that states it). Always verified=false.
- verifications.json: an append-only log written by scripts/verify_findings.py. Each entry records who
  checked which finding against the PDF, when, and whether they accepted it.
Only findings that pass the automatic checks AND have an accepting verification reach the UI.

Automatic checks (a draft failing any is rejected and listed in the quality report):
1. The quote occurs verbatim on the stated page of the extracted PDF text (after the typographic
   normalisation listed in redshift.quotes).
2. Every stated number's 'as_written' text occurs inside the quote, and the number itself occurs in it.
3. The finding text contains no banned words (safe, unsafe, dangerous, recommend).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from redshift.paths import FINDINGS, PAPERS, ROOT
from redshift.provenance import Prov, Registry, value
from redshift.quotes import normalise, quote_on_page

BANNED = re.compile(r"\b(safe|unsafe|dangerous)\b", re.I)
# "Recommend" may appear only when the finding reports a recommendation made in the quoted source itself.
RECOMMEND = re.compile(r"\brecommend(ed|s|ation)?\b", re.I)


@dataclass
class CheckedFinding:
    draft: dict[str, Any]
    problems: list[str] = field(default_factory=list)
    verification: dict[str, Any] | None = None

    @property
    def id(self) -> str:
        return str(self.draft["id"])

    @property
    def passes_checks(self) -> bool:
        return not self.problems

    @property
    def verified(self) -> bool:
        return self.passes_checks and self.verification is not None and self.verification.get("decision") == "accept"


def _load(name: str) -> list[dict[str, Any]]:
    path = FINDINGS / name
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data)


def text_dir(source_file: str) -> Path:
    return PAPERS / "text" / Path(source_file).stem


def check(draft: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    for key in ("id", "quote", "source_file", "finding"):
        if not draft.get(key):
            problems.append(f"missing field {key}")
    if problems:
        return problems
    if draft.get("page") is None:
        # Abstract-only records (no PDF on NTRS): the quote is checked against the saved abstract text.
        src = ROOT / draft["source_file"]
        if not draft["source_file"].endswith(".txt") or not src.exists():
            problems.append("no page number and no abstract text file")
        elif not quote_on_page(src.read_text(encoding="utf-8"), draft["quote"]):
            problems.append("quote not found verbatim in the abstract text")
        page_file = None
    else:
        page_file = text_dir(draft["source_file"]) / f"page-{int(draft['page']):03d}.txt"
    if page_file is None:
        pass
    elif not page_file.exists():
        problems.append(f"page text not found: {page_file.relative_to(ROOT).as_posix()}")
    elif not quote_on_page(page_file.read_text(encoding="utf-8"), draft["quote"]):
        problems.append("quote not found verbatim on the stated page")
    q = normalise(draft["quote"])
    for v in draft.get("values", []):
        aw = normalise(str(v.get("as_written", "")))
        if not aw or aw not in q:
            problems.append(f"value {v.get('name')}: as_written text not in quote")
            continue
        num = v.get("value")
        if not isinstance(num, int | float):
            problems.append(f"value {v.get('name')}: not a number")
            continue
        digits = re.findall(r"\d+(?:[.,]\d+)?", aw.replace(",", ""))
        if not any(float(d) == float(num) for d in digits):
            problems.append(f"value {v.get('name')}: {num} does not appear in {aw!r}")
    if BANNED.search(draft["finding"]):
        problems.append("finding text uses a banned word")
    if RECOMMEND.search(draft["finding"]) and not RECOMMEND.search(draft["quote"]):
        problems.append("finding says 'recommend' but the quote does not")
    return problems


def load_checked() -> list[CheckedFinding]:
    verifs: dict[str, dict[str, Any]] = {}
    for v in _load("verifications.json"):
        verifs[v["finding_id"]] = v  # the latest entry for a finding wins
    out = []
    for d in sorted(_load("drafts.json"), key=lambda d: d["id"]):
        out.append(CheckedFinding(draft=d, problems=check(d), verification=verifs.get(d["id"])))
    return out


def register(registry: Registry, cf: CheckedFinding) -> str:
    d = cf.draft
    ver = cf.verification or {}
    return registry.add(
        Prov(
            id=f"paper:{d['id']}",
            source_type="published_paper",
            file=d["source_file"],
            page=None if d.get("page") is None else int(d["page"]),
            quote=d["quote"],
            doi=d.get("doi"),
            ntrs=d.get("ntrs_id"),
            verified=cf.verified,
            verified_by=ver.get("verified_by") if cf.verified else None,
            verified_at=ver.get("verified_at") if cf.verified else None,
            note="AI-drafted from the paper; quote checked automatically; verified by a named team member.",
        )
    )


def public(registry: Registry, findings: list[CheckedFinding]) -> list[dict[str, Any]]:
    """Verified findings only, in the shape the UI uses."""
    out = []
    for cf in findings:
        if not cf.verified:
            continue
        pid = register(registry, cf)
        d = cf.draft
        out.append(
            {
                "id": d["id"],
                "investigation": d.get("investigation"),
                "kind": d.get("kind"),
                "finding": value(d["finding"], None, pid),
                "quote": d["quote"],
                "page": d["page"],
                "ntrs_id": d.get("ntrs_id"),
                "doi": d.get("doi"),
                "values": [
                    {"name": v["name"], **value(v["value"], v.get("unit"), pid), "as_written": v["as_written"]}
                    for v in d.get("values", [])
                ],
                "p": pid,
            }
        )
    return out


def status(findings: list[CheckedFinding]) -> dict[str, Any]:
    return {
        "drafted": len(findings),
        "failed_checks": [{"id": f.id, "problems": f.problems} for f in findings if not f.passes_checks],
        "awaiting_verification": [f.id for f in findings if f.passes_checks and f.verification is None],
        "rejected_by_reviewer": [
            f.id for f in findings if f.verification and f.verification.get("decision") != "accept"
        ],
        "verified": [f.id for f in findings if f.verified],
    }


def verify_queue(findings: list[CheckedFinding]) -> dict[str, Any]:
    """The review queue for the site's Verify page: every draft with its checks, its latest verification
    and the extracted text of its page, so a reviewer can read the quote in place before deciding.

    This is a review tool, not part of the dataset: it is written beside the snapshot but kept out of the
    dataset's version hash and the provenance lint, since its numbers are unverified drafts by design. A
    decision made on the page is downloaded as verifications.json and only reaches the app through the
    build, exactly as an answer to scripts/verify_findings.py does.
    """
    items = []
    for cf in findings:
        d = cf.draft
        page = d.get("page")
        text = None
        if page is not None:
            p = PAPERS / "text" / Path(str(d["source_file"])).stem / f"page-{int(page):03d}.txt"
            if p.exists():
                text = p.read_text(encoding="utf-8")
        items.append(
            {
                "id": cf.id,
                "investigation": d.get("investigation"),
                "kind": d.get("kind"),
                "finding": d["finding"],
                "quote": d["quote"],
                "page": page,
                "source_file": d["source_file"],
                "ntrs_id": d.get("ntrs_id"),
                "doi": d.get("doi"),
                "values": d.get("values", []),
                "problems": cf.problems,
                "verification": cf.verification,
                "page_text": text,
            }
        )
    log = _load("verifications.json")
    return {"note": "Review queue for the Verify page. Not part of the dataset.", "findings": items, "log": log}
