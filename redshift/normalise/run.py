"""Run every investigation adapter and collect records, provenance, flags and reconciliation."""

from __future__ import annotations

import csv
import importlib
import pkgutil
from dataclasses import dataclass, field

from redshift import normalise
from redshift.flags import FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise.base import AdapterSpec, Ctx, Reconciliation, TestRecord
from redshift.paths import PSI_RAW
from redshift.provenance import Registry


@dataclass
class NormaliseResult:
    records: list[TestRecord] = field(default_factory=list)
    registry: Registry = field(default_factory=Registry)
    flags: FlagLog = field(default_factory=FlagLog)
    recons: list[Reconciliation] = field(default_factory=list)
    specs: list[AdapterSpec] = field(default_factory=list)


def discover() -> list[AdapterSpec]:
    """Every module in redshift.normalise that defines SPEC, sorted by investigation id."""
    specs: list[AdapterSpec] = []
    for mod in pkgutil.iter_modules(normalise.__path__):
        if mod.name in {"base", "run"}:
            continue
        m = importlib.import_module(f"redshift.normalise.{mod.name}")
        spec = getattr(m, "SPEC", None)
        if isinstance(spec, AdapterSpec):
            specs.append(spec)
    return sorted(specs, key=lambda s: int(s.investigation_id.split("-")[1]))


def dois() -> dict[str, str]:
    with (PSI_RAW / "index.csv").open(newline="", encoding="utf-8") as fh:
        return {r["psi_id"]: r["doi"] for r in csv.DictReader(fh)}


def run(registry: Registry | None = None, flags: FlagLog | None = None) -> NormaliseResult:
    # Explicit None checks: an empty Registry or FlagLog is falsy (it defines __len__), so `or` would
    # silently replace the caller's registry with a new one.
    res = NormaliseResult(
        registry=Registry() if registry is None else registry, flags=FlagLog() if flags is None else flags
    )
    doi_by_id = dois()
    res.specs = discover()
    for spec in res.specs:
        for t in spec.tables:
            table = read_table(spec.investigation_id, t.table_key, t.relpath)
            ctx = Ctx(
                table,
                res.registry,
                res.flags,
                doi=doi_by_id[spec.investigation_id],
                fuel_class=spec.fuel_class,
                test_kind=spec.test_kind,
            )
            spec.adapt(ctx)
            ctx.finish()
            res.records.extend(ctx.records)
            res.recons.append(ctx.recon)
    return res
