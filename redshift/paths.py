"""Repository paths, resolved from this file so the pipeline runs from any working directory."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
PSI_RAW = RAW / "psi"
MANIFEST = RAW / "MANIFEST.json"
PAPERS = DATA / "papers"
# The hosted API (web/api/index.py) reads the site's published snapshot, the same files the site serves, so
# the live answers and the pages can never disagree (D46). The pipeline itself always writes data/processed.
PROCESSED = Path(os.environ["REDSHIFT_DATA_DIR"]) if os.environ.get("REDSHIFT_DATA_DIR") else DATA / "processed"
FINDINGS = DATA / "findings"
SNAPSHOT = ROOT / "web" / "public" / "data"
PARAMS = ROOT / "redshift" / "params.json"


def rel(path: Path) -> str:
    """Path relative to the repository root, with forward slashes, for provenance records."""
    return path.resolve().relative_to(ROOT).as_posix()
