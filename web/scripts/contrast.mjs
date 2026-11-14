// Contrast check for the design tokens (docs/redesign/EXCEPTIONAL_PLAN.md, sections 3 and 5).
//
// Reads the colour tokens straight from src/index.css for three themes (dark, light, and print: the
// @media print block over the dark tokens, the worst case of printing from the default theme), resolves
// var(), rgb() and color-mix(), and computes WCAG 2.2 contrast ratios for:
//   - every text pair: each text token on each surface it can sit on, at 4.5:1 (AA for body text, even where
//     the text is large);
//   - every data glyph against the surfaces it is drawn on, at 3:1: a filled fuel glyph passes when its fill
//     or its 1 px ring reaches 3:1, an outlined glyph when its edge does;
//   - every control boundary and state indicator (control line, focus ring, accent, switch knob), at 3:1;
//   - the palette: no colour literal anywhere in index.css may be red (house rule);
//   - the print block: it must set every token the light block sets, so no dark value reaches paper.
// Reported as advisory, not enforced:
//   - hatching, at the opacities actually drawn (sea and strips 30%, the plane's blind area 40%, or 70% under
//     Solids only, zero bars 70%, empty tiles 60%). Where text says "no tests recorded" beside it, the text
//     carries the meaning. On the plane the blind area (and, from Phase 3, the sea) has only the legend, and
//     there the hatch falls well below 3:1: that visibility decision is open (OPEN_QUESTIONS Q22), with the
//     coast line (3:1 or better, enforced below) the candidate carrier;
//   - isotherms and dividers (quiet on purpose; each isotherm is labelled, dividers are decorative);
//   - pressed against unpressed boundaries (accent against control-line): a hue step only, so a pressed or
//     open control also doubles its boundary to 2 px and a pressed segment gets a 2 px underline (index.css).
//
// Run: npm run contrast (or node scripts/contrast.mjs [--all]). npm run test runs it before vitest.
// Exit code 1 when any enforced pair fails, a red colour is found or the print block misses a light token.
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

const norm = (s) => s.replace(/\s+/g, "");
const merge = (blocks) => Object.assign({}, ...blocks);

/** The token blocks of index.css: shared, dark, light, and the root rule inside @media print. */
function tokenBlocks(css) {
  const rules = topLevelRules(css);
  const pick = (list, sel) => list.filter((r) => norm(r.selector) === sel).map((r) => declarations(r.body));
  const printMedia = rules.filter((r) => norm(r.selector) === "@mediaprint");
  const printRules = printMedia.flatMap((r) => topLevelRules(r.body));
  return {
    shared: pick(rules, ":root"),
    dark: pick(rules, ':root,:root[data-theme="dark"]'),
    light: pick(rules, ':root[data-theme="light"]'),
    print: pick(printRules, ":root,:root[data-theme]"),
  };
}

/** The custom properties in force on the root element in each theme. The first colour block's selector list
 *  is `:root, :root[data-theme="dark"]`, so it applies in the light theme too, under the light block. Print is
 *  the print block over the dark theme: printing from the default theme, the case that leaves the most behind. */
export function themeTokens(css) {
  const { shared, dark, light, print } = tokenBlocks(css);
  if (!dark.length || !light.length) throw new Error("index.css: the dark or the light token block is missing");
  if (!print.length) throw new Error("index.css: the print token block (:root, :root[data-theme] in @media print) is missing");
  return { dark: merge([...shared, ...dark]), light: merge([...shared, ...dark, ...light]), print: merge([...shared, ...dark, ...print]) };
}

/** Tokens the light block sets that the print block does not: each would print in its dark-theme value. */
export function printGaps(css) {
  const { light, print } = tokenBlocks(css);
  const printed = merge(print);
  return Object.keys(merge(light)).filter((k) => !(k in printed));
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

  // Hatching at the opacity each use draws it (Plane.tsx, EvidencePanel.tsx, index.css .tile).
  const surface2 = PAGE[2];
  const sea = PLANE[1];
  const hatches = [
    { opacity: 0.3, bg: sea, what: "sea hatching at 30% (Phase 3; legend only, no text in place)" },
    { opacity: 0.3, bg: surface2, what: "no-pressure strip hatching at 30% (lane labelled)" },
    { opacity: 0.4, bg: surface2, what: "blind-area hatching at 40% on the plane (legend only, no text in place)" },
    { opacity: 0.7, bg: surface2, what: "blind-area hatching at 70% under Solids only (legend only, no text in place)" },
    { opacity: 0.7, bg: surface2, what: "zero-count bar hatching at 70% (with \"no tests recorded\" text)" },
    { opacity: 0.6, bg: surface2, what: "empty tile hatching at 60% (with \"no tests recorded\" text)" },
    { opacity: 1, bg: surface2, what: "empty-state hatching at full strength (with its title)" },
  ];
  for (const h of hatches) list.push({ group: "advisory", min: 3, fg: v("hatch"), opacity: h.opacity, bg: h.bg, what: h.what });
  for (const s of PLANE) list.push({ group: "advisory", min: 3, fg: v("isotherm"), bg: s, what: `isotherm line on ${s.label} (quiet on purpose; each is labelled)` });
  for (const d of ["line", "line-strong"]) for (const s of PAGE) list.push({ group: "advisory", min: 3, fg: v(d), bg: s, what: `${d} divider on ${s.label} (decorative)` });
  list.push({ group: "advisory", min: 3, fg: v("accent"), bg: { label: "control-line", expr: v("control-line") }, what: "pressed boundary (accent) against unpressed (control-line): hue only, so pressed also doubles to 2 px" });
  list.push({ group: "advisory", min: 3, fg: v("surface-3"), bg: LAYERED[0], what: "palette active row (surface-3 on floating): the 2 px accent bar carries the state" });
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
  const fg = over(resolveColour(p.fg, tokens), bg, p.opacity ?? 1);
  return { value: ratio(fg, bg), detail: `${hex(fg)} on ${hex(bg)}${p.opacity !== undefined && p.opacity < 1 ? ` (at ${Math.round(p.opacity * 100)}%)` : ""}` };
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
  return { results, red, printGaps: printGaps(css) };
}

function main() {
  const all = process.argv.includes("--all");
  const css = readFileSync(CSS_PATH, "utf8");
  const { results, red, printGaps: gaps } = checkContrast(css);
  const enforced = results.filter((r) => r.group !== "advisory");
  const failures = enforced.filter((r) => !r.pass);
  const line = (r) => `  ${r.pass ? "pass" : "FAIL"}  ${r.theme.padEnd(5)}  ${r.group.padEnd(8)}  ${r.value.toFixed(2).padStart(5)} >= ${r.min}  ${r.what}  [${r.detail}]`;

  console.log("Contrast check: web/src/index.css, dark, light and print themes (WCAG 2.2 ratios)");
  for (const theme of ["dark", "light", "print"]) {
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
  gaps.forEach((name) => console.log(`  FAIL  print    ${name} is set by the light theme but not by the print block; it would print in its dark value`));

  if (failures.length || red.length || gaps.length) {
    console.log(`${failures.length} enforced pair(s) below their minimum, ${red.length} red colour(s), ${gaps.length} token(s) missing from print.`);
    process.exit(1);
  }
  console.log(`All ${enforced.length} enforced pairs pass in the dark, light and print themes; no red in the palette; print sets every light token.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
