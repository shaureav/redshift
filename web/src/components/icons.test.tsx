// The icon set holds to its spec (plan, section 5): 16 px, 1.5 px round strokes in currentColor, no fills or
// colours of its own, decorative unless named.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChevronIcon, CloseIcon, ICONS } from "./Icons";

const REQUIRED = ["probe", "pin", "layers", "compare", "brief", "share", "sound", "time", "notebook", "keyboard", "close", "chevron"];

describe("icons", () => {
  it("has every icon the plan lists", () => {
    expect(REQUIRED.filter((n) => !(n in ICONS))).toEqual([]);
  });

  it.each(Object.entries(ICONS))("%s is a 16 px stroke icon in currentColor", (_name, Icon) => {
    const svg = renderToStaticMarkup(<Icon />);
    expect(svg).toMatch(/^<svg [^>]*width="16" height="16" viewBox="0 0 16 16"/);
    for (const attr of ['fill="none"', 'stroke="currentColor"', 'stroke-width="1.5"', 'stroke-linecap="round"', 'stroke-linejoin="round"', 'aria-hidden="true"', 'focusable="false"']) {
      expect(svg).toContain(attr);
    }
    // No colour of its own: the only paint is the inherited currentColor.
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|var\(|fill="(?!none)/i);
    expect(svg).not.toContain("<title>");
  });

  it("is named for assistive technology when given a title", () => {
    const svg = renderToStaticMarkup(<CloseIcon title="Close" />);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Close"');
    expect(svg).toContain("<title>Close</title>");
    expect(svg).not.toContain("aria-hidden");
  });

  it("turns the chevron inside the icon, leaving the svg free for a rotate class", () => {
    expect(renderToStaticMarkup(<ChevronIcon />)).not.toContain("rotate(");
    const down = renderToStaticMarkup(<ChevronIcon dir="down" className="group-open:rotate-90" />);
    expect(down).toContain('transform="rotate(90 8 8)"');
    expect(down).toContain('class="group-open:rotate-90"');
  });
});
