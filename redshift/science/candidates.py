"""Candidate atmospheres, each defined by an exact quote from a raw source file.

The three habitat candidates come from the ACME BRE investigation page on PSI, whose objectives name
"14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen". The 10.2 psi / 30% point and the
spacesuit point come from the official challenge statement. No candidate is ranked or recommended.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from redshift.provenance import Prov, Registry, value
from redshift.quotes import find_line
from redshift.units import psi_to_kpa

BRE_PAGE = "data/raw/psi/ACME-BRE/ACME-BRE.md"
CHALLENGE = "data/raw/reference/challenge_statement.md"
BRE_QUOTE = "14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen"
SUIT_QUOTE = "spacesuits are filled with 100% oxygen to only 4.3 psi"
MOON_QUOTE = "The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a " \
             "corresponding pressure of 10.2 psi or less."


@dataclass(frozen=True)
class Candidate:
    id: str
    name: str
    short: str
    pressure_psi: float
    o2_pct: float
    role: str  # "habitat" or "suit" or "scenario"
    source_file: str
    quote: str
    source_type: str
    investigation_id: str | None
    doi: str | None
    context: str


CANDIDATES: tuple[Candidate, ...] = (
    Candidate("c14_7_21", "14.7 psi / 21% O2", "Earth sea level and ISS reference", 14.7, 21.0, "habitat",
              BRE_PAGE, BRE_QUOTE, "psi_page", "PSI-20", "10.60555/vb93-3y72",
              "Named as a NASA-considered atmosphere in the ACME BRE flight objectives."),
    Candidate("c10_2_26_5", "10.2 psi / 26.5% O2", "Intermediate candidate", 10.2, 26.5, "habitat",
              BRE_PAGE, BRE_QUOTE, "psi_page", "PSI-20", "10.60555/vb93-3y72",
              "Named as a NASA-considered atmosphere in the ACME BRE flight objectives."),
    Candidate("c10_2_30", "10.2 psi / 30% O2", "Challenge statement scenario", 10.2, 30.0, "scenario",
              CHALLENGE, MOON_QUOTE, "reference_document", None, None,
              "The challenge statement says the Moon base will likely use 30% O2 or more at 10.2 psi or less. "
              "This is a bound from the challenge text, not a named NASA candidate."),
    Candidate("c8_2_34", "8.2 psi / 34% O2", "Low-pressure, high-oxygen candidate", 8.2, 34.0, "habitat",
              BRE_PAGE, BRE_QUOTE, "psi_page", "PSI-20", "10.60555/vb93-3y72",
              "Named as a NASA-considered atmosphere in the ACME BRE flight objectives."),
    Candidate("c4_3_100", "4.3 psi / 100% O2", "Spacesuit", 4.3, 100.0, "suit",
              CHALLENGE, SUIT_QUOTE, "reference_document", None, None,
              "The spacesuit atmosphere, from the challenge statement. Not a habitat candidate."),
)

HABITAT_IDS = tuple(c.id for c in CANDIDATES if c.role in {"habitat", "scenario"})


def build(registry: Registry) -> list[dict[str, Any]]:
    out = []
    for c in CANDIDATES:
        line = find_line(c.source_file, c.quote)
        base = Prov(id=f"cand:{c.id}", source_type=c.source_type, investigation_id=c.investigation_id,  # type: ignore[arg-type]
                    file=c.source_file, row=line, quote=c.quote, doi=c.doi,
                    note="Quote checked automatically against the raw file at build time.")
        registry.add(base)
        psi_id = registry.add(base.model_copy(update={"id": f"cand:{c.id}:psi"}))
        o2_id = registry.add(base.model_copy(update={"id": f"cand:{c.id}:o2"}))
        kpa_id = registry.add(base.model_copy(update={"id": f"cand:{c.id}:kpa", "transforms": ["psi_to_kpa"]}))
        out.append({
            "id": c.id, "name": c.name, "short": c.short, "role": c.role, "context": c.context,
            "pressure_psi": value(c.pressure_psi, "psi", psi_id),
            "pressure_kpa": value(psi_to_kpa(c.pressure_psi), "kPa", kpa_id),
            "o2_pct": value(c.o2_pct, "%", o2_id),
            "source": base.id,
        })
    return out
