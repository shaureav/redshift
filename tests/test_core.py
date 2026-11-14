"""Unit and property tests for units, transforms, nearness, quotes and the provenance lint."""

from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from redshift import transforms as T
from redshift import units
from redshift.export.lint import lint
from redshift.quotes import QuoteNotFound, find_line, normalise
from redshift.science.nearness import Evidence, Steps, classify, distance

PARAMS = {
    "o2_step_pct_points": 5.0,
    "pressure_step_log": 1.25,
    "flow_step_cm_s": 10.0,
    "threshold": 1.5,
    "o2_basis_counted": ["ambient", "chamber initial"],
}

# ---------- units ----------


def test_exact_constants() -> None:
    assert units.KPA_PER_ATM == 101.325
    assert math.isclose(units.KPA_PER_MMHG, 0.13332236842105263, rel_tol=1e-15)
    assert math.isclose(units.KPA_PER_MMHG, 0.133322, abs_tol=1e-6)  # brief's rounded value
    assert math.isclose(units.KPA_PER_PSI, 6.894757293168361, rel_tol=1e-15)
    assert math.isclose(units.from_kpa(101.325, "psi"), 14.6959, abs_tol=1e-4)  # brief's rounded value
    assert math.isclose(units.to_kpa(760, "mmHg"), 101.325, rel_tol=1e-12)


@given(st.floats(min_value=1e-3, max_value=1e4, allow_nan=False))
def test_pressure_round_trip(v: float) -> None:
    for u in units.UNIT_TO_KPA:
        assert math.isclose(units.from_kpa(units.to_kpa(v, u), u), v, rel_tol=1e-12)


@given(st.floats(min_value=1e-3, max_value=1e4, allow_nan=False))
def test_psi_kpa_round_trip(v: float) -> None:
    assert math.isclose(units.kpa_to_psi(units.psi_to_kpa(v)), v, rel_tol=1e-12)


def test_unknown_unit_is_a_bug() -> None:
    with pytest.raises(ValueError):
        units.to_kpa(1.0, "torr")


def test_fraction_to_pct_no_float_artefacts() -> None:
    assert units.fraction_to_pct(0.23) == 23.0
    assert units.fraction_to_pct(0.35) == 35.0


# ---------- transforms ----------


@pytest.mark.parametrize(
    "raw,expected", [("21", 21.0), (" 0.5 ", 0.5), (".33", 0.33), ("-0.28", -0.28), ("1e3", 1000.0)]
)
def test_number_accepts_plain_numbers(raw: str, expected: float) -> None:
    v, applied = T.number(raw)
    assert v == expected
    assert "parse_number" in applied


@pytest.mark.parametrize("raw", ["~6", "RAMP", "RAMPED", "037 mm", "#VALUE!", "21% O2", "n/a", "1,000"])
def test_number_refuses_anything_else(raw: str) -> None:
    with pytest.raises(T.NotClean):
        T.number(raw)


def test_empty_becomes_null() -> None:
    assert T.number("  ") == (None, ["trim", "empty_to_null"])


def test_percent_strips_only_one_trailing_sign() -> None:
    assert T.percent("26.5%")[0] == 26.5
    assert T.percent("3400%")[0] == 3400.0  # range check happens later and flags it; never "fixed" to 34
    with pytest.raises(T.NotClean):
        T.percent("~21% O2")


def test_stated_unit_only_when_it_matches() -> None:
    v, applied = T.pressure_kpa("0.75 atm ", "atm")
    assert math.isclose(v or 0, 0.75 * 101.325) and "strip_stated_unit" in applied
    with pytest.raises(T.NotClean):
        T.pressure_kpa("0.75 bar", "atm")
    with pytest.raises(T.NotClean):
        T.pressure_kpa("about 1 atm", "atm")


def test_every_applied_transform_is_allowed() -> None:
    for fn, raw in [(T.number, " 5 "), (T.percent, "21%"), (T.fraction_as_pct, "0.21")]:
        _, applied = fn(raw)
        assert set(applied) <= set(T.ALLOWED)
    _, applied = T.pressure_kpa("760", "mmHg")
    assert set(applied) <= set(T.ALLOWED)


