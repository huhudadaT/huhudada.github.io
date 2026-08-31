/* ═══════════════════════════════════════════════════════════════════
   Flashcards — huhudada.com/programs/flashcards/

   Source of truth. index.html carries a transpiled copy inline;
   regenerate it after editing here:

     tsc --jsx react --target es2020 --module esnext --allowJs \
         --outDir build flashcards_app.jsx

   No scheduling and no due dates. A rating records how well you knew a
   card, nothing more. Storage keeps the "dendrite:" prefix so decks
   saved by earlier versions still load. Styling lives in index.html.
   ═══════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

/* ── storage: localStorage behind an async shim ─────────────────── */
const STORE_PREFIX = "dendrite:";
const store = {
    async get(key) {
        try {
            const raw = localStorage.getItem(STORE_PREFIX + key);
            return raw === null ? null : { key, value: raw };
        } catch (e) { return null; }
    },
    async set(key, value) {
        try { localStorage.setItem(STORE_PREFIX + key, value); } catch (e) {}
        return { key, value };
    },
    async delete(key) {
        try { localStorage.removeItem(STORE_PREFIX + key); } catch (e) {}
        return { key, deleted: true };
    },
    async list(prefix = "") {
        const keys = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf(STORE_PREFIX + prefix) === 0) keys.push(k.slice(STORE_PREFIX.length));
            }
        } catch (e) {}
        return { keys };
    }
};

const DECKS_PREFIX = "decks:";
const STATS_PREFIX = "stats:";
const SETTINGS_KEY = "settings:main";
const LOG_KEY = "log:v1";
const LEGACY_KEYS = ["flashcards", "decks", "cardly:decks"];

const DEFAULT_SETTINGS = {
    shuffle: false,
    answerFirst: false,
    defaultMode: "graded",
    perSession: "all"
};

/* ── helpers ────────────────────────────────────────────────────── */
let seq = 0;
const newId = () => "c" + (++seq).toString(36) + Date.now().toString(36);
const slug = (s) => (s || "deck").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck";

const shuffle = (arr) => {
    const c = [...arr];
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
};

/* how well a card is known, from its own history — no dates involved */
const strength = (c) => (c.reps ? c.hits / c.reps : null);
function strengthBand(c) {
    const s = strength(c);
    if (s == null) return "unseen";
    if (s < 0.5) return "shaky";
    if (s < 0.85) return "getting";
    return "solid";
}
/* warm means it needs work, cool means it is banked */
const BAND_LABEL = { unseen: "not seen yet", shaky: "shaky", getting: "getting there", solid: "known" };

function relTime(t) {
    if (!t) return "never";
    const s = (Date.now() - t) / 1000;
    if (s < 90) return "just now";
    if (s < 5400) return Math.round(s / 60) + " min ago";
    if (s < 172800) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " d ago";
}
const clock = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
const longClock = (ms) => {
    const m = Math.round(ms / 60000);
    return m < 1 ? "< 1m" : m < 60 ? m + "m" : Math.floor(m / 60) + "h " + (m % 60) + "m";
};

/* ── text format shared with the Library ────────────────────────── */
function toText(deck) {
    const head =
        "Name: " + (deck.name || "") + "\n" +
        "Description: " + (deck.description || "") + "\n" +
        "Class: " + (deck.cls || "") + "\n" +
        "Semester: " + (deck.semester || "") + "\n\n";
    return head + deck.cards.map((c) => "Q: " + c.q + "\nA: " + c.a).join("\n\n") + "\n";
}

function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* one paste may hold several decks; a new Name:/Title: line starts one */
function parseImport(text) {
    const out = [];
    const blocks = String(text || "").replace(/\r\n?/g, "\n").split(/\n(?=[ \t]*(?:Name|Title)[ \t]*:)/);
    blocks.forEach((block) => {
        const deck = { name: "", description: "", cls: "", semester: "", cards: [] };
        let cur = null, field = null, m;
        block.split("\n").forEach((raw) => {
            const line = raw.trimEnd();
            if ((m = /^[ \t]*(?:Name|Title)[ \t]*:[ \t]*(.+)$/i.exec(line))) { deck.name = m[1].trim(); cur = null; }
            else if ((m = /^[ \t]*Description[ \t]*:[ \t]*(.+)$/i.exec(line))) { deck.description = m[1].trim(); }
            else if ((m = /^[ \t]*Class[ \t]*:[ \t]*(.+)$/i.exec(line))) { deck.cls = m[1].trim(); }
            else if ((m = /^[ \t]*Semester[ \t]*:[ \t]*(.+)$/i.exec(line))) { deck.semester = m[1].trim(); }
            else if ((m = /^[ \t]*Q[ \t]*:[ \t]*(.*)$/i.exec(line))) { cur = { q: m[1], a: "" }; deck.cards.push(cur); field = "q"; }
            else if (cur && (m = /^[ \t]*A[ \t]*:[ \t]*(.*)$/i.exec(line))) { cur.a = m[1]; field = "a"; }
            else if (cur && field && line.trim()) { cur[field] += " " + line.trim(); }
        });
        if (deck.cards.length) out.push(deck);
    });
    return out;
}

/* older saves may use front/back or question/answer, and may carry the
   old interval/ease/due fields — those are dropped on the way in */
function normalizeCard(c) {
    return {
        id: c.id || newId(),
        q: c.q != null ? c.q : c.front != null ? c.front : c.question || "",
        a: c.a != null ? c.a : c.back != null ? c.back : c.answer || "",
        reps: c.reps || 0,
        hits: c.hits || 0,
        history: Array.isArray(c.history) ? c.history.slice(-10) : [],
        lastSeen: c.lastSeen || c.seen || 0
    };
}
function normalizeDeck(d) {
    return {
        id: d.id || newId(),
        name: d.name || "Untitled deck",
        description: d.description != null ? d.description : d.desc || "",
        cls: d.cls || d.class || "",
        semester: d.semester || "",
        autoShuffle: !!d.autoShuffle,
        created: d.created || d.createdAt || Date.now(),
        lastOpenedAt: d.lastOpenedAt || null,
        cards: (d.cards || []).map(normalizeCard)
    };
}

const SAMPLE_DECK = normalizeDeck({
    id: "sample-krebs",
    name: "Glycolysis & The Krebs Cycle",
    description: "A built-in deck to try the app with. Delete it once you have your own.",
    cls: "SAMPLE",
    semester: "Fall 2026",
    cards: [
        { q: "Which enzyme catalyzes the rate-limiting step of glycolysis?", a: "Phosphofructokinase-1" },
        { q: "Net ATP yield of glycolysis per glucose?", a: "2 ATP" },
        { q: "Where does the Krebs cycle take place?", a: "The mitochondrial matrix" },
        { q: "Which molecule condenses with oxaloacetate to form citrate?", a: "Acetyl-CoA" },
        { q: "How many NADH are produced per turn of the Krebs cycle?", a: "Three" },
        { q: "Which glycolytic step first consumes ATP?", a: "Hexokinase phosphorylating glucose" }
    ]
});

