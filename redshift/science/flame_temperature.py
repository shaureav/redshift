"""Adiabatic flame temperature of stoichiometric methane, computed with Cantera and GRI-Mech 3.0.

Method: methane at equivalence ratio 1 in an O2/N2 mixture of the given O2 percentage, starting at
298.15 K and the given pressure, equilibrated at constant enthalpy and pressure (HP). The result explains
how hot a flame can get; it does not predict whether a material ignites or spreads. In our FLEX check,
flame temperature separated outcomes no better than the O2 fraction alone.
"""

from __future__ import annotations

import warnings
from functools import lru_cache
from typing import Any

import cantera as ct

from redshift.provenance import Prov, Registry, value
from redshift.units import psi_to_kpa

METHOD = "cantera_hp_equilibrium_stoich_ch4"
METHOD_VERSION = "1"


@lru_cache(maxsize=4096)
def adiabatic_flame_temperature(
    o2_pct: float, pressure_psi: float, mechanism: str = "gri30.yaml", t0: float = 298.15
) -> float:
    gas = ct.Solution(mechanism)
    x = o2_pct / 100.0
    oxidiser = {"O2": 1.0} if x >= 1.0 else {"O2": x, "N2": 1.0 - x}
    gas.TP = t0, psi_to_kpa(pressure_psi) * 1000.0
    gas.set_equivalence_ratio(1.0, "CH4", oxidiser)
    with warnings.catch_warnings():
        # Above 3,000 K Cantera warns that the thermodynamic fits are extrapolated. Such points are far
        # above the 2,700 K 'approximate' threshold and are already marked approximate.
        warnings.simplefilter("ignore", UserWarning)
        gas.equilibrate("HP")
    return float(gas.T)


def _frange(start: float, stop: float, step: float) -> list[float]:
    n = int(round((stop - start) / step))
    return [round(start + i * step, 6) for i in range(n + 1)]


def _prov(registry: Registry, pid: str, params: dict[str, Any], o2: float, p: float, approximate: bool) -> str:
    return registry.add(
        Prov(
            id=pid,
            source_type="derived",
            method=METHOD,
            method_version=METHOD_VERSION,
            params={**params, "o2_pct": o2, "pressure_psi": p, "cantera_version": ct.__version__},
            note=(
                "Approximate: dissociation dominates at this temperature, so the value depends strongly on how "
                "it is modelled."
                if approximate
                else None
            ),
        )
    )


def candidate_temperatures(
    registry: Registry, candidates: list[dict[str, Any]], params: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    out = {}
    for c in candidates:
        o2, p = c["o2_pct"]["v"], c["pressure_psi"]["v"]
        t = adiabatic_flame_temperature(o2, p, params["mechanism"], params["initial_temperature_K"])
        approx = t > params["approximate_above_K"]
        pid = _prov(registry, f"ft:{c['id']}", params, o2, p, approx)
        out[c["id"]] = {**value(round(t, 1), "K", pid), "approximate": approx}
    return out


def grid(registry: Registry, params: dict[str, Any]) -> dict[str, Any]:
    o2s = _frange(**params["grid_o2_pct"])
    ps = _frange(**params["grid_pressure_psi"])
    values: list[list[float]] = []
    approx: list[list[bool]] = []
    for p in ps:
        row, arow = [], []
        for o2 in o2s:
            t = adiabatic_flame_temperature(o2, p, params["mechanism"], params["initial_temperature_K"])
            row.append(round(t, 1))
            arow.append(t > params["approximate_above_K"])
        values.append(row)
        approx.append(arow)
    gid = registry.add(
        Prov(
            id="ft:grid",
            source_type="derived",
            method=METHOD,
            method_version=METHOD_VERSION,
            params={**{k: v for k, v in params.items() if k != "isotherms_K"}, "cantera_version": ct.__version__},
            note="Grid of adiabatic flame temperatures used for contour lines. Each cell is one Cantera equilibrium.",
        )
    )
    iso_id = registry.add(
        Prov(
            id="ft:isotherms",
            source_type="derived",
            method="isotherm levels",
            method_version="1",
            params={"levels_K": params["isotherms_K"]},
            note="Contour levels chosen for legibility (judgement).",
        )
    )
    return {
        "o2_pct": o2s,
        "pressure_psi": ps,
        "temperature_K": values,
        "approximate": approx,
        "isotherms_K": [value(t, "K", iso_id) for t in params["isotherms_K"]],
        "p": gid,
        "caption": "Adiabatic flame temperature of stoichiometric methane (Cantera, GRI-Mech 3.0, 298.15 K, "
        "constant enthalpy and pressure). Explains how hot a flame can get; does not predict "
        "ignition or spread.",
    }
