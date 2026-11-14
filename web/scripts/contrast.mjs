// Contrast check for the design tokens (docs/redesign/EXCEPTIONAL_PLAN.md, sections 3 and 5).
//
// Reads the colour tokens straight from src/index.css for both themes, resolves var(), rgb() and
// color-mix(), and computes WCAG 2.2 contrast ratios for:
//   - every text pair: each text token on each surface it can sit on, at 4.5:1 (AA for body text, even where
//     the text is large);
//   - every data glyph against the surfaces it is drawn on, at 3:1: a filled fuel glyph passes when its fill
//     or its 1 px ring reaches 3:1, an outlined glyph when its edge does;
//   - every control boundary and state indicator (control line, focus ring, accent, switch knob), at 3:1;
//   - the palette: no colour literal anywhere in index.css may be red (house rule).
// Textures and quiet context lines (hatching, isotherms, dividers) are reported as advisory and not
// enforced: each is always paired with text that carries the same information.
//
// Run: npm run contrast (or node scripts/contrast.mjs [--all]). npm run test runs it before vitest.
// Exit code 1 when any enforced pair fails or a red colour is found.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const CSS_PATH = fileURLToPath(new URL("../src/index.css", import.meta.url));

// ---------------------------------------------------------------------------------------------------------
// Parsing the token blocks

/** Top-level rules of a stylesheet as { selector, body }, comments removed. Rules nested in @media and
 *  @supports are skipped: the themes are defined at the top level only. */
function topLevelRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let depth = 0;
  let start = 0;
  let bodyStart = 0;
  let selector = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) {
        const head = text.slice(start, i);
        selector = head.slice(head.lastIndexOf(";") + 1).trim();
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        rules.push({ selector, body: text.slice(bodyStart, i) });
        start = i + 1;
      }
    }
  }
  return rules;
}