const AI_INSTRUCTIONS = `Generate a set of tight, focused flashcards in plain text.

Start with these four lines, then a blank line, then the cards:
Name: [a short, specific deck title in Title Case]
Description: [one sentence describing what the deck covers]
Class: [the course code, e.g. BIOSC 0350]
Semester: [Spring, Summer, or Fall] [four-digit year]

Rules:
- One question per card, straight to the point.
- The answer is the actual answer, not an explanation of it.
- Keep answers to a word, a phrase, or one sentence.
- Never join two prompts with "and" — split them into two cards.
- Vary the question types and build from foundations upward.

Format each card as:
Q: [question]
A: [answer]

Separate cards with a blank line. Output only the header lines and the cards.`;

const SAMPLE_PASTE = `Name: Amino Acid Side Chains
Description: Grouping the twenty standard amino acids by side-chain character.
Class: SAMPLE
Semester: Fall 2026

Q: Which amino acid has a thiol side chain?
A: Cysteine

Q: Which two amino acids are acidic at physiological pH?
A: Aspartate and glutamate

Q: Which amino acid lacks a side chain beyond hydrogen?
A: Glycine`;

/* ═══ small pieces ══════════════════════════════════════════════ */

function Confirm({ ask, onDone }) {
    const ref = useRef(null);
    useEffect(() => { if (ask && ref.current) ref.current.focus(); }, [ask]);
    if (!ask) return null;
    return (
        <div className="veil" onClick={(e) => { if (e.target.classList.contains("veil")) onDone(false); }}>
            <div className="modal" role="dialog" aria-modal="true">
                <h3>{ask.title}</h3>
                <p>{ask.body}</p>
                <div className="modal-foot">
                    <button className="btn" onClick={() => onDone(false)}>Keep it</button>
                    <button className="btn btn-fill" ref={ref} onClick={() => onDone(true)}>{ask.ok || "Delete"}</button>
                </div>
            </div>
        </div>
    );
}

/* a square button that opens a small menu, so destructive actions sit
   one deliberate step away from a stray click */
function Menu({ label, items }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open) return;
        function away(e) { if (box.current && !box.current.contains(e.target)) setOpen(false); }
        function key(e) { if (e.key === "Escape") setOpen(false); }
        document.addEventListener("mousedown", away);
        document.addEventListener("keydown", key);
        return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
    }, [open]);
    return (
        <span className="menu" ref={box}>
            <button className="btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
                {label} <span className="caret" aria-hidden="true">▾</span>
            </button>
            {open && (
                <span className="menu-drop">
                    {items.map((it) => (
                        <button key={it.label} className={it.danger ? "danger" : ""} onClick={() => { setOpen(false); it.run(); }}>
                            {it.label}
                        </button>
                    ))}
                </span>
            )}
        </span>
    );
}

/* ═══ shelf ═════════════════════════════════════════════════════ */

