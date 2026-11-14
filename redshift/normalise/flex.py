"""FLEX (PSI-69): Flame Extinguishment Experiment, burning fuel droplets in the MDCA.

Column mapping (written out by hand so it can be audited):
- "FLEX Test #" and "FLEX Identifier" -> test_label ("<#> / <identifier>")
- "Test Date" -> test_date (raw text)
- "Fuel" -> fuel
- "Ambient pressure; mmHg" -> pressure_kpa (mmhg_to_kpa) and pressure_psi
- "O initial ambient composition; mole fraction" -> o2_pct (fraction_to_pct). The subscript 2 was lost
  from the PSI header; the column is O2.
- "N initial ..." -> n2_pct; "CO initial ..." (CO2, subscript lost) -> co2_pct; "He initial ..." -> he_pct
- "Test end" -> outcome_label, verbatim (Extinction, Disruption, Completion). "Disruption" is not defined on
  the PSI page and is never paraphrased.
- suppressant: derived label from which diluent is present ("CO2", "He", "CO2 + He" or "none"), using only the
  recorded fractions; it is a description of the row, not a new value.
- Flow: FLEX droplets burned in a quiescent chamber; the table has no flow column, so flow is null.
"""

from __future__ import annotations

from redshift import transforms as T
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-69"

C_ID = "FLEX Identifier"
C_DATE = "Test Date"
C_FUEL = "Fuel"
C_P = "Ambient pressure; mmHg"
C_O2 = "O initial ambient composition; mole fraction"
C_N2 = "N initial ambient composition; mole fraction"
C_CO2 = "CO initial ambient composition; mole fraction"
C_HE = "He initial ambient composition; mole fraction"
C_END = "Test end"


def adapt(ctx: Ctx) -> None:
    seen_ids: dict[str, int] = {}
    for row in ctx.rows():
        o2 = ctx.num(row, C_O2, "o2_pct", T.fraction_as_pct)
        n2 = ctx.num(row, C_N2, "n2_pct", T.fraction_as_pct)
        co2 = ctx.num(row, C_CO2, "co2_pct", T.fraction_as_pct)
        he = ctx.num(row, C_HE, "he_pct", T.fraction_as_pct)
        kpa, psi = ctx.pressure(row, C_P, "mmHg")

        parts = [x["v"] for x in (o2, n2, co2, he)]
        if all(p is not None for p in parts):
            total = sum(parts) / 100.0  # type: ignore[arg-type]
            if abs(total - 1.0) > 0.01:
                ctx.flag("composition_sum", row, None, ",".join(ctx.raw(row, c) for c in (C_O2, C_N2, C_CO2, C_HE)),
                         f"O2 + N2 + CO2 + He mole fractions sum to {total:.3f}.", "Values kept as recorded.")

        ident = ctx.raw(row, C_ID).strip()
        if ident in seen_ids:
            ctx.flag("near_duplicate", row, C_ID, ident,
                     f"FLEX Identifier {ident} also appears on line {seen_ids[ident]} with different values.",
                     "Both rows kept.", rows=[seen_ids[ident], row.line])
        else:
            seen_ids[ident] = row.line

        # A recorded pressure of 0 mmHg is flagged out_of_range by Ctx.num and set to null.
        co2_v, he_v = co2["v"] or 0.0, he["v"] or 0.0
        if co2["v"] is None or he["v"] is None:
            supp = None
        elif co2_v > 0 and he_v > 0:
            supp = "CO2 + He"
        elif co2_v > 0:
            supp = "CO2"
        elif he_v > 0:
            supp = "He"
        else:
            supp = "none"
        suppressant = ctx.derived_text(
            row, "suppressant", supp,
            "Label from recorded diluent fractions: CO2 > 0 and/or He > 0, else 'none'; null if either is unknown.",
            [co2, he])
        ctx.emit(row, {
            "test_label": ctx.text(row, C_ID),
            "test_date": ctx.text(row, C_DATE),
            "fuel": ctx.text(row, C_FUEL),
            "o2_pct": o2, "n2_pct": n2, "co2_pct": co2, "he_pct": he,
            **({"o2_basis": ctx.constant("o2_basis", "chamber initial",
                                         "Header 'O initial ambient composition': initial chamber atmosphere.")}
               if o2["v"] is not None else {}),
            "pressure_kpa": kpa, "pressure_psi": psi,
            "diluent": ctx.constant("diluent", "N2", "Balance gas recorded in the N2 column."),
            "suppressant": suppressant,
            "outcome_label": ctx.text(row, C_END),
            "flow_cm_s": ctx.missing("flow_cm_s", "FLEX burned droplets in a quiescent chamber; no flow column."),
            "gravity_level": ctx.constant("gravity", "microgravity (ISS)", "PSI page: flight platform ISS."),
        })


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="FLEX",
    fuel_class="droplet",
    test_kind="burn",
    tables=(TableSpec("main", "FLEX/experiment_table/PSI-69_Experimental table_FLEX.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
