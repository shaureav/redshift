// Shared drawing helpers for the landing charts (Access Gap, Evidence strips, FLEX suppression).
// Each chart is one SVG (so "Download SVG" carries the whole picture) with an HTML layer on top that
// holds every number as a <Value> and every link. Each HTML label has an SVG twin that is hidden on
// screen by a utility class and appears in the downloaded file, where page CSS does not apply.
// Nothing here computes a displayed number: labels format the value they are given.
import { useLayoutEffect, useState, type ReactNode } from "react";
import { fmtNumber } from "../lib/format";
import type { Candidate, Val } from "../lib/types";

export const FUELS = ["gas", "droplet", "solid", "emulator"] as const;
export type Fuel = (typeof FUELS)[number];

/** Short fuel-class names for tight chart columns (the full names live in the tables). */
export const FUEL_SHORT: Record<Fuel, string> = {
  gas: "Gas flame",
  droplet: "Droplet",
  solid: "Solid material",
  emulator: "BRE emulator",
};
export const FUEL_TINY: Record<Fuel, string> = { gas: "Gas", droplet: "Droplet", solid: "Solid", emulator: "BRE" };

/** Width of a container, kept in step with resizes. Returns a callback ref, so it also works when the
 * container first appears after the data has loaded. */
export function useMeasuredWidth(initial: number, min = 300) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(Math.max(min, Math.floor(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver((entries) => setWidth(Math.max(min, Math.floor(entries[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, min]);
  return [setEl, width] as const;
}

/** The 4.3 psi suit value is a round figure from the challenge statement, so it is written "about". */
export function isAboutPressure(c: Candidate): boolean {
  return c.pressure_psi.v === 4.3;
}

/** The text a <Value> shows, for the SVG twin. Formatting only. */
export function valText(val: Val | null | undefined, unit: string | false = false): string {
  if (!val || val.v === null) return "not recorded";
  if (typeof val.v !== "number") return String(val.v);
  const u = unit === false ? "" : unit;
  return `${fmtNumber(val.v)}${u ? (u === "%" ? "%" : ` ${u}`) : ""}`;
}

/** Greedy word wrap by an approximate character budget (chart geometry only). */
export function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Approximate rendered width of a string at a font size (geometry only). */
export function textWidth(text: string, size: number): number {
  return text.length * size * 0.55;
}

/** Bar with a 4px rounded data end and a square baseline. */
export function barPath(w: number, h: number, r = 4): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (w <= 0) return "";
  return `M0,0 H${w - rr} Q${w},0 ${w},${rr} V${h - rr} Q${w},${h} ${w - rr},${h} H0 Z`;
}

export type Tone = "ink" | "ink-2" | "ink-3";
const TONE_CLASS: Record<Tone, string> = { ink: "text-ink", "ink-2": "text-ink-2", "ink-3": "text-ink-3" };

/** The six sizes of the type scale (index.css), the only sizes a chart label may take. */
export type TypeSize = 12 | 14 | 16 | 20 | 28 | 40;
/** Each size's line height, from its type role (label, body small, body, heading, title, display). */
export const LEADING: Record<TypeSize, number> = { 12: 16, 14: 20, 16: 24, 20: 28, 28: 36, 40: 48 };
const LEADING_VAR: Record<TypeSize, string> = {
  12: "var(--leading-label)", 14: "var(--leading-body-sm)", 16: "var(--leading-body)", 20: "var(--leading-heading)", 28: "var(--leading-title)", 40: "var(--leading-display)",
};

export interface OverlayLabel {
  key: string;
  x: number;
  y: number; // vertical centre of the line
  anchor?: "start" | "middle" | "end";
  size?: TypeSize;
  weight?: number;
  tone?: Tone;
  italic?: boolean;
  /** What the screen shows: <Value>, links, text. */
  node: ReactNode;
  /** The same words as plain text, for the downloaded SVG. */
  text: string;
  /** Draw a surface-coloured pill behind the label (used on hatched bars). */
  pill?: boolean;
  /** Let the label wrap within this width (the chart reserves the height). */
  maxWidth?: number;
}

/** SVG twins of the overlay labels: invisible on screen, present in the downloaded SVG. */
export function ExportLabels({ labels }: { labels: OverlayLabel[] }) {
  return (
    <g className="invisible" aria-hidden="true">
      {labels.map((l) => {
        const size = l.size ?? 12;
        const anchor = l.anchor === "end" ? "end" : l.anchor === "middle" ? "middle" : "start";
        const lines = l.maxWidth ? wrapWords(l.text, Math.max(8, Math.floor((l.maxWidth - (l.pill ? 18 : 0)) / (size * 0.55)))) : [l.text];
        const lh = LEADING[size];
        const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
        const w = textWidth(longest, size) + 16;
        const h = lines.length * lh + size * 0.5;
        const px = anchor === "end" ? l.x - w : anchor === "middle" ? l.x - w / 2 : l.x;
        const tx = anchor === "start" && l.pill ? l.x + 8 : l.x;
        const top = l.y - ((lines.length - 1) * lh) / 2;
        return (
          <g key={l.key}>
            {l.pill && <rect x={px} y={l.y - h / 2} width={w} height={h} rx={Math.min(h / 2, size)} fill="var(--surface-2)" stroke="var(--line)" />}
            <text
              x={tx}
              y={top}
              dominantBaseline="central"
              textAnchor={anchor}
              fontSize={size}
              fontWeight={l.weight ?? 400}
              fontStyle={l.italic ? "italic" : undefined}
              fill={`var(--${l.tone ?? "ink"})`}
            >
              {lines.map((ln, i) => (
                <tspan key={i} x={tx} dy={i === 0 ? 0 : lh}>{ln}</tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** The HTML layer: each label positioned over its SVG point. */
export function OverlayLayer({ labels }: { labels: OverlayLabel[] }) {
  return (
    <>
      {labels.map((l) => {
        const tx = l.anchor === "end" ? "-100%" : l.anchor === "middle" ? "-50%" : "0";
        return (
          <div
            key={l.key}
            className={`absolute ${l.maxWidth ? "whitespace-normal" : "whitespace-nowrap"} ${TONE_CLASS[l.tone ?? "ink"]} ${l.italic ? "italic" : ""} ${
              l.pill ? "rounded-full border border-line bg-surface-2 px-2" : ""
            }`}
            style={{ left: l.x, top: l.y, transform: `translate(${tx},-50%)`, fontSize: l.size ?? 12, lineHeight: LEADING_VAR[l.size ?? 12], fontWeight: l.weight ?? 400, maxWidth: l.maxWidth }}
          >
            {l.node}
          </div>
        );
      })}
    </>
  );
}
