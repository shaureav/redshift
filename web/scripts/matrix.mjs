// The screenshot matrix and layout checks of docs/redesign/EXCEPTIONAL_PLAN.md (sections 3 and 10, Phase 12),
// run against the production preview (npm run build, then npm run preview, at http://localhost:4173).
//
//   node scripts/matrix.mjs [--out ../docs/redesign/after] [--base http://localhost:4173] [--only plane,intro]
//
// It starts a headless Chrome with its DevTools protocol (Node's own WebSocket and fetch: no dependency), and for
// every width (390, 768, 1440, 1920), theme (dark, light) and view (the plane, the intro's third beat, Compare,
// the brief, a provenance card; the plane again under reduced motion) it saves a screenshot and measures the page:
//   - overlaps: any two of the plane's SVG texts, pin heads, the probe's tag, the Solids only caption and the
//     toolbar whose boxes overlap (a pin's own label beside its head is not counted);
//   - under the toolbar: pin heads and glyphs the floating toolbar covers;
//   - outside: chart text that runs more than 3 px past its own SVG's edge, on any page (a text's box is its font's
//     line box, which reaches a little past the ink: the rotated axis titles' boxes overhang by up to 2.5 px);
//   - small: chart text under 12 px;
//   - scroll: whether the page scrolls sideways;
//   - targets (touch views): the hit area of each nav control and each readout tile's number, from
//     elementFromPoint, so a pseudo-element's larger target counts.
// It also saves after shots for docs/redesign/before (the same pages, 1440 dark) and the planner and the
// coverage matrix at 390. Results are printed as JSON and written to matrix.json beside the images.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:4173");
const OUT = resolve(arg("out", "../docs/redesign/after"));
const ONLY = arg("only", "")?.split(",").filter(Boolean) ?? [];
const PORT = 9333;
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error("Chrome not found: set CHROME to its path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- a minimal DevTools protocol client ----
async function connect() {
  for (let k = 0; k < 50; k++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return client(page.webSocketDebuggerUrl);
    } catch {
      /* Chrome is still starting */
    }
    await sleep(200);
  }
  throw new Error("Chrome did not open its DevTools port");
}

function client(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, fail } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) fail(new Error(`${msg.error.message}`));
      else ok(msg.result);
    } else if (msg.method) (listeners.get(msg.method) ?? []).forEach((f) => f(msg.params));
  });
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const n = ++id;
    waiting.set(n, { ok, fail });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const once = (method) => new Promise((r) => {
    const f = (p) => {
      listeners.set(method, (listeners.get(method) ?? []).filter((g) => g !== f));
      r(p);
    };
    listeners.set(method, [...(listeners.get(method) ?? []), f]);
  });
  return new Promise((r) => ws.addEventListener("open", () => r({ send, once, close: () => ws.close() })));
}