function Shelf({ decks, query, setQuery, cls, setCls, sort, setSort, onStudy, onDetails, onNew }) {
    /* one entry per class actually present, ordered so BIOSC 0350 lands
       before BIOSC 1250 rather than after it */
    const classes = useMemo(() => {
        const seen = [];
        decks.forEach((d) => { if (d.cls && seen.indexOf(d.cls) === -1) seen.push(d.cls); });
        return seen.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [decks]);

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        const out = decks.filter((d) =>
            (!cls || d.cls === cls) && (
                !q ||
                (d.name + " " + d.cls + " " + d.description).toLowerCase().includes(q) ||
                d.cards.some((c) => (c.q + " " + c.a).toLowerCase().includes(q))
            )
        );
        const key = {
            recent: (a, b) => (b.lastOpenedAt || b.created) - (a.lastOpenedAt || a.created),
            new: (a, b) => b.created - a.created,
            name: (a, b) => a.name.localeCompare(b.name),
            size: (a, b) => b.cards.length - a.cards.length
        }[sort];
        return [...out].sort(key);
    }, [decks, query, cls, sort]);

    return (
        <main className="page">
            <div className="head-row">
                <div className="brand">
                    <span className="brand-kicker">Huhudada · Programs</span>
                    <h1 className="brand-title">Flash<em>cards</em></h1>
                </div>
                <div className="head-tools">
                    <input className="search" type="text" value={query} placeholder="Search decks and cards"
                        aria-label="Search decks" onChange={(e) => setQuery(e.target.value)} />
                    <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Filter by class">
                        <option value="">All classes</option>
                        {classes.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort decks">
                        <option value="recent">Recently opened</option>
                        <option value="new">Newest first</option>
                        <option value="name">By name</option>
                        <option value="size">Most cards</option>
                    </select>
                    <button className="btn btn-fill" onClick={onNew}>+ New deck</button>
                </div>
            </div>

            {decks.length === 0 ? (
                <div className="empty">
                    <strong>The shelf is empty.</strong>
                    <p>Import a set from the Library, or write a deck by hand.</p>
                    <button className="btn btn-fill" onClick={onNew}>+ New deck</button>
                </div>
            ) : list.length === 0 ? (
                <p className="none">
                    No deck matches {query ? "“" + query + "”" : "that filter"}{cls ? " in " + cls : ""}.
                    <button className="btn btn-quiet" onClick={() => { setQuery(""); setCls(""); }}>Clear filters</button>
                </p>
            ) : (
                <div className="stacks">
                    {list.map((d) => {
                        const layers = Math.min(2, Math.max(0, Math.ceil(d.cards.length / 4) - 1));
                        return (
                            <div className="stack" key={d.id}>
                                {layers > 1 && <div className="layer l2" />}
                                {layers > 0 && <div className="layer l1" />}
                                <div className="facecard">
                                    <button className="stack-hit" onClick={() => onStudy(d.id)} aria-label={"Study " + d.name} />
                                    <div className="stack-body">
                                        <span className="chip">{d.cls || "No class"}</span>
                                        <div className="stack-title">{d.name}</div>
                                        <p className="stack-desc">{d.description}</p>
                                    </div>
                                    <div className="stack-foot">
                                        <span className="stack-meta">
                                            <b>{d.cards.length}</b> cards
                                            <i>·</i>
                                            {relTime(d.lastOpenedAt)}
                                        </span>
                                        <button className="btn btn-tiny" onClick={() => onDetails(d.id)}>Details</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}

/* ═══ deck detail ═══════════════════════════════════════════════ */

function Sheet({ deck, log, onStudy, onStudyAt, onEdit, onExport, onResetProgress, onDelete, onToggleShuffle }) {
    const mine = log.filter((s) => s.deckId === deck.id);
    const recent = mine.slice(-5);
    const seen = recent.reduce((n, s) => n + (s.seen || 0), 0);
    const right = recent.reduce((n, s) => n + (s.right || 0), 0);
    const recall = seen ? Math.round((right / seen) * 100) : null;
    const totalMs = mine.reduce((n, s) => n + (s.ms || 0), 0);

    return (
        <main className="page">
            <div className="sheet-head">
                <div className="sheet-id">
                    <span className="chip">{deck.cls || "No class"}</span>
                    {deck.semester ? <span className="chip chip-soft">{deck.semester}</span> : null}
                    <h1 className="sheet-name">{deck.name}</h1>
                    <p className="sheet-desc">{deck.description || "No description yet."}</p>
                </div>
                <div className="sheet-acts">
                    <button className="btn btn-fill" onClick={() => onStudy(deck.id)}>Study this deck</button>
                    <button className="btn" onClick={() => onEdit(deck.id)}>Edit cards</button>
                    <Menu label="More" items={[
                        { label: "Export .txt", run: () => onExport(deck) },
                        { label: "Reset progress", run: () => onResetProgress(deck.id) },
                        { label: "Delete deck", run: () => onDelete(deck.id), danger: true }
                    ]} />
                </div>
            </div>

            <div className="statline">
                <span><b>{deck.cards.length}</b><em>cards</em></span>
                <span><b>{recall == null ? "—" : recall + "%"}</b><em>recall, last 5</em></span>
                <span><b>{mine.length}</b><em>sessions</em></span>
                <span><b>{totalMs ? longClock(totalMs) : "—"}</b><em>time studied</em></span>
                <span><b>{relTime(deck.lastOpenedAt)}</b><em>last opened</em></span>
            </div>

            <div className="opt-row">
                <button className="switch" role="switch" aria-checked={!!deck.autoShuffle}
                    aria-label="Shuffle this deck every time it opens" onClick={() => onToggleShuffle(deck.id)} />
                <div className="row-txt">
                    <b>Shuffle every time this deck opens</b>
                    <span>Applies to this deck only, whatever the global setting says.</span>
                </div>
            </div>

            <h2 className="sect-sm">Cards</h2>
            <p className="sect-note">Click any card to start the review there.</p>
            <div className="slips">
                {deck.cards.map((c, i) => (
                    <button className="slip" key={c.id} onClick={() => onStudyAt(deck.id, i)}>
                        <span className="slip-n">{i + 1}</span>
                        <span className="slip-txt">
                            <span className="slip-q">{c.q}</span>
                            <span className="slip-a">{c.a}</span>
                        </span>
                        <span className={"slip-meta m-" + strengthBand(c)}>
                            <i className={"pip pip-" + strengthBand(c)} />
                            {BAND_LABEL[strengthBand(c)]}{c.reps ? " · seen " + c.reps + "×" : ""}
                        </span>
                    </button>
                ))}
            </div>
        </main>
    );
}

/* ═══ study ═════════════════════════════════════════════════════ */

function Study({ session, settings, deckName, onTurn, onScore, onGo, onShuffle, onQuit }) {
    const [jump, setJump] = useState(String(session.at + 1));
    const card = session.pool[session.at];
    const n = session.pool.length;
    const rated = session.grades.filter((g) => g !== undefined).length;
    useEffect(() => { setJump(String(session.at + 1)); }, [session.at, n]);

    const front = settings.answerFirst ? card.a : card.q;
    const back = settings.answerFirst ? card.q : card.a;
    const frontTag = settings.answerFirst ? "Answer" : "Question";
    const backTag = settings.answerFirst ? "Question" : "Answer";

    const buttons = session.mode === "flip"
        ? [{ q: 0, label: "Missed it", key: "1" }, { q: 2, label: "Got it", key: "2", good: true }]
        : [
            { q: 0, label: "Again", key: "1" },
            { q: 1, label: "Hard", key: "2" },
            { q: 2, label: "Good", key: "3", good: true },
            { q: 3, label: "Easy", key: "4" }
        ];

    function commitJump(e) {
        const v = parseInt(jump, 10);
        if (Number.isFinite(v)) onGo(Math.min(Math.max(v, 1), n) - 1);
        else setJump(String(session.at + 1));
        if (e && e.target && e.target.blur) e.target.blur();
    }

    return (
        <main className="page study">
            <div className="study-head">
                <h1 className="study-title">{deckName}</h1>
                <span className="study-sub">
                    {session.mode === "flip" ? "Flip review" : "Graded review"} · {rated} of {n} rated
                </span>
            </div>

            <div className="table">
                <button className="side-arrow" onClick={() => onGo(session.at - 1)} disabled={session.at === 0} aria-label="Previous card">‹</button>

                <div className="deck-space">
                    <div className={"flip" + (session.turned ? " turned" : "")}
                        role="button" tabIndex={0} aria-label="Flip the card"
                        onClick={onTurn}
                        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onTurn(); } }}>
                        <div className="side side-q">
                            <span className="side-tag">{frontTag}</span>
                            <p className="card-text">{front}</p>
                            <span className="tap">Tap or press space to flip</span>
                        </div>
                        <div className="side side-a">
                            <span className="side-tag">{backTag}</span>
                            <p className="card-text">{back}</p>
                        </div>
                    </div>
                </div>

                <button className="side-arrow" onClick={() => onGo(session.at + 1)} disabled={session.at >= n - 1} aria-label="Next card">›</button>
            </div>

            <div className="nav-row">
                <span className="nav-count">
                    Card
                    <input className="jump" type="text" inputMode="numeric" value={jump} aria-label="Card number"
                        onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ""))}
                        onBlur={() => commitJump()}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitJump(e); } }} />
                    of {n}
                </span>
            </div>

            {/* the rating row is deliberately the loudest thing under the card,
                so the side arrows never look like the way forward */}
            <div className={"rate-block" + (session.turned ? " live" : "")}>
                <div className="rate-label">{session.turned ? "How well did you know it?" : "Flip the card to rate it"}</div>
                <div className="rate">
                    {buttons.map((b) => (
                        <button key={b.q} className={"btn r" + b.q + (b.good ? " btn-fill" : "")} onClick={() => onScore(b.q)}>
                            {b.label} <kbd>{b.key}</kbd>
                        </button>
                    ))}
                </div>
            </div>

            <div className="dots">
                {session.pool.map((_, i) => (
                    <button key={i}
                        className={"dot" + (i === session.at ? " now" : session.grades[i] === undefined ? "" : session.grades[i] >= 2 ? " done" : " miss")}
                        onClick={() => onGo(i)} aria-label={"Card " + (i + 1)} />
                ))}
            </div>

            <div className="study-foot">
                <button className="btn btn-quiet" onClick={onShuffle}>Shuffle remaining</button>
                <button className="btn btn-quiet" onClick={onQuit}>End session</button>
            </div>
        </main>
    );
}

/* ═══ results ═══════════════════════════════════════════════════ */

