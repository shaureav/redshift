// The plane's pinch window and the phone sheet's snap points (lib/gesture.ts), and the window's round trip
// through the address bar (lib/view.ts).
import { describe, expect, it } from "vitest";
import { clampDomain, DOMAIN_BOUNDS, MIN_O2_SPAN, MIN_PSI_RATIO, pinchDomain, pinchTransform, snapFor, stepSnap, type Domain } from "./gesture";
import { parseView, writeView, ZOOMS } from "./view";

const habitat: Domain = { o2: ZOOMS.habitat.o2, psi: ZOOMS.habitat.psi };
const IW = 300;
const IH = 200;
/** The data under a plot pixel for a window, as the plane draws it: oxygen linear, pressure logarithmic. */
const dataAt = (d: Domain, x: number, y: number) => ({
  o2: d.o2[0] + (x / IW) * (d.o2[1] - d.o2[0]),
  psi: Math.exp(Math.log(d.psi[0]) + (1 - y / IH) * (Math.log(d.psi[1]) - Math.log(d.psi[0]))),
});

describe("pinch window", () => {
  it("moves the drawn plot so every point lands where the new window draws it (the transform during a pinch)", () => {
    const next = pinchDomain(habitat, IW, IH, [{ x: 100, y: 120 }, { x: 160, y: 80 }], [{ x: 40, y: 150 }, { x: 230, y: 30 }]);
    const { kx, tx, ky, ty } = pinchTransform(habitat, next, IW, IH);
    // Where a data point sits in a window's plot, the inverse of dataAt.
    const pixelOf = (d: Domain, o2: number, psi: number) => ({
      x: ((o2 - d.o2[0]) / (d.o2[1] - d.o2[0])) * IW,
      y: IH * (1 - (Math.log(psi) - Math.log(d.psi[0])) / (Math.log(d.psi[1]) - Math.log(d.psi[0]))),
    });
    for (const [x, y] of [[0, 0], [IW, IH], [37, 151], [250, 12]]) {
      const v = dataAt(habitat, x, y);
      const p = pixelOf(next, v.o2, v.psi);
      expect(kx * x + tx).toBeCloseTo(p.x, 6);
      expect(ky * y + ty).toBeCloseTo(p.y, 6);
    }
    expect(pinchTransform(habitat, habitat, IW, IH)).toEqual({ kx: 1, tx: 0, ky: 1, ty: 0 });
  });

  it("halves the window as the fingers spread to twice their distance, about their midpoint", () => {
    const d = pinchDomain(habitat, IW, IH, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 50, y: 100 }, { x: 250, y: 100 }]);
    expect(d.o2[1] - d.o2[0]).toBeCloseTo(15, 6);
    expect(Math.log(d.psi[1] / d.psi[0])).toBeCloseTo(Math.log(17 / 6) / 2, 6);
    // The data under the midpoint (150, 100) is the same before and after.
    const before = dataAt(habitat, 150, 100);
    const after = dataAt(d, 150, 100);
    expect(after.o2).toBeCloseTo(before.o2, 6);
    expect(after.psi).toBeCloseTo(before.psi, 6);
  });

  it("pans with two fingers that move together: what was under them follows them", () => {
    const d = pinchDomain(habitat, IW, IH, [{ x: 100, y: 100 }, { x: 140, y: 100 }], [{ x: 40, y: 60 }, { x: 80, y: 60 }]);
    expect(d.o2[1] - d.o2[0]).toBeCloseTo(30, 6);
    const before = dataAt(habitat, 120, 100);
    const after = dataAt(d, 60, 60);
    expect(after.o2).toBeCloseTo(before.o2, 6);
    expect(after.psi).toBeCloseTo(before.psi, 6);
  });

  it("stops at the nearest zoom and at the All tests range, and stays inside it", () => {
    const close = pinchDomain(habitat, IW, IH, [{ x: 140, y: 100 }, { x: 160, y: 100 }], [{ x: 0, y: 100 }, { x: 300, y: 100 }]);
    expect(close.o2[1] - close.o2[0]).toBeCloseTo(MIN_O2_SPAN, 6);
    expect(close.psi[1] / close.psi[0]).toBeCloseTo(MIN_PSI_RATIO, 6);
    const far = pinchDomain(habitat, IW, IH, [{ x: 0, y: 100 }, { x: 300, y: 100 }], [{ x: 149, y: 100 }, { x: 151, y: 100 }]);
    expect(far.o2).toEqual(DOMAIN_BOUNDS.o2);
    expect(far.psi[0]).toBeCloseTo(DOMAIN_BOUNDS.psi[0], 6);
    expect(far.psi[1]).toBeCloseTo(DOMAIN_BOUNDS.psi[1], 6);
    // A pan past the edge moves the window back inside, keeping its size.
    const edge = clampDomain({ o2: [95, 110], psi: [1, 2] });
    expect(edge.o2).toEqual([87, 102]);
    expect(edge.psi[0]).toBeCloseTo(DOMAIN_BOUNDS.psi[0], 6);
    expect(edge.psi[1]).toBeCloseTo(5, 6);
  });
});

describe("the evidence sheet's snap points", () => {
  const stops = { peek: 240, half: 420, full: 780 };

  it("rests at the nearest point when let go slowly, and carries a flick on to the next", () => {
    expect(snapFor(300, 0, stops)).toBe("peek");
    expect(snapFor(350, 0, stops)).toBe("half");
    expect(snapFor(700, 0, stops)).toBe("full");
    expect(snapFor(300, 1, stops)).toBe("half"); // upwards at 1 px per ms
    expect(snapFor(500, -1.2, stops)).toBe("peek"); // a flick down from above half
  });

  it("steps up and down, staying at the ends", () => {
    expect([stepSnap("peek", 1), stepSnap("half", 1), stepSnap("full", 1)]).toEqual(["half", "full", "full"]);
    expect([stepSnap("full", -1), stepSnap("half", -1), stepSnap("peek", -1)]).toEqual(["half", "peek", "peek"]);
  });
});

describe("the pinched window in the address bar", () => {
  it("round-trips, and a preset clears it", () => {
    const sp = writeView({ win: { o2: [20.123456, 35.5], psi: [7, 12.25] } }, new URLSearchParams("o2=34&p=8.2"));
    expect(sp.get("win")).toBe("20.123,35.5,7,12.25");
    const win = parseView(sp).win!;
    [...win.o2, ...win.psi].forEach((v, k) => expect(v).toBeCloseTo([20.123, 35.5, 7, 12.25][k], 9));
    expect(writeView({ zoom: "plane", win: null }, sp).get("win")).toBeNull();
  });

  it("ignores a window that is not a range, and keeps one inside the bounds", () => {
    for (const bad of ["1,2,3", "30,20,6,17", "20,30,0,17", "a,b,c,d"]) expect(parseView(new URLSearchParams(`win=${bad}`)).win).toBeNull();
    expect(parseView(new URLSearchParams("win=0,5,6,17")).win?.o2).toEqual([10, 15]);
  });
});
