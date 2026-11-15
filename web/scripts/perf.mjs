// How smooth the plane is: a repeatable benchmark against the production preview (npm run build, then
// npm run preview, at http://localhost:4173).
//
//   node scripts/perf.mjs [--base http://localhost:4173] [--cpu 4] [--dpr 2] [--runs 3] [--only hover,drag,solids]
//         [--profile out.cpuprofile] [--json out.json]
//
// It starts a headless Chrome with its DevTools protocol (Node's own WebSocket and fetch, as scripts/matrix.mjs
// does: no dependency), opens the plane at 1440 x 900 with the intro marked seen, and runs each scenario:
//   - hover: the mouse sweeps across the plot (the probe previews, the panel follows), Solids only off;
//   - hover-solids: the same sweep with Solids only on;
//   - drag: a press, a sweep and a release with Solids only on (the probe moves, the address bar commits once);
//   - solids: S pressed eight times, toggling Solids only.
// Mouse moves arrive every 8 ms (a 125 Hz mouse). For each run it records, from inside the page, every frame's
// interval (requestAnimationFrame), and from a DevTools trace the main thread's busy time split by kind (script,
// style, layout, paint, compositing, garbage collection). The CPU can be slowed (--cpu 4 is a mid-range laptop
// on battery) and the pixel ratio raised (--dpr 2 is a high-density screen), since both change where time goes.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:4173");
const CPU = Number(arg("cpu", "4"));
const DPR = Number(arg("dpr", "2"));
const RUNS = Number(arg("runs", "3"));
const ONLY = arg("only", "")?.split(",").filter(Boolean) ?? [];
const PROFILE = arg("profile", "");
const JSON_OUT = arg("json", "");
const PORT = 9334;
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error("Chrome not found: set CHROME to its path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- a minimal DevTools protocol client (as in scripts/matrix.mjs) ----
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
  const on = (method, f) => listeners.set(method, [...(listeners.get(method) ?? []), f]);
  const off = (method, f) => listeners.set(method, (listeners.get(method) ?? []).filter((g) => g !== f));
  const once = (method) => new Promise((r) => {
    const f = (p) => {
      off(method, f);
      r(p);
    };
    on(method, f);
  });
  return new Promise((r) => ws.addEventListener("open", () => r({ send, on, off, once, close: () => ws.close() })));
}

// ---- trace: main thread busy time by kind ----
const KINDS = {
  script: ["FunctionCall", "EventDispatch", "TimerFire", "FireAnimationFrame", "EvaluateScript", "v8.compile", "RunMicrotasks"],
  style: ["UpdateLayoutTree", "RecalculateStyles", "ParseAuthorStyleSheet"],
  layout: ["Layout", "UpdateLayer"],
  paint: ["Paint", "PrePaint", "PaintImage", "Decode Image"],
  composite: ["Layerize", "Commit", "UpdateLayerTree", "CompositeLayers"],
  gc: ["MinorGC", "MajorGC", "V8.GC_SCAVENGER", "V8.GC_MARK_COMPACTOR", "BlinkGC.AtomicPhase"],
};
const KIND_OF = Object.fromEntries(Object.entries(KINDS).flatMap(([k, names]) => names.map((n) => [n, k])));

