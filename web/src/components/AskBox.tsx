// "Ask the evidence". Answers come only from the verified dataset:
// 1. Cached answers (data/ai/qa.json): AI-drafted templates whose every number is a slot filled from the
//    built data, rejected by the build if they contain a bare number, banned wording, an unknown citation
//    or no "not covered" statement.
// 2. A live answer, only when an API host is configured (VITE_API_BASE). The API retrieves from the
//    dataset, asks the model, and rejects any answer with a number or citation that is not in what it
//    retrieved (redshift/ai/ask.py). The static site has no key and says so.
// Any request to choose or recommend an atmosphere gets the checked refusal.
import { useEffect, useMemo, useState } from "react";
import { useData } from "../lib/data";
import type { Val } from "../lib/types";
import { AiLabelFor, AiText, type AiData, type AiItem } from "./AiText";
import { Value } from "./Value";

const API = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "");

const STOP = new Set("a an and any are at be been can could did do does for from has have how i if in is it its near of on or that the there this to was we were what when where which who why will with".split(" "));
export function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9.%\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}
const RECOMMEND = /\b(recommend\w*|choose|pick|select|best|safest?|safer|should (?:we|nasa|they) (?:use|go|pick)|which (?:atmosphere|one) (?:is|should))\b/i;

/** The checked cached answer closest to a question, or null if none shares enough words. */
export function matchCached(q: string, items: AiItem[]): { item: AiItem; score: number } | null {
  if (RECOMMEND.test(q)) {
    const refusal = items.find((i) => i.id === "qa-choose");
    if (refusal) return { item: refusal, score: 1 };
  }
  const qt = new Set(tokens(q));
  if (!qt.size) return null;
  let best: { item: AiItem; score: number } | null = null;
  for (const it of items) {
    const it_ = new Set(tokens(it.question ?? ""));
    let shared = 0;
    qt.forEach((w) => it_.has(w) && shared++);
    const score = shared / Math.max(qt.size, it_.size);
    if (!best || score > best.score) best = { item: it, score };
  }
  return best && best.score >= 0.34 ? best : null;
}

interface LiveAnswer {
  status: "answered" | "rejected" | "unavailable";
  paragraphs: { segments: ({ t: string } | { val: Val })[]; cites: string[] }[];
  not_covered: string | null;
  problems?: string[];
}

export function AskBox({ context, initial, onAsked }: { context: { o2: number; psi: number; m: number }; initial?: string | null; onAsked?: (q: string | null) => void }) {
  const { data } = useData<AiData>("ai_text.json");
  const [q, setQ] = useState(initial ?? "");
  const [asked, setAsked] = useState<string | null>(initial ?? null);
  const [live, setLive] = useState<{ state: "idle" | "loading" | "done" | "error"; answer?: LiveAnswer }>({ state: "idle" });
  const items = useMemo(() => data?.qa ?? [], [data]);
  const match = useMemo(() => (asked ? matchCached(asked, items) : null), [asked, items]);

  useEffect(() => {
    if (!asked || match || !API) return;
    let gone = false;
    setLive({ state: "loading" });
    fetch(`${API}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: asked, o2: context.o2, psi: context.psi, m: context.m }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((a: LiveAnswer) => !gone && setLive({ state: "done", answer: a }))
      .catch(() => !gone && setLive({ state: "error" }));
    return () => {
      gone = true;
    };
  }, [asked, match, context.o2, context.psi, context.m]);

  const ask = (text: string) => {
    const t = text.trim();
    setAsked(t || null);
    setQ(t);
    onAsked?.(t || null);
  };

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">Ask a question about the evidence</label>
        <input id="ask-input" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Has a solid ever burned near 8.2 psi?" autoComplete="off" />
        <button type="submit" className="btn">Ask</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Questions with checked answers">
        {items.map((it) => (
          <button key={it.id} type="button" className="chip h-auto py-1 text-left text-xs" aria-pressed={asked === it.question} onClick={() => ask(it.question ?? "")}>
            {it.question}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-4">
        {asked && match && (
          <article className="animate-rise rounded-lg border border-line bg-[color:var(--surface)] p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-3">{match.score < 1 && match.item.question !== asked ? <>Closest checked answer: &ldquo;{match.item.question}&rdquo;</> : "Checked answer"}</span>
              <AiLabelFor item={match.item} />
            </div>
            <AiText item={match.item} />
          </article>
        )}
        {asked && !match && !API && (
          <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-2">
            No checked answer covers this question yet, and live answers are switched off on this static site (they need the Redshift API with a model key). Try one of the questions above.
          </p>
        )}
        {asked && !match && API && live.state === "loading" && (
          <div className="space-y-2" aria-busy="true"><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-4 w-3/5" /></div>
        )}
        {asked && !match && API && live.state === "error" && <p className="text-sm text-ink-2">The live answer service could not be reached. The checked answers above still work.</p>}
        {asked && !match && API && live.state === "done" && live.answer && <LiveView a={live.answer} />}
      </div>
    </div>
  );
}

function LiveView({ a }: { a: LiveAnswer }) {
  if (a.status !== "answered") {
    return (
      <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-2">
        {a.status === "unavailable" ? "Live answers are not configured on this server." : "The draft answer failed the evidence check, so it is not shown."}
        {a.problems?.length ? <span className="mt-1 block text-xs text-ink-3">{a.problems.join("; ")}</span> : null}
      </p>
    );
  }
  return (
    <article className="animate-rise rounded-lg border border-line bg-[color:var(--surface)] p-4 text-sm">
      <div className="mb-2 flex justify-end"><span className="rounded-full border border-[color:var(--amber-ink)] px-2 text-xs text-[color:var(--amber-ink)]">AI-generated now, checked by code, not by a person</span></div>
      {a.paragraphs.map((p, i) => (
        <p key={i} className="leading-relaxed">
          {p.segments.map((s, k) => ("t" in s ? <span key={k}>{s.t}</span> : <Value key={k} val={s.val} />))}
          {p.cites.length > 0 && <span className="ml-1 mono text-xs text-ink-3">[{p.cites.join(", ")}]</span>}
        </p>
      ))}
      {a.not_covered && <p className="mt-2 text-ink-2"><span className="font-medium">What the data does not cover.</span> {a.not_covered}</p>}
    </article>
  );
}
