"""Fail if an em dash appears in code, UI text or our docs (house style). Raw data and quoted sources are exempt."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EM = chr(0x2014)
SCAN = [
    "redshift",
    "web/src",
    "scripts",
    "tests",
    "README.md",
    "docs/METHODS.md",
    "docs/EXPLAINER.md",
    "docs/REFERENCES.md",
    "docs/SUBMISSION.md",
    "docs/TEAM_TASKS.md",
    "docs/DECISIONS.md",
    "docs/OPEN_QUESTIONS.md",
]
EXT = {".py", ".ts", ".tsx", ".md", ".css", ".json"}


def main() -> int:
    hits = []
    for entry in SCAN:
        base = ROOT / entry
        files = [base] if base.is_file() else [p for p in base.rglob("*") if p.suffix in EXT] if base.exists() else []
        for f in files:
            for n, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                if EM in line:
                    hits.append(f"{f.relative_to(ROOT)}:{n}")
    if hits:
        print("em dash found:\n  " + "\n  ".join(hits))
        return 1
    print("no em dashes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
