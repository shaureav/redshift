// The action bar, pinned to the bottom of the panel: Dossier, Tests, Compare, Brief and Share. Share copies the
// view's link and says so in a toast. The toast's live region is always in the page, so a screen reader
// announces it when the words arrive.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BriefIcon, CompareIcon, DossierIcon, ShareIcon, TestsIcon } from "./Icons";

export interface ActionLinks { dossier?: string; evidence: string; compare: string; brief: string }

const ACTION =
  "flex h-12 w-full flex-col items-center justify-center gap-1 rounded-md text-xs font-medium text-ink-2 transition-colors hover:bg-[color:var(--surface-3)] hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent";

function Action({ to, icon, label, onClick, disabled, title }: { to?: string; icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; title?: string }) {
  if (to) return <Link className={ACTION} to={to}>{icon}{label}</Link>;
  return <button type="button" className={ACTION} onClick={onClick} disabled={disabled} title={title}>{icon}{label}</button>;
}

export function ActionBar({ links, onShare, toast }: { links: ActionLinks; onShare?: () => void; toast?: string | null }) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto border-t border-line bg-[color:var(--surface)] px-3 py-2">
      <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-full right-3 mb-2">
        {toast && <p className="floating animate-rise px-3 py-2 text-sm text-ink">{toast}</p>}
      </div>
      <nav aria-label="Take this point further">
        <ul className="grid grid-cols-5 gap-1">
          <li>
            {links.dossier ? (
              <Action to={links.dossier} icon={<DossierIcon />} label="Dossier" />
            ) : (
              <Action icon={<DossierIcon />} label="Dossier" disabled title="Dossiers cover the named atmospheres; snap the probe to one" />
            )}
          </li>
          <li><Action to={links.evidence} icon={<TestsIcon />} label="Tests" /></li>
          <li><Action to={links.compare} icon={<CompareIcon />} label="Compare" /></li>
          <li><Action to={links.brief} icon={<BriefIcon />} label="Brief" /></li>
          <li>{onShare && <Action icon={<ShareIcon />} label="Share" onClick={onShare} />}</li>
        </ul>
      </nav>
    </div>
  );
}
