// The plane's keyboard shortcuts (plan, Phase 4): 1 to 5 jump to the candidate atmospheres in the order the build
// lists them, S turns Solids only on or off, G opens the access gap, C opens Compare, P pins the point the panel
// shows (a hover or a press and hold included) into the address bar and ? shows the shortcut sheet. A pure
// mapping from a key press to an action, so it is tested without a page: it never fires while someone types in a
// field, while a modal dialog is open, with Ctrl, Cmd or Alt held (those belong to the browser and the palette),
// or on a held key's repeats.

export type Shortcut =
  | { kind: "candidate"; index: number }
  | { kind: "solids" }
  | { kind: "gap" }
  | { kind: "compare" }
  | { kind: "pin" }
  | { kind: "sheet" };

/** The keys, as the shortcut sheet lists them. The plane's own keys (arrows, Enter, B) work while it has focus. */
export const SHORTCUT_KEYS: { keys: string[]; label: string }[] = [
  { keys: ["1", "5"], label: "Jump to a candidate atmosphere" },
  { keys: ["S"], label: "Solids only, on or off" },
  { keys: ["G"], label: "Open the access gap chart" },
  { keys: ["C"], label: "Compare this point with a candidate" },
  { keys: ["P"], label: "Pin the point the panel shows (under the pointer, or the probe) to the link" },
  { keys: ["?"], label: "Show or hide this sheet" },
  { keys: ["Ctrl", "K"], label: "Search and jump (Cmd and K on a Mac)" },
];
export const PLANE_KEYS: { keys: string[]; label: string }[] = [
  { keys: ["←", "→", "↑", "↓"], label: "Move the probe one grid step" },
  { keys: ["Alt", "←"], label: "Move ten steps" },
  { keys: ["Shift", "←"], label: "Jump to the next candidate in that direction" },
  { keys: ["Enter"], label: "Open the candidate's dossier" },
  { keys: ["B"], label: "Select an area" },
];

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "time", "week"]);

/** Whether a key press at this element is someone typing: a text field, a text area, a select (letters pick its
 *  options), anything editable, or an element that says it takes text. */
export function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has(((el as HTMLInputElement).type || "text").toLowerCase());
  return !!el.closest('[role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"], [contenteditable=""], [contenteditable="true"]');
}

type KeyPress = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "defaultPrevented" | "target"> & { isComposing?: boolean };

/** The shortcut for a key press, or null when none applies. `modalOpen`: a modal dialog (the palette, the story
 *  intro, the access gap, this sheet) is on screen, so the page behind it does not react. */
export function shortcutFor(e: KeyPress, modalOpen = false): Shortcut | null {
  if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (modalOpen || isTyping(e.target)) return null;
  const k = e.key;
  if (k.length === 1 && k >= "1" && k <= "5") return { kind: "candidate", index: Number(k) - 1 };
  switch (k) {
    case "s":
    case "S":
      return { kind: "solids" };
    case "g":
    case "G":
      return { kind: "gap" };
    case "c":
    case "C":
      return { kind: "compare" };
    case "p":
    case "P":
      return { kind: "pin" };
    case "?":
      return { kind: "sheet" };
    default:
      return null;
  }
}
