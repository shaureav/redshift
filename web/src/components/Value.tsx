// <Value> is the only way a number reaches the screen. It renders the value and, on click or Enter,
// opens the provenance card: the value's whole path from source to screen (file, line, column and raw
// text; or paper, page and quote; or method, parameters and inputs), then the transforms, the DOI and the
// verification status. A null value renders as "not recorded", still with its source.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

export function valueText(val: Val, digits?: number, unit?: string | false, approximate?: boolean, emptyText = "not recorded"): string {
  const u = unit === false ? "" : unit ?? val.u ?? "";
  if (val.v === null || val.v === undefined) return emptyText;
  if (typeof val.v !== "number") return String(val.v);
  return `${approximate ? "about " : ""}${fmtNumber(val.v, digits)}${u ? (u === "%" ? "%" : ` ${u}`) : ""}`;
}

const isDerived = (p: string) => /^(ft:|near|planner|gap|flex|sens|summary|probe|o2match|state:|map:|dist:)/.test(p);

export function Value({ val, digits, unit, className = "", emptyText = "not recorded", approximate }: ValueProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const popId = useId();
  const close = useCallback(() => {
    setOpen(false);
    btn.current?.focus();
  }, []);
  if (!val) return <span className="italic text-ink-3">{emptyText}</span>;
  const text = valueText(val, digits, unit, approximate, emptyText);
  return (
    <span className={`relative inline ${className}`} data-prov={val.p}>
      <button
        ref={btn}
        type="button"
        // Quiet doors (plan, principle 3): the dotted underline appears only on hover and on keyboard focus, where
        // the focus ring also shows; the accessible name says the number opens its source either way.
        className={`num rounded-sm underline decoration-dotted decoration-transparent underline-offset-[3px] transition-colors hover:decoration-[color:var(--ink-2)] focus-visible:decoration-[color:var(--ink-2)] ${
          val.v === null ? "italic text-ink-3" : ""
        } ${isDerived(val.p) ? "italic" : ""}`}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-haspopup="dialog"
        aria-label={`${text}. Show where this number comes from`}
        onClick={() => setOpen((o) => !o)}
      >
        {text}
      </button>
      {open && <ProvPopover id={popId} anchor={btn} provId={val.p} shown={text} onClose={close} />}
    </span>
  );
}

// ---------- the provenance card ----------

const SOURCE_GLYPH: Record<string, ReactNode> = {
  psi_table: <rect x="2" y="2" width="8" height="8" fill="currentColor" />,
  psi_page: <path d="M2 2h8v8H2z" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  published_paper: <path d="M2 2h8v8H2z" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  reference_document: <path d="M3 4h2v3H3zM7 4h2v3H7z" fill="currentColor" />,
  derived: <text x="2" y="10.5" fontSize="12" fontStyle="italic" fill="currentColor">f</text>,
};

function Step({ label, children, last = false }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative grid grid-cols-[16px_1fr] gap-x-2 pb-3 last:pb-0">
      <span aria-hidden="true" className="relative flex justify-center">
        <span className={`mt-1.5 block h-2 w-2 rounded-full ${last ? "border border-[color:var(--ink-2)]" : "bg-[color:var(--ink-2)]"}`} style={{ width: 8, height: 8 }} />
        {!last && <span className="absolute left-1/2 top-4 bottom-[-4px] w-px -translate-x-1/2 bg-[color:var(--line-strong)]" />}
      </span>
      <div className="min-w-0">
        <div className="eyebrow">{label}</div>
        <div className="mt-0.5 break-words text-sm text-ink">{children}</div>
      </div>
    </li>
  );
}

function paramRows(params: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  const walk = (prefix: string, v: unknown) => {
    if (out.length >= 10) return;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(prefix ? `${prefix}.${k}` : k, x);
    } else {
      out.push([prefix.replace(/_/g, " "), Array.isArray(v) ? v.join(", ") : String(v)]);
    }
  };
  walk("", params);
  return out;
}

export function ProvTrace({ prov, shown }: { prov: Prov; shown?: string }) {
  const steps: ReactNode[] = [];
  if (prov.source_type === "derived") {
    steps.push(<Step key="m" label="Computed by">{prov.method ?? "pipeline calculation"}{prov.method_version ? <span className="text-ink-3"> (v{prov.method_version})</span> : null}</Step>);
    if (prov.params && Object.keys(prov.params).length) {
      steps.push(
        <Step key="p" label="Parameters">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
            {paramRows(prov.params).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="mono break-all">{v}</dd></div>
            ))}
          </dl>
        </Step>,
      );
    }
    if (prov.inputs && prov.inputs.length) {
      const testish = prov.inputs[0]?.includes("-L");
      steps.push(
        <Step key="i" label="Inputs">
          {prov.inputs.length.toLocaleString("en-GB")} {prov.inputs.length === 1 ? "record" : "records"}
          {testish && (
            <Link className="ml-2 text-accent underline underline-offset-2" to={`/evidence?ids=${encodeURIComponent(prov.inputs.join(","))}`}>
              Open in the Evidence Explorer
            </Link>
          )}
        </Step>,
      );
    }
  } else {
    if (prov.file) {
      steps.push(
        <Step key="f" label={prov.source_type === "psi_table" ? "Table file" : "File"}>
          <span className="mono text-xs">{prov.file}</span>
          {(prov.row !== undefined || prov.column) && (
            <div className="mt-0.5 text-xs text-ink-2">
              {prov.row !== undefined && <>Line <span className="mono">{prov.row}</span></>}
              {prov.row !== undefined && prov.column && " · "}
              {prov.column && <>Column <span className="mono">&ldquo;{prov.column}&rdquo;</span></>}
            </div>
          )}
        </Step>,
      );
    }
    if (prov.page !== undefined || prov.ntrs) {
      steps.push(<Step key="pg" label="Paper">{prov.ntrs ? <>NTRS <span className="mono">{prov.ntrs}</span></> : null}{prov.page !== undefined && <> · page {prov.page}</>}</Step>);
    }
    if (prov.quote) steps.push(<Step key="q" label="Exact quote"><q className="italic text-ink-2">{prov.quote}</q></Step>);
    if (prov.raw !== undefined) steps.push(<Step key="r" label="Raw text"><span className="mono rounded-sm bg-[color:var(--surface-3)] px-1">&ldquo;{prov.raw}&rdquo;</span></Step>);
  }
  if (prov.transforms && prov.transforms.length) {
    steps.push(
      <Step key="t" label="Transforms">
        <span className="flex flex-wrap gap-1">
          {prov.transforms.map((t) => <span key={t} className="mono rounded-sm border border-line px-1 text-xs">{t}</span>)}
        </span>
      </Step>,
    );
  }
  if (prov.note) steps.push(<Step key="n" label="Note"><span className="text-ink-2">{prov.note}</span></Step>);
  if (shown) steps.push(<Step key="s" label="Shown here" last><span className="num">{shown}</span></Step>);
  return <ol className="mt-3">{steps}</ol>;
}

