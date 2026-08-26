import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { Plus, Trash2, Play, Edit3, Check, X, ArrowLeft, ArrowUp, ArrowDown, RotateCcw, Layers, Brain, FileText, Sparkles, Upload, Wand2, Settings, Shuffle, Info, ChevronDown, ChevronUp, Copy, Download, Search, BarChart3, Archive, Award, Clock, Moon, RefreshCw, ChevronRight, ChevronLeft } from "lucide-react";

// ============ LOCAL STORAGE SHIM ============
// Drop-in replacement for the artifact's window.storage, backed by the
// browser's localStorage. Same async interface + return shapes, so no
// component code needs to change. Data is namespaced per app so a shared
// origin won't collide with a sibling app (e.g. a quiz app).
const STORE_PREFIX = "dendrite:";
if (typeof window !== "undefined") {
  window.storage = {
    async get(key) {
      try {
        const raw = localStorage.getItem(STORE_PREFIX + key);
        return raw === null ? null : { key, value: raw };
      } catch (e) { return null; }
    },
    async set(key, value) {
      // May throw QuotaExceededError; callers already wrap in try/catch.
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

// ============ AI INSTRUCTIONS (mirrored from flashcard_ai_instructions.md) ============
const AI_INSTRUCTIONS = `Generate a set of tight, focused flashcards in plain text. Every card should test one thing about the topic, straight to the point, with the answer being the actual answer — not a paragraph about it.

DECK NAME AND DESCRIPTION — always include these, before any cards:

- Every deck MUST begin with a Name line and a Description line, in that order, before the cards. They are required, not optional.

- Name: a short, specific title in Title Case. Name the actual subject (e.g., "The Krebs Cycle", "Spanish Verbs — Present Tense"). Title Case, no surrounding quotes, no trailing punctuation, under about 60 characters. Prefer a real subject over a vague label.

- Description: exactly one sentence stating what the deck covers, ending in a period. Plain and informative — no marketing language, no "This deck will help you…" filler.

CARD QUALITY REQUIREMENTS — these are critical:

- One question per card. Each card tests exactly one thing. Never combine two prompts with "and" or "also" (e.g., no "What is X and how does Y work?"). If two ideas matter, make two cards.

- Straight to the point. Questions are short and direct. Cut every word that isn't needed. Set-up, scene-setting, filler phrases like "Can you tell me..." or "In your own words..." — all of it goes. If a question works in six words, don't use twelve.

- The answer IS the answer. The flip side gives the exact answer — the term, the number, the name, the definition — and nothing more. No explanations, no context, no "because..." trailing on the end, no teaching paragraphs. A card is not a mini-lesson; it's a prompt and a response.

- Short answers. Most answers should be a word, a phrase, a single sentence at most. If an answer genuinely needs more than one sentence (rare), keep it to two. Never three.

- One concept per card. One question, one answer, one thing being tested. Don't pack related facts together.

- Active recall. Phrase questions so the learner must retrieve the answer, not recognize it. "Capital of France?" is better than "Is Paris the capital of France?"

- Prefer "what / who / when / where / how / why" over yes/no. Yes/no questions test recognition, not recall.

- Specific and unambiguous. Each question has one clear answer. Avoid vague prompts that could be answered several different ways.

- Varied question types across the deck. Mix definitions, identifications, dates, quantities, causes, sequences, and terms. Don't ask the same shape of question ten times in a row.

- Progressive difficulty. Start with foundational facts, build to relationships. A learner going through the deck in order should feel their understanding compound.

- Broad coverage, moderate depth. Cover different angles and subtopics, but don't go to specialist trivia. Test solid working knowledge.

STRUCTURAL RULES:
- Start with a "Name:" line, then a "Description:" line, then a blank line, then the cards.
- Each card has exactly two parts: a "Q:" line and an "A:" line.
- Separate cards with a single blank line between them.
- No numbering, no bullet points, no markdown, no headers, no commentary.
- Output only the Name/Description header and the Q:/A: pairs.

FORMAT:
Name: [short, specific deck title in Title Case]
Description: [one sentence describing what the deck covers]

Q: [short, direct question]
A: [the actual answer — brief]

Q: [short, direct question]
A: [the actual answer — brief]

GOOD vs BAD — study the difference:

BAD (no header, wordy, multi-part, explanatory answer):
Q: Can you describe what the mitochondria does in the cell, and why it is often called the powerhouse of the cell?
A: The mitochondria is an organelle found in eukaryotic cells that produces ATP through cellular respiration. It is called the powerhouse of the cell because it generates most of the cell's supply of adenosine triphosphate, which is used as a source of chemical energy.

GOOD (header present, tight question, the answer IS the answer):
Name: Cell Biology — The Mitochondria
Description: Structure and function of the mitochondria in eukaryotic cells.

Q: What does the mitochondria produce?
A: ATP.

Q: Why is the mitochondria called the powerhouse of the cell?
A: It generates most of the cell's ATP.

CHECKS FOR EVERY DECK:
1. Header present? A "Name:" line in Title Case and a one-sentence "Description:" line, both before any cards.
2. Is each question one question, not two?
3. Is each answer the actual answer, not an explanation of it?
4. Could anything be cut without losing the point?
If any answer is "no," fix it.`;

// ============ DEFAULTS & STORAGE KEYS ============
const DECKS_PREFIX = "deck:";
const SETTINGS_KEY = "settings:main";
const STATS_PREFIX = "stats:";
const LEGACY_STORAGE_KEY = "flashcard-decks-v2";
const MAX_CARDS = 1000;
const RENDER_BATCH = 50;

const DEFAULT_SETTINGS = {
  shuffleCards: false,
  darkMode: false,
  showTimer: false,
  fontSize: "normal", // small | normal | large
  keyboardShortcuts: true,
};

const SAMPLE_DECK = {
  id: "sample-foundations",
  name: "A Tour of Human Anatomy",
  description: "Twelve tight cards covering organs, systems, and bodily functions — a solid starting set for any biology student. (Sample deck)",
  created: Date.now(),
  cards: [
    { id: "c1", front: "Largest organ in the human body?", back: "The skin." },
    { id: "c2", front: "What do red blood cells carry?", back: "Oxygen." },
    { id: "c3", front: "Where does digestion begin?", back: "The mouth." },
    { id: "c4", front: "Which hormone from the pancreas lowers blood sugar?", back: "Insulin." },
    { id: "c5", front: "How many chambers does the human heart have?", back: "Four." },
    { id: "c6", front: "Primary function of the kidneys?", back: "Filter waste from the blood." },
    { id: "c7", front: "What separates the chest cavity from the abdominal cavity?", back: "The diaphragm." },
    { id: "c8", front: "Which part of the brain controls balance and coordination?", back: "The cerebellum." },
    { id: "c9", front: "Longest bone in the human body?", back: "The femur." },
    { id: "c10", front: "Where does gas exchange occur in the lungs?", back: "The alveoli." },
    { id: "c11", front: "Which vessels carry blood away from the heart?", back: "Arteries." },
    { id: "c12", front: "What is homeostasis?", back: "The body's maintenance of stable internal conditions." },
  ].map(c => ({ ...c, sr: { interval: 0, easeFactor: 2.5, repetitions: 0 }, nextReviewDate: 0 }))
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

function nextReview(card, quality) {
  let { interval = 0, easeFactor = 2.5, repetitions = 0 } = card.sr || {};
  if (quality >= 3) {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * easeFactor);
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  } else {
    repetitions = 0;
    interval = 0;
  }
  return {
    sr: { interval, easeFactor, repetitions },
    nextReviewDate: Date.now() + interval * 86400000,
  };
}

function dueCards(cards) {
  return cards.filter((c) => !c.nextReviewDate || c.nextReviewDate <= Date.now());
}

function masteredCount(cards) {
  return cards.filter((c) => (c.sr?.repetitions || 0) >= 3).length;
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

// ============ PARSE & SERIALIZE ============
function parseTxt(text) {
  const cards = [];
  const blocks = text.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    let front = "", back = "", readingBack = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^Q:\s*/i.test(trimmed)) { front = trimmed.replace(/^Q:\s*/i, ""); readingBack = false; }
      else if (/^A:\s*/i.test(trimmed)) { back = trimmed.replace(/^A:\s*/i, ""); readingBack = true; }
      else if (readingBack && trimmed) { back += " " + trimmed; }
      else if (!readingBack && front && trimmed) { front += " " + trimmed; }
    }
    if (front && back) cards.push({ front: front.trim(), back: back.trim() });
  }
  return cards;
}

// Parse a single deck block — extracts Name:/Title:, Description:, and Q:/A: pairs
function parseSingleDeckText(text) {
  const errors = [];
  let name = "";
  let description = "";
  const lines = text.split(/\r?\n/);
  const contentLines = [];

  let sawHeaderSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Accept either "Name:" or "Title:" for the deck title, for forgiveness.
    const nameMatch = trimmed.match(/^(?:Name|Title)\s*:\s*(.+)$/i);
    const descMatch = trimmed.match(/^Description\s*:\s*(.+)$/i);
    if (nameMatch && !sawHeaderSection) {
      name = nameMatch[1].trim();
      continue;
    }
    if (descMatch && !sawHeaderSection) {
      description = descMatch[1].trim();
      continue;
    }
    // Once we hit a Q: line, we stop treating the top as header
    if (/^Q:\s*/i.test(trimmed)) sawHeaderSection = true;
    contentLines.push(line);
  }

  const cards = parseTxt(contentLines.join("\n"));
  if (cards.length === 0) errors.push("No valid flashcards found. Use Q:/A: format separated by blank lines.");

  return { name: name || "Imported Deck", description, cards, errors };
}