function Results({ result, log, onAgain, onRest, onSheet, onShelf }) {
    const labels = result.mode === "flip"
        ? [["Missed", 0], ["Got it", 2]]
        : [["Again", 0], ["Hard", 1], ["Good", 2], ["Easy", 3]];

    /* compare against this deck's own recent average, not a personal best */
    const mine = log.filter((s) => s.deckId === result.deckId);
    const before = mine.slice(0, -1).slice(-5);
    const bseen = before.reduce((n, s) => n + (s.seen || 0), 0);
    const bright = before.reduce((n, s) => n + (s.right || 0), 0);
    const prior = bseen ? Math.round((bright / bseen) * 100) : null;
    const delta = prior == null ? null : result.accuracy - prior;

    const covered = result.pool ? Math.round((result.rated / result.pool) * 100) : 100;
    const partial = result.skipped > 0;

    return (
        <main className="page">
            <h1 className="view-title">{result.deckName}</h1>
            <p className="sect-note">
                {partial
                    ? "Ended after " + result.rated + " of " + result.pool + " cards, so this covers the part you rated."
                    : "Every card in the run was rated."}
            </p>

            <div className="res-pair">
                <div className="res-fig">
                    <span className="score">{result.accuracy}%</span>
                    <b>recall</b>
                    <em>{result.right} right, {result.missed} missed, out of {result.rated} rated</em>
                </div>
                <div className="res-fig">
                    <span className="score alt">{covered}%</span>
                    <b>of the run covered</b>
                    <em>{partial ? result.skipped + " card" + (result.skipped === 1 ? "" : "s") + " never rated" : "nothing left behind"}</em>
                </div>
            </div>

            <p className="score-note">
                {delta == null ? "First recorded session for this deck."
                    : delta === 0 ? "Level with your recent average of " + prior + "%."
                        : (delta > 0 ? "Up " : "Down ") + Math.abs(delta) + " points on your recent average of " + prior + "%."}
            </p>

            <div className="breakdown" style={{ gridTemplateColumns: "repeat(" + (labels.length + (partial ? 1 : 0)) + ",1fr)" }}>
                {labels.map(([l, q]) => (
                    <div className="bd" key={q}><strong>{result.tally[q]}</strong><span>{l}</span></div>
                ))}
                {partial && <div className="bd bd-off"><strong>{result.skipped}</strong><span>Not rated</span></div>}
            </div>

            <div className="statline center">
                <span><b>{clock(result.ms)}</b><em>elapsed</em></span>
                <span><b>{result.rated ? clock(result.ms / result.rated) : "0:00"}</b><em>per card</em></span>
                <span><b>{result.pool}</b><em>cards in the run</em></span>
            </div>

            <div className="study-foot">
                {partial && <button className="btn btn-fill" onClick={onRest}>Study the {result.skipped} you skipped</button>}
                <button className={"btn" + (partial ? "" : " btn-fill")} onClick={onAgain}>Run the deck again</button>
                <button className="btn" onClick={onSheet}>Deck details</button>
                <button className="btn btn-quiet" onClick={onShelf}>Back to the shelf</button>
            </div>
        </main>
    );
}

/* ═══ new deck: import first, by hand second ════════════════════ */

function NewDeck({ mode, setMode, onSaveImported, onSaveManual, onCancel, toast }) {
    return (
        <main className="page">
            <h1 className="view-title">New deck</h1>
            <div className="tabs">
                <button className={"tab" + (mode === "import" ? " on" : "")} onClick={() => setMode("import")}>Import a set</button>
                <button className={"tab" + (mode === "manual" ? " on" : "")} onClick={() => setMode("manual")}>Write by hand</button>
            </div>
            {mode === "import"
                ? <Importer onSave={onSaveImported} onCancel={onCancel} toast={toast} />
                : <Editor initial={null} onSave={onSaveManual} onCancel={onCancel} toast={toast} bare />}
        </main>
    );
}