# ---------- nearness ----------


def ev(o2: float | None, p: float | None, basis: str | None = "ambient", flow: float | None = None) -> Evidence:
    return Evidence(
        id="t",
        investigation_id="X",
        investigation="X",
        fuel_class="gas",
        source_type="psi_table",
        o2_pct=o2,
        pressure_kpa=p,
        flow_cm_s=flow,
        o2_basis=basis,
        label="",
    )


def test_distance_zero_at_target() -> None:
    s = Steps.from_params(PARAMS)
    assert distance(ev(34, 56.5), 34, 56.5, s) == 0


def test_one_step_each_axis() -> None:
    s = Steps.from_params(PARAMS)
    assert math.isclose(distance(ev(39, 56.5), 34, 56.5, s) or 0, 1.0)
    assert math.isclose(distance(ev(34, 56.5 * 1.25), 34, 56.5, s) or 0, 1.0)
    assert math.isclose(distance(ev(39, 56.5 * 1.25), 34, 56.5, s) or 0, math.sqrt(2))


def test_unknown_is_never_not_near() -> None:
    s = Steps.from_params(PARAMS)
    assert classify(ev(None, 70), 34, 56.5, s, PARAMS["o2_basis_counted"])[0] == "unknown_o2"
    assert classify(ev(34, None), 34, 56.5, s, PARAMS["o2_basis_counted"])[0] == "unknown_pressure"
    assert classify(ev(None, None), 34, 56.5, s, PARAMS["o2_basis_counted"])[0] == "unknown_both"


def test_inverse_flames_are_not_counted() -> None:
    s = Steps.from_params(PARAMS)
    state, _ = classify(ev(34, 56.5, basis="oxidiser stream (inverse flame)"), 34, 56.5, s, PARAMS["o2_basis_counted"])
    assert state == "basis_differs"


def test_flow_only_when_both_sides_have_it() -> None:
    s = Steps.from_params(PARAMS)
    assert distance(ev(34, 56.5, flow=50), 34, 56.5, s) == 0  # target has no flow
    assert math.isclose(distance(ev(34, 56.5, flow=10), 34, 56.5, s, target_flow=0) or 0, 1.0)


@given(st.floats(10, 100), st.floats(10, 300))
def test_distance_symmetric_in_o2(o2: float, p: float) -> None:
    s = Steps.from_params(PARAMS)
    a = distance(ev(o2, p), 34, 56.5, s)
    b = distance(ev(68 - o2, p), 34, 56.5, s)
    assert a is not None and b is not None and math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12)


# ---------- quotes ----------


def test_bre_candidate_quote_is_in_raw_file() -> None:
    line = find_line(
        "data/raw/psi/ACME-BRE/ACME-BRE.md", "14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen"
    )
    assert line == 26


def test_missing_quote_raises() -> None:
    with pytest.raises(QuoteNotFound):
        find_line("data/raw/psi/ACME-BRE/ACME-BRE.md", "9.5 psia, 40 % oxygen")


def test_normalise_ligatures_and_whitespace() -> None:
    assert normalise("ﬂame  spread\n rate") == "flame spread rate"


# ---------- provenance lint ----------


def test_lint_catches_bare_numbers() -> None:
    n, fails = lint({"a": {"v": 3, "p": "x"}, "b": 4}, {"x"})
    assert n == 2 and len(fails) == 1 and fails[0].startswith("$.b")


def test_lint_rejects_unknown_ids() -> None:
    _, fails = lint({"a": {"v": 3, "p": "nope"}}, {"x"})
    assert fails


def test_lint_allows_container_provenance_and_structural_keys() -> None:
    n, fails = lint({"grid": [[1, 2], [3, 4]], "p": "g", "rows": [5, 6]}, {"g"})
    assert n == 4 and not fails
