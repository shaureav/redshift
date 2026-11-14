"""Extract per-page text from the paper PDFs, for the automatic quote check.

Run: uv run python scripts/extract_pdf_text.py [NTRS-<id> ...]
Writes data/papers/text/NTRS-<id>/page-NNN.txt (1-based PDF page order, as pypdf reads it).
The extracted text is committed, so quote checks are reproducible even without the PDFs.
Text keeps pypdf's artefacts (split words such as "establishe d"); quotes are matched against this text
after the typographic normalisation in redshift/quotes.py, and a person verifies each quote against the PDF.
"""

from __future__ import annotations

import sys
from pathlib import Path

from pypdf import PdfReader
from pypdf._configuration import overwrite_configuration

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / "data" / "papers"

# Raised limits: these NTRS PDFs embed large image and content streams that exceed pypdf's defaults.
overwrite_configuration(
    stream_parsing_work_maximum_count=50_000_000,
    zlib_maximum_output_length=500_000_000,
    stream_decoding_work_maximum_length=2_000_000_000,
)


def main(only: list[str]) -> int:
    for pdf in sorted(PAPERS.glob("NTRS-*.pdf")):
        name = pdf.stem
        if only and name not in only:
            continue
        out = PAPERS / "text" / name
        out.mkdir(parents=True, exist_ok=True)
        reader = PdfReader(str(pdf))
        for i, page in enumerate(reader.pages, 1):
            try:
                text = page.extract_text() or ""
            except Exception as exc:  # noqa: BLE001 - record and continue; the page then has no text
                print(f"could not extract {name} page {i}: {exc}")
                text = ""
            (out / f"page-{i:03d}.txt").write_text(text, encoding="utf-8")
        print(f"{name}: {len(reader.pages)} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
