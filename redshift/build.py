"""Single entry point: python -m redshift.build

Verifies raw hashes, normalises every table, runs the science, checks goldens and provenance coverage,
then writes data/processed/ and the static API snapshot in web/public/data/. Any integrity failure
exits non-zero and writes nothing to the snapshot.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import sys
from collections import Counter
from typing import Any

from redshift import goldens, investigations
from redshift.export import evidence as E
from redshift.export.lint import lint
from redshift.export.quality import quality_markdown
from redshift.flags import DEFS, FlagLog
from redshift.ingest.manifest import ManifestError, verify
from redshift.normalise.base import NUMERIC_FIELDS, TEXT_FIELDS
from redshift.normalise.run import run as normalise
from redshift.papers import findings as F
from redshift.paths import PARAMS, PROCESSED, SNAPSHOT, rel
from redshift.provenance import Prov, Registry, value
from redshift.science import candidates as C
from redshift.science import flame_temperature as FT
from redshift.science import planner as P
from redshift.science import prebreathe as PB
from redshift.science import probe as PR

RETRIEVED = "2026-11-14"


class BuildError(Exception):
    pass


def dumps(obj: Any) -> str:
    return json.dumps(obj, indent=1, sort_keys=True, ensure_ascii=False) + "\n"


def compute() -> dict[str, Any]:
    manifest = verify()
    params = json.loads(PARAMS.read_text(encoding="utf-8"))
    registry, flags = Registry(), FlagLog()
    norm = normalise(registry, flags)
    records = norm.records
    unlabelled = [
        r.test_id
        for r in records
        if r.fields["o2_pct"]["v"] is not None and (r.fields.get("o2_basis") or {}).get("v") is None
    ]
    if unlabelled:
        raise BuildError(f"{len(unlabelled)} tests have an O2 value but no o2_basis, e.g. {unlabelled[:3]}")

    invs = investigations.build(registry, flags)
    inv_names = {i["id"]: (i.get("acronym", {}) or {}).get("v") or i["id"] for i in invs}
    cov = investigations.coverage(records)
    stats = E.investigation_stats(registry, records)
    for i in invs:
        i["coverage"] = cov.get(i["id"])
        i["stats"] = stats.get(i["id"])

    cands = C.build(registry)
    ft_params = params["flame_temperature"]
    flame_t = FT.candidate_temperatures(registry, cands, ft_params)
    grid = FT.grid(registry, ft_params)

    checked = F.load_checked()
    fstatus = F.status(checked)
    public_findings = F.public(registry, checked)
    paper_ev = E.paper_evidence(checked)
    rec_ev = E.record_evidence(records, inv_names)
    all_ev = rec_ev + paper_ev

    near_params = params["nearness"]
    cand_ev = E.candidate_evidence(registry, all_ev, cands, near_params, flame_t)
    sens = E.sensitivity(registry, all_ev, cands, near_params)
    gap = E.access_gap(registry, records, paper_ev, all_ev, cands, near_params, fstatus)
    flex = E.flex_suppression(registry, records, params["flex_bands"])
    habitats = [c for c in cands if c["role"] in {"habitat", "scenario"}]
    planner = P.build(registry, all_ev, habitats, near_params, params["planner"])
    prebreathe = PB.build(registry, checked)
    tmap = E.trade_map(registry, all_ev)
    test_dois = {r.test_id: registry.get(next(iter(v["p"] for v in r.fields.values()))).doi for r in records}
    probe_grid = PR.build(registry, records, all_ev, near_params, test_dois)

    # ---- flags: stable ids ----
    ordered = flags.sorted()
    idx_to_id = {id(f): f"F{i + 1:04d}" for i, f in enumerate(ordered)}
    flag_ids_by_index = {i: idx_to_id[id(f)] for i, f in enumerate(flags.items)}
    flag_json = []
    for i, f in enumerate(ordered):
        fj = f.to_json(i + 1)
        flag_json.append(fj)
    tests_by_flag: dict[str, list[str]] = {}
    tests_payload = []
    for r in sorted(records, key=lambda r: (int(r.investigation_id.split("-")[1]), r.table_key, r.source_row)):
        fids = sorted({flag_ids_by_index[i] for i in r.flag_refs})
        for fid in fids:
            tests_by_flag.setdefault(fid, []).append(r.test_id)
        tests_payload.append(
            {
                "test_id": r.test_id,
                "investigation_id": r.investigation_id,
                "investigation": inv_names.get(r.investigation_id, r.investigation_id),
                "source_type": "psi_table",
                "table_file": r.table_file,
                "source_row": r.source_row,
                "doi": registry.get(next(iter(v["p"] for v in r.fields.values()))).doi,
                "fuel_class": r.fuel_class,
                "test_kind": r.test_kind,
                "fields": r.fields,
                "flags": fids,
                "raw": r.raw,
                "verified": True,
            }
        )
    for fj in flag_json:
        fj["test_ids"] = sorted(tests_by_flag.get(fj["id"], []))

    # ---- goldens ----
    recons = [r.to_json() for r in norm.recons]
    nonblank = sum(r["records_in"] - r["blank_excluded"] for r in recons)
    actual: dict[str, Any] = {
        "harvest_investigations": len({r["investigation_id"] for r in recons}),
        "harvest_tables": len(recons),
        "harvest_nonblank_records": nonblank,
    }
    hi = flex["high_o2_no_suppressant"]
    actual["flex_high_o2_total"] = hi["total"]["v"]
    actual["flex_high_o2_labels"] = {k: v["v"] for k, v in hi["outcome_labels"].items()}
    actual["flex_high_o2_fuels"] = {k: v["v"] for k, v in hi["fuels"].items()}
    actual["flex_band_480_600"] = flex["in_band"]["v"]
    for i, g in enumerate(flex["groups"]):
        actual[f"flex_co2_{i}"] = f"{g['extinguished']['v']}/{g['total']['v']}"
    for cid, t in flame_t.items():
        actual[f"ft_{cid}"] = t["v"]
    psi_ev = [e for e in rec_ev if e.fuel_class in {"gas", "droplet", "solid"}]
    from redshift.science.nearness import evaluate

    for c in cands:
        res = evaluate(psi_ev, c["o2_pct"]["v"], c["pressure_kpa"]["v"], near_params)
        near = [e for _, e in res["near"]]
        actual[f"near_psi_{c['id']}"] = len(near)
        for fc in ("solid", "droplet", "gas"):
            actual[f"near_psi_{fc}_{c['id']}"] = sum(1 for e in near if e.fuel_class == fc)
    actual["near_psi_solid_any_habitat"] = sum(
        actual[f"near_psi_solid_{c['id']}"] for c in cands if c["id"] not in {"c14_7_21", "c4_3_100"}
    )
    actual["bre_flames_total"] = sum(
        (r.fields["n_flames"]["v"] or 0) for r in records if r.investigation_id == "PSI-20"
    )
    golden_results = goldens.evaluate(actual)
    gid = registry.add(
        Prov(
            id="goldens",
            source_type="derived",
            method="golden checks",
            method_version="1",
            note="Expected values from earlier analyses, reproduced or explained.",
        )
    )

    # ---- summary counts ----
    fuel_counts = Counter(r.fuel_class for r in records)
    summary_id = registry.add(
        Prov(
            id="summary",
            source_type="derived",
            method="dataset summary counts",
            method_version="1",
            inputs=sorted(r.test_id for r in records),
        )
    )
    summary = {
        "tests": value(len(records), "tests", summary_id),
        "investigations_with_tables": value(len({r.investigation_id for r in records}), "investigations", summary_id),
        "investigations_total": value(len(invs), "investigations", summary_id),
        "tables": value(len(recons), "tables", summary_id),
        "by_fuel_class": {k: value(v, "tests", summary_id) for k, v in sorted(fuel_counts.items())},
        "flags": value(len(flag_json), "flags", summary_id),
        "flags_by_severity": {
            s: value(sum(1 for f in flag_json if f["severity"] == s), "flags", summary_id)
            for s in ("error", "warning", "info")
        },
        "duplicates_removed": value(sum(r["duplicates_removed"] for r in recons), "rows", summary_id),
        "blank_rows_excluded": value(sum(r["blank_excluded"] for r in recons), "rows", summary_id),
        "non_test_rows_excluded": value(sum(r["non_test_excluded"] for r in recons), "rows", summary_id),
    }

    quality = {
        "summary": summary,
        "flag_definitions": {
            k: {"severity": d.severity, "title": d.title, "description": d.description} for k, d in sorted(DEFS.items())
        },
        "flags": flag_json,
        "reconciliation": recons,
        "goldens": {"results": golden_results, "p": gid},
        "findings": fstatus,
        "p": summary_id,
    }

    steps_id = registry.add(
        Prov(
            id="params:nearness",
            source_type="derived",
            method="nearness rule parameters (redshift/params.json)",
            method_version="1",
            params=near_params,
            note="Judgement; see the sensitivity table.",
        )
    )
    payloads: dict[str, Any] = {
        "tests.json": {"tests": tests_payload, "p": summary_id},
        "investigations.json": {"investigations": invs, "p": summary_id},
        "candidates.json": {"candidates": cands},
        "candidate_evidence.json": {
            "evidence": cand_ev,
            "params": near_params,
            "steps": {
                "threshold": value(near_params["threshold"], "steps", steps_id),
                "o2_step": value(near_params["o2_step_pct_points"], "O2 points", steps_id),
                "pressure_ratio": value(near_params["pressure_step_log"], None, steps_id),
                "flow_step": value(near_params["flow_step_cm_s"], "cm/s", steps_id),
            },
            "p": "sensitivity",
        },
        "sensitivity.json": sens,
        "flame_temperature_grid.json": grid,
        "planner_grid.json": planner,
        "access_gap.json": gap,
        "flex_suppression.json": flex,
        "key_findings.json": {"findings": public_findings, "status": fstatus, "p": "summary"},
        "prebreathe.json": prebreathe,
        "trade_map.json": tmap,
        "probe_grid.json": probe_grid,
        "investigation_stats.json": {"stats": stats, "p": summary_id},
        "quality_report.json": quality,
        "adapters.json": {
            "adapters": [
                {
                    "investigation_id": s.investigation_id,
                    "folder": s.folder,
                    "fuel_class": s.fuel_class,
                    "test_kind": s.test_kind,
                    "tables": [t.relpath for t in s.tables],
                    "mapping": s.mapping_doc.strip(),
                }
                for s in norm.specs
            ]
        },
        "manifest.json": {
            "files": [{k: v for k, v in f.items() if k != "size"} | {"bytes": f["size"]} for f in manifest["files"]],
            "note": manifest["note"],
        },
    }
    # AI-assisted text: checked deterministically against the payloads it cites.
    from redshift.ai import text as AI

    known_ids = {r.test_id for r in records} | {i["id"] for i in invs} | {cf.id for cf in checked}
    ai = AI.build(payloads, set(fstatus["verified"]), known_ids)
    if ai["rejected"]:
        raise BuildError(f"AI text failed its checks: {ai['rejected']}")
    payloads["ai_text.json"] = {**ai["ai"], "p": "summary"}
    # Provenance coverage lint over every payload.
    known = set(registry.to_json())
    checked_n, failures = 0, []
    for name, payload in payloads.items():
        if name == "manifest.json":
            continue
        n, fails = lint(payload, known, name)
        checked_n += n
        failures.extend(fails)
    coverage = 100.0 if checked_n == 0 else round(100.0 * (checked_n - len(failures)) / checked_n, 4)
    quality["provenance_coverage"] = {
        "numbers_checked": checked_n,
        "without_provenance": len(failures),
        "percent": coverage,
        "examples": failures[:20],
    }
    payloads["provenance.json"] = registry.to_json()

    # Version: content hash of everything published.
    h = hashlib.sha256()
    for name in sorted(payloads):
        h.update(name.encode())
        h.update(dumps(payloads[name]).encode())
    version = f"{RETRIEVED}+{h.hexdigest()[:12]}"
    payloads["dataset_version.json"] = {
        "version": version,
        "retrieved": RETRIEVED,
        "content_sha256": h.hexdigest(),
        "cite": f"Project Redshift (2026). Redshift microgravity fire evidence dataset, version {version}. "
        "Derived from NASA Physical Sciences Informatics (cite each investigation by its DOI).",
    }
    return {
        "payloads": payloads,
        "failures": failures,
        "golden_results": golden_results,
        "records": records,
        "registry": registry,
        "quality": quality,
        "version": version,
        "summary_flags": flag_json,
    }


def tests_table(records: list[Any], registry: Registry, flags_by_test: dict[str, list[str]]) -> list[dict[str, Any]]:
    rows = []
    for t in records:
        row: dict[str, Any] = {
            k: t[k]
            for k in (
                "test_id",
                "investigation_id",
                "investigation",
                "source_type",
                "table_file",
                "source_row",
                "doi",
                "fuel_class",
                "test_kind",
                "verified",
            )
        }
        for f in (*NUMERIC_FIELDS, *TEXT_FIELDS):
            row[f] = t["fields"][f]["v"] if f in t["fields"] else None
        row["flags"] = ";".join(t["flags"])
        row["provenance"] = json.dumps({f: v["p"] for f, v in t["fields"].items()}, sort_keys=True)
        row["raw"] = json.dumps(t["raw"], ensure_ascii=False)
        rows.append(row)
    return rows


def write(result: dict[str, Any]) -> None:
    payloads = result["payloads"]
    PROCESSED.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.mkdir(parents=True, exist_ok=True)
    # newline="\n": outputs are byte-identical on every platform (Windows would otherwise write CRLF).
    for name, payload in payloads.items():
        text = dumps(payload)
        (PROCESSED / name).write_text(text, encoding="utf-8", newline="\n")
        (SNAPSHOT / name).write_text(text, encoding="utf-8", newline="\n")
    md = quality_markdown(result["quality"], result["version"])
    (PROCESSED / "quality_report.md").write_text(md, encoding="utf-8", newline="\n")
    (SNAPSHOT / "quality_report.md").write_text(md, encoding="utf-8", newline="\n")
    rows = tests_table(payloads["tests.json"]["tests"], result["registry"], {})
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    (PROCESSED / "tests.csv").write_text(buf.getvalue(), encoding="utf-8", newline="\n")
    import pandas as pd

    df = pd.DataFrame(rows)
    df.to_parquet(PROCESSED / "tests.parquet", index=False)
    (PROCESSED / "flags.csv").write_text(_flags_csv(result["summary_flags"]), encoding="utf-8", newline="\n")
    (SNAPSHOT / "flags.csv").write_text(_flags_csv(result["summary_flags"]), encoding="utf-8", newline="\n")
    (SNAPSHOT / "tests.csv").write_text(buf.getvalue(), encoding="utf-8", newline="\n")


def _flags_csv(flags: list[dict[str, Any]]) -> str:
    buf = io.StringIO()
    cols = [
        "id",
        "code",
        "severity",
        "title",
        "investigation_id",
        "file",
        "rows",
        "column",
        "raw",
        "detail",
        "action",
        "test_ids",
    ]
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    for f in flags:
        w.writerow({k: (";".join(map(str, f[k])) if isinstance(f[k], list) else f[k]) for k in cols})
    return buf.getvalue()


def main() -> int:
    try:
        result = compute()
    except (ManifestError, BuildError) as exc:
        print(f"BUILD FAILED: {exc}", file=sys.stderr)
        return 2
    problems = []
    if result["failures"]:
        problems.append(f"{len(result['failures'])} numbers without provenance, e.g. {result['failures'][:5]}")
    unexplained = [g for g in result["golden_results"] if g["status"] == "unexplained_difference"]
    for g in unexplained:
        problems.append(f"golden {g['id']}: expected {g['expected']}, got {g['actual']} (no explanation)")
    for r in result["quality"]["reconciliation"]:
        if not r["balanced"]:
            problems.append(f"reconciliation failed: {r['table_file']}")
    if problems:
        print("BUILD FAILED:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 1
    write(result)
    q = result["quality"]
    print(f"dataset {result['version']}")
    print(
        f"tests {q['summary']['tests']['v']}, flags {q['summary']['flags']['v']}, "
        f"provenance coverage {q['provenance_coverage']['percent']}% of {q['provenance_coverage']['numbers_checked']}"
    )
    print(
        "goldens: " + ", ".join(f"{s}={n}" for s, n in Counter(g["status"] for g in result["golden_results"]).items())
    )
    print(f"wrote {rel(PROCESSED)} and {rel(SNAPSHOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
