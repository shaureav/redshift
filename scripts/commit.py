"""Commit all changes with dulwich (pure-Python git), used because this machine has no git binary.

Usage: uv run python scripts/commit.py "message"
"""

import sys
from pathlib import Path

from dulwich import porcelain
from dulwich.repo import Repo

ROOT = Path(__file__).resolve().parent.parent
AUTHOR = b"Project Redshift <redshift-team@users.noreply.github.com>"
TRAILER = "\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n"


def main() -> int:
    msg = sys.argv[1]
    if not (ROOT / ".git").exists():
        Repo.init(str(ROOT))
    repo = Repo(str(ROOT))
    porcelain.add(repo)
    st = porcelain.status(repo)
    removed = [p.decode() if isinstance(p, bytes) else p for p in st.unstaged]
    for p in removed:
        if not (ROOT / p).exists():
            porcelain.rm(repo, [str(ROOT / p)], cached=True)
    sha = porcelain.commit(repo, message=(msg + TRAILER).encode(), author=AUTHOR, committer=AUTHOR)
    print(sha.decode() if isinstance(sha, bytes) else sha)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
