// URL state, sorting and filtering for the Investigations screen. Sorting orders cards by a
// reproducible measure from the snapshot; it is an ordering, never a score.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { COVERAGE_KEYS, INV_CLASSES, type InvClass, type InvRecord, invClass, invName, parsePsiDate } from "./investigationsShared";

export type SortKey = "start" | "tests" | "vars" | "acronym";
export type SortDir = "asc" | "desc";
export type TableFilter = "all" | "yes" | "no";

export const SORT_LABEL: Record<SortKey, string> = {
  start: "Start date",
  tests: "Number of tests",
  vars: "Variables recorded",
  acronym: "Acronym",
};

const DEFAULT_DIR: Record<SortKey, SortDir> = { start: "asc", tests: "desc", vars: "desc", acronym: "asc" };
export const MAX_COMPARE = 4;
export const MIN_COMPARE = 2;

function sortValue(r: InvRecord, k: SortKey): number | string | null {
  switch (k) {
    case "tests":
      return r.stats?.n_tests?.v ?? null;
    case "vars":
      // Ordering key only (never displayed): how many coverage columns the table records.
      return r.has_table ? COVERAGE_KEYS.filter((c) => r.coverage?.[c] === true).length : null;
    case "start":
      return parsePsiDate(r.start_date?.v)?.getTime() ?? null;
    default:
      return invName(r).toLocaleLowerCase("en-GB");
  }
}

export function sortInvestigations(items: InvRecord[], k: SortKey, dir: SortDir): InvRecord[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = sortValue(a, k);
    const vb = sortValue(b, k);
    // Missing values always go last, whichever the direction.
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null && va !== vb) {
      const c = typeof va === "string" ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      if (c !== 0) return c * sign;
    }
    return invName(a).localeCompare(invName(b));
  });
}

export function filterInvestigations(items: InvRecord[], classes: Set<InvClass>, table: TableFilter): InvRecord[] {
  return items.filter((r) => {
    if (classes.size && !classes.has(invClass(r))) return false;
    if (table === "yes" && !r.has_table) return false;
    if (table === "no" && r.has_table) return false;
    return true;
  });
}

const splitIds = (s: string | null) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);

export function useInvestigationsState() {
  const [sp, setSp] = useSearchParams();
  const sortRaw = sp.get("sort") as SortKey | null;
  const sort: SortKey = sortRaw && sortRaw in SORT_LABEL ? sortRaw : "start";
  const dirRaw = sp.get("dir");
  const dir: SortDir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : DEFAULT_DIR[sort];
  const fuelParam = sp.get("fuel");
  const classes = useMemo(() => new Set(splitIds(fuelParam).filter((c): c is InvClass => (INV_CLASSES as string[]).includes(c))), [fuelParam]);
  const tableRaw = sp.get("table");
  const table: TableFilter = tableRaw === "yes" || tableRaw === "no" ? tableRaw : "all";
  const selParam = sp.get("sel");
  const selected = useMemo(() => [...new Set(splitIds(selParam))].slice(0, MAX_COMPARE), [selParam]);
  const openId = sp.get("open");

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  return {
    sort,
    dir,
    classes,
    table,
    selected,
    openId,
    setSort: (k: SortKey) => update({ sort: k === "start" ? null : k, dir: null }),
    toggleDir: () => {
      const nd: SortDir = dir === "asc" ? "desc" : "asc";
      update({ dir: nd === DEFAULT_DIR[sort] ? null : nd });
    },
    toggleClass: (c: InvClass) => {
      const s = new Set(classes);
      if (s.has(c)) s.delete(c);
      else s.add(c);
      update({ fuel: [...s].join(",") || null });
    },
    setTable: (t: TableFilter) => update({ table: t === "all" ? null : t }),
    toggleSelected: (id: string) => {
      const s = selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < MAX_COMPARE ? [...selected, id] : selected;
      update({ sel: s.join(",") || null });
    },
    clearSelected: () => update({ sel: null }),
    setOpen: (id: string | null) => update({ open: id }),
    resetFilters: () => update({ fuel: null, table: null }),
  };
}