function declarations(body) {
  const out = {};
  for (const part of body.split(";")) {
    const m = part.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** The custom properties in force on the root element in each theme. The first colour block's selector list
 *  is `:root, :root[data-theme="dark"]`, so it applies in the light theme too, under the light block. */
export function themeTokens(css) {
  const rules = topLevelRules(css);
  const norm = (s) => s.replace(/\s+/g, "");
  const pick = (sel) => rules.filter((r) => norm(r.selector) === sel).map((r) => declarations(r.body));
  const shared = pick(":root");
  const dark = pick(':root,:root[data-theme="dark"]');
  const light = pick(':root[data-theme="light"]');
  if (!dark.length || !light.length) throw new Error("index.css: the dark or the light token block is missing");
  const merge = (blocks) => Object.assign({}, ...blocks);
  return { dark: merge([...shared, ...dark]), light: merge([...shared, ...dark, ...light]) };
}

// ---------------------------------------------------------------------------------------------------------
// Colours

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };

/** Split a function's arguments at top-level commas. */
function args(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseHex(h) {
  let s = h.slice(1);
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join("");
  if (s.length !== 6 && s.length !== 8) throw new Error(`bad hex ${h}`);
  const n = (i) => parseInt(s.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), s.length === 8 ? n(6) / 255 : 1];
}

/** Resolve a token value to [r, g, b, a] (channels 0 to 255, alpha 0 to 1) in one theme. */
export function resolveColour(value, tokens, seen = new Set()) {
  const v = value.trim();
  if (v in NAMED) return NAMED[v];
  if (v.startsWith("#")) return parseHex(v);
  let m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (m) {
    const [, name, fallback] = m;
    if (seen.has(name)) throw new Error(`circular token ${name}`);
    if (name in tokens) return resolveColour(tokens[name], tokens, new Set([...seen, name]));
    if (fallback) return resolveColour(fallback, tokens, seen);
    throw new Error(`undefined token ${name}`);
  }
  m = v.match(/^rgba?\(([\s\S]+)\)$/);
  if (m) {
    const parts = m[1].includes(",") ? args(m[1]) : m[1].replace("/", " ").split(/\s+/).filter(Boolean);
    const [r, g, b] = parts.slice(0, 3).map(Number);
    const a = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : Number(parts[3]);
    return [r, g, b, a];
  }
  m = v.match(/^color-mix\(([\s\S]+)\)$/);
  if (m) {
    const [space, ...cols] = args(m[1]);
    if (space !== "in srgb" || cols.length !== 2) throw new Error(`unsupported color-mix ${v}`);
    const parsed = cols.map((c) => {
      const pm = c.match(/^([\s\S]+?)\s+([\d.]+)%$/);
      return pm ? { c: pm[1], p: Number(pm[2]) / 100 } : { c, p: null };
    });
    let [p1, p2] = parsed.map((x) => x.p);
    if (p1 === null && p2 === null) p1 = p2 = 0.5;
    else if (p1 === null) p1 = 1 - p2;
    else if (p2 === null) p2 = 1 - p1;
    const sum = p1 + p2;
    const [c1, c2] = parsed.map((x) => resolveColour(x.c, tokens, seen));
    // CSS Color 5: interpolate premultiplied by alpha, then un-premultiply.
    const a = (c1[3] * p1 + c2[3] * p2) / sum;
    if (a === 0) return [0, 0, 0, 0];
    const ch = (i) => (c1[i] * c1[3] * p1 + c2[i] * c2[3] * p2) / sum / a;
    return [ch(0), ch(1), ch(2), Math.min(1, a * Math.min(1, sum))];
  }
  throw new Error(`not a colour: ${v}`);
}

/** Paint `fg` at `opacity` over an opaque `bg`. */
function over(fg, bg, opacity = 1) {
  const a = fg[3] * opacity;
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1);
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------------------------------------------------
// What is checked

const v = (name) => `var(--${name})`;
const PAGE = ["bg", "surface", "surface-2", "surface-3"].map((n) => ({ label: n, expr: v(n) }));
const PLANE = ["land", "sea"].map((n) => ({ label: n, expr: v(n) }));
// Translucent surfaces, painted over what is typically (bg) and at worst (ink, the opposite extreme) beneath.
const LAYERED = [
  { label: "floating over bg", expr: v("floating"), under: v("bg") },
  { label: "floating over ink", expr: v("floating"), under: v("ink") },
  { label: "glass over ink", expr: "color-mix(in srgb, var(--surface) 95%, transparent)", under: v("ink") },
  { label: "scrim over surface-2", expr: "color-mix(in srgb, var(--bg) 80%, transparent)", under: v("surface-2") },
];
const TEXT = ["ink", "ink-2", "ink-3", "accent", "amber-ink"];
const FUELS = ["gas", "droplet", "solid", "emulator"];
const PLANE_GLYPHS = ["candidate", "prebreathe", "probe", "trail", "accent"];

function pairs() {
  const list = [];
  const surfaces = [...PAGE, ...PLANE, ...LAYERED];
  for (const t of TEXT) for (const s of surfaces) list.push({ group: "text", min: 4.5, fg: v(t), bg: s, what: `${t} text on ${s.label}` });
  list.push({ group: "text", min: 4.5, fg: v("accent-ink"), bg: { label: "accent", expr: v("accent") }, what: "accent-ink text on accent (primary button)" });

  for (const f of FUELS) {
    for (const s of [...PAGE, ...PLANE]) {
      list.push({ group: "glyph", min: 3, fill: v(f), opacity: 0.85, ring: v(`${f}-ring`), bg: s, what: `${f} filled glyph (fill at 85% or ring) on ${s.label}` });
      list.push({ group: "glyph", min: 3, fill: v(f), opacity: 0.85, ring: v(`${f}-edge`), bg: s, what: `${f} bar or legend marker (fill or edge) on ${s.label}` });
      list.push({ group: "glyph", min: 3, fg: v(`${f}-edge`), bg: s, what: `${f} outlined glyph (edge) on ${s.label}` });
    }
  }
  for (const g of PLANE_GLYPHS) for (const s of [...PLANE, PAGE[2]]) list.push({ group: "glyph", min: 3, fg: v(g), bg: s, what: `${g} on ${s.label}` });
  for (const s of PLANE) list.push({ group: "glyph", min: 3, fg: v("coast"), bg: s, what: `coast line on ${s.label}` });

  const controlBgs = [...PAGE, LAYERED[0], LAYERED[3]];
  for (const s of controlBgs) list.push({ group: "control", min: 3, fg: v("control-line"), bg: s, what: `control boundary on ${s.label}` });
  for (const s of [...controlBgs, ...PLANE]) list.push({ group: "control", min: 3, fg: v("focus"), bg: s, what: `focus ring on ${s.label}` });
  for (const s of PAGE) list.push({ group: "control", min: 3, fg: v("accent"), bg: s, what: `pressed or checked indicator (accent) on ${s.label}` });
  list.push({ group: "control", min: 3, fg: v("ink"), bg: { label: "control-line", expr: v("control-line") }, what: "switch knob (ink) on its off track" });
  list.push({ group: "control", min: 3, fg: v("accent-ink"), bg: { label: "accent", expr: v("accent") }, what: "switch knob (accent-ink) on its on track" });

  for (const s of [...PAGE, ...PLANE]) list.push({ group: "advisory", min: 3, fg: v("hatch"), bg: s, what: `hatch texture on ${s.label} (always with "no tests recorded" text)` });
  for (const s of PLANE) list.push({ group: "advisory", min: 3, fg: v("isotherm"), bg: s, what: `isotherm line on ${s.label} (quiet on purpose; each is labelled)` });
  for (const d of ["line", "line-strong"]) for (const s of PAGE) list.push({ group: "advisory", min: 3, fg: v(d), bg: s, what: `${d} divider on ${s.label} (decorative)` });
  return list;
}

function surfaceColour(s, tokens) {
  const c = resolveColour(s.expr, tokens);
  if (c[3] >= 1) return c;
  if (!s.under) throw new Error(`${s.label} is translucent: name what lies beneath it`);
  return over(c, resolveColour(s.under, tokens));
}

function evaluate(p, tokens) {
  const bg = surfaceColour(p.bg, tokens);
  if (p.fill) {
    const fill = over(resolveColour(p.fill, tokens), bg, p.opacity);
    const ring = over(resolveColour(p.ring, tokens), bg);
    const rf = ratio(fill, bg);
    const rr = ratio(ring, bg);
    return { value: Math.max(rf, rr), detail: `fill ${rf.toFixed(2)}, ring ${rr.toFixed(2)} (${hex(ring)} on ${hex(bg)})` };
  }
  const fg = over(resolveColour(p.fg, tokens), bg);
  return { value: ratio(fg, bg), detail: `${hex(fg)} on ${hex(bg)}` };
}

// ---------------------------------------------------------------------------------------------------------
// Palette: no red anywhere

function hsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** Red: hue within 15 degrees of pure red, clearly saturated, neither near black nor near white. Pink
 *  (the emulator hue, about 337 degrees) and amber (about 40 degrees) are outside it. */
export function isRed(c) {
  const { h, s, l } = hsl(c);
  return (h >= 345 || h <= 15) && s >= 0.35 && l >= 0.15 && l <= 0.85;
}

function paletteLiterals(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? [];
  return [...new Set(found)];
}

// ---------------------------------------------------------------------------------------------------------

export function checkContrast(css) {
  const themes = themeTokens(css);
  const results = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const p of pairs()) {
      const { value, detail } = evaluate(p, tokens);
      results.push({ theme, group: p.group, min: p.min, what: p.what, value, detail, pass: value >= p.min });
    }
  }
  const red = paletteLiterals(css).filter((lit) => isRed(resolveColour(lit, {})));
  return { results, red };
}

