import { fileURLToPath } from "node:url";
/** @type {import('tailwindcss').Config} */
export default {
  content: [fileURLToPath(new URL("./index.html", import.meta.url)), fileURLToPath(new URL("./src", import.meta.url)) + "/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        line: "var(--line)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        gas: "var(--gas)",
        droplet: "var(--droplet)",
        solid: "var(--solid)",
        emulator: "var(--emulator)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        num: ["'IBM Plex Sans'", "Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
