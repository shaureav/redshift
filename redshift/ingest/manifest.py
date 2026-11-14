"""MANIFEST.json: size and SHA-256 of every raw file, verified on every build.

``python -m redshift.ingest.manifest --write`` creates the manifest once, when raw files are
added. The build only ever verifies it; any mismatch stops the build.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from redshift.paths import MANIFEST, PSI_RAW, RAW, rel

HARVEST_NOTE = (
    "Harvest by the team on 2026-11-14 from NASA Physical Sciences Informatics via the JSON endpoints the "
    "PSI site uses (see data/raw/psi/README.md). Shared as Redshift_PSI_Combustion.zip."
)
HARVEST_RETRIEVED = "2026-11-14"


class ManifestError(Exception):
    pass


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def raw_files() -> list[Path]:
    return sorted(
        p for p in RAW.rglob("*")
        if p.is_file() and p.name != "MANIFEST.json" and p.name != ".DS_Store"
    )


def _investigation_meta() -> dict[str, dict[str, str]]:
    """Folder name to PSI id, page URL and licence (licence read from each harvested page)."""
    out: dict[str, dict[str, str]] = {}
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            folder = row["folder"].rstrip("/")
            md = PSI_RAW / folder / f"{folder}.md"
            licence = "not shown"
            if md.exists():
                m = re.search(r"^\| License \| (.*) \|$", md.read_text(encoding="utf-8"), re.M)
                if m and m.group(1).strip() not in {"", "-", "—", "?"}:
                    licence = m.group(1).strip()
            out[folder] = {"psi_id": row["psi_id"], "url": row["psi_url"], "licence": licence}
    return out


def build() -> dict[str, Any]:
    meta = _investigation_meta()
    files = []
    for p in raw_files():
        r = rel(p)
        entry: dict[str, Any] = {"file": r, "size": p.stat().st_size, "sha256": sha256(p)}
        parts = p.relative_to(RAW).parts
        if parts[0] == "psi" and len(parts) > 2 and parts[1] in meta:
            m = meta[parts[1]]
            entry.update(investigation_id=m["psi_id"], source_url=m["url"], licence=m["licence"])
        elif parts[0] == "psi":
            entry.update(source_url="https://psi.nasa.gov/physci/repo/search?q=combustion",
                         licence="harvest index compiled by the team; underlying PSI records as listed")
        elif p.name == "psi_search_combustion.json":
            entry.update(source_url="https://psi.nasa.gov/physci/repo/search?q=combustion",
                         licence="PSI search metadata", retrieved="2026-11-14T08:11:29.891Z")
        elif parts[0] == "reference":
            entry.update(source_url="https://www.spaceappschallenge.org/ (Flame in Freefall challenge page)",
                         licence="NASA Space Apps Challenge public challenge text; quoted for reference")
        elif p.suffix == ".zip":
            entry.update(source_url="team harvest (see note)", licence="as per contained files")
        else:
            entry.update(source_url="unknown", licence="unknown")
        entry.setdefault("retrieved", HARVEST_RETRIEVED)
        files.append(entry)
    return {"note": HARVEST_NOTE, "files": files}


def verify() -> dict[str, Any]:
    """Check every raw file against the manifest. Raises ManifestError on any difference."""
    if not MANIFEST.exists():
        raise ManifestError("data/raw/MANIFEST.json is missing")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    listed = {f["file"]: f for f in manifest["files"]}
    on_disk = {rel(p): p for p in raw_files()}
    problems = []
    for name in sorted(set(listed) - set(on_disk)):
        problems.append(f"missing raw file: {name}")
    for name in sorted(set(on_disk) - set(listed)):
        problems.append(f"raw file not in manifest: {name}")
    for name in sorted(set(listed) & set(on_disk)):
        p = on_disk[name]
        if p.stat().st_size != listed[name]["size"] or sha256(p) != listed[name]["sha256"]:
            problems.append(f"hash or size mismatch: {name}")
    if problems:
        raise ManifestError("raw data integrity check failed:\n  " + "\n  ".join(problems))
    return manifest


def main(argv: list[str]) -> int:
    if "--write" in argv:
        if MANIFEST.exists() and "--force" not in argv:
            print("MANIFEST.json exists; refusing to overwrite without --force", file=sys.stderr)
            return 1
        MANIFEST.write_text(json.dumps(build(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"wrote {rel(MANIFEST)}")
        return 0
    verify()
    print("manifest OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
