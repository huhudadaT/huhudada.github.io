import React, { useState, useRef, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";

/* ------------------------------------------------------------------ config */

// Real API call, not the Claude.ai artifact proxy. Swap the model here.
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 8000;
const KEY_STORE = "longhand:key";

const MODES = {
  markdown: {
    label: "Structured",
    hint: "Headings, lists, tables. Equations and chemistry as LaTeX.",
    rule: `Return Markdown. Use headings, lists and tables where the page uses them. Set every equation, formula or chemical expression in LaTeX: $...$ inline, $$...$$ on its own line. Arrows drawn between terms become \\rightarrow or \\rightleftharpoons as appropriate. Sub- and superscripts must be exact.`,
  },
  layout: {
    label: "Layout",
    hint: "Line breaks, indents and columns kept as drawn.",
    rule: `Keep the physical layout. One line of writing is one line of output. Preserve indentation with spaces, keep columns side by side where the page has them, and transcribe bullets, arrows, boxes and underlines using plain characters. No Markdown formatting.`,
  },
  plain: {
    label: "Plain prose",
    hint: "Reading order, no formatting.",
    rule: `Return plain running text in natural reading order. Join lines that belong to the same sentence. No Markdown, no layout preservation.`,
  },
};

const SYSTEM = `You transcribe handwriting from images and scans.

Output only the transcription. No preamble, no summary, no commentary, no code fences.

Non-negotiable rules:
- Transcribe what is on the page. Never correct spelling, grammar, arithmetic or terminology, and never add content that is not written.
- If a word is legible but you are less than confident, wrap it in ⟦guess⟧. Use the flag sparingly, only where a reader would want to check.
- If something is genuinely unreadable, write ⟦?⟧ in its place.
- Crossed-out text is omitted unless it is the only reading available.
- Text in margins, in boxes, or written sideways belongs in the transcription. Put it where it makes sense and label it, e.g. [margin] or [box].
- Sketches and diagrams are described in one short line inside square brackets, e.g. [diagram: hepatic lobule, portal triad labelled].
- If the page contains no handwriting at all, output exactly: ⟦?⟧ no handwriting found.`;

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
const OK_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

let seq = 0;

/* ------------------------------------------------------------------- icons */
// Inline so the page pulls no icon library. 24-grid, 1.6 stroke, currentColor.

const PATHS = {
  upload: ["M12 15V3", "M7 8l5-5 5 5", "M4 16v4h16v-4"],
  copy: ["M9 8h11v13H9z", "M4 16V3h11"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M4 20h16"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  alert: ["M12 3 21 20H3z", "M12 9v5", "M12 17h.01"],
  check: ["M4 12l5 5L20 6"],
  pencil: ["M4 20h4L20 8l-4-4L4 16z", "M14 6l4 4"],
  book: ["M12 7v14", "M12 7C10 5 7 5 3 5v14c4 0 7 0 9 2", "M12 7c2-2 5-2 9-2v14c-4 0-7 0-9 2"],
  source: ["M15 3H6v18h12V8z", "M15 3v5h4", "M10 13l-2 2 2 2", "M14 13l2 2-2 2"],
  again: ["M3 12a9 9 0 1 0 3-6.8", "M3 4v5h5"],
  play: ["M7 4l13 8-13 8z"],
};

function Icon({ name, size = 13 }) {
  const filled = name === "play";
  return (
    <svg
      className="ht-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} fill={filled ? "currentColor" : "none"} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ files */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
}

// Big phone photos fail the API's size and dimension limits. Shrink first.
function shrinkImage(file, maxEdge = 2000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 3_500_000) {
        URL.revokeObjectURL(url);
        fileToBase64(file).then(
          (b64) => resolve({ base64: b64, mediaType: file.type, previewUrl: URL.createObjectURL(file) }),
          reject
        );
        return;
      }
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.92);
      URL.revokeObjectURL(url);
      resolve({
        base64: dataUrl.split(",")[1],
        mediaType: "image/jpeg",
        previewUrl: dataUrl,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be opened."));
    };
    img.src = url;
  });
}

/* --------------------------------------------------------------------- api */

function storedKey() {
  try {
    return localStorage.getItem(KEY_STORE) || "";
  } catch {
    return "";
  }
}

