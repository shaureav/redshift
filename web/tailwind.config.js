import { fileURLToPath } from "node:url";

// The visual system is enforced here, not by convention:
// - six type sizes only (12, 14, 16, 20, 28, 40 px); `text-3xl` and friends do not exist;
// - every spacing step is a multiple of 8 px, with 4 px as the only half step;
// - two corner radii (4 px for controls, 8 px for surfaces) plus pills.
const px = (n) => `${n}px`;
const spacing = {
  0: "0px", px: "1px",
  0.5: px(4), 1: px(4),
  1.5: px(8), 2: px(8), 2.5: px(8),
  3: px(16), 3.5: px(16), 4: px(16),
  5: px(24), 6: px(24),
  7: px(32), 8: px(32),
  9: px(40), 10: px(40),
  11: px(48), 12: px(48),
  14: px(56), 16: px(64), 20: px(80), 24: px(96), 28: px(112), 32: px(128),
  36: px(144), 40: px(160), 44: px(176), 48: px(192), 52: px(208), 56: px(224),
  60: px(240), 64: px(256), 72: px(288), 80: px(320), 96: px(384),
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [fileURLToPath(new URL("./index.html", import.meta.url)), fileURLToPath(new URL("./src", import.meta.url)) + "/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["14px", { lineHeight: "20px" }],
      base: ["16px", { lineHeight: "24px" }],
      lg: ["20px", { lineHeight: "28px" }],
      xl: ["28px", { lineHeight: "36px", letterSpacing: "-0.01em" }],
      "2xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.02em" }],
    },
    spacing,
    borderRadius: { none: "0px", sm: px(4), DEFAULT: px(4), md: px(4), lg: px(8), xl: px(8), full: "9999px" },
    fontFamily: {
      sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
      num: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
      mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
    },
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        gas: "var(--gas)",
        droplet: "var(--droplet)",
        solid: "var(--solid)",
        emulator: "var(--emulator)",
      },
      transitionTimingFunction: { out: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    },
  },
  plugins: [],
};
