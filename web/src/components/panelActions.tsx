// The action bar, pinned to the bottom of the panel: Dossier, Tests, Compare, Brief and Share. Share copies the
// view's link; the page says so in a toast (components/Toaster.tsx, one live region for the whole app).
// Away from a named atmosphere Dossier stays focusable but unavailable (aria-disabled): a press, a tap or Enter
// says why in a toast, and a screen reader hears it as the button's description.
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BriefIcon, CompareIcon, DossierIcon, ShareIcon, TestsIcon } from "./Icons";
import { toast } from "./Toaster";

export interface ActionLinks { dossier?: string; evidence: string; compare: string; brief: string }

const ACTION =
  "flex h-12 w-full flex-col items-center justify-center gap-1 rounded-md text-xs font-medium text-ink-2 transition-colors hover:bg-[color:var(--surface-3)] hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent";

const DOSSIER_HINT = "Dossiers cover the named atmospheres: snap the probe to one";

function Action({ to, icon, label, onClick }: { to?: string; icon: ReactNode; label: string; onClick?: () => void }) {
  if (to) return <Link className={ACTION} to={to}>{icon}{label}</Link>;
  return <button type="button" className={ACTION} onClick={onClick}>{icon}{label}</button>;
}

function UnavailableDossier() {
  const hint = useId();
  return (
    <>
      <button type="button" className={ACTION} aria-disabled="true" aria-describedby={hint} title={DOSSIER_HINT} onClick={() => toast(DOSSIER_HINT)}>
        <DossierIcon />Dossier
      </button>
      <span id={hint} className="sr-only">{DOSSIER_HINT}</span>
    </>
  );
}

export function ActionBar({ links, onShare }: { links: ActionLinks; onShare?: () => void }) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto border-t border-line bg-[color:var(--surface)] px-3 py-2">
      <nav aria-label="Take this point further">
        <ul className="grid grid-cols-5 gap-1">
          <li>
            {links.dossier ? (
              <Action to={links.dossier} icon={<DossierIcon />} label="Dossier" />
            ) : (
              <UnavailableDossier />
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
