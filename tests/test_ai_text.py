"""The AI-text checker must reject bare numbers, banned wording and unresolvable slots."""

from __future__ import annotations

from redshift.ai.text import check_template, render

PAYLOADS = {"x.json": {"items": [{"id": "a", "n": {"v": 17, "u": "tests", "p": "near:a"}}], "label": "plain"}}


def test_accepts_slots_and_formula_names() -> None:
    assert check_template("FLEX-2 and CO2 show {{x.json#items[id=a].n}} tests.", PAYLOADS) == []


def test_rejects_bare_numbers() -> None:
    assert check_template("There were 17 tests at 34% O2.", PAYLOADS)
    assert check_template("It burned at 8.2 psi.", PAYLOADS)


def test_rejects_banned_words() -> None:
    assert check_template("This atmosphere is safe.", PAYLOADS)
    assert check_template("We recommend this atmosphere.", PAYLOADS)


def test_rejects_unresolvable_or_non_value_slots() -> None:
    assert check_template("{{x.json#items[id=zzz].n}}", PAYLOADS)
    assert check_template("{{x.json#label}}", PAYLOADS)


def test_render_keeps_provenance() -> None:
    segs = render("Count: {{x.json#items[id=a].n}}.", PAYLOADS)
    assert segs[1] == {"val": {"v": 17, "u": "tests", "p": "near:a"}}