function Importer({ onSave, onCancel, toast }) {
    const [text, setText] = useState("");
    const [showAI, setShowAI] = useState(false);
    const fileRef = useRef(null);
    const parsed = useMemo(() => parseImport(text), [text]);
    const cards = parsed.reduce((n, d) => n + d.cards.length, 0);

    async function copyAI() {
        try { await navigator.clipboard.writeText(AI_INSTRUCTIONS); toast("Instructions copied"); }
        catch (e) { toast("Copy blocked — select the text instead"); }
    }
    function pick(e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => setText(String(r.result));
        r.readAsText(f);
    }

    return (
        <div>
            <p className="sect-note">Most decks come from the Library. Download a <code>.txt</code> there, then upload or paste it here. Several decks in one paste are fine.</p>

            <div className="actions tight">
                <button className="btn btn-fill" onClick={() => fileRef.current && fileRef.current.click()}>Upload a .txt</button>
                <a className="btn" href="../library/">Open the Library</a>
                <button className="btn btn-quiet" onClick={() => setText(SAMPLE_PASTE)}>Paste an example</button>
                <input type="file" accept=".txt,text/plain" ref={fileRef} onChange={pick} hidden />
            </div>

            <label className="field">
                <span>Or paste the text</span>
                <textarea className="import-box mono" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder={"Name: ...\nDescription: ...\nClass: ...\nSemester: ...\n\nQ: ...\nA: ..."} />
            </label>

            <div className="parse-note">
                {!text.trim() ? "Nothing to read yet."
                    : parsed.length ? (
                        <>
                            Read <b>{parsed.length}</b> {parsed.length === 1 ? "deck" : "decks"} and <b>{cards}</b> cards.
                            {parsed.map((d, i) => (
                                <div key={i}>· {d.name || "Untitled"} — {d.cards.length} cards{d.cls ? " · " + d.cls : ""}{d.semester ? " · " + d.semester : ""}</div>
                            ))}
                        </>
                    ) : <>No <b>Q:</b> / <b>A:</b> pairs found. Each card needs a Q line and an A line.</>}
            </div>

            <div className="ai-panel">
                <div className="row-txt">
                    <b>Making a deck with an AI</b>
                    <span>Give these instructions to any chat model along with your notes or a topic, then paste the reply above.</span>
                </div>
                <div className="ai-acts">
                    <button className="btn" aria-expanded={showAI} onClick={() => setShowAI(!showAI)}>
                        {showAI ? "Hide" : "Read"} the instructions <span className="caret" aria-hidden="true">▾</span>
                    </button>
                    <button className="btn" onClick={copyAI}>Copy</button>
                </div>
            </div>
            {showAI && <pre className="ai-text">{AI_INSTRUCTIONS}</pre>}

            <div className="actions">
                <button className="btn btn-fill" disabled={!parsed.length} onClick={() => onSave(parsed)}>
                    {parsed.length > 1 ? "Save " + parsed.length + " decks" : "Save deck"}
                </button>
                <button className="btn btn-quiet" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
}

/* ═══ editor ════════════════════════════════════════════════════ */

function Editor({ initial, onSave, onCancel, toast, bare }) {
    const [deck, setDeck] = useState(() =>
        initial
            ? JSON.parse(JSON.stringify(initial))
            : { id: null, name: "", description: "", cls: "", semester: "", autoShuffle: false, cards: [normalizeCard({ q: "", a: "" })] }
    );
    const endRef = useRef(null);
    const field = (k) => (e) => setDeck({ ...deck, [k]: e.target.value });

    function editCard(i, k, v) {
        const cards = [...deck.cards];
        cards[i] = { ...cards[i], [k]: v };
        setDeck({ ...deck, cards });
    }
    function act(i, what) {
        const cards = [...deck.cards];
        if (what === "up" && i > 0) [cards[i - 1], cards[i]] = [cards[i], cards[i - 1]];
        if (what === "down" && i < cards.length - 1) [cards[i + 1], cards[i]] = [cards[i], cards[i + 1]];
        if (what === "dup") cards.splice(i + 1, 0, normalizeCard({ q: cards[i].q, a: cards[i].a }));
        if (what === "del") {
            if (cards.length === 1) return toast("A deck needs at least one card");
            cards.splice(i, 1);
        }
        setDeck({ ...deck, cards });
    }
    function add() {
        setDeck({ ...deck, cards: [...deck.cards, normalizeCard({ q: "", a: "" })] });
        setTimeout(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "center" }); }, 0);
    }
    function save() {
        const name = deck.name.trim();
        if (!name) return toast("Give the deck a name");
        const cards = deck.cards.filter((c) => c.q.trim() || c.a.trim());
        if (!cards.length) return toast("Write at least one card");
        onSave({ ...deck, name, cards });
    }

    const body = (
        <div>
            <div className="grid2">
                <label className="field"><span>Deck name</span><input type="text" value={deck.name} placeholder="The Krebs Cycle" onChange={field("name")} /></label>
                <label className="field"><span>Class</span><input type="text" value={deck.cls} placeholder="BIOSC 0350" onChange={field("cls")} /></label>
            </div>
            <div className="grid2">
                <label className="field"><span>Description</span><input type="text" value={deck.description} placeholder="One sentence on what the deck covers." onChange={field("description")} /></label>
                <label className="field"><span>Semester</span><input type="text" value={deck.semester} placeholder="Fall 2026" onChange={field("semester")} /></label>
            </div>

            <h2 className="sect-sm">Cards</h2>
            <p className="sect-note">{deck.cards.length} {deck.cards.length === 1 ? "card" : "cards"}. One question per card.</p>

            {deck.cards.map((c, i) => (
                <div className="card-edit" key={c.id}>
                    <div className="card-edit-top">
                        <span className="card-edit-n mono">Card {i + 1}</span>
                        <span className="card-edit-tools">
                            <button className="icon" disabled={i === 0} onClick={() => act(i, "up")} aria-label="Move up">↑</button>
                            <button className="icon" disabled={i === deck.cards.length - 1} onClick={() => act(i, "down")} aria-label="Move down">↓</button>
                            <button className="icon" onClick={() => act(i, "dup")} aria-label="Duplicate">⧉</button>
                            <button className="icon" onClick={() => act(i, "del")} aria-label="Delete card">✕</button>
                        </span>
                    </div>
                    <div className="pair">
                        <label className="field"><span>Question</span><textarea value={c.q} onChange={(e) => editCard(i, "q", e.target.value)} /></label>
                        <label className="field"><span>Answer</span><textarea value={c.a} onChange={(e) => editCard(i, "a", e.target.value)} /></label>
                    </div>
                </div>
            ))}
            <div ref={endRef} />

            <div className="actions">
                <button className="btn" onClick={add}>+ Add a card</button>
                <button className="btn btn-fill" onClick={save}>Save deck</button>
                <button className="btn btn-quiet" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );

    if (bare) return body;
    return (
        <main className="page">
            <h1 className="view-title">{initial ? "Edit deck" : "New deck"}</h1>
            {body}
        </main>
    );
}

/* ═══ settings ══════════════════════════════════════════════════ */

const TOGGLES = [
    ["shuffle", "Shuffle every deck by default", "A deck with its own shuffle switch on always shuffles, whatever this says."],
    ["answerFirst", "Answer side first", "Start each card on the answer and recall the question."]
];

