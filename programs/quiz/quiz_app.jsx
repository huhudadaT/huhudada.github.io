import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { Plus, Trash2, Play, Edit3, Check, X, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, RotateCcw, BookOpen, Trophy, FileText, Sparkles, Upload, Wand2, Settings, Shuffle, Info, ChevronDown, ChevronUp, Copy, Download, Search, BarChart3, Archive, Target, Clock, Moon } from "lucide-react";

// ============ LOCAL STORAGE SHIM ============
// Drop-in replacement for the artifact's window.storage, backed by localStorage.
// Namespaced per app so a shared origin (e.g. a sibling flashcard app) won't collide.
const STORE_PREFIX = "quizzical:";
if (typeof window !== "undefined") {
  window.storage = {
    async get(key) {
      try {
        const raw = localStorage.getItem(STORE_PREFIX + key);
        return raw === null ? null : { key, value: raw };
      } catch (e) { return null; }
    },
    async set(key, value) {
      localStorage.setItem(STORE_PREFIX + key, value);
      return { key, value };
    },
    async delete(key) {
      try { localStorage.removeItem(STORE_PREFIX + key); } catch (e) {}
      return { key, deleted: true };
    },
    async list(prefix = "") {
      const keys = [];
      const full = STORE_PREFIX + prefix;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(full) === 0) keys.push(k.slice(STORE_PREFIX.length));
        }
      } catch (e) {}
      return { keys };
    },
  };
}

// ============ AI INSTRUCTIONS (mirrored from ai_instructions.md) ============
const AI_INSTRUCTIONS = `Generate EXAM-STYLE multiple-choice questions. Every quiz should feel like it belongs on a real test — serious, precise, and designed to genuinely measure whether someone understands the material.

QUIZ TITLE AND DESCRIPTION — always include these, before any questions:

- Every quiz MUST begin with a Title line and a Description line, in that order, before the questions. They are required, not optional.

- Title: a short, specific title in Title Case. Name the actual subject (e.g., "The French Revolution", "JavaScript Closures"). Title Case, no surrounding quotes, no trailing punctuation, under about 60 characters. Prefer a real subject over a vague label.

- Description: exactly one sentence stating what the quiz covers, ending in a period. Plain and informative — no marketing language, no "This quiz will test you on…" filler.

QUESTION QUALITY REQUIREMENTS — these are critical:

- Exam-style voice. Write questions the way a real test or textbook assessment would write them. Formal, direct, measured. No conversational filler, no hedging, no "let's see if you know."

- Concise phrasing. Go straight to the point. Strip out unnecessary setup, scene-setting, preamble, or flavor text. If a question can be asked in ten words instead of thirty, ask it in ten.

- Non-obvious correct answer. The right answer must NOT be obvious at a glance. A test-taker should have to actually think — recall a specific fact, apply a concept, reason from principles, or distinguish between closely related ideas. If someone can pick the answer correctly without knowing the material, the question has failed.

- Plausible distractors. Every wrong option must look credible. They should be the kinds of answers someone who half-knows the material would seriously consider. Avoid throwaway options, jokes, or obvious filler.

- "All of the above" and "None of the above" are allowed when they genuinely fit the question — when all the other options really are correct, or really aren't. Use them sparingly, not as a crutch.

- Broad coverage, moderate depth. Cover the topic broadly — touch different subtopics, different angles. But don't go to PhD-level obscurity. Test solid working knowledge, not trivia that only a specialist would know.

- Varied reasoning types. Mix it up across the quiz: definitions, application to scenarios, comparison between concepts, cause and effect, sequence or ordering, identifying exceptions, interpreting outcomes, recognizing misconceptions.

- Randomize correct-answer position. Don't default to any single slot. The correct answer should land in different positions roughly evenly across the quiz.

NUMBER OF OPTIONS:
- Default to 4 options per question — this is the typical case.
- You may use between 2 and 8 options when the material naturally calls for a different number (e.g. 2 for a true/false-style question, 5 or 6 for broader categorizations). Don't pad to 4 with weak distractors just to hit the default.

STRUCTURAL RULES:
- Between 2 and 8 options per question (4 is typical).
- Exactly one option must be marked as the correct answer.
- Every question must have a concise, informative explanation — one or two sentences.

TEST FOR EVERY QUESTION: "Does answering this correctly require actually knowing the material?" If yes, it's a good question. If a guesser could get it right through process of elimination against obviously wrong options, rewrite it.`;

// ============ DEFAULTS & STORAGE KEYS ============
const SETTINGS_KEY = "settings:main";
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;
const DEFAULT_SETTINGS = {
  shuffleQuestions: false,
  shuffleOptions: false,
  showExplanations: true,
  immediateFeedback: true,
  darkMode: false,
  showTimer: false,
  fontSize: "normal", // small | normal | large
  keyboardShortcuts: true,
};

const SAMPLE_QUIZ = {
  id: "sample-general-knowledge",
  title: "A Tour of General Knowledge (Sample Quiz)",
  description: "Ten questions spanning science, history, geography, literature, and the arts — a fair warm-up for any curious mind.",
  created: Date.now(),
  questions: [
    {
      q: "Which planet in our solar system has the most confirmed moons?",
      options: ["Jupiter", "Saturn", "Neptune", "Uranus"],
      correct: 1,
      explain: "Saturn overtook Jupiter in 2023 and now has over 140 confirmed moons."
    },
    {
      q: "In what year did the Berlin Wall fall?",
      options: ["1987", "1989", "1991", "1993"],
      correct: 1,
      explain: "The Berlin Wall fell on November 9, 1989, a pivotal moment in ending the Cold War."
    },
    {
      q: "What is the chemical symbol for gold?",
      options: ["Gd", "Go", "Au", "Ag"],
      correct: 2,
      explain: "Au comes from the Latin 'aurum,' meaning 'shining dawn.' Ag is silver."
    },
    {
      q: "Who painted 'The Starry Night'?",
      options: ["Claude Monet", "Pablo Picasso", "Vincent van Gogh", "Salvador Dalí"],
      correct: 2,
      explain: "Van Gogh painted it in June 1889 while staying at the Saint-Paul-de-Mausole asylum."
    },
    {
      q: "What is the longest river in the world?",
      options: ["Amazon", "Nile", "Yangtze", "Mississippi"],
      correct: 1,
      explain: "The Nile is traditionally considered the longest at about 6,650 km, though some studies argue the Amazon is longer."
    },
    {
      q: "Which element has the atomic number 1?",
      options: ["Helium", "Oxygen", "Hydrogen", "Carbon"],
      correct: 2,
      explain: "Hydrogen is the lightest and most abundant element in the universe."
    },
    {
      q: "Who wrote the play 'Romeo and Juliet'?",
      options: ["Christopher Marlowe", "William Shakespeare", "Ben Jonson", "John Webster"],
      correct: 1,
      explain: "Shakespeare wrote it early in his career, around 1594–1596."
    },
    {
      q: "What is the capital of Australia?",
      options: ["Sydney", "Melbourne", "Canberra", "Perth"],
      correct: 2,
      explain: "Canberra was purpose-built as the capital, a compromise between rival cities Sydney and Melbourne."
    },
    {
      q: "In Greek mythology, who flew too close to the sun?",
      options: ["Orpheus", "Icarus", "Perseus", "Theseus"],
      correct: 1,
      explain: "Icarus ignored his father Daedalus's warnings; the wax holding his wings together melted."
    },
    {
      q: "What does CPU stand for in computing?",
      options: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Controlled Power Unit"],
      correct: 0,
      explain: "The CPU is the primary component that executes instructions in a computer."
    }
  ]
};

// ============ UTILITIES ============
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function prepareQuizForTaking(quiz, settings) {
  let questions = quiz.questions.map(q => ({ ...q, options: [...q.options] }));

  if (settings.shuffleOptions) {
    questions = questions.map(q => {
      const indexed = q.options.map((opt, idx) => ({ opt, idx }));
      const shuffled = shuffle(indexed);
      const newCorrect = shuffled.findIndex(x => x.idx === q.correct);
      return { ...q, options: shuffled.map(x => x.opt), correct: newCorrect };
    });
  }
  if (settings.shuffleQuestions) {
    questions = shuffle(questions);
  }
  return { ...quiz, questions };
}

// ============ CONFIRM DIALOG (replaces native confirm(), which is blocked in some sandboxes) ============
const ConfirmContext = React.createContext(() => Promise.resolve(true));
function useConfirm() { return React.useContext(ConfirmContext); }