async function callClaude(messages, key) {
  if (!key) throw new Error("No API key saved. Add one below to read pages.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message || "";
    } catch {
      /* no body */
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("The key was rejected. Check it and save again.");
    }
    if (res.status === 429) {
      throw new Error("Rate limited. Wait a moment and read the page again.");
    }
    throw new Error(detail || `The request failed (${res.status}).`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  return { text, truncated: data.stop_reason === "max_tokens" };
}

async function transcribe(item, mode, key) {
  const instruction = `Transcribe every piece of handwriting on this ${
    item.kind === "pdf" ? "document" : "page"
  }.\n\n${MODES[mode].rule}`;

  const block =
    item.kind === "pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: item.base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: item.mediaType, data: item.base64 },
        };

  let messages = [
    { role: "user", content: [block, { type: "text", text: instruction }] },
  ];
  let out = "";

  // Dense pages run past one response. Pick up where we left off.
  for (let pass = 0; pass < 4; pass++) {
    const { text, truncated } = await callClaude(messages, key);
    out += text;
    if (!truncated) break;
    messages = [
      ...messages,
      { role: "assistant", content: out },
      {
        role: "user",
        content:
          "Continue from exactly where you stopped. Repeat nothing, add no commentary.",
      },
    ];
  }
  return stripFences(out);
}

/* ------------------------------------------------------------------ output */