function main() {
  const all = process.argv.includes("--all");
  const css = readFileSync(CSS_PATH, "utf8");
  const { results, red } = checkContrast(css);
  const enforced = results.filter((r) => r.group !== "advisory");
  const failures = enforced.filter((r) => !r.pass);
  const line = (r) => `  ${r.pass ? "pass" : "FAIL"}  ${r.theme.padEnd(5)}  ${r.group.padEnd(8)}  ${r.value.toFixed(2).padStart(5)} >= ${r.min}  ${r.what}  [${r.detail}]`;

  console.log("Contrast check: web/src/index.css, dark and light themes (WCAG 2.2 ratios)");
  for (const theme of ["dark", "light"]) {
    for (const group of ["text", "glyph", "control", "advisory"]) {
      const rows = results.filter((r) => r.theme === theme && r.group === group);
      const worst = rows.reduce((a, b) => (b.value < a.value ? b : a));
      const passing = rows.filter((r) => r.pass).length;
      console.log(`  ${theme.padEnd(5)}  ${group.padEnd(8)}  ${passing}/${rows.length} reach ${worst.min}:1; lowest ${worst.value.toFixed(2)} (${worst.what})`);
    }
  }
  // Every pair with --all (advisory pairs under 3:1 show as "note"); otherwise only the enforced failures.
  if (all) results.forEach((r) => console.log(r.group === "advisory" ? line(r).replace("FAIL", "note") : line(r)));
  else failures.forEach((r) => console.log(line(r)));
  red.forEach((lit) => console.log(`  FAIL  palette  ${lit} is red; the palette has no red`));

  if (failures.length || red.length) {
    console.log(`${failures.length} enforced pair(s) below their minimum, ${red.length} red colour(s).`);
    process.exit(1);
  }
  console.log(`All ${enforced.length} enforced pairs pass in both themes; no red in the palette.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
