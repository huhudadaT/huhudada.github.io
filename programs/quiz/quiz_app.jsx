/* ═══════════════════════════════════════════════════════════════════
   Quiz — huhudada.com/programs/quiz/

   Source of truth. index.html carries a transpiled copy inline;
   regenerate it after editing here:

     tsc --jsx react --target es2020 --module esnext --allowJs \
         --outDir build quiz_app.jsx

   Built on the same principles as the flashcards app: one content
   column, square controls, the back control top-left where every other
   page puts it, import-first when adding a set, no due dates, and one
   colour language throughout — blue is what you got wrong or haven't
   learnt, deep rose is what you know. Styling lives in index.html.
   ═══════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

/* ── storage: localStorage behind an async shim ─────────────────── */
const STORE_PREFIX = "quizzical:";
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

const QUIZ_PREFIX = "quiz:";
const STATS_PREFIX = "stats:";
const SETTINGS_KEY = "settings:main";
const LEGACY_KEYS = ["quizzes", "quizzical:quizzes"];

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

const DEFAULT_SETTINGS = {
    shuffleQuestions: false,
    shuffleOptions: false,
    showExplanations: true,
    immediateFeedback: true,
    showTimer: true,
    fontSize: "normal",
    keyboardShortcuts: true
};

/* ── helpers ────────────────────────────────────────────────────── */
let seq = 0;
const newId = () => "q" + (++seq).toString(36) + Date.now().toString(36);
const slug = (s) => (s || "quiz").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "quiz";
const letter = (i) => String.fromCharCode(65 + i);

const shuffle = (arr) => {
    const c = [...arr];
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
};

/* how well a question is known, from its own answer history */
const strength = (q) => (q.reps ? q.hits / q.reps : null);
function strengthBand(q) {
    const s = strength(q);
    if (s == null) return "unseen";
    if (s < 0.5) return "shaky";
    if (s < 0.85) return "getting";
    return "solid";
}
const BAND_LABEL = { unseen: "not answered yet", shaky: "shaky", getting: "getting there", solid: "known" };

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
function toText(quiz) {
    const lines = [
        "Title: " + (quiz.title || ""),
        "Description: " + (quiz.description || ""),
        "Class: " + (quiz.cls || ""),
        "Semester: " + (quiz.semester || ""),
        ""
    ];
    quiz.questions.forEach((q, qi) => {
        lines.push("Q: " + q.q);
        q.options.forEach((opt, oi) => lines.push((oi === q.correct ? "*" : "") + letter(oi) + ". " + opt));
        if (q.explain) lines.push("Explain: " + q.explain);
        if (qi < quiz.questions.length - 1) lines.push("");
    });
    return lines.join("\n") + "\n";
}

function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* One paste may hold several quizzes. A new Title:/Name: line starts one,
   and a row of "=" characters (how the old export separated them) does too. */
function parseImport(text) {
    let working = String(text || "").replace(/\r\n?/g, "\n");
    if (/^\s*Quizzical Library Export/i.test(working)) {
        const cut = working.search(/^={5,}\s*$/m);
        if (cut !== -1) working = working.slice(cut);
    }
    const sections = working.split(/^={5,}\s*$/m).map((x) => x.trim()).filter(Boolean);
    const out = [];
    sections.forEach((section) => {
        section.split(/\n(?=[ \t]*(?:Title|Name)[ \t]*:)/).forEach((block) => {
            const quiz = parseOne(block);
            if (quiz.questions.length) out.push(quiz);
        });
    });
    return out;
}

function parseOne(text) {
    const quiz = { title: "", description: "", cls: "", semester: "", questions: [], errors: [] };
    let cur = null;
    text.split("\n").forEach((raw) => {
        const line = raw.trim();
        if (!line) return;
        let m;
        if (!cur && (m = /^(?:Title|Name)\s*:\s*(.+)$/i.exec(line))) { quiz.title = m[1].trim(); return; }
        if (!cur && (m = /^Description\s*:\s*(.+)$/i.exec(line))) { quiz.description = m[1].trim(); return; }
        if (!cur && (m = /^Class\s*:\s*(.+)$/i.exec(line))) { quiz.cls = m[1].trim(); return; }
        if (!cur && (m = /^Semester\s*:\s*(.+)$/i.exec(line))) { quiz.semester = m[1].trim(); return; }
        if ((m = /^Q\s*[:.]?\s*(.+)$/i.exec(line))) {
            if (cur) quiz.questions.push(cur);
            cur = { q: m[1].trim(), options: [], correct: -1, explain: "" };
            return;
        }
        if (cur && (m = /^(\*?)\s*([A-Za-z])\s*[.):]\s*(.+)$/.exec(line))) {
            const idx = m[2].toUpperCase().charCodeAt(0) - 65;
            if (idx < 0 || idx >= MAX_OPTIONS) return;
            while (cur.options.length <= idx) cur.options.push("");
            cur.options[idx] = m[3].trim();
            if (m[1] === "*") cur.correct = idx;
            return;
        }
        if (cur && (m = /^Explain\s*:\s*(.+)$/i.exec(line))) { cur.explain = m[1].trim(); return; }
    });
    if (cur) quiz.questions.push(cur);

    quiz.questions.forEach((q, i) => {
        const n = i + 1;
        if (!q.q) quiz.errors.push("Question " + n + ": no prompt");
        if (q.options.length < MIN_OPTIONS) quiz.errors.push("Question " + n + ": needs at least " + MIN_OPTIONS + " options");
        if (q.options.some((o) => !o)) quiz.errors.push("Question " + n + ": an option is blank");
        if (q.correct < 0) quiz.errors.push("Question " + n + ": no correct answer marked — put * before its letter");
    });
    if (!quiz.title) quiz.title = "Imported quiz";
    return quiz;
}

/* older saves may lack the per-question counters or the class fields */
function normalizeQuestion(q) {
    return {
        id: q.id || newId(),
        q: q.q || "",
        options: Array.isArray(q.options) ? [...q.options] : [],
        correct: typeof q.correct === "number" ? q.correct : -1,
        explain: q.explain || "",
        reps: q.reps || 0,
        hits: q.hits || 0
    };
}
function normalizeQuiz(z) {
    return {
        id: z.id || newId(),
        title: z.title || z.name || "Untitled quiz",
        description: z.description || "",
        cls: z.cls || z.class || "",
        semester: z.semester || "",
        autoShuffle: !!z.autoShuffle,
        created: z.created || z.createdAt || Date.now(),
        lastOpenedAt: z.lastOpenedAt || null,
        questions: (z.questions || []).map(normalizeQuestion)
    };
}

