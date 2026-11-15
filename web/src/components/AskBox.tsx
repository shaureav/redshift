// "Ask the evidence". Answers come only from the verified dataset:
// 1. Cached answers (data/ai/qa.json): AI-drafted templates whose every number is a slot filled from the
//    built data, rejected by the build if they contain a bare number, banned wording, an unknown citation
//    or no "not covered" statement.
// 2. A live answer, when the Redshift API here has a model key. The API retrieves from the dataset, asks the
//    model, and rejects any answer with a number or citation that is not in what it retrieved
//    (redshift/ai/ask.py). Before anyone asks, the box says whether live answers are on (D49).
// Any request to choose or recommend an atmosphere gets the checked refusal.
import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../lib/data";
import type { Val } from "../lib/types";
import { AiLabelFor, AiText, type AiData, type AiItem } from "./AiText";
import { Value } from "./Value";

// Where the API is (D49): VITE_API_BASE when the build sets it (set it empty to switch live answers off), else
// /api, where the Vercel function (web/api/index.py) serves it on the public site and the dev and preview servers
// pass it to a local API (vite.config.ts). Unit tests have no API.
const RAW_API = import.meta.env.VITE_API_BASE as string | undefined;
const API = (RAW_API ?? (import.meta.env.MODE === "test" ? "" : "/api")).replace(/\/$/, "") || null;

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

/** With live answers on, a typed question goes to the model unless a checked answer is for nearly the same
 *  question (a chip, or the same words retyped). A looser match is shown only if the live answer fails. */
const SAME_QUESTION = 0.75;
const COUNT_UNITS = new Set(["tests", "findings"]);

interface LiveAnswer {
  status: "answered" | "rejected" | "unavailable";
  paragraphs: { segments: ({ t: string } | { val: Val })[]; cites: string[] }[];
  not_covered: string | null;
  problems?: string[];
}

type LiveStatus = { state: "checking" } | { state: "on"; model: string } | { state: "off"; why: "no-api" | "no-key" };

// One check per page load, shared by every Ask box (the panel and the phone's sheet).
let statusOnce: Promise<LiveStatus> | null = null;
function liveStatus(): Promise<LiveStatus> {
  if (!API) return Promise.resolve({ state: "off", why: "no-api" });
  statusOnce ??= fetch(`${API}/ask/status`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { live?: boolean; model?: string | null }): LiveStatus => (j.live ? { state: "on", model: j.model || "a language model" } : { state: "off", why: "no-key" }))
    // No API at this address (a static copy answers with its page, or nothing): live answers are off here.
    .catch((): LiveStatus => ({ state: "off", why: "no-api" }));
  return statusOnce;
}

function useLiveStatus(): LiveStatus {
  const [s, setS] = useState<LiveStatus>(API ? { state: "checking" } : { state: "off", why: "no-api" });
  useEffect(() => {
    let gone = false;
    liveStatus().then((v) => !gone && setS(v));
    return () => {
      gone = true;
    };
  }, []);
  return s;
}

