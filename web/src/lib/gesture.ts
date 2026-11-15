// Touch on the plane and on the phone's evidence sheet (plan, Phase 6), as pure functions tested in
// gesture.test.ts. A pinch or a two-finger pan moves the plane's window, the range of oxygen and pressure in
// view; the sheet comes to rest at one of three snap points. Nothing here makes a number: a window decides which
// part of the plane is drawn, and the panel still reads the build's counts at the probe's grid node.

/** A range of oxygen (% by volume) and of pressure (psi) to draw. */
export interface Domain { o2: [number, number]; psi: [number, number] }
export interface Pt { x: number; y: number }

/** The farthest a pinch zooms out: the All tests preset (lib/view.ts, ZOOMS.all). */
export const DOMAIN_BOUNDS: Domain = { o2: [10, 102], psi: [2.5, 50] };
/** The closest it zooms in: three points of oxygen, and a pressure range whose top is 1.2 times its bottom. */
export const MIN_O2_SPAN = 3;
export const MIN_PSI_RATIO = 1.2;
/** Two fingers closer than this are read as this far apart, so a pinch that starts tight does not leap. */
const MIN_FINGER_GAP = 24;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A range of the given span that starts at lo, moved (not shrunk) to sit inside the bounds. */
function fit(lo: number, span: number, b: [number, number]): [number, number] {
  if (span >= b[1] - b[0]) return [b[0], b[1]];
  const at = clamp(lo, b[0], b[1] - span);
  return [at, at + span];
}

const logBounds = (): [number, number] => [Math.log(DOMAIN_BOUNDS.psi[0]), Math.log(DOMAIN_BOUNDS.psi[1])];

/** A window kept inside the bounds and no closer than the nearest zoom, pressure measured on its log scale. */
export function clampDomain(d: Domain): Domain {
  const o2Span = clamp(d.o2[1] - d.o2[0], MIN_O2_SPAN, DOMAIN_BOUNDS.o2[1] - DOMAIN_BOUNDS.o2[0]);
  const lb = logBounds();
  const lSpan = clamp(Math.log(d.psi[1]) - Math.log(d.psi[0]), Math.log(MIN_PSI_RATIO), lb[1] - lb[0]);
  const [la, lz] = fit(Math.log(d.psi[0]), lSpan, lb);
  return { o2: fit(d.o2[0], o2Span, DOMAIN_BOUNDS.o2), psi: [Math.exp(la), Math.exp(lz)] };
}

/** The window during a pinch or a two-finger pan. The data that sat under the fingers' first midpoint stays under
 *  their midpoint now, and the window shrinks as the fingers spread, by the same factor on both axes (oxygen
 *  linear, pressure logarithmic, as the plane draws them). Points are in plot pixels; iw and ih are the plot's
 *  width and height. */
export function pinchDomain(start: Domain, iw: number, ih: number, from: [Pt, Pt], to: [Pt, Pt]): Domain {
  const gap = ([a, b]: [Pt, Pt]) => Math.max(MIN_FINGER_GAP, Math.hypot(a.x - b.x, a.y - b.y));
  const mid = ([a, b]: [Pt, Pt]): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const s = gap(to) / gap(from);
  const m0 = mid(from);
  const m1 = mid(to);
  // Oxygen: the value under the first midpoint, then a span narrowed by s and placed so it sits under the new one.
  const span0 = start.o2[1] - start.o2[0];
  const u = start.o2[0] + (m0.x / iw) * span0;
  const span = clamp(span0 / s, MIN_O2_SPAN, DOMAIN_BOUNDS.o2[1] - DOMAIN_BOUNDS.o2[0]);
  const lo = u - (m1.x / iw) * span;
  // Pressure, the same on its log scale (the plot's y runs upwards).
  const lb = logBounds();
  const l0 = Math.log(start.psi[0]);
  const lSpan0 = Math.log(start.psi[1]) - l0;
  const lu = l0 + (1 - m0.y / ih) * lSpan0;
  const lSpan = clamp(lSpan0 / s, Math.log(MIN_PSI_RATIO), lb[1] - lb[0]);
  const llo = lu - (1 - m1.y / ih) * lSpan;
  return clampDomain({ o2: [lo, lo + span], psi: [Math.exp(llo), Math.exp(llo + lSpan)] });
}

/** How the plot drawn for `start` must move to show `next`, while a pinch is under way: a plot pixel (x, y) of
 *  the start window goes to (kx * x + tx, ky * y + ty). Exact, not an approximation: oxygen is linear in x and the
 *  log of pressure is linear in y, so each axis maps by a scale and a shift. The plane applies it as a transform
 *  and draws the new window afresh when the fingers lift. */
export function pinchTransform(start: Domain, next: Domain, iw: number, ih: number): { kx: number; tx: number; ky: number; ty: number } {
  const span0 = start.o2[1] - start.o2[0];
  const span1 = next.o2[1] - next.o2[0];
  const kx = span0 / span1;
  const tx = ((start.o2[0] - next.o2[0]) * iw) / span1;
  const c0 = Math.log(start.psi[0]);
  const c1 = Math.log(next.psi[0]);
  const l0 = Math.log(start.psi[1]) - c0;
  const l1 = Math.log(next.psi[1]) - c1;
  const ky = l0 / l1;
  const ty = ih * (1 - ky) - ((c0 - c1) * ih) / l1;
  return { kx, tx, ky, ty };
}

/** The phone's evidence sheet rests at one of three points: peek shows the readout tiles, half shows what is
 *  missing too, full shows everything. */
export type Snap = "peek" | "half" | "full";
export const SNAPS: Snap[] = ["peek", "half", "full"];

/** How far ahead a flick is projected, in milliseconds of its own speed. */
const FLICK_AHEAD = 180;

/** Where the sheet comes to rest as a drag ends: the snap point nearest to where it was heading, projected a short
 *  way along its speed, so a flick carries on to the next point. Heights are the sheet's visible part in px, and
 *  the speed is in px per millisecond, positive while the sheet grows. */
export function snapFor(visible: number, speed: number, stops: Record<Snap, number>): Snap {
  const aim = visible + speed * FLICK_AHEAD;
  return SNAPS.reduce<Snap>((best, s) => (Math.abs(stops[s] - aim) < Math.abs(stops[best] - aim) ? s : best), "peek");
}

/** The next snap point up (+1) or down (-1), staying at the ends. */
export function stepSnap(s: Snap, dir: 1 | -1): Snap {
  return SNAPS[clamp(SNAPS.indexOf(s) + dir, 0, SNAPS.length - 1)];
}
