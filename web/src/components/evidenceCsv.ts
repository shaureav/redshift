// CSV export of the tests currently shown in the Evidence Explorer. Values are written exactly as
// stored in the snapshot (no rounding, no unit conversion), each next to its provenance id.
import type { DatasetVersion, TestRow } from "../lib/types";

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = Array.isArray(value) ? value.join(";") : String(value);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const META_COLUMNS = [
  "test_id", "investigation_id", "investigation", "fuel_class", "test_kind", "source_type",
  "table_file", "source_row", "doi", "verified", "flags",
] as const;

export function evidenceCsv(rows: readonly TestRow[], fieldKeys: readonly string[], version: DatasetVersion | undefined, viewUrl?: string): string {
  const dois = [...new Set(rows.map((r) => r.doi).filter(Boolean))].sort();
  const lines: string[] = [];
  lines.push(
    `# Redshift Evidence Explorer export. Dataset version ${version?.version ?? "unknown"}; retrieved ${version?.retrieved ?? "unknown"}; content sha256 ${version?.content_sha256 ?? "unknown"}. Values as stored; each value column is followed by its provenance id (see provenance.json).`,
  );
  lines.push(`# Citations (DOIs present in this export): ${dois.join(" ")}`);
  if (version?.cite) lines.push(`# Cite the dataset as: ${version.cite}`);
  if (viewUrl) lines.push(`# View: ${viewUrl}`);
  const header: string[] = [...META_COLUMNS];
  for (const k of fieldKeys) header.push(k, `${k}_provenance`);
  lines.push(header.map(csvCell).join(","));
  for (const r of rows) {
    const cells: unknown[] = [
      r.test_id, r.investigation_id, r.investigation, r.fuel_class, r.test_kind, r.source_type,
      r.table_file, r.source_row, r.doi, r.verified, r.flags.join(";"),
    ];
    for (const k of fieldKeys) {
      const f = r.fields[k];
      cells.push(f ? f.v : null, f ? f.p : null);
    }
    lines.push(cells.map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function evidenceCsvFilename(version: DatasetVersion | undefined): string {
  const v = (version?.version ?? "unversioned").replace(/[^A-Za-z0-9._+-]+/g, "-");
  return `redshift-evidence-${v}.csv`;
}

export function downloadText(text: string, filename: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
