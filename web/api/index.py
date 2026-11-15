"""Redshift's API on Vercel, at /api/* on the same site (D46): the live "Ask the evidence" endpoint (/api/ask)
and the read-only endpoints of redshift/api/app.py.

The Python package is a copy kept in web/api/_vendor by web/scripts/vendor-api.mjs (npm test fails if it falls
behind redshift/), and the data are the site's own published snapshot (web/public/data), so a live answer reads
exactly the files the pages show. Live answers need ANTHROPIC_API_KEY in the Vercel project's environment
variables; without it /api/ask says live answers are unavailable and the site keeps its checked, cached answers.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "_vendor"))
os.environ.setdefault("REDSHIFT_DATA_DIR", str(HERE.parent / "public" / "data"))

from fastapi import FastAPI  # noqa: E402

from redshift.api.app import app as redshift_app  # noqa: E402

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api", redshift_app)
