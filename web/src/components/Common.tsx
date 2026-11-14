// Shared visual vocabulary: fuel-class markers, source-type legend, hatching, chart frame with a
// "view as table" toggle and SVG download (caption and sources embedded).
import { useRef, useState, type ReactNode } from "react";
import { FUEL_LABEL } from "../lib/format";

export const FUEL_COLOR_VAR: Record<string, string> = {
  gas: "var(--gas)",
  droplet: "var(--droplet)",
  solid: "var(--solid)",
  emulator: "var(--emulator)",
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
        stroke={FUEL_COLOR_VAR[fuel]}
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
      <li className="flex items-center gap-1.5"><span className="italic">2,415 K</span> Derived calculation (italic)</li>
      <li className="flex items-center gap-1.5"><span className="hatch-bg inline-block h-3 w-5 rounded-sm border border-line" /> No tests recorded (hatched)</li>
    </ul>
  );
}

export function Hatch({ id = "hatch" }: { id?: string }) {
  return (
    <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="var(--hatch)" strokeWidth="1.2" />
    </pattern>
  );
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "amber" | "teal"; title?: string }) {
  const cls =
    tone === "amber"
      ? "border-[color:var(--solid)] text-[color:var(--amber-ink)]"
      : tone === "teal"
        ? "border-accent text-accent"
        : "border-line text-ink-2";
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function AiLabel() {
  return <Badge tone="teal" title="Drafted with AI from the data shown, checked by code and by a person">AI-assisted, human-checked</Badge>;
}

interface ChartFrameProps {
  title: string;
  caption: string;
  sources: string;
  children: ReactNode;
  table?: ReactNode;
  actions?: ReactNode;
  id?: string;
}

// Wraps every chart: title, caption, sources, a table alternative and SVG download.
export function ChartFrame({ title, caption, sources, children, table, actions, id }: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const download = () => {
    const svg = ref.current?.querySelector("svg[data-chart]") as SVGSVGElement | null;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const styles = getComputedStyle(document.documentElement);
    const vars = ["--surface", "--surface-2", "--ink", "--ink-2", "--ink-3", "--line", "--gas", "--droplet", "--solid", "--emulator", "--hatch", "--candidate", "--isotherm", "--prebreathe", "--accent"];
    const style = `svg{${vars.map((v) => `${v}:${styles.getPropertyValue(v)}`).join(";")};font-family:Inter,sans-serif}`;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "style");
    s.textContent = style;
    clone.insertBefore(s, clone.firstChild);
    const desc = document.createElementNS("http://www.w3.org/2000/svg", "desc");
    desc.textContent = `${title}. ${caption} Sources: ${sources}`;
    clone.insertBefore(desc, clone.firstChild);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(id ?? title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <figure className="card p-4" ref={ref} aria-label={title}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="no-print flex flex-wrap items-center gap-2 text-xs">
          {actions}
          {table && (
            <button type="button" className="rounded border border-line px-2 py-1 hover:bg-surface-3" aria-pressed={asTable} onClick={() => setAsTable((t) => !t)}>
              {asTable ? "View as chart" : "View as table"}
            </button>
          )}
          <button type="button" className="rounded border border-line px-2 py-1 hover:bg-surface-3" onClick={download}>
            Download SVG
          </button>
        </div>
      </div>
      <div>{asTable && table ? table : children}</div>
      <figcaption className="mt-2 text-xs text-ink-2">
        {caption} <span className="text-ink-3">Sources: {sources}</span>
      </figcaption>
    </figure>
  );
}

export function Loading({ what = "data" }: { what?: string }) {
  return <p className="p-6 text-sm text-ink-3">Loading {what}...</p>;
}

export function ErrorNote({ error }: { error: unknown }) {
  return <p className="p-6 text-sm">The data could not be loaded: {String(error)}</p>;
}

export function PageHeader({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {lead && <p className="mt-1 max-w-3xl text-sm text-ink-2">{lead}</p>}
      {children}
    </header>
  );
}
