// Verify: the human half of the paper findings (docs/DECISIONS.md D39). Each AI-drafted finding is shown with
// the exact quote, the numbers taken from it and the extracted text of its PDF page, the quote marked in place.
// A named reviewer accepts or rejects it. Decisions stay in this browser until downloaded as verifications.json,
// the same append-only log scripts/verify_findings.py writes; only the Python build turns an accepted finding
// into evidence on the plane. Nothing on this page is evidence: every number here is an unverified draft.
import { useMemo, useState } from "react";
import { ErrorNote, Loading, PageHeader } from "../components/Common";
import { useData } from "../lib/data";
import { doiUrl, ntrsUrl } from "../lib/format";

interface Draft {
  id: string;
  investigation: string | null;
  kind: string | null;
  finding: string;
  quote: string;
  page: number | null;
  source_file: string;
  ntrs_id: string | null;
  doi: string | null;
  values: { name: string; value: number; unit: string | null; as_written: string }[];
  problems: string[];
  verification: LogEntry | null;
  page_text: string | null;
}
interface LogEntry { finding_id: string; decision: "accept" | "reject"; verified_by: string; verified_at: string; note?: string }
interface Queue { findings: Draft[]; log: LogEntry[] }
type Local = Record<string, { decision: "accept" | "reject"; note?: string; at: string }>;

const KEY = "redshift-verify-v1";
const NAME_KEY = "redshift-verify-name";
// The findings the access-gap story leans on come first.
const ORDER = ["Saffire VI", "Saffire V", "Saffire IV and V", "Exploration atmospheres", "Saffire IV", "ACME BRE", "FLEX"];

const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: decisions live until the page closes */
  }
};

