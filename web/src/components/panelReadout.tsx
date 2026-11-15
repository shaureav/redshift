// The panel's readout: the point in the Title role, what it is, its one-sentence answer, and four tiles (gas,
// droplet, solid, BRE) with the build's counts near it. A tile with no tests is hatched and says "no tests
// recorded": empty means unknown, never safe. A changed count crossfades in where the old one stood; it never
// counts up through values that are not data (D18). Every number is a Value.
import { FUELS, type Fuel, type Reading } from "../lib/probe";
import type { Candidate } from "../lib/types";
import { FuelMarker } from "./Common";
import { Value } from "./Value";

const TILE_LABEL: Record<Fuel, string> = { gas: "Gas", droplet: "Droplet", solid: "Solid", emulator: "BRE emulator" };

/** The point's one-sentence answer, built only from built counts. A paper count shows only when it is not zero. */
export function PointHeadline({ r }: { r: Reading }) {
  const solid = r.nearClass.solid;
  if (r.total.v === 0) return <>No tests recorded near this point.</>;
  return (
    <>
      <Value val={r.total} unit={false} /> {r.total.v === 1 ? "test sits" : "tests sit"} near this point.{" "}
      {solid === 0 ? (
        <>None is a solid material.</>
      ) : r.near.solid.published_paper.v > 0 ? (
        <>Solid material: <Value val={r.near.solid.psi_table} unit={false} /> from PSI tables, <Value val={r.near.solid.published_paper} unit={false} /> from verified papers.</>
      ) : (
        <>Solid material: <Value val={r.near.solid.psi_table} unit={false} /> from PSI tables.</>
      )}
    </>
  );
}

function eyebrowFor(candidate: Candidate | null, preview: boolean): string {
  if (preview) return "Preview";
  if (!candidate) return "Probe";
  if (candidate.role === "scenario") return "Challenge scenario, not a NASA candidate";
  if (candidate.role === "suit") return "Spacesuit atmosphere";
  return "Candidate atmosphere";
}

function Tile({ fuel, r, fade }: { fuel: Fuel; r: Reading; fade: boolean }) {
  const n = r.near[fuel];
  const empty = r.nearClass[fuel] === 0;
  // On a hatched tile the words sit on a solid chip, so the hatch never runs through them (AA in both themes).
  const chip = empty ? "-mx-1 w-fit rounded-sm bg-[color:var(--surface-2)] px-1" : "";
  return (
    <li className="tile gap-1 px-3 py-2" data-empty={empty}>
      <span className={`tile-label flex items-center gap-2 ${chip}`}>
        <FuelMarker fuel={fuel} size={12} /> {TILE_LABEL[fuel]}
      </span>
      <span className={`flex flex-wrap items-baseline gap-x-2 ${chip}`}>
        {/* Keyed on the count while pinned, so a new count fades in; while the probe moves it swaps at once. */}
        <span key={fade ? n.psi_table.v : "live"} className={`tile-value ${fade ? "swap-in" : ""}`}>
          <Value val={n.psi_table} unit={false} />
        </span>
        <span className={`text-xs text-ink-2 ${empty ? "italic" : ""}`}>{empty ? "no tests recorded" : "from PSI tables"}</span>
      </span>
      {n.published_paper.v > 0 && (
        <span className="text-xs text-ink-2">
          plus <Value val={n.published_paper} unit={false} /> from verified papers
        </span>
      )}
    </li>
  );
}

/** The readout. compact (the phone's bottom sheet, below lg): the tiles come straight after the point, so the
 *  sheet's peek is the point and its tiles (data-sheet-peek marks where the peek ends), and what the point is and
 *  its one-sentence answer follow them; the handle above stands in for the top padding. On a tablet's wider sheet
 *  the four tiles sit in one row. */
export function Readout({ r, candidate, preview, outside, compact = false }: { r: Reading; candidate: Candidate | null; preview: boolean; outside: boolean; compact?: boolean }) {
  const about = (
    <>
      {candidate && <p className={compact ? "mt-3 text-sm text-ink-2" : "text-sm text-ink-2"}>{candidate.short}</p>}
      {outside && <p className="mt-1 text-sm text-[color:var(--amber-ink)]">Outside the probe grid; showing its nearest edge point.</p>}
      {/* The panel's lead: the one sentence a reader should take away, the largest text in the panel (D40). */}
      <p className="mt-3 text-body font-semibold text-ink lg:text-heading" aria-live="polite"><PointHeadline r={r} /></p>
    </>
  );
  const tiles = (
    <ul className="mt-3 grid grid-cols-2 gap-2 md:max-lg:grid-cols-4" aria-label="Tests near this point by fuel class" data-sheet-peek="">
      {FUELS.map((f) => <Tile key={f} fuel={f} r={r} fade={!preview} />)}
    </ul>
  );
  return (
    <header className={compact ? "px-5 pb-4" : "px-5 pb-4 pt-4"}>
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{eyebrowFor(candidate, preview)}</span>
        {preview && <span className="text-xs text-ink-3">Tap or click to pin</span>}
      </div>
      <h2 className="mt-1 text-title num max-sm:text-heading">
        <Value val={r.o2} /> <span className="text-ink-3">O2</span> · <Value val={r.psi} />{" "}
        <span className="text-base font-normal text-ink-2">(<Value val={r.kpa} digits={1} />)</span>
      </h2>
      {compact ? <>{tiles}{about}</> : <>{about}{tiles}</>}
    </header>
  );
}
