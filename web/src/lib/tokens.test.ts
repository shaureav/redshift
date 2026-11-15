// Token guards: the design system (index.css, tailwind.config.js) is enforced here, not by convention.
// - Every colour, duration and shadow in a component is a token: no raw hex, rgb() or hsl() colour, no raw
//   millisecond value, no default Tailwind shadow anywhere in src outside index.css.
// - Every var(--x) a component names is defined in index.css, so a typo cannot silently draw nothing.
// - Tailwind writes no CSS for an opacity modifier on a var() colour, so a class such as
//   bg-[color:var(--surface-2)]/80 silently draws nothing (text then sat straight on a bar fill and failed AA).
//   Translucent surfaces use .scrim, .glass and .floating in index.css instead.
// - Controls draw their boundary in --control-line (3:1), never --line or --line-strong (1.2:1 to 1.8:1).
// - Text takes the six sizes and the six role line heights only, in SVG charts as in HTML.
// - The focus ring sits in the base layer with no radius of its own; the page's scroll padding clears the
//   sticky nav, so a focused control is never hidden under it.
// Contrast of the token values themselves is checked by scripts/contrast.mjs (npm run contrast).
// Sources are read as text through Vite.
import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import css from "../index.css?raw";

const sources = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function offending(pattern: RegExp): string[] {
  const bad: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    text.split("\n").forEach((line, i) => {
      if (pattern.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return bad;
}

/** The value a custom property has in index.css's first block that sets it (the dark theme). */
function token(name: string): string | undefined {
  return css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim();
}

describe("design tokens", () => {
  it("reads the app's source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it("never puts a Tailwind opacity modifier on a var() colour", () => {
    expect(offending(/var\(--[\w-]+\)\]\/\d/)).toEqual([]);
  });

  it("uses no raw colour outside index.css", () => {
    expect(offending(/(?<![&\w])#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
    expect(offending(/\b(rgba?|hsla?)\(/)).toEqual([]);
  });

  it("uses the motion tokens for every duration and easing", () => {
    expect(offending(/\b\d+ms\b|duration-\d|delay-\d|cubic-bezier\(/)).toEqual([]);
  });

  it("uses the one floating shadow, never a default Tailwind shadow", () => {
    expect(offending(/\bshadow-(sm|md|lg|xl|2xl|inner)\b/)).toEqual([]);
  });

  it("names only tokens that index.css defines", () => {
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set<string>();
    for (const text of Object.values(sources)) for (const m of text.matchAll(/var\((--[\w-]+)/g)) used.add(m[1]);
    expect([...used].filter((n) => !defined.has(n) && !n.startsWith("--tw-")).sort()).toEqual([]);
  });

  it("keeps the motion values of the plan and zeroes them under reduced motion", () => {
    expect([token("--t-fast"), token("--t-base"), token("--t-move"), token("--t-scene")]).toEqual(["120ms", "200ms", "320ms", "600ms"]);
    expect(token("--ease-out")).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/--t-fast:\s*0ms;\s*--t-base:\s*0ms;\s*--t-move:\s*0ms;\s*--t-scene:\s*0ms;/);
    expect(reduced).toMatch(/\.crossfade[^{]*\{\s*transition:\s*opacity var\(--t-fade\) linear !important;/);
  });

  it("starts the browser chrome on the dark surface token (index.html is read before any CSS)", () => {
    expect(html.match(/name="theme-color" content="([^"]+)"/)?.[1]).toBe(token("--surface"));
  });

  it("draws the focus ring in the base layer, with no radius of its own", () => {
    // In the base layer, components and utilities override it (outline-none on a card that only holds focus,
    // an inset ring on a segment); with no radius, a focused pill stays a pill.
    const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const bare = [...text.matchAll(/(?:^|[{};])\s*:focus-visible\s*\{([^}]*)\}/g)];
    expect(bare.length).toBe(1);
    expect(bare[0][1]).not.toMatch(/border-radius/);
    const base = text.indexOf("@layer base");
    expect(base).toBeGreaterThan(-1);
    expect(bare[0].index).toBeGreaterThan(base);
    expect(bare[0].index).toBeLessThan(blockEnd(text, text.indexOf("{", base)));
    // The segmented control clips its segments to its corners, so a segment's ring is drawn inside it.
    expect(text).toMatch(/\.seg > button:focus-visible\s*\{\s*outline-offset:\s*-2px;?\s*\}/);
  });

  it("keeps focus and anchors clear of the sticky nav", () => {
    expect(css).toMatch(/html\s*\{\s*scroll-padding-top:\s*calc\(var\(--nav-h\)/);
    expect(sources["../components/Layout.tsx"]).toContain("sticky top-0 z-50 h-[var(--nav-h)]");
  });

  it("draws every control's boundary in --control-line (3:1), never the quiet --line", () => {
    const bad: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const t of controlTags(text)) {
        if (/\bborder-line(-strong)?\b(?!-)|border-\[color:var\(--line/.test(t.text)) bad.push(`${file}:${t.line}: ${t.text.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("takes every line height from a type role", () => {
    expect(offending(/\bleading-(none|tight|snug|normal|relaxed|loose|\d|\[)/)).toEqual([]);
    expect(offending(/\btext-\[\d/)).toEqual([]);
  });

  it("sets every chart text size on the type scale (12, 14, 16, 20, 28 or 40 px)", () => {
    const scale = new Set([12, 14, 16, 20, 28, 40]);
    const bad: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      text.split("\n").forEach((line, i) => {
        // The planner heat map sizes its in-cell labels to fit the cell (cw / n): open for Phase 12.
        if (file.endsWith("plannerHeatmap.tsx") && /cw \/ \d/.test(line)) return;
        for (const m of line.matchAll(/fontSize(?:=\{|="|:\s*)([^}",;]+)|\b\w+Size\s*=\s*([^;]+);/g)) {
          for (const n of (m[1] ?? m[2]).matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g)) {
            if (!scale.has(Number(n[0]))) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
          }
        }
      });
    }
    expect(bad).toEqual([]);
  });
});

/** The index of the brace that closes the block opened at `open`. */
function blockEnd(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return text.length;
}

/** Opening JSX tags of controls (buttons, fields, summaries, links), with their line numbers. */
function controlTags(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  for (const m of text.matchAll(/<(button|select|input|textarea|summary|a|Link|NavLink)[\s>]/g)) {
    let i = m.index + 1;
    let depth = 0;
    let quote: string | null = null;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === quote && text[i - 1] !== "\\") quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    out.push({ line: text.slice(0, m.index).split("\n").length, text: text.slice(m.index, i + 1) });
  }
  return out;
}