function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const confirm = useCallback((opts) => {
    const config = typeof opts === "string" ? { message: opts } : (opts || {});
    return new Promise((resolve) => setDialog({ ...config, resolve }));
  }, []);
  function close(val) {
    setDialog((d) => { if (d) d.resolve(val); return null; });
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(28,25,23,0.55)" }}
          onClick={() => close(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-stone-50 border-2 border-stone-900 max-w-md w-full p-6 fade-up"
            style={{ boxShadow: "6px 6px 0 rgba(28,25,23,0.9)" }}
          >
            <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-2">{dialog.title || "Please confirm"}</div>
            <p className="text-stone-800 mb-6 leading-relaxed">{dialog.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="border-2 border-stone-900 px-4 py-2 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors"
              >
                {dialog.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={() => close(true)}
                className={`px-4 py-2 mono text-xs uppercase tracking-widest text-white transition-colors ${dialog.danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-700 hover:bg-stone-900"}`}
              >
                {dialog.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// ============ MAIN APP ============
function QuizApp() {
  const [view, setView] = useState("home");
  const [createMode, setCreateMode] = useState("manual");
  const [quizzes, setQuizzes] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [originalQuiz, setOriginalQuiz] = useState(null);
  const [quizStartTime, setQuizStartTime] = useState(null);
  const [finalElapsedMs, setFinalElapsedMs] = useState(0);
  const [stats, setStats] = useState({});
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [userAnswers, setUserAnswers] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        try {
          const sr = await window.storage.get(SETTINGS_KEY);
          if (sr) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(sr.value) });
        } catch (e) {}

        const list = await window.storage.list("quiz:");
        if (list && list.keys && list.keys.length > 0) {
          const loaded = [];
          for (const key of list.keys) {
            try {
              const r = await window.storage.get(key);
              if (r) loaded.push(JSON.parse(r.value));
            } catch (e) {}
          }
          setQuizzes(loaded);
        } else {
          await window.storage.set("quiz:" + SAMPLE_QUIZ.id, JSON.stringify(SAMPLE_QUIZ));
          setQuizzes([SAMPLE_QUIZ]);
        }

        // Load stats
        try {
          const statsList = await window.storage.list("stats:");
          if (statsList && statsList.keys) {
            const s = {};
            for (const key of statsList.keys) {
              try {
                const r = await window.storage.get(key);
                if (r) s[key.replace(/^stats:/, "")] = JSON.parse(r.value);
              } catch (e) {}
            }
            setStats(s);
          }
        } catch (e) {}
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, []);

  async function saveSettings(next) {
    setSettings(next);
    try {
      await window.storage.set(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) {}
  }

  async function saveQuiz(quiz) {
    try {
      await window.storage.set("quiz:" + quiz.id, JSON.stringify(quiz));
      setQuizzes(prev => {
        const idx = prev.findIndex(q => q.id === quiz.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = quiz;
          return copy;
        }
        return [...prev, quiz];
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteQuiz(id) {
    try {
      await window.storage.delete("quiz:" + id);
      await window.storage.delete("stats:" + id);
    } catch (e) {}
    setQuizzes(prev => prev.filter(q => q.id !== id));
    setStats(prev => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function clearLibrary() {
    try {
      const list = await window.storage.list("quiz:");
      if (list && list.keys) {
        for (const key of list.keys) {
          await window.storage.delete(key);
        }
      }
      const statsList = await window.storage.list("stats:");
      if (statsList && statsList.keys) {
        for (const key of statsList.keys) {
          await window.storage.delete(key);
        }
      }
      setQuizzes([]);
      setStats({});
    } catch (e) {
      console.error(e);
    }
  }

  async function clearStats() {
    try {
      const statsList = await window.storage.list("stats:");
      if (statsList && statsList.keys) {
        for (const key of statsList.keys) {
          await window.storage.delete(key);
        }
      }
      setStats({});
    } catch (e) {}
  }

  async function recordAttempt(quizId, score, total, elapsedMs) {
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const now = Date.now();
    const key = "stats:" + quizId;
    let s = { attempts: 0, bestPercent: 0, lastPercent: 0, lastTakenAt: 0, recent: [] };
    try {
      const existing = await window.storage.get(key);
      if (existing) s = { recent: [], ...JSON.parse(existing.value) };
    } catch (e) {}
    s.attempts = (s.attempts || 0) + 1;
    s.bestPercent = Math.max(s.bestPercent || 0, percent);
    s.lastPercent = percent;
    s.lastTakenAt = now;
    s.recent = [{ score, total, percent, takenAt: now, elapsedMs: elapsedMs || 0 }, ...(s.recent || [])].slice(0, 10);
    try {
      await window.storage.set(key, JSON.stringify(s));
    } catch (e) {}
    setStats(prev => ({ ...prev, [quizId]: s }));
  }

  async function resetQuizStats(quizId) {
    try {
      await window.storage.delete("stats:" + quizId);
    } catch (e) {}
    setStats(prev => {
      const { [quizId]: _removed, ...rest } = prev;
      return rest;
    });
  }

  // Import one or more parsed quizzes (additive — assigns fresh ids). Returns count.
  async function importQuizzes(parsedQuizzes) {
    const now = Date.now();
    const toSave = parsedQuizzes.map((pz, idx) => ({
      id: "q-" + (now + idx),
      title: pz.title,
      description: pz.description || "",
      created: now + idx,
      questions: pz.questions.map(qq => ({ ...qq, options: [...qq.options] })),
    }));
    for (const qz of toSave) await saveQuiz(qz);
    return toSave.length;
  }

  function startQuiz(quiz) {
    const prepared = prepareQuizForTaking(quiz, settings);
    setOriginalQuiz(quiz);
    setActiveQuiz(prepared);
    setCurrentQuestion(0);
    setUserAnswers(new Array(prepared.questions.length).fill(undefined));
    setSelectedAnswer(null);
    setShowFeedback(false);
    setQuizStartTime(Date.now());
    setFinalElapsedMs(0);
    setView("take");
    // Record last-opened timestamp (not for the synthetic missed-retry)
    if (!quiz.isMissedRetry) {
      const updated = { ...quiz, lastOpenedAt: Date.now() };
      saveQuiz(updated);
    }
  }

  // Build a quiz of just the missed questions and start it
  function retryMissed() {
    if (!activeQuiz) return;
    const missed = activeQuiz.questions.filter((q, i) => userAnswers[i] !== q.correct);
    if (missed.length === 0) return;
    const missedQuiz = {
      ...activeQuiz,
      title: activeQuiz.title.endsWith(" — Missed") ? activeQuiz.title : activeQuiz.title + " — Missed",
      questions: missed,
      isMissedRetry: true
    };
    const prepared = prepareQuizForTaking(missedQuiz, settings);
    prepared.isMissedRetry = true;
    setActiveQuiz(prepared);
    setCurrentQuestion(0);
    setUserAnswers(new Array(prepared.questions.length).fill(undefined));
    setSelectedAnswer(null);
    setShowFeedback(false);
    setQuizStartTime(Date.now());
    setFinalElapsedMs(0);
    setView("take");
  }

  function finishQuiz(finalAnswers) {
    const elapsed = quizStartTime ? Date.now() - quizStartTime : 0;
    setFinalElapsedMs(elapsed);
    const score = finalAnswers.reduce((acc, ans, i) => acc + (ans === activeQuiz.questions[i].correct ? 1 : 0), 0);
    // Only record stats for a real attempt on the original quiz, not a "retry missed" run
    if (originalQuiz && !activeQuiz.isMissedRetry) {
      recordAttempt(originalQuiz.id, score, activeQuiz.questions.length, elapsed);
    }
    setView("results");
  }

  function submitAnswer() {
    if (selectedAnswer === null) return;
    // Record the answer at the current index
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestion] = selectedAnswer;
    setUserAnswers(newAnswers);

    if (settings.immediateFeedback) {
      setShowFeedback(true);
    } else {
      // No feedback — move forward immediately
      if (currentQuestion + 1 >= activeQuiz.questions.length) {
        // Check if every question has an answer; if not, go to first unanswered
        const firstMissing = newAnswers.findIndex(a => a === undefined);
        if (firstMissing === -1) {
          finishQuiz(newAnswers);
        } else {
          goToIndex(firstMissing, newAnswers);
        }
      } else {
        goToIndex(currentQuestion + 1, newAnswers);
      }
    }
  }

  // Helper for internal use after state updates — reads from newAnswers argument
  function goToIndex(index, answersSource) {
    const src = answersSource || userAnswers;
    const priorAnswer = src[index];
    setCurrentQuestion(index);
    setSelectedAnswer(priorAnswer !== undefined ? priorAnswer : null);
    setShowFeedback(settings.immediateFeedback && priorAnswer !== undefined);
  }

  function nextQuestion() {
    // Make sure answer is recorded (in case this is called after submit+feedback)
    const newAnswers = [...userAnswers];
    if (selectedAnswer !== null) {
      newAnswers[currentQuestion] = selectedAnswer;
      setUserAnswers(newAnswers);
    }

    if (currentQuestion + 1 >= activeQuiz.questions.length) {
      // At the end — if anything still unanswered, jump to it; otherwise finish
      const firstMissing = newAnswers.findIndex(a => a === undefined);
      if (firstMissing === -1) {
        finishQuiz(newAnswers);
      } else {
        goToIndex(firstMissing, newAnswers);
      }
    } else {
      goToIndex(currentQuestion + 1, newAnswers);
    }
  }

  function previousQuestion() {
    if (currentQuestion === 0) return;
    // Record current selection if one exists (so going back-then-forward doesn't lose it)
    const newAnswers = [...userAnswers];
    if (selectedAnswer !== null) {
      newAnswers[currentQuestion] = selectedAnswer;
      setUserAnswers(newAnswers);
    }
    goToIndex(currentQuestion - 1, newAnswers);
  }

  function computeScore() {
    return userAnswers.reduce((acc, ans, i) => {
      return acc + (ans === activeQuiz.questions[i].correct ? 1 : 0);
    }, 0);
  }

  const themeClass = settings.darkMode ? "dark" : "";
  const fontSize = settings.fontSize || "normal";

  return (
    <div className={`${themeClass} font-scale-${fontSize} min-h-screen bg-stone-50 text-stone-900`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .mono { font-family: 'JetBrains Mono', monospace; }
        .display { font-family: 'Fraunces', Georgia, serif; font-variation-settings: 'opsz' 144; }
        .body-text { font-family: 'Inter', system-ui, sans-serif; }

        /* ===== Font scale ===== */
        /* Three scales with a meaningful spread. Each one applies a CSS
           transform to the Tailwind text-* classes by overriding them in em,
           so all descendant sizes scale proportionally. */
        .font-scale-small { font-size: 13px; }
        .font-scale-normal { font-size: 16px; }
        .font-scale-large { font-size: 21px; }

        .font-scale-small .text-\\[10px\\] { font-size: 0.65em !important; line-height: 1em; }
        .font-scale-normal .text-\\[10px\\] { font-size: 0.625em !important; line-height: 1em; }
        .font-scale-large .text-\\[10px\\] { font-size: 0.52em !important; line-height: 1em; }

        .font-scale-small .text-xs, .font-scale-normal .text-xs, .font-scale-large .text-xs { font-size: 0.78em !important; line-height: 1.1em; }
        .font-scale-small .text-sm, .font-scale-normal .text-sm, .font-scale-large .text-sm { font-size: 0.9em !important; line-height: 1.4em; }
        .font-scale-small .text-base, .font-scale-normal .text-base, .font-scale-large .text-base { font-size: 1em !important; line-height: 1.5em; }
        .font-scale-small .text-lg, .font-scale-normal .text-lg, .font-scale-large .text-lg { font-size: 1.15em !important; line-height: 1.5em; }
        .font-scale-small .text-xl, .font-scale-normal .text-xl, .font-scale-large .text-xl { font-size: 1.3em !important; line-height: 1.4em; }
        .font-scale-small .text-2xl, .font-scale-normal .text-2xl, .font-scale-large .text-2xl { font-size: 1.55em !important; line-height: 1.3em; }
        .font-scale-small .text-3xl, .font-scale-normal .text-3xl, .font-scale-large .text-3xl { font-size: 1.9em !important; line-height: 1.2em; }
        .font-scale-small .text-4xl, .font-scale-normal .text-4xl, .font-scale-large .text-4xl { font-size: 2.3em !important; line-height: 1.15em; }
        .font-scale-small .text-5xl, .font-scale-normal .text-5xl, .font-scale-large .text-5xl { font-size: 2.9em !important; line-height: 1.1em; }
        .font-scale-small .text-6xl, .font-scale-normal .text-6xl, .font-scale-large .text-6xl { font-size: 3.6em !important; line-height: 1.05em; }
        .font-scale-small .text-7xl, .font-scale-normal .text-7xl, .font-scale-large .text-7xl { font-size: 4.4em !important; line-height: 1em; }
        .font-scale-small .text-8xl, .font-scale-normal .text-8xl, .font-scale-large .text-8xl { font-size: 5.75em !important; line-height: 1em; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.4s ease-out both; }
        .stagger-1 { animation-delay: 0.05s; }
        .stagger-2 { animation-delay: 0.1s; }
        .stagger-3 { animation-delay: 0.15s; }
        .stagger-4 { animation-delay: 0.2s; }
        @keyframes rot { to { transform: rotate(360deg); } }
        .rot { animation: rot 1s linear infinite; }

        /* ===== Dark mode overrides ===== */
        .dark { color-scheme: dark; }
        .dark.bg-stone-50, .dark .bg-stone-50 { background-color: #1c1917 !important; }
        .dark .bg-stone-100 { background-color: #292524 !important; }
        .dark .bg-white { background-color: #292524 !important; }
        .dark .bg-stone-900 { background-color: #f5f5f4 !important; color: #1c1917 !important; }
        .dark .bg-stone-800 { background-color: #44403c !important; }

        .dark.text-stone-900, .dark .text-stone-900 { color: #f5f5f4 !important; }
        .dark .text-stone-700 { color: #d6d3d1 !important; }
        .dark .text-stone-600 { color: #a8a29e !important; }
        .dark .text-stone-500 { color: #a8a29e !important; }
        .dark .text-stone-400 { color: #78716c !important; }
        .dark .text-stone-300 { color: #57534e !important; }
        .dark .text-stone-50 { color: #1c1917 !important; }

        .dark .border-stone-900 { border-color: #f5f5f4 !important; }
        .dark .border-stone-400 { border-color: #78716c !important; }
        .dark .border-stone-300 { border-color: #44403c !important; }
        .dark .border-stone-200 { border-color: #44403c !important; }
        .dark .divide-stone-900 > * + * { border-color: #f5f5f4 !important; }

        /* Header bar stays dark-readable */
        .dark header.bg-stone-50 { background-color: #1c1917 !important; }

        /* Hover states need to be sensible in dark */
        .dark .hover\\:bg-stone-100:hover { background-color: #292524 !important; }
        .dark .hover\\:bg-stone-200:hover { background-color: #44403c !important; }
        .dark .hover\\:bg-stone-900:hover { background-color: #f5f5f4 !important; color: #1c1917 !important; }

        /* Colored accent backgrounds — keep feedback legible */
        .dark .bg-emerald-50 { background-color: #064e3b !important; }
        .dark .bg-red-50 { background-color: #7f1d1d !important; }
        .dark .bg-amber-50 { background-color: #78350f !important; }
        .dark .text-emerald-700 { color: #34d399 !important; }
        .dark .text-red-700 { color: #fca5a5 !important; }
        .dark .text-red-600 { color: #fca5a5 !important; }
        .dark .text-amber-700 { color: #fbbf24 !important; }

        /* Inputs */
        .dark input, .dark textarea, .dark select { background-color: #292524 !important; color: #f5f5f4 !important; }
        .dark input::placeholder, .dark textarea::placeholder { color: #78716c !important; }
        .dark pre { background-color: #292524 !important; color: #d6d3d1 !important; }

        /* Cards that should stay dark in both light and dark modes —
           the Format Guide and the AI gradient card want to be dark
           accents against their surroundings regardless of theme. */
        .dark-card {
          background-color: #1c1917;
          color: #f5f5f4;
        }
        .dark .dark-card {
          background-color: #0c0a09;
          color: #f5f5f4;
        }
        .dark .dark-card .text-stone-300 { color: #d6d3d1 !important; }
        .dark .dark-card .text-stone-400 { color: #a8a29e !important; }

        .amber-gradient-card {
          background: linear-gradient(to bottom right, #b45309, #1c1917);
          color: #f5f5f4;
        }
        .dark .amber-gradient-card {
          background: linear-gradient(to bottom right, #92400e, #0c0a09);
          color: #f5f5f4;
        }

        /* The primary dark-bg cards in dark mode need inverse treatment */
        .dark .bg-gradient-to-br { background: linear-gradient(to bottom right, #78350f, #1c1917) !important; }

        @media (prefers-reduced-motion: reduce) { .fade-up { animation: none !important; } }
        *:focus-visible { outline: 2px solid #b45309; outline-offset: 2px; }
      `}</style>

      <ConfirmProvider>
      <header className="border-b-2 border-stone-900 bg-stone-50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => setView("home")} className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-stone-900 text-stone-50 flex items-center justify-center group-hover:bg-amber-600 transition-colors">
              <BookOpen size={18} />
            </div>
            <div className="text-left">
              <div className="display text-xl font-bold leading-none">Quizzical</div>
              <div className="mono text-[10px] text-stone-500 tracking-widest uppercase mt-1">{quizzes.length} {quizzes.length === 1 ? "quiz" : "quizzes"} · {Object.values(stats).reduce((sum, s) => sum + (s.attempts || 0), 0)} taken</div>
            </div>
          </button>
          <nav className="flex gap-1 flex-wrap justify-end">
            <NavButton active={view === "home"} onClick={() => setView("home")}>Home</NavButton>
            <NavButton active={view === "browse"} onClick={() => setView("browse")}>Library ({quizzes.length})</NavButton>
            <NavButton active={view === "create"} onClick={() => { setEditingQuiz(null); setCreateMode("manual"); setView("create"); }}>Create</NavButton>
            <NavButton active={view === "settings"} onClick={() => setView("settings")}><Settings size={12} /></NavButton>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {view === "home" && <HomeView quizzes={quizzes} stats={stats} onStart={startQuiz} onCreate={() => { setEditingQuiz(null); setCreateMode("manual"); setView("create"); }} onBrowse={() => setView("browse")} />}
        {view === "browse" && <BrowseView quizzes={quizzes} stats={stats} onStart={startQuiz} onEdit={(q) => { setEditingQuiz(q); setCreateMode("manual"); setView("create"); }} onDelete={deleteQuiz} onCreate={() => { setEditingQuiz(null); setCreateMode("manual"); setView("create"); }} onResetStats={resetQuizStats} />}
        {view === "create" && <CreateHub mode={createMode} setMode={setCreateMode} initial={editingQuiz} onSave={async (q) => { await saveQuiz(q); setView("browse"); }} onSaveMany={async (qs) => { for (const q of qs) await saveQuiz(q); setView("browse"); }} onCancel={() => setView("browse")} />}
        {view === "settings" && <SettingsView settings={settings} quizzes={quizzes} stats={stats} onChange={saveSettings} onReset={() => saveSettings(DEFAULT_SETTINGS)} onClearLibrary={clearLibrary} onClearStats={clearStats} onImportQuizzes={importQuizzes} />}
        {view === "take" && activeQuiz && (
          <TakeView
            quiz={activeQuiz}
            currentQuestion={currentQuestion}
            userAnswers={userAnswers}
            selectedAnswer={selectedAnswer}
            setSelectedAnswer={setSelectedAnswer}
            showFeedback={showFeedback}
            submitAnswer={submitAnswer}
            nextQuestion={nextQuestion}
            previousQuestion={previousQuestion}
            onQuit={() => setView("home")}
            settings={settings}
            quizStartTime={quizStartTime}
          />
        )}
        {view === "results" && activeQuiz && (
          <ResultsView
            quiz={activeQuiz}
            userAnswers={userAnswers}
            score={computeScore()}
            elapsedMs={finalElapsedMs}
            onRetry={() => originalQuiz && startQuiz(originalQuiz)}
            onRetryMissed={retryMissed}
            onHome={() => setView("home")}
            settings={settings}
          />
        )}
      </main>

      <footer className="border-t border-stone-300 mt-24 py-8 text-center mono text-xs text-stone-500 tracking-widest uppercase">
        Think · Answer · Learn
      </footer>
      </ConfirmProvider>
    </div>
  );
}

function NavButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 mono text-xs uppercase tracking-widest transition-colors flex items-center gap-1 ${
        active ? "bg-stone-900 text-stone-50" : "text-stone-700 hover:bg-stone-200"
      }`}
    >
      {children}
    </button>
  );
}

// ============ HOME ============
function HomeView({ quizzes, stats, onStart, onCreate, onBrowse }) {
  // Show most recently opened; fall back to most recently created
  const featured = quizzes.length === 0
    ? null
    : [...quizzes].sort((a, b) => {
        const aTime = a.lastOpenedAt || a.created || 0;
        const bTime = b.lastOpenedAt || b.created || 0;
        return bTime - aTime;
      })[0];
  const featuredStats = featured ? stats[featured.id] : null;
  const hasCompletedAttempt = featuredStats && featuredStats.attempts > 0;
  const hasBeenOpened = featured && featured.lastOpenedAt;
  return (
    <div className="fade-up">
      <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-4">Quizzical</div>
      <h1 className="display text-6xl sm:text-7xl md:text-8xl font-black leading-[0.9] mb-6 tracking-tight">
        Test what <span className="italic text-amber-700">you know.</span>
      </h1>
      <p className="text-xl text-stone-600 max-w-2xl mb-12 leading-relaxed">
        Build your own quizzes, import them, or let AI generate one. A simple, serious place to learn something.
      </p>

      <div className="grid md:grid-cols-2 gap-6 mb-16">
        <button onClick={onBrowse} className="group text-left bg-stone-900 text-stone-50 p-8 hover:bg-amber-700 transition-all fade-up stagger-1">
          <Play size={28} className="mb-4" />
          <div className="display text-3xl font-bold mb-2">Take a quiz</div>
          <div className="text-stone-400 group-hover:text-stone-100">
            {quizzes.length} {quizzes.length === 1 ? "quiz" : "quizzes"} waiting in your library.
          </div>
        </button>
        <button onClick={onCreate} className="group text-left border-2 border-stone-900 p-8 hover:bg-stone-900 hover:text-stone-50 transition-all fade-up stagger-2">
          <Sparkles size={28} className="mb-4 group-hover:text-amber-400" />
          <div className="display text-3xl font-bold mb-2">Build a quiz</div>
          <div className="text-stone-600 group-hover:text-stone-300">Write manually, import text, or generate with AI.</div>
        </button>
      </div>

      {featured && (
        <div className="border-t-2 border-stone-900 pt-8 fade-up stagger-3">
          <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-4">
            {hasCompletedAttempt ? "Pick up where you left off" : "From your library"}
          </div>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="display text-5xl font-bold mb-3">{featured.title}</h2>
              {featured.description && <p className="text-stone-600 text-lg mb-2">{featured.description}</p>}
              <div className="mono text-xs text-stone-500 uppercase tracking-widest">
                {featured.questions.length} {featured.questions.length === 1 ? "question" : "questions"}
                {hasBeenOpened && <> · Opened {formatRelativeTime(featured.lastOpenedAt)}</>}
                {hasCompletedAttempt && <> · Best {featuredStats.bestPercent}%</>}
              </div>
            </div>
            <button
              onClick={() => onStart(featured)}
              className="bg-amber-700 text-stone-50 px-8 py-4 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2"
            >
              {hasCompletedAttempt ? "Take again" : "Begin"} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ BROWSE ============
function BrowseView({ quizzes, stats, onStart, onEdit, onDelete, onCreate, onResetStats }) {
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest"); // newest | oldest | title | size | best
  const [expandedStats, setExpandedStats] = useState(null); // quiz id whose stats are open

  if (quizzes.length === 0) {
    return (
      <div className="text-center py-24 fade-up">
        <FileText size={48} className="mx-auto mb-4 text-stone-400" />
        <div className="display text-3xl font-bold mb-2">Library is empty</div>
        <p className="text-stone-600 mb-6">Create your first quiz to get started.</p>
        <button onClick={onCreate} className="bg-stone-900 text-stone-50 px-6 py-3 mono text-xs uppercase tracking-widest hover:bg-amber-700 transition-colors">
          Create a quiz
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  let filtered = q
    ? quizzes.filter(quiz =>
        quiz.title.toLowerCase().includes(q) ||
        (quiz.description || "").toLowerCase().includes(q)
      )
    : quizzes;

  const sorted = [...filtered].sort((a, b) => {
    const sa = stats[a.id] || {};
    const sb = stats[b.id] || {};
    switch (sort) {
      case "oldest": return (a.created || 0) - (b.created || 0);
      case "title": return a.title.localeCompare(b.title);
      case "size": return b.questions.length - a.questions.length;
      case "best": return (sb.bestPercent || -1) - (sa.bestPercent || -1);
      case "newest":
      default: return (b.created || 0) - (a.created || 0);
    }
  });

  return (
    <div className="fade-up">
      <div className="flex items-end justify-between mb-8 border-b-2 border-stone-900 pb-4 gap-4 flex-wrap">
        <div>
          <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Your quizzes</div>
          <h1 className="display text-5xl font-black">Library</h1>
        </div>
        <button onClick={onCreate} className="bg-stone-900 text-stone-50 px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-amber-700 transition-colors flex items-center gap-2">
          <Plus size={14} /> New
        </button>
      </div>

      <div className="mb-6 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by title or description..."
            className="w-full pl-9 pr-3 py-2 border-2 border-stone-300 focus:border-stone-900 outline-none bg-white mono text-sm placeholder:text-stone-400"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="py-2 px-3 border-2 border-stone-300 focus:border-stone-900 outline-none bg-white mono text-xs uppercase tracking-widest"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
          <option value="size">Most questions</option>
          <option value="best">Best score</option>
        </select>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-stone-300">
          <div className="mono text-xs uppercase tracking-widest text-stone-500">No quizzes match "{query}"</div>
        </div>
      )}

      <div className="grid gap-4">
        {sorted.map((quiz, i) => {
          const s = stats[quiz.id] || {};
          const hasStats = s.attempts > 0;
          const isExpanded = expandedStats === quiz.id;
          return (
            <div key={quiz.id} className={`group border-2 border-stone-900 transition-colors fade-up stagger-${Math.min(i + 1, 4)} ${isExpanded ? "bg-stone-50" : "hover:bg-stone-100"}`}>
              <div className="p-6">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                      {quiz.lastOpenedAt ? `Last opened ${formatRelativeTime(quiz.lastOpenedAt)}` : quiz.created ? `Created ${formatRelativeTime(quiz.created)}` : "New"}
                    </div>
                    <h3 className="display text-3xl font-bold mb-2">{quiz.title}</h3>
                    {quiz.description && <p className="text-stone-600 mb-2">{quiz.description}</p>}
                    <div className="mono text-xs text-stone-500 uppercase tracking-widest flex gap-4 flex-wrap items-center">
                      <span>{quiz.questions.length} {quiz.questions.length === 1 ? "question" : "questions"}</span>
                      {hasStats ? (
                        <>
                          <span className="text-stone-400">·</span>
                          <span>Taken {s.attempts}×</span>
                          <span className="text-amber-700">Best {s.bestPercent}%</span>
                          <span>Last {s.lastPercent}%</span>
                          <button
                            onClick={() => setExpandedStats(isExpanded ? null : quiz.id)}
                            className="text-stone-700 hover:text-amber-700 flex items-center gap-1 underline"
                          >
                            {isExpanded ? <>Hide stats <ChevronUp size={12} /></> : <>View stats <ChevronDown size={12} /></>}
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-stone-400">·</span>
                          <span className="text-stone-400">Never taken</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onStart(quiz)}
                      className="bg-amber-700 text-stone-50 px-4 py-2 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-1"
                    >
                      <Play size={12} /> Start
                    </button>
                    <button
                      onClick={() => onEdit(quiz)}
                      className="border-2 border-stone-900 px-4 py-2 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors flex items-center gap-1"
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => downloadQuiz(quiz)}
                      title="Download as .txt"
                      className="border-2 border-stone-300 text-stone-500 px-3 py-2 hover:border-stone-900 hover:text-stone-900 transition-colors"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={async () => { const ok = await confirm({ title: "Delete quiz", message: `Delete "${quiz.title}"? This cannot be undone.`, confirmLabel: "Delete", danger: true }); if (ok) onDelete(quiz.id); }}
                      title="Delete"
                      className="border-2 border-stone-300 text-stone-500 px-3 py-2 hover:border-red-600 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {isExpanded && hasStats && (
                <QuizStatsPanel
                  quizId={quiz.id}
                  quizTitle={quiz.title}
                  stats={s}
                  onReset={async () => {
                    const ok = await confirm({ title: "Reset stats", message: `Reset stats for "${quiz.title}"? This cannot be undone. The quiz itself will be kept.`, confirmLabel: "Reset stats", danger: true });
                    if (ok) {
                      onResetStats(quiz.id);
                      setExpandedStats(null);
                    }
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "—";
  const diff = Date.now() - timestamp;
  const minute = 60000, hour = 3600000, day = 86400000, week = 7 * day, month = 30 * day;
  if (diff < minute) return "just now";
  if (diff < hour) return Math.floor(diff / minute) + "m ago";
  if (diff < day) return Math.floor(diff / hour) + "h ago";
  if (diff < week) return Math.floor(diff / day) + "d ago";
  if (diff < month) return Math.floor(diff / week) + "w ago";
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function QuizStatsPanel({ quizId, quizTitle, stats, onReset }) {
  const recent = (stats.recent || []).slice(0, 10);
  const average = recent.length > 0
    ? Math.round(recent.reduce((sum, r) => sum + r.percent, 0) / recent.length)
    : 0;

  // Sparkline data — oldest to newest for reading left-to-right
  const chrono = [...recent].reverse();
  const maxH = 40;
  const barWidth = chrono.length > 0 ? Math.max(6, Math.min(24, Math.floor(240 / chrono.length) - 2)) : 0;

  return (
    <div className="border-t-2 border-stone-900 p-6 bg-white fade-up">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="mono text-xs uppercase tracking-widest text-stone-500 flex items-center gap-2">
          <BarChart3 size={14} /> Stats for this quiz
        </div>
        <button
          onClick={onReset}
          className="mono text-xs uppercase tracking-widest border-2 border-red-600 text-red-600 px-3 py-1 hover:bg-red-600 hover:text-white transition-colors flex items-center gap-1"
        >
          <RotateCcw size={10} /> Reset stats
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-2 border-stone-900 mb-6">
        <StatCell value={stats.attempts || 0} label="Attempts" />
        <StatCell value={(stats.bestPercent || 0) + "%"} label="Best" border accent />
        <StatCell value={(stats.lastPercent || 0) + "%"} label="Last" border />
        <StatCell value={average + "%"} label="Recent avg" border />
      </div>

      {chrono.length > 0 && (
        <div className="mb-6">
          <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-3">
            Recent trend ({chrono.length} {chrono.length === 1 ? "attempt" : "attempts"}, oldest → newest)
          </div>
          <div className="flex items-end gap-1 h-12 border-b border-stone-300 pb-0">
            {chrono.map((r, idx) => {
              const h = Math.max(3, Math.round((r.percent / 100) * maxH));
              const color = r.percent >= 80 ? "bg-emerald-600" : r.percent >= 60 ? "bg-amber-600" : r.percent >= 40 ? "bg-amber-400" : "bg-red-500";
              return (
                <div
                  key={idx}
                  title={`${r.percent}% (${r.score} of ${r.total}) · ${formatRelativeTime(r.takenAt)}`}
                  className={`${color} transition-all`}
                  style={{ width: barWidth + "px", height: h + "px" }}
                />
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-3">Recent attempts</div>
        <div className="space-y-1">
          {recent.map((r, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 px-3 border border-stone-200 bg-stone-50 text-sm">
              <div className="flex items-center gap-3">
                <span className="mono text-xs text-stone-500 w-8">#{stats.attempts - idx}</span>
                <span className={`mono text-xs font-semibold ${
                  r.percent >= 80 ? "text-emerald-700" :
                  r.percent >= 60 ? "text-amber-700" :
                  r.percent >= 40 ? "text-amber-600" :
                  "text-red-600"
                }`}>
                  {r.percent}%
                </span>
                <span className="text-stone-600">{r.score} / {r.total} correct</span>
              </div>
              <span className="mono text-xs text-stone-500">{formatRelativeTime(r.takenAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ CREATE HUB ============
function CreateHub({ mode, setMode, initial, onSave, onSaveMany, onCancel }) {
  useEffect(() => {
    if (initial) setMode("manual");
  }, [initial]);

  return (
    <div className="fade-up">
      <div className="border-b-2 border-stone-900 pb-4 mb-8">
        <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">{initial ? "Editing" : "New quiz"}</div>
        <h1 className="display text-5xl font-black">{initial ? "Edit Quiz" : "Create a Quiz"}</h1>
      </div>

      {!initial && (
        <div className="grid grid-cols-2 gap-0 mb-8 border-2 border-stone-900">
          <ModeTab active={mode === "manual"} onClick={() => setMode("manual")} icon={<Edit3 size={16} />} label="Manual" subtitle="Build each question by hand" />
          <ModeTab active={mode === "import"} onClick={() => setMode("import")} icon={<Upload size={16} />} label="Import" subtitle="From .txt or pasted text" />
        </div>
      )}

      {mode === "manual" && <ManualCreate initial={initial} onSave={onSave} onCancel={onCancel} />}
      {mode === "import" && <ImportCreate onSave={onSave} onSaveMany={onSaveMany} onCancel={onCancel} />}
    </div>
  );
}

function ModeTab({ active, onClick, icon, label, subtitle }) {
  return (
    <button
      onClick={onClick}
      className={`p-4 text-left transition-colors border-r-2 border-stone-900 last:border-r-0 ${
        active ? "bg-stone-900 text-stone-50" : "bg-stone-50 hover:bg-stone-100"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="mono text-xs uppercase tracking-widest font-semibold">{label}</span>
      </div>
      <div className={`text-xs ${active ? "text-stone-400" : "text-stone-500"}`}>{subtitle}</div>
    </button>
  );
}

// ============ MANUAL CREATE ============
function ManualCreate({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [questions, setQuestions] = useState(
    initial?.questions || [{ q: "", options: ["", "", "", ""], correct: 0, explain: "" }]
  );
  const [saveError, setSaveError] = useState("");

  function updateQuestion(i, patch) {
    setQuestions(prev => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function updateOption(qi, oi, value) {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx !== qi) return q;
      const options = [...q.options];
      options[oi] = value;
      return { ...q, options };
    }));
  }
  function addOption(qi) {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx !== qi) return q;
      if (q.options.length >= MAX_OPTIONS) return q;
      return { ...q, options: [...q.options, ""] };
    }));
  }
  function removeOption(qi, oi) {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx !== qi) return q;
      if (q.options.length <= MIN_OPTIONS) return q;
      const options = q.options.filter((_, i) => i !== oi);
      // Adjust the correct-answer index if needed
      let correct = q.correct;
      if (oi === q.correct) correct = 0;          // removed the correct one — reset to first
      else if (oi < q.correct) correct = q.correct - 1; // shifted earlier index down
      return { ...q, options, correct };
    }));
  }
  function addQuestion() {
    setQuestions(prev => [...prev, { q: "", options: ["", "", "", ""], correct: 0, explain: "" }]);
  }
  function removeQuestion(i) {
    if (questions.length === 1) return;
    setQuestions(prev => prev.filter((_, idx) => idx !== i));
  }
  function moveQuestion(i, direction) {
    const targetIdx = direction === "up" ? i - 1 : i + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    setQuestions(prev => {
      const copy = [...prev];
      [copy[i], copy[targetIdx]] = [copy[targetIdx], copy[i]];
      return copy;
    });
  }

  function handleSave() {
    if (!title.trim()) {
      setSaveError("Please give your quiz a title.");
      return;
    }
    // Find the first incomplete question for a specific error
    const incompleteIdx = questions.findIndex(q => !q.q.trim() || q.options.some(o => !o.trim()));
    if (incompleteIdx !== -1) {
      const q = questions[incompleteIdx];
      if (!q.q.trim()) {
        setSaveError(`Question ${incompleteIdx + 1} is missing its prompt.`);
      } else {
        setSaveError(`Question ${incompleteIdx + 1} has one or more empty answer options.`);
      }
      return;
    }
    setSaveError("");
    onSave({
      id: initial?.id || "q-" + Date.now(),
      title: title.trim(),
      description: description.trim(),
      created: initial?.created || Date.now(),
      questions
    });
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-6">
        <button onClick={onCancel} className="border-2 border-stone-900 px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors">Cancel</button>
        <button onClick={handleSave} className="bg-amber-700 text-stone-50 px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2">
          <Check size={14} /> Save Quiz
        </button>
      </div>

      {saveError && (
        <div className="border-l-4 border-red-600 bg-red-50 p-4 mb-6 fade-up">
          <div className="mono text-xs uppercase tracking-widest text-red-700 mb-1">Can't save yet</div>
          <p className="text-sm text-stone-700">{saveError}</p>
        </div>
      )}

      <div className="space-y-4 mb-8">
        <div>
          <label className="mono text-xs uppercase tracking-widest text-stone-500 block mb-2">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g., Ancient History"
            className="w-full display text-4xl font-bold bg-transparent border-b-2 border-stone-300 focus:border-stone-900 outline-none pb-2 placeholder:text-stone-300"
          />
        </div>
        <div>
          <label className="mono text-xs uppercase tracking-widest text-stone-500 block mb-2">Description (optional)</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What's this quiz about?"
            className="w-full text-lg bg-transparent border-b-2 border-stone-300 focus:border-stone-900 outline-none pb-2 placeholder:text-stone-300"
          />
        </div>
      </div>

      <div className="space-y-6">
        {questions.map((q, qi) => (
          <div key={qi} className="border-2 border-stone-900 p-6 bg-stone-50">
            <div className="flex items-center justify-between mb-4">
              <div className="mono text-xs uppercase tracking-widest text-stone-500">Question {String(qi + 1).padStart(2, "0")}</div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveQuestion(qi, "up")}
                  disabled={qi === 0}
                  title="Move up"
                  className="p-1 text-stone-400 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  onClick={() => moveQuestion(qi, "down")}
                  disabled={qi === questions.length - 1}
                  title="Move down"
                  className="p-1 text-stone-400 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
                >
                  <ArrowDown size={16} />
                </button>
                <span className="w-2" />
                <button
                  onClick={() => removeQuestion(qi)}
                  disabled={questions.length === 1}
                  title="Delete question"
                  className="p-1 text-stone-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <textarea
              value={q.q}
              onChange={e => updateQuestion(qi, { q: e.target.value })}
              placeholder="What's your question?"
              rows={2}
              className="w-full display text-2xl font-medium bg-transparent border-b border-stone-300 focus:border-stone-900 outline-none pb-2 mb-6 placeholder:text-stone-300 resize-none"
            />

            <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-3">Options · Click the circle to mark the correct answer</div>
            <div className="space-y-2 mb-2">
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-3">
                  <button
                    onClick={() => updateQuestion(qi, { correct: oi })}
                    className={`w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      q.correct === oi ? "bg-amber-700 border-amber-700 text-stone-50" : "border-stone-400 hover:border-stone-900"
                    }`}
                  >
                    {q.correct === oi && <Check size={14} />}
                  </button>
                  <span className="mono text-xs text-stone-500 w-4">{String.fromCharCode(65 + oi)}</span>
                  <input
                    value={opt}
                    onChange={e => updateOption(qi, oi, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                    className="flex-1 bg-transparent border-b border-stone-200 focus:border-stone-900 outline-none py-1 placeholder:text-stone-300"
                  />
                  {q.options.length > MIN_OPTIONS && (
                    <button
                      onClick={() => removeOption(qi, oi)}
                      title="Remove option"
                      className="p-1 text-stone-300 hover:text-red-600 transition-colors flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              {q.options.length < MAX_OPTIONS ? (
                <button
                  onClick={() => addOption(qi)}
                  className="mono text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1"
                >
                  <Plus size={12} /> Add option
                </button>
              ) : (
                <span className="mono text-[10px] uppercase tracking-widest text-stone-400">Max {MAX_OPTIONS} options</span>
              )}
              <span className="mono text-[10px] uppercase tracking-widest text-stone-400">
                {q.options.length} option{q.options.length === 1 ? "" : "s"}
              </span>
            </div>

            <div>
              <label className="mono text-xs uppercase tracking-widest text-stone-500 block mb-2">Explanation (optional)</label>
              <input
                value={q.explain}
                onChange={e => updateQuestion(qi, { explain: e.target.value })}
                placeholder="Shown after answering"
                className="w-full bg-transparent border-b border-stone-200 focus:border-stone-900 outline-none py-1 placeholder:text-stone-300 italic"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addQuestion}
        className="w-full mt-6 border-2 border-dashed border-stone-400 py-6 mono text-xs uppercase tracking-widest text-stone-500 hover:border-stone-900 hover:text-stone-900 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={16} /> Add question
      </button>
    </div>
  );
}

// ============ IMPORT ============
const IMPORT_EXAMPLE = `Title: World Capitals
Description: Test your geography knowledge

Q: What is the capital of France?
A. London
*B. Paris
C. Berlin
D. Madrid
Explain: Paris has been France's capital since the 10th century.

Q: What is the capital of Japan?
A. Osaka
B. Kyoto
*C. Tokyo
D. Seoul
Explain: Tokyo became the capital in 1868, replacing Kyoto.`;

function parseSingleQuizText(text) {
  const lines = text.split(/\r?\n/);
  let title = "Imported Quiz";
  let description = "";
  const questions = [];
  let current = null;
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const titleMatch = line.match(/^Title\s*:\s*(.+)$/i);
    const descMatch = line.match(/^Description\s*:\s*(.+)$/i);
    const qMatch = line.match(/^Q\s*[:.]?\s*(.+)$/i);
    const optMatch = line.match(/^(\*?)\s*([A-Za-z])\s*[.):]\s*(.+)$/);
    const explainMatch = line.match(/^Explain\s*:\s*(.+)$/i);

    if (titleMatch && !current) {
      title = titleMatch[1].trim();
    } else if (descMatch && !current) {
      description = descMatch[1].trim();
    } else if (qMatch) {
      if (current) questions.push(current);
      current = { q: qMatch[1].trim(), options: [], correct: -1, explain: "" };
    } else if (optMatch && current) {
      const isCorrect = optMatch[1] === "*";
      const letter = optMatch[2].toUpperCase();
      const optText = optMatch[3].trim();
      const idx = letter.charCodeAt(0) - 65;
      if (idx >= MAX_OPTIONS) continue; // silently skip options past the max
      while (current.options.length <= idx) current.options.push("");
      current.options[idx] = optText;
      if (isCorrect) current.correct = idx;
    } else if (explainMatch && current) {
      current.explain = explainMatch[1].trim();
    }
  }
  if (current) questions.push(current);

  questions.forEach((q, i) => {
    if (!q.q) errors.push(`Question ${i + 1}: missing prompt`);
    if (q.options.length < MIN_OPTIONS) errors.push(`Question ${i + 1}: needs at least ${MIN_OPTIONS} options`);
    if (q.options.length > MAX_OPTIONS) errors.push(`Question ${i + 1}: more than ${MAX_OPTIONS} options`);
    if (q.options.some(o => !o)) errors.push(`Question ${i + 1}: has empty options`);
    if (q.correct < 0) errors.push(`Question ${i + 1}: no correct answer marked (use * before the letter)`);
  });

  if (questions.length === 0) errors.push("No questions found. Check the format.");

  return { title, description, questions, errors };
}

// Top-level parser: accepts either a single quiz or a multi-quiz export file.
// Multi-quiz files are separated by a line of "=" characters (as produced by
// downloadAllQuizzes). Also strips the "Quizzical Library Export" header block
// if present.
function parseImportText(text) {
  // Strip the library-export header block if detected: everything up to the
  // first "====" separator when the top begins with "Quizzical Library Export".
  let working = text;
  if (/^\s*Quizzical Library Export/i.test(working)) {
    const firstSep = working.search(/^={5,}\s*$/m);
    if (firstSep !== -1) {
      working = working.slice(firstSep);
    }
  }

  // Split on lines that are just "=" characters (5 or more).
  const sections = working
    .split(/^={5,}\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sections.length <= 1) {
    // Single-quiz path (backwards compatible)
    return parseSingleQuizText(working);
  }

  // Multi-quiz path
  const quizzes = [];
  const allErrors = [];
  sections.forEach((section, idx) => {
    const result = parseSingleQuizText(section);
    if (result.errors.length > 0) {
      // Prefix errors with the quiz number for clarity
      result.errors.forEach(err => {
        allErrors.push(`Quiz ${idx + 1} (${result.title}): ${err}`);
      });
    } else {
      quizzes.push({
        title: result.title,
        description: result.description,
        questions: result.questions
      });
    }
  });

  return { multi: true, quizzes, errors: allErrors };
}

function serializeQuizToText(quiz) {
  const lines = [];
  lines.push(`Title: ${quiz.title}`);
  if (quiz.description) lines.push(`Description: ${quiz.description}`);
  lines.push("");
  quiz.questions.forEach((q, qi) => {
    lines.push(`Q: ${q.q}`);
    q.options.forEach((opt, oi) => {
      const prefix = oi === q.correct ? "*" : "";
      const letter = String.fromCharCode(65 + oi);
      lines.push(`${prefix}${letter}. ${opt}`);
    });
    if (q.explain) lines.push(`Explain: ${q.explain}`);
    if (qi < quiz.questions.length - 1) lines.push("");
  });
  return lines.join("\n");
}

function downloadQuiz(quiz) {
  const text = serializeQuizToText(quiz);
  const safeName = (quiz.title || "quiz")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "quiz";
  const filename = `${safeName}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadAllQuizzes(quizzes) {
  if (!quizzes || quizzes.length === 0) return;
  const separator = "\n\n" + "=".repeat(60) + "\n\n";
  const parts = quizzes.map(q => serializeQuizToText(q));
  const text = `Quizzical Library Export\nExported: ${new Date().toISOString()}\nQuizzes: ${quizzes.length}\n` + separator + parts.join(separator);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `quizzical-library-${date}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImportCreate({ onSave, onSaveMany, onCancel }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const EXTERNAL_AI_PROMPT = `${AI_INSTRUCTIONS}

---

OUTPUT FORMAT — follow exactly. Start with a Title line and a Description line (both required), then the questions. Plain text only, no JSON, no markdown, no commentary:

Title: [a short, specific quiz title in Title Case]
Description: [one sentence describing what the quiz covers]

Q: [Question text]
A. [Option A]
*B. [Option B]
C. [Option C]
D. [Option D]
Explain: [One-sentence explanation]

Q: [Next question text]
...

FORMATTING RULES:
- The Title line and Description line are both required, and come first, before any questions.
- Each question starts with "Q:" followed by the question text.
- List between 2 and 8 options labeled A., B., C., etc. on separate lines. Four options is typical — use more or fewer only when the material naturally calls for it.
- Mark the correct answer by placing an asterisk (*) directly before its letter, like "*B. Paris".
- Include an optional "Explain:" line after each question.
- Leave a blank line between questions.
- Do not add any text outside this format.

TOPIC: [Replace with your topic]
NUMBER OF QUESTIONS: [Replace with how many you want]
DIFFICULTY: [easy / medium / hard]`;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(EXTERNAL_AI_PROMPT);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback: show inline message instead of a jarring alert
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 4000);
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result);
    reader.readAsText(file);
  }

  function handleParse() {
    if (!text.trim()) {
      setErrors(["Please paste some text or upload a file first."]);
      setPreview(null);
      return;
    }
    const result = parseImportText(text);
    if (result.errors.length > 0) {
      setErrors(result.errors);
      setPreview(null);
    } else {
      setErrors([]);
      setPreview(result);
    }
  }

  function handleImport() {
    if (!preview) return;
    if (preview.multi) {
      // Multi-quiz import: save all at once
      const now = Date.now();
      const quizzesToSave = preview.quizzes.map((p, idx) => ({
        id: "q-" + (now + idx),
        title: p.title,
        description: p.description,
        created: now + idx,
        questions: p.questions.map(q => ({ ...q, options: [...q.options] }))
      }));
      onSaveMany(quizzesToSave);
    } else {
      // Single-quiz import
      onSave({
        id: "q-" + Date.now(),
        title: preview.title,
        description: preview.description,
        created: Date.now(),
        questions: preview.questions.map(q => ({ ...q, options: [...q.options] }))
      });
    }
  }

  function loadExample() {
    setText(IMPORT_EXAMPLE);
    setErrors([]);
    setPreview(null);
  }

  return (
    <div>
      <div className="dark-card p-6 mb-6">
        <div className="flex items-start gap-3">
          <Info size={18} className="mt-1 flex-shrink-0 text-amber-400" />
          <div>
            <div className="mono text-xs uppercase tracking-widest text-amber-400 mb-3">Format Guide</div>
            <ol className="text-stone-300 text-sm leading-relaxed mb-3 space-y-1 list-decimal list-inside">
              <li>Start with a <span className="mono bg-stone-800 px-1">Title:</span> line, then a <span className="mono bg-stone-800 px-1">Description:</span> line</li>
              <li>Each question begins with <span className="mono bg-stone-800 px-1">Q:</span></li>
              <li>List {MIN_OPTIONS}–{MAX_OPTIONS} options as <span className="mono bg-stone-800 px-1">A.</span>, <span className="mono bg-stone-800 px-1">B.</span>, <span className="mono bg-stone-800 px-1">C.</span>, … (four is typical)</li>
              <li>Mark the correct answer with an asterisk, e.g. <span className="mono bg-stone-800 px-1">*B. Paris</span></li>
              <li>Optional <span className="mono bg-stone-800 px-1">Explain:</span> line after each question</li>
            </ol>
            <p className="text-stone-400 text-xs leading-relaxed mb-3">
              To import multiple quizzes at once (e.g. a "Download all" backup), separate each quiz with a line of <span className="mono bg-stone-800 px-1">======</span> characters.
            </p>
            <button onClick={loadExample} className="mono text-xs uppercase tracking-widest text-amber-400 hover:text-amber-200 underline">
              Load an example →
            </button>
          </div>
        </div>
      </div>

      {/* AI Instructions dropdown for external-AI workflow */}
      <div className="border-2 border-stone-900 mb-6">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="w-full p-4 flex items-center justify-between hover:bg-stone-100 transition-colors"
        >
          <div className="flex items-center gap-3 text-left">
            <Wand2 size={16} className="text-stone-500 flex-shrink-0" />
            <div>
              <div className="mono text-xs uppercase tracking-widest font-semibold">AI Instructions for External Use</div>
              <div className="text-xs text-stone-500 mt-0.5">
                Copy these instructions to use with ChatGPT, Claude, or any AI tool, then paste the result below
              </div>
            </div>
          </div>
          {showInstructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showInstructions && (
          <div className="border-t-2 border-stone-900 p-4 bg-stone-50 fade-up">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="mono text-[10px] uppercase tracking-widest text-stone-500">
                Paste this entire block into an AI chat, then bring the output back here
              </div>
              <button
                onClick={copyPrompt}
                className={`mono text-xs uppercase tracking-widest border-2 px-3 py-1 transition-colors flex items-center gap-1 ${
                  copied
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : copyFailed
                      ? "border-red-600 text-red-600"
                      : "border-stone-900 hover:bg-stone-900 hover:text-stone-50"
                }`}
              >
                {copied ? <><Check size={10} /> Copied</> : copyFailed ? <><X size={10} /> Copy failed</> : <><Copy size={10} /> Copy prompt</>}
              </button>
            </div>
            {copyFailed && (
              <div className="mono text-[10px] uppercase tracking-widest text-red-600 mb-2">
                Auto-copy blocked. Select the text below and copy manually.
              </div>
            )}
            <pre className="mono text-xs text-stone-700 whitespace-pre-wrap bg-white border border-stone-300 p-3 max-h-64 overflow-y-auto leading-relaxed">
              {EXTERNAL_AI_PROMPT}
            </pre>
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <label className="border-2 border-stone-900 px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors cursor-pointer flex items-center gap-2">
          <Upload size={14} /> Upload .txt file
          <input type="file" accept=".txt,text/plain" onChange={handleFile} className="hidden" />
        </label>
        <span className="mono text-xs text-stone-500 uppercase tracking-widest">or paste below</span>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste your quiz text here, or use the Upload button above..."
        rows={14}
        className="w-full mono text-sm bg-white border-2 border-stone-300 focus:border-stone-900 outline-none p-4 placeholder:text-stone-400"
      />

      <div className="mt-4 flex justify-between items-center flex-wrap gap-2">
        <button onClick={handleParse} className="bg-stone-900 text-stone-50 px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-amber-700 transition-colors">
          Preview import
        </button>
        <button onClick={onCancel} className="border-2 border-stone-900 px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors">Cancel</button>
      </div>

      {errors.length > 0 && (
        <div className="mt-6 border-l-4 border-red-600 bg-red-50 p-4 fade-up">
          <div className="mono text-xs uppercase tracking-widest text-red-700 mb-2">Errors</div>
          <ul className="text-sm text-stone-700 space-y-1">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </div>
      )}

      {preview && !preview.multi && (
        <div className="mt-6 border-2 border-emerald-600 bg-emerald-50 p-6 fade-up">
          <div className="mono text-xs uppercase tracking-widest text-emerald-700 mb-4">✓ Parsed successfully</div>
          <h3 className="display text-3xl font-bold mb-1">{preview.title}</h3>
          {preview.description && <p className="text-stone-600 mb-2">{preview.description}</p>}
          <p className="mono text-xs text-stone-500 uppercase tracking-widest mb-4">{preview.questions.length} questions</p>
          <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
            {preview.questions.map((q, i) => (
              <div key={i} className="text-sm bg-white p-3 border border-stone-200">
                <div className="font-semibold">{i + 1}. {q.q}</div>
                <div className="text-emerald-700 text-xs mt-1">✓ {q.options[q.correct]}</div>
              </div>
            ))}
          </div>
          <button onClick={handleImport} className="bg-emerald-700 text-white px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2">
            <Check size={14} /> Import this quiz
          </button>
        </div>
      )}

      {preview && preview.multi && (
        <div className="mt-6 border-2 border-emerald-600 bg-emerald-50 p-6 fade-up">
          <div className="mono text-xs uppercase tracking-widest text-emerald-700 mb-4">
            ✓ Parsed successfully · Multi-quiz file
          </div>
          <div className="display text-3xl font-bold mb-1">
            {preview.quizzes.length} quizzes ready to import
          </div>
          <p className="mono text-xs text-stone-500 uppercase tracking-widest mb-4">
            {preview.quizzes.reduce((sum, q) => sum + q.questions.length, 0)} total questions
          </p>
          <div className="space-y-2 mb-6 max-h-80 overflow-y-auto">
            {preview.quizzes.map((quiz, i) => (
              <div key={i} className="bg-white p-4 border border-stone-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold display text-lg">{quiz.title}</div>
                    {quiz.description && <div className="text-xs text-stone-600 mt-1 italic">{quiz.description}</div>}
                  </div>
                  <div className="mono text-xs text-stone-500 uppercase tracking-widest flex-shrink-0">
                    {quiz.questions.length} {quiz.questions.length === 1 ? "q" : "qs"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={handleImport} className="bg-emerald-700 text-white px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2">
            <Check size={14} /> Import all {preview.quizzes.length} quizzes
          </button>
        </div>
      )}
    </div>
  );
}

// ============ SETTINGS ============
function SettingsView({ settings, quizzes, stats, onChange, onReset, onClearLibrary, onClearStats, onImportQuizzes }) {
  const confirm = useConfirm();
  function toggle(key) {
    onChange({ ...settings, [key]: !settings[key] });
  }

  // Aggregate stats
  const totalQuizzes = quizzes.length;
  const totalQuestions = quizzes.reduce((sum, q) => sum + q.questions.length, 0);
  const totalAttempts = Object.values(stats).reduce((sum, s) => sum + (s.attempts || 0), 0);
  const quizzesWithStats = Object.values(stats).filter(s => s.attempts > 0);
  const avgBest = quizzesWithStats.length > 0
    ? Math.round(quizzesWithStats.reduce((sum, s) => sum + (s.bestPercent || 0), 0) / quizzesWithStats.length)
    : null;

  return (
    <div className="fade-up">
      <div className="border-b-2 border-stone-900 pb-4 mb-8">
        <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Preferences and data</div>
        <h1 className="display text-5xl font-black">Settings</h1>
      </div>

      {/* Stats Overview */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="display text-2xl font-bold">At a Glance</h2>
          <p className="text-stone-500 text-sm">Your library and activity so far</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-2 border-stone-900">
          <StatCell value={totalQuizzes} label="Quizzes" />
          <StatCell value={totalQuestions} label="Questions" border />
          <StatCell value={totalAttempts} label="Attempts" border />
          <StatCell value={avgBest === null ? "—" : avgBest + "%"} label="Avg of bests" border accent />
        </div>
      </div>

      <SettingGroup title="Quiz Behavior" subtitle="How questions are presented when you take a quiz">
        <Toggle
          icon={<Shuffle size={16} />}
          label="Shuffle question order"
          description="Randomize the order questions appear each time you take a quiz."
          value={settings.shuffleQuestions}
          onChange={() => toggle("shuffleQuestions")}
        />
        <Toggle
          icon={<Shuffle size={16} />}
          label="Shuffle answer options"
          description="Randomize the order of answer choices for each question."
          value={settings.shuffleOptions}
          onChange={() => toggle("shuffleOptions")}
        />
        <Toggle
          icon={<Check size={16} />}
          label="Immediate feedback"
          description="Show whether you're right or wrong after each question. Turn off to only see results at the end."
          value={settings.immediateFeedback}
          onChange={() => toggle("immediateFeedback")}
        />
        <Toggle
          icon={<Info size={16} />}
          label="Show explanations"
          description="Display the explanation text (when available) with feedback."
          value={settings.showExplanations}
          onChange={() => toggle("showExplanations")}
        />
        <Toggle
          icon={<Clock size={16} />}
          label="Show timer"
          description="Display an elapsed-time counter during the quiz and on the results screen. Useful for exam practice."
          value={settings.showTimer}
          onChange={() => toggle("showTimer")}
        />
      </SettingGroup>

      {/* Appearance */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="display text-2xl font-bold">Appearance</h2>
          <p className="text-stone-500 text-sm">How the app looks and feels</p>
        </div>
        <div className="border-2 border-stone-900 divide-y-2 divide-stone-900">
          <Toggle
            icon={<Moon size={16} />}
            label="Dark mode"
            description="Use a dark color scheme — easier on the eyes in low-light environments."
            value={settings.darkMode}
            onChange={() => toggle("darkMode")}
          />
          <ChoiceRow
            icon={<FileText size={16} />}
            label="Font size"
            description="Adjust the base text size across the app. Larger sizes improve readability."
            value={settings.fontSize}
            options={[
              { value: "small", label: "Small" },
              { value: "normal", label: "Normal" },
              { value: "large", label: "Large" }
            ]}
            onChange={v => onChange({ ...settings, fontSize: v })}
          />
        </div>
      </div>

      {/* Helpers */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="display text-2xl font-bold">Helpers</h2>
          <p className="text-stone-500 text-sm">Optional tools that speed up quiz-taking</p>
        </div>
        <div className="border-2 border-stone-900 divide-y-2 divide-stone-900">
          <Toggle
            icon={<Target size={16} />}
            label="Keyboard shortcuts"
            description="Press A–H or 1–8 to select an answer · Enter to submit or advance · ← → to move between questions."
            value={settings.keyboardShortcuts}
            onChange={() => toggle("keyboardShortcuts")}
          />
        </div>
      </div>

      {/* Data Management */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="display text-2xl font-bold">Your Data</h2>
          <p className="text-stone-500 text-sm">Download, back up, or clear your library</p>
        </div>
        <div className="border-2 border-stone-900 divide-y-2 divide-stone-900">
          <ActionRow
            icon={<Archive size={16} />}
            label="Download all quizzes"
            description={totalQuizzes > 0
              ? `Export all ${totalQuizzes} quizzes into a single .txt file you can back up or re-import later.`
              : "No quizzes to export yet."}
            actionLabel="Download"
            actionIcon={<Download size={12} />}
            onClick={() => downloadAllQuizzes(quizzes)}
            disabled={totalQuizzes === 0}
            tone="default"
          />
          <ImportLibraryRow onImportQuizzes={onImportQuizzes} />
          <ActionRow
            icon={<BarChart3 size={16} />}
            label="Clear statistics"
            description="Erase attempt counts, best scores, and last-taken dates. Your quizzes will not be deleted."
            actionLabel="Clear stats"
            actionIcon={<RotateCcw size={12} />}
            onClick={async () => {
              const ok = await confirm({ title: "Clear statistics", message: "Erase all quiz statistics? This cannot be undone. Your quizzes will be kept.", confirmLabel: "Clear stats", danger: true });
              if (ok) onClearStats();
            }}
            disabled={totalAttempts === 0}
            tone="warning"
          />
          <ActionRow
            icon={<Trash2 size={16} />}
            label="Clear entire library"
            description="Delete every quiz and all statistics. This cannot be undone. Make sure you've downloaded a backup first."
            actionLabel="Delete everything"
            actionIcon={<Trash2 size={12} />}
            onClick={async () => {
              const ok1 = await confirm({ title: "Back up first?", message: "Before you do this — have you downloaded a backup? This cannot be undone.", confirmLabel: "Continue" });
              if (!ok1) return;
              const ok2 = await confirm({ title: "Final confirmation", message: `Permanently delete all ${totalQuizzes} quizzes and statistics?`, confirmLabel: "Delete everything", danger: true });
              if (ok2) onClearLibrary();
            }}
            disabled={totalQuizzes === 0}
            tone="danger"
          />
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-stone-300">
        <button
          onClick={async () => { const ok = await confirm({ title: "Reset settings", message: "Reset all settings to defaults?", confirmLabel: "Reset" }); if (ok) onReset(); }}
          className="mono text-xs uppercase tracking-widest text-stone-500 hover:text-red-600 transition-colors flex items-center gap-2"
        >
          <RotateCcw size={12} /> Reset settings to defaults
        </button>
      </div>
    </div>
  );
}

function ImportLibraryRow({ onImportQuizzes }) {
  const [msg, setMsg] = useState(null); // { type: 'ok' | 'err', text }
  const inputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target.result;
      const result = parseImportText(raw);
      const parseErrors = result.errors || [];
      if (result.multi) {
        const quizzes = result.quizzes || [];
        if (!quizzes.length) {
          setMsg({ type: "err", text: parseErrors.length ? parseErrors.join(" ") : "No quizzes found in that file." });
          return;
        }
        const count = await onImportQuizzes(quizzes);
        let out = `Imported ${count} ${count === 1 ? "quiz" : "quizzes"}.`;
        if (parseErrors.length) out += ` (${parseErrors.length} block${parseErrors.length === 1 ? "" : "s"} skipped.)`;
        setMsg({ type: "ok", text: out });
      } else {
        if (parseErrors.length) {
          setMsg({ type: "err", text: parseErrors.join(" ") });
          return;
        }
        if (!result.questions || !result.questions.length) {
          setMsg({ type: "err", text: "No questions found in that file." });
          return;
        }
        const count = await onImportQuizzes([{ title: result.title, description: result.description, questions: result.questions }]);
        setMsg({ type: "ok", text: `Imported ${count} quiz.` });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="p-5 flex items-start justify-between gap-6 bg-stone-50 flex-wrap">
      <div className="flex gap-3 flex-1 min-w-[240px]">
        <div className="mt-0.5 text-stone-500"><Upload size={16} /></div>
        <div>
          <div className="font-semibold">Import library from .txt</div>
          <div className="text-sm text-stone-600 mt-0.5">
            Load quizzes from a .txt backup — a single quiz or a full multi-quiz export. Imported quizzes are added to your library.
          </div>
          {msg && (
            <div className={`mono text-[10px] uppercase tracking-widest mt-2 ${msg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
              {msg.text}
            </div>
          )}
        </div>
      </div>
      <label className="flex-shrink-0 border-2 border-stone-900 px-4 py-2 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors flex items-center gap-2 cursor-pointer">
        <Upload size={12} /> Import
        <input ref={inputRef} type="file" accept=".txt,text/plain" onChange={handleFile} className="hidden" />
      </label>
    </div>
  );
}

function StatCell({ value, label, border, accent }) {
  return (
    <div className={`p-5 bg-stone-50 ${border ? "border-l-2 border-stone-900" : ""}`}>
      <div className={`display text-4xl font-black ${accent ? "text-amber-700" : ""}`}>{value}</div>
      <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mt-1">{label}</div>
    </div>
  );
}

function ActionRow({ icon, label, description, actionLabel, actionIcon, onClick, disabled, tone }) {
  const toneClasses = {
    default: "border-stone-900 hover:bg-stone-900 hover:text-stone-50",
    warning: "border-amber-700 text-amber-700 hover:bg-amber-700 hover:text-white",
    danger: "border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
  }[tone || "default"];

  return (
    <div className="p-5 flex items-start justify-between gap-6 bg-stone-50 flex-wrap">
      <div className="flex gap-3 flex-1 min-w-[240px]">
        <div className={`mt-0.5 ${tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-700" : "text-stone-500"}`}>{icon}</div>
        <div>
          <div className="font-semibold">{label}</div>
          <div className="text-sm text-stone-600 mt-0.5">{description}</div>
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`flex-shrink-0 border-2 px-4 py-2 mono text-xs uppercase tracking-widest transition-colors flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-inherit ${toneClasses}`}
      >
        {actionIcon} {actionLabel}
      </button>
    </div>
  );
}

function SettingGroup({ title, subtitle, children }) {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="display text-2xl font-bold">{title}</h2>
        {subtitle && <p className="text-stone-500 text-sm">{subtitle}</p>}
      </div>
      <div className="border-2 border-stone-900 divide-y-2 divide-stone-900">
        {children}
      </div>
    </div>
  );
}

function Toggle({ icon, label, description, value, onChange }) {
  return (
    <div className="p-5 flex items-start justify-between gap-6 bg-stone-50">
      <div className="flex gap-3 flex-1 min-w-0">
        <div className="mt-0.5 text-stone-500">{icon}</div>
        <div>
          <div className="font-semibold">{label}</div>
          <div className="text-sm text-stone-600 mt-0.5">{description}</div>
        </div>
      </div>
      <button
        onClick={onChange}
        role="switch"
        aria-checked={value}
        className={`flex-shrink-0 w-14 h-8 rounded-full transition-colors relative ${
          value ? "bg-amber-700" : "bg-stone-300"
        }`}
      >
        <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${value ? "left-7" : "left-1"}`} />
      </button>
    </div>
  );
}

function ChoiceRow({ icon, label, description, value, options, onChange }) {
  return (
    <div className="p-5 flex items-start justify-between gap-6 bg-stone-50 flex-wrap">
      <div className="flex gap-3 flex-1 min-w-[240px]">
        <div className="mt-0.5 text-stone-500">{icon}</div>
        <div>
          <div className="font-semibold">{label}</div>
          <div className="text-sm text-stone-600 mt-0.5">{description}</div>
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 mono text-xs uppercase tracking-widest border-2 transition-colors ${
              value === opt.value
                ? "bg-stone-900 text-stone-50 border-stone-900"
                : "border-stone-300 hover:border-stone-900"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ TAKE ============
function TakeView({ quiz, currentQuestion, userAnswers, selectedAnswer, setSelectedAnswer, showFeedback, submitAnswer, nextQuestion, previousQuestion, onQuit, settings, quizStartTime }) {
  const q = quiz.questions[currentQuestion];
  const progress = ((currentQuestion + 1) / quiz.questions.length) * 100;
  const isCorrect = selectedAnswer === q.correct;
  const totalAnswered = userAnswers.filter(a => a !== undefined).length;

  // When immediate feedback is on and this question has already been answered,
  // the answer is locked — you can view but not change it.
  const alreadyAnswered = userAnswers[currentQuestion] !== undefined;
  const isLocked = settings.immediateFeedback && alreadyAnswered && showFeedback;
  const isLastQuestion = currentQuestion + 1 >= quiz.questions.length;
  const allAnswered = totalAnswered === quiz.questions.length;

  // Live timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!settings.showTimer || !quizStartTime) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [settings.showTimer, quizStartTime]);
  const elapsedMs = settings.showTimer && quizStartTime ? now - quizStartTime : 0;

  // Keyboard shortcuts
  useEffect(() => {
    if (!settings.keyboardShortcuts) return;
    function handleKey(e) {
      // Ignore shortcuts if user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

      // Number keys 1-9 -> select option (bounded by option count)
      if (!showFeedback && /^[1-9]$/.test(e.key)) {
        const nIdx = parseInt(e.key, 10) - 1;
        if (nIdx < q.options.length) {
          e.preventDefault();
          setSelectedAnswer(nIdx);
        }
        return;
      }
      // A/B/C/D/... → select option (up to the current question's option count)
      const key = e.key.toLowerCase();
      if (!showFeedback && /^[a-z]$/.test(key)) {
        const idx = key.charCodeAt(0) - 97;
        if (idx < q.options.length) {
          e.preventDefault();
          setSelectedAnswer(idx);
        }
        return;
      }
      // Enter → submit or next
      if (e.key === "Enter") {
        e.preventDefault();
        if (showFeedback) {
          nextQuestion();
        } else if (selectedAnswer !== null) {
          submitAnswer();
        }
        return;
      }
      // Arrow keys → previous / next
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        previousQuestion();
      } else if (e.key === "ArrowRight" && showFeedback) {
        e.preventDefault();
        nextQuestion();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [settings.keyboardShortcuts, showFeedback, selectedAnswer, q.options.length, submitAnswer, nextQuestion, previousQuestion, setSelectedAnswer]);

  return (
    <div className="fade-up">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500">
          {quiz.title} · Question {currentQuestion + 1} of {quiz.questions.length}
        </div>
        <div className="flex items-center gap-3">
          {settings.showTimer && quizStartTime && (
            <span className="mono text-xs uppercase tracking-widest text-amber-700 flex items-center gap-1">
              <Clock size={12} /> {formatDuration(elapsedMs)}
            </span>
          )}
          <span className="mono text-xs uppercase tracking-widest text-stone-400">
            {totalAnswered} of {quiz.questions.length} answered
          </span>
          <button onClick={onQuit} className="mono text-xs uppercase tracking-widest text-stone-400 hover:text-red-600 transition-colors flex items-center gap-1">
            <X size={14} /> Quit
          </button>
        </div>
      </div>
      <div className="h-1 bg-stone-200 mb-12 relative">
        <div className="absolute inset-y-0 left-0 bg-amber-700 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="mb-10">
        <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-3 flex items-center gap-2 flex-wrap">
          <span>№ {String(currentQuestion + 1).padStart(2, "0")}</span>
          {isLocked && <span className="text-amber-700">· Already answered</span>}
          {settings.keyboardShortcuts && !isLocked && (
            <span className="text-stone-400">· A–{String.fromCharCode(64 + q.options.length)} or 1–{q.options.length} to choose · Enter to submit · ← → to navigate</span>
          )}
        </div>
        <h2 className="body-text text-3xl md:text-4xl font-bold leading-snug">{q.q}</h2>
      </div>

      <div className="space-y-3 mb-8">
        {q.options.map((opt, oi) => {
          const isSelected = selectedAnswer === oi;
          const isRight = oi === q.correct;
          let stateClasses = "border-stone-300 hover:border-stone-900 hover:bg-stone-100";
          if (showFeedback) {
            if (isRight) stateClasses = "border-emerald-600 bg-emerald-50";
            else if (isSelected) stateClasses = "border-red-600 bg-red-50";
            else stateClasses = "border-stone-200 opacity-50";
          } else if (isSelected) {
            stateClasses = "border-stone-900 bg-stone-900 text-stone-50";
          }
          return (
            <button
              key={oi}
              onClick={() => !showFeedback && setSelectedAnswer(oi)}
              disabled={showFeedback}
              className={`w-full text-left border-2 p-5 transition-all flex items-center gap-4 ${stateClasses} fade-up stagger-${Math.min(oi + 1, 4)}`}
            >
              <span className={`mono text-xs w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                showFeedback && isRight ? "bg-emerald-600 text-white" :
                showFeedback && isSelected ? "bg-red-600 text-white" :
                isSelected ? "bg-stone-50 text-stone-900" : "bg-stone-200 text-stone-700"
              }`}>
                {String.fromCharCode(65 + oi)}
              </span>
              <span className="body-text text-lg flex-1">{opt}</span>
              {showFeedback && isRight && <Check size={20} className="text-emerald-600" />}
              {showFeedback && isSelected && !isRight && <X size={20} className="text-red-600" />}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={previousQuestion}
          disabled={currentQuestion === 0}
          className="border-2 border-stone-900 px-6 py-4 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-900 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ArrowLeft size={14} /> Previous
        </button>

        {!showFeedback ? (
          <button
            onClick={submitAnswer}
            disabled={selectedAnswer === null}
            className="bg-stone-900 text-stone-50 px-8 py-4 mono text-xs uppercase tracking-widest hover:bg-amber-700 transition-colors disabled:opacity-30 disabled:hover:bg-stone-900 flex items-center gap-2"
          >
            {settings.immediateFeedback ? "Submit" : (isLastQuestion && allAnswered ? "Finish" : "Save & next")} <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={nextQuestion}
            className="bg-amber-700 text-stone-50 px-8 py-4 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2"
          >
            {isLastQuestion && allAnswered ? "See results" : (isLastQuestion ? "Go to unanswered" : "Next question")} <ArrowRight size={14} />
          </button>
        )}
      </div>

      {showFeedback && (
        <div className={`border-l-4 p-5 fade-up ${isCorrect ? "border-emerald-600 bg-emerald-50" : "border-red-600 bg-red-50"}`}>
          <div className="mono text-xs uppercase tracking-widest mb-2">
            {isCorrect ? "✓ Correct" : "✗ Not quite"}
          </div>
          {settings.showExplanations && q.explain ? (
            <p className="body-text text-stone-700 italic">{q.explain}</p>
          ) : (
            <p className="body-text text-stone-700 italic">
              The correct answer was <strong>{String.fromCharCode(65 + q.correct)}. {q.options[q.correct]}</strong>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============ RESULTS ============
function ResultsView({ quiz, userAnswers, score, elapsedMs, onRetry, onRetryMissed, onHome, settings }) {
  const total = quiz.questions.length;
  const percent = Math.round((score / total) * 100);
  const missedCount = total - score;
  let verdict = "Worth another go.";
  if (percent === 100) verdict = "Perfect. Extraordinary.";
  else if (percent >= 80) verdict = "Excellent work.";
  else if (percent >= 60) verdict = "Well done.";
  else if (percent >= 40) verdict = "Getting there.";
  else verdict = "Worth another go.";

  return (
    <div className="fade-up">
      <div className="text-center mb-12 py-8 border-y-2 border-stone-900">
        <Trophy size={40} className="mx-auto mb-4 text-amber-700" />
        <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Results</div>
        <div className="display text-8xl font-black mb-2">
          {score}<span className="text-stone-400">/{total}</span>
        </div>
        <div className="mono text-sm uppercase tracking-widest text-stone-600 mb-4">{percent}% correct</div>
        {settings && settings.showTimer && elapsedMs > 0 && (
          <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-4 flex items-center justify-center gap-2">
            <Clock size={12} /> Finished in {formatDuration(elapsedMs)}
          </div>
        )}
        <p className="display text-2xl italic text-amber-700">{verdict}</p>
      </div>

      <div className="mb-8">
        <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-4">Question by question</div>
        <div className="space-y-3">
          {quiz.questions.map((q, i) => {
            const userAns = userAnswers[i];
            const correct = userAns === q.correct;
            return (
              <div key={i} className={`border-l-4 p-4 ${correct ? "border-emerald-600 bg-emerald-50" : "border-red-600 bg-red-50"}`}>
                <div className="flex items-start gap-3">
                  <div className={`mono text-xs w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${correct ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
                    {correct ? <Check size={12} /> : <X size={12} />}
                  </div>
                  <div className="flex-1">
                    <div className="body-text font-semibold mb-1">{q.q}</div>
                    <div className="body-text text-sm text-stone-600">
                      Your answer: <span className={correct ? "text-emerald-700" : "text-red-700"}>{q.options[userAns]}</span>
                      {!correct && (<>{" · "}Correct: <span className="text-emerald-700">{q.options[q.correct]}</span></>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 justify-center flex-wrap">
        <button onClick={onRetry} className="border-2 border-stone-900 px-6 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors flex items-center gap-2">
          <RotateCcw size={14} /> Try Again
        </button>
        {missedCount > 0 && onRetryMissed && (
          <button onClick={onRetryMissed} className="border-2 border-amber-700 text-amber-700 px-6 py-3 mono text-xs uppercase tracking-widest hover:bg-amber-700 hover:text-white transition-colors flex items-center gap-2">
            <Target size={14} /> Review missed ({missedCount})
          </button>
        )}
        <button onClick={onHome} className="bg-stone-900 text-stone-50 px-6 py-3 mono text-xs uppercase tracking-widest hover:bg-amber-700 transition-colors">
          Home
        </button>
      </div>
    </div>
  );
}

// ============ MOUNT ============
const rootEl = document.getElementById("root");
createRoot(rootEl).render(<QuizApp />);
