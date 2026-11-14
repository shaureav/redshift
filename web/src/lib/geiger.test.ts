// Geiger mode (plan, Phase 4; D4): the audio module does nothing, not even create an AudioContext, until someone
// turns it on with a gesture; the choice is kept per device and survives blocked storage; the click rate is
// proportional to the near-test total at the probe, and open sea is silent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickRate, CLICKS_PER_TEST, createGeiger, MAX_RATE, SOUND_KEY, type GeigerDeps } from "./geiger";

/** A stand-in AudioContext that counts what the module asks of it. */
function fakeAudio() {
  const made: FakeCtx[] = [];
  class FakeCtx {
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    clicks = 0;
    state = "running";
    constructor() {
      made.push(this);
    }
    createGain() {
      return { gain: { value: 1 }, connect() {} };
    }
    createBuffer(_ch: number, n: number) {
      const data = new Float32Array(n);
      return { getChannelData: () => data };
    }
    createBufferSource() {
      return { buffer: null, connect() {}, start: () => void this.clicks++ };
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    }
  }
  return { Ctor: FakeCtx as unknown as NonNullable<GeigerDeps["AudioContext"]>, made };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m } as unknown as Storage & { m: Map<string, string> };
}

let gesture = false;
const isGesture = () => gesture;

beforeEach(() => {
  vi.useFakeTimers();
  gesture = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("clickRate", () => {
  it("is proportional to the near-test total, capped, and silent at zero", () => {
    expect(clickRate(0)).toBe(0);
    expect(clickRate(-3)).toBe(0);
    expect(clickRate(Number.NaN)).toBe(0);
    expect(clickRate(37)).toBeCloseTo(37 * CLICKS_PER_TEST);
    expect(clickRate(80) / clickRate(40)).toBeCloseTo(2);
    expect(clickRate(100000)).toBe(MAX_RATE);
  });
});

describe("the audio module", () => {
  it("is off by default and creates no AudioContext however the page drives it", () => {
    const { Ctor, made } = fakeAudio();
    const storage = memoryStorage();
    const g = createGeiger({ AudioContext: Ctor, storage: () => storage, isGesture, doc: () => document });
    expect(g.enabled).toBe(false);
    g.setTotal(300);
    g.armOnGesture(); // off, so nothing is armed
    document.dispatchEvent(new Event("pointerup"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    vi.advanceTimersByTime(2000);
    g.pause();
    expect(made).toHaveLength(0);
    expect(g.running).toBe(false);
  });

  it("refuses to turn on outside a user gesture, and records nothing", () => {
    const { Ctor, made } = fakeAudio();
    const storage = memoryStorage();
    const g = createGeiger({ AudioContext: Ctor, storage: () => storage, isGesture, doc: () => document });
    expect(g.enable()).toBe(false);
    expect(made).toHaveLength(0);
    expect(storage.m.has(SOUND_KEY)).toBe(false);
  });

  it("starts inside a gesture, clicks at the probe's rate, falls silent at sea and remembers the choice", () => {
    const { Ctor, made } = fakeAudio();
    const storage = memoryStorage();
    const g = createGeiger({ AudioContext: Ctor, storage: () => storage, isGesture, doc: () => document, random: () => 0.5 });
    g.setTotal(200); // 10 clicks a second
    gesture = true; // inside the Sound tool's click handler
    expect(g.enable()).toBe(true);
    gesture = false;
    expect(made).toHaveLength(1);
    expect(g.running).toBe(true);
    expect(storage.m.get(SOUND_KEY)).toBe("on");
    const ctx = made[0] as unknown as { currentTime: number; clicks: number };
    for (let t = 1; t <= 20; t++) {
      ctx.currentTime = t * 0.05;
      vi.advanceTimersByTime(50);
    }
    expect(ctx.clicks).toBeGreaterThan(5); // about 10 in the first second
    const before = ctx.clicks;
    g.setTotal(0); // open sea: no tests near, no clicks
    for (let t = 21; t <= 40; t++) {
      ctx.currentTime = t * 0.05;
      vi.advanceTimersByTime(50);
    }
    expect(ctx.clicks).toBe(before);
    g.disable();
    expect(g.running).toBe(false);
    expect(storage.m.get(SOUND_KEY)).toBe("off");
  });

  it("left on last visit, it still waits for the first tap or key press before making an AudioContext", () => {
    const { Ctor, made } = fakeAudio();
    const storage = memoryStorage({ [SOUND_KEY]: "on" });
    const g = createGeiger({ AudioContext: Ctor, storage: () => storage, isGesture, doc: () => document });
    expect(g.enabled).toBe(true);
    g.setTotal(100);
    g.armOnGesture();
    vi.advanceTimersByTime(1000);
    expect(made).toHaveLength(0);
    // An event that is not a gesture (a script's synthetic event, say) is refused.
    document.dispatchEvent(new Event("pointerup"));
    expect(made).toHaveLength(0);
    gesture = true;
    document.dispatchEvent(new Event("pointerup"));
    expect(made).toHaveLength(1);
    expect(g.running).toBe(true);
  });

  it("survives storage that throws, and a browser without WebAudio", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    const { Ctor, made } = fakeAudio();
    const g = createGeiger({ AudioContext: Ctor, storage: () => throwing, isGesture: () => true, doc: () => document });
    expect(g.enabled).toBe(false);
    expect(g.enable()).toBe(true); // works for this visit
    expect(made).toHaveLength(1);
    const silent = createGeiger({ AudioContext: null, storage: () => memoryStorage(), isGesture: () => true, doc: () => document });
    expect(silent.enable()).toBe(false);
    expect(silent.enabled).toBe(false); // nothing recorded for a sound that cannot play
  });
});
