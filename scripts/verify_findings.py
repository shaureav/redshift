"""Verify paper findings one by one. Run: uv run python scripts/verify_findings.py

For each finding that passed the automatic checks and has not been verified yet, this shows the source
PDF, the page, the exact quote and the numbers taken from it. Open the PDF at that page, read the quote,
and answer:
  y  the quote is on that page and the finding sentence and every number match it
  n  something is wrong (you will be asked what)
  s  skip for now
  q  quit
Each answer is appended to data/findings/verifications.json with your name and the time. Nothing is
ever deleted from that file; a later answer for the same finding replaces the earlier one in the build.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from redshift.papers.findings import load_checked  # noqa: E402
from redshift.paths import FINDINGS  # noqa: E402

LOG = FINDINGS / "verifications.json"


def main() -> int:
    name = input("Your name (as it should appear in the app): ").strip()
    if not name:
        print("A name is required.")
        return 1
    log = json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else []
    todo = [f for f in load_checked() if f.passes_checks and f.verification is None]
    print(f"\n{len(todo)} findings to check.\n")
    for f in todo:
        d = f.draft
        print("=" * 72)
        print(f"{d['id']}  ({d.get('investigation')}, {d.get('kind')})")
        print(f"Source: {d['source_file']}   page {d['page']}   NTRS {d.get('ntrs_id')}")
        print(f"\nFinding: {d['finding']}\n")
        print(f"Quote:   \"{d['quote']}\"\n")
        for v in d.get("values", []):
            print(f"  {v['name']}: {v['value']} {v.get('unit') or ''}   (written as \"{v['as_written']}\")")
        ans = input("\nCorrect? [y/n/s/q] ").strip().lower()
        if ans == "q":
            break
        if ans not in {"y", "n"}:
            continue
        entry = {
            "finding_id": d["id"], "decision": "accept" if ans == "y" else "reject",
            "verified_by": name, "verified_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        if ans == "n":
            entry["note"] = input("What is wrong? ").strip()
        log.append(entry)
        LOG.parent.mkdir(parents=True, exist_ok=True)
        LOG.write_text(json.dumps(log, indent=2) + "\n", encoding="utf-8")
        print("Saved.")
    print("\nDone. Rebuild with: uv run python -m redshift.build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
