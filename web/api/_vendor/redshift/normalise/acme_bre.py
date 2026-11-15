"""ACME BRE (PSI-20): Burning Rate Emulator, a porous gas burner that emulates condensed-fuel burning.

Each row of the PSI table summarises one test day (a session of several flames), not a single flame.

Column mapping (written out by hand so it can be audited):
- "Year", "Month" and "Date" -> test_date: the three cells joined with spaces exactly as written
  (for example "2019 Feb 8"). test_label is the same text with the prefix "Session ", because the
  table has no test number and each row is identified by its date.
- "Fuel Bottle" -> fuel, verbatim (for example "100% C2H4"). The fuel percentage inside this label is not
  read as a number, so fuel_conc_pct is null.
- "Oxygen Conc (percent)" -> most cells list several concentrations used during the session, separated by
  semicolons (for example "21; 26.5; 40"). These are read with the allowed transform split_number_list into
  o2_list_pct, in the order written; o2_pct stays null because no single value applies to the row. A cell
  with one value is read into o2_pct (an optional trailing '%' is removed).
  Two cells read "3400%" (line 6) and "2100%" (line 9). Read as
  written they are 3400 and 2100 percent, which is outside the physical range, so they are flagged
  out_of_range and o2_pct is null. They are not reinterpreted as 34 or 21.
- o2_basis is "ambient" on every row with an oxygen cell: the table Notes (line 2) give the oxygen
  concentration "as diluted with nitrogen on a volume basis", the PSI page Objectives name "O2/N2 ambients"
  in "a quiescent microgravity ambient", and the PSI page Approach says the oxygen concentration is set as
  part of "the chamber contents". It is set even though every o2_pct is null, because it describes what
  the raw cell measures.
- "Flames Ignited" -> n_flames (the number ignited on that day, as the line 3 note says).
- "Burner Size (mm)" and "Notes" -> notes, as "Burner size (mm): 25; Notes: ...". The notes on lines 2 and
  3 are footnotes for the whole table, kept on the rows where they appear.
- diluent is "N2", a table constant from the line 2 note ("as diluted with nitrogen on a volume basis").
- Pressure: the table has no pressure column. The line 2 note says "The chamber pressures were also
  varied but are not identified in this summary table." pressure_kpa and pressure_psi are null. The
  pressures named on the PSI page are planned conditions, not values for any row, and are not used.
- Flow: the burner burned in a quiescent ambient; the table has no flow column, so flow_cm_s is null.

Checks: rows out of date order are flagged date_inconsistent (line 14, 2020 Dec 4, follows line 13,
2020 Dec 5). Fuel labels that differ only by spacing ("100%C2H4" against "100% C2H4") are flagged
label_inconsistent. Fuel labels are also checked for the fill-down pattern used in the other ACME tables.
"""

from __future__ import annotations

from redshift.normalise import acme_shared as S
from redshift.normalise.base import AdapterSpec, Ctx, TableSpec

INV = "PSI-20"

C_YEAR = "Year"
C_MONTH = "Month"
C_DATE = "Date"
C_BURNER = "Burner Size (mm)"
C_FUEL = "Fuel Bottle"
C_O2 = "Oxygen Conc (percent)"
O2_LIST_NOTE = (
    "The cell lists several oxygen concentrations used during the session (see o2_list_pct); no single value "
    "applies to the row."
)
C_FLAMES = "Flames Ignited"
C_NOTES = "Notes"

PRESSURE_NOTE = (
    'No pressure column. The table Notes on line 2 say: "The chamber pressures were also '
    'varied but are not identified in this summary table."'
)


def adapt(ctx: Ctx) -> None:
    fill = S.FillDownCheck(ctx, C_FUEL)
    spelling = S.SpellingCheck(ctx, C_FUEL)
    prev = None
    for row in ctx.rows():
        fill.check(row)
        spelling.check(row)

        d = S.row_date(ctx, row, C_YEAR, C_MONTH, C_DATE)
        if d is not None and prev is not None and d < prev[0]:
            ctx.flag(
                "date_inconsistent",
                row,
                C_DATE,
                " ".join(ctx.raw(row, c).strip() for c in (C_YEAR, C_MONTH, C_DATE)),
                f"Rows are out of date order: line {row.line} ({d.isoformat()}) follows line {prev[1]} "
                f"({prev[0].isoformat()}).",
                "Both rows kept in file order; dates kept as recorded.",
                rows=[prev[1], row.line],
            )
        if d is not None:
            prev = (d, row.line)

        if ";" in ctx.raw(row, C_O2):
            o2_list = ctx.num_list(row, C_O2, "o2_list_pct")
            o2 = ctx.missing("o2_pct", O2_LIST_NOTE, flag=False)
        else:
            o2_list = None
            o2 = ctx.num(row, C_O2, "o2_pct", S.single_percent("Oxygen Conc (percent)"))
        date = S.date_text(ctx, row, C_YEAR, C_MONTH, C_DATE)
        label = ctx.derived_text(
            row,
            "test_label",
            None if date["v"] is None else f"Session {date['v']}",
            "'Session ' followed by test_date (Year, Month and Date cells, verbatim).",
            [date],
        )
        fields = {
            "test_label": label,
            "test_date": date,
            "fuel": ctx.text(row, C_FUEL),
            "o2_pct": o2,
            **({"o2_list_pct": o2_list} if o2_list is not None else {}),
            "pressure_kpa": ctx.missing("pressure_kpa", PRESSURE_NOTE),
            "pressure_psi": ctx.missing("pressure_psi", PRESSURE_NOTE),
            "n_flames": ctx.num(row, C_FLAMES, "n_flames"),
            "fuel_conc_pct": ctx.missing(
                "fuel_conc_pct",
                "The fuel percentage appears only inside the Fuel Bottle label (for example "
                "'50% C2H4'); it is not read out of text.",
            ),
            "flow_cm_s": ctx.missing(
                "flow_cm_s", "The burner burned in a quiescent ambient (PSI page Objectives); no flow column."
            ),
            "diluent": ctx.constant(
                "diluent", "N2", "Table Notes line 2: oxygen 'as diluted with nitrogen on a volume basis'."
            ),
            "gravity_level": S.gravity(ctx),
            "notes": S.notes(ctx, row, [("Burner size (mm)", C_BURNER, None), ("Notes", C_NOTES, None)]),
        }
        if ctx.raw(row, C_O2).strip():
            fields["o2_basis"] = ctx.constant(
                "o2_basis",
                "ambient",
                "Table Notes line 2: Oxygen Conc. 'as diluted with nitrogen on a volume basis'; PSI page "
                "Objectives: 'O2/N2 ambients' in 'a quiescent microgravity ambient'; PSI page Approach: "
                "oxygen concentration is set as part of 'the chamber contents'.",
            )
        ctx.emit(row, fields)
    spelling.finish()


SPEC = AdapterSpec(
    investigation_id=INV,
    folder="ACME-BRE",
    fuel_class="emulator",
    test_kind="flame",
    tables=(TableSpec("main", "ACME-BRE/experiment_table/PSI-20_Experimental table_ACME BRE.csv"),),
    adapt=adapt,
    mapping_doc=__doc__ or "",
)
