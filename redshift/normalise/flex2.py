"""FLEX-2 (PSI-68): Flame Extinguishment Experiment 2, burning fuel droplets in the MDCA.

The FLEX-2 table on PSI is a test matrix, not a list of individual tests: each of its 8 rows names one
fuel and gives the ranges or lists of conditions used with it (for example O2 "0.17; 0.21;0.25; 0.3" and
pressure "0.5; 1.0; 1.5; 2.0; or 3.0"). Every row is kept as a record because each names a fuel that was
burned, but no single condition can be read from a list or a range without choosing one, so the numeric
fields are null and each such cell is flagged non_numeric.

Column mapping (written out by hand so it can be audited):
- "Sample (Fuel Type)" -> fuel, verbatim (for example "Propanol (95%) Glycerol (5%) (mixture)").
  test_label uses the same column, as the table has no test number.
- "Ambient Gas Mixture " -> diluent, verbatim ("O2/N2 or O2/He").
- "Oxygen Mole Fraction" -> o2_pct (fraction_to_pct); o2_basis is "ambient", the chamber atmosphere.
- "Ambient Pressure (atm)" -> pressure_kpa (atm_to_kpa) and pressure_psi; the header states atm.
- "Flow Velocity (cm/s)" -> flow_cm_s; the header states cm/s.
- "Initial Droplet Diameter (mm)" and " Ambient Temperature (C)" have no canonical field and stay in the
  raw record.
- gravity_level: "microgravity (ISS)", from the PSI page flight platform.
- The table records no test date and no outcome.
"""

from __future__ import annotations

from redshift import transforms as T
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-68"

C_FUEL = "Sample (Fuel Type)"
C_GAS = "Ambient Gas Mixture"
C_O2 = "Oxygen Mole Fraction"
C_P = "Ambient Pressure (atm)"
C_FLOW = "Flow Velocity (cm/s)"


def adapt(ctx: Ctx) -> None:
    o2_basis = ctx.constant(
        "o2_basis",
        "ambient",
        "FLEX-2.md Approach: the chamber was filled with the atmosphere, O2 varied as a "
        "mole fraction with the diluent gas making up the balance.",
    )
    gravity = ctx.constant("gravity", "microgravity (ISS)", "FLEX-2.md: flight platform International Space Station.")
    for row in ctx.rows():
        kpa, psi = ctx.pressure(row, C_P, "atm")
        ctx.emit(
            row,
            {
                "test_label": ctx.text(row, C_FUEL),
                "fuel": ctx.text(row, C_FUEL),
                "diluent": ctx.text(row, C_GAS),
                "o2_pct": ctx.num(row, C_O2, "o2_pct", T.fraction_as_pct),
                "o2_basis": o2_basis,
                "pressure_kpa": kpa,
                "pressure_psi": psi,
                "flow_cm_s": ctx.num(row, C_FLOW, "flow_cm_s"),
                "gravity_level": gravity,
            },
        )


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="FLEX-2",
    fuel_class="droplet",
    test_kind="burn",
    tables=(TableSpec("main", "FLEX-2/experiment_table/PSI-68_Experimental table_Flex2.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