const SAMPLE_QUIZ = normalizeQuiz({
    id: "sample-general-knowledge",
    title: "A Tour of General Knowledge",
    description: "A built-in quiz to try the app with. Delete it once you have your own.",
    cls: "SAMPLE",
    semester: "Fall 2026",
    questions: [
        { q: "Which planet in our solar system has the most confirmed moons?", options: ["Jupiter", "Saturn", "Neptune", "Uranus"], correct: 1, explain: "Saturn overtook Jupiter in 2023 and now has over 140 confirmed moons." },
        { q: "In what year did the Berlin Wall fall?", options: ["1987", "1989", "1991", "1993"], correct: 1, explain: "The wall fell on 9 November 1989." },
        { q: "What is the chemical symbol for gold?", options: ["Gd", "Go", "Au", "Ag"], correct: 2, explain: "Au comes from the Latin aurum. Ag is silver." },
        { q: "Who painted The Starry Night?", options: ["Claude Monet", "Pablo Picasso", "Vincent van Gogh", "Salvador Dalí"], correct: 2, explain: "Van Gogh painted it in June 1889 at Saint-Paul-de-Mausole." },
        { q: "Which element has atomic number 1?", options: ["Helium", "Oxygen", "Hydrogen", "Carbon"], correct: 2, explain: "Hydrogen has a single proton." },
        { q: "In which organelle does oxidative phosphorylation take place?", options: ["The nucleus", "The mitochondrion", "The ribosome", "The Golgi apparatus"], correct: 1, explain: "The electron transport chain sits in the inner mitochondrial membrane." }
    ]
});

const AI_INSTRUCTIONS = `Generate exam-style multiple-choice questions as plain text.

Start with these four lines, then a blank line, then the questions:
Title: [a short, specific quiz title in Title Case]
Description: [one sentence describing what the quiz covers]
Class: [the course code, e.g. BIOSC 0350]
Semester: [Spring, Summer, or Fall] [four-digit year]

Rules:
- Exam-style voice: formal, direct, measured. No conversational filler.
- Concise phrasing. If a question works in ten words, don't use thirty.
- The correct answer must not be obvious at a glance.
- Every distractor must be plausible — the kind of answer someone who
  half-knows the material would seriously consider.
- Keep the option lengths even. Length is a tell.
- 2 to 8 options per question, 4 is typical.
- Move the correct answer around; don't favour one slot.
- One short Explain: line after each question.

Format each question as:
Q: [the question]
A. [option]
*B. [the correct option, marked with an asterisk before its letter]
C. [option]
D. [option]
Explain: [one sentence on why the answer is right]

Separate questions with a blank line. Output only the header lines and
the questions.`;

const SAMPLE_PASTE = `Title: The End of World War II in Europe
Description: The final campaigns, surrenders, and settlements of the European theatre.
Class: SAMPLE
Semester: Spring 2026

Q: In what year did World War II end in Europe?
A. 1944
*B. 1945
C. 1946
D. 1947
Explain: V-E Day was 8 May 1945, after Germany's unconditional surrender.

Q: Which conference set the postwar occupation zones of Germany?
A. Casablanca
B. Tehran
*C. Yalta
D. Potsdam
Explain: The zones were agreed at Yalta in February 1945.`;

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

