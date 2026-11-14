// Geiger mode (plan, Phase 4; decision D4): soft clicks whose rate is proportional to the build's near-test total
// at the probe, so the plane can be heard as well as seen. Open sea (a total of zero) is silent. Opt-in and off
// by default; the choice is kept per device. Nothing here makes a sound, or even creates an AudioContext, until
// someone turns it on with a click or, when it was left on last visit, until their first tap or key press on the
// page: a page never starts audio by itself. The clicks are noise, not data: the rate is a built value times a
// constant, and no number is shown.

export const SOUND_KEY = "redshift-sound-v1";
/** One click a second for every 20 tests near the probe (the busiest node, 472 tests at 1.5 steps, is 23.6 a second). */
export const CLICKS_PER_TEST = 1 / 20;
/** A ceiling, so a future, larger build can never turn the clicks into a tone. */
export const MAX_RATE = 25;
const LOOKAHEAD_S = 0.15;
const TICK_MS = 50;
const CLICK_S = 0.006;
const VOLUME = 0.18;

/** Clicks a second for a near-test total: proportional, capped. */
export function clickRate(total: number): number {
  return Number.isFinite(total) && total > 0 ? Math.min(MAX_RATE, total * CLICKS_PER_TEST) : 0;
}

/** The built value the clicks follow at the probe: the one for the coast that is drawn, so the sound never says
 *  land where the plane shows sea. Normally that is the near-test total over every fuel class (land is where it is
 *  above zero). Under Solids only the plane draws the solid land alone: off it the clicks stop; on it they follow
 *  the larger of the two built solid values at the node (PSI's tables, verified papers), never their sum, so the
 *  browser makes no new count. */
export function soundTotal(
  r: { total: { v: number }; near: { solid: { psi_table: { v: number }; published_paper: { v: number } } } },
  solids: boolean,
  onSolidLand: boolean,
): number {
  if (!solids) return r.total.v;
  if (!onSolidLand) return 0;
  return Math.max(r.near.solid.psi_table.v, r.near.solid.published_paper.v);
}

type Ctx = Pick<AudioContext, "currentTime" | "sampleRate" | "destination" | "createBuffer" | "createBufferSource" | "createGain" | "resume" | "suspend">;
type CtxCtor = new () => Ctx;

export interface GeigerDeps {
  /** The AudioContext constructor; the browser's by default. */
  AudioContext?: CtxCtor | null;
  /** Where the choice is kept; localStorage by default. Every read and write is guarded. */
  storage?: () => Storage | null;
  /** Whether the call comes from a user gesture: navigator.userActivation where the browser has it. */
  isGesture?: () => boolean;
  /** The document whose first tap or key press may start the clicks. */
  doc?: () => Document | null;
  random?: () => number;
}

const defaultCtor = (): CtxCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: CtxCtor; webkitAudioContext?: CtxCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};
const defaultStorage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked: the choice lasts for this visit only
  }
};
const defaultGesture = () => {
  const ua = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true; // no userActivation API: trust the caller, which only calls from a handler
};
const defaultDoc = () => (typeof document === "undefined" ? null : document);

export interface Geiger {
  /** Whether the person chose sound on this device (false until they do). */
  readonly enabled: boolean;
  /** Whether an AudioContext exists and clicks are being scheduled. */
  readonly running: boolean;
  /** Turn sound on. Call only from a click or key handler: outside a gesture it records nothing and starts nothing. */
  enable(): boolean;
  /** Turn sound off and remember that. */
  disable(): void;
  /** When sound was left on, wait for the first tap or key press on the page and start then. */
  armOnGesture(): void;
  /** The near-test total at the probe; the click rate follows it. */
  setTotal(total: number): void;
  /** Stop scheduling and suspend the audio (leaving the plane, say); armOnGesture starts it again. */
  pause(): void;
}

export function createGeiger(deps: GeigerDeps = {}): Geiger {
  const ctor = () => (deps.AudioContext === undefined ? defaultCtor() : deps.AudioContext);
  const storage = deps.storage ?? defaultStorage;
  const isGesture = deps.isGesture ?? defaultGesture;
  const doc = deps.doc ?? defaultDoc;
  const random = deps.random ?? Math.random;

  let memo: boolean | null = null; // the choice made this visit, for when storage is blocked
  let ctx: Ctx | null = null;
  let out: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let rate = 0;
  let drawnFor = -1;
  let nextAt = 0;
  let disarm: (() => void) | null = null;

  // Read when asked, never at import, so a choice made in another tab is seen too.
  const isOn = () => {
    try {
      const v = storage()?.getItem(SOUND_KEY);
      if (v === "on" || v === "off") return v === "on";
    } catch {
      /* storage blocked: fall back to this visit's choice */
    }
    return memo ?? false;
  };
  const remember = (v: boolean) => {
    memo = v;
    try {
      storage()?.setItem(SOUND_KEY, v ? "on" : "off");
    } catch {
      /* storage blocked: the choice lasts for this visit only */
    }
  };

  const click = (t: number) => {
    if (!ctx || !out || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.connect(out);
    src.start(t);
  };

  // A lookahead scheduler: every 50 ms, clicks for the next 150 ms are placed at random intervals with the
  // current mean rate (a Poisson process, as a real counter clicks). A new rate is heard at once.
  const tick = () => {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (rate <= 0 || doc()?.hidden) {
      drawnFor = -1;
      return;
    }
    const gap = () => -Math.log(1 - random()) / rate;
    if (drawnFor !== rate || nextAt < now) {
      nextAt = now + gap();
      drawnFor = rate;
    }
    while (nextAt < now + LOOKAHEAD_S) {
      click(nextAt);
      nextAt += gap();
    }
  };

  /** The only place an AudioContext is made: inside a gesture, with sound chosen. */
  const start = (): boolean => {
    if (!isOn() || !isGesture()) return false;
    const C = ctor();
    if (!C) return false;
    try {
      if (!ctx) {
        ctx = new C();
        out = ctx.createGain();
        out.gain.value = VOLUME;
        out.connect(ctx.destination);
        const n = Math.max(1, Math.round(ctx.sampleRate * CLICK_S));
        noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const ch = noise.getChannelData(0);
        for (let i = 0; i < n; i++) ch[i] = (random() * 2 - 1) * Math.exp(-i / (n / 5));
      }
      void ctx.resume().catch(() => {});
    } catch {
      return false; // no audio on this device: the plane works the same without it
    }
    if (timer === null) timer = setInterval(tick, TICK_MS);
    disarm?.();
    return true;
  };

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    drawnFor = -1;
    disarm?.();
    if (ctx) void ctx.suspend().catch(() => {});
  };

  return {
    get enabled() {
      return isOn();
    },
    get running() {
      return ctx !== null && timer !== null;
    },
    enable() {
      if (!isGesture()) return false;
      remember(true);
      if (start()) return true;
      remember(false); // no audio here: do not leave "on" recorded for a sound that never plays
      return false;
    },
    disable() {
      remember(false);
      stop();
    },
    armOnGesture() {
      const d = doc();
      if (!d || !isOn() || timer !== null || disarm) return;
      // pointerup and keydown carry user activation (a touch's pointerdown does not).
      const go = () => void start();
      d.addEventListener("pointerup", go, true);
      d.addEventListener("keydown", go, true);
      disarm = () => {
        d.removeEventListener("pointerup", go, true);
        d.removeEventListener("keydown", go, true);
        disarm = null;
      };
    },
    setTotal(total: number) {
      rate = clickRate(total);
    },
    pause() {
      stop();
    },
  };
}

/** The page's one Geiger counter. */
export const geiger = createGeiger();
