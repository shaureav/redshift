import { fileURLToPath } from "node:url";

// The visual system is enforced here, not by convention. Values are the tokens in src/index.css:
// - six type sizes only (12, 14, 16, 20, 28, 40 px), by size (xs to 2xl) or by role (label to display);
//   `text-3xl` and friends do not exist;
// - six line heights only, each set by its size's role (16, 20, 24, 28, 36, 48 px); Tailwind's unitless
//   `leading-snug` and friends do not exist, and `leading-<role>` exists only to borrow a role's line;
// - weights 400, 500 and 600 only;
// - every spacing step is a multiple of 8 px, with 4 px as the only half step;
// - two corner radii (4 px for controls, 8 px for surfaces) plus pills;
// - durations and easing are the motion tokens (`duration-fast` to `duration-scene`, `ease-out`), so a bare
//   `transition` uses them too and reduced motion can set them all to zero;
// - one shadow, the floating elevation (`shadow-floating`).
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

const role = (name, extra = {}) => [`var(--text-${name})`, { lineHeight: `var(--leading-${name})`, ...extra }];

/** @type {import('tailwindcss').Config} */
export default {
  content: [fileURLToPath(new URL("./index.html", import.meta.url)), fileURLToPath(new URL("./src", import.meta.url)) + "/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    fontSize: {
      xs: role("label"),
      sm: role("body-sm"),
      base: role("body"),
      lg: role("heading"),
      xl: role("title", { letterSpacing: "-0.01em" }),
      "2xl": role("display", { letterSpacing: "-0.02em" }),
      // Type roles (plan, section 5): the same six sizes by what they are for.
      label: role("label", { letterSpacing: "var(--tracking-label)", fontWeight: "500" }),
      "body-sm": role("body-sm"),
      body: role("body"),
      heading: role("heading", { fontWeight: "600" }),
      title: role("title", { letterSpacing: "-0.01em", fontWeight: "600" }),
      display: role("display", { letterSpacing: "-0.02em", fontWeight: "600" }),
    },
    lineHeight: Object.fromEntries(["label", "body-sm", "body", "heading", "title", "display"].map((r) => [r, `var(--leading-${r})`])),
    fontWeight: { normal: "400", medium: "500", semibold: "600" },
    spacing,
    borderRadius: { none: "0px", sm: px(4), DEFAULT: px(4), md: px(4), lg: px(8), xl: px(8), full: "9999px" },
    fontFamily: {
      sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
      num: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
      mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
    },
    transitionDuration: {
      0: "0ms",
      DEFAULT: "var(--t-fast)",
      fast: "var(--t-fast)",
      base: "var(--t-base)",
      move: "var(--t-move)",
      scene: "var(--t-scene)",
    },
    transitionTimingFunction: { DEFAULT: "var(--ease-out)", out: "var(--ease-out)", linear: "linear" },
    boxShadow: { none: "none", floating: "var(--shadow)" },
    backdropBlur: { none: "0px", sm: px(4), DEFAULT: "var(--blur)" },
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
        "control-line": "var(--control-line)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "amber-ink": "var(--amber-ink)",
        gas: "var(--gas)",
        droplet: "var(--droplet)",
        solid: "var(--solid)",
        emulator: "var(--emulator)",
        land: "var(--land)",
        sea: "var(--sea)",
        coast: "var(--coast)",
        trail: "var(--trail)",
      },
    },
  },
  plugins: [],
};
