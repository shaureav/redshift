"""One record per PSI combustion investigation, for investigations.json.

Sources, all read only:

- data/raw/psi_search_combustion.json: the 24 PSI search records returned by a "combustion" search
  (19 microgravity investigations and 5 ground investigations: PSI-60, 62, 115, 117 and 142).
- data/raw/psi/index.csv: the harvest index, one row per harvested investigation (DOI, data size,
  file counts).
- data/raw/psi/<FOLDER>/<FOLDER>.md: the harvested PSI page (fields table, Objectives, Approach,
  Hypothesis, Research impacts, Contacts, Experiment Table, Data files and Publications sections).
- data/raw/psi/<FOLDER>/publications.csv: the publication list (title, authors, DOI).

For the 19 harvested investigations every text value comes from the .md page and its provenance
names the file and physical line. For the 5 ground investigations, which have no harvested page, the
values come from their PSI search record and the provenance names the line of the JSON file. Values are
copied verbatim after trimming whitespace; an empty cell, a blank JSON string or a "?" date becomes null.
The licence is taken from the page's License row and is stored as "not shown" when that row holds only
a dash placeholder.

Each investigation also gets a coverage dictionary (see ``coverage``): for each canonical condition, whether
its experiment table records it at all. Metadata problems that can be confirmed in the files become flags;
nothing is corrected.
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from redshift.flags import Flag, FlagLog
from redshift.ingest.tables import read_table
from redshift.normalise.base import AdapterSpec, TestRecord
from redshift.paths import PSI_RAW, RAW, rel
from redshift.provenance import Prov, Registry, value

SEARCH_JSON = RAW / "psi_search_combustion.json"
INDEX_CSV = PSI_RAW / "index.csv"

EM_DASH = "\u2014"
DASH_PLACEHOLDERS = {"", "-", EM_DASH, "\u2013"}

# Canonical conditions reported in the coverage matrix.
COVERAGE_FIELDS: tuple[str, ...] = (
    "o2_pct",
    "pressure_kpa",
    "co2_pct",
    "he_pct",
    "flow_cm_s",
    "fuel",
    "material",
    "outcome_label",
)

# .md fields-table label -> output key (labels with special handling are dealt with separately).
PAGE_FIELDS: dict[str, str] = {
    "Acronym": "acronym",
    "PSI page": "psi_url",
    "Project type": "project_type",
    "Proposal title": "proposal_title",
    "Flight platform": "flight_platform",
    "Sponsor / program": "sponsor",
    "NASA center": "nasa_center",
    "Hardware": "hardware",
    "Funding": "funding",
    "Released / submitted": "released_submitted",
}

# .md section heading -> output key, for the verbatim narrative sections.
PAGE_SECTIONS: dict[str, str] = {
    "Objectives": "objectives",
    "Approach": "approach",
    "Hypothesis": "hypothesis",
    "Research impacts / Earth benefits": "impacts",
}

# PSI search record key -> output key, for ground investigations.
SEARCH_FIELDS: dict[str, str] = {
    "Acronym": "acronym",
    "Title": "title",
    "Research Area": "research_area",
    "SubResearch Area": "sub_research_area",
    "Project Type": "project_type",
    "Proposal Title": "proposal_title",
    "Flight Platform": "flight_platform",
    "Sponsoring Agency": "sponsor",
    "Monitoring Center": "nasa_center",
    "Experiment Hardware.Name": "hardware",
    "Funding Source": "funding",
    "Investigation Start Date": "start_date",
    "Investigation End Date": "end_date",
    "Objectives": "objectives",
    "Approach": "approach",
    "Hypothesis": "hypothesis",
    "Research Impacts/Earth Benefits": "impacts",
}

FLAG_ACTION = "Metadata kept exactly as published; investigation badged."
PSI_PAGE_PATTERN = "https://psi.nasa.gov/physci/repo/data/investigations/{id}"


# ---------------------------------------------------------------- page parsing


@dataclass
class Page:
    """A harvested .md page, keeping physical line numbers (line 1 is the first line)."""

    path: Path
    lines: list[str]
    title_line: int = 0
    fields: dict[str, tuple[int, str]] = field(default_factory=dict)  # label -> (line, raw value)
    sections: dict[str, list[tuple[int, str]]] = field(default_factory=dict)  # heading -> body lines

    @property
    def rel(self) -> str:
        return rel(self.path)

    def section_text(self, heading: str) -> tuple[str | None, int | None, int | None]:
        """Body of a section, trimmed, with its first and last non-blank physical lines."""
        body = [(n, s) for n, s in self.sections.get(heading, []) if s.strip() != ""]
        if not body:
            return None, None, None
        first, last = body[0][0], body[-1][0]
        text = "\n".join(s for n, s in self.sections[heading] if first <= n <= last).strip()
        return text, first, last


def read_page(path: Path) -> Page:
    lines = path.read_text(encoding="utf-8").splitlines()
    page = Page(path=path, lines=lines)
    current: str | None = None
    for n, line in enumerate(lines, start=1):
        if line.startswith("# ") and not page.title_line:
            page.title_line = n
        elif line.startswith("## "):
            current = line[3:].strip()
            page.sections[current] = []
        elif current is None and line.startswith("| ") and line.endswith("|"):
            label, _, val = line[2:-1].partition(" | ")
            label, val = label.strip(), val.rstrip()
            if label != "Field":
                page.fields[label] = (n, val)
        elif current is not None:
            page.sections[current].append((n, line))
    return page


def _heading(page: Page, prefix: str) -> str | None:
    return next((h for h in page.sections if h.startswith(prefix)), None)


# ---------------------------------------------------------------- source readers


def _csv_rows(path: Path) -> tuple[list[str], list[tuple[int, list[str]]]]:
    """CSV rows with the physical line on which each record starts (header is line 1)."""
    reader = csv.reader(io.StringIO(path.read_text(encoding="utf-8"), newline=""))
    header = next(reader)
    rows: list[tuple[int, list[str]]] = []
    prev = reader.line_num
    for cells in reader:
        rows.append((prev + 1, cells))
        prev = reader.line_num
    return header, rows


def read_index() -> dict[str, tuple[int, dict[str, str]]]:
    header, rows = _csv_rows(INDEX_CSV)
    return {cells[0]: (line, dict(zip(header, cells, strict=True))) for line, cells in rows}


def read_search() -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, int]]]:
    """Search records by accession, and the physical line of each key within each record."""
    text = SEARCH_JSON.read_text(encoding="utf-8")
    records = {r["Accession"]: r for r in json.loads(text)["investigations"]}
    key_re = re.compile(r'^( +)"([^"]+)":')
    lines: dict[str, dict[str, int]] = {}
    acc: str | None = None
    parent: str | None = None
    for n, line in enumerate(text.splitlines(), start=1):
        m = key_re.match(line)
        if not m:
            continue
        indent, key = len(m.group(1)), m.group(2)
        if indent == 3:
            if key == "Accession":
                acc = json.loads("{" + line.strip().rstrip(",") + "}")["Accession"]
                lines[acc] = {}
            parent = key
            if acc is not None:
                lines[acc][key] = n
        elif indent == 4 and acc is not None and parent is not None:
            lines[acc][f"{parent}.{key}"] = n
    return records, lines


def _search_get(rec: dict[str, Any], key: str) -> Any:
    node: Any = rec
    for part in key.split("."):
        node = node.get(part) if isinstance(node, dict) else None
    return node


# ---------------------------------------------------------------- builder


class _Builder:
    def __init__(self, registry: Registry, flags: FlagLog) -> None:
        self.reg = registry
        self.flags = flags

    # ---- provenance helpers ----
    def page_value(
        self,
        inv: str,
        key: str,
        page: Page,
        line: int | None,
        raw: str | None,
        v: Any,
        note: str,
        doi: str | None,
        unit: str | None = None,
    ) -> dict[str, Any]:
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:page:{key}",
                source_type="psi_page",
                investigation_id=inv,
                file=page.rel,
                row=line,
                raw=raw,
                quote=None if line is None else page.lines[line - 1],
                note=note,
                doi=doi,
            )
        )
        return value(v, unit, pid)

    def search_value(self, inv: str, key: str, out_key: str, raw: Any, line: int | None) -> dict[str, Any]:
        s = raw.strip() if isinstance(raw, str) else None
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:search:{out_key}",
                source_type="psi_page",
                investigation_id=inv,
                file=rel(SEARCH_JSON),
                row=line,
                column=key,
                raw=raw if isinstance(raw, str) else None,
                note="PSI search record",
            )
        )
        return value(s or None, None, pid)

    def index_value(
        self, inv: str, col: str, line: int, raw: str, v: Any, unit: str | None, doi: str | None
    ) -> dict[str, Any]:
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:index:{col}",
                source_type="psi_page",
                investigation_id=inv,
                file=rel(INDEX_CSV),
                row=line,
                column=col,
                raw=raw,
                note="Harvest index, one row per harvested investigation.",
                doi=doi,
            )
        )
        return value(v, unit, pid)

    def flag(
        self, code: str, inv: str, file: str, rows: list[int], column: str | None, raw: str | None, detail: str
    ) -> None:
        self.flags.add(
            Flag(
                code=code,
                investigation_id=inv,
                file=file,
                rows=rows,
                column=column,
                raw=raw,
                detail=detail,
                action=FLAG_ACTION,
            )
        )

    # ---- harvested investigation ----
    def harvested(
        self, inv: str, index_line: int, idx: dict[str, str], page: Page, spec: AdapterSpec | None
    ) -> dict[str, Any]:
        folder = idx["folder"].rstrip("/")
        doi_index = idx["doi"]
        out: dict[str, Any] = {"id": inv, "in_harvest": True}
        out["folder"] = self.index_value(inv, "folder", index_line, idx["folder"], folder, None, doi_index)

        def cell(label: str) -> tuple[int, str]:
            return page.fields[label]

        def text(key: str, label: str, v: str | None = None, note: str | None = None) -> dict[str, Any]:
            line, raw = cell(label)
            s = raw.strip() if v is None else v
            note = note or f"Value of the '{label}' row of the page's fields table."
            return self.page_value(inv, key, page, line, raw, s or None, note, doi_index)

        title_raw = page.lines[page.title_line - 1][2:]
        out["title"] = self.page_value(
            inv, "title", page, page.title_line, title_raw, title_raw.strip() or None, "Page heading.", doi_index
        )

        line, raw = cell("PSI ID")
        m = re.fullmatch(r"(PSI-\d+) \(version (\d+)\)", raw.strip())
        if m is None or m.group(1) != inv:
            raise ValueError(f"{page.rel} line {line}: unexpected PSI ID row {raw!r}")
        out["version"] = self.page_value(
            inv,
            "version",
            page,
            line,
            raw,
            m.group(2),
            "Version number written in the 'PSI ID' row, as text.",
            doi_index,
        )

        line, raw = cell("DOI")
        m = re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", raw.strip())
        out["doi"] = self.page_value(
            inv,
            "doi",
            page,
            line,
            raw,
            m.group(1) if m else (raw.strip() or None),
            "Link text of the 'DOI' row of the page's fields table.",
            doi_index,
        )

        for label, key in PAGE_FIELDS.items():
            out[key] = text(key, label)

        line, raw = cell("Research area")
        area, sep, sub = raw.partition(f" {EM_DASH}")
        out["research_area"] = text("research_area", "Research area")
        out["sub_research_area"] = self.page_value(
            inv,
            "sub_research_area",
            page,
            line,
            raw,
            (sub.strip() or None) if sep else None,
            "Part of the 'Research area' row after the dash that follows 'Combustion Science'.",
            doi_index,
        )

        line, raw = cell("License")
        lic = raw.strip()
        if lic in DASH_PLACEHOLDERS:
            out["licence"] = self.page_value(
                inv,
                "licence",
                page,
                line,
                raw,
                "not shown",
                "The 'License' row shows only a dash placeholder; stored as 'not shown'.",
                doi_index,
            )
            self.flag(
                "no_licence",
                inv,
                page.rel,
                [line],
                "License",
                raw,
                f"The PSI page's License row (line {line}) holds only the placeholder {lic!r} and names no licence.",
            )
        else:
            out["licence"] = text("licence", "License")

        line, raw = cell("Investigation dates")
        start, sep, end = raw.strip().partition(" to ")
        if not sep:
            start, end = "", ""
            self.flag(
                "date_inconsistent",
                inv,
                page.rel,
                [line],
                "Investigation dates",
                raw,
                "The investigation dates row is not of the form '<start> to <end>'.",
            )
        for key, part, which in (("start_date", start, "before"), ("end_date", end, "after")):
            s = part.strip()
            out[key] = self.page_value(
                inv,
                key,
                page,
                line,
                raw,
                None if s in {"", "?"} else s,
                f"Part of the 'Investigation dates' row {which} ' to '; '?' or blank is null.",
                doi_index,
            )

        for heading, key in PAGE_SECTIONS.items():
            body, first, last = page.section_text(heading)
            out[key] = self.page_value(
                inv,
                key,
                page,
                first,
                None,
                body,
                f"Section '{heading}', lines {first} to {last}, trimmed."
                if first
                else f"Section '{heading}' is empty or absent.",
                doi_index,
            )

        out["contacts"] = [
            self.page_value(
                inv, f"contact:L{n}", page, n, s, s[2:].strip(), "Bullet in the Contacts section.", doi_index
            )
            for n, s in page.sections.get("Contacts", [])
            if s.startswith("- ")
        ]

        out["publications"], out["publication_duplicates_removed"], pub_ids = self.publications(
            inv, PSI_RAW / folder / "publications.csv", doi_index
        )
        out["publications_raw"] = None
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:derived:publication_count",
                source_type="derived",
                investigation_id=inv,
                file=rel(PSI_RAW / folder / "publications.csv"),
                method="count of rows in publications.csv",
                method_version="1",
                inputs=[],
                note="Rows after removing byte-identical duplicates.",
                doi=doi_index,
            )
        )
        out["publication_count"] = value(len(pub_ids), "publications", pid)

        out["data_files"] = self.data_files(inv, index_line, idx, page, doi_index)

        out["table_files"] = [
            self.page_value(
                inv,
                f"table:L{n}",
                page,
                n,
                s,
                s[2:].strip().strip("`"),
                "File listed in the Experiment Table section (path within the investigation folder).",
                doi_index,
            )
            for n, s in page.sections.get("Experiment Table", [])
            if s.startswith("- `")
        ]
        out["table_file_count"] = self.index_value(
            inv,
            "experiment_table_files",
            index_line,
            idx["experiment_table_files"],
            int(idx["experiment_table_files"]) if idx["experiment_table_files"].isdigit() else None,
            "files",
            doi_index,
        )
        out["has_table"] = bool(out["table_files"])
        out["fuel_class"] = self.fuel_class(inv, spec, doi_index)
        out["coverage"] = None
        return out

    def publications(
        self, inv: str, path: Path, doi: str | None
    ) -> tuple[list[dict[str, Any]], list[dict[str, int]], list[int]]:
        header, rows = _csv_rows(path)
        seen: dict[tuple[str, ...], int] = {}
        dups: list[dict[str, int]] = []
        pubs: list[dict[str, Any]] = []
        kept: list[int] = []
        for line, cells in rows:
            key = tuple(cells)
            if key in seen:
                dups.append({"line": line, "duplicate_of": seen[key]})
                continue
            seen[key] = line
            kept.append(line)
            row = dict(zip(header, cells, strict=True))
            pub: dict[str, Any] = {"line": line}
            for col in ("title", "authors", "doi"):
                raw = row[col]
                pid = self.reg.add(
                    Prov(
                        id=f"inv:{inv}:pubs:L{line}:{col}",
                        source_type="psi_page",
                        investigation_id=inv,
                        file=rel(path),
                        row=line,
                        column=col,
                        raw=raw,
                        doi=doi,
                    )
                )
                pub[col] = value(raw.strip() or None, None, pid)
            pubs.append(pub)
        return pubs, dups, kept

    def data_files(self, inv: str, index_line: int, idx: dict[str, str], page: Page, doi: str | None) -> dict[str, Any]:
        heading = _heading(page, "Data files")
        folders: list[dict[str, Any]] = []
        for n, s in page.sections.get(heading or "", []):
            if not s.startswith("| ") or s.startswith("| Folder |") or s.startswith("|---"):
                continue
            name, files, size = (p.strip() for p in s[2:-1].rsplit(" | ", 2))
            folders.append(
                {
                    "folder": self.page_value(
                        inv,
                        f"datafiles:L{n}:folder",
                        page,
                        n,
                        name,
                        name,
                        "Folder column of the Data files table.",
                        doi,
                    ),
                    "files": self.page_value(
                        inv,
                        f"datafiles:L{n}:files",
                        page,
                        n,
                        files,
                        int(files) if files.isdigit() else None,
                        "Files column of the Data files table.",
                        doi,
                        unit="files",
                    ),
                    "size": self.page_value(
                        inv,
                        f"datafiles:L{n}:size",
                        page,
                        n,
                        size,
                        size,
                        "Size column of the Data files table, verbatim.",
                        doi,
                    ),
                }
            )
        count = idx["data_file_count"]
        return {
            "total_size": self.index_value(
                inv,
                "total_data_size",
                index_line,
                idx["total_data_size"],
                idx["total_data_size"].strip() or None,
                None,
                doi,
            ),
            "file_count": self.index_value(
                inv, "data_file_count", index_line, count, int(count) if count.isdigit() else None, "files", doi
            ),
            "folders": folders,
        }

    def fuel_class(self, inv: str, spec: AdapterSpec | None, doi: str | None) -> dict[str, Any]:
        if spec is None:
            pid = self.reg.add(
                Prov(
                    id=f"inv:{inv}:derived:fuel_class",
                    source_type="derived",
                    investigation_id=inv,
                    method="no adapter found for this investigation",
                    method_version="1",
                    inputs=[],
                    doi=doi,
                )
            )
            return value(None, None, pid)
        module = spec.adapt.__module__
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:derived:fuel_class",
                source_type="derived",
                investigation_id=inv,
                method=f"fuel class set in the investigation adapter ({module}.SPEC)",
                method_version="1",
                inputs=[],
                doi=doi,
            )
        )
        return value(spec.fuel_class, None, pid)

    # ---- ground investigation (search record only) ----
    def ground(self, inv: str, rec: dict[str, Any], lines: dict[str, int]) -> dict[str, Any]:
        out: dict[str, Any] = {"id": inv, "in_harvest": False}
        acc = self.search_value(inv, "Accession", "id", rec["Accession"], lines.get("Accession"))
        out["folder"] = self._not_in_search(inv, "folder", "No harvested folder: ground investigation.")
        for key, out_key in SEARCH_FIELDS.items():
            out[out_key] = self.search_value(inv, key, out_key, _search_get(rec, key), lines.get(key))
        out["doi"] = self._not_in_search(
            inv, "doi", "The PSI search record has no DOI field and the investigation page was not harvested."
        )
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:derived:psi_url",
                source_type="derived",
                investigation_id=inv,
                method="PSI investigation page address pattern",
                method_version="1",
                params={"pattern": PSI_PAGE_PATTERN},
                inputs=[acc["p"]],
                note="Not in the PSI search record. Built from the address pattern shared by all 19 harvested "
                "pages; not checked online.",
            )
        )
        out["psi_url"] = value(PSI_PAGE_PATTERN.format(id=inv), None, pid)
        out["licence"] = self._not_in_search(
            inv, "licence", "The PSI search record has no licence field and the investigation page was not harvested."
        )
        out["version"] = self._not_in_search(inv, "version", "The PSI search record has no version field.")
        out["released_submitted"] = self._not_in_search(
            inv, "released_submitted", "The search record gives only a numeric release timestamp; not converted."
        )
        out["contacts"] = None
        out["publications"] = []
        out["publication_duplicates_removed"] = []
        out["publications_raw"] = {
            "titles": self.search_value(
                inv,
                "Publication Title",
                "publication_titles",
                rec.get("Publication Title"),
                lines.get("Publication Title"),
            ),
            "authors": self.search_value(
                inv,
                "Publication Author List",
                "publication_authors",
                rec.get("Publication Author List"),
                lines.get("Publication Author List"),
            ),
        }
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:derived:publication_count",
                source_type="derived",
                investigation_id=inv,
                method="not counted",
                method_version="1",
                inputs=[],
                note="No publications.csv for ground investigations; the search record joins all titles in one "
                "string, so it is not split or counted.",
            )
        )
        out["publication_count"] = value(None, "publications", pid)
        out["data_files"] = None
        out["table_files"] = []
        out["table_file_count"] = None
        out["has_table"] = False
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:derived:fuel_class",
                source_type="derived",
                investigation_id=inv,
                method="ground investigation (Project Type in the PSI search record): modelling, no experiment table",
                method_version="1",
                inputs=[out["project_type"]["p"]],
            )
        )
        out["fuel_class"] = value("model", None, pid)
        out["coverage"] = None
        return out

    def _not_in_search(self, inv: str, key: str, note: str) -> dict[str, Any]:
        pid = self.reg.add(
            Prov(
                id=f"inv:{inv}:search:{key}",
                source_type="psi_page",
                investigation_id=inv,
                file=rel(SEARCH_JSON),
                note=f"PSI search record. {note}",
            )
        )
        return value(None, None, pid)


# ---------------------------------------------------------------- metadata checks


def _metadata_flags(b: _Builder, pages: dict[str, Page], search: dict[str, dict[str, Any]]) -> None:
    """Flag metadata problems, each only after confirming it in the files."""
    saffire1, same = pages.get("PSI-98"), pages.get("PSI-102")
    if saffire1 and same:
        line, raw = saffire1.fields["Investigation dates"]
        same_line, same_raw = same.fields["Investigation dates"]
        json_same = all(
            search["PSI-102"][k] == search["PSI-98"][k] for k in ("Investigation Start Date", "Investigation End Date")
        )
        _, a_line, _ = saffire1.section_text("Approach")
        if raw.strip() == same_raw.strip():
            b.flag(
                "metadata_inconsistent",
                "PSI-98",
                saffire1.rel,
                [line],
                "Investigation dates",
                raw,
                f"SAFFIRE-I investigation dates '{raw.strip()}' (line {line}) are identical to those of "
                f"SAME (PSI-102), {same.rel} line {same_line}"
                + ("; the PSI search records give the same dates for both" if json_same else "")
                + f". SAFFIRE-I's Approach (line {a_line}) places the experiment on the Cygnus vehicle, "
                "so the dates appear copied from SAME.",
            )
        t_line, title = saffire1.fields["Proposal title"]
        obj, o_first, o_last = saffire1.section_text("Objectives")
        _, same_pubs = _csv_rows(same.path.parent / "publications.csv")
        smoke_title = "Smoke: Characterization of Smoke Particulate for Spacecraft Fire Detection"
        smoke_lines = [ln for ln, cells in same_pubs if cells[0].startswith(smoke_title)]
        if "smoke" in title.lower() and obj and "smoke" not in obj.lower() and smoke_lines:
            b.flag(
                "metadata_inconsistent",
                "PSI-98",
                saffire1.rel,
                [t_line],
                "Proposal title",
                title,
                f"SAFFIRE-I's proposal title '{title.strip()}' (line {t_line}) is about smoke, the "
                f"subject of SAME (PSI-102): SAME's publications.csv lines "
                f"{', '.join(map(str, smoke_lines))} have titles beginning '{smoke_title}'. "
                f"SAFFIRE-I's own Objectives (lines {o_first} to {o_last}) concern fire growth and "
                "flammability limits and do not mention smoke. SAME's proposal title is blank, so a copy "
                "cannot be proven from these files.",
            )

    saffire2 = pages.get("PSI-99")
    for inv, name in (("PSI-98", "SAFFIRE-I"), ("PSI-100", "SAFFIRE-III")):
        page = pages.get(inv)
        if page is None:
            continue
        p_line, platform = page.fields["Flight platform"]
        h_line, hardware = page.fields["Hardware"]
        appr, a_first, _ = page.section_text("Approach")
        if "ISS" in platform and "Cygnus" in hardware and appr and "Cygnus" in appr:
            ref = ""
            if saffire2 is not None:
                s_line, s_platform = saffire2.fields["Flight platform"]
                if "Cygnus" in s_platform:
                    ref = f" SAFFIRE-II gives '{s_platform.strip()}' ({saffire2.rel} line {s_line})."
            b.flag(
                "metadata_inconsistent",
                inv,
                page.rel,
                [p_line, h_line, a_first or p_line],
                "Flight platform",
                platform,
                f"{name} flight platform is '{platform.strip()}' (line {p_line}), but the Hardware row "
                f"reads '{hardware.strip()}' (line {h_line}) and the Approach (line {a_first}) says the "
                "experiment was performed on the Cygnus resupply vehicle after it deberthed from the ISS." + ref,
            )

    cfi = pages.get("PSI-39")
    if cfi is not None:
        line, raw = cfi.fields["Investigation dates"]
        years = re.findall(r"\b(\d{4})\b", raw)
        table_rel = next(s[2:].strip().strip("`") for _, s in cfi.sections["Experiment Table"] if s.startswith("- `"))
        table = read_table("PSI-39", "main", f"{cfi.path.parent.name}/{table_rel}")
        dated = [(r.line, r.cells[table.col("Test Date")].strip()) for r in table.rows]
        dated = [(ln, d) for ln, d in dated if d]
        if years and all(y >= "2020" for y in years) and dated and all(d.endswith("-17") for _, d in dated):
            b.flag(
                "metadata_inconsistent",
                "PSI-39",
                cfi.rel,
                [line],
                "Investigation dates",
                raw,
                f"CFI investigation dates are '{raw.strip()}' (line {line}), but all {len(dated)} Test "
                f"Date cells of {table.path} (lines {dated[0][0]} to {dated[-1][0]}) carry the two-digit "
                f"year 17, for example '{dated[0][1]}' on line {dated[0][0]}.",
            )


# ---------------------------------------------------------------- public API


def _specs() -> list[AdapterSpec]:
    from redshift.normalise.run import discover

    return discover()


def build(registry: Registry, flags: FlagLog) -> list[dict[str, Any]]:
    """One record per PSI combustion investigation (24), sorted by PSI number."""
    b = _Builder(registry, flags)
    index = read_index()
    search, search_lines = read_search()
    specs = {s.investigation_id: s for s in _specs()}
    out: list[dict[str, Any]] = []
    pages: dict[str, Page] = {}
    for inv in sorted(search, key=lambda a: int(a.split("-")[1])):
        if inv in index:
            line, idx = index[inv]
            folder = idx["folder"].rstrip("/")
            pages[inv] = read_page(PSI_RAW / folder / f"{folder}.md")
            rec = b.harvested(inv, line, idx, pages[inv], specs.get(inv))
        else:
            rec = b.ground(inv, search[inv], search_lines.get(inv, {}))
        out.append(rec)
    missing = sorted(set(index) - set(search))
    if missing:
        raise ValueError(f"index.csv investigations missing from the PSI search records: {missing}")
    _metadata_flags(b, pages, search)
    return out


def coverage(records: list[TestRecord]) -> dict[str, dict[str, bool | None]]:
    """For each investigation and canonical condition, whether its experiment table records it.

    A condition is recorded when any test record of the investigation carries that field with a provenance id
    that does not start with "missing:". Investigations without an experiment table get None for every field.
    """
    search, _ = read_search()
    with_table = {s.investigation_id for s in _specs()}
    by_inv: dict[str, list[TestRecord]] = {}
    for r in records:
        by_inv.setdefault(r.investigation_id, []).append(r)
    out: dict[str, dict[str, bool | None]] = {}
    for inv in sorted(set(search) | with_table, key=lambda a: int(a.split("-")[1])):
        if inv not in with_table:
            out[inv] = dict.fromkeys(COVERAGE_FIELDS)
            continue
        recs = by_inv.get(inv, [])
        out[inv] = {
            f: any(f in r.fields and not str(r.fields[f]["p"]).startswith("missing:") for r in recs)
            for f in COVERAGE_FIELDS
        }
    return out
