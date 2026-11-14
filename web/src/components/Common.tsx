// Shared visual vocabulary: fuel-class markers, source-type legend, hatching, chart frame with a
// "view as table" toggle and SVG download (caption and sources embedded).
import { useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { FUEL_LABEL } from "../lib/format";
import { ChevronIcon } from "./Icons";

/** The validated fill of each fuel class. */
export const FUEL_COLOR_VAR: Record<string, string> = {
  gas: "var(--gas)",
  droplet: "var(--droplet)",
  solid: "var(--solid)",
  emulator: "var(--emulator)",
  none: "var(--ink-3)",
};

/** The 1 px ring around a filled glyph that sits among others: the surface (a gap between neighbours) in the
 *  dark theme, a darker shade of the class hue in the light theme, so every glyph reaches 3:1. */
export const FUEL_RING_VAR: Record<string, string> = {
  gas: "var(--gas-ring)",
  droplet: "var(--droplet-ring)",
  solid: "var(--solid-ring)",
  emulator: "var(--emulator-ring)",
  none: "var(--surface-2)",
};

/** The class hue drawn as a line: outlined (paper) glyphs, legend markers, the edge of a bar. The hue itself
 *  in the dark theme, the darker ring shade in the light theme. */
export const FUEL_EDGE_VAR: Record<string, string> = {
  gas: "var(--gas-edge)",
  droplet: "var(--droplet-edge)",
  solid: "var(--solid-edge)",
  emulator: "var(--emulator-edge)",
  none: "var(--ink-3)",
};

// Marker shape per fuel class (secondary encoding so colour never carries identity alone).
export function markerPath(fuel: string, r: number): string {
  switch (fuel) {
    case "droplet": {
      const h = r * 1.15;
      return `M0,${-h} L${h},${h * 0.8} L${-h},${h * 0.8} Z`;
    }
    case "solid":
      return `M${-r},${-r} H${r} V${r} H${-r} Z`;
    case "emulator":
      return `M0,${-r * 1.3} L${r * 1.3},0 L0,${r * 1.3} L${-r * 1.3},0 Z`;
    default:
      return `M${r},0 A${r},${r} 0 1,1 ${-r},0 A${r},${r} 0 1,1 ${r},0`;
  }
}

export function FuelMarker({ fuel, size = 12, outlined = false }: { fuel: string; size?: number; outlined?: boolean }) {
  const r = size / 2 - 1.5;
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true" className="inline-block align-[-2px]">
      <path
        d={markerPath(fuel, r)}
        fill={outlined ? "none" : FUEL_COLOR_VAR[fuel]}
        stroke={FUEL_EDGE_VAR[fuel]}
        strokeWidth={outlined ? 2 : 1}
      />
    </svg>
  );
}

