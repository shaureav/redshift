# One command to check everything: make check
UV ?= uv
NPM ?= npm

.PHONY: build test lint check web api emdash

build:
	$(UV) run python -m redshift.build

test:
	$(UV) run pytest -q

lint:
	$(UV) run ruff check redshift tests scripts
	$(UV) run mypy
	cd web && $(NPM) run typecheck && $(NPM) run lint

emdash:
	$(UV) run python scripts/no_em_dash.py

check: build test lint emdash
	cd web && $(NPM) run test && $(NPM) run build

web:
	cd web && $(NPM) run dev

api:
	$(UV) run uvicorn redshift.api.app:app --reload
