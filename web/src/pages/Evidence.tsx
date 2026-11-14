// Evidence Explorer: every test row in the snapshot, with its source one click away. All view state
// (filters, sort, visible columns, page, open test) lives in the URL so any view can be shared.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingFn, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { ErrorNote, FuelMarker, Loading, PageHeader } from "../components/Common";
import { evidenceCsv, evidenceCsvFilename, downloadText } from "../components/evidenceCsv";
import { EvidenceDrawer } from "../components/evidenceDrawer";
import { EvidenceColumnMenu, EvidenceFilterBar, EvidencePager } from "../components/evidenceControls";
import { FieldValue, fieldLabel, fileBase, FlagLink, orderedFieldKeys, type QualityReport, type TestsFile } from "../components/evidenceShared";
import { Pressure, Value } from "../components/Value";
import { dataUrl, useData } from "../lib/data";
import { countMatching, applyFilters, parseFilters, writeFilters, type EvidenceFilters } from "../lib/filters";
import { doiUrl, FUEL_LABEL, SOURCE_LABEL } from "../lib/format";
import type { DatasetVersion, FlagEntry, TestRow, Val } from "../lib/types";

const PAGE_SIZE = 50;

export const DEFAULT_COLUMNS = [
  "test_id", "investigation", "fuel_class", "source_type", "o2_pct", "pressure", "co2_pct",
  "flow_cm_s", "fuel", "material", "outcome_label", "flags",
];

const NUMERIC = new Set(["o2_pct", "o2_list_pct", "pressure", "co2_pct", "he_pct", "n2_pct", "flow_cm_s", "fuel_conc_pct", "n_flames"]);
const WIDE = new Set(["notes", "material", "o2_basis", "table_file"]);

// Sort key for a stored value: missing values sort last in either direction (never as zero).
function sortKey(val: Val | undefined): number | string | undefined {
  if (!val || val.v === null || val.v === undefined) return undefined;
  if (Array.isArray(val.v)) return (val.v as (number | string)[])[0];
  return val.v;
}

const mixedSort: SortingFn<TestRow> = (a, b, id) => {
  const x = a.getValue<number | string>(id);
  const y = b.getValue<number | string>(id);
  if (typeof x === "number" && typeof y === "number") return x === y ? 0 : x < y ? -1 : 1;
  return String(x).localeCompare(String(y), "en-GB", { numeric: true, sensitivity: "base" });
};

function buildColumns(fieldKeys: string[], open: (id: string) => void): ColumnDef<TestRow>[] {
  const meta: ColumnDef<TestRow>[] = [
    {
      id: "test_id",
      header: "Test id",
      accessorFn: (r) => r.test_id,
      sortingFn: mixedSort,
      enableHiding: false,
      cell: ({ row }) => (
        <button
          type="button"
          className="mono text-left text-xs text-accent underline underline-offset-2 hover:no-underline"
          onClick={() => open(row.original.test_id)}
          aria-label={`Open the record and provenance of test ${row.original.test_id}`}
        >
          {row.original.test_id}
        </button>
      ),
    },
    {
      id: "investigation",
      header: "Investigation",
      accessorFn: (r) => r.investigation,
      sortingFn: mixedSort,
      cell: ({ row }) => (
        <span className="flex flex-col leading-tight">
          <span>{row.original.investigation}</span>
          <span className="mono text-[11px] text-ink-3">{row.original.investigation_id}</span>
        </span>
      ),
    },
    {
      id: "fuel_class",
      header: "Fuel class",
      accessorFn: (r) => r.fuel_class,
      sortingFn: mixedSort,
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <FuelMarker fuel={row.original.fuel_class} /> {FUEL_LABEL[row.original.fuel_class] ?? row.original.fuel_class}
        </span>
      ),
    },
    {
      id: "source_type",
      header: "Source type",
      accessorFn: (r) => r.source_type,
      sortingFn: mixedSort,
      cell: ({ row }) => <span className="whitespace-nowrap">{SOURCE_LABEL[row.original.source_type] ?? row.original.source_type}</span>,
    },
    {
      id: "test_kind",
      header: "Test kind",
      accessorFn: (r) => r.test_kind,
      sortingFn: mixedSort,
      cell: ({ row }) => <span className="mono text-xs">{row.original.test_kind}</span>,
    },
  ];

  const fields: ColumnDef<TestRow>[] = [];
  for (const k of fieldKeys) {
    // Pressure is always written in psi with kPa beside it, so the two stored fields share one column.
    if (k === "pressure_kpa") continue;
    if (k === "pressure_psi") {
      fields.push({
        id: "pressure",
        header: "Pressure psi (kPa)",
        accessorFn: (r) => sortKey(r.fields.pressure_psi) ?? sortKey(r.fields.pressure_kpa),
        sortingFn: mixedSort,
        sortUndefined: "last",
        cell: ({ row }) => <Pressure psi={row.original.fields.pressure_psi} kpa={row.original.fields.pressure_kpa} />,
      });
      continue;
    }
    fields.push({
      id: k,
      header: fieldLabel(k),
      accessorFn: (r) => sortKey(r.fields[k]),
      sortingFn: mixedSort,
      sortUndefined: "last",
      cell: ({ row }) => <FieldValue val={row.original.fields[k]} k={k} />,
    });
  }

  const tail: ColumnDef<TestRow>[] = [
    {
      id: "flags",
      header: "Flags",
      accessorFn: (r) => r.flags.length,
      sortingFn: "basic",
      cell: ({ row }) =>
        row.original.flags.length ? (
          <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
            {row.original.flags.map((f) => <FlagLink key={f} id={f} />)}
          </span>
        ) : (
          <span className="text-xs text-ink-3">none</span>
        ),
    },
    {
      id: "table_file",
      header: "Table file",
      accessorFn: (r) => r.table_file,
      sortingFn: mixedSort,
      cell: ({ row }) => <span className="mono text-xs" title={row.original.table_file}>{fileBase(row.original.table_file)}</span>,
    },
    {
      id: "doi",
      header: "DOI",
      accessorFn: (r) => r.doi,
      sortingFn: mixedSort,
      cell: ({ row }) => (
        <a className="mono text-xs underline" href={doiUrl(row.original.doi)} target="_blank" rel="noreferrer">{row.original.doi}</a>
      ),
    },
    {
      id: "verified",
      header: "Row check",
      accessorFn: (r) => (r.verified ? "verified" : "not verified"),
      sortingFn: mixedSort,
      cell: ({ row }) => <span className="text-xs">{row.original.verified ? "verified" : "not verified"}</span>,
    },
  ];
  return [...meta, ...fields, ...tail];
}

