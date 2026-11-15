// The plane's shortcut handler (plan, Phase 4): each key maps to its action, and nothing fires while someone types,
// while a modal dialog is open, with a modifier held, or on a held key's repeats.
import { afterEach, describe, expect, it } from "vitest";
import { isTyping, shortcutFor } from "./shortcuts";

const key = (k: string, target: EventTarget | null = document.body, init: Partial<KeyboardEvent> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, defaultPrevented: false, isComposing: false, target, ...init }) as KeyboardEvent;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  document.body.appendChild(e);
  return e;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shortcutFor", () => {
  it("maps 1 to 5 to the candidates in order, and no other digit", () => {
    expect(["1", "2", "3", "4", "5"].map((k) => shortcutFor(key(k)))).toEqual([0, 1, 2, 3, 4].map((index) => ({ kind: "candidate", index })));
    expect(shortcutFor(key("0"))).toBeNull();
    expect(shortcutFor(key("6"))).toBeNull();
  });

  it("maps S, G, C, P (either case) and ?", () => {
    for (const k of ["s", "S"]) expect(shortcutFor(key(k))).toEqual({ kind: "solids" });
    for (const k of ["g", "G"]) expect(shortcutFor(key(k))).toEqual({ kind: "gap" });
    for (const k of ["c", "C"]) expect(shortcutFor(key(k))).toEqual({ kind: "compare" });
    for (const k of ["p", "P"]) expect(shortcutFor(key(k))).toEqual({ kind: "pin" });
    expect(shortcutFor(key("?"))).toEqual({ kind: "sheet" });
  });

  it("leaves every other key alone", () => {
    for (const k of ["b", "Enter", "Escape", "ArrowLeft", " ", "Tab", "/"]) expect(shortcutFor(key(k))).toBeNull();
  });

  it("never fires while typing in a field", () => {
    const typing: EventTarget[] = [
      el("input"),
      el("input", { type: "search" }),
      el("input", { type: "number" }),
      el("textarea"),
      el("select"),
      el("div", { role: "combobox" }),
      el("div", { role: "textbox" }),
      el("div", { contenteditable: "true" }),
    ];
    for (const t of typing) {
      for (const k of ["1", "s", "g", "c", "p", "?"]) expect(shortcutFor(key(k, t))).toBeNull();
    }
  });

  it("does fire from a checkbox, a button or the plane itself, which take no text", () => {
    for (const t of [el("input", { type: "checkbox" }), el("button"), el("div", { role: "application", tabindex: "0" })]) {
      expect(shortcutFor(key("s", t))).toEqual({ kind: "solids" });
    }
  });

  it("never fires behind a modal dialog, with Ctrl, Cmd or Alt, on a repeat, mid-composition or when already handled", () => {
    expect(shortcutFor(key("s"), true)).toBeNull();
    expect(shortcutFor(key("c", document.body, { ctrlKey: true }))).toBeNull(); // copy stays copy
    expect(shortcutFor(key("k", document.body, { metaKey: true }))).toBeNull();
    expect(shortcutFor(key("1", document.body, { altKey: true }))).toBeNull();
    expect(shortcutFor(key("s", document.body, { repeat: true }))).toBeNull(); // a held S does not flicker
    expect(shortcutFor(key("s", document.body, { isComposing: true }))).toBeNull();
    expect(shortcutFor(key("s", document.body, { defaultPrevented: true }))).toBeNull();
  });
});

describe("isTyping", () => {
  it("treats a field's descendants as the field and non-elements as not typing", () => {
    const box = el("div", { role: "textbox" });
    const inner = document.createElement("span");
    box.appendChild(inner);
    expect(isTyping(inner)).toBe(true);
    expect(isTyping(null)).toBe(false);
    expect(isTyping(window)).toBe(false);
    expect(isTyping(document)).toBe(false);
  });
});