async function traced(cdp, body) {
  const events = [];
  const collect = (p) => events.push(...p.value);
  cdp.on("Tracing.dataCollected", collect);
  await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "v8", "disabled-by-default-devtools.timeline"], recordMode: "recordAsMuchAsPossible" } });
  const out = await body();
  const done = cdp.once("Tracing.tracingComplete");
  await cdp.send("Tracing.end");
  await done;
  cdp.off("Tracing.dataCollected", collect);
  // The renderer's main thread for the page.
  const mains = new Set(events.filter((e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`));
  const onMain = events.filter((e) => mains.has(`${e.pid}:${e.tid}`) && e.ph === "X" && typeof e.dur === "number");
  const busy = onMain.filter((e) => e.name === "RunTask").reduce((s, e) => s + e.dur, 0) / 1000;
  const long = onMain.filter((e) => e.name === "RunTask" && e.dur > 50000);
  const byKind = {};
  for (const e of onMain) {
    const k = KIND_OF[e.name];
    if (k) byKind[k] = (byKind[k] ?? 0) + e.dur / 1000;
  }
  for (const k of Object.keys(byKind)) byKind[k] = Math.round(byKind[k]);
  return { ...out, busyMs: Math.round(busy), longTasks: long.length, longestTaskMs: Math.round(Math.max(0, ...long.map((e) => e.dur / 1000))), byKind };
}

// ---- in-page frame recorder ----
const FRAMES_START = `(() => { window.__f = []; window.__fOn = true; const t = (ts) => { if (!window.__fOn) return; window.__f.push(ts); requestAnimationFrame(t); }; requestAnimationFrame(t); return true; })()`;
const FRAMES_STOP = `(() => { window.__fOn = false; const f = window.__f; const d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); d.sort((a, b) => a - b); const q = (p) => d.length ? Math.round(d[Math.min(d.length - 1, Math.floor(p * d.length))] * 10) / 10 : null; return { frames: f.length, p50: q(0.5), p95: q(0.95), max: d.length ? Math.round(d[d.length - 1]) : null, slow: d.filter((x) => x > 25).length, wallMs: f.length > 1 ? Math.round(f[f.length - 1] - f[0]) : 0 }; })()`;

async function main() {
  const profileDir = mkdtempSync(join(tmpdir(), "redshift-perf-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
  const results = { base: BASE, cpu: CPU, dpr: DPR, runs: RUNS, scenarios: {} };
  try {
    const cdp = await connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: DPR, mobile: false });
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "no-preference" }] });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("redshift-theme", "dark"); localStorage.setItem("redshift-intro-v1", "done"); } catch (e) {}` });

    const open = async (path) => {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.send("Page.navigate", { url: BASE + path });
      await loaded;
      for (let k = 0; k < 100 && !(await evaluate(`!!document.querySelector('svg[role=application]')`)); k++) await sleep(100);
      await sleep(1500); // data files, fonts and the first paint settle
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    };
    // The plot's hit area: the largest rect inside the plane's SVG.
    const plot = async () => evaluate(`(() => { const svg = document.querySelector('svg[role=application]'); let best = null, area = 0; for (const r of svg.querySelectorAll('rect')) { const b = r.getBoundingClientRect(); if (b.width * b.height > area) { area = b.width * b.height; best = b; } } return { x: best.left, y: best.top, w: best.width, h: best.height }; })()`);
    const mouse = (type, x, y, extra = {}) => cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });
    const sweep = async (b, drag) => {
      const N = 160;
      const at = (i) => {
        const t = i / (N - 1);
        return [b.x + b.w * (0.08 + 0.84 * t), b.y + b.h * (0.5 + 0.35 * Math.sin(t * Math.PI * 3))];
      };
      const [sx, sy] = at(0);
      await mouse("mouseMoved", sx, sy);
      if (drag) await mouse("mousePressed", sx, sy, { button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i < N; i++) {
        const [px, py] = at(i);
        const sent = Date.now();
        await mouse("mouseMoved", px, py, drag ? { button: "left", buttons: 1 } : {});
        const wait = 8 - (Date.now() - sent);
        if (wait > 0) await sleep(wait);
      }
      const [ex, ey] = at(N - 1);
      if (drag) await mouse("mouseReleased", ex, ey, { button: "left", buttons: 0, clickCount: 1 });
      await sleep(300);
    };
    const pressS = async () => {
      for (let i = 0; i < 8; i++) {
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "s", code: "KeyS", text: "s", windowsVirtualKeyCode: 83 });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS", windowsVirtualKeyCode: 83 });
        await sleep(400);
      }
    };

    const SCENARIOS = {
      hover: { path: "/?o2=34&p=8.2", run: async () => sweep(await plot(), false) },
      "hover-solids": { path: "/?o2=34&p=8.2&solids=1", run: async () => sweep(await plot(), false) },
      drag: { path: "/?o2=34&p=8.2&solids=1", run: async () => sweep(await plot(), true) },
      solids: { path: "/?o2=34&p=8.2", run: async () => {
        await evaluate(`document.querySelector('svg[role=application]').focus()`);
        await pressS();
      } },
    };

    for (const [name, sc] of Object.entries(SCENARIOS)) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      const runs = [];
      for (let r = 0; r < RUNS; r++) {
        await open(sc.path);
        const profiling = PROFILE && r === 0 && name === (ONLY[0] ?? "hover-solids");
        if (profiling) {
          await cdp.send("Profiler.enable");
          await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
          await cdp.send("Profiler.start");
        }
        const res = await traced(cdp, async () => {
          await evaluate(FRAMES_START);
          await sc.run();
          return { frames: await evaluate(FRAMES_STOP) };
        });
        if (profiling) {
          const { profile } = await cdp.send("Profiler.stop");
          writeFileSync(PROFILE, JSON.stringify(profile));
        }
        runs.push(res);
      }
      // The median run by main-thread busy time stands for the scenario; all runs are kept.
      const sorted = [...runs].sort((a, b) => a.busyMs - b.busyMs);
      results.scenarios[name] = { median: sorted[Math.floor(sorted.length / 2)], runs };
      const m = results.scenarios[name].median;
      console.log(`${name.padEnd(13)} busy ${String(m.busyMs).padStart(5)} ms | frames ${m.frames.frames} p50 ${m.frames.p50} p95 ${m.frames.p95} max ${m.frames.max} slow ${m.frames.slow} | long tasks ${m.longTasks} (longest ${m.longestTaskMs} ms) | ${JSON.stringify(m.byKind)}`);
    }
    cdp.close();
  } finally {
    chrome.kill();
    await sleep(500);
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* Chrome may still hold the profile on Windows */
    }
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
