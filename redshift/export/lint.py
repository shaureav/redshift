"""Provenance lint: every number in every published payload must be traceable.

A number passes if the nearest enclosing object (including itself when it is the 'v' of a value object)
has a 'p' key whose value is a provenance id present in the registry. Structural keys listed in
STRUCTURAL (row numbers, page numbers, pagination) are exempt because they are themselves provenance.
"""

from __future__ import annotations

from typing import Any

STRUCTURAL = {"source_row", "row", "page", "rows", "line", "duplicate_of", "schema_version", "total_pages",
              "page_size", "multiplier", "target_flow_cm_s", "physical_lines", "header_lines", "records_in",
              "blank_excluded", "duplicates_removed", "non_test_excluded", "tests_out", "blank_excluded_lines"}


def lint(payload: Any, known: set[str], path: str = "$") -> tuple[int, list[str]]:
    """Return (numbers checked, list of failures)."""
    failures: list[str] = []
    checked = 0

    def walk(node: Any, p: str, prov: str | None, key: str | None) -> None:
        nonlocal checked
        if isinstance(node, dict):
            here = node.get("p") if isinstance(node.get("p"), str) else prov
            for k, v in node.items():
                if k == "p":
                    continue
                walk(v, f"{p}.{k}", here, k)
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{p}[{i}]", prov, key)
        elif isinstance(node, bool) or node is None or isinstance(node, str):
            return
        elif isinstance(node, int | float):
            if key in STRUCTURAL:
                return
            checked += 1
            if prov is None:
                failures.append(f"{p}: number without provenance")
            elif prov not in known:
                failures.append(f"{p}: provenance id {prov!r} not in registry")

    walk(payload, path, None, None)
    return checked, failures