function readSort(sp: URLSearchParams): SortingState {
  const s = sp.get("sort");
  if (!s) return [];
  return [{ id: s.replace(/^-/, ""), desc: s.startsWith("-") }];
}

export default function Evidence() {
  const tests = useData<TestsFile>("tests.json");
  const quality = useData<QualityReport>("quality_report.json");
  const version = useData<DatasetVersion>("dataset_version.json");
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(() => parseFilters(sp), [sp]);
  const sorting = useMemo(() => readSort(sp), [sp]);
  const colsParam = sp.get("cols");
  const openId = sp.get("test");
  const pageParam = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);

  const update = useCallback(
    (fn: (next: URLSearchParams) => void, opts: { resetPage?: boolean } = {}) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          fn(next);
          if (opts.resetPage) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const setFilters = useCallback(
    (f: EvidenceFilters) => {
      setSp((prev) => {
        const next = writeFilters(f, prev);
        next.delete("page");
        return next;
      }, { replace: true });
    },
    [setSp],
  );

  const openTest = useCallback((id: string | null) => update((n) => (id ? n.set("test", id) : n.delete("test"))), [update]);

  const rows = useMemo(() => tests.data?.tests ?? [], [tests.data]);
  const fieldKeys = useMemo(() => orderedFieldKeys(rows), [rows]);
  const columns = useMemo(() => buildColumns(fieldKeys, (id) => openTest(id)), [fieldKeys, openTest]);
  const allColumnIds = useMemo(() => columns.map((c) => c.id as string), [columns]);

  const visibility: VisibilityState = useMemo(() => {
    const visible = new Set(colsParam ? colsParam.split(",") : DEFAULT_COLUMNS);
    visible.add("test_id");
    return Object.fromEntries(allColumnIds.map((id) => [id, visible.has(id)]));
  }, [colsParam, allColumnIds]);

  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const shownCount = useMemo(() => countMatching(rows, filters), [rows, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageIndex = Math.min(pageParam, pageCount) - 1;

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility: visibility, pagination: { pageIndex, pageSize: PAGE_SIZE } },
    getRowId: (r) => r.test_id,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      update((n) => {
        if (next.length) n.set("sort", `${next[0].desc ? "-" : ""}${next[0].id}`);
        else n.delete("sort");
      }, { resetPage: true });
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize: PAGE_SIZE }) : updater;
      update((n) => (next.pageIndex > 0 ? n.set("page", String(next.pageIndex + 1)) : n.delete("page")));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualFiltering: true,
    autoResetPageIndex: false,
    enableSortingRemoval: true,
    sortDescFirst: false,
  });

  const setVisible = (ids: string[] | null) =>
    update((n) => {
      if (!ids) n.delete("cols");
      else n.set("cols", ids.join(","));
    });

  // A deep link to a single test opens its record straight away.
  const singleLinked = filters.ids && filters.ids.length === 1 ? filters.ids[0] : null;
  const [autoOpened, setAutoOpened] = useState<string | null>(null);
  useEffect(() => {
    if (singleLinked && !openId && autoOpened !== singleLinked && rows.some((r) => r.test_id === singleLinked)) {
      setAutoOpened(singleLinked);
      openTest(singleLinked);
    }
  }, [singleLinked, openId, autoOpened, rows, openTest]);

  const flagMap = useMemo(() => new Map<string, FlagEntry>((quality.data?.flags ?? []).map((f) => [f.id, f])), [quality.data]);
  const investigations = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.investigation_id, r.investigation);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "en-GB"));
  }, [rows]);
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.test_kind))].sort(), [rows]);
  const fuels = useMemo(() => {
    const order = ["gas", "droplet", "solid", "emulator", "none"];
    const present = new Set(rows.map((r) => r.fuel_class as string));
    return order.filter((f) => present.has(f));
  }, [rows]);

  const openRow = openId ? rows.find((r) => r.test_id === openId) : undefined;

  const exportCsv = () => {
    const shown = table.getPrePaginationRowModel().rows.map((r) => r.original);
    downloadText(evidenceCsv(shown, fieldKeys, version.data, window.location.href), evidenceCsvFilename(version.data));
  };

  if (tests.error) return <ErrorNote error={tests.error} />;
  if (!tests.data) return <Loading what="the test records" />;

  const columnChoices = table.getAllLeafColumns().map((c) => ({
    id: c.id,
    label: typeof c.columnDef.header === "string" ? c.columnDef.header : c.id,
    canHide: c.getCanHide(),
    visible: c.getIsVisible(),
  }));

  return (
    <div>
      <PageHeader
        title="Evidence Explorer"
        lead={
          <>
            Every test record in the snapshot, one row per test, as published in the NASA PSI experiment tables. Select a test id
            (or a row) to see every value with its file, line, column and raw text. Absence here means no tests recorded, not low
            risk. Published paper findings are listed separately on{" "}
            <Link className="underline" to="/quality#findings">Data Quality</Link> once a person has verified them.
          </>
        }
      />

      <EvidenceFilterBar
        filters={filters}
        onChange={setFilters}
        investigations={investigations}
        kinds={kinds}
        fuels={fuels}
      />

      <div className="mb-2 mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2" aria-live="polite">
          Showing <span className="num font-semibold text-ink">{shownCount.toLocaleString("en-GB")}</span>
          {quality.data ? (
            <> of <Value val={quality.data.summary.tests} /></>
          ) : (
            " tests"
          )}
          <span className="text-ink-3">. Source type: {SOURCE_LABEL.psi_table}.</span>
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <EvidenceColumnMenu
            columns={columnChoices}
            onChange={setVisible}
            defaults={DEFAULT_COLUMNS}
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={shownCount === 0}
            className="rounded border border-line px-2.5 py-1.5 hover:bg-surface-3 disabled:opacity-50"
          >
            Download shown tests (CSV)
          </button>
          <a className="rounded border border-line px-2.5 py-1.5 hover:bg-surface-3" href={dataUrl("tests.csv")} download>
            Full tests.csv
          </a>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="max-h-[72vh] overflow-auto" role="region" aria-label="Test records table" tabIndex={0}>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Test records from the PSI experiment tables. Column headers sort the table. Select a test id to open its provenance.
            </caption>
            <thead className="sticky top-0 z-10 bg-surface-3 text-left text-xs text-ink-2">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted();
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${NUMERIC.has(h.column.id) ? "text-right" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-ink"
                          title="Sort by this column"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span aria-hidden="true" className={sorted ? "text-accent" : "text-ink-3 opacity-50"}>
                            {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-line align-top hover:bg-surface-3 ${r.id === openId ? "bg-surface-3" : ""}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a, summary, input, [role=dialog]")) return;
                    openTest(r.original.test_id);
                  }}
                >
                  {r.getVisibleCells().map((c) => (
                    <td
                      key={c.id}
                      className={`px-3 py-1.5 ${NUMERIC.has(c.column.id) ? "whitespace-nowrap text-right" : WIDE.has(c.column.id) ? "min-w-[14rem]" : "whitespace-nowrap"}`}
                    >
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {shownCount === 0 && (
            <p className="hatch-bg m-4 rounded-md border border-line p-4 text-sm">
              <span className="rounded bg-surface-2 px-1.5 py-0.5">No tests recorded match these filters.</span>
            </p>
          )}
        </div>
        <EvidencePager
          pageIndex={pageIndex}
          pageCount={pageCount}
          onPage={(i) => table.setPageIndex(i)}
        />
      </div>

      <p className="mt-3 text-xs text-ink-3">
        Values are shown as stored in the snapshot; select any value for its source. Italic grey text means the table records no
        value for that condition. Outcome labels are quoted verbatim from the source table. Pressure is shown in psi with kPa beside it.
      </p>

      {openRow && <EvidenceDrawer row={openRow} flags={flagMap} onClose={() => openTest(null)} />}
      {openId && !openRow && rows.length > 0 && (
        <div role="status" className="fixed bottom-4 right-4 z-50 rounded-md border border-line bg-surface-2 p-3 text-sm shadow-lg">
          No test with id <span className="mono">{openId}</span> in this snapshot.{" "}
          <button type="button" className="underline" onClick={() => openTest(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