// ---- in-page measures (run with Runtime.evaluate) ----
const MEASURE = String.raw`(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    }
    return true;
  };
  const hit = (a, b, pad = 1) => a.x0 + pad < b.x1 && a.x1 - pad > b.x0 && a.y0 + pad < b.y1 && a.y1 - pad > b.y0;
  const out = { overlaps: [], underToolbar: { pins: 0, glyphs: 0 }, outside: [], small: [], scroll: document.documentElement.scrollWidth > innerWidth + 1, coarse: matchMedia("(pointer: coarse)").matches };
  const plane = document.querySelector('section[aria-label="The oxygen and pressure plane"]');
  if (plane) {
    const items = [];
    const isPin = (p) => (p.getAttribute("d") || "").startsWith("M0,0C-1.8");
    plane.querySelectorAll("svg[data-chart] text").forEach((t) => { if (seen(t)) items.push({ kind: "text", label: t.textContent.trim().slice(0, 40), g: t.parentElement, r: box(t) }); });
    plane.querySelectorAll("svg[data-chart] path").forEach((p) => { if (isPin(p) && seen(p)) items.push({ kind: "pin", label: "pin " + (p.parentElement.querySelector("text")?.textContent?.slice(0, 24) ?? ""), g: p.parentElement, r: box(p) }); });
    const tag = plane.querySelector('svg[role="application"] text');
    if (tag && seen(tag)) items.push({ kind: "tag", label: "probe tag", g: null, r: box(tag.parentElement) });
    const tb = plane.querySelector(".plane-tools > *");
    if (tb && seen(tb)) {
      const t = box(tb);
      items.push({ kind: "toolbar", label: "toolbar", g: null, r: t });
      plane.querySelectorAll("svg[data-chart] path").forEach((p) => {
        if (!seen(p)) return;
        if (isPin(p)) { if (hit(box(p), t)) out.underToolbar.pins++; }
        else if (p.closest(".glyph-class") && hit(box(p), t)) out.underToolbar.glyphs++;
      });
      out.toolbar = [Math.round(t.x0), Math.round(t.y0), Math.round(t.x1), Math.round(t.y1)];
    }
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      const A = items[a], B = items[b];
      if (A.g && A.g === B.g) continue; // a pin and its own label
      if (hit(A.r, B.r)) out.overlaps.push(A.label + " | " + B.label);
    }
    out.planeItems = items.length;
  }
  document.querySelectorAll("svg").forEach((svg) => {
    if (!seen(svg) || svg.closest('[aria-hidden="true"]') && !svg.matches("[data-chart]")) return;
    const s = box(svg);
    svg.querySelectorAll("text").forEach((t) => {
      if (!seen(t)) return;
      const r = box(t);
      if (svg.matches("[data-chart]") && (r.x0 < s.x0 - 3 || r.x1 > s.x1 + 3)) out.outside.push(t.textContent.trim().slice(0, 30));
      const fs = parseFloat(getComputedStyle(t).fontSize);
      if (fs < 11.95) out.small.push(t.textContent.trim().slice(0, 20) + " " + fs + "px");
    });
  });
  if (out.coarse) {
    const size = (el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const on = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
      if (!on(cx, cy)) return null;
      let l = cx, rr = cx, t = cy, b = cy;
      while (on(l - 1, cy) && l > 0) l--;
      while (on(rr + 1, cy) && rr < innerWidth) rr++;
      while (on(cx, t - 1) && t > 0) t--;
      while (on(cx, b + 1) && b < innerHeight) b++;
      return [Math.round(rr - l + 1), Math.round(b - t + 1)];
    };
    out.targets = {};
    document.querySelectorAll('nav[aria-label="Main"] a, nav[aria-label="Main"] button').forEach((el) => {
      if (!seen(el)) return;
      out.targets[(el.getAttribute("aria-label") || el.textContent.trim()).slice(0, 24)] = size(el);
    });
    document.querySelectorAll(".tile-value [data-prov] > button").forEach((el, k) => { if (seen(el)) out.targets["tile " + (k + 1)] = size(el); });
  }
  return JSON.stringify(out);
})()`;

const WIDTHS = [
  { w: 390, h: 844, touch: true },
  { w: 768, h: 1024, touch: true },
  { w: 1440, h: 900, touch: false },
  { w: 1920, h: 1080, touch: false },
];
const THEMES = ["dark", "light"];

/** Each view: where it opens, what to do there, and whether to capture the whole page. */
const VIEWS = {
  plane: { path: "/?o2=34&p=8.2", ready: 'svg[role="application"]' },
  "plane-reduced": { path: "/?o2=34&p=8.2", ready: 'svg[role="application"]', reduced: true },
  "plane-solids": { path: "/?o2=34&p=8.2&solids=1", ready: 'svg[role="application"]' },
  "intro-beat3": { path: "/", intro: true, ready: "#intro-title", steps: ['[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Next").click()', '[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Next").click()'] },
  compare: { path: "/compare?pts=34,8.2;26.5,10.2&m=1", ready: "main h1", full: true },
  brief: { path: "/brief?o2=34&p=8.2", ready: "main h1", full: true },
  provenance: { path: "/?o2=34&p=8.2", ready: ".tile-value [data-prov] > button", steps: ['document.querySelector(".tile-value [data-prov] > button").click()'] },
};