async function copyText(text) {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-2000px;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function stripFences(s) {
  return s
    .replace(/^\s*```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

/* -------------------------------------------------------------- formatting */
// The transcript comes back as Markdown with LaTeX. These turn it back into
// something shaped like the page it came from.

const TEX = {
  "\\rightarrow": "→", "\\to": "→", "\\longrightarrow": "⟶",
  "\\Rightarrow": "⇒", "\\leftarrow": "←", "\\Leftarrow": "⇐",
  "\\leftrightarrow": "↔", "\\rightleftharpoons": "⇌",
  "\\uparrow": "↑", "\\downarrow": "↓",
  "\\times": "×", "\\cdot": "·", "\\div": "÷", "\\pm": "±", "\\mp": "∓",
  "\\leq": "≤", "\\le": "≤", "\\geq": "≥", "\\ge": "≥",
  "\\neq": "≠", "\\ne": "≠", "\\approx": "≈", "\\equiv": "≡",
  "\\propto": "∝", "\\infty": "∞", "\\sum": "∑", "\\prod": "∏",
  "\\int": "∫", "\\partial": "∂", "\\nabla": "∇",
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ",
  "\\epsilon": "ε", "\\varepsilon": "ε", "\\zeta": "ζ", "\\eta": "η",
  "\\theta": "θ", "\\kappa": "κ", "\\lambda": "λ", "\\mu": "μ",
  "\\nu": "ν", "\\xi": "ξ", "\\pi": "π", "\\rho": "ρ", "\\sigma": "σ",
  "\\tau": "τ", "\\phi": "φ", "\\varphi": "φ", "\\chi": "χ",
  "\\psi": "ψ", "\\omega": "ω",
  "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ", "\\Lambda": "Λ",
  "\\Pi": "Π", "\\Sigma": "Σ", "\\Phi": "Φ", "\\Psi": "Ψ", "\\Omega": "Ω",
  "\\circ": "∘", "\\degree": "°", "\\ldots": "…", "\\cdots": "⋯",
  "\\in": "∈", "\\notin": "∉", "\\subset": "⊂", "\\cup": "∪",
  "\\cap": "∩", "\\forall": "∀", "\\exists": "∃", "\\angle": "∠",
  "\\prime": "′", "\\ll": "≪", "\\gg": "≫", "\\sim": "∼",
};

const UPRIGHT = ["\\text", "\\mathrm", "\\operatorname", "\\mathsf", "\\rm"];
const SPACERS = ["\\,", "\\;", "\\:", "\\ ", "\\quad", "\\qquad", "\\!"];

// Read a {braced group}, or a single character if there are no braces.
function readGroup(s, i) {
  if (s[i] !== "{") return { body: s[i] ?? "", next: i + 1 };
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") {
      depth--;
      if (depth === 0) return { body: s.slice(i + 1, j), next: j + 1 };
    }
  }
  return { body: s.slice(i + 1), next: s.length };
}

function texToNodes(src) {
  const nodes = [];
  let buf = "";
  let i = 0;
  let key = 0;
  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = "";
    }
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\\") {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      if (!m) {
        i++;
        continue;
      }
      const name = "\\" + m[1];
      i += m[0].length;

      if (name === "\\frac" || name === "\\dfrac" || name === "\\tfrac") {
        const a = readGroup(src, i);
        const b = readGroup(src, a.next);
        i = b.next;
        flush();
        nodes.push(
          <span className="ht-frac" key={`f${key++}`}>
            <span className="ht-num">{texToNodes(a.body)}</span>
            <span className="ht-den">{texToNodes(b.body)}</span>
          </span>
        );
        continue;
      }
      if (name === "\\sqrt") {
        const a = readGroup(src, i);
        i = a.next;
        flush();
        nodes.push(
          <span className="ht-sqrt" key={`r${key++}`}>
            <span className="ht-sqrt-body">{texToNodes(a.body)}</span>
          </span>
        );
        continue;
      }
      if (UPRIGHT.includes(name) || name === "\\mathbf") {
        const a = readGroup(src, i);
        i = a.next;
        flush();
        nodes.push(
          <span
            className={name === "\\mathbf" ? "ht-tex-bf" : "ht-tex-up"}
            key={`t${key++}`}
          >
            {texToNodes(a.body)}
          </span>
        );
        continue;
      }
      if (name === "\\left" || name === "\\right") continue;
      if (SPACERS.includes(name)) {
        buf += name === "\\!" ? "" : " ";
        continue;
      }
      if (name === "\\\\") {
        flush();
        nodes.push(<br key={`b${key++}`} />);
        continue;
      }
      if (TEX[name]) {
        buf += TEX[name];
        continue;
      }
      buf += m[1].length === 1 ? m[1] : m[1] + " ";
      continue;
    }

    if (ch === "^" || ch === "_") {
      const g = readGroup(src, i + 1);
      i = g.next;
      flush();
      const Tag = ch === "^" ? "sup" : "sub";
      nodes.push(<Tag key={`s${key++}`}>{texToNodes(g.body)}</Tag>);
      continue;
    }

    if (ch === "{" || ch === "}") {
      i++;
      continue;
    }

    buf += ch;
    i++;
  }
  flush();
  return nodes;
}

const INLINE =
  /(⟦[^⟧]*⟧)|(\$\$[^$]+\$\$)|(\$[^$\n]+\$)|(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(\[[^\]\n]+\])/g;

function renderInline(text, kp = "x") {
  const out = [];
  let last = 0;
  let k = 0;
  let m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${kp}-${k++}`;
    if (tok.startsWith("⟦")) {
      const inner = tok.slice(1, -1);
      out.push(
        <mark className="ht-flag" key={key} title="Check this reading">
          {inner === "?" ? "???" : inner}
        </mark>
      );
    } else if (tok.startsWith("$")) {
      out.push(
        <span className="ht-math" key={key}>
          {texToNodes(tok.replace(/^\$\$?/, "").replace(/\$\$?$/, ""))}
        </span>
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <code className="ht-code" key={key}>
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else {
      // [diagram: ...] and [margin] annotations from the transcriber
      out.push(
        <span className="ht-note" key={key}>
          {tok.slice(1, -1)}
        </span>
      );
    }
    last = INLINE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const RE_HEAD = /^(#{1,6})\s+(.*)$/;
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const RE_UL = /^(\s*)[-*+•]\s+(.*)$/;
const RE_OL = /^(\s*)(\d+)[.)]\s+(.*)$/;
const RE_ROW = /^\s*\|.*\|\s*$/;
const RE_SEP = /^\s*\|[\s|:-]+\|\s*$/;
const RE_QUOTE = /^\s*>\s?(.*)$/;

const isBlockStart = (l) =>
  !l.trim() ||
  RE_HEAD.test(l) ||
  RE_HR.test(l) ||
  RE_UL.test(l) ||
  RE_OL.test(l) ||
  RE_ROW.test(l) ||
  RE_QUOTE.test(l) ||
  l.trim().startsWith("$$");

function cells(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

// The whole point: text in, page-shaped output back.
function renderFormatted(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      i++;
      continue;
    }

    // display math, either $$...$$ on one line or fenced across several
    if (t.startsWith("$$")) {
      let tex = "";
      if (t.length > 2 && t.endsWith("$$")) {
        tex = t.slice(2, -2);
        i++;
      } else {
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("$$")) {
          tex += lines[i] + "\n";
          i++;
        }
        i++;
      }
      blocks.push(
        <div className="ht-mathblock" key={`m${k++}`}>
          {texToNodes(tex.trim())}
        </div>
      );
      continue;
    }

    const head = RE_HEAD.exec(line);
    if (head) {
      const level = Math.min(head[1].length, 4);
      blocks.push(
        <div className={`ht-h ht-h${level}`} key={`h${k++}`}>
          {renderInline(head[2], `h${k}`)}
        </div>
      );
      i++;
      continue;
    }

    if (RE_HR.test(line)) {
      blocks.push(<hr className="ht-hr" key={`r${k++}`} />);
      i++;
      continue;
    }

    if (RE_ROW.test(line)) {
      const rows = [];
      while (i < lines.length && RE_ROW.test(lines[i])) {
        if (!RE_SEP.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [header, ...body] = rows;
      blocks.push(
        <table className="ht-table" key={`t${k++}`}>
          <thead>
            <tr>
              {header.map((c, ci) => (
                <th key={ci}>{renderInline(c, `th${k}${ci}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td key={ci}>{renderInline(c, `td${k}${ri}${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    if (RE_UL.test(line) || RE_OL.test(line)) {
      const items = [];
      while (i < lines.length && (RE_UL.test(lines[i]) || RE_OL.test(lines[i]))) {
        const ul = RE_UL.exec(lines[i]);
        const ol = RE_OL.exec(lines[i]);
        const indent = Math.floor(((ul || ol)[1] || "").replace(/\t/g, "  ").length / 2);
        const body = ul ? ul[2] : ol[3];
        const marker = ol ? `${ol[2]}.` : "—";
        items.push({ indent, body, marker });
        i++;
      }
      blocks.push(
        <ul className="ht-list" key={`l${k++}`}>
          {items.map((it, ii) => (
            <li
              className="ht-li"
              key={ii}
              style={{ marginLeft: `${it.indent * 20}px` }}
            >
              <span className="ht-marker">{it.marker}</span>
              <span>{renderInline(it.body, `li${k}${ii}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const parts = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        parts.push(RE_QUOTE.exec(lines[i])[1]);
        i++;
      }
      blocks.push(
        <blockquote className="ht-quote" key={`q${k++}`}>
          {renderInline(parts.join("\n"), `q${k}`)}
        </blockquote>
      );
      continue;
    }

    // paragraph — line breaks inside it are kept, since the page had them
    const para = [line];
    i++;
    while (i < lines.length && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p className="ht-p" key={`p${k++}`}>
        {para.map((l, li) => (
          <span key={li}>
            {renderInline(l, `p${k}${li}`)}
            {li < para.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  }

  return blocks;
}

function FlaggedText({ text }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("⟦") && p.endsWith("⟧")) {
          const inner = p.slice(1, -1);
          return (
            <mark className="ht-flag" key={i} title="Check this reading">
              {inner === "?" ? "???" : inner}
            </mark>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/* --------------------------------------------------------------------- app */

function Longhand() {
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [mode, setMode] = useState("markdown");
  const [view, setView] = useState("formatted"); // formatted | source | edit
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(storedKey);
  const [keyDraft, setKeyDraft] = useState("");
  const inputRef = useRef(null);
  const sheetRef = useRef(null);

  const active = items.find((i) => i.id === activeId) || null;
  const pending = items.filter((i) => i.status === "queued").length;
  const working = items.some((i) => i.status === "reading");
  const retryable = items.some((i) => i.status === "failed");

  const saveKey = () => {
    const next = keyDraft.trim();
    try {
      if (next) localStorage.setItem(KEY_STORE, next);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      setNotice("This browser is blocking local storage, so the key can't be kept.");
    }
    setKey(next);
    setKeyDraft("");
    setNotice("");
  };

  const clearKey = () => {
    try {
      localStorage.removeItem(KEY_STORE);
    } catch {
      /* nothing to do */
    }
    setKey("");
    setKeyDraft("");
  };

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    const good = files.filter((f) => OK_TYPES.includes(f.type));
    const bad = files.length - good.length;
    if (bad > 0) {
      setNotice(
        `${bad} file${bad > 1 ? "s" : ""} skipped. Use PNG, JPEG, WebP, GIF or PDF.`
      );
    } else {
      setNotice("");
    }

    for (const f of good) {
      const id = `p${++seq}`;
      const isPdf = f.type === "application/pdf";
      try {
        const prepared = isPdf
          ? {
              base64: await fileToBase64(f),
              mediaType: "application/pdf",
              previewUrl: null,
            }
          : await shrinkImage(f);
        setItems((prev) => [
          ...prev,
          {
            id,
            name: f.name || `page ${seq}`,
            kind: isPdf ? "pdf" : "image",
            status: "queued",
            text: "",
            error: "",
            ...prepared,
          },
        ]);
        setActiveId((cur) => cur ?? id);
      } catch (e) {
        setNotice(e.message);
      }
    }
  }, []);

  const runQueue = useCallback(async () => {
    const queue = items.filter((i) => i.status === "queued" || i.status === "failed");
    for (const item of queue) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "reading", error: "" } : i))
      );
      setActiveId(item.id);
      try {
        const text = await transcribe(item, mode, key);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "done", text } : i))
        );
      } catch (e) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "failed", error: e.message } : i
          )
        );
      }
    }
  }, [items, mode, key]);

  const rereadOne = useCallback(
    async (id) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "reading", error: "" } : i))
      );
      try {
        const text = await transcribe(item, mode, key);
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "done", text } : i))
        );
      } catch (e) {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "failed", error: e.message } : i))
        );
      }
    },
    [items, mode, key]
  );

  const remove = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  };

  const allText = items
    .filter((i) => i.status === "done")
    .map((i) => (items.length > 1 ? `## ${i.name}\n\n${i.text}` : i.text))
    .join("\n\n---\n\n");

  const selectSheet = () => {
    const node = sheetRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const copyAll = async () => {
    const ok = await copyText(allText);
    if (ok) {
      setNotice("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      return;
    }
    setView("source");
    selectSheet();
    setNotice(
      "The browser blocked the copy command. The transcript is selected — press ⌘C or Ctrl+C. Save also works."
    );
  };

  const downloadAll = () => {
    const ext = mode === "markdown" ? "md" : "txt";
    const blob = new Blob([allText], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transcription.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  useEffect(() => {
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const flagCount = active ? (active.text.match(/⟦/g) || []).length : 0;
  const words = active ? active.text.trim().split(/\s+/).filter(Boolean).length : 0;

  const runLabel = !key
    ? "Add a key to read"
    : working
    ? "Reading"
    : `Read ${pending || ""} page${pending === 1 ? "" : "s"}`;

  return (
    <>
      <header className="page-head">
        <div className="project-kicker">Programs · Transcription</div>
        <h1>Longhand</h1>
        <p className="lede">
          Photograph or scan handwritten notes and get typed text back. Readings the
          model is unsure of come back flagged, so you know exactly which words to
          check against the original.
        </p>
      </header>

      <main className="ht-grid">
        <div className="ht-rail">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            className="ht-drop"
            data-live={dragging}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <Icon name="upload" size={18} />
            <span className="ht-drop-title">Add pages</span>
            <span className="ht-drop-note">Drop · paste · choose</span>
          </button>

          <span className="ht-label">Output</span>
          <div className="ht-modes">
            {Object.entries(MODES).map(([k, m]) => (
              <button
                key={k}
                className="ht-mode"
                data-on={mode === k}
                onClick={() => setMode(k)}
              >
                <span className="ht-mode-name">{m.label}</span>
                <span className="ht-mode-hint">{m.hint}</span>
              </button>
            ))}
          </div>

          <button
            className="ht-run"
            disabled={!key || working || (pending === 0 && !retryable)}
            onClick={runQueue}
          >
            <Icon name="play" size={11} />
            {runLabel}
          </button>

          {items.length > 0 && (
            <>
              <span className="ht-label">Pages</span>
              <ul className="ht-pages">
                {items.map((it) => (
                  <li key={it.id} className="ht-page" data-on={it.id === activeId}>
                    <button className="ht-page-pick" onClick={() => setActiveId(it.id)}>
                      {it.previewUrl ? (
                        <img className="ht-thumb" src={it.previewUrl} alt="" />
                      ) : (
                        <span className="ht-thumb ht-thumb-pdf">PDF</span>
                      )}
                      <span className="ht-page-text">
                        <span className="ht-page-name">{it.name}</span>
                        <span className="ht-page-state" data-s={it.status}>
                          {it.status}
                        </span>
                      </span>
                    </button>
                    <button
                      className="ht-page-del"
                      onClick={() => remove(it.id)}
                      aria-label={`Remove ${it.name}`}
                    >
                      <Icon name="trash" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <span className="ht-label">API key</span>
          <div className="ht-key">
            <input
              className="ht-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={key ? "Key saved — enter a new one to replace" : "sk-ant-…"}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveKey();
              }}
            />
            <button className="ht-btn" onClick={saveKey} disabled={!keyDraft.trim()}>
              Save
            </button>
          </div>
          <p className="ht-key-note">
            {key ? "A key is saved in this browser." : "No key saved."} The key stays on
            this device, is sent only to Anthropic, and never reaches the site.{" "}
            {key && (
              <button className="ht-link" onClick={clearKey}>
                Remove it
              </button>
            )}
          </p>

          {notice && (
            <div className="ht-notice">
              <Icon name="alert" size={15} />
              <span>{notice}</span>
            </div>
          )}
        </div>

        <section className="ht-panel">
          <div className="ht-bar">
            <span className="ht-bar-name">{active ? active.name : "No page selected"}</span>
            {active?.status === "done" && (
              <>
                <span className="ht-seg">
                  <button
                    className="ht-seg-btn"
                    data-on={view === "formatted"}
                    onClick={() => setView("formatted")}
                  >
                    <Icon name="book" /> Formatted
                  </button>
                  <button
                    className="ht-seg-btn"
                    data-on={view === "source"}
                    onClick={() => setView("source")}
                  >
                    <Icon name="source" /> Source
                  </button>
                  <button
                    className="ht-seg-btn"
                    data-on={view === "edit"}
                    onClick={() => setView("edit")}
                  >
                    <Icon name="pencil" /> Edit
                  </button>
                </span>
                <button className="ht-btn" onClick={() => rereadOne(active.id)}>
                  <Icon name="again" /> Read again
                </button>
              </>
            )}
            <button className="ht-btn" onClick={copyAll} disabled={!allText}>
              <Icon name={copied ? "check" : "copy"} />
              {copied ? "Copied" : "Copy all"}
            </button>
            <button className="ht-btn" onClick={downloadAll} disabled={!allText}>
              <Icon name="download" /> Save
            </button>
          </div>

          {!active && (
            <div className="ht-empty">
              <p>
                Add a photo of a page to begin. Lecture notes, a lab notebook spread,
                a worked problem set, a letter.
              </p>
            </div>
          )}

          {active?.status === "queued" && (
            <div className="ht-empty">
              <p>Queued. Choose an output style, then read the page.</p>
            </div>
          )}

          {active?.status === "reading" && (
            <div className="ht-reading">
              <span className="ht-reading-label">Reading</span>
              <span className="ht-track" />
            </div>
          )}

          {active?.status === "failed" && (
            <div className="ht-fail">
              {active.error}
              <br />
              Use “Read {pending ? "pages" : "again"}” to retry.
            </div>
          )}

          {active?.status === "done" &&
            (view === "edit" ? (
              <textarea
                className="ht-edit"
                value={active.text}
                spellCheck={false}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.id === active.id ? { ...i, text: e.target.value } : i
                    )
                  )
                }
              />
            ) : view === "formatted" ? (
              <div className="ht-doc" ref={sheetRef}>
                {renderFormatted(active.text)}
              </div>
            ) : (
              <div className="ht-source" ref={sheetRef}>
                <FlaggedText text={active.text} />
              </div>
            ))}

          {active?.status === "done" && (
            <div className="ht-foot">
              <span>{words} words</span>
              <span className={flagCount ? "ht-foot-flag" : undefined}>
                {flagCount} flagged
              </span>
              <span>{MODES[mode].label}</span>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

createRoot(document.getElementById("app")).render(<Longhand />);
