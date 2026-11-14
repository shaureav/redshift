// Token guards: the design system (index.css, tailwind.config.js) is enforced here, not by convention.
// - Every colour, duration and shadow in a component is a token: no raw hex, rgb() or hsl() colour, no raw
//   millisecond value, no default Tailwind shadow anywhere in src outside index.css.
// - Every var(--x) a component names is defined in index.css, so a typo cannot silently draw nothing.
// - Tailwind writes no CSS for an opacity modifier on a var() colour, so a class such as
//   bg-[color:var(--surface-2)]/80 silently draws nothing (text then sat straight on a bar fill and failed AA).
//   Translucent surfaces use .scrim, .glass and .floating in index.css instead.
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
});
