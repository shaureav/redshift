"""All unit conversions used by Redshift.

Every pressure is stored internally in kPa. Constants are exact definitions:
- 1 atm is defined as exactly 101.325 kPa.
- 1 mmHg (conventional) is defined as exactly 101.325/760 kPa (0.1333224 kPa to 7 s.f.).
- 1 psi is exactly 0.45359237 kg x 9.80665 m/s^2 / (0.0254 m)^2, which is 6.894757293168361 kPa.
- 1 bar is exactly 100 kPa.
The brief quotes rounded values (14.6959 psi per atm, 0.133322 kPa per mmHg); the exact
definitions above agree with them to the stated precision and are used so that every
route between two units gives the same answer.
"""

from __future__ import annotations

KPA_PER_ATM: float = 101.325
KPA_PER_MMHG: float = 101.325 / 760.0
KPA_PER_BAR: float = 100.0
KPA_PER_PSI: float = 0.45359237 * 9.80665 / (0.0254**2) / 1000.0

UNIT_TO_KPA: dict[str, float] = {
    "kPa": 1.0,
    "atm": KPA_PER_ATM,
    "mmHg": KPA_PER_MMHG,
    "bar": KPA_PER_BAR,
    "psi": KPA_PER_PSI,
}


def to_kpa(value: float, unit: str) -> float:
    """Convert a pressure in ``unit`` to kPa."""
    try:
        factor = UNIT_TO_KPA[unit]
    except KeyError as exc:  # a pipeline bug, not a data problem
        raise ValueError(f"unknown pressure unit {unit!r}") from exc
    return value * factor


def from_kpa(value_kpa: float, unit: str) -> float:
    """Convert a pressure in kPa to ``unit``."""
    try:
        factor = UNIT_TO_KPA[unit]
    except KeyError as exc:
        raise ValueError(f"unknown pressure unit {unit!r}") from exc
    return value_kpa / factor


def kpa_to_psi(value_kpa: float) -> float:
    return value_kpa / KPA_PER_PSI


def psi_to_kpa(value_psi: float) -> float:
    return value_psi * KPA_PER_PSI


def fraction_to_pct(value: float) -> float:
    """Mole fraction (0 to 1) to percent (0 to 100).

    Rounded to 9 decimal places to remove binary floating-point artefacts (0.23 x 100 would otherwise
    be 23.000000000000004). No recorded value has more than 4 decimal places, so nothing is lost.
    """
    return round(value * 100.0, 9)


def round_sig(value: float, digits: int = 6) -> float:
    """Round for stable, deterministic output (not used for any comparison)."""
    if value == 0:
        return 0.0
    return float(f"{value:.{digits}g}")
