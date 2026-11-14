// Renders AI-assisted text from ai_text.json. Every number inside it is a <Value> with provenance;
// the text itself was checked by code (no bare numbers, no banned wording, every citation exists).
import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../lib/data";
import type { Val } from "../lib/types";
import { Badge } from "./Common";
import { Value } from "./Value";

type Seg = { t: string } | { val: Val };
interface Para { segments: Seg[]; cites: string[]; pending?: boolean }
export interface AiItem {
  id: string;
  target?: string;
  question?: string;
  paragraphs: Para[];
  not_covered?: string;
  human_checked: boolean;
  checked_by?: string | null;
  checked_at?: string | null;
}
export interface AiData { summaries: AiItem[]; qa: AiItem[] }

const COUNT_UNITS = new Set(["tests", "sessions", "findings"]);

function Paragraph({ p }: { p: Para }) {
  return (
    <p className={`${p.pending ? "text-ink-3 italic" : ""}`}>
      {p.segments.map((s, i) =>
        "t" in s ? <span key={i}>{s.t}</span> : <Value key={i} val={s.val} unit={s.val.u && COUNT_UNITS.has(s.val.u) ? false : undefined} />,
      )}
      {p.cites.length > 0 && (
        <span className="ml-1 text-xs text-ink-3">
          [
          {p.cites.map((c, i) => (
            <span key={c}>
              {i > 0 && ", "}
              {c.startsWith("PSI-") ? <Link className="mono underline" to={`/investigations?open=${c}`}>{c}</Link> : <span className="mono">{c}</span>}
            </span>
          ))}
          ]
        </span>
      )}
    </p>
  );
}

export function AiLabelFor({ item }: { item: AiItem }) {
  return item.human_checked ? (
    <Badge tone="teal" title={`Checked by ${item.checked_by} at ${item.checked_at}`}>AI-assisted, human-checked</Badge>
  ) : (
    <Badge tone="amber" title="Drafted with AI from the data shown and checked by code; not yet checked by a team member">AI-assisted, awaiting human check</Badge>
  );
}

export function AiText({ item }: { item: AiItem }) {
  return (
    <div className="space-y-2 text-sm">
      {item.paragraphs.map((p, i) => <Paragraph key={i} p={p} />)}
      {item.not_covered && <p className="text-ink-2"><span className="font-medium">What the data does not cover.</span> {item.not_covered.replace(/^Not covered( here)?: /, "")}</p>}
    </div>
  );
}

export function CandidateSummary({ candidateId }: { candidateId: string }) {
  const { data } = useData<AiData>("ai_text.json");
  const item = data?.summaries.find((s) => s.target === candidateId);
  if (!item) return null;
  return (
    <section className="card p-4" aria-label="Summary">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Summary</h2>
        <AiLabelFor item={item} />
      </div>
      <AiText item={item} />
    </section>
  );
}

// Question box: answers only from checked, cached answers. Live questions would need a model key on a
// server, which this deployment does not use; the box says so.
export function AskPanel() {
  const { data } = useData<AiData>("ai_text.json");
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  const item = data.qa.find((q) => q.id === open);
  return (
    <section className="card p-4" aria-labelledby="ask-h">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="ask-h" className="text-base font-semibold">Ask Redshift</h2>
        <span className="text-xs text-ink-3">Cached answers, grounded only in this dataset. Live questions are switched off in this deployment.</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2" role="list">
        {data.qa.map((q) => (
          <button key={q.id} role="listitem" type="button" onClick={() => setOpen(q.id === open ? null : q.id)} aria-pressed={q.id === open}
            className="chip h-auto min-h-8 whitespace-normal py-1 text-left text-xs">
            {q.question}
          </button>
        ))}
      </div>
      {item && (
        <div aria-live="polite">
          <div className="mb-2"><AiLabelFor item={item} /></div>
          <AiText item={item} />
        </div>
      )}
    </section>
  );
}