export function FuelLegend({ classes = ["gas", "droplet", "solid", "emulator"] }: { classes?: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Fuel classes">
      {classes.map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <FuelMarker fuel={c} /> {FUEL_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}

export function SourceLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Source types">
      <li className="flex items-center gap-1.5"><FuelMarker fuel="gas" /> PSI table (solid marker)</li>
      <li className="flex items-center gap-1.5"><FuelMarker fuel="solid" outlined /> Published paper, human verified (outlined)</li>
      <li className="flex items-center gap-1.5"><span className="italic underline decoration-dotted">italic</span> Derived calculation</li>
      <li className="flex items-center gap-1.5"><span className="hatch-bg inline-block h-3 w-5 rounded-sm border border-line" /> No tests recorded (hatched)</li>
    </ul>
  );
}

/** The one hatch (plan, section 5): 45 degrees, 7 px pitch, 1 px line; .hatch-bg in index.css draws the same. */
export function Hatch({ id = "hatch" }: { id?: string }) {
  return (
    <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="var(--hatch)" strokeWidth="1" />
    </pattern>
  );
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "amber" | "teal"; title?: string }) {
  const cls =
    tone === "amber"
      ? "border-[color:var(--solid-edge)] text-amber-ink"
      : tone === "teal"
        ? "border-accent text-accent"
        : "border-line text-ink-2";
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function AiLabel() {
  return <Badge tone="teal" title="Drafted with AI from the data shown, checked by code and by a person">AI-assisted, human-checked</Badge>;
}

interface ChartFrameProps {
  title: string;
  /** The chart's takeaway in plain English, computed from the data with a neutral fallback. */
  headline?: ReactNode;
  caption: string;
  sources: string;
  children: ReactNode;
  table?: ReactNode;
  actions?: ReactNode;
  id?: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const VAR_NAME = /var\(\s*(--[\w-]+)/g;

/** A token's value on the page right now (the theme in force); computed values already have nested var() substituted. */
export function pageToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The chart as a standalone SVG file: its caption and sources in a <desc>, and every token it draws with (every
 *  custom property the markup reads, and any token those values name in turn) written into an embedded <style>, so the file
 *  draws exactly as the page does with no app stylesheet. A fixed list here once dropped the -edge and -ring
 *  tokens, and outlined marks then lost their only distinguishing stroke (the export test guards it). */
export function chartSvgMarkup(svg: SVGSVGElement, meta: { title: string; caption: string; sources: string }, resolve: (name: string) => string = pageToken): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const values = new Map<string, string>();
  const queue = [...clone.outerHTML.matchAll(VAR_NAME)].map((m) => m[1]);
  while (queue.length) {
    const name = queue.shift()!;
    if (values.has(name)) continue;
    const value = resolve(name);
    values.set(name, value);
    for (const m of value.matchAll(VAR_NAME)) queue.push(m[1]);
  }
  const decls = [...values].filter(([, v]) => v !== "").map(([k, v]) => `${k}:${v}`);
  const s = document.createElementNS(SVG_NS, "style");
  s.textContent = `svg{${[...decls, "font-family:'IBM Plex Sans',sans-serif"].join(";")}}`;
  clone.insertBefore(s, clone.firstChild);
  const desc = document.createElementNS(SVG_NS, "desc");
  desc.textContent = `${meta.title}. ${meta.caption} Sources: ${meta.sources}`;
  clone.insertBefore(desc, clone.firstChild);
  clone.setAttribute("xmlns", SVG_NS);
  return new XMLSerializer().serializeToString(clone);
}

// Wraps every chart: takeaway headline, what the chart is, caption, sources, a table alternative and SVG download.
export function ChartFrame({ title, headline, caption, sources, children, table, actions, id }: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const download = () => {
    const svg = ref.current?.querySelector("svg[data-chart]") as SVGSVGElement | null;
    if (!svg) return;
    const blob = new Blob([chartSvgMarkup(svg, { title, caption, sources })], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(id ?? title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <figure className="card p-5" ref={ref} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <div className="eyebrow">{title}</div>
          {headline && <h3 className="mt-1 text-lg font-semibold">{headline}</h3>}
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {actions}
          {table && (
            <button type="button" className="btn btn-sm btn-quiet" aria-pressed={asTable} onClick={() => setAsTable((t) => !t)}>
              {asTable ? "View as chart" : "View as table"}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-quiet" onClick={download}>
            Download SVG
          </button>
        </div>
      </div>
      <div>{asTable && table ? table : children}</div>
      <figcaption className="mt-4 border-t border-line pt-3 text-xs text-ink-2">
        {caption} <span className="text-ink-3">Sources: {sources}</span>
      </figcaption>
    </figure>
  );
}

/** A select drawn as a .field (the 3:1 control boundary, the control heights), never the browser's own box:
 *  the native arrow is removed (appearance: none) and the icon set's chevron drawn in its place. `className`
 *  places and sizes the control; `small` is the 32 px height used in toolbars, the default the 40 px field. */
export function Select({ className = "", small = false, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { small?: boolean }) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select {...rest} className={`field field-select w-full ${small ? "field-sm" : ""}`}>{children}</select>
      <ChevronIcon dir="down" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-2" />
    </span>
  );
}

/** Loading: a calm skeleton that says what is coming, never a bare spinner. */
export function Loading({ what = "data" }: { what?: string }) {
  return (
    <div className="space-y-3 py-8" aria-busy="true" role="status">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton h-8 w-2/3" />
      <div className="skeleton h-40 w-full" />
      <p className="text-sm text-ink-3">Loading {what}…</p>
    </div>
  );
}

/** Error: says what failed and why nothing is guessed in its place. */
export function ErrorNote({ error }: { error: unknown }) {
  return (
    <div className="my-8 max-w-xl rounded-lg border border-dashed border-line-strong p-5" role="alert">
      <div className="eyebrow">Could not load</div>
      <p className="mt-2 text-sm">The data snapshot did not arrive ({String(error)}). Redshift shows nothing it cannot source, so nothing is shown in its place.</p>
      <button type="button" className="btn btn-sm mt-3" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}

/** Empty: unknown, never safe. Hatched, like an empty region of the plane. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="hatch-bg rounded-lg border border-dashed border-line-strong p-5">
      <div className="inline-block rounded bg-[color:var(--surface-2)] px-2 py-1">
        <div className="eyebrow">{title}</div>
        {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      {lead && <p className="mt-2 max-w-3xl text-sm text-ink-2">{lead}</p>}
      {children}
    </header>
  );
}