/** After shots for each before shot in docs/redesign/before (1440 dark unless the name says phone). */
const PAIRS = [
  { name: "landing-1440", path: "/?o2=34&p=8.2", ready: 'svg[role="application"]' },
  { name: "landing-phone", path: "/?o2=34&p=8.2", ready: 'svg[role="application"]', phone: true },
  { name: "map-1440", path: "/map", ready: 'svg[role="application"]' },
  { name: "evidence-1440", path: "/evidence", ready: "main h1" },
  { name: "investigations-1440", path: "/investigations", ready: "main h1" },
  { name: "planner-1440", path: "/planner", ready: "svg[data-chart]" },
  { name: "quality-1440", path: "/quality", ready: "main h1" },
  { name: "dossier-c8_2_34-1440", path: "/dossiers/candidate/c8_2_34", ready: "main h1" },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "redshift-matrix-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
  const results = {};
  try {
    const cdp = await connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
    const waitFor = async (sel) => {
      for (let k = 0; k < 100; k++) {
        if (await evaluate(`!!document.querySelector(${JSON.stringify(sel)})`)) return true;
        await sleep(100);
      }
      return false;
    };
    let bootScript = null;
    const open = async ({ path, w, h, touch, theme, reduced = false, intro = false }) => {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: touch });
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
      if (bootScript) await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: bootScript });
      bootScript = (await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `try { localStorage.setItem("redshift-theme", ${JSON.stringify(theme)}); ${intro ? 'localStorage.removeItem("redshift-intro-v1");' : 'localStorage.setItem("redshift-intro-v1", "done");'} } catch (e) {}`,
      })).identifier;
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.send("Page.navigate", { url: BASE + path });
      await loaded;
    };
    const shoot = async (file, full) => {
      const params = { format: "png" };
      if (full) {
        const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
        Object.assign(params, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: Math.min(cssContentSize.height, 6000), scale: 1 } });
      }
      const { data } = await cdp.send("Page.captureScreenshot", params);
      writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
    };

    for (const size of WIDTHS) for (const theme of THEMES) for (const [view, v] of Object.entries(VIEWS)) {
      if (ONLY.length && !ONLY.includes(view)) continue;
      await open({ path: v.path, ...size, theme, reduced: !!v.reduced, intro: !!v.intro });
      if (!(await waitFor(v.ready))) throw new Error(`${view} at ${size.w} ${theme}: ${v.ready} never appeared`);
      await sleep(v.reduced ? 600 : 1600); // the fonts, the land and the first fades
      for (const step of v.steps ?? []) {
        await evaluate(step);
        await sleep(1800); // one scene, then the cited headline
      }
      const file = `${view}-${size.w}-${theme}.png`;
      await shoot(file, v.full);
      results[file] = JSON.parse(await evaluate(MEASURE));
      process.stdout.write(`${file} ${JSON.stringify({ overlaps: results[file].overlaps.length, under: results[file].underToolbar, scroll: results[file].scroll, outside: results[file].outside.length, small: results[file].small.length })}\n`);
    }

    if (!ONLY.length || ONLY.includes("pairs")) {
      mkdirSync(join(OUT, "pairs"), { recursive: true });
      for (const p of PAIRS) {
        const size = p.phone ? WIDTHS[0] : WIDTHS[2];
        await open({ path: p.path, ...size, theme: "dark" });
        await waitFor(p.ready);
        await sleep(1600);
        await shoot(join("pairs", `${p.name}.png`), false);
        results[`pairs/${p.name}.png`] = JSON.parse(await evaluate(MEASURE));
      }
      // The two Phase 12 charts at 390: the planner heat map and the coverage matrix, each cut to its chart.
      for (const [name, path, sel] of [["planner-390-dark", "/planner", "svg[data-chart]"], ["coverage-390-dark", "/investigations", '#investigation-coverage, [aria-label^="Coverage matrix"]']]) {
        await open({ path, ...WIDTHS[0], theme: "dark" });
        await waitFor(sel);
        await sleep(1200);
        const r = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}).closest("section, figure, article, div[id]") || document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView(); const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; })()`);
        await sleep(300);
        const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: Math.max(0, r.y - 16), width: 390, height: Math.min(r.height + 32, 3000), scale: 1 } });
        writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
        results[`${name}.png`] = JSON.parse(await evaluate(MEASURE));
        process.stdout.write(`${name}.png ${JSON.stringify({ outside: results[`${name}.png`].outside, small: results[`${name}.png`].small.length, scroll: results[`${name}.png`].scroll })}\n`);
      }
    }
    writeFileSync(join(OUT, "matrix.json"), JSON.stringify(results, null, 1) + "\n");
    cdp.close();
  } finally {
    chrome.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Chrome may still hold the profile on Windows */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