function Settings({ settings, decks, log, onChange, onReset, onExportAll, onClearProgress, onClearAll }) {
    const cards = decks.reduce((n, d) => n + d.cards.length, 0);
    return (
        <main className="page">
            <h1 className="view-title">Settings</h1>
            <p className="sect-note">Decks and progress live on this device only.</p>

            <div className="rows">
                {TOGGLES.map(([k, title, note]) => (
                    <div className="row" key={k}>
                        <div className="row-txt"><b>{title}</b><span>{note}</span></div>
                        <button className="switch" role="switch" aria-checked={!!settings[k]} aria-label={title}
                            onClick={() => onChange({ ...settings, [k]: !settings[k] })} />
                    </div>
                ))}
                <div className="row">
                    <div className="row-txt"><b>Review style</b><span>Flip gives two buttons, graded gives four. Graded also leads with the cards you know least well.</span></div>
                    <div className="seg">
                        {[["flip", "Flip"], ["graded", "Graded"]].map(([v, l]) => (
                            <button key={v} aria-pressed={settings.defaultMode === v} onClick={() => onChange({ ...settings, defaultMode: v })}>{l}</button>
                        ))}
                    </div>
                </div>
                <div className="row">
                    <div className="row-txt"><b>Cards per session</b><span>A cap, so a 200-card deck can still be one sitting.</span></div>
                    <div className="seg">
                        {[10, 20, 50, "all"].map((v) => (
                            <button key={v} aria-pressed={String(settings.perSession) === String(v)} onClick={() => onChange({ ...settings, perSession: v })}>
                                {v === "all" ? "All" : v}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <h2 className="sect-sm">Your data</h2>
            <p className="sect-note">{decks.length} decks, {cards} cards, {log.length} sessions recorded.</p>
            <div className="rows">
                <div className="row">
                    <div className="row-txt"><b>Export all decks</b><span>One <code>.txt</code> per deck, in the format the Library uses.</span></div>
                    <button className="btn" onClick={onExportAll}>Export all</button>
                </div>
                <div className="row">
                    <div className="row-txt"><b>Reset all progress</b><span>Keeps every deck, clears recall history and session records.</span></div>
                    <button className="btn danger" onClick={onClearProgress}>Reset</button>
                </div>
                <div className="row">
                    <div className="row-txt"><b>Clear the library</b><span>Deletes every deck and its cards. Cannot be undone.</span></div>
                    <button className="btn danger" onClick={onClearAll}>Clear</button>
                </div>
                <div className="row">
                    <div className="row-txt"><b>Restore default settings</b><span>Puts every option above back where it started.</span></div>
                    <button className="btn" onClick={onReset}>Restore</button>
                </div>
            </div>
        </main>
    );
}

/* ═══ app ═══════════════════════════════════════════════════════ */

function App() {
    const [ready, setReady] = useState(false);
    const [decks, setDecks] = useState([]);
    const [stats, setStats] = useState({});
    const [log, setLog] = useState([]);
    const logRef = useRef([]);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);

    const [view, setView] = useState("shelf");
    const [sheetId, setSheetId] = useState(null);
    const [editId, setEditId] = useState(null);
    const [newMode, setNewMode] = useState("import");
    const [cameFrom, setCameFrom] = useState("shelf");
    const [session, setSession] = useState(null);
    const [result, setResult] = useState(null);

    const [query, setQuery] = useState("");
    const [cls, setCls] = useState("");
    const [sort, setSort] = useState("recent");
    const [toastMsg, setToastMsg] = useState(null);
    const [ask, setAsk] = useState(null);
    const askResolve = useRef(null);

    const toast = useCallback((msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2200);
    }, []);

    const confirmAsk = useCallback((title, body, ok) => {
        setAsk({ title, body, ok });
        return new Promise((res) => { askResolve.current = res; });
    }, []);
    function settleAsk(v) {
        setAsk(null);
        if (askResolve.current) { askResolve.current(v); askResolve.current = null; }
    }

    /* ── load ───────────────────────────────────────────────────── */
    useEffect(() => {
        (async function load() {
            try {
                const s = await store.get(SETTINGS_KEY);
                if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s.value) });
            } catch (e) {}

            let loaded = [];
            try {
                /* Read every deck-ish key, remembering which key each came from.
                   Saves always write to decks:<id>, so a deck read from any
                   other key would come back as a second copy on the next load.
                   Everything is collapsed to one deck per id and rewritten
                   under its canonical key, and stale keys are removed. */
                const all = await store.list("");
                const deckKeys = all.keys.filter((k) => /^decks?:/.test(k));
                const found = [];
                for (const k of deckKeys) {
                    try {
                        const r = await store.get(k);
                        if (!r) continue;
                        const val = JSON.parse(r.value);
                        if (Array.isArray(val)) val.forEach((d) => found.push({ key: k, deck: normalizeDeck(d) }));
                        else if (val && val.cards) found.push({ key: k, deck: normalizeDeck(val) });
                    } catch (e) {}
                }

                if (!found.length) {
                    for (const k of LEGACY_KEYS) {
                        const r = await store.get(k);
                        if (!r) continue;
                        try {
                            const arr = JSON.parse(r.value);
                            if (Array.isArray(arr) && arr.length) {
                                arr.forEach((d) => found.push({ key: k, deck: normalizeDeck(d) }));
                                break;
                            }
                        } catch (e) {}
                    }
                }

                /* prefer the copy with the most cards, then the one opened last */
                const better = (a, b) => {
                    if (a.deck.cards.length !== b.deck.cards.length) return a.deck.cards.length > b.deck.cards.length ? a : b;
                    return (a.deck.lastOpenedAt || 0) >= (b.deck.lastOpenedAt || 0) ? a : b;
                };
                const byId = {};
                found.forEach((entry) => {
                    const id = entry.deck.id;
                    byId[id] = byId[id] ? better(byId[id], entry) : entry;
                });

                /* same name, same size, same first question: a copy under a
                   different id, which is how the old key mismatch showed up */
                const sig = (d) => (d.name || "").trim().toLowerCase() + "|" + d.cards.length + "|" + (d.cards[0] ? d.cards[0].q.trim().toLowerCase() : "");
                const bySig = {};
                Object.keys(byId).forEach((id) => {
                    const entry = byId[id], k = sig(entry.deck);
                    bySig[k] = bySig[k] ? better(bySig[k], entry) : entry;
                });

                const keep = Object.keys(bySig).map((k) => bySig[k]);
                const canonical = {};
                keep.forEach(({ deck }) => { canonical[DECKS_PREFIX + deck.id] = true; });

                for (const k of deckKeys) if (!canonical[k]) await store.delete(k);
                for (const { key, deck } of keep) {
                    if (key !== DECKS_PREFIX + deck.id) await store.set(DECKS_PREFIX + deck.id, JSON.stringify(deck));
                }
                loaded = keep.map(({ deck }) => deck);
            } catch (e) {}

            if (!loaded.length) {
                loaded = [SAMPLE_DECK];
                await store.set(DECKS_PREFIX + SAMPLE_DECK.id, JSON.stringify(SAMPLE_DECK));
            }
            setDecks(loaded);

            try {
                const list = await store.list(STATS_PREFIX);
                const next = {};
                for (const k of list.keys) {
                    const r = await store.get(k);
                    if (r) next[k.slice(STATS_PREFIX.length)] = JSON.parse(r.value);
                }
                setStats(next);
            } catch (e) {}

            try {
                const r = await store.get(LOG_KEY);
                if (r) {
                    const arr = JSON.parse(r.value);
                    if (Array.isArray(arr)) { logRef.current = arr; setLog(arr); }
                }
            } catch (e) {}

            setReady(true);
        })();
    }, []);

    /* ── persist ────────────────────────────────────────────────── */
    const saveDeck = useCallback(async (deck) => {
        setDecks((prev) => {
            const i = prev.findIndex((d) => d.id === deck.id);
            if (i < 0) return [...prev, deck];
            const copy = [...prev]; copy[i] = deck; return copy;
        });
        await store.set(DECKS_PREFIX + deck.id, JSON.stringify(deck));
    }, []);

    const saveSettings = useCallback(async (next) => {
        setSettings(next);
        await store.set(SETTINGS_KEY, JSON.stringify(next));
    }, []);

    const writeLog = useCallback(async (next) => {
        logRef.current = next;
        setLog(next);
        await store.set(LOG_KEY, JSON.stringify(next));
    }, []);
    const pushLog = useCallback((entry) => writeLog([...logRef.current, entry].slice(-500)), [writeLog]);
    const dropDeckLog = useCallback((id) => writeLog(logRef.current.filter((s) => s.deckId !== id)), [writeLog]);

    const deck = decks.find((d) => d.id === sheetId) || null;

    function openSheet(id) { setSheetId(id); setView("sheet"); window.scrollTo(0, 0); }
    function goShelf() { setView("shelf"); window.scrollTo(0, 0); }

    /* ── deck actions ───────────────────────────────────────────── */
    async function removeDeck(id) {
        const d = decks.find((x) => x.id === id);
        if (!d) return;
        const yes = await confirmAsk("Delete “" + d.name + "”?", "All " + d.cards.length + " cards and this deck's history go with it. This cannot be undone.");
        if (!yes) return;
        setDecks((prev) => prev.filter((x) => x.id !== id));
        await store.delete(DECKS_PREFIX + id);
        await store.delete(STATS_PREFIX + id);
        await dropDeckLog(id);
        goShelf(); toast("Deck deleted");
    }

    async function resetDeckProgress(id) {
        const d = decks.find((x) => x.id === id);
        if (!d) return;
        const yes = await confirmAsk("Reset progress on this deck?", "Recall history on every card and the session records for this deck are cleared. The cards themselves stay.", "Reset");
        if (!yes) return;
        await saveDeck({ ...d, cards: d.cards.map((c) => ({ ...c, reps: 0, hits: 0, history: [], lastSeen: 0 })) });
        await store.delete(STATS_PREFIX + id);
        setStats((prev) => { const n = { ...prev }; delete n[id]; return n; });
        await dropDeckLog(id);
        toast("Progress reset");
    }

    function toggleDeckShuffle(id) {
        const d = decks.find((x) => x.id === id);
        if (d) saveDeck({ ...d, autoShuffle: !d.autoShuffle });
    }

    function exportDeck(d) { download(slug(d.name) + ".txt", toText(d)); toast("Deck exported"); }
    function exportAll() {
        if (!decks.length) return toast("Nothing to export");
        decks.forEach((d, i) => setTimeout(() => download(slug(d.name) + ".txt", toText(d)), i * 120));
        toast(decks.length + " files exported");
    }

    async function saveImported(list) {
        let last = null;
        for (const p of list) {
            const d = normalizeDeck({ id: newId(), name: p.name, description: p.description, cls: p.cls, semester: p.semester, created: Date.now(), cards: p.cards });
            await saveDeck(d); last = d;
        }
        toast(list.length > 1 ? list.length + " decks imported" : "Deck imported");
        if (list.length === 1 && last) openSheet(last.id); else goShelf();
    }

    async function saveEdited(draft) {
        const existing = decks.find((d) => d.id === draft.id);
        const d = normalizeDeck({
            ...draft,
            id: draft.id || newId(),
            created: existing ? existing.created : Date.now(),
            lastOpenedAt: existing ? existing.lastOpenedAt : null
        });
        if (existing) {
            const byId = {};
            existing.cards.forEach((c) => { byId[c.id] = c; });
            d.cards = d.cards.map((c) => (byId[c.id] ? { ...byId[c.id], q: c.q, a: c.a } : c));
        }
        await saveDeck(d);
        setEditId(null);
        toast("Deck saved");
        openSheet(d.id);
    }

    /* ── session ────────────────────────────────────────────────── */
    function startSession(id, startAt, onlyIds) {
        const d = decks.find((x) => x.id === id);
        if (!d || !d.cards.length) return toast("This deck has no cards yet");
        const mode = settings.defaultMode;

        let pool = onlyIds ? d.cards.filter((c) => onlyIds.indexOf(c.id) !== -1) : [...d.cards];
        if (!pool.length) return toast("Nothing left to study");
        if (startAt == null && !onlyIds) {
            if (d.autoShuffle || settings.shuffle) pool = shuffle(pool);
            else if (mode === "graded") {
                pool = [...pool].sort((a, b) => {
                    const sa = strength(a), sb = strength(b);
                    return (sa == null ? -1 : sa) - (sb == null ? -1 : sb);
                });
            }
            if (settings.perSession !== "all") pool = pool.slice(0, Number(settings.perSession));
        }

        const at = startAt == null ? 0 : Math.min(Math.max(startAt, 0), pool.length - 1);
        saveDeck({ ...d, lastOpenedAt: Date.now() });
        setSession({ deckId: id, mode, pool, at, turned: false, grades: [], requeued: [], t0: Date.now() });
        setSheetId(id);
        setView("study");
        window.scrollTo(0, 0);
    }

    const turn = useCallback(() => setSession((s) => (s ? { ...s, turned: !s.turned } : s)), []);
    const goTo = useCallback((i) => setSession((s) => {
        if (!s) return s;
        return { ...s, at: Math.min(Math.max(i, 0), s.pool.length - 1), turned: false };
    }), []);

    function finish(s, quit) {
        const graded = s.grades.filter((g) => g !== undefined);
        const rated = graded.length;
        const right = graded.filter((g) => g >= 2).length;
        const tally = [0, 0, 0, 0];
        graded.forEach((g) => { tally[g]++; });
        const ms = Date.now() - s.t0;
        const accuracy = rated ? Math.round((right / rated) * 100) : 0;

        /* the cards in the run that never got a grade — the summary is
           misleading without them, and they make a useful follow-up run */
        const restIds = [];
        s.pool.forEach((c, i) => { if (s.grades[i] === undefined && restIds.indexOf(c.id) === -1) restIds.push(c.id); });

        const d = decks.find((x) => x.id === s.deckId);

        if (rated) {
            pushLog({ t: Date.now(), deckId: s.deckId, mode: s.mode, seen: rated, right, ms, pool: s.pool.length });
            const prev = stats[s.deckId] || { sessions: 0, cards: 0, ms: 0 };
            const nextStat = { sessions: (prev.sessions || 0) + 1, cards: (prev.cards || 0) + rated, ms: (prev.ms || 0) + ms, last: Date.now() };
            setStats((p) => ({ ...p, [s.deckId]: nextStat }));
            store.set(STATS_PREFIX + s.deckId, JSON.stringify(nextStat));
        }

        setSession(null);
        /* nothing rated means nothing to report — go straight to the shelf */
        if (!rated) { goShelf(); return; }

        setResult({
            deckId: s.deckId, deckName: d ? d.name : "Deck", mode: s.mode, tally,
            pool: s.pool.length, rated, right, missed: rated - right, skipped: s.pool.length - rated,
            restIds, ms, accuracy, quit: !!quit
        });
        setView("results");
        window.scrollTo(0, 0);
    }

    function score(quality) {
        const s = session;
        if (!s || !s.turned) return;
        const card = s.pool[s.at];
        const before = s.grades[s.at];              /* set if this card was already graded */

        const grades = [...s.grades]; grades[s.at] = quality;

        const d = decks.find((x) => x.id === s.deckId);
        if (d) {
            saveDeck({
                ...d,
                cards: d.cards.map((c) => c.id === card.id
                    ? {
                        ...c,
                        /* re-grading a card corrects the tally instead of counting twice */
                        reps: (c.reps || 0) + (before === undefined ? 1 : 0),
                        hits: Math.max(0, (c.hits || 0) + (quality >= 2 ? 1 : 0) - (before !== undefined && before >= 2 ? 1 : 0)),
                        history: [...(c.history || []), quality].slice(-10),
                        lastSeen: Date.now()
                    }
                    : c)
            });
        }

        /* a missed card comes back once, at the end of the run */
        let pool = s.pool, requeued = s.requeued;
        if (s.mode === "graded" && quality === 0 && requeued.indexOf(card.id) === -1) {
            pool = [...pool, card];
            requeued = [...requeued, card.id];
        }

        /* move to the next card that still needs a grade, wrapping once */
        let at = -1;
        for (let i = s.at + 1; i < pool.length; i++) if (grades[i] === undefined) { at = i; break; }
        if (at === -1) for (let i = 0; i < s.at; i++) if (grades[i] === undefined) { at = i; break; }

        const next = { ...s, grades, pool, requeued };
        if (at === -1) finish(next, false);
        else setSession({ ...next, at, turned: false });
    }

    function shuffleRest() {
        setSession((s) => (s ? { ...s, pool: [...s.pool.slice(0, s.at + 1), ...shuffle(s.pool.slice(s.at + 1))] } : s));
        toast("Remaining cards shuffled");
    }

    async function clearProgress() {
        const yes = await confirmAsk("Reset all progress?", "Recall history on every card and all session records are cleared, across every deck. The decks stay.", "Reset");
        if (!yes) return;
        for (const d of decks) await saveDeck({ ...d, cards: d.cards.map((c) => ({ ...c, reps: 0, hits: 0, history: [], lastSeen: 0 })) });
        for (const id of Object.keys(stats)) await store.delete(STATS_PREFIX + id);
        setStats({}); await writeLog([]);
        toast("Progress reset");
    }

    async function clearLibrary() {
        const yes = await confirmAsk("Clear the whole library?", "All " + decks.length + " decks and every card in them are deleted from this device. This cannot be undone.", "Clear everything");
        if (!yes) return;
        for (const d of decks) await store.delete(DECKS_PREFIX + d.id);
        for (const id of Object.keys(stats)) await store.delete(STATS_PREFIX + id);
        setDecks([]); setStats({}); await writeLog([]);
        goShelf(); toast("Library cleared");
    }

    /* ── keys ───────────────────────────────────────────────────── */
    useEffect(() => {
        function onKey(e) {
            const tag = e.target && e.target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { if (e.key === "Escape") e.target.blur(); return; }
            if (ask) { if (e.key === "Escape") settleAsk(false); return; }

            if (view === "study" && session) {
                if (e.key === " " || e.key === "Enter") { e.preventDefault(); turn(); }
                else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(session.at - 1); }
                else if (e.key === "ArrowRight") { e.preventDefault(); goTo(session.at + 1); }
                else if (e.key >= "1" && e.key <= "4") score(session.mode === "flip" ? (e.key === "1" ? 0 : 2) : Number(e.key) - 1);
                else if (e.key === "Escape") finish(session, true);
                return;
            }
            if (view === "shelf") {
                if (e.key === "/") { e.preventDefault(); const el = document.querySelector(".search"); if (el) el.focus(); }
                else if (e.key === "n") { setEditId(null); setSheetId(null); setNewMode("import"); setView("new"); }
                return;
            }
            if (e.key === "Escape") { if (view === "settings") setView(cameFrom); else goShelf(); }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    });

    /* ── chrome: the back control is always top-left, aligned with
          the content column, and square like the rest of the site ── */
    const RETURN_LABEL = { study: "← Back to the review", sheet: "← Back to the deck", new: "← Back", results: "← Back", shelf: "← Shelf" };

    let back = { label: "← Programs", href: "../" };
    if (view === "study" && session) back = { label: "← End session", run: () => finish(session, true) };
    else if (view === "settings") back = { label: RETURN_LABEL[cameFrom] || "← Shelf", run: () => setView(cameFrom) };
    else if (view === "sheet" || view === "results" || view === "new") back = { label: "← Shelf", run: goShelf };
    else if (view === "edit") back = { label: "← Back", run: () => { setEditId(null); sheetId ? openSheet(sheetId) : goShelf(); } };

    const context = view === "sheet" && deck ? "Deck details"
        : view === "settings" ? "Settings" : "";

    const progress = session ? ((session.at + 1) / session.pool.length) * 100 : view === "results" ? 100 : 0;

    return (
        <>
            <div className="topline"><span style={{ width: progress + "%" }} /></div>

            <header className="bar">
                <div className="bar-inner">
                    {back.href
                        ? <a className="btn btn-pill" href={back.href}>{back.label}</a>
                        : <button className="btn btn-pill" onClick={back.run}>{back.label}</button>}
                    <span className="bar-mid">{context}</span>
                    <button className={"btn btn-pill" + (view === "settings" ? " on" : "")}
                        onClick={() => { if (view !== "settings") { setCameFrom(view); setView("settings"); } }}>Settings</button>
                </div>
            </header>

            {!ready ? (
                <main className="page"><p className="none">Opening your library…</p></main>
            ) : view === "shelf" ? (
                <Shelf
                    decks={decks} query={query} setQuery={setQuery} cls={cls} setCls={setCls} sort={sort} setSort={setSort}
                    onStudy={(id) => startSession(id)}
                    onDetails={openSheet}
                    onNew={() => { setEditId(null); setSheetId(null); setNewMode("import"); setView("new"); }}
                />
            ) : view === "sheet" && deck ? (
                <Sheet
                    deck={deck} log={log}
                    onStudy={(id) => startSession(id)}
                    onStudyAt={(id, i) => startSession(id, i)}
                    onEdit={(id) => { setEditId(id); setView("edit"); }}
                    onExport={exportDeck}
                    onResetProgress={resetDeckProgress}
                    onDelete={removeDeck}
                    onToggleShuffle={toggleDeckShuffle}
                />
            ) : view === "study" && session ? (
                <Study
                    session={session} settings={settings} deckName={deck ? deck.name : "Deck"}
                    onTurn={turn} onScore={score} onGo={goTo} onShuffle={shuffleRest} onQuit={() => finish(session, true)}
                />
            ) : view === "results" && result ? (
                <Results
                    result={result} log={log}
                    onAgain={() => startSession(result.deckId)}
                    onRest={() => startSession(result.deckId, null, result.restIds)}
                    onSheet={() => openSheet(result.deckId)}
                    onShelf={goShelf}
                />
            ) : view === "new" ? (
                <NewDeck
                    mode={newMode} setMode={setNewMode}
                    onSaveImported={saveImported}
                    onSaveManual={saveEdited}
                    onCancel={goShelf}
                    toast={toast}
                />
            ) : view === "edit" ? (
                <Editor
                    initial={editId ? decks.find((d) => d.id === editId) : null}
                    onSave={saveEdited}
                    onCancel={() => { setEditId(null); sheetId ? openSheet(sheetId) : goShelf(); }}
                    toast={toast}
                />
            ) : view === "settings" ? (
                <Settings
                    settings={settings} decks={decks} log={log}
                    onChange={saveSettings}
                    onReset={() => saveSettings(DEFAULT_SETTINGS)}
                    onExportAll={exportAll}
                    onClearProgress={clearProgress}
                    onClearAll={clearLibrary}
                />
            ) : (
                <main className="page"><p className="none">Nothing here. <button className="btn btn-quiet" onClick={goShelf}>Back to the shelf</button></p></main>
            )}

            {toastMsg && <div className="toast">{toastMsg}</div>}
            <Confirm ask={ask} onDone={settleAsk} />
        </>
    );
}

const rootEl = document.getElementById("root");
rootEl.innerHTML = "";
createRoot(rootEl).render(<App />);
