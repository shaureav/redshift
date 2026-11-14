// Token guard: Tailwind writes no CSS for an opacity modifier on a var() colour, so a class such as
// bg-[color:var(--surface-2)]/80 silently draws nothing (text then sat straight on a bar fill and failed AA).
// Translucent surfaces use .scrim and .glass in index.css instead. Sources are read as text through Vite.
import { describe, expect, it } from "vitest";

const sources = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("design tokens", () => {
  it("reads the app's source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it("never puts a Tailwind opacity modifier on a var() colour", () => {
    const bad: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      text.split("\n").forEach((line, i) => {
        if (/var\(--[\w-]+\)\]\/\d/.test(line)) bad.push(`${file}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