/** Kept for the Evidence drawer and dossiers: the trace without a shown value. */
export function ProvDetails({ prov }: { prov: Prov }) {
  return (
    <div className="text-sm">
      <SourceHeader prov={prov} />
      <ProvTrace prov={prov} />
      <ProvFooter prov={prov} />
    </div>
  );
}

function SourceHeader({ prov }: { prov: Prov }) {
  const paper = prov.source_type === "published_paper";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="eyebrow flex items-center gap-1.5 text-ink-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">{SOURCE_GLYPH[prov.source_type]}</svg>
        {SOURCE_LABEL[prov.source_type] ?? prov.source_type}
      </span>
      {paper ? (
        <span className={`rounded-full border px-2 text-xs ${prov.verified ? "border-[color:var(--ink-3)] text-ink-2" : "border-[color:var(--amber-ink)] text-[color:var(--amber-ink)]"}`}>
          {prov.verified ? "Human verified" : "Awaiting verification"}
        </span>
      ) : prov.investigation_id ? (
        <Link className="mono text-xs text-ink-2 underline underline-offset-2" to={`/investigations?open=${prov.investigation_id}`}>{prov.investigation_id}</Link>
      ) : null}
    </div>
  );
}

function ProvFooter({ prov }: { prov: Prov }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(prov.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable: the id is still visible */
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
      <span className="flex flex-wrap items-center gap-3">
        {prov.doi && <a className="mono text-accent underline underline-offset-2" href={doiUrl(prov.doi)} target="_blank" rel="noreferrer">doi:{prov.doi}</a>}
        {prov.ntrs && <a className="mono text-accent underline underline-offset-2" href={ntrsUrl(prov.ntrs)} target="_blank" rel="noreferrer">NTRS {prov.ntrs}</a>}
        {prov.verified_by && <span className="text-ink-2">Verified by {prov.verified_by}, {prov.verified_at}</span>}
        {prov.source_type === "derived" && <Link className="text-ink-2 underline underline-offset-2" to="/methods">How this is computed</Link>}
      </span>
      <button type="button" onClick={copy} className="mono text-ink-3 hover:text-ink" title="Copy the provenance id">
        {copied ? "copied" : prov.id.length > 36 ? `${prov.id.slice(0, 34)}…` : prov.id}
      </button>
    </div>
  );
}

function ProvPopover({ id, anchor, provId, shown, onClose }: { id: string; anchor: React.RefObject<HTMLButtonElement>; provId: string; shown: string; onClose: () => void }) {
  const { data, isLoading, error } = useProvenance(true);
  const prov = data?.[provId];
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    if (!a) return;
    const w = Math.min(384, window.innerWidth - 32);
    const h = card.current?.offsetHeight ?? 280;
    const left = Math.max(16, Math.min(a.left, window.innerWidth - w - 16));
    const above = a.bottom + 8 + h > window.innerHeight - 16 && a.top - 8 - h > 16;
    setPos({ left, top: above ? a.top - 8 - h : a.bottom + 8, above });
  }, [anchor]);

  useLayoutEffect(place, [place, prov, isLoading]);
  useEffect(() => {
    card.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (card.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose, place]);

  return createPortal(
    <div
      ref={card}
      id={id}
      role="dialog"
      aria-label="Where this number comes from"
      tabIndex={-1}
      className="floating animate-rise fixed z-[60] w-[384px] max-w-[calc(100vw-32px)] p-4 text-left text-ink outline-none"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {isLoading && (
        <div aria-busy="true" aria-label="Loading the source">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton mt-3 h-7 w-24" />
          <div className="skeleton mt-4 h-16 w-full" />
        </div>
      )}
      {error && <p className="text-sm text-ink-2">The source record could not be loaded. Its id is <span className="mono">{provId}</span>.</p>}
      {data && !prov && <p className="text-sm text-ink-2">No source record found for <span className="mono">{provId}</span>.</p>}
      {prov && (
        <>
          <SourceHeader prov={prov} />
          <div className="mt-2 text-xl font-semibold num">{shown}</div>
          <ProvTrace prov={prov} shown={shown} />
          <ProvFooter prov={prov} />
        </>
      )}
      <button type="button" onClick={onClose} className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:text-xs">
        Close
      </button>
    </div>,
    document.body,
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