// Parse either single or multi-deck export files
function parseImportText(text) {
  let working = text;
  if (/^\s*Dendrite Library Export/i.test(working)) {
    const firstSep = working.search(/^={5,}\s*$/m);
    if (firstSep !== -1) working = working.slice(firstSep);
  }

  const sections = working
    .split(/^={5,}\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sections.length <= 1) {
    return parseSingleDeckText(working);
  }

  const decks = [];
  const allErrors = [];
  sections.forEach((section, idx) => {
    const result = parseSingleDeckText(section);
    if (result.errors.length > 0) {
      result.errors.forEach(err => allErrors.push(`Deck ${idx + 1} (${result.name}): ${err}`));
    } else {
      decks.push({ name: result.name, description: result.description, cards: result.cards });
    }
  });

  return { multi: true, decks, errors: allErrors };
}

function serializeDeckToText(deck) {
  const lines = [];
  lines.push(`Name: ${deck.name}`);
  if (deck.description) lines.push(`Description: ${deck.description}`);
  lines.push("");
  deck.cards.forEach((c, i) => {
    lines.push(`Q: ${c.front}`);
    lines.push(`A: ${c.back}`);
    if (i < deck.cards.length - 1) lines.push("");
  });
  return lines.join("\n");
}

function downloadDeck(deck) {
  const text = serializeDeckToText(deck);
  const safeName = (deck.name || "deck")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "deck";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadAllDecks(decks) {
  if (!decks || decks.length === 0) return;
  const separator = "\n\n" + "=".repeat(60) + "\n\n";
  const parts = decks.map(d => serializeDeckToText(d));
  const text = `Cardly Library Export\nExported: ${new Date().toISOString()}\nDecks: ${decks.length}\n` + separator + parts.join(separator);
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dendrite-library-${date}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============ PROGRESSIVE RENDER HOOK ============
function useProgressiveRender(totalCount) {
  const [visibleCount, setVisibleCount] = useState(Math.min(RENDER_BATCH, totalCount));
  const sentinelRef = useRef(null);

  useEffect(() => {
    setVisibleCount(Math.min(RENDER_BATCH, totalCount));
  }, [totalCount]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= totalCount) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((v) => Math.min(v + RENDER_BATCH, totalCount));
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCount, totalCount]);

  return { visibleCount, sentinelRef };
}