export function AskBox({ context, initial, onAsked }: { context: { o2: number; psi: number; m: number }; initial?: string | null; onAsked?: (q: string | null) => void }) {
  const { data } = useData<AiData>("ai_text.json");
  const status = useLiveStatus();
  const [q, setQ] = useState(initial ?? "");
  const [asked, setAsked] = useState<string | null>(initial ?? null);
  const [live, setLive] = useState<{ state: "idle" | "loading" | "done" | "error"; answer?: LiveAnswer }>({ state: "idle" });
  const items = useMemo(() => data?.qa ?? [], [data]);
  const match = useMemo(() => (asked ? matchCached(asked, items) : null), [asked, items]);
  const liveOn = status.state === "on";
  // Which answer a question gets: the checked one when it is for this question (or live answers are off and it
  // is the closest), else a live one. The choice refusal is always the checked one.
  const checked = match && (!liveOn || match.score >= SAME_QUESTION || match.item.id === "qa-choose") ? match : null;
  const goLive = !!asked && !checked && liveOn;

  // A live question is asked once, for the point the panel showed when it was asked: the panel follows the pointer
  // as it hovers the plane, and an answer that restarted with every move would never arrive (D49). Asking again
  // (the same words at a new point) asks again.
  const at = useRef(context);
  at.current = context;
  const [seq, setSeq] = useState(0);
  useEffect(() => {
    if (!asked || !goLive || !API) return;
    let gone = false;
    const c = at.current;
    const stop = new AbortController();
    setLive({ state: "loading" });
    fetch(`${API}/ask`, { method: "POST", signal: stop.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: asked, o2: c.o2, psi: c.psi, m: c.m }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((a: LiveAnswer) => !gone && setLive({ state: "done", answer: a }))
      .catch(() => !gone && setLive({ state: "error" }));
    return () => {
      gone = true;
      stop.abort();
    };
  }, [asked, goLive, seq]);

  const ask = (text: string) => {
    const t = text.trim();
    setAsked(t || null);
    setSeq((n) => n + 1);
    setQ(t);
    onAsked?.(t || null);
  };
  // A live answer that could not be given falls back to the closest checked answer, when there is one.
  const liveFailed = goLive && (live.state === "error" || (live.state === "done" && live.answer?.status !== "answered"));

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
        <input id="ask-input" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder={liveOn ? "Ask anything about the evidence here" : "Has a solid ever burned near 8.2 psi?"} autoComplete="off" />
        <button type="submit" className="btn">Ask</button>
      </form>
      <LiveLine status={status} />
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Questions with checked answers" data-prompt="">
        {items.map((it) => (
          <button key={it.id} type="button" className="chip h-auto whitespace-normal py-1 text-left text-xs" aria-pressed={asked === it.question} onClick={() => ask(it.question ?? "")}>
            {it.question}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-4 space-y-3">
        {asked && checked && <Checked match={checked} asked={asked} />}
        {asked && !checked && !goLive && status.state === "checking" && <Busy />}
        {asked && !checked && status.state === "off" && (
          <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-2">
            No checked answer covers this question yet, and live answers are off here
            {status.why === "no-key" ? " (the Redshift API on this host has no model key)" : " (this copy of the site has no Redshift API behind it)"}. Try one of the questions above.
          </p>
        )}
        {goLive && live.state === "loading" && <Busy label={`${status.state === "on" ? status.model : "The model"} is answering from the evidence here`} />}
        {goLive && live.state === "error" && <p className="text-sm text-ink-2">The live answer service could not be reached. The checked answers above still work.</p>}
        {goLive && live.state === "done" && live.answer && <LiveView a={live.answer} />}
        {liveFailed && match && <Checked match={match} asked={asked ?? ""} />}
      </div>
    </div>
  );
}

/** Whether new questions are answered live here, said before anyone asks (D49). */
function LiveLine({ status }: { status: LiveStatus }) {
  if (status.state === "checking") return <p className="mt-2 text-xs text-ink-3">Checking for live AI answers...</p>;
  if (status.state === "on") {
    return (
      <p className="mt-2 flex items-start gap-2 text-xs text-ink-2">
        <span className="mt-1 inline-block h-2 w-2 flex-none rounded-full bg-[color:var(--accent)]" aria-hidden="true" />
        <span>Live AI answers on ({status.model}). Type any question: it is answered now from the evidence at this point and checked by code. The chips below are checked answers.</span>
      </p>
    );
  }
  return <p className="mt-2 text-xs text-ink-3">Live AI answers are off on this copy of the site. The questions below have checked answers.</p>;
}

function Busy({ label }: { label?: string }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {label && <p className="text-xs text-ink-3">{label}...</p>}
      <div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-4 w-3/5" />
    </div>
  );
}

function Checked({ match, asked }: { match: { item: AiItem; score: number }; asked: string }) {
  return (
    <article className="animate-rise rounded-lg border border-line bg-[color:var(--surface)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-3">{match.score < 1 && match.item.question !== asked ? <>Closest checked answer: &ldquo;{match.item.question}&rdquo;</> : "Checked answer"}</span>
        <AiLabelFor item={match.item} />
      </div>
      <AiText item={match.item} />
    </article>
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
        <p key={i}>
          {/* A count is drawn bare, so the model's own noun follows it ("263 solid burn rows"); a pressure, an oxygen
              share or a temperature keeps its unit (redshift/ai/ask.py, D49). */}
          {p.segments.map((s, k) => ("t" in s ? <span key={k}>{s.t}</span> : <Value key={k} val={s.val} unit={COUNT_UNITS.has(s.val.u ?? "") ? false : undefined} />))}
          {p.cites.length > 0 && <span className="ml-1 mono text-xs text-ink-3">[{p.cites.join(", ")}]</span>}
        </p>
      ))}
      {a.not_covered && <p className="mt-2 text-ink-2"><span className="font-medium">What the data does not cover.</span> {a.not_covered}</p>}
    </article>
  );
}