/** The quote's place in the page text, matched word by word across any run of white space. */
function locate(text: string, quote: string): [number, number] | null {
  const words = quote.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return null;
  const m = new RegExp(words.join("\\s+")).exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

export default function Verify() {
  const q = useData<Queue>("verify_queue.json");
  const [name, setName] = useState(() => read(NAME_KEY, ""));
  const [local, setLocal] = useState<Local>(() => read(KEY, {}));
  const [show, setShow] = useState<"todo" | "all">("todo");

  const items = useMemo(() => {
    const f = q.data?.findings ?? [];
    const rank = (d: Draft) => {
      const i = ORDER.indexOf(d.investigation ?? "");
      return i < 0 ? ORDER.length : i;
    };
    return [...f].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  }, [q.data]);

  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading what="the review queue" />;

  const decide = (id: string, decision: "accept" | "reject", note?: string) => {
    const next = { ...local, [id]: { decision, note, at: new Date().toISOString().replace(/\.\d+Z$/, "Z") } };
    setLocal(next);
    save(KEY, next);
  };
  const undo = (id: string) => {
    const next = { ...local };
    delete next[id];
    setLocal(next);
    save(KEY, next);
  };
  const mine = Object.keys(local).length;
  const download = () => {
    const entries: LogEntry[] = Object.entries(local).map(([finding_id, d]) => ({
      finding_id,
      decision: d.decision,
      verified_by: name.trim(),
      verified_at: d.at,
      ...(d.note ? { note: d.note } : {}),
    }));
    const blob = new Blob([JSON.stringify([...q.data.log, ...entries], null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "verifications.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const shown = items.filter((d) => show === "all" || (!d.verification && !local[d.id]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <PageHeader
        title="Verify paper findings"
        lead="An AI read NASA's papers and drafted each finding with an exact quote and page. Code has already checked that every quote is on its page and every number is in its quote. A person must still read each one in context: nothing here reaches the plane until a named team member accepts it and the build runs again."
      />
      <ol className="mb-6 grid gap-2 rounded-lg border border-line bg-surface-2 p-4 text-sm text-ink-2 sm:grid-cols-3">
        <li><span className="font-semibold text-ink">1. Read.</span> Check the quote is on the page as marked, and that the finding and every number say only what the quote says.</li>
        <li><span className="font-semibold text-ink">2. Decide.</span> Accept, or reject with a note. Decisions stay in this browser.</li>
        <li><span className="font-semibold text-ink">3. Hand over.</span> Download verifications.json, save it as data/findings/verifications.json and rebuild.</li>
      </ol>

      <div className="sticky top-[var(--nav-h)] z-10 mb-6 flex flex-wrap items-end gap-3 border-b border-line bg-[color:var(--bg)] py-3">
        <label className="flex flex-col text-xs text-ink-3">
          Your name, as the app will show it
          <input className="field mt-1 w-56" value={name} onChange={(e) => { setName(e.target.value); save(NAME_KEY, e.target.value); }} placeholder="Full name" />
        </label>
        <span className="seg" role="group" aria-label="Which findings to show">
          <button type="button" aria-pressed={show === "todo"} onClick={() => setShow("todo")}>Still to check</button>
          <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")}>All</button>
        </span>
        <span className="text-sm text-ink-2">{mine === 0 ? "No decisions yet in this browser." : `${mine} decided in this browser.`}</span>
        <button type="button" className="btn btn-primary ml-auto" disabled={!name.trim() || mine === 0} onClick={download}>
          Download verifications.json
        </button>
      </div>
      {!name.trim() && <p className="mb-4 text-sm text-ink-2">Enter your name to decide: every verification records who made it.</p>}

      {shown.length === 0 && <p className="text-sm text-ink-2">Nothing left to check here. Download the file and rebuild.</p>}
      <ul className="space-y-6">
        {shown.map((d) => (
          <FindingCard key={d.id} d={d} mine={local[d.id]} canDecide={!!name.trim()} onDecide={decide} onUndo={undo} />
        ))}
      </ul>
    </div>
  );
}

function FindingCard({ d, mine, canDecide, onDecide, onUndo }: {
  d: Draft;
  mine?: Local[string];
  canDecide: boolean;
  onDecide: (id: string, decision: "accept" | "reject", note?: string) => void;
  onUndo: (id: string) => void;
}) {
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const at = d.page_text ? locate(d.page_text, d.quote) : null;
  const link = ntrsUrl(d.ntrs_id) ?? doiUrl(d.doi);
  return (
    <li className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="eyebrow">{d.investigation ?? "Paper"}{d.kind ? ` · ${d.kind}` : ""} · {d.id}</span>
        <span className="text-xs text-ink-3">
          {d.source_file.split("/").pop()}{d.page !== null ? `, page ${d.page}` : ""}
          {link && <> · <a className="underline underline-offset-2" href={link} target="_blank" rel="noreferrer">Open the paper</a></>}
        </span>
      </div>
      <p className="mt-2 font-medium">{d.finding}</p>
      <p className="mt-1 text-xs text-ink-3">Draft, unverified: the numbers below are what the AI read from the quote.</p>
      {d.values.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 font-medium">Quantity</th><th className="font-medium">Read as</th><th className="font-medium">Written in the quote</th></tr></thead>
          <tbody>
            {d.values.map((v) => (
              <tr key={v.name} className="border-t border-line"><td className="py-1 pr-3">{v.name}</td><td className="num pr-3">{String(v.value)}{v.unit ? ` ${v.unit}` : ""}</td><td className="num">&ldquo;{v.as_written}&rdquo;</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <blockquote className="mt-3 border-l-4 border-l-accent bg-surface-2 px-3 py-2 text-sm">&ldquo;{d.quote}&rdquo;</blockquote>
      <details className="mt-3" open={!mine && !d.verification}>
        <summary className="cursor-pointer text-sm text-ink-2">The page as extracted{at ? ", with the quote marked" : ""}</summary>
        {d.page_text ? (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface-2 p-3 text-xs leading-relaxed">
            {at ? <>{d.page_text.slice(0, at[0])}<mark className="rounded-sm bg-[color:var(--accent)] px-0.5 text-[color:var(--bg)]">{d.page_text.slice(at[0], at[1])}</mark>{d.page_text.slice(at[1])}</> : d.page_text}
          </pre>
        ) : (
          <p className="mt-2 text-sm text-ink-2">No extracted text for this page: open the paper to read the quote.</p>
        )}
        {d.page_text && !at && <p className="mt-1 text-xs text-ink-3">The quote could not be marked here (the build matched it after typographic normalisation). Find it on the page or in the paper.</p>}
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {d.verification && !mine && (
          <span className="text-sm text-ink-2">Already {d.verification.decision === "accept" ? "accepted" : "rejected"} by {d.verification.verified_by}.</span>
        )}
        {mine ? (
          <>
            <span className="text-sm font-medium">{mine.decision === "accept" ? "Accepted" : "Rejected"} in this browser{mine.note ? `: ${mine.note}` : ""}.</span>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => onUndo(d.id)}>Undo</button>
          </>
        ) : rejecting ? (
          <>
            <input className="field field-sm w-72" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is wrong?" aria-label="What is wrong with this finding" />
            <button type="button" className="btn btn-sm" disabled={!note.trim()} onClick={() => onDecide(d.id, "reject", note.trim())}>Reject</button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRejecting(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-sm btn-primary" disabled={!canDecide} onClick={() => onDecide(d.id, "accept")}>Accept: quote, finding and numbers match</button>
            <button type="button" className="btn btn-sm" disabled={!canDecide} onClick={() => setRejecting(true)}>Something is wrong</button>
          </>
        )}
      </div>
    </li>
  );
}
