"""Check AI-assisted summaries and cached answers one by one. Run: uv run python scripts/check_ai_text.py

Each text is shown exactly as the app will show it, numbers filled in from the data. Read it and answer:
  y  accurate, plain and fair: every number matches its source and nothing is overstated
  n  something is wrong (you will be asked what)
  s  skip;  q  quit
Answers are appended to data/ai/checks.json with your name and the time.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from redshift.paths import PROCESSED  # noqa: E402

LOG = ROOT / "data" / "ai" / "checks.json"


def show(seg: dict) -> str:
    out = []
    for s in seg["segments"]:
        if "t" in s:
            out.append(s["t"])
        else:
            v = s["val"]
            unit = v.get("u") if v.get("u") not in (None, "tests", "sessions", "findings") else ""
            out.append(f"[{v['v']}{' ' + unit if unit else ''}]")
    return "".join(out)


def main() -> int:
    name = input("Your name (as it should appear in the app): ").strip()
    if not name:
        return 1
    data = json.loads((PROCESSED / "ai_text.json").read_text(encoding="utf-8"))
    log = json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else []
    for file_key in ("summaries", "qa"):
        for it in data[file_key]:
            if it["human_checked"]:
                continue
            print("=" * 72)
            print(it["id"], "|", it.get("question") or it.get("target"))
            for para in it["paragraphs"]:
                print("\n" + show(para))
            print("\n" + (it.get("not_covered") or ""))
            print("\nNumbers in [brackets] come from the data; each one's source is shown in the app.")
            ans = input("\nAccurate and fair? [y/n/s/q] ").strip().lower()
            if ans == "q":
                return 0
            if ans not in {"y", "n"}:
                continue
            entry = {
                "file": f"{file_key}.json",
                "item_id": it["id"],
                "decision": "accept" if ans == "y" else "reject",
                "checked_by": name,
                "checked_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            if ans == "n":
                entry["note"] = input("What is wrong? ").strip()
            log.append(entry)
            LOG.write_text(json.dumps(log, indent=2) + "\n", encoding="utf-8")
    print("\nDone. Rebuild with: uv run python -m redshift.build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
