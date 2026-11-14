"""Repository paths, resolved from this file so the pipeline runs from any working directory."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
PSI_RAW = RAW / "psi"
MANIFEST = RAW / "MANIFEST.json"
PAPERS = DATA / "papers"
PROCESSED = DATA / "processed"
FINDINGS = DATA / "findings"
SNAPSHOT = ROOT / "web" / "public" / "data"
PARAMS = ROOT / "redshift" / "params.json"


def rel(path: Path) -> str:
    """Path relative to the repository root, with forward slashes, for provenance records."""
    return path.resolve().relative_to(ROOT).as_posix()
