// A toolbar menu stays inside the viewport (Phase 3 review): on a 390 px phone the Candidates, Layers and Zoom
// tools sit right of centre, and their 256 px menus used to run past the right edge and scroll the page sideways.
import { describe, expect, it } from "vitest";
import { menuShift } from "./planeToolbar";

describe("menuShift", () => {
  it("leaves a menu that fits where it is, under its tool", () => {
    expect(menuShift(40, 1440)).toEqual({ left: 0, width: 256 });
  });

  it("shifts each phone menu left until its right edge is 16 px inside a 390 px screen", () => {
    // The tools' left edges measured in the review at 390 x 844: Candidates 164, Layers 212, Zoom 260.
    for (const toolLeft of [164, 212, 260]) {
      const { left, width } = menuShift(toolLeft, 390);
      expect(toolLeft + left + width).toBeLessThanOrEqual(390 - 16);
      expect(toolLeft + left).toBeGreaterThanOrEqual(16);
    }
  });

  it("narrows the menu to the screen less both gutters on a very small screen", () => {
    const { left, width } = menuShift(200, 280);
    expect(width).toBe(248);
    expect(200 + left).toBe(16);
  });
});