function Shelf({ quizzes, query, setQuery, cls, setCls, sort, setSort, onTake, onDetails, onNew }) {
    const classes = useMemo(() => {
        const seen = [];
        quizzes.forEach((z) => { if (z.cls && seen.indexOf(z.cls) === -1) seen.push(z.cls); });
        return seen.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [quizzes]);

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        const out = quizzes.filter((z) =>
            (!cls || z.cls === cls) && (
                !q ||
                (z.title + " " + z.cls + " " + z.description).toLowerCase().includes(q) ||
                z.questions.some((x) => (x.q + " " + x.options.join(" ")).toLowerCase().includes(q))
            )
        );
        const key = {
            recent: (a, b) => (b.lastOpenedAt || b.created) - (a.lastOpenedAt || a.created),
            new: (a, b) => b.created - a.created,
            title: (a, b) => a.title.localeCompare(b.title),
            size: (a, b) => b.questions.length - a.questions.length
        }[sort];
        return [...out].sort(key);
    }, [quizzes, query, cls, sort]);

    return (
        <main className="page">
            <div className="head-row">
                <div className="brand">
                    <span className="brand-kicker">Huhudada · Programs</span>
                    <h1 className="brand-title">Quiz</h1>
                </div>
                <div className="head-tools">
                    <input className="search" type="text" value={query} placeholder="Search quizzes and questions"
                        aria-label="Search quizzes" onChange={(e) => setQuery(e.target.value)} />
                    <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Filter by class">
                        <option value="">All classes</option>
                        {classes.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort quizzes">
                        <option value="recent">Recently taken</option>
                        <option value="new">Newest first</option>
                        <option value="title">By title</option>
                        <option value="size">Most questions</option>
                    </select>
                    <button className="btn btn-fill" onClick={onNew}>+ New quiz</button>
                </div>
            </div>

            {quizzes.length === 0 ? (
                <div className="empty">
                    <strong>The shelf is empty.</strong>
                    <p>Import a set from the Library, or write a quiz by hand.</p>
                    <button className="btn btn-fill" onClick={onNew}>+ New quiz</button>
                </div>
            ) : list.length === 0 ? (
                <p className="none">
                    No quiz matches {query ? "“" + query + "”" : "that filter"}{cls ? " in " + cls : ""}.
                    <button className="btn btn-quiet" onClick={() => { setQuery(""); setCls(""); }}>Clear filters</button>
                </p>
            ) : (
                <div className="stacks">
                    {list.map((z) => {
                        const layers = Math.min(2, Math.max(0, Math.ceil(z.questions.length / 4) - 1));
                        return (
                            <div className="stack" key={z.id}>
                                {layers > 1 && <div className="layer l2" />}
                                {layers > 0 && <div className="layer l1" />}
                                <div className="facecard">
                                    <button className="stack-hit" onClick={() => onTake(z.id)} aria-label={"Take " + z.title} />
                                    <div className="stack-body">
                                        <span className="chip">{z.cls || "No class"}</span>
                                        <div className="stack-title">{z.title}</div>
                                        <p className="stack-desc">{z.description}</p>
                                    </div>
                                    <div className="stack-foot">
                                        <span className="stack-meta">
                                            <b>{z.questions.length}</b> questions
                                            <i>·</i>
                                            {relTime(z.lastOpenedAt)}
                                        </span>
                                        <button className="btn btn-tiny" onClick={() => onDetails(z.id)}>Details</button>
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

/* ═══ quiz detail ═══════════════════════════════════════════════ */

function Sheet({ quiz, stats, onTake, onTakeAt, onEdit, onExport, onResetProgress, onDelete, onToggleShuffle }) {
    const st = stats[quiz.id] || {};
    const recent = (st.recent || []).slice(0, 5);
    const avg = recent.length ? Math.round(recent.reduce((n, r) => n + r.percent, 0) / recent.length) : null;
    const totalMs = (st.recent || []).reduce((n, r) => n + (r.elapsedMs || 0), 0);

    return (
        <main className="page">
            <div className="sheet-head">
                <div className="sheet-id">
                    <span className="chip">{quiz.cls || "No class"}</span>
                    {quiz.semester ? <span className="chip chip-soft">{quiz.semester}</span> : null}
                    <h1 className="sheet-name">{quiz.title}</h1>
                    <p className="sheet-desc">{quiz.description || "No description yet."}</p>
                </div>
                <div className="sheet-acts">
                    <button className="btn btn-fill" onClick={() => onTake(quiz.id)}>Take this quiz</button>
                    <button className="btn" onClick={() => onEdit(quiz.id)}>Edit questions</button>
                    <Menu label="More" items={[
                        { label: "Export .txt", run: () => onExport(quiz) },
                        { label: "Reset progress", run: () => onResetProgress(quiz.id) },
                        { label: "Delete quiz", run: () => onDelete(quiz.id), danger: true }
                    ]} />
                </div>
            </div>

            <div className="statline">
                <span><b>{quiz.questions.length}</b><em>questions</em></span>
                <span><b>{st.lastPercent != null ? st.lastPercent + "%" : "—"}</b><em>last score</em></span>
                <span><b>{avg == null ? "—" : avg + "%"}</b><em>average, last 5</em></span>
                <span><b>{st.attempts || 0}</b><em>attempts</em></span>
                <span><b>{totalMs ? longClock(totalMs) : "—"}</b><em>time spent</em></span>
                <span><b>{relTime(quiz.lastOpenedAt)}</b><em>last taken</em></span>
            </div>

            <div className="opt-row">
                <button className="switch" role="switch" aria-checked={!!quiz.autoShuffle}
                    aria-label="Shuffle this quiz every time it opens" onClick={() => onToggleShuffle(quiz.id)} />
                <div className="row-txt">
                    <b>Shuffle every time this quiz opens</b>
                    <span>Applies to this quiz only, whatever the global setting says.</span>
                </div>
            </div>

            <h2 className="sect-sm">Questions</h2>
            <p className="sect-note">Click any question to start there. Answers are hidden.</p>
            <div className="slips">
                {quiz.questions.map((q, i) => (
                    <button className="slip" key={q.id} onClick={() => onTakeAt(quiz.id, i)}>
                        <span className="slip-n">{i + 1}</span>
                        <span className="slip-txt">
                            <span className="slip-q">{q.q}</span>
                            <span className="slip-a">{q.options.length} options</span>
                        </span>
                        <span className={"slip-meta m-" + strengthBand(q)}>
                            <i className={"pip pip-" + strengthBand(q)} />
                            {BAND_LABEL[strengthBand(q)]}{q.reps ? " · answered " + q.reps + "×" : ""}
                        </span>
                    </button>
                ))}
            </div>
        </main>
    );
}

/* ═══ taking a quiz ═════════════════════════════════════════════ */

function Take({ run, settings, onPick, onSubmit, onGo, onAdvance, onFinish, onQuit }) {
    const [jump, setJump] = useState(String(run.at + 1));
    const [now, setNow] = useState(Date.now());
    const q = run.questions[run.at];
    const n = run.questions.length;
    const answered = run.answers.filter((a) => a !== undefined).length;
    const given = run.answers[run.at];
    const locked = settings.immediateFeedback && given !== undefined;
    const showing = locked;
    const picked = run.picked;
    const isLast = run.at + 1 >= n;
    const correct = showing && given === q.correct;

    useEffect(() => { setJump(String(run.at + 1)); }, [run.at, n]);
    useEffect(() => {
        if (!settings.showTimer) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [settings.showTimer]);

    function commitJump(e) {
        const v = parseInt(jump, 10);
        if (Number.isFinite(v)) onGo(Math.min(Math.max(v, 1), n) - 1);
        else setJump(String(run.at + 1));
        if (e && e.target && e.target.blur) e.target.blur();
    }

    return (
        <main className="page take">
            <div className="take-col">
                <div className="take-head">
                    <h1 className="take-title">{run.title}</h1>
                    <div className="take-line">
                        <span className="at-q">Question {run.at + 1} of {n}</span>
                        {locked && <span>answered</span>}
                        {settings.showTimer && <span className="timer">{clock(now - run.t0)}</span>}
                        {settings.keyboardShortcuts && <span className="keys">A–{letter(q.options.length - 1)} to choose · Enter to submit</span>}
                    </div>
                </div>

                {/* the question is read, not handled — so it is set as prose,
                    and the options below it carry the borders and the clicks */}
                <div className="qblock">
                    <h2 className="qtext">{q.q}</h2>
                </div>

                <div className="options">
                    {q.options.map((opt, oi) => {
                        let state = "";
                        if (showing) {
                            if (oi === q.correct) state = " right";
                            else if (oi === given) state = " wrong";
                        } else if (picked === oi) state = " sel";
                        return (
                            <button key={oi} className={"opt" + state} disabled={showing} onClick={() => onPick(oi)}>
                                <span className="opt-letter">{letter(oi)}</span>
                                <span className="opt-text">{opt}</span>
                                <span className="opt-mark" aria-hidden="true">
                                    {showing && oi === q.correct ? "✓" : showing && oi === given ? "✕" : ""}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* one action, plus quiet navigation kept well clear of it */}
                <div className="act-row">
                    {showing ? (
                        isLast && answered === n
                            ? <button className="btn btn-fill btn-go" onClick={onFinish}>See results</button>
                            : <button className="btn btn-fill btn-go" onClick={onAdvance}>
                                {isLast ? "Go to an unanswered question" : "Next question"}
                            </button>
                    ) : (
                        <button className="btn btn-fill btn-go" disabled={picked === null} onClick={onSubmit}>
                            {settings.immediateFeedback ? "Submit answer" : (isLast && answered + (picked !== null ? 1 : 0) >= n ? "Save and finish" : "Save and continue")}
                        </button>
                    )}
                    {!settings.immediateFeedback && answered === n && <button className="btn" onClick={onFinish}>See results</button>}
                </div>

                {showing && (
                    <div className={"feedback " + (correct ? "ok" : "no")}>
                        <div className="fb-tag">{correct ? "Correct" : "Not this time"}</div>
                        {!correct && (
                            <p className="fb-answer">The answer was <b>{letter(q.correct)}. {q.options[q.correct]}</b></p>
                        )}
                        {settings.showExplanations && q.explain ? <p className="fb-body">{q.explain}</p> : null}
                    </div>
                )}

                <div className="nav-row">
                    <span className="nav-mini">
                        <button className="step" onClick={() => onGo(run.at - 1)} disabled={run.at === 0} aria-label="Previous question">‹</button>
                        <input className="jump" type="text" inputMode="numeric" value={jump} aria-label="Question number"
                            onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ""))}
                            onBlur={() => commitJump()}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitJump(e); } }} />
                        <span className="nav-of">of {n}</span>
                        <button className="step" onClick={() => onGo(run.at + 1)} disabled={isLast} aria-label="Next question">›</button>
                    </span>
                </div>

                <div className="dots">
                    {run.questions.map((qq, i) => {
                        const a = run.answers[i];
                        const cls = a === undefined ? "" : settings.immediateFeedback ? (a === qq.correct ? " right" : " wrong") : " seen";
                        return <button key={i} className={"dot" + cls + (i === run.at ? " now" : "")}
                            onClick={() => onGo(i)} title={"Question " + (i + 1)} aria-label={"Question " + (i + 1)} />;
                    })}
                </div>

                <div className="take-foot">
                    <button className="btn btn-quiet" onClick={onFinish} disabled={!answered}>Finish now</button>
                    <button className="btn btn-quiet" onClick={onQuit}>Quit without scoring</button>
                </div>
            </div>
        </main>
    );
}

/* ═══ results ═══════════════════════════════════════════════════ */

function Results({ result, stats, settings, onRetry, onRetryMissed, onSheet, onShelf }) {
    const st = stats[result.quizId] || {};
    const before = (st.recent || []).slice(1, 6);
    const prior = before.length ? Math.round(before.reduce((n, r) => n + r.percent, 0) / before.length) : null;
    const delta = prior == null ? null : result.percent - prior;
    const covered = result.total ? Math.round((result.answered / result.total) * 100) : 100;
    const partial = result.skipped > 0;

    /* the same row above and below the review, so it is reachable either way */
    const actions = (
        <div className="res-acts">
            {result.missed > 0 && <button className="btn btn-fill" onClick={onRetryMissed}>Retry the {result.missed} you missed</button>}
            <button className={"btn" + (result.missed ? "" : " btn-fill")} onClick={onRetry}>Take it again</button>
            <button className="btn" onClick={onSheet}>Quiz details</button>
            <button className="btn btn-quiet" onClick={onShelf}>Back to the shelf</button>
        </div>
    );

    return (
        <main className="page">
            <h1 className="view-title">{result.title}</h1>
            <p className="sect-note">
                {partial
                    ? "Finished with " + result.answered + " of " + result.total + " questions answered, so the score covers the part you attempted."
                    : "Every question was answered."}
            </p>

            <div className="res-pair">
                <div className="res-fig">
                    <span className="score">{result.percent}%</span>
                    <b>correct</b>
                    <em>{result.score} right, {result.answered - result.score} wrong, out of {result.answered} answered</em>
                </div>
                <div className="res-fig">
                    <span className="score alt">{covered}%</span>
                    <b>of the quiz attempted</b>
                    <em>{partial ? result.skipped + " question" + (result.skipped === 1 ? "" : "s") + " left blank" : "nothing left blank"}</em>
                </div>
            </div>

            <p className="score-note">
                {delta == null ? "First recorded attempt at this quiz."
                    : delta === 0 ? "Level with your recent average of " + prior + "%."
                        : (delta > 0 ? "Up " : "Down ") + Math.abs(delta) + " points on your recent average of " + prior + "%."}
            </p>

            <div className="breakdown" style={{ gridTemplateColumns: "repeat(" + (partial ? 3 : 2) + ",1fr)" }}>
                <div className="bd bd-ok"><strong>{result.score}</strong><span>Right</span></div>
                <div className="bd bd-no"><strong>{result.answered - result.score}</strong><span>Wrong</span></div>
                {partial && <div className="bd bd-off"><strong>{result.skipped}</strong><span>Blank</span></div>}
            </div>

            <div className="statline center">
                <span><b>{clock(result.ms)}</b><em>elapsed</em></span>
                <span><b>{result.answered ? clock(result.ms / result.answered) : "0:00"}</b><em>per question</em></span>
                <span><b>{result.total}</b><em>questions in the quiz</em></span>
            </div>

            {actions}

            <h2 className="sect-sm">Question by question</h2>
            <p className="sect-note">{result.missed} to look at again.</p>
            <div className="review">
                {result.rows.map((r, i) => (
                    <div className={"review-row " + (r.given === undefined ? "skip" : r.ok ? "ok" : "no")} key={i}>
                        <span className="review-n">{i + 1}</span>
                        <span className="review-q">{r.q}</span>
                        <span className="review-a">
                            {r.given === undefined
                                ? <>Left blank · answer: <b>{r.correctText}</b></>
                                : <>Yours: <b className={r.ok ? "yours-ok" : "yours-no"}>{r.givenText}</b>{!r.ok && <> · answer: <b>{r.correctText}</b></>}</>}
                        </span>
                        {settings.showExplanations && r.explain ? <span className="review-x">{r.explain}</span> : null}
                    </div>
                ))}
            </div>

            {actions}
        </main>
    );
}

/* ═══ new quiz: import first, by hand second ════════════════════ */

function NewQuiz({ mode, setMode, onSaveImported, onSaveManual, onCancel, toast }) {
    return (
        <main className="page">
            <h1 className="view-title">New quiz</h1>
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
    const questions = parsed.reduce((n, z) => n + z.questions.length, 0);
    const problems = parsed.reduce((n, z) => n + z.errors.length, 0);

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
            <p className="sect-note">Most quizzes come from the Library. Download a <code>.txt</code> there, then upload or paste it here. Several quizzes in one paste are fine.</p>

            <div className="actions tight">
                <button className="btn btn-fill" onClick={() => fileRef.current && fileRef.current.click()}>Upload a .txt</button>
                <a className="btn" href="../library/">Open the Library</a>
                <button className="btn btn-quiet" onClick={() => setText(SAMPLE_PASTE)}>Paste an example</button>
                <input type="file" accept=".txt,text/plain" ref={fileRef} onChange={pick} hidden />
            </div>

            <label className="field">
                <span>Or paste the text</span>
                <textarea className="import-box mono" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder={"Title: ...\nDescription: ...\nClass: ...\nSemester: ...\n\nQ: ...\nA. ...\n*B. ...\nExplain: ..."} />
            </label>

            <div className="parse-note">
                {!text.trim() ? "Nothing to read yet."
                    : parsed.length ? (
                        <>
                            Read <b>{parsed.length}</b> {parsed.length === 1 ? "quiz" : "quizzes"} and <b>{questions}</b> questions.
                            {parsed.map((z, i) => (
                                <div key={i}>· {z.title} — {z.questions.length} questions{z.cls ? " · " + z.cls : ""}{z.errors.length ? " · " + z.errors.length + " to fix" : ""}</div>
                            ))}
                            {problems > 0 && parsed.map((z) => z.errors.map((e, k) => <div key={z.title + k} className="q-edit-warn">{e}</div>))}
                        </>
                    ) : <>No questions found. Each one needs a <b>Q:</b> line, its options as <b>A.</b> to <b>H.</b>, and an asterisk on the correct one.</>}
            </div>

            <div className="ai-panel">
                <div className="row-txt">
                    <b>Making a quiz with an AI</b>
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
                <button className="btn btn-fill" disabled={!parsed.length || problems > 0} onClick={() => onSave(parsed)}>
                    {parsed.length > 1 ? "Save " + parsed.length + " quizzes" : "Save quiz"}
                </button>
                {problems > 0 && <span className="act-hint">Fix the lines above first</span>}
                <button className="btn btn-quiet" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
}

/* ═══ editor ════════════════════════════════════════════════════ */

function blankQuestion() {
    return normalizeQuestion({ q: "", options: ["", "", "", ""], correct: 0, explain: "" });
}

function Editor({ initial, onSave, onCancel, toast, bare }) {
    const [quiz, setQuiz] = useState(() =>
        initial
            ? JSON.parse(JSON.stringify(initial))
            : { id: null, title: "", description: "", cls: "", semester: "", autoShuffle: false, questions: [blankQuestion()] }
    );
    const endRef = useRef(null);
    const field = (k) => (e) => setQuiz({ ...quiz, [k]: e.target.value });

    function editQ(i, patch) {
        const questions = [...quiz.questions];
        questions[i] = { ...questions[i], ...patch };
        setQuiz({ ...quiz, questions });
    }
    function editOpt(i, oi, value) {
        const options = [...quiz.questions[i].options];
        options[oi] = value;
        editQ(i, { options });
    }
    function addOpt(i) {
        const q = quiz.questions[i];
        if (q.options.length >= MAX_OPTIONS) return toast("Eight options is the most a question can have");
        editQ(i, { options: [...q.options, ""] });
    }
    function dropOpt(i, oi) {
        const q = quiz.questions[i];
        if (q.options.length <= MIN_OPTIONS) return toast("A question needs at least two options");
        const options = q.options.filter((_, k) => k !== oi);
        let correct = q.correct;
        if (correct === oi) correct = 0;
        else if (correct > oi) correct -= 1;
        editQ(i, { options, correct });
    }
    function act(i, what) {
        const questions = [...quiz.questions];
        if (what === "up" && i > 0) [questions[i - 1], questions[i]] = [questions[i], questions[i - 1]];
        if (what === "down" && i < questions.length - 1) [questions[i + 1], questions[i]] = [questions[i], questions[i + 1]];
        if (what === "dup") questions.splice(i + 1, 0, normalizeQuestion({ ...questions[i], id: null, reps: 0, hits: 0 }));
        if (what === "del") {
            if (questions.length === 1) return toast("A quiz needs at least one question");
            questions.splice(i, 1);
        }
        setQuiz({ ...quiz, questions });
    }
    function add() {
        setQuiz({ ...quiz, questions: [...quiz.questions, blankQuestion()] });
        setTimeout(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "center" }); }, 0);
    }
    function save() {
        const title = quiz.title.trim();
        if (!title) return toast("Give the quiz a title");
        const questions = quiz.questions
            .map((q) => ({ ...q, q: q.q.trim(), options: q.options.map((o) => o.trim()) }))
            .filter((q) => q.q || q.options.some(Boolean));
        if (!questions.length) return toast("Write at least one question");
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.q) return toast("Question " + (i + 1) + " has no prompt");
            const filled = q.options.filter(Boolean);
            if (filled.length < MIN_OPTIONS) return toast("Question " + (i + 1) + " needs at least two options");
            if (q.options.some((o) => !o)) return toast("Question " + (i + 1) + " has a blank option");
            if (q.correct < 0 || q.correct >= q.options.length) return toast("Question " + (i + 1) + " has no correct answer marked");
        }
        onSave({ ...quiz, title, questions });
    }

    const body = (
        <div>
            <div className="grid2">
                <label className="field"><span>Quiz title</span><input type="text" value={quiz.title} placeholder="The Krebs Cycle" onChange={field("title")} /></label>
                <label className="field"><span>Class</span><input type="text" value={quiz.cls} placeholder="BIOSC 0350" onChange={field("cls")} /></label>
            </div>
            <div className="grid2">
                <label className="field"><span>Description</span><input type="text" value={quiz.description} placeholder="One sentence on what the quiz covers." onChange={field("description")} /></label>
                <label className="field"><span>Semester</span><input type="text" value={quiz.semester} placeholder="Fall 2026" onChange={field("semester")} /></label>
            </div>

            <h2 className="sect-sm">Questions</h2>
            <p className="sect-note">{quiz.questions.length} {quiz.questions.length === 1 ? "question" : "questions"}. Mark one option as the answer.</p>

            {quiz.questions.map((q, i) => (
                <div className="card-edit" key={q.id}>
                    <div className="card-edit-top">
                        <span className="card-edit-n mono">Question {i + 1}</span>
                        <span className="card-edit-tools">
                            <button className="icon" disabled={i === 0} onClick={() => act(i, "up")} aria-label="Move up">↑</button>
                            <button className="icon" disabled={i === quiz.questions.length - 1} onClick={() => act(i, "down")} aria-label="Move down">↓</button>
                            <button className="icon" onClick={() => act(i, "dup")} aria-label="Duplicate">⧉</button>
                            <button className="icon" onClick={() => act(i, "del")} aria-label="Delete question">✕</button>
                        </span>
                    </div>

                    <label className="field"><span>Prompt</span><textarea value={q.q} onChange={(e) => editQ(i, { q: e.target.value })} /></label>

                    <p className="sect-note" style={{ margin: "14px 0 8px" }}>Options</p>
                    {q.options.map((opt, oi) => (
                        <div className="opt-edit" key={oi}>
                            <span className="opt-letter">{letter(oi)}</span>
                            <input type="text" value={opt} placeholder={"Option " + letter(oi)} onChange={(e) => editOpt(i, oi, e.target.value)} />
                            <button className={"mark-right" + (q.correct === oi ? " on" : "")} onClick={() => editQ(i, { correct: oi })}
                                aria-pressed={q.correct === oi}>
                                {q.correct === oi ? "Answer" : "Mark"}
                            </button>
                            <button className="icon" onClick={() => dropOpt(i, oi)} aria-label={"Remove option " + letter(oi)}>✕</button>
                        </div>
                    ))}
                    <div className="actions tight" style={{ marginTop: 10 }}>
                        <button className="btn btn-tiny" onClick={() => addOpt(i)}>+ Add an option</button>
                    </div>

                    <label className="field"><span>Explanation</span><textarea value={q.explain} placeholder="One sentence on why the answer is right." onChange={(e) => editQ(i, { explain: e.target.value })} /></label>
                </div>
            ))}
            <div ref={endRef} />

            <div className="actions">
                <button className="btn" onClick={add}>+ Add a question</button>
                <button className="btn btn-fill" onClick={save}>Save quiz</button>
                <button className="btn btn-quiet" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );

    if (bare) return body;
    return (
        <main className="page">
            <h1 className="view-title">{initial ? "Edit quiz" : "New quiz"}</h1>
            {body}
        </main>
    );
}

/* ═══ settings ══════════════════════════════════════════════════ */

const TOGGLES = [
    ["immediateFeedback", "Mark each answer as you go", "Off holds every result back until the end, and answers stay changeable."],
    ["showExplanations", "Show explanations", "The Explain line from each question, after it is marked."],
    ["shuffleQuestions", "Shuffle questions by default", "A quiz with its own shuffle switch on always shuffles, whatever this says."],
    ["shuffleOptions", "Shuffle the options too", "Reorders A to D within each question."],
    ["showTimer", "Show a timer", "Counts up while you work through a quiz."],
    ["keyboardShortcuts", "Keyboard shortcuts", "Letter or number keys pick an option, Enter submits, arrows move."]
];

function Settings({ settings, quizzes, stats, onChange, onReset, onExportAll, onClearProgress, onClearAll }) {
    const questions = quizzes.reduce((n, z) => n + z.questions.length, 0);
    const attempts = Object.keys(stats).reduce((n, k) => n + (stats[k].attempts || 0), 0);
    return (
        <main className="page">
            <h1 className="view-title">Settings</h1>
            <p className="sect-note">Quizzes and results live on this device only.</p>

            <div className="rows">
                {TOGGLES.map(([k, title, note]) => (
                    <div className="row" key={k}>
                        <div className="row-txt"><b>{title}</b><span>{note}</span></div>
                        <button className="switch" role="switch" aria-checked={!!settings[k]} aria-label={title}
                            onClick={() => onChange({ ...settings, [k]: !settings[k] })} />
                    </div>
                ))}
                <div className="row">
                    <div className="row-txt"><b>Question text size</b><span>Scales the prompt on the question panel.</span></div>
                    <div className="seg">
                        {[["small", "Small"], ["normal", "Normal"], ["large", "Large"]].map(([v, l]) => (
                            <button key={v} aria-pressed={settings.fontSize === v} onClick={() => onChange({ ...settings, fontSize: v })}>{l}</button>
                        ))}
                    </div>
                </div>
            </div>

            <h2 className="sect-sm">Your data</h2>
            <p className="sect-note">{quizzes.length} quizzes, {questions} questions, {attempts} attempts recorded.</p>
            <div className="rows">
                <div className="row">
                    <div className="row-txt"><b>Export all quizzes</b><span>One <code>.txt</code> per quiz, in the format the Library uses.</span></div>
                    <button className="btn" onClick={onExportAll}>Export all</button>
                </div>
                <div className="row">
                    <div className="row-txt"><b>Reset all progress</b><span>Keeps every quiz, clears scores and per-question history.</span></div>
                    <button className="btn danger" onClick={onClearProgress}>Reset</button>
                </div>
                <div className="row">
                    <div className="row-txt"><b>Clear the library</b><span>Deletes every quiz and its questions. Cannot be undone.</span></div>
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
    const [quizzes, setQuizzes] = useState([]);
    const [stats, setStats] = useState({});
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);

    const [view, setView] = useState("shelf");
    const [sheetId, setSheetId] = useState(null);
    const [editId, setEditId] = useState(null);
    const [newMode, setNewMode] = useState("import");
    const [cameFrom, setCameFrom] = useState("shelf");
    const [run, setRun] = useState(null);
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

    /* the text-size setting rides on the body so one variable drives it */
    useEffect(() => {
        document.body.className = "fs-" + (settings.fontSize || "normal");
    }, [settings.fontSize]);

    /* ── load ───────────────────────────────────────────────────── */
    useEffect(() => {
        (async function load() {
            try {
                const s = await store.get(SETTINGS_KEY);
                if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s.value) });
            } catch (e) {}

            let loaded = [];
            try {
                /* Read every quiz-ish key, remembering which key each came from.
                   Saves always write to quiz:<id>, so a quiz read from any other
                   key would come back as a second copy on the next load.
                   Everything is collapsed to one quiz per id and rewritten under
                   its canonical key, and stale keys are removed. */
                const all = await store.list("");
                const quizKeys = all.keys.filter((k) => /^quiz(zes)?:/.test(k));
                const found = [];
                for (const k of quizKeys) {
                    try {
                        const r = await store.get(k);
                        if (!r) continue;
                        const val = JSON.parse(r.value);
                        if (Array.isArray(val)) val.forEach((z) => found.push({ key: k, quiz: normalizeQuiz(z) }));
                        else if (val && val.questions) found.push({ key: k, quiz: normalizeQuiz(val) });
                    } catch (e) {}
                }
                if (!found.length) {
                    for (const k of LEGACY_KEYS) {
                        const r = await store.get(k);
                        if (!r) continue;
                        try {
                            const arr = JSON.parse(r.value);
                            if (Array.isArray(arr) && arr.length) {
                                arr.forEach((z) => found.push({ key: k, quiz: normalizeQuiz(z) }));
                                break;
                            }
                        } catch (e) {}
                    }
                }

                const better = (a, b) => {
                    if (a.quiz.questions.length !== b.quiz.questions.length) return a.quiz.questions.length > b.quiz.questions.length ? a : b;
                    return (a.quiz.lastOpenedAt || 0) >= (b.quiz.lastOpenedAt || 0) ? a : b;
                };
                const byId = {};
                found.forEach((entry) => {
                    const id = entry.quiz.id;
                    byId[id] = byId[id] ? better(byId[id], entry) : entry;
                });
                const sig = (z) => (z.title || "").trim().toLowerCase() + "|" + z.questions.length + "|" + (z.questions[0] ? z.questions[0].q.trim().toLowerCase() : "");
                const bySig = {};
                Object.keys(byId).forEach((id) => {
                    const entry = byId[id], k = sig(entry.quiz);
                    bySig[k] = bySig[k] ? better(bySig[k], entry) : entry;
                });

                const keep = Object.keys(bySig).map((k) => bySig[k]);
                const canonical = {};
                keep.forEach(({ quiz }) => { canonical[QUIZ_PREFIX + quiz.id] = true; });
                for (const k of quizKeys) if (!canonical[k]) await store.delete(k);
                for (const { key, quiz } of keep) {
                    if (key !== QUIZ_PREFIX + quiz.id) await store.set(QUIZ_PREFIX + quiz.id, JSON.stringify(quiz));
                }
                loaded = keep.map(({ quiz }) => quiz);
            } catch (e) {}

            if (!loaded.length) {
                loaded = [SAMPLE_QUIZ];
                await store.set(QUIZ_PREFIX + SAMPLE_QUIZ.id, JSON.stringify(SAMPLE_QUIZ));
            }
            setQuizzes(loaded);

            try {
                const list = await store.list(STATS_PREFIX);
                const next = {};
                for (const k of list.keys) {
                    const r = await store.get(k);
                    if (r) next[k.slice(STATS_PREFIX.length)] = { recent: [], ...JSON.parse(r.value) };
                }
                setStats(next);
            } catch (e) {}

            setReady(true);
        })();
    }, []);

    /* ── persist ────────────────────────────────────────────────── */
    const saveQuiz = useCallback(async (quiz) => {
        setQuizzes((prev) => {
            const i = prev.findIndex((z) => z.id === quiz.id);
            if (i < 0) return [...prev, quiz];
            const copy = [...prev]; copy[i] = quiz; return copy;
        });
        await store.set(QUIZ_PREFIX + quiz.id, JSON.stringify(quiz));
    }, []);

    const saveSettings = useCallback(async (next) => {
        setSettings(next);
        await store.set(SETTINGS_KEY, JSON.stringify(next));
    }, []);

    const quiz = quizzes.find((z) => z.id === sheetId) || null;

    function openSheet(id) { setSheetId(id); setView("sheet"); window.scrollTo(0, 0); }
    function goShelf() { setView("shelf"); window.scrollTo(0, 0); }

    /* ── quiz actions ───────────────────────────────────────────── */
    async function removeQuiz(id) {
        const z = quizzes.find((x) => x.id === id);
        if (!z) return;
        const yes = await confirmAsk("Delete “" + z.title + "”?", "All " + z.questions.length + " questions and this quiz's results go with it. This cannot be undone.");
        if (!yes) return;
        setQuizzes((prev) => prev.filter((x) => x.id !== id));
        await store.delete(QUIZ_PREFIX + id);
        await store.delete(STATS_PREFIX + id);
        setStats((prev) => { const n = { ...prev }; delete n[id]; return n; });
        goShelf(); toast("Quiz deleted");
    }

    async function resetQuizProgress(id) {
        const z = quizzes.find((x) => x.id === id);
        if (!z) return;
        const yes = await confirmAsk("Reset progress on this quiz?", "Scores, attempts, and the per-question history are cleared. The questions themselves stay.", "Reset");
        if (!yes) return;
        await saveQuiz({ ...z, questions: z.questions.map((q) => ({ ...q, reps: 0, hits: 0 })) });
        await store.delete(STATS_PREFIX + id);
        setStats((prev) => { const n = { ...prev }; delete n[id]; return n; });
        toast("Progress reset");
    }

    function toggleQuizShuffle(id) {
        const z = quizzes.find((x) => x.id === id);
        if (z) saveQuiz({ ...z, autoShuffle: !z.autoShuffle });
    }

    function exportQuiz(z) { download(slug(z.title) + ".txt", toText(z)); toast("Quiz exported"); }
    function exportAll() {
        if (!quizzes.length) return toast("Nothing to export");
        quizzes.forEach((z, i) => setTimeout(() => download(slug(z.title) + ".txt", toText(z)), i * 120));
        toast(quizzes.length + " files exported");
    }

    async function saveImported(list) {
        let last = null;
        for (const p of list) {
            const z = normalizeQuiz({ id: newId(), title: p.title, description: p.description, cls: p.cls, semester: p.semester, created: Date.now(), questions: p.questions });
            await saveQuiz(z); last = z;
        }
        toast(list.length > 1 ? list.length + " quizzes imported" : "Quiz imported");
        if (list.length === 1 && last) openSheet(last.id); else goShelf();
    }

    async function saveEdited(draft) {
        const existing = quizzes.find((z) => z.id === draft.id);
        const z = normalizeQuiz({
            ...draft,
            id: draft.id || newId(),
            created: existing ? existing.created : Date.now(),
            lastOpenedAt: existing ? existing.lastOpenedAt : null
        });
        if (existing) {
            const byId = {};
            existing.questions.forEach((q) => { byId[q.id] = q; });
            z.questions = z.questions.map((q) => (byId[q.id] ? { ...q, reps: byId[q.id].reps, hits: byId[q.id].hits } : q));
        }
        await saveQuiz(z);
        setEditId(null);
        toast("Quiz saved");
        openSheet(z.id);
    }

    /* ── taking ─────────────────────────────────────────────────── */
    function buildRun(z, startAt, onlyIds, titleSuffix) {
        let questions = (onlyIds ? z.questions.filter((q) => onlyIds.indexOf(q.id) !== -1) : z.questions)
            .map((q) => ({ ...q, options: [...q.options] }));
        if (!questions.length) return null;

        if (startAt == null && !onlyIds) {
            if (settings.shuffleOptions) {
                questions = questions.map((q) => {
                    const paired = q.options.map((opt, idx) => ({ opt, idx }));
                    const mixed = shuffle(paired);
                    return { ...q, options: mixed.map((x) => x.opt), correct: mixed.findIndex((x) => x.idx === q.correct) };
                });
            }
            if (z.autoShuffle || settings.shuffleQuestions) questions = shuffle(questions);
        }
        const at = startAt == null ? 0 : Math.min(Math.max(startAt, 0), questions.length - 1);
        return {
            quizId: z.id,
            title: z.title + (titleSuffix || ""),
            scored: !onlyIds,
            questions,
            at,
            answers: [],
            picked: null,
            checked: false,
            t0: Date.now()
        };
    }

    function startQuiz(id, startAt, onlyIds, suffix) {
        const z = quizzes.find((x) => x.id === id);
        if (!z || !z.questions.length) return toast("This quiz has no questions yet");
        const next = buildRun(z, startAt, onlyIds, suffix);
        if (!next) return toast("Nothing left to answer");
        saveQuiz({ ...z, lastOpenedAt: Date.now() });
        setRun(next);
        setSheetId(id);
        setView("take");
        window.scrollTo(0, 0);
    }

    const pick = useCallback((oi) => setRun((r) => {
        if (!r) return r;
        /* an answer is only locked when it has already been marked */
        if (settings.immediateFeedback && r.answers[r.at] !== undefined) return r;
        return { ...r, picked: oi };
    }), [settings.immediateFeedback]);

    /* the primary next button: forward, or back to whatever is still blank */
    const advance = useCallback(() => setRun((r) => {
        if (!r) return r;
        let to = -1;
        if (r.at + 1 < r.questions.length) to = r.at + 1;
        else for (let i = 0; i < r.questions.length; i++) if (r.answers[i] === undefined) { to = i; break; }
        if (to === -1) return r;
        return { ...r, at: to, picked: r.answers[to] === undefined ? null : r.answers[to], checked: false };
    }), []);

    const goQ = useCallback((i) => setRun((r) => {
        if (!r) return r;
        const at = Math.min(Math.max(i, 0), r.questions.length - 1);
        return { ...r, at, picked: r.answers[at] === undefined ? null : r.answers[at], checked: false };
    }), []);

    function submit() {
        const r = run;
        if (!r || r.picked === null) return;
        const at = r.at;
        const q = r.questions[at];
        const first = r.answers[at] === undefined;
        const answers = [...r.answers];
        answers[at] = r.picked;

        /* per-question history, so the detail page can show what is shaky */
        if (first) {
            const z = quizzes.find((x) => x.id === r.quizId);
            if (z) {
                const ok = r.picked === q.correct;
                saveQuiz({
                    ...z,
                    questions: z.questions.map((x) => x.id === q.id
                        ? { ...x, reps: (x.reps || 0) + 1, hits: (x.hits || 0) + (ok ? 1 : 0) }
                        : x)
                });
            }
        }

        const next = { ...r, answers, checked: true };
        if (settings.immediateFeedback) { setRun(next); return; }

        /* without immediate feedback, saving moves straight on */
        let to = -1;
        for (let i = at + 1; i < r.questions.length; i++) if (answers[i] === undefined) { to = i; break; }
        if (to === -1) for (let i = 0; i < at; i++) if (answers[i] === undefined) { to = i; break; }
        if (to === -1) {
            /* everything is answered: finish from the last question, otherwise
               just step on and let the See results button do it */
            if (at + 1 >= r.questions.length) { finish({ ...next, checked: false }); return; }
            setRun({ ...next, at: at + 1, picked: answers[at + 1] === undefined ? null : answers[at + 1], checked: false });
            return;
        }
        setRun({ ...next, at: to, picked: null, checked: false });
    }

    function finish(state) {
        const r = state || run;
        if (!r) return goShelf();
        const total = r.questions.length;
        const answered = r.answers.filter((a) => a !== undefined).length;
        const score = r.questions.reduce((n, q, i) => n + (r.answers[i] === q.correct ? 1 : 0), 0);
        const percent = answered ? Math.round((score / answered) * 100) : 0;
        const ms = Date.now() - r.t0;

        const rows = r.questions.map((q, i) => ({
            q: q.q,
            id: q.id,
            given: r.answers[i],
            givenText: r.answers[i] !== undefined ? letter(r.answers[i]) + ". " + q.options[r.answers[i]] : "",
            correctText: letter(q.correct) + ". " + q.options[q.correct],
            ok: r.answers[i] === q.correct,
            explain: q.explain
        }));
        const missedIds = rows.filter((x) => !x.ok).map((x) => x.id);

        if (answered && r.scored) recordAttempt(r.quizId, score, answered, ms, percent);

        setRun(null);
        if (!answered) { goShelf(); return; }
        setResult({
            quizId: r.quizId, title: r.title, total, answered, score, percent,
            skipped: total - answered, missed: missedIds.length, missedIds, ms, rows
        });
        setView("results");
        window.scrollTo(0, 0);
    }

    async function recordAttempt(quizId, score, total, ms, percent) {
        const prev = stats[quizId] || { attempts: 0, bestPercent: 0, lastPercent: 0, lastTakenAt: 0, recent: [] };
        const next = {
            attempts: (prev.attempts || 0) + 1,
            bestPercent: Math.max(prev.bestPercent || 0, percent),
            lastPercent: percent,
            lastTakenAt: Date.now(),
            recent: [{ score, total, percent, takenAt: Date.now(), elapsedMs: ms }, ...(prev.recent || [])].slice(0, 10)
        };
        setStats((p) => ({ ...p, [quizId]: next }));
        await store.set(STATS_PREFIX + quizId, JSON.stringify(next));
    }

    async function quitRun() {
        const yes = await confirmAsk("Quit without scoring?", "This attempt is discarded and nothing is recorded.", "Quit");
        if (!yes) return;
        setRun(null); goShelf();
    }

    async function clearProgress() {
        const yes = await confirmAsk("Reset all progress?", "Scores, attempts, and per-question history are cleared across every quiz. The quizzes stay.", "Reset");
        if (!yes) return;
        for (const z of quizzes) await saveQuiz({ ...z, questions: z.questions.map((q) => ({ ...q, reps: 0, hits: 0 })) });
        for (const id of Object.keys(stats)) await store.delete(STATS_PREFIX + id);
        setStats({});
        toast("Progress reset");
    }

    async function clearLibrary() {
        const yes = await confirmAsk("Clear the whole library?", "All " + quizzes.length + " quizzes and every question in them are deleted from this device. This cannot be undone.", "Clear everything");
        if (!yes) return;
        for (const z of quizzes) await store.delete(QUIZ_PREFIX + z.id);
        for (const id of Object.keys(stats)) await store.delete(STATS_PREFIX + id);
        setQuizzes([]); setStats({});
        goShelf(); toast("Library cleared");
    }

    /* ── keys ───────────────────────────────────────────────────── */
    useEffect(() => {
        function onKey(e) {
            const tag = e.target && e.target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { if (e.key === "Escape") e.target.blur(); return; }
            if (ask) { if (e.key === "Escape") settleAsk(false); return; }

            if (view === "take" && run) {
                if (!settings.keyboardShortcuts) return;
                const q = run.questions[run.at];
                const locked = run.answers[run.at] !== undefined && settings.immediateFeedback;

                if (!locked && /^[1-9]$/.test(e.key)) {
                    const i = parseInt(e.key, 10) - 1;
                    if (i < q.options.length) { e.preventDefault(); pick(i); }
                    return;
                }
                const k = e.key.toLowerCase();
                if (!locked && /^[a-h]$/.test(k)) {
                    const i = k.charCodeAt(0) - 97;
                    if (i < q.options.length) { e.preventDefault(); pick(i); }
                    return;
                }
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (locked || run.checked) advance(); else submit();
                    return;
                }
                if (e.key === "ArrowLeft") { e.preventDefault(); goQ(run.at - 1); return; }
                if (e.key === "ArrowRight") { e.preventDefault(); goQ(run.at + 1); return; }
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

    /* ── chrome: back control top-left, aligned with the content ── */
    const RETURN_LABEL = { take: "← Back to the quiz", sheet: "← Back to the quiz", new: "← Back", results: "← Back", shelf: "← Shelf" };

    let back = { label: "← Programs", href: "../" };
    if (view === "take" && run) back = { label: "← Finish now", run: () => finish(null) };
    else if (view === "settings") back = { label: RETURN_LABEL[cameFrom] || "← Shelf", run: () => setView(cameFrom) };
    else if (view === "sheet" || view === "results" || view === "new") back = { label: "← Shelf", run: goShelf };
    else if (view === "edit") back = { label: "← Back", run: () => { setEditId(null); sheetId ? openSheet(sheetId) : goShelf(); } };

    const context = view === "sheet" && quiz ? "Quiz details" : view === "settings" ? "Settings" : "";
    const progress = run ? (run.answers.filter((a) => a !== undefined).length / run.questions.length) * 100 : view === "results" ? 100 : 0;

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
                    quizzes={quizzes} query={query} setQuery={setQuery} cls={cls} setCls={setCls} sort={sort} setSort={setSort}
                    onTake={(id) => startQuiz(id)}
                    onDetails={openSheet}
                    onNew={() => { setEditId(null); setSheetId(null); setNewMode("import"); setView("new"); }}
                />
            ) : view === "sheet" && quiz ? (
                <Sheet
                    quiz={quiz} stats={stats}
                    onTake={(id) => startQuiz(id)}
                    onTakeAt={(id, i) => startQuiz(id, i)}
                    onEdit={(id) => { setEditId(id); setView("edit"); }}
                    onExport={exportQuiz}
                    onResetProgress={resetQuizProgress}
                    onDelete={removeQuiz}
                    onToggleShuffle={toggleQuizShuffle}
                />
            ) : view === "take" && run ? (
                <Take
                    run={run} settings={settings}
                    onPick={pick} onSubmit={submit} onGo={goQ} onAdvance={advance} onFinish={() => finish(null)} onQuit={quitRun}
                />
            ) : view === "results" && result ? (
                <Results
                    result={result} stats={stats} settings={settings}
                    onRetry={() => startQuiz(result.quizId)}
                    onRetryMissed={() => startQuiz(result.quizId, null, result.missedIds, " — missed")}
                    onSheet={() => openSheet(result.quizId)}
                    onShelf={goShelf}
                />
            ) : view === "new" ? (
                <NewQuiz
                    mode={newMode} setMode={setNewMode}
                    onSaveImported={saveImported}
                    onSaveManual={saveEdited}
                    onCancel={goShelf}
                    toast={toast}
                />
            ) : view === "edit" ? (
                <Editor
                    initial={editId ? quizzes.find((z) => z.id === editId) : null}
                    onSave={saveEdited}
                    onCancel={() => { setEditId(null); sheetId ? openSheet(sheetId) : goShelf(); }}
                    toast={toast}
                />
            ) : view === "settings" ? (
                <Settings
                    settings={settings} quizzes={quizzes} stats={stats}
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
