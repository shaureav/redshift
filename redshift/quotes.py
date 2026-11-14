"""Deterministic quote checks: a quote is accepted only if it occurs verbatim in its source."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from redshift.paths import ROOT

_WS = re.compile(r"\s+")

# Typographic substitutions applied to BOTH the quote and the source before matching. Each is listed so
# the matching rule is auditable; none changes a digit, a unit or a word.
NORMALISATIONS = {
    "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl",
    "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "−": "-", " ": " ",
}


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    for a, b in NORMALISATIONS.items():
        text = text.replace(a, b)
    return _WS.sub(" ", text).strip()


class QuoteNotFound(Exception):
    pass


def find_line(relfile: str, quote: str) -> int:
    """Physical line (1-based) of a text file on which ``quote`` occurs verbatim (after normalise)."""
    lines = (ROOT / relfile).read_text(encoding="utf-8").splitlines()
    q = normalise(quote)
    for i, line in enumerate(lines, start=1):
        if q in normalise(line):
            return i
    raise QuoteNotFound(f"quote not found in {relfile}: {quote!r}")


def quote_on_page(page_text: str, quote: str) -> bool:
    return normalise(quote) in normalise(page_text)


def page_text(pdf_text_dir: Path, page: int) -> str:
    return (pdf_text_dir / f"page-{page:03d}.txt").read_text(encoding="utf-8")
