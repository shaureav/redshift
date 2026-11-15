// The shortcut sheet (plan, Phase 4): every key the plane answers to, opened with ? or from the command palette.
// A modal dialog: focus moves into it, Tab stays in it, Escape or ? closes it and focus goes back where it was.
import { Fragment, useEffect, useRef } from "react";
import { PLANE_KEYS, SHORTCUT_KEYS } from "../lib/shortcuts";
import { CloseIcon } from "./Icons";

function Keys({ keys }: { keys: string[] }) {
  // "1 to 5" is a range; any other list is keys pressed together.
  const range = keys.length === 2 && keys[0] === "1" && keys[1] === "5";
  return (
    <span className="flex flex-none items-center gap-1 text-xs text-ink-3">
      {keys.map((k, i) => (
        <Fragment key={k}>
          {i > 0 && (range ? " to " : keys.length > 2 ? null : " + ")}
          <span className="kbd">{k}</span>
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutSheet({ candidates, onClose }: { candidates: string[]; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    closeBtn.current?.focus();
    return () => {
      // The plane, the usual opener, is an SVG element.
      if ((opener instanceof HTMLElement || opener instanceof SVGElement) && opener !== document.body) opener.focus();
    };
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "?") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // The close button is the sheet's only control, so Tab and Shift+Tab stay on it.
      e.preventDefault();
      closeBtn.current?.focus();
    }
  };
  return (
    // z-[59]: above the story intro (z-[58]) and its click catcher, should it be opened while the intro plays, and
    // below a number's source card (z-[60]).
    <div className="animate-fade scrim fixed inset-0 z-[59] flex items-start justify-center overflow-y-auto p-4 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="shortcut-title" className="floating animate-rise w-full max-w-xl p-6" onKeyDown={onKeyDown}>
        <div className="flex items-center justify-between gap-4">
          <h2 id="shortcut-title" className="text-heading">Keyboard shortcuts</h2>
          <button ref={closeBtn} type="button" className="btn btn-quiet" onClick={onClose} aria-label="Close the shortcut sheet"><CloseIcon /></button>
        </div>
        <p className="mt-2 text-sm text-ink-2">These keys work anywhere on the plane page except while you type in a field.</p>
        <ul className="mt-4 space-y-2 text-sm">
          {SHORTCUT_KEYS.map((s) => (
            <li key={s.label}>
              <div className="flex items-baseline justify-between gap-4">
                <span>{s.label}</span>
                <Keys keys={s.keys} />
              </div>
              {/* The candidates' keys, in the order of the Candidates menu. */}
              {s.keys[0] === "1" && candidates.length > 0 && (
                <ol className="mt-2 space-y-1 border-l border-line pl-4 text-xs text-ink-2" aria-label="Candidate keys">
                  {candidates.slice(0, 5).map((name, i) => (
                    <li key={name} className="flex items-baseline gap-2"><span className="kbd">{i + 1}</span> {name}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
        <h3 className="eyebrow mt-6">With the plane focused</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {PLANE_KEYS.map((s) => (
            <li key={s.label} className="flex items-baseline justify-between gap-4">
              <span>{s.label}</span>
              <Keys keys={s.keys} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
