// <Value> is the only way a number reaches the screen. It renders the value and opens a popover with
// its provenance: source type, investigation, file, line, column, raw text, transforms, DOI and
// verification status. A null value renders as "not recorded", still with its source.
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useProvenance } from "../lib/data";
import { doiUrl, fmtNumber, ntrsUrl, SOURCE_LABEL } from "../lib/format";
import type { Prov, Val } from "../lib/types";

interface ValueProps {
  val: Val | null | undefined;
  digits?: number;
  unit?: string | false; // override or hide the unit
  className?: string;
  emptyText?: string;
  approximate?: boolean;
}

export function Value({ val, digits, unit, className = "", emptyText = "not recorded", approximate }: ValueProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popId = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!val) return <span className="text-ink-3 italic">{emptyText}</span>;
  const u = unit === false ? "" : unit ?? val.u ?? "";
  const isNum = typeof val.v === "number";
  const text =
    val.v === null
      ? emptyText
      : isNum
        ? `${approximate ? "about " : ""}${fmtNumber(val.v as number, digits)}${u ? (u === "%" ? "%" : ` ${u}`) : ""}`
        : String(val.v);
  const derived = val.p.startsWith("ft:") || val.p.startsWith("near") || val.p.startsWith("planner") ||
    val.p.startsWith("gap") || val.p.startsWith("flex") || val.p.startsWith("sens") || val.p.startsWith("summary");
  return (
    <span ref={ref} className={`relative inline-block ${className}`} data-prov={val.p}>
      <button
        type="button"
        className={`num underline decoration-dotted decoration-ink-3 underline-offset-2 hover:decoration-solid ${
          val.v === null ? "text-ink-3 italic" : ""
        } ${derived ? "italic" : ""}`}
        aria-expanded={open}
        aria-controls={popId}
        aria-label={`${text}. Show source`}
        onClick={() => setOpen((o) => !o)}
      >
        {text}
      </button>
      {open && <ProvPopover id={popId} provId={val.p} onClose={() => setOpen(false)} />}
    </span>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-0.5">
      <dt className="text-ink-3">{k}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

export function ProvDetails({ prov }: { prov: Prov }) {
  return (
    <dl className="text-xs leading-snug">
      <Row k="Source type">
        {SOURCE_LABEL[prov.source_type] ?? prov.source_type}
        {prov.source_type === "published_paper" && (
          <span className="ml-1">{prov.verified ? "(human verified)" : "(not yet verified)"}</span>
        )}
      </Row>
      {prov.investigation_id && <Row k="Investigation"><Link className="underline" to={`/investigations?open=${prov.investigation_id}`}>{prov.investigation_id}</Link></Row>}
      {prov.file && <Row k="File"><span className="mono">{prov.file}</span></Row>}
      {prov.row !== undefined && <Row k="Line">{prov.row}</Row>}
      {prov.page !== undefined && <Row k="Page">{prov.page}</Row>}
      {prov.column && <Row k="Column"><span className="mono">{prov.column}</span></Row>}
      {prov.raw !== undefined && <Row k="Raw text"><span className="mono">"{prov.raw}"</span></Row>}
      {prov.quote && <Row k="Quote"><q className="italic">{prov.quote}</q></Row>}
      {prov.transforms && prov.transforms.length > 0 && <Row k="Transforms">{prov.transforms.join(", ")}</Row>}
      {prov.method && <Row k="Method">{prov.method}{prov.method_version ? ` (v${prov.method_version})` : ""}</Row>}
      {prov.params && <Row k="Parameters"><span className="mono">{JSON.stringify(prov.params).slice(0, 400)}</span></Row>}
      {prov.inputs && prov.inputs.length > 0 && (
        <Row k="Inputs">
          {prov.inputs.length} {prov.inputs.length === 1 ? "record" : "records"}
          {prov.inputs[0]?.includes("-L") && (
            <Link className="ml-1 underline" to={`/evidence?ids=${encodeURIComponent(prov.inputs.slice(0, 400).join(","))}`}>
              view
            </Link>
          )}
        </Row>
      )}
      {prov.note && <Row k="Note">{prov.note}</Row>}
      {prov.doi && <Row k="DOI"><a className="mono underline" href={doiUrl(prov.doi)} target="_blank" rel="noreferrer">{prov.doi}</a></Row>}
      {prov.ntrs && <Row k="NTRS"><a className="mono underline" href={ntrsUrl(prov.ntrs)} target="_blank" rel="noreferrer">{prov.ntrs}</a></Row>}
      {prov.verified_by && <Row k="Verified by">{prov.verified_by} ({prov.verified_at})</Row>}
      <Row k="Provenance id"><span className="mono">{prov.id}</span></Row>
    </dl>
  );
}

function ProvPopover({ id, provId, onClose }: { id: string; provId: string; onClose: () => void }) {
  const { data, isLoading, error } = useProvenance(true);
  const prov = data?.[provId];
  return (
    <div
      id={id}
      role="dialog"
      aria-label="Source of this value"
      className="absolute left-0 top-full z-50 mt-1 w-[22rem] max-w-[85vw] rounded-lg border border-line bg-surface-2 p-3 text-left text-ink shadow-xl"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">Where this number comes from</span>
        <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>
      {isLoading && <p className="text-xs text-ink-3">Loading provenance...</p>}
      {error && <p className="text-xs">Provenance could not be loaded.</p>}
      {prov && <ProvDetails prov={prov} />}
      {data && !prov && <p className="text-xs">No provenance record found for {provId}.</p>}
    </div>
  );
}

export function Pressure({ psi, kpa, digits = 1 }: { psi: Val | null | undefined; kpa: Val | null | undefined; digits?: number }) {
  if (!psi || psi.v === null) return <Value val={kpa ?? psi} />;
  return (
    <span className="whitespace-nowrap">
      <Value val={psi} digits={digits} /> <span className="text-ink-3">(</span>
      <Value val={kpa} digits={1} />
      <span className="text-ink-3">)</span>
    </span>
  );
}