// ============ MAIN APP ============
function FlashcardApp() {
  const [view, setView] = useState("home");
  const [createMode, setCreateMode] = useState("manual");
  const [decks, setDecks] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activeDeck, setActiveDeck] = useState(null);
  const [originalDeck, setOriginalDeck] = useState(null);
  const [reviewMode, setReviewMode] = useState("flip");
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [finalElapsedMs, setFinalElapsedMs] = useState(0);
  const [stats, setStats] = useState({});
  const [editingDeck, setEditingDeck] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        try {
          const sr = await window.storage.get(SETTINGS_KEY);
          if (sr) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(sr.value) });
        } catch (e) {}

        // Load decks (check new-format first, fall back to legacy)
        let loaded = [];
        try {
          const list = await window.storage.list(DECKS_PREFIX);
          if (list && list.keys && list.keys.length > 0) {
            for (const key of list.keys) {
              try {
                const r = await window.storage.get(key);
                if (r) loaded.push(JSON.parse(r.value));
              } catch (e) {}
            }
          }
        } catch (e) {}

        // Legacy migration
        if (loaded.length === 0) {
          try {
            const legacy = await window.storage.get(LEGACY_STORAGE_KEY);
            if (legacy) {
              const legacyDecks = JSON.parse(legacy.value);
              if (Array.isArray(legacyDecks) && legacyDecks.length > 0) {
                for (const d of legacyDecks) {
                  const migrated = { ...d, description: d.description || "", created: d.createdAt || d.created || Date.now() };
                  await window.storage.set(DECKS_PREFIX + migrated.id, JSON.stringify(migrated));
                  loaded.push(migrated);
                }
              }
            }
          } catch (e) {}
        }

        if (loaded.length === 0) {
          await window.storage.set(DECKS_PREFIX + SAMPLE_DECK.id, JSON.stringify(SAMPLE_DECK));
          loaded = [SAMPLE_DECK];
        }
        setDecks(loaded);

        // Load stats
        try {
          const statsList = await window.storage.list(STATS_PREFIX);
          if (statsList && statsList.keys) {
            const s = {};
            for (const key of statsList.keys) {
              try {
                const r = await window.storage.get(key);
                if (r) s[key.replace(new RegExp("^" + STATS_PREFIX), "")] = JSON.parse(r.value);
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
    try { await window.storage.set(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
  }

  async function saveDeck(deck) {
    try {
      await window.storage.set(DECKS_PREFIX + deck.id, JSON.stringify(deck));
      setDecks(prev => {
        const idx = prev.findIndex(d => d.id === deck.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = deck;
          return copy;
        }
        return [...prev, deck];
      });
    } catch (e) { console.error(e); }
  }

  async function deleteDeck(id) {
    try {
      await window.storage.delete(DECKS_PREFIX + id);
      await window.storage.delete(STATS_PREFIX + id);
    } catch (e) {}
    // Update UI regardless of storage result so delete always takes effect.
    setDecks(prev => prev.filter(d => d.id !== id));
    setStats(prev => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function clearLibrary() {
    try {
      const list = await window.storage.list(DECKS_PREFIX);
      if (list && list.keys) {
        for (const key of list.keys) await window.storage.delete(key);
      }
      const statsList = await window.storage.list(STATS_PREFIX);
      if (statsList && statsList.keys) {
        for (const key of statsList.keys) await window.storage.delete(key);
      }
    } catch (e) { console.error(e); }
    setDecks([]);
    setStats({});
  }

  async function clearStats() {
    try {
      const statsList = await window.storage.list(STATS_PREFIX);
      if (statsList && statsList.keys) {
        for (const key of statsList.keys) await window.storage.delete(key);
      }
    } catch (e) {}
    setStats({});
  }

  async function recordSession(deckId, sessionStats, elapsedMs) {
    const { easy = 0, good = 0, hard = 0, again = 0 } = sessionStats;
    const total = easy + good + hard + again;
    if (total === 0) return;
    const accuracy = Math.round(((easy + good) / total) * 100);
    const now = Date.now();
    const key = STATS_PREFIX + deckId;
    let s = { sessions: 0, bestAccuracy: 0, lastAccuracy: 0, lastStudiedAt: 0, recent: [] };
    try {
      const existing = await window.storage.get(key);
      if (existing) s = { recent: [], ...JSON.parse(existing.value) };
    } catch (e) {}
    s.sessions = (s.sessions || 0) + 1;
    s.bestAccuracy = Math.max(s.bestAccuracy || 0, accuracy);
    s.lastAccuracy = accuracy;
    s.lastStudiedAt = now;
    s.recent = [{ easy, good, hard, again, total, accuracy, studiedAt: now, elapsedMs: elapsedMs || 0 }, ...(s.recent || [])].slice(0, 10);
    try { await window.storage.set(key, JSON.stringify(s)); } catch (e) {}
    setStats(prev => ({ ...prev, [deckId]: s }));
  }

  async function resetDeckStats(deckId) {
    try { await window.storage.delete(STATS_PREFIX + deckId); } catch (e) {}
    setStats(prev => {
      const { [deckId]: _removed, ...rest } = prev;
      return rest;
    });
  }

  // Import one or more parsed decks (additive — assigns fresh ids). Returns count.
  async function importDecks(parsedDecks) {
    const now = Date.now();
    const toSave = parsedDecks.map((p, idx) => ({
      id: "deck-" + (now + idx),
      name: p.name,
      description: p.description || "",
      created: now + idx,
      cards: p.cards.slice(0, MAX_CARDS).map((c, ci) => ({
        id: `${now + idx}-${ci}`,
        front: c.front,
        back: c.back,
        sr: { interval: 0, easeFactor: 2.5, repetitions: 0 },
        nextReviewDate: 0,
      })),
    }));
    for (const d of toSave) await saveDeck(d);
    return toSave.length;
  }

  function startReview(deck, mode) {
    setOriginalDeck(deck);
    setActiveDeck(deck);
    setReviewMode(mode);
    setSessionStartTime(Date.now());
    setFinalElapsedMs(0);
    setView("review");
    // Record last-opened timestamp
    const updated = { ...deck, lastOpenedAt: Date.now() };
    saveDeck(updated);
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

        @keyframes cardFlip {
          0% { transform: rotateY(0deg); opacity: 1; }
          50% { transform: rotateY(90deg); opacity: 0.3; }
          100% { transform: rotateY(0deg); opacity: 1; }
        }
        .card-flip { animation: cardFlip 0.4s ease-in-out; }

        @media (prefers-reduced-motion: reduce) {
          .fade-up, .card-flip { animation: none !important; }
        }

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

        .dark header.bg-stone-50 { background-color: #1c1917 !important; }

        .dark .hover\\:bg-stone-100:hover { background-color: #292524 !important; }
        .dark .hover\\:bg-stone-200:hover { background-color: #44403c !important; }
        .dark .hover\\:bg-stone-900:hover { background-color: #f5f5f4 !important; color: #1c1917 !important; }

        .dark .bg-emerald-50 { background-color: #064e3b !important; }
        .dark .bg-red-50 { background-color: #7f1d1d !important; }
        .dark .bg-amber-50 { background-color: #78350f !important; }
        .dark .bg-blue-50 { background-color: #1e3a8a !important; }
        .dark .text-emerald-700 { color: #34d399 !important; }
        .dark .text-red-700 { color: #fca5a5 !important; }
        .dark .text-red-600 { color: #fca5a5 !important; }
        .dark .text-amber-700 { color: #fbbf24 !important; }
        .dark .text-blue-700 { color: #93c5fd !important; }

        .dark input, .dark textarea, .dark select { background-color: #292524 !important; color: #f5f5f4 !important; }
        .dark input::placeholder, .dark textarea::placeholder { color: #78716c !important; }
        .dark pre { background-color: #292524 !important; color: #d6d3d1 !important; }

        .dark-card { background-color: #1c1917; color: #f5f5f4; }
        .dark .dark-card { background-color: #0c0a09; color: #f5f5f4; }
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

        .dark .bg-gradient-to-br { background: linear-gradient(to bottom right, #78350f, #1c1917) !important; }

        *:focus-visible { outline: 2px solid #b45309; outline-offset: 2px; }
      `}</style>

      <ConfirmProvider>
        <header className="border-b-2 border-stone-900 bg-stone-50 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <button onClick={() => setView("home")} className="flex items-center gap-3 group">
              <div className="w-9 h-9 bg-stone-900 text-stone-50 flex items-center justify-center group-hover:bg-amber-600 transition-colors">
                <Layers size={18} />
              </div>
              <div className="text-left">
                <div className="display text-xl font-bold leading-none">Cardly</div>
                <div className="mono text-[10px] text-stone-500 tracking-widest uppercase mt-1">
                  {decks.length} {decks.length === 1 ? "deck" : "decks"} · {decks.reduce((s, d) => s + d.cards.length, 0)} cards
                </div>
              </div>
            </button>
            <nav className="flex gap-1 flex-wrap justify-end">
              <NavButton active={view === "home"} onClick={() => setView("home")}>Home</NavButton>
              <NavButton active={view === "browse"} onClick={() => setView("browse")}>Library ({decks.length})</NavButton>
              <NavButton active={view === "create"} onClick={() => { setEditingDeck(null); setCreateMode("manual"); setView("create"); }}>Create</NavButton>
              <NavButton active={view === "settings"} onClick={() => setView("settings")}><Settings size={12} /></NavButton>
            </nav>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-12">
          {view === "home" && <HomeView decks={decks} stats={stats} onStart={startReview} onCreate={() => { setEditingDeck(null); setCreateMode("manual"); setView("create"); }} onBrowse={() => setView("browse")} />}
          {view === "browse" && <BrowseView decks={decks} stats={stats} onStart={startReview} onEdit={(d) => { setEditingDeck(d); setCreateMode("manual"); setView("create"); }} onDelete={deleteDeck} onCreate={() => { setEditingDeck(null); setCreateMode("manual"); setView("create"); }} onResetStats={resetDeckStats} />}
          {view === "create" && <CreateHub mode={createMode} setMode={setCreateMode} initial={editingDeck} onSave={async (d) => { await saveDeck(d); setView("browse"); }} onSaveMany={async (ds) => { for (const d of ds) await saveDeck(d); setView("browse"); }} onCancel={() => setView("browse")} />}
          {view === "settings" && <SettingsView settings={settings} decks={decks} stats={stats} onChange={saveSettings} onReset={() => saveSettings(DEFAULT_SETTINGS)} onClearLibrary={clearLibrary} onClearStats={clearStats} onImportDecks={importDecks} />}
          {view === "review" && activeDeck && (
            <ReviewView
              deck={activeDeck}
              mode={reviewMode}
              settings={settings}
              sessionStartTime={sessionStartTime}
              onFinish={(sessionStats) => {
                const elapsed = sessionStartTime ? Date.now() - sessionStartTime : 0;
                setFinalElapsedMs(elapsed);
                if (originalDeck) recordSession(originalDeck.id, sessionStats, elapsed);
              }}
              onUpdateCard={(cardId, update) => {
                if (!originalDeck) return;
                const updatedDeck = { ...originalDeck, cards: originalDeck.cards.map(c => c.id === cardId ? { ...c, ...update } : c) };
                setOriginalDeck(updatedDeck);
                setActiveDeck(prev => ({ ...prev, cards: prev.cards.map(c => c.id === cardId ? { ...c, ...update } : c) }));
                // Fire-and-forget persist: do NOT await, so the next card shows instantly.
                saveDeck(updatedDeck);
              }}
              onQuit={() => setView("browse")}
              onHome={() => setView("home")}
              finalElapsedMs={finalElapsedMs}
            />
          )}
        </main>

        <footer className="border-t border-stone-300 mt-24 py-8 text-center mono text-xs text-stone-500 tracking-widest uppercase">
          Question · Recall · Remember
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
function HomeView({ decks, stats, onStart, onCreate, onBrowse }) {
  const featured = decks.length === 0
    ? null
    : [...decks].sort((a, b) => {
        const aTime = a.lastOpenedAt || a.created || 0;
        const bTime = b.lastOpenedAt || b.created || 0;
        return bTime - aTime;
      })[0];
  const featuredStats = featured ? stats[featured.id] : null;
  const hasSessions = featuredStats && featuredStats.sessions > 0;
  const hasBeenOpened = featured && featured.lastOpenedAt;
  const due = featured ? dueCards(featured.cards).length : 0;

  return (
    <div className="fade-up">
      <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-4">Cardly</div>
      <h1 className="display text-6xl sm:text-7xl md:text-8xl font-black leading-[0.9] mb-6 tracking-tight">
        Cards for <span className="italic text-amber-700">remembering.</span>
      </h1>
      <p className="text-xl text-stone-600 max-w-2xl mb-12 leading-relaxed">
        Build flashcard decks by hand or import them. Study with flip review or a spaced repetition schedule.
      </p>

      <div className="grid md:grid-cols-2 gap-6 mb-16">
        <button onClick={onBrowse} className="group text-left bg-stone-900 text-stone-50 p-8 hover:bg-amber-700 transition-all fade-up stagger-1">
          <Play size={28} className="mb-4" />
          <div className="display text-3xl font-bold mb-2">Study a deck</div>
          <div className="text-stone-400 group-hover:text-stone-100">
            {decks.length} {decks.length === 1 ? "deck" : "decks"} waiting in your library.
          </div>
        </button>
        <button onClick={onCreate} className="group text-left border-2 border-stone-900 p-8 hover:bg-stone-900 hover:text-stone-50 transition-all fade-up stagger-2">
          <Sparkles size={28} className="mb-4 group-hover:text-amber-400" />
          <div className="display text-3xl font-bold mb-2">Build a deck</div>
          <div className="text-stone-600 group-hover:text-stone-300">Write cards by hand or import them from text.</div>
        </button>
      </div>

      {featured && (
        <div className="border-t-2 border-stone-900 pt-8 fade-up stagger-3">
          <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-4">
            {hasSessions ? "Pick up where you left off" : "From your library"}
          </div>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="display text-5xl font-bold mb-3">{featured.name}</h2>
              {featured.description && <p className="text-stone-600 text-lg mb-2">{featured.description}</p>}
              <div className="mono text-xs text-stone-500 uppercase tracking-widest">
                {featured.cards.length} {featured.cards.length === 1 ? "card" : "cards"}
                {due > 0 && <> · <span className="text-amber-700">{due} due</span></>}
                {hasBeenOpened && <> · Opened {formatRelativeTime(featured.lastOpenedAt)}</>}
                {hasSessions && <> · Best {featuredStats.bestAccuracy}%</>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => onStart(featured, "flip")}
                className="border-2 border-stone-900 px-6 py-4 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={14} /> Flip review
              </button>
              <button
                onClick={() => onStart(featured, "spaced")}
                className="bg-amber-700 text-stone-50 px-6 py-4 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2"
              >
                <Brain size={14} /> Spaced {due > 0 && `(${due})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ BROWSE ============
function BrowseView({ decks, stats, onStart, onEdit, onDelete, onCreate, onResetStats }) {
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [expandedStats, setExpandedStats] = useState(null);

  if (decks.length === 0) {
    return (
      <div className="text-center py-24 fade-up">
        <Layers size={48} className="mx-auto mb-4 text-stone-400" />
        <div className="display text-3xl font-bold mb-2">Library is empty</div>
        <p className="text-stone-600 mb-6">Create your first deck to get started.</p>
        <button onClick={onCreate} className="bg-stone-900 text-stone-50 px-6 py-3 mono text-xs uppercase tracking-widest hover:bg-amber-700 transition-colors">
          Create a deck
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  let filtered = q
    ? decks.filter(d => d.name.toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q))
    : decks;

  const sorted = [...filtered].sort((a, b) => {
    const sa = stats[a.id] || {};
    const sb = stats[b.id] || {};
    switch (sort) {
      case "oldest": return (a.created || 0) - (b.created || 0);
      case "title": return a.name.localeCompare(b.name);
      case "size": return b.cards.length - a.cards.length;
      case "best": return (sb.bestAccuracy || -1) - (sa.bestAccuracy || -1);
      case "due": return dueCards(b.cards).length - dueCards(a.cards).length;
      case "newest":
      default: return (b.created || 0) - (a.created || 0);
    }
  });

  return (
    <div className="fade-up">
      <div className="flex items-end justify-between mb-8 border-b-2 border-stone-900 pb-4 gap-4 flex-wrap">
        <div>
          <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Your decks</div>
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
            placeholder="Search by name or description..."
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
          <option value="title">Name A–Z</option>
          <option value="size">Most cards</option>
          <option value="due">Most due</option>
          <option value="best">Best score</option>
        </select>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-stone-300">
          <div className="mono text-xs uppercase tracking-widest text-stone-500">No decks match "{query}"</div>
        </div>
      )}

      <div className="grid gap-4">
        {sorted.map((deck, i) => {
          const s = stats[deck.id] || {};
          const hasStats = s.sessions > 0;
          const isExpanded = expandedStats === deck.id;
          const due = dueCards(deck.cards).length;
          const mastered = masteredCount(deck.cards);
          return (
            <div key={deck.id} className={`group border-2 border-stone-900 transition-colors fade-up stagger-${Math.min(i + 1, 4)} ${isExpanded ? "bg-stone-50" : "hover:bg-stone-100"}`}>
              <div className="p-6">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                      {deck.lastOpenedAt ? `Last opened ${formatRelativeTime(deck.lastOpenedAt)}` : deck.created ? `Created ${formatRelativeTime(deck.created)}` : "New"}
                    </div>
                    <h3 className="display text-3xl font-bold mb-2">{deck.name}</h3>
                    {deck.description && <p className="text-stone-600 mb-2">{deck.description}</p>}
                    <div className="mono text-xs text-stone-500 uppercase tracking-widest flex gap-4 flex-wrap items-center">
                      <span>{deck.cards.length} {deck.cards.length === 1 ? "card" : "cards"}</span>
                      <span className="text-stone-400">·</span>
                      <span className={due > 0 ? "text-amber-700" : ""}>{due} due</span>
                      <span className="text-stone-400">·</span>
                      <span className="text-emerald-700">{mastered} mastered</span>
                      {hasStats && (
                        <>
                          <span className="text-stone-400">·</span>
                          <span>{s.sessions} {s.sessions === 1 ? "session" : "sessions"}</span>
                          <span className="text-amber-700">Best {s.bestAccuracy}%</span>
                          <button
                            onClick={() => setExpandedStats(isExpanded ? null : deck.id)}
                            className="text-stone-700 hover:text-amber-700 flex items-center gap-1 underline"
                          >
                            {isExpanded ? <>Hide stats <ChevronUp size={12} /></> : <>View stats <ChevronDown size={12} /></>}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => onStart(deck, "flip")}
                      className="border-2 border-stone-900 px-4 py-2 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors flex items-center gap-1"
                      title="Flip review — go through all cards"
                    >
                      <RefreshCw size={12} /> Flip
                    </button>
                    <button
                      onClick={() => onStart(deck, "spaced")}
                      className="bg-amber-700 text-stone-50 px-4 py-2 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-1"
                      title="Spaced repetition — review only cards due today"
                    >
                      <Brain size={12} /> Spaced {due > 0 && <span className="bg-stone-50 text-amber-700 px-1 -my-0.5 ml-1">{due}</span>}
                    </button>
                    <button
                      onClick={() => onEdit(deck)}
                      className="border-2 border-stone-300 text-stone-500 px-3 py-2 hover:border-stone-900 hover:text-stone-900 transition-colors"
                      title="Edit"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => downloadDeck(deck)}
                      title="Download as .txt"
                      className="border-2 border-stone-300 text-stone-500 px-3 py-2 hover:border-stone-900 hover:text-stone-900 transition-colors"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirm({ title: "Delete deck", message: `Delete "${deck.name}"? This cannot be undone.`, confirmLabel: "Delete", danger: true });
                        if (ok) onDelete(deck.id);
                      }}
                      title="Delete"
                      className="border-2 border-stone-300 text-stone-500 px-3 py-2 hover:border-red-600 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {isExpanded && hasStats && (
                <DeckStatsPanel
                  deckName={deck.name}
                  stats={s}
                  onReset={async () => {
                    const ok = await confirm({ title: "Reset stats", message: `Reset stats for "${deck.name}"? This cannot be undone. The deck itself will be kept.`, confirmLabel: "Reset stats", danger: true });
                    if (ok) {
                      onResetStats(deck.id);
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

function DeckStatsPanel({ deckName, stats, onReset }) {
  const recent = (stats.recent || []).slice(0, 10);
  const average = recent.length > 0
    ? Math.round(recent.reduce((sum, r) => sum + r.accuracy, 0) / recent.length)
    : 0;

  const chrono = [...recent].reverse();
  const maxH = 40;
  const barWidth = chrono.length > 0 ? Math.max(6, Math.min(24, Math.floor(240 / chrono.length) - 2)) : 0;

  return (
    <div className="border-t-2 border-stone-900 p-6 bg-white fade-up">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="mono text-xs uppercase tracking-widest text-stone-500 flex items-center gap-2">
          <BarChart3 size={14} /> Stats for this deck
        </div>
        <button
          onClick={onReset}
          className="mono text-xs uppercase tracking-widest border-2 border-red-600 text-red-600 px-3 py-1 hover:bg-red-600 hover:text-white transition-colors flex items-center gap-1"
        >
          <RotateCcw size={10} /> Reset stats
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-2 border-stone-900 mb-6">
        <StatCell value={stats.sessions || 0} label="Sessions" />
        <StatCell value={(stats.bestAccuracy || 0) + "%"} label="Best" border accent />
        <StatCell value={(stats.lastAccuracy || 0) + "%"} label="Last" border />
        <StatCell value={average + "%"} label="Recent avg" border />
      </div>

      {chrono.length > 0 && (
        <div className="mb-6">
          <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-3">
            Recent trend ({chrono.length} {chrono.length === 1 ? "session" : "sessions"}, oldest → newest)
          </div>
          <div className="flex items-end gap-1 h-12 border-b border-stone-300 pb-0">
            {chrono.map((r, idx) => {
              const h = Math.max(3, Math.round((r.accuracy / 100) * maxH));
              const color = r.accuracy >= 80 ? "bg-emerald-600" : r.accuracy >= 60 ? "bg-amber-600" : r.accuracy >= 40 ? "bg-amber-400" : "bg-red-500";
              return (
                <div
                  key={idx}
                  title={`${r.accuracy}% (${r.easy + r.good} of ${r.total}) · ${formatRelativeTime(r.studiedAt)}`}
                  className={`${color} transition-all`}
                  style={{ width: barWidth + "px", height: h + "px" }}
                />
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-3">Recent sessions</div>
        <div className="space-y-1">
          {recent.map((r, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 px-3 border border-stone-200 bg-stone-50 text-sm flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="mono text-xs text-stone-500 w-8">#{stats.sessions - idx}</span>
                <span className={`mono text-xs font-semibold ${
                  r.accuracy >= 80 ? "text-emerald-700" :
                  r.accuracy >= 60 ? "text-amber-700" :
                  r.accuracy >= 40 ? "text-amber-600" :
                  "text-red-600"
                }`}>
                  {r.accuracy}%
                </span>
                <span className="text-stone-600 text-xs">
                  {r.easy}e · {r.good}g · {r.hard}h · {r.again}a
                </span>
              </div>
              <span className="mono text-xs text-stone-500">{formatRelativeTime(r.studiedAt)}</span>
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
        <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">{initial ? "Editing" : "New deck"}</div>
        <h1 className="display text-5xl font-black">{initial ? "Edit Deck" : "Create a Deck"}</h1>
      </div>

      {!initial && (
        <div className="grid grid-cols-2 gap-0 mb-8 border-2 border-stone-900">
          <ModeTab active={mode === "manual"} onClick={() => setMode("manual")} icon={<Edit3 size={16} />} label="Manual" subtitle="Build each card by hand" />
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
  const confirm = useConfirm();
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [cards, setCards] = useState(
    initial?.cards || [{ id: "new-1", front: "", back: "", sr: { interval: 0, easeFactor: 2.5, repetitions: 0 }, nextReviewDate: 0 }]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [saveError, setSaveError] = useState("");

  const { visibleCount, sentinelRef } = useProgressiveRender(cards.length);

  function updateCard(i, patch) {
    setCards(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addCard() {
    if (cards.length >= MAX_CARDS) return;
    setCards(prev => [...prev, {
      id: "new-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      front: "", back: "",
      sr: { interval: 0, easeFactor: 2.5, repetitions: 0 }, nextReviewDate: 0
    }]);
  }
  function removeCard(i) {
    if (cards.length === 1) return;
    setCards(prev => prev.filter((_, idx) => idx !== i));
  }
  function moveCard(i, direction) {
    const targetIdx = direction === "up" ? i - 1 : i + 1;
    if (targetIdx < 0 || targetIdx >= cards.length) return;
    setCards(prev => {
      const copy = [...prev];
      [copy[i], copy[targetIdx]] = [copy[targetIdx], copy[i]];
      return copy;
    });
  }
  async function resetProgress() {
    const ok = await confirm({ title: "Reset progress", message: "Reset review progress for all cards in this deck? Your cards and edits will be kept.", confirmLabel: "Reset" });
    if (!ok) return;
    setCards(prev => prev.map(c => ({ ...c, sr: { interval: 0, easeFactor: 2.5, repetitions: 0 }, nextReviewDate: 0 })));
  }

  function handleSave() {
    if (!name.trim()) {
      setSaveError("Please give your deck a name.");
      return;
    }
    const incompleteIdx = cards.findIndex(c => !c.front.trim() || !c.back.trim());
    if (incompleteIdx !== -1) {
      const c = cards[incompleteIdx];
      if (!c.front.trim()) setSaveError(`Card ${incompleteIdx + 1} is missing its question.`);
      else setSaveError(`Card ${incompleteIdx + 1} is missing its answer.`);
      return;
    }
    setSaveError("");
    onSave({
      id: initial?.id || "deck-" + Date.now(),
      name: name.trim(),
      description: description.trim(),
      created: initial?.created || Date.now(),
      lastOpenedAt: initial?.lastOpenedAt,
      cards: cards.map(c => ({
        ...c,
        front: c.front.trim(),
        back: c.back.trim(),
      }))
    });
  }

  const q = searchQuery.trim().toLowerCase();
  const filteredIndices = q
    ? cards.map((c, i) => (c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) ? i : -1).filter(i => i !== -1)
    : cards.map((_, i) => i);
  const displayIndices = filteredIndices.slice(0, visibleCount);

  return (
    <div>
      <div className="flex justify-end gap-2 mb-6 flex-wrap">
        <button onClick={onCancel} className="border-2 border-stone-900 px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors">Cancel</button>
        <button onClick={handleSave} className="bg-amber-700 text-stone-50 px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2">
          <Check size={14} /> Save Deck
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
          <label className="mono text-xs uppercase tracking-widest text-stone-500 block mb-2">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Spanish Vocabulary"
            className="w-full display text-4xl font-bold bg-transparent border-b-2 border-stone-300 focus:border-stone-900 outline-none pb-2 placeholder:text-stone-300"
          />
        </div>
        <div>
          <label className="mono text-xs uppercase tracking-widest text-stone-500 block mb-2">Description (optional)</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What's this deck about?"
            className="w-full text-lg bg-transparent border-b-2 border-stone-300 focus:border-stone-900 outline-none pb-2 placeholder:text-stone-300"
          />
        </div>
      </div>

      {initial && cards.length > 0 && (
        <div className="mb-4">
          <button
            onClick={resetProgress}
            className="mono text-xs uppercase tracking-widest border-2 border-red-600 text-red-600 px-3 py-2 hover:bg-red-600 hover:text-white transition-colors flex items-center gap-1"
          >
            <RotateCcw size={12} /> Reset all review progress
          </button>
        </div>
      )}

      {cards.length > 10 && (
        <div className="mb-4 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search cards..."
            className="w-full pl-9 pr-3 py-2 border-2 border-stone-300 focus:border-stone-900 outline-none bg-white mono text-sm placeholder:text-stone-400"
          />
          {q && <p className="mono text-[10px] uppercase tracking-widest text-stone-500 mt-1">{filteredIndices.length} matching "{searchQuery}"</p>}
        </div>
      )}

      <div className="space-y-4">
        {displayIndices.map((ci) => {
          const c = cards[ci];
          return (
            <div key={c.id} className="border-2 border-stone-900 p-6 bg-stone-50">
              <div className="flex items-center justify-between mb-4">
                <div className="mono text-xs uppercase tracking-widest text-stone-500">Card {String(ci + 1).padStart(3, "0")}</div>
                <div className="flex items-center gap-1">
                  {!q && (
                    <>
                      <button
                        onClick={() => moveCard(ci, "up")}
                        disabled={ci === 0}
                        title="Move up"
                        className="p-1 text-stone-400 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        onClick={() => moveCard(ci, "down")}
                        disabled={ci === cards.length - 1}
                        title="Move down"
                        className="p-1 text-stone-400 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <span className="w-2" />
                    </>
                  )}
                  <button
                    onClick={() => removeCard(ci)}
                    disabled={cards.length === 1}
                    title="Delete card"
                    className="p-1 text-stone-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <div className="mono text-[10px] uppercase tracking-widest text-amber-700 font-semibold mb-1">Question</div>
                <textarea
                  value={c.front}
                  onChange={e => updateCard(ci, { front: e.target.value })}
                  placeholder="What goes on the front of the card?"
                  rows={2}
                  className="w-full display text-lg font-medium bg-transparent border-b border-stone-300 focus:border-stone-900 outline-none pb-2 placeholder:text-stone-300 resize-none"
                />
              </div>

              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-emerald-700 font-semibold mb-1">Answer</div>
                <textarea
                  value={c.back}
                  onChange={e => updateCard(ci, { back: e.target.value })}
                  placeholder="What goes on the back?"
                  rows={2}
                  className="w-full body-text text-base bg-transparent border-b border-stone-300 focus:border-stone-900 outline-none pb-2 placeholder:text-stone-300 resize-none"
                />
              </div>
            </div>
          );
        })}
      </div>

      {visibleCount < filteredIndices.length && (
        <div ref={sentinelRef} className="py-5 text-center mono text-xs uppercase tracking-widest text-stone-500">
          Loading more… ({visibleCount} of {filteredIndices.length})
        </div>
      )}

      {!q && cards.length < MAX_CARDS && (
        <button
          onClick={addCard}
          className="w-full mt-6 border-2 border-dashed border-stone-400 py-6 mono text-xs uppercase tracking-widest text-stone-500 hover:border-stone-900 hover:text-stone-900 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Add card
        </button>
      )}
    </div>
  );
}

// ============ IMPORT ============
const IMPORT_EXAMPLE = `Name: World Capitals
Description: Quick recall practice for national capital cities.

Q: Capital of France?
A: Paris.

Q: Capital of Japan?
A: Tokyo.

Q: Capital of Australia?
A: Canberra.

Q: Largest country by area?
A: Russia.

Q: What does photosynthesis produce from sunlight,
water, and carbon dioxide?
A: Glucose and oxygen.`;

function ImportCreate({ onSave, onSaveMany, onCancel }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const EXTERNAL_AI_PROMPT = `${AI_INSTRUCTIONS}

---

OUTPUT FORMAT — follow exactly. Start with a Name line and a Description line (both required), then the cards:

Name: [a short, specific deck title in Title Case]
Description: [one sentence describing what the deck covers]

Q: [first question]
A: [first answer]

Q: [next question]
A: [next answer]

Produce plain text only — no markdown, no JSON, no commentary before or after.

TOPIC: [replace with your topic]
NUMBER OF CARDS: [replace with how many — default to 20]`;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(EXTERNAL_AI_PROMPT);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
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
    if (result.errors && result.errors.length > 0) {
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
      const now = Date.now();
      const decksToSave = preview.decks.map((p, idx) => ({
        id: "deck-" + (now + idx),
        name: p.name,
        description: p.description,
        created: now + idx,
        cards: p.cards.slice(0, MAX_CARDS).map((c, ci) => ({
          id: `${now + idx}-${ci}`,
          front: c.front,
          back: c.back,
          sr: { interval: 0, easeFactor: 2.5, repetitions: 0 },
          nextReviewDate: 0,
        }))
      }));
      onSaveMany(decksToSave);
    } else {
      const now = Date.now();
      onSave({
        id: "deck-" + now,
        name: preview.name,
        description: preview.description,
        created: now,
        cards: preview.cards.slice(0, MAX_CARDS).map((c, ci) => ({
          id: `${now}-${ci}`,
          front: c.front,
          back: c.back,
          sr: { interval: 0, easeFactor: 2.5, repetitions: 0 },
          nextReviewDate: 0,
        }))
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
              <li>Start with a <span className="mono bg-stone-800 px-1">Name:</span> line, then a <span className="mono bg-stone-800 px-1">Description:</span> line</li>
              <li>Each card has a <span className="mono bg-stone-800 px-1">Q:</span> line for the question</li>
              <li>Followed by an <span className="mono bg-stone-800 px-1">A:</span> line for the answer</li>
              <li>Separate cards with a <strong>blank line</strong></li>
              <li>Multi-line answers are fine — any unprefixed lines continue the previous field</li>
            </ol>
            <p className="text-stone-400 text-xs leading-relaxed mb-3">
              To import multiple decks at once (e.g. a "Download all" backup), separate each deck with a line of <span className="mono bg-stone-800 px-1">======</span> characters. Max {MAX_CARDS} cards per deck.
            </p>
            <button onClick={loadExample} className="mono text-xs uppercase tracking-widest text-amber-400 hover:text-amber-200 underline">
              Load an example →
            </button>
          </div>
        </div>
      </div>

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
        placeholder="Paste your flashcard text here, or use the Upload button above..."
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
          <div className="mono text-xs uppercase tracking-widest text-emerald-700 mb-4">
            ✓ Parsed successfully — {preview.cards.length} {preview.cards.length === 1 ? "card" : "cards"}
            {preview.cards.length > MAX_CARDS && <span className="ml-2 text-amber-700">(only first {MAX_CARDS} will be kept)</span>}
          </div>
          <h3 className="display text-3xl font-bold mb-1">{preview.name}</h3>
          {preview.description && <p className="text-stone-600 mb-2 italic">{preview.description}</p>}
          <p className="mono text-xs text-stone-500 uppercase tracking-widest mb-4">{Math.min(preview.cards.length, MAX_CARDS)} cards will be imported</p>
          <div className="space-y-2 mb-6 max-h-80 overflow-y-auto">
            {preview.cards.slice(0, 30).map((c, i) => (
              <div key={i} className="text-sm bg-white p-3 border border-stone-200">
                <div className="font-semibold text-sm">{i + 1}. {c.front}</div>
                <div className="text-emerald-700 text-xs mt-1">→ {c.back}</div>
              </div>
            ))}
            {preview.cards.length > 30 && (
              <div className="mono text-xs text-stone-500 uppercase tracking-widest text-center py-2">
                + {preview.cards.length - 30} more…
              </div>
            )}
          </div>
          <button onClick={handleImport} className="bg-emerald-700 text-white px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2">
            <Check size={14} /> Import this deck
          </button>
        </div>
      )}

      {preview && preview.multi && (
        <div className="mt-6 border-2 border-emerald-600 bg-emerald-50 p-6 fade-up">
          <div className="mono text-xs uppercase tracking-widest text-emerald-700 mb-4">
            ✓ Parsed successfully · Multi-deck file
          </div>
          <div className="display text-3xl font-bold mb-1">
            {preview.decks.length} decks ready to import
          </div>
          <p className="mono text-xs text-stone-500 uppercase tracking-widest mb-4">
            {preview.decks.reduce((sum, d) => sum + d.cards.length, 0)} total cards
          </p>
          <div className="space-y-2 mb-6 max-h-80 overflow-y-auto">
            {preview.decks.map((d, i) => (
              <div key={i} className="bg-white p-4 border border-stone-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold display text-lg">{d.name}</div>
                    {d.description && <div className="text-xs text-stone-600 mt-1 italic">{d.description}</div>}
                  </div>
                  <div className="mono text-xs text-stone-500 uppercase tracking-widest flex-shrink-0">
                    {d.cards.length} {d.cards.length === 1 ? "card" : "cards"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={handleImport} className="bg-emerald-700 text-white px-5 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 transition-colors flex items-center gap-2">
            <Check size={14} /> Import all {preview.decks.length} decks
          </button>
        </div>
      )}
    </div>
  );
}

// ============ SETTINGS ============
function SettingsView({ settings, decks, stats, onChange, onReset, onClearLibrary, onClearStats, onImportDecks }) {
  const confirm = useConfirm();
  function toggle(key) {
    onChange({ ...settings, [key]: !settings[key] });
  }

  const totalDecks = decks.length;
  const totalCards = decks.reduce((sum, d) => sum + d.cards.length, 0);
  const totalMastered = decks.reduce((sum, d) => sum + masteredCount(d.cards), 0);
  const totalSessions = Object.values(stats).reduce((sum, s) => sum + (s.sessions || 0), 0);
  const decksWithStats = Object.values(stats).filter(s => s.sessions > 0);
  const avgBest = decksWithStats.length > 0
    ? Math.round(decksWithStats.reduce((sum, s) => sum + (s.bestAccuracy || 0), 0) / decksWithStats.length)
    : null;

  return (
    <div className="fade-up">
      <div className="border-b-2 border-stone-900 pb-4 mb-8">
        <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Preferences and data</div>
        <h1 className="display text-5xl font-black">Settings</h1>
      </div>

      <div className="mb-8">
        <div className="mb-4">
          <h2 className="display text-2xl font-bold">At a Glance</h2>
          <p className="text-stone-500 text-sm">Your library and activity so far</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border-2 border-stone-900">
          <StatCell value={totalDecks} label="Decks" />
          <StatCell value={totalCards} label="Cards" border />
          <StatCell value={totalMastered} label="Mastered" border accent />
          <StatCell value={totalSessions} label="Sessions" border />
          <StatCell value={avgBest === null ? "—" : avgBest + "%"} label="Avg of bests" border />
        </div>
      </div>

      <SettingGroup title="Review Behavior" subtitle="How cards are presented during study sessions">
        <Toggle
          icon={<Shuffle size={16} />}
          label="Shuffle cards"
          description="Randomize card order each time you start a flip review. Spaced repetition always shuffles due cards."
          value={settings.shuffleCards}
          onChange={() => toggle("shuffleCards")}
        />
        <Toggle
          icon={<Clock size={16} />}
          label="Show timer"
          description="Display an elapsed-time counter during the session and on the summary screen."
          value={settings.showTimer}
          onChange={() => toggle("showTimer")}
        />
      </SettingGroup>

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

      <div className="mb-8">
        <div className="mb-4">
          <h2 className="display text-2xl font-bold">Helpers</h2>
          <p className="text-stone-500 text-sm">Optional tools that speed up studying</p>
        </div>
        <div className="border-2 border-stone-900 divide-y-2 divide-stone-900">
          <Toggle
            icon={<span className="mono text-sm font-bold">⌨</span>}
            label="Keyboard shortcuts"
            description="Space flips the card · ← → move between cards · ↑ ↓ rate in flip review · 1–4 rate in spaced review."
            value={settings.keyboardShortcuts}
            onChange={() => toggle("keyboardShortcuts")}
          />
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-4">
          <h2 className="display text-2xl font-bold">Your Data</h2>
          <p className="text-stone-500 text-sm">Download, back up, import, or clear your library</p>
        </div>
        <div className="border-2 border-stone-900 divide-y-2 divide-stone-900">
          <ActionRow
            icon={<Archive size={16} />}
            label="Download all decks"
            description={totalDecks > 0
              ? `Export all ${totalDecks} decks into a single .txt file you can back up or re-import later.`
              : "No decks to export yet."}
            actionLabel="Download"
            actionIcon={<Download size={12} />}
            onClick={() => downloadAllDecks(decks)}
            disabled={totalDecks === 0}
            tone="default"
          />
          <ImportLibraryRow onImportDecks={onImportDecks} />
          <ActionRow
            icon={<BarChart3 size={16} />}
            label="Clear statistics"
            description="Erase session counts and accuracy history. Your decks and review progress will not be deleted."
            actionLabel="Clear stats"
            actionIcon={<RotateCcw size={12} />}
            onClick={async () => {
              const ok = await confirm({ title: "Clear statistics", message: "Erase all session statistics? This cannot be undone. Your decks will be kept.", confirmLabel: "Clear stats", danger: true });
              if (ok) onClearStats();
            }}
            disabled={totalSessions === 0}
            tone="warning"
          />
          <ActionRow
            icon={<Trash2 size={16} />}
            label="Clear entire library"
            description="Delete every deck, every card, and all statistics. This cannot be undone. Download a backup first."
            actionLabel="Delete everything"
            actionIcon={<Trash2 size={12} />}
            onClick={async () => {
              const ok1 = await confirm({ title: "Back up first?", message: "Before you do this — have you downloaded a backup? This cannot be undone.", confirmLabel: "Continue" });
              if (!ok1) return;
              const ok2 = await confirm({ title: "Final confirmation", message: `Permanently delete all ${totalDecks} decks and statistics?`, confirmLabel: "Delete everything", danger: true });
              if (ok2) onClearLibrary();
            }}
            disabled={totalDecks === 0}
            tone="danger"
          />
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-stone-300">
        <button
          onClick={async () => {
            const ok = await confirm({ title: "Reset settings", message: "Reset all settings to defaults?", confirmLabel: "Reset" });
            if (ok) onReset();
          }}
          className="mono text-xs uppercase tracking-widest text-stone-500 hover:text-red-600 transition-colors flex items-center gap-2"
        >
          <RotateCcw size={12} /> Reset settings to defaults
        </button>
      </div>
    </div>
  );
}

function ImportLibraryRow({ onImportDecks }) {
  const [msg, setMsg] = useState(null); // { type: 'ok' | 'err', text }
  const inputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target.result;
      const result = parseImportText(raw);
      let decks = [];
      const parseErrors = result.errors || [];
      if (result.multi) decks = result.decks || [];
      else if (result.cards && result.cards.length) decks = [{ name: result.name, description: result.description, cards: result.cards }];

      if (!decks.length) {
        setMsg({ type: "err", text: parseErrors.length ? parseErrors.join(" ") : "No decks found in that file." });
        return;
      }
      const count = await onImportDecks(decks);
      let out = `Imported ${count} ${count === 1 ? "deck" : "decks"}.`;
      if (parseErrors.length) out += ` (${parseErrors.length} block${parseErrors.length === 1 ? "" : "s"} skipped.)`;
      setMsg({ type: "ok", text: out });
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
            Load decks from a .txt backup — a single deck or a full multi-deck export. Imported decks are added to your library.
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
        aria-label={label}
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

// ============ REVIEW ============
function ReviewView({ deck, mode, settings, sessionStartTime, onFinish, onUpdateCard, onQuit, onHome, finalElapsedMs }) {
  // Build the card list for this session
  const initialCards = mode === "spaced"
    ? shuffle(dueCards(deck.cards))
    : (settings.shuffleCards ? shuffle(deck.cards) : [...deck.cards]);

  const [cards, setCards] = useState(initialCards);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionStats, setSessionStats] = useState({ easy: 0, good: 0, hard: 0, again: 0 });
  const [done, setDone] = useState(cards.length === 0);

  const current = cards[idx];

  function handleShuffle() {
    // Reshuffle the pass, jump back to the first card, and reset the running
    // tally so the score matches the cards being shown.
    setCards(prev => shuffle(prev));
    setIdx(0);
    setFlipped(false);
    setSessionStats({ easy: 0, good: 0, hard: 0, again: 0 });
  }

  function goTo(n) {
    if (n < 0 || n >= cards.length) return;
    setIdx(n);
    setFlipped(false);
  }

  function handleRate(quality) {
    const label = quality === 5 ? "easy" : quality === 4 ? "good" : quality === 3 ? "hard" : "again";
    const newStats = { ...sessionStats, [label]: sessionStats[label] + 1 };
    setSessionStats(newStats);

    if (mode === "spaced" && current) {
      const update = nextReview(current, quality);
      // Fire-and-forget: no await here, so the next card appears immediately.
      onUpdateCard(current.id, update);
    }

    if (idx + 1 >= cards.length) {
      setDone(true);
      onFinish(newStats);
    } else {
      setIdx(i => i + 1);
      setFlipped(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!settings.keyboardShortcuts || done) return;
    function handleKey(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

      // Space toggles the card (question <-> answer)
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setFlipped(f => !f);
        return;
      }
      // Left/Right navigate between cards
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(idx - 1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (idx < cards.length - 1) goTo(idx + 1);
        return;
      }
      // Rating — only once the answer is showing
      if (flipped) {
        if (mode === "spaced") {
          if (e.key === "1") { e.preventDefault(); handleRate(1); }
          else if (e.key === "2") { e.preventDefault(); handleRate(3); }
          else if (e.key === "3") { e.preventDefault(); handleRate(4); }
          else if (e.key === "4") { e.preventDefault(); handleRate(5); }
        } else {
          // Flip mode: Up = knew it, Down = didn't know
          if (e.key === "ArrowUp") { e.preventDefault(); handleRate(5); }
          else if (e.key === "ArrowDown") { e.preventDefault(); handleRate(1); }
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [settings.keyboardShortcuts, flipped, idx, cards.length, done, mode]);

  // Live timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!settings.showTimer || !sessionStartTime || done) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [settings.showTimer, sessionStartTime, done]);
  const elapsedMs = done ? finalElapsedMs : (settings.showTimer && sessionStartTime ? now - sessionStartTime : 0);

  // Summary screen
  if (done) {
    const total = sessionStats.easy + sessionStats.good + sessionStats.hard + sessionStats.again;
    const correct = sessionStats.easy + sessionStats.good;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    let verdict = "Worth another go.";
    if (total === 0) verdict = "Nothing was due.";
    else if (accuracy === 100) verdict = "Perfect. Extraordinary.";
    else if (accuracy >= 80) verdict = "Excellent work.";
    else if (accuracy >= 60) verdict = "Well done.";
    else if (accuracy >= 40) verdict = "Getting there.";

    return (
      <div className="fade-up">
        <div className="text-center mb-12 py-8 border-y-2 border-stone-900">
          <Brain size={40} className="mx-auto mb-4 text-amber-700" />
          <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Session complete</div>
          {total > 0 ? (
            <>
              <div className="display text-8xl font-black mb-2">
                {correct}<span className="text-stone-400">/{total}</span>
              </div>
              <div className="mono text-sm uppercase tracking-widest text-stone-600 mb-4">{accuracy}% correct</div>
            </>
          ) : (
            <div className="display text-5xl font-black mb-4">No cards due</div>
          )}
          {settings.showTimer && elapsedMs > 0 && (
            <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-4 flex items-center justify-center gap-2">
              <Clock size={12} /> Finished in {formatDuration(elapsedMs)}
            </div>
          )}
          <p className="display text-2xl italic text-amber-700">{verdict}</p>
        </div>

        {total > 0 && (
          mode === "flip" ? (
            <div className="grid grid-cols-2 gap-0 border-2 border-stone-900 mb-8">
              <RatingStatCell value={sessionStats.easy} label="Knew it" color="text-emerald-700" />
              <RatingStatCell value={sessionStats.again} label="Didn't know" color="text-red-600" border />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-2 border-stone-900 mb-8">
              <RatingStatCell value={sessionStats.easy} label="Easy" color="text-emerald-700" />
              <RatingStatCell value={sessionStats.good} label="Good" color="text-blue-700" border />
              <RatingStatCell value={sessionStats.hard} label="Hard" color="text-amber-700" border />
              <RatingStatCell value={sessionStats.again} label="Again" color="text-red-600" border />
            </div>
          )
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          <button onClick={onQuit} className="border-2 border-stone-900 px-6 py-3 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors flex items-center gap-2">
            <ArrowLeft size={14} /> Back to library
          </button>
          <button onClick={onHome} className="bg-stone-900 text-stone-50 px-6 py-3 mono text-xs uppercase tracking-widest hover:bg-amber-700 transition-colors">
            Home
          </button>
        </div>
      </div>
    );
  }

  const progress = ((idx + 1) / cards.length) * 100;
  const sessCorrect = sessionStats.easy + sessionStats.good;
  const sessStruggled = sessionStats.hard + sessionStats.again;

  return (
    <div className="fade-up">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="mono text-xs uppercase tracking-[0.3em] text-stone-500">
          {deck.name} · Card {idx + 1} of {cards.length}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`mono text-xs uppercase tracking-widest px-2 py-1 ${mode === "spaced" ? "bg-amber-700 text-stone-50" : "bg-stone-900 text-stone-50"}`}>
            {mode === "spaced" ? <><Brain size={10} className="inline mr-1" /> Spaced</> : <><RefreshCw size={10} className="inline mr-1" /> Flip</>}
          </span>
          {settings.showTimer && sessionStartTime && (
            <span className="mono text-xs uppercase tracking-widest text-amber-700 flex items-center gap-1">
              <Clock size={12} /> {formatDuration(elapsedMs)}
            </span>
          )}
          <button
            onClick={handleShuffle}
            title="Shuffle the cards and restart this pass"
            className="mono text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1"
          >
            <Shuffle size={12} /> Shuffle
          </button>
          <button onClick={onQuit} className="mono text-xs uppercase tracking-widest text-stone-400 hover:text-red-600 transition-colors flex items-center gap-1">
            <X size={14} /> Quit
          </button>
        </div>
      </div>

      <div className="h-1 bg-stone-200 mb-4 relative">
        <div className="absolute inset-y-0 left-0 bg-amber-700 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="mb-3">
        <div className="mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">
          № {String(idx + 1).padStart(3, "0")}
        </div>

        {/* Card — click to flip either way */}
        <div
          onClick={() => setFlipped(f => !f)}
          className="border-2 border-stone-900 bg-white p-6 md:p-8 min-h-[240px] md:min-h-[280px] flex flex-col justify-center items-center text-center transition-all cursor-pointer hover:bg-stone-50"
          style={{ boxShadow: flipped ? "0 4px 24px rgba(180, 83, 9, 0.15)" : "none" }}
        >
          <div key={flipped ? "back" : "front"} className="card-flip w-full">
            {!flipped ? (
              <>
                <div className="mono text-[10px] uppercase tracking-[0.3em] text-amber-700 font-bold mb-4">Question</div>
                <div className="body-text text-2xl md:text-3xl leading-relaxed max-w-3xl mx-auto">{current.front}</div>
              </>
            ) : (
              <>
                <div className="mono text-[10px] uppercase tracking-[0.3em] text-emerald-700 font-bold mb-4">Answer</div>
                <div className="body-text text-2xl md:text-3xl leading-relaxed max-w-3xl mx-auto">{current.back}</div>
              </>
            )}
          </div>
        </div>

        <div className="text-center mono text-xs uppercase tracking-widest text-stone-400 mt-3">
          {settings.keyboardShortcuts ? "Tap the card or press Space to flip" : "Tap the card to flip"}
        </div>
      </div>

      {/* Navigation & jump */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <button
          onClick={() => goTo(idx - 1)}
          disabled={idx === 0}
          className="border-2 border-stone-900 px-4 py-2 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-900 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ChevronLeft size={14} /> Prev
        </button>

        <div className="flex items-center gap-2 mono text-xs uppercase tracking-widest text-stone-500">
          <span>Card</span>
          <input
            type="number"
            min={1}
            max={cards.length}
            value={idx + 1}
            onChange={e => goTo(Math.min(cards.length, Math.max(1, parseInt(e.target.value) || 1)) - 1)}
            className="w-16 py-1.5 px-2 text-center border-2 border-stone-300 focus:border-stone-900 outline-none bg-white mono text-sm"
          />
          <span>of {cards.length}</span>
        </div>

        <button
          onClick={() => goTo(idx + 1)}
          disabled={idx === cards.length - 1}
          className="border-2 border-stone-900 px-4 py-2 mono text-xs uppercase tracking-widest hover:bg-stone-900 hover:text-stone-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-900 disabled:cursor-not-allowed flex items-center gap-2"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>

      {/* Rating buttons */}
      {flipped && (
        <div className="fade-up mb-4">
          <div className="mono text-xs uppercase tracking-widest text-stone-500 mb-3 text-center">
            {mode === "spaced" ? "Rate your recall" : "Did you know it?"}
          </div>
          {mode === "flip" ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleRate(1)}
                className="border-2 border-red-600 bg-red-50 text-red-700 py-3 mono text-sm uppercase tracking-widest font-bold hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <X size={16} /> Didn't know
                {settings.keyboardShortcuts && <span className="mono text-[10px] opacity-60 ml-1">[↓]</span>}
              </button>
              <button
                onClick={() => handleRate(5)}
                className="border-2 border-emerald-600 bg-emerald-50 text-emerald-700 py-3 mono text-sm uppercase tracking-widest font-bold hover:bg-emerald-600 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <Check size={16} /> Knew it
                {settings.keyboardShortcuts && <span className="mono text-[10px] opacity-60 ml-1">[↑]</span>}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {[
                { q: 1, label: "Again", classes: "border-red-600 text-red-600 hover:bg-red-600 hover:text-white", key: "1" },
                { q: 3, label: "Hard", classes: "border-amber-700 text-amber-700 hover:bg-amber-700 hover:text-white", key: "2" },
                { q: 4, label: "Good", classes: "border-blue-700 text-blue-700 hover:bg-blue-700 hover:text-white", key: "3" },
                { q: 5, label: "Easy", classes: "border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white", key: "4" },
              ].map(({ q, label, classes, key }) => (
                <button
                  key={q}
                  onClick={() => handleRate(q)}
                  className={`border-2 py-3 mono text-xs uppercase tracking-widest font-bold transition-colors ${classes}`}
                >
                  {label}
                  {settings.keyboardShortcuts && <div className="mono text-[10px] opacity-60 mt-1">[{key}]</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-center mono text-xs uppercase tracking-widest text-stone-400">
        {sessCorrect} correct · {sessStruggled} struggled
      </div>
    </div>
  );
}

function RatingStatCell({ value, label, color, border }) {
  return (
    <div className={`p-5 bg-stone-50 ${border ? "border-l-2 border-stone-900" : ""}`}>
      <div className={`display text-4xl font-black ${color}`}>{value}</div>
      <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mt-1">{label}</div>
    </div>
  );
}

// ============ MOUNT ============
const rootEl = document.getElementById("root");
createRoot(rootEl).render(<FlashcardApp />);
