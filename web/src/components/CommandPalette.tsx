// Command palette (Cmd+K or Ctrl+K): jump to any atmosphere or point, material, investigation, test id
// or page. Typing "8.2 psi 34%" moves the probe there.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../lib/data";
import { requestPlane, type PlaneRequest } from "../lib/planeRequest";
import type { ProbeGridFile } from "../lib/probe";
import type { Candidate, Investigation } from "../lib/types";
import { parsePoint } from "../lib/view";
import { SearchIcon } from "./Icons";

export const PALETTE_EVENT = "redshift:palette";
export const THEME_EVENT = "redshift:theme";

interface Item { id: string; group: string; label: string; hint?: string; run: () => void }

const PAGES: [string, string][] = [
  ["/", "The plane"],
  ["/compare", "Compare atmospheres"],
  ["/evidence", "Evidence Explorer"],
  ["/investigations", "Investigations"],
  ["/dossiers", "Dossiers"],
  ["/planner", "Test Planner"],
  ["/quality", "Data Quality"],
  ["/methods", "Methods"],
  ["/about", "About"],
];

function matches(q: string, text: string): boolean {
  const t = text.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => t.includes(w));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);
  const navigate = useNavigate();
  const onPlane = useLocation().pathname === "/";
  const cands = useData<{ candidates: Candidate[] }>("candidates.json");
  const grid = useData<ProbeGridFile>("probe_grid.json");
  const invs = useData<{ investigations: Investigation[] }>(open ? "investigations.json" : "candidates.json");

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        opener.current = document.activeElement;
        setOpen((o) => !o);
      }
    };
    const ev = () => { opener.current = document.activeElement; setOpen(true); };
    document.addEventListener("keydown", key);
    window.addEventListener(PALETTE_EVENT, ev);
    return () => { document.removeEventListener("keydown", key); window.removeEventListener(PALETTE_EVENT, ev); };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    } else if ((opener.current instanceof HTMLElement || opener.current instanceof SVGElement) && opener.current !== document.body) {
      opener.current.focus(); // the plane, the usual opener on the plane page, is an SVG element
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => { setOpen(false); navigate(to); };
    // Something the plane page does (lib/planeRequest.ts). On the plane the view in the address bar stays as it
    // is; from another page the plane opens with its defaults. The request is stored, not timed, so a plane page
    // still downloading takes it when it mounts. It is made once the palette has closed and handed focus back, so
    // the sheet or the intro takes focus from there and returns it there.
    const toPlane = (r: PlaneRequest) => () => {
      setOpen(false);
      if (!onPlane) navigate("/");
      setTimeout(() => requestPlane(r), 0);
    };
    const out: Item[] = [];
    const pt = parsePoint(q);
    if (pt) out.push({ id: "pt", group: "Go to a point", label: `${pt.o2}% O2, ${pt.psi} psi`, hint: "Move the probe", run: go(`/?o2=${pt.o2}&p=${pt.psi}`) });
    for (const c of cands.data?.candidates ?? []) {
      const label = `${c.name}`;
      if (!q || matches(q, `${label} ${c.short} atmosphere candidate`)) out.push({ id: `c-${c.id}`, group: "Atmospheres", label, hint: c.short, run: go(`/?o2=${c.o2_pct.v}&p=${c.pressure_psi.v}`) });
    }
    if (q) {
      const testQ = q.trim().toUpperCase();
      if (/^PSI-\d+/.test(testQ)) {
        const ids = (grid.data?.inputs ?? []).concat(grid.data?.pressure_unknown_inputs ?? []).map((t) => t.id).filter((id) => id.toUpperCase().startsWith(testQ)).slice(0, 5);
        for (const id of ids) out.push({ id: `t-${id}`, group: "Tests", label: id, hint: "Open its record", run: go(`/evidence?ids=${encodeURIComponent(id)}&test=${encodeURIComponent(id)}`) });
        if (!ids.length && testQ.includes("-L")) out.push({ id: "t-any", group: "Tests", label: testQ, hint: "Open in the Evidence Explorer", run: go(`/evidence?ids=${encodeURIComponent(testQ)}&test=${encodeURIComponent(testQ)}`) });
      }
      for (const inv of invs.data && "investigations" in invs.data ? invs.data.investigations : []) {
        const acr = (inv.acronym?.v as string | undefined) ?? inv.id;
        const title = (inv.title?.v as string | undefined) ?? "";
        if (matches(q, `${inv.id} ${acr} ${title}`)) out.push({ id: `i-${inv.id}`, group: "Investigations", label: `${acr}`, hint: `${inv.id} · ${title.slice(0, 60)}`, run: go(`/investigations?open=${inv.id}`) });
      }
      const labels = new Set<string>();
      for (const t of (grid.data?.inputs ?? []).concat(grid.data?.pressure_unknown_inputs ?? [])) if (t.label && (t.fuel_class === "solid" || t.fuel_class === "emulator")) labels.add(t.label);
      for (const l of [...labels].filter((l) => matches(q, `${l} material`)).slice(0, 8)) out.push({ id: `m-${l}`, group: "Materials", label: l, hint: "Material dossier", run: go(`/dossiers/material/${encodeURIComponent(l)}`) });
    }
    for (const [to, label] of PAGES) if (!q || matches(q, label)) out.push({ id: `p-${to}`, group: "Pages", label, run: go(to) });
    const acts: Item[] = [
      { id: "a-solids", group: "Actions", label: "Show solids only", run: go("/?solids=1") },
      { id: "a-gap", group: "Actions", label: "Open the access gap chart", run: go("/?view=gap") },
      { id: "a-theme", group: "Actions", label: "Switch light or dark theme", run: () => { setOpen(false); window.dispatchEvent(new Event(THEME_EVENT)); } },
      { id: "a-intro", group: "Actions", label: "Replay the intro", hint: "The access gap in three beats", run: toPlane("intro") },
      { id: "a-keys", group: "Actions", label: "Show keyboard shortcuts", run: toPlane("shortcuts") },
    ];
    for (const a of acts) if (!q || matches(q, a.label)) out.push(a);
    return out.slice(0, 40);
  }, [q, cands.data, grid.data, invs.data, navigate, onPlane]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;
  const groups = [...new Set(items.map((i) => i.group))];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
  };

  return (
    <div className="animate-fade scrim fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="floating animate-rise w-full max-w-[640px] overflow-hidden" onKeyDown={onKey}>
        {/* The field is always focused while the palette is open. Its focus shows as a 2 px accent rule
            inside the search row: the usual outline would sit outside the field and be clipped by the box. */}
        <div className="flex items-center gap-3 border-b border-line px-4 focus-within:shadow-[inset_0_-2px_0_var(--focus)]">
          <SearchIcon className="flex-none text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Atmosphere, point (8.2 psi 34%), material, investigation or test id"
            className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pal-${items[active].id}` : undefined}
            aria-label="Search"
          />
          <span className="kbd">Esc</span>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[56vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">Nothing matches. Try an oxygen and pressure such as &ldquo;26.5% 10.2 psi&rdquo;.</li>}
          {groups.map((g) => (
            <li key={g} role="presentation">
              <div className="eyebrow px-3 pb-1 pt-3">{g}</div>
              <ul role="presentation">
                {items.filter((i) => i.group === g).map((i) => {
                  const idx = items.indexOf(i);
                  return (
                    <li
                      key={i.id}
                      id={`pal-${i.id}`}
                      role="option"
                      aria-selected={idx === active}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => i.run()}
                      className="option flex cursor-pointer items-baseline justify-between gap-4 rounded-md px-3 py-2 text-sm text-ink-2"
                    >
                      <span className={i.group === "Tests" ? "mono" : ""}>{i.label}</span>
                      {i.hint && <span className="truncate text-xs text-ink-3">{i.hint}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="flex gap-4 border-t border-line px-4 py-2 text-xs text-ink-3">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> move</span>
          <span><span className="kbd">Enter</span> open</span>
        </div>
      </div>
    </div>
  );
}
