// The provenance drawer: everything known about one test row, with the source of every value.
import { useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";
import { useProvenance } from "../lib/data";
import { doiUrl, FUEL_LABEL, SOURCE_LABEL } from "../lib/format";
import type { FlagEntry, TestRow } from "../lib/types";
import { FuelMarker } from "./Common";
import { FieldValue, fieldLabel, FlagLink, orderedFieldKeys, SeverityBadge } from "./evidenceShared";
import { Pressure, ProvDetails } from "./Value";

interface DrawerProps {
  row: TestRow;
  flags: Map<string, FlagEntry> | undefined;
  onClose: () => void;
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="border-t border-line px-5 py-4" aria-labelledby={id}>
      <h3 id={id} className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-2">{title}</h3>
      {children}
    </section>
  );
}

export function EvidenceDrawer({ row, flags, onClose }: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prov = useProvenance(true);
  const keys = orderedFieldKeys([row]);

  // Focus moves into the drawer on open and returns to where it came from on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [row.test_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A value's source popover inside the drawer closes first.
      if (panelRef.current?.querySelector('[aria-label="Source of this value"]')) return;
      onClose();
    };
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", onTab);
    };
  }, [onClose]);

  const shownKeys = keys.filter((k) => k !== "pressure_kpa");
  const rawEntries = Object.entries(row.raw ?? {});

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close test details" tabIndex={-1} className="absolute inset-0 cursor-default bg-[color:var(--ink)] opacity-30" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-[40rem] flex-col overflow-y-auto border-l border-line bg-surface-2 text-ink shadow-2xl"
      >
        <header className="sticky top-0 z-10 border-b border-line bg-surface-2 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Test record</p>
              <h2 id={titleId} className="mono break-all text-lg font-semibold">{row.test_id}</h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-3"
            >
              Close
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <div className="flex gap-2"><dt className="text-ink-3">Investigation</dt><dd><Link className="underline" to={`/investigations?open=${encodeURIComponent(row.investigation_id)}`}>{row.investigation}</Link> <span className="mono text-ink-3">{row.investigation_id}</span></dd></div>
            <div className="flex items-center gap-2"><dt className="text-ink-3">Fuel class</dt><dd className="flex items-center gap-1.5"><FuelMarker fuel={row.fuel_class} /> {FUEL_LABEL[row.fuel_class] ?? row.fuel_class}</dd></div>
            <div className="flex gap-2"><dt className="text-ink-3">Source type</dt><dd>{SOURCE_LABEL[row.source_type] ?? row.source_type}</dd></div>
            <div className="flex gap-2"><dt className="text-ink-3">Test kind</dt><dd className="mono">{row.test_kind}</dd></div>
            <div className="flex gap-2 sm:col-span-2"><dt className="text-ink-3">DOI</dt><dd><a className="mono underline" href={doiUrl(row.doi)} target="_blank" rel="noreferrer">{row.doi}</a></dd></div>
          </dl>
        </header>

        <Section title="Recorded values" id={`${titleId}-values`}>
          <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
            {shownKeys.map((k) => (
              <div key={k} className="contents">
                <dt className="text-ink-3">{k === "pressure_psi" ? "Pressure" : fieldLabel(k)}</dt>
                <dd className="min-w-0 break-words">
                  {k === "pressure_psi" ? <Pressure psi={row.fields.pressure_psi} kpa={row.fields.pressure_kpa} /> : <FieldValue val={row.fields[k]} k={k} />}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-3">Select any value to see where it comes from. Italic grey text means the table does not record that condition.</p>
        </Section>

        <Section title="Provenance of each value" id={`${titleId}-prov`}>
          {prov.isLoading && <p className="text-xs text-ink-3">Loading provenance...</p>}
          {prov.error && <p className="text-xs">Provenance could not be loaded.</p>}
          {prov.data && (
            <div className="flex flex-col gap-2">
              {keys.map((k) => {
                const val = row.fields[k];
                const rec = val ? prov.data[val.p] : undefined;
                return (
                  <details key={k} className="rounded-md border border-line bg-surface px-3 py-2" open>
                    <summary className="cursor-pointer text-sm">
                      <span className="font-medium">{fieldLabel(k)}</span>{" "}
                      <span className="mono break-all text-xs text-ink-3">{val?.p}</span>
                    </summary>
                    <div className="mt-2">
                      {rec ? <ProvDetails prov={rec} /> : <p className="text-xs">No provenance record found for <span className="mono">{val?.p}</span>.</p>}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Raw row, verbatim" id={`${titleId}-raw`}>
          <p className="mb-2 text-xs text-ink-3">
            <span className="mono break-all">{row.table_file}</span>, line {row.source_row}
          </p>
          {rawEntries.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Raw cells of this row, as published</caption>
                <thead className="text-left text-ink-3">
                  <tr><th scope="col" className="py-1 pr-3 font-medium">Header</th><th scope="col" className="py-1 font-medium">Raw cell</th></tr>
                </thead>
                <tbody>
                  {rawEntries.map(([h, v]) => (
                    <tr key={h} className="border-t border-line align-top">
                      <th scope="row" className="mono py-1 pr-3 text-left font-normal text-ink-2">{h}</th>
                      <td className="mono whitespace-pre-wrap break-all py-1">{v === "" ? <span className="italic text-ink-3">empty</span> : `"${v}"`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-ink-3">No raw cells stored for this row.</p>
          )}
        </Section>

        <Section title="Data quality flags" id={`${titleId}-flags`}>
          {row.flags.length === 0 ? (
            <p className="text-xs text-ink-2">No flags for this row.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {row.flags.map((id) => {
                const fl = flags?.get(id);
                return (
                  <li key={id} className="rounded-md border border-line bg-surface px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <FlagLink id={id} />
                      {fl && <SeverityBadge severity={fl.severity} />}
                      {fl && <span className="font-medium text-ink">{fl.title}</span>}
                    </div>
                    {fl && <p className="mt-1 text-ink-2">{fl.detail}</p>}
                    {fl && <p className="mt-0.5 text-ink-3">{fl.action}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Cite" id={`${titleId}-cite`}>
          <p className="text-xs text-ink-2">
            Investigation dataset DOI:{" "}
            <a className="mono underline" href={doiUrl(row.doi)} target="_blank" rel="noreferrer">{row.doi}</a>
          </p>
        </Section>
      </div>
    </div>
  );
}
