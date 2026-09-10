/* Fieldnote — build 3.
   The application lives here rather than inline in index.html on purpose. An
   inline block ends at the first closing script tag the HTML parser sees, so any
   step that rewrites the page — a sanitiser, an editor, a preview sandbox, a
   deploy pipeline — can cut it early and spill the rest onto the page as text.
   Served as a .js file this text is never HTML-parsed, so that cannot happen. */

const SEED = `
# Bioenergetics Lecture 2 - photosynthesis and the light reactions

Tags: bioenergetics

A leaf runs two workshops in sequence. The first captures light and stores it in
chemical carriers; the second spends those carriers to build sugar out of carbon
dioxide. Only the first one needs light, which is why the second is sometimes
called the dark reaction, though it runs happily in daylight too.

## The overall equation

$$6\\,CO_2 + 6\\,H_2O + \\text{light} \\longrightarrow C_6H_{12}O_6 + 6\\,O_2$$

Read it as an energy transaction: light energy is converted into the bond energy
of glucose, and the oxygen released comes from the split water, not from the CO₂.

## Two stages, one hand-off

\`\`\`mermaid
flowchart LR
  L[Sunlight] --> T[Thylakoid membrane<br/>light reactions]
  W[H₂O] --> T
  T --> O[O₂ out]
  T --> A[ATP + NADPH]
  A --> C[Stroma<br/>Calvin cycle]
  D[CO₂] --> C
  C --> G[Glucose]
\`\`\`

## Light helps, until it doesn't

Doubling the light does not double the sugar. Below a threshold the rate tracks
light almost linearly, then the enzymes of the Calvin cycle become the bottleneck
and the curve flattens. A shade plant saturates much earlier.

\`\`\`chart
{
  "type": "line",
  "data": {
    "labels": ["0", "200", "400", "600", "800", "1000", "1200", "1400", "1600"],
    "datasets": [
      { "label": "Sun plant", "data": [-2, 6, 12, 17, 20, 22, 23, 23.5, 24],
        "borderColor": "#15669d", "backgroundColor": "rgba(21,102,157,.10)", "fill": true, "tension": 0.3 },
      { "label": "Shade plant", "data": [-1, 5, 8, 9.5, 10, 10.2, 10.3, 10.3, 10.3],
        "borderColor": "#8d3c4f", "borderDash": [5, 4], "tension": 0.3 }
    ]
  },
  "options": {
    "scales": {
      "x": { "title": { "display": true, "text": "light intensity (µmol photons m⁻² s⁻¹)" } },
      "y": { "title": { "display": true, "text": "net CO₂ uptake" } }
    }
  }
}
\`\`\`

Where the curve crosses zero is the compensation point: photosynthesis exactly
cancels respiration, and the plant is breaking even.

## Watching a photon land

\`\`\`svg
<svg viewBox="0 0 480 140" role="img" aria-label="A photon striking a chloroplast, with oxygen bubbling away">
  <style>
    .cap{font:11px 'Inter',sans-serif;fill:#5a6477}
    .ph{fill:#8d3c4f;animation:fly 3.2s ease-in infinite}
    .o2{fill:none;stroke:#15669d;animation:rise 3.2s ease-out infinite}
    @keyframes fly{0%{transform:translate(0,0);opacity:0}
      15%{opacity:1}70%{transform:translate(212px,44px);opacity:1}
      75%{transform:translate(212px,44px);opacity:0}100%{opacity:0}}
    @keyframes rise{0%,70%{transform:translate(0,0);opacity:0}
      80%{opacity:.9}100%{transform:translate(26px,-52px);opacity:0}}
    @media (prefers-reduced-motion:reduce){.ph,.o2{animation:none}}
  </style>
  <circle cx="42" cy="34" r="16" fill="#f5ead8" stroke="#8d3c4f"/>
  <text class="cap" x="42" y="18" text-anchor="middle">sun</text>
  <ellipse cx="300" cy="86" rx="76" ry="34" fill="#f0e4d1" stroke="#15669d"/>
  <ellipse cx="300" cy="86" rx="52" ry="18" fill="none" stroke="#94c6c3"/>
  <text class="cap" x="300" y="134" text-anchor="middle">chloroplast, stacked thylakoids</text>
  <circle class="ph" cx="60" cy="42" r="6"/>
  <circle class="o2" cx="340" cy="62" r="7"/>
</svg>
\`\`\`

## Where it happens, in three dimensions

Grana are stacks of flattened discs, and the stacking is the point: it multiplies
membrane area per unit volume, so more reaction centres fit into one chloroplast.

\`\`\`svg
<svg viewBox="0 0 640 234" data-view="isometric" role="img" aria-label="An isometric view of two grana stacks of thylakoid discs joined by a stroma lamella">
  <style>
    .iso-c{font:11px 'Inter',sans-serif;fill:#5a6477}
    .iso-top{fill:#f0e4d1;stroke:#15669d;stroke-width:1.5}
    .iso-side{fill:rgba(21,102,157,.28);stroke:#15669d;stroke-width:1}
    .iso-lam{fill:rgba(21,102,157,.16);stroke:#15669d;stroke-width:1}
  </style>
  <path class="iso-lam" d="M246 150 L 356 120 L 374 128 L 264 158 Z"/>
  <path class="iso-side" d="M132 180 L132 192 Q190 244 248 192 L248 180 Q190 232 132 180 Z"/>
  <ellipse class="iso-top" cx="190" cy="180" rx="58" ry="26"/>
  <path class="iso-side" d="M132 158 L132 170 Q190 222 248 170 L248 158 Q190 210 132 158 Z"/>
  <ellipse class="iso-top" cx="190" cy="158" rx="58" ry="26"/>
  <path class="iso-side" d="M132 136 L132 148 Q190 200 248 148 L248 136 Q190 188 132 136 Z"/>
  <ellipse class="iso-top" cx="190" cy="136" rx="58" ry="26"/>
  <path class="iso-side" d="M132 114 L132 126 Q190 178 248 126 L248 114 Q190 166 132 114 Z"/>
  <ellipse class="iso-top" cx="190" cy="114" rx="58" ry="26"/>
  <path class="iso-side" d="M352 168 L352 180 Q410 232 468 180 L468 168 Q410 220 352 168 Z"/>
  <ellipse class="iso-top" cx="410" cy="168" rx="58" ry="26"/>
  <path class="iso-side" d="M352 146 L352 158 Q410 210 468 158 L468 146 Q410 198 352 146 Z"/>
  <ellipse class="iso-top" cx="410" cy="146" rx="58" ry="26"/>
  <path class="iso-side" d="M352 124 L352 136 Q410 188 468 136 L468 124 Q410 176 352 124 Z"/>
  <ellipse class="iso-top" cx="410" cy="124" rx="58" ry="26"/>
  <text class="iso-c" x="190" y="226" text-anchor="middle">granum, stacked thylakoids</text>
  <text class="iso-c" x="410" y="216" text-anchor="middle">second granum</text>
  <text class="iso-c" x="310" y="104" text-anchor="middle">stroma lamella</text>
  <text class="iso-c" x="530" y="146">stroma, Calvin cycle</text>
</svg>
\`\`\`

Light reactions run in those disc membranes; the Calvin cycle runs in the fluid
around them.

## The two stages side by side

| Stage | Where | Needs | Produces |
|---|---|---|---|
| Light reactions | thylakoid membrane | light, water | ATP, NADPH, O₂ |
| Calvin cycle | stroma | ATP, NADPH, CO₂ | G3P, then glucose |

> Common exam trap: the oxygen you exhale-worth of a forest comes from splitting
> water at photosystem II. Carbon dioxide contributes carbon and oxygen to the
> sugar, never to the released O₂.

- [x] Write the overall equation from memory
- [ ] Say which stage needs light and why the other still depends on it
- [ ] Explain the compensation point in one sentence

## About this note

Press **Write** in the header to see the source. Alongside ordinary Markdown you
can use \`$math$\` and \`$$display math$$\`, a fence tagged \`mermaid\` for diagrams, a
fence tagged \`chart\` holding a Chart.js config, and a fence tagged \`svg\` for
drawings, CSS animation, and isometric 3D.

The title line carries three parts: the class, the unit, then a dash and a short
description. It becomes the note title here and the filename when you save. The
\`Tags:\` line under it lives in the markdown, so tags travel with the file; the
default is just the class name. The Prompt button on the library screen hands an
assistant the exact wording for all of it.
`;

/* ================================================================
   Fieldnote — a static note library that renders generated notes.
   One file, no build step. Save as index.html on any static host.

   Notes render straight into this page rather than a nested iframe,
   because embedded viewers commonly block iframe srcdoc. That means
   a note's own style and script elements run in this document, so treat
   note source as trusted the way you would your own HTML.
   ================================================================ */

const CDN = {
  fonts:     "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400&display=swap",
  katexCss:  "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css",
  katex:     "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js",
  autorender:"https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js",
  mermaid:   "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.0/mermaid.min.js",
  chart:     "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
};

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

/* ------------------------------ markdown ------------------------------ */
function mdToHtml(source){
  const store = [];
  const salt = Math.random().toString(36).slice(2, 8);
  const put = html => { store.push(html); return "\u0001" + salt + (store.length - 1) + "\u0001"; };
  const tokRe = new RegExp("\u0001" + salt + "(\\d+)\u0001", "g");
  const onlyRe = new RegExp("^\u0001" + salt + "\\d+\u0001$");
  let s = String(source).replace(/\r\n?/g, "\n");

  s = s.replace(/^```([\w-]*)[ \t]*\n([\s\S]*?)^```[ \t]*$/gm, (m, lang, code) => {
    lang = (lang || "").toLowerCase();
    if (lang === "mermaid") return put('<pre class="mermaid">' + esc(code.trim()) + "</pre>");
    if (lang === "chart")   return put('<figure class="fn-chart" data-chart="' + encodeURIComponent(code.trim()) + '"><canvas></canvas></figure>');
    if (lang === "html" || lang === "svg") return put(code);
    if (lang === "math")    return put('<div class="fn-math">$$' + code.trim() + "$$</div>");
    return put('<pre class="fn-code"><code>' + esc(code.replace(/\n$/, "")) + "</code></pre>");
  });

  s = s.replace(/`([^`\n]+)`/g, (m, x) => put("<code>" + esc(x) + "</code>"));
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, x) => put('<div class="fn-math">$$' + x + "$$</div>"));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, x) => put('<div class="fn-math">$$' + x + "$$</div>"));
  s = s.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (m, p, x) => p + put("$" + x + "$"));

  const inline = t => t
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/^\[ \] /, '<span class="box">&#9744;</span> ')
    .replace(/^\[[xX]\] /, '<span class="box">&#9745;</span> ');

  const lines = s.split("\n");
  const out = [];
  const only = l => onlyRe.test(l.trim());
  let i = 0;

  const listItems = marker => {
    const items = [];
    let base = null;
    const sub = text => {
      const k = items.length - 1;
      items[k] = /<\/li><\/ul>$/.test(items[k])
        ? items[k].replace(/<\/li><\/ul>$/, "</li><li>" + text + "</li></ul>")
        : items[k] + '<ul class="sub"><li>' + text + "</li></ul>";
    };
    while (i < lines.length) {
      const m = lines[i].match(marker);
      if (m) {
        const ind = lines[i].match(/^\s*/)[0].length;
        if (base === null) base = ind;
        if (ind >= base + 2 && items.length) sub(inline(m[2].trim()));
        else items.push(inline(m[2].trim()));
        i++; continue;
      }
      if (/^\s{2,}\S/.test(lines[i]) && items.length) {
        const nested = lines[i].trim().match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
        if (nested) sub(inline(nested[1]));
        else items[items.length - 1] += " " + inline(lines[i].trim());
        i++; continue;
      }
      break;
    }
    return items;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (only(line)) { out.push(line.trim()); i++; continue; }

    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      const n = m[1].length;
      out.push("<h" + n + ">" + inline(m[2].trim()) + "</h" + n + ">"); i++; continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push("<blockquote>" + mdToHtml(buf.join("\n")) + "</blockquote>");
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      const cells = r => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
      const head = cells(lines[i]);
      const align = cells(lines[i + 1]).map(c => c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left");
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { body.push(cells(lines[i])); i++; }
      let t = "<table><thead><tr>";
      head.forEach((h, k) => t += '<th style="text-align:' + (align[k] || "left") + '">' + inline(h) + "</th>");
      t += "</tr></thead><tbody>";
      body.forEach(r => {
        t += "<tr>";
        r.forEach((c, k) => t += '<td style="text-align:' + (align[k] || "left") + '">' + inline(c) + "</td>");
        t += "</tr>";
      });
      out.push(t + "</tbody></table>");
      continue;
    }

    if (/^\s*(?:[-*+])\s+/.test(line)) {
      out.push("<ul><li>" + listItems(/^\s*([-*+])\s+(.*)$/).join("</li><li>") + "</li></ul>");
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      out.push("<ol><li>" + listItems(/^\s*(\d+[.)])\s+(.*)$/).join("</li><li>") + "</li></ol>");
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() && !only(lines[i]) &&
           !/^(#{1,6}\s|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i]) &&
           !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
    if (buf.length) out.push("<p>" + inline(buf.join("\n")) + "</p>");
  }

  let res = out.join("\n");
  for (let pass = 0; pass < 4 && res.indexOf("\u0001") > -1; pass++)
    res = res.replace(tokRe, (x, k) => store[+k] || "");
  return res;
}

/* ----------------------- note typography (one source) ----------------- */
const NOTE_CSS = `
:root{--sky-deep:#15669d;--sky:#3a8ab8;--sky-soft:#94c6c3;--cream:#f5ead8;
  --paper:#fbf6ec;--paper-soft:#f0e4d1;--rose:#cb8f9b;--rose-deep:#8d3c4f;
  --ink:#1e2a3a;--ink-dim:#5a6477;--ink-faint:#a0a8b5;--line:#e5d9c3;--doc-col:660px;
  --serif:'Cormorant Garamond',Georgia,serif;
  --sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0 auto;max-width:var(--doc-col);padding:56px 40px 120px;color:var(--ink);
  background:radial-gradient(ellipse 85% 55% at 50% -12%,rgba(58,138,184,.10),transparent 62%),
    radial-gradient(ellipse 95% 55% at 50% 112%,rgba(139,60,79,.08),transparent 62%),var(--paper);
  background-attachment:fixed;
  font-family:var(--sans);font-weight:300;font-size:17px;line-height:1.75;
  text-wrap:pretty;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:var(--serif);font-weight:400;color:var(--ink);text-wrap:balance}
h1{font-size:clamp(30px,4.4vw,40px);line-height:1.12;letter-spacing:-.015em;margin:0 0 .55em}
h2{font-size:30px;line-height:1.15;letter-spacing:-.01em;margin:2em 0 .5em;
  padding-bottom:.3em;border-bottom:1px solid var(--line)}
h3{font-size:23px;line-height:1.25;margin:1.7em 0 .45em}
h1 em,h2 em,h3 em{font-style:italic;color:var(--rose-deep)}
h4,h5,h6{font-family:var(--mono);font-weight:400;font-size:10px;letter-spacing:2px;
  text-transform:uppercase;color:var(--rose-deep);margin:1.9em 0 .7em}
p{margin:0 0 1.05em}
a{color:var(--ink);border-bottom:1px solid var(--line);transition:color .3s,border-color .3s}
a:hover{color:var(--rose-deep);border-bottom-color:var(--rose-deep)}
strong{font-weight:500;color:var(--ink)}
em{font-style:italic}
mark{background:rgba(141,60,79,.16);padding:0 .12em}
ul,ol{margin:0 0 1.05em;padding-left:0;list-style:none}
ol{counter-reset:fn-ol}
li{margin:.4em 0;padding-left:24px;position:relative}
ul>li::before{content:'—';position:absolute;left:0;color:var(--rose-deep)}
ol>li{counter-increment:fn-ol}
ol>li::before{content:counter(fn-ol) '.';position:absolute;left:0;top:.12em;
  font-family:var(--mono);font-size:12px;color:var(--rose-deep)}
ul>li:has(>.box:first-child)::before{content:none}
ul.sub{margin:.4em 0 0}
.box{color:var(--rose-deep)}
blockquote{margin:1.7em 0;padding:18px 22px;background:var(--paper-soft);
  border-left:2px solid var(--rose-deep);color:var(--ink)}
blockquote p:last-child{margin-bottom:0}
hr{border:0;border-top:1px solid var(--line);margin:2.2em 0}
img,svg{max-width:100%;height:auto}
figure{margin:2em 0}
figcaption{font-family:var(--mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;
  color:var(--ink-dim);margin-top:.8em}
table{border-collapse:collapse;width:100%;margin:1.9em 0;font-family:var(--sans);
  font-weight:300;font-size:15px;line-height:1.55}
th{text-align:left;font-family:var(--mono);font-weight:400;font-size:10px;letter-spacing:2px;
  text-transform:uppercase;color:var(--ink-dim);border-bottom:1px solid var(--ink);padding:.6em .6em}
td{border-bottom:1px solid var(--line);padding:.6em .6em;vertical-align:top}
tbody tr:hover{background:var(--paper-soft)}
code{font-family:var(--mono);font-size:.82em;background:var(--paper-soft);padding:.1em .32em}
pre.fn-code{background:var(--paper-soft);border:1px solid var(--line);padding:14px 16px;overflow:auto}
pre.fn-code code{background:none;padding:0;font-size:12.5px;line-height:1.65}
.fn-math{margin:1.5em 0;overflow-x:auto;overflow-y:hidden}
figure.fn-chart{position:relative;height:320px}
figure.fn-3d{position:relative;height:290px;margin:2em 0;perspective:900px;perspective-origin:50% 42%}
.fn-3d-stage{position:absolute;inset:0;transform-style:preserve-3d}
.fn-3d-face{position:absolute;inset:0;margin:auto;display:grid;place-items:center;
  font-family:var(--sans);font-size:13px;color:var(--ink);
  border:1px solid var(--sky-deep);background:rgba(21,102,157,.07)}
pre.mermaid{background:none;border:0;text-align:center;font-family:var(--sans)}
.fn-err{border-left:2px solid var(--rose-deep);background:var(--paper-soft);padding:.7em .9em;
  font-family:var(--mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;
  color:var(--rose-deep)}
@font-face{font-family:"FN Rho";font-style:italic;font-weight:400;size-adjust:96%;
  src:local("Georgia Italic"),local("Times New Roman Italic"),local("Noto Serif Italic"),
      local("DejaVu Serif Italic"),local("Liberation Serif Italic"),local("Charter Italic"),
      local("Georgia"),local("Times New Roman"),local("Noto Serif");
  unicode-range:U+03C1,U+03F1}
.katex .mathnormal,.katex .mathit,.katex .mathdefault{font-family:"FN Rho",KaTeX_Math,serif}
`;

const NOTE_PRINT = `@media print{body{padding:0;max-width:none}h2{break-after:avoid}
figure,table,pre{break-inside:avoid}.fn-3d-stage,.fn-3d-stage *{animation:none !important}}
@media (prefers-reduced-motion:reduce){.fn-3d-stage,.fn-3d-stage *{animation:none !important}}`;

/* Prefix every rule so note styles cannot reach the app chrome. */
function scopeCss(css, sel){
  return css.replace(/(^|\})\s*([^{}@]+)\{/g, (m, close, list) =>
    close + "\n" + list.split(",").map(one => {
      const t = one.trim();
      if (!t) return t;
      if (t === ":root" || t === "html" || t === "body") return sel;
      if (t === "*") return sel + " *";
      return sel + " " + t;
    }).join(",") + "{");
}
(function injectNoteCss(){
  const el = document.createElement("style");
  el.textContent = scopeCss(NOTE_CSS, ".doc") + [
    "",
    ".doc{background:none; overflow-wrap:break-word}",
    ".doc td,.doc th{overflow-wrap:break-word}",
    ".doc pre.mermaid svg{max-width:100% !important; height:auto}",
    "@media (prefers-reduced-motion:reduce){.doc .fn-3d-stage,.doc .fn-3d-stage *{animation:none !important}}",
    "@media print{.doc .fn-3d-stage,.doc .fn-3d-stage *{animation:none !important}}",
    "@media (max-width:900px){",
    "  .doc{padding:36px 32px 88px}",
    "  .doc figure.fn-chart{height:250px}",
    "  .doc h2{font-size:26px}",
    "  .doc h3{font-size:21px}",
    "}",
    "@media (max-width:520px){",
    "  .doc{padding:28px 16px 72px}",
    "  .doc table{font-size:14px}",
    "  .doc th,.doc td{padding:.45em .4em}",
    "}",
    "@media print{.doc{max-width:none;padding:0}}"
  ].join("\n");
  document.head.appendChild(el);
})();

/* The script tags for a downloaded note are assembled character by character, so
   no closing-tag sequence ever appears literally in this file. An inline script
   block ends at the very first closing tag the HTML parser sees, and the usual
   backslash escape only survives if nothing between here and the browser
   normalises it away — editors, sanitisers and preview sandboxes sometimes do,
   and the rest of the file then lands on the page as plain text. */
const TAG_O = "<" + "script", TAG_C = "<" + "/" + "script" + ">";
const extScript = url => TAG_O + ' defer src="' + url + '">' + TAG_C;

function buildDoc(body, title){
  return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + esc(title || "Note") + "</title>" +
    '<link rel="stylesheet" href="' + CDN.fonts + '">' +
    '<link rel="stylesheet" href="' + CDN.katexCss + '">' +
    "<style>" + NOTE_CSS + NOTE_PRINT + "</style></head><body>\n" + body +
    "\n" + extScript(CDN.katex) + extScript(CDN.autorender) +
    extScript(CDN.mermaid) + extScript(CDN.chart) +
    TAG_O + ">" + STANDALONE_JS + TAG_C + "</body></html>";
}

const STANDALONE_JS = `
window.addEventListener("load",function(){
  if(window.mermaid){try{
    mermaid.initialize({startOnLoad:false,theme:"base",fontFamily:"'Inter',sans-serif",
      themeVariables:{primaryColor:"#f0e4d1",primaryTextColor:"#1e2a3a",primaryBorderColor:"#15669d",
        lineColor:"#5a6477",secondaryColor:"#fbf6ec",tertiaryColor:"#fbf6ec"}});
    var d=document.querySelectorAll("pre.mermaid");
    if(d.length)mermaid.run({nodes:d}).catch(function(){});
  }catch(e){}}
  if(window.Chart){
    Chart.defaults.font.family="'Inter',system-ui,sans-serif";
    Chart.defaults.font.size=12;
    Chart.defaults.color="#5a6477";
    Chart.defaults.borderColor="#e5d9c3";
    document.querySelectorAll("figure.fn-chart").forEach(function(f){
    try{var c=JSON.parse(decodeURIComponent(f.getAttribute("data-chart")));
      c.options=Object.assign({responsive:true,maintainAspectRatio:false},c.options||{});
      new Chart(f.querySelector("canvas"),c);
    }catch(e){f.innerHTML='<div class="fn-err">Chart config could not be read.</div>';f.style.height="auto"}
  })}
  if(window.renderMathInElement){try{renderMathInElement(document.body,{
    delimiters:[{left:"$$",right:"$$",display:true},{left:"\\\\[",right:"\\\\]",display:true},
                {left:"$",right:"$",display:false},{left:"\\\\(",right:"\\\\)",display:false}],
    ignoredTags:["script","noscript","style","textarea","pre","code","option"],
    ignoredClasses:["mermaid"],throwOnError:false})}catch(e){}}
});
`;

/* --------------------------- lazy libraries --------------------------- */
const pending = {};
function loadScript(url){
  return pending[url] || (pending[url] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = url; s.onload = () => res(true);
    s.onerror = () => { delete pending[url]; rej(new Error("blocked")); };
    document.head.appendChild(s);
  }));
}
function loadCss(url){
  if (pending["css:" + url]) return;
  pending["css:" + url] = 1;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = url;
  document.head.appendChild(l);
}

/* ------------------------------ rendering ----------------------------- */
let charts = [], gen = 0, mermaidReady = false;

function runScripts(root){
  root.querySelectorAll("script").forEach(old => {
    const s = document.createElement("script");
    Array.from(old.attributes).forEach(a => s.setAttribute(a.name, a.value));
    s.textContent = old.textContent;
    old.replaceWith(s);
  });
}

function render(){
  if (!cur) return;
  const mine = ++gen;
  charts.forEach(c => { try { c.destroy(); } catch(e){} });
  charts = [];
  const doc = $("#doc");
  doc.innerHTML = cur.mode === "md" ? mdToHtml(bodyWithoutTags(cur.body)) : cur.body;
  runScripts(doc);
  enhance(doc, mine);
}

async function enhance(root, mine){
  const missing = [];
  const wantMath = !!root.querySelector(".fn-math") || /\$[^$\n]+\$/.test(root.textContent || "");
  const mer = Array.from(root.querySelectorAll("pre.mermaid"));
  const figs = Array.from(root.querySelectorAll("figure.fn-chart"));

  if (mer.length) {
    try {
      await loadScript(CDN.mermaid);
      if (mine !== gen) return;
      if (!mermaidReady) {
        window.mermaid.initialize({ startOnLoad: false, theme: "base",
          fontFamily: "'Inter',sans-serif",
          themeVariables: { primaryColor: "#f0e4d1", primaryTextColor: "#1e2a3a",
            primaryBorderColor: "#15669d", lineColor: "#5a6477",
            secondaryColor: "#fbf6ec", tertiaryColor: "#fbf6ec" } });
        mermaidReady = true;
      }
      await window.mermaid.run({ nodes: mer });
    } catch(e) { missing.push("diagrams"); }
  }

  if (figs.length) {
    try {
      await loadScript(CDN.chart);
      if (mine !== gen) return;
      window.Chart.defaults.font.family = "'Inter',system-ui,sans-serif";
      window.Chart.defaults.font.size = 12;
      window.Chart.defaults.color = "#5a6477";
      window.Chart.defaults.borderColor = "#e5d9c3";
      figs.forEach(f => {
        try {
          const cfg = JSON.parse(decodeURIComponent(f.getAttribute("data-chart")));
          cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options || {});
          charts.push(new window.Chart(f.querySelector("canvas"), cfg));
        } catch(err) {
          f.innerHTML = '<div class="fn-err">This chart config could not be read: ' + esc(err.message) + "</div>";
          f.style.height = "auto";
        }
      });
    } catch(e) { missing.push("charts"); }
  }

  if (wantMath) {
    loadCss(CDN.katexCss);
    try {
      await loadScript(CDN.katex);
      await loadScript(CDN.autorender);
      if (mine !== gen) return;
      window.renderMathInElement(root, {
        delimiters: [{ left: "$$", right: "$$", display: true },
                     { left: "\\[", right: "\\]", display: true },
                     { left: "$", right: "$", display: false },
                     { left: "\\(", right: "\\)", display: false }],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
        ignoredClasses: ["mermaid"], throwOnError: false });
    } catch(e) { missing.push("math"); }
  }

  if (mine !== gen) return;
  const w = $("#warn");
  if (missing.length) {
    w.hidden = false;
    w.textContent = "Could not load the libraries for " + missing.join(" and ") +
      ", so those blocks stay as plain text. They need cdnjs.com, which some embedded " +
      "viewers block. Download the note or open this file from your own site to get them.";
  } else { w.hidden = true; w.textContent = ""; }
}

/* ------------------------------- storage ------------------------------ */
const Store = (() => {
  const KEY = "fieldnote:library";
  let mem = null, where = "session";
  const hasW = !!(window.storage && typeof window.storage.get === "function");
  return {
    where: () => where,
    async load(){
      if (hasW) {
        try { const r = await window.storage.get(KEY); where = "browser"; if (r && r.value) return JSON.parse(r.value); }
        catch(e) { where = "browser"; return null; }
        return null;
      }
      try { const v = localStorage.getItem(KEY); where = "browser"; return v ? JSON.parse(v) : null; }
      catch(e) { where = "session"; }
      return mem;
    },
    async save(list){
      const s = JSON.stringify(list);
      if (hasW) { try { await window.storage.set(KEY, s); where = "browser"; return; } catch(e){} }
      try { localStorage.setItem(KEY, s); where = "browser"; return; } catch(e){}
      mem = list; where = "session";
    }
  };
})();

/* -------------------------------- model ------------------------------- */
let notes = [], cur = null;
let filterTag = null, query = "", sortBy = "edited", selIdx = 0;

const uid = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function titleOf(n){
  const m = (n.body || "").match(/^\s*#\s+(.+)$/m) || (n.body || "").match(/<h1[^>]*>([^<]+)</i);
  return (m ? m[1].trim().replace(/[*_`]/g, "") : (n.title || "Untitled note")).slice(0, 120);
}
/* Title grammar: "<Class> <Unit> - <description>"
   e.g. "Biotransport Lecture 1 - conservation laws and Couette flow" */
const UNIT_RE = /^(.*?)[\s,]+((?:lecture|lect|lec|chapter|chap|ch|week|wk|unit|module|mod|lab|recitation|rec|seminar|tutorial|topic|section|sec|part|day|quiz|exam|midterm|final|problem\s*set|pset|homework|hw|reading)\b\.?\s*[\w.\-]*)$/i;

function titleParts(title){
  const seg = String(title || "").split(/\s+[-\u2013\u2014]\s+/);
  const head = (seg.shift() || "").trim();
  const desc = seg.join(" - ").trim();
  const m = head.match(UNIT_RE);
  if (m) return { cls: m[1].trim(), unit: m[2].trim(), desc: desc };
  const w = head.split(/\s+/).filter(Boolean);
  return { cls: w[0] || head, unit: w.slice(1).join(" "), desc: desc };
}

/* Tags live in the markdown, on a "Tags:" line directly under the H1. */
function tagLineIndex(body){
  const lines = String(body || "").split("\n");
  let seenH1 = false;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (!seenH1) { if (/^#\s+\S/.test(lines[i])) seenH1 = true; continue; }
    if (!lines[i].trim()) continue;
    return /^\s*tags?\s*:/i.test(lines[i]) ? i : -1;
  }
  return -1;
}
function tagsFromBody(body, title){
  const i = tagLineIndex(body);
  if (i > -1) {
    const t = String(body).split("\n")[i].replace(/^\s*tags?\s*:/i, "")
      .split(",").map(x => x.trim().replace(/^#/, "")).filter(Boolean);
    if (t.length) return t;
  }
  const cls = titleParts(title).cls.toLowerCase();
  return cls ? [cls] : [];
}
function bodyWithoutTags(body){
  const i = tagLineIndex(body);
  if (i < 0) return body;
  const lines = String(body).split("\n");
  lines.splice(i, 1);
  return lines.join("\n");
}
function bodyWithTags(body, tags){
  const lines = String(body || "").split("\n");
  const i = tagLineIndex(body);
  const line = tags.length ? "Tags: " + tags.join(", ") : null;
  if (i > -1) { if (line) lines[i] = line; else lines.splice(i, 1); return lines.join("\n"); }
  if (!line) return body;
  const h = lines.findIndex(l => /^#\s+\S/.test(l));
  if (h < 0) return line + "\n\n" + body;
  lines.splice(h + 1, 0, "", line);
  return lines.join("\n");
}
/* The title is also the filename, keeping spaces and the dash. */
function fileBase(title){
  return String(title).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s]+$/g, "").slice(0, 120) || "note";
}

function featuresOf(b){
  const f = [];
  if (/\$\$[\s\S]+?\$\$|\$[^\n$]+\$/.test(b)) f.push("math");
  if (/```mermaid/.test(b)) f.push("diagram");
  if (/```chart/.test(b)) f.push("chart");
  if (/```svg|<svg/.test(b)) f.push("drawing");
  if (/fn-3d|preserve-3d|data-view="iso/.test(b)) f.push("3D");
  return f;
}
function snippetOf(b){
  return String(bodyWithoutTags(b))
    .replace(/^```[\s\S]*?^```/gm, " ")
    .replace(/^\s*#.*$/m, "")
    .replace(/[#>*_`|~=]/g, "")
    .replace(/\$\$?[^$]*\$\$?/g, " ")
    .replace(/\[[ xX]\]/g, "")
    .replace(/\s+/g, " ")
    .trim().slice(0, 150);
}
function whenOf(ms){
  const d = (Date.now() - ms) / 1000;
  if (d < 90) return "just now";
  if (d < 3600) return Math.round(d / 60) + " min ago";
  if (d < 86400) return Math.round(d / 3600) + " h ago";
  if (d < 604800) return Math.round(d / 86400) + " d ago";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TEMPLATE = "# Course Lecture 1 - what this covers\n\nTags: course\n\nPaste a generated note over this text, or write your own. The title carries the\nclass, the unit, then a dash and a short description.\n";

async function boot(){
  const saved = await Store.load();
  if (saved && Array.isArray(saved) && saved.length) {
    notes = saved;
  } else {
    const body = SEED.replace(/^\n/, "");
    const title = titleOf({ body: body });
    notes = [{ id: uid(), title: title, mode: "md",
      tags: tagsFromBody(body, title), body: body, updated: Date.now() }];
    await Store.save(notes);
  }
  route();
}

const persist = (() => {
  let t;
  return () => {
    clearTimeout(t);
    $("#save").textContent = "saving";
    t = setTimeout(async () => {
      await Store.save(notes);
      $("#save").textContent = "saved to " + Store.where();
    }, 500);
  };
})();

/* ---------------------------- status messages ------------------------- */
/* Both sinks are hidden while empty, so the storage line only ever appears when
   the browser is refusing to persist — which is the case worth interrupting for. */
let msg = "";
function notify(m){ msg = m || ""; paintMsg(); }
function paintMsg(){
  const warn = Store.where() === "browser" ? ""
    : "This browser will not store anything, so notes live in this tab only. Export before you close it.";
  const text = msg || warn;
  ["#libState", "#setMsg"].forEach(sel => { const el = $(sel); if (el) el.textContent = text; });
}

/* -------------------------------- settings ---------------------------- */
function renderSettings(){
  $("#setState").textContent = Store.where() === "browser"
    ? "Your notes are saved in this browser only. They never reach the server, and they do not follow you to another device or another browser. Export before you clear site data."
    : "This browser is refusing to store anything, so your notes live in memory for this tab alone. Export before you close it.";
  paintMsg();
}

/* -------------------------------- home -------------------------------- */
function visible(){
  const q = query.trim().toLowerCase();
  const v = notes.filter(n =>
    (!filterTag || (n.tags || []).includes(filterTag)) &&
    (!q || (titleOf(n) + " " + n.body).toLowerCase().includes(q)));
  v.sort(sortBy === "edited"
    ? (a, b) => b.updated - a.updated
    : (a, b) => titleOf(a).localeCompare(titleOf(b)));
  return v;
}

function tagBtn(label, n, on, tag){
  return '<button type="button" data-tag="' + esc(tag) + '" aria-pressed="' + on + '">' +
    '<span class="nm">' + esc(label) + '</span><span class="ct">' + n + "</span></button>";
}

function renderHome(){
  const counts = {};
  notes.forEach(n => (n.tags || []).forEach(t => counts[t] = (counts[t] || 0) + 1));
  const tags = Object.keys(counts).sort();
  $("#tagList").innerHTML =
    tagBtn("All notes", notes.length, filterTag === null, "") +
    tags.map(t => tagBtn(t, counts[t], filterTag === t, t)).join("");
  $("#tagList").querySelectorAll("button").forEach(b => b.onclick = () => {
    filterTag = b.dataset.tag || null; selIdx = 0; renderHome();
  });

  const v = visible();
  selIdx = Math.min(selIdx, Math.max(0, v.length - 1));
  $("#count").textContent = v.length
    ? v.length + (v.length === 1 ? " note" : " notes") + (filterTag ? " tagged " + filterTag : "")
    : "";
  $("#btn-sort").textContent = sortBy === "edited" ? "Last edited" : "Title";
  paintMsg();

  if (!v.length) {
    $("#list").innerHTML = '<div class="empty"><strong>' +
      (query ? "Nothing matches that search." : "No notes yet.") + "</strong>" +
      (query ? "Clear the search, or start a note from what you typed."
             : "Copy the prompt, ask an assistant for a note, then paste the reply into a new note.") +
      "</div>";
    return;
  }

  $("#list").innerHTML = v.map((n, k) => {
    const f = featuresOf(n.body);
    const tg = (n.tags || []).join(", ");
    const p = titleParts(titleOf(n));
    const rest = [p.unit, p.desc].filter(Boolean).join(" \u2014 ");
    const shown = rest ? '<span class="cl">' + esc(p.cls) + '</span> ' + esc(rest) : esc(titleOf(n));
    return '<button class="row' + (k === selIdx ? " sel" : "") + '" data-id="' + n.id + '">' +
      '<span class="c"><span class="t">' + shown + '</span>' +
      '<span class="s">' + esc(snippetOf(n.body) || "Empty note") + "</span></span>" +
      '<span class="f">' + (tg ? '<span class="tg">' + esc(tg) + "</span>" : "") +
        (tg && f.length ? " &nbsp; " : "") + f.join(", ") + "</span>" +
      '<span class="d">' + whenOf(n.updated) + "</span></button>";
  }).join("");
  $("#list").querySelectorAll(".row").forEach(r =>
    r.onclick = () => { location.hash = "#/n/" + r.dataset.id; });
}

/* -------------------------------- note -------------------------------- */
function openNote(id, write){
  cur = notes.find(n => n.id === id);
  if (!cur) { location.hash = "#/"; return; }
  $("#title").value = titleOf(cur);
  $("#src").value = cur.body;
  /* The panes persist across notes, so their scroll has to be reset by hand or
     the next note opens wherever the last one was left. */
  $("#src").scrollTop = 0;
  try { $("#src").setSelectionRange(0, 0); } catch(e){}
  cur.tags = tagsFromBody(cur.body, titleOf(cur));
  $("#tags").value = cur.tags.join(", ");
  document.querySelectorAll("[data-mode]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.mode === cur.mode)));
  $("#save").textContent = "saved to " + Store.where();
  pane(write ? "write" : "read");
  render();
  $("#view").scrollTop = 0;
}

function pane(which){
  const n = $("#note");
  n.classList.toggle("read", which === "read");
  n.classList.toggle("write", which === "write");
  document.querySelectorAll("[data-pane]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.pane === which)));
  if (which === "write") setTimeout(() => $("#src").focus(), 30);
}

let rt;
$("#src").addEventListener("input", () => {
  if (!cur) return;
  cur.body = $("#src").value;
  cur.title = titleOf(cur);
  cur.tags = tagsFromBody(cur.body, cur.title);
  cur.updated = Date.now();
  $("#title").value = cur.title;
  $("#tags").value = cur.tags.join(", ");
  persist();
  clearTimeout(rt); rt = setTimeout(render, 450);
});
$("#src").addEventListener("keydown", e => {
  if (e.key === "Tab") {
    e.preventDefault();
    const el = $("#src"), a = el.selectionStart, b = el.selectionEnd;
    el.value = el.value.slice(0, a) + "  " + el.value.slice(b);
    el.selectionStart = el.selectionEnd = a + 2;
    el.dispatchEvent(new Event("input"));
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); render(); }
});
$("#tags").addEventListener("input", () => {
  if (!cur) return;
  cur.tags = $("#tags").value.split(",").map(t => t.trim()).filter(Boolean);
  if (cur.mode === "md") {
    cur.body = bodyWithTags(cur.body, cur.tags);
    $("#src").value = cur.body;
  }
  cur.updated = Date.now();
  persist();
});
document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
  if (!cur) return;
  cur.mode = b.dataset.mode;
  document.querySelectorAll("[data-mode]").forEach(x =>
    x.setAttribute("aria-pressed", String(x === b)));
  persist(); render();
});
document.querySelectorAll("[data-pane]").forEach(b => b.onclick = () => pane(b.dataset.pane));

/* ------------------------------- routing ------------------------------ */
function route(){
  const h = location.hash || "";
  const m = h.match(/^#\/n\/([^/?]+)/);
  const onNote = !!m, onSet = /^#\/settings/.test(h);
  closeMenus();
  $("#home").style.display        = (onNote || onSet) ? "none" : "block";
  $("#settings").style.display    = onSet ? "block" : "none";
  $("#bar-home").style.display    = (onNote || onSet) ? "none" : "flex";
  $("#bar-note").style.display    = onNote ? "flex" : "none";
  $("#bar-settings").style.display = onSet ? "flex" : "none";
  $("#note").classList.toggle("on", onNote);
  if (onNote) { openNote(m[1], h.indexOf("?w") > -1); return; }
  cur = null; gen++;
  charts.forEach(c => { try { c.destroy(); } catch(e){} });
  charts = [];
  $("#doc").innerHTML = "";
  $("#warn").hidden = true;
  if (onSet) { $("#settings").scrollTop = 0; renderSettings(); } else renderHome();
}
window.addEventListener("hashchange", route);
$("#btn-back").onclick = () => { location.hash = "#/"; };
$("#logo").onclick = () => { location.hash = "#/"; };
$("#btn-settings").onclick = () => { location.hash = "#/settings"; };
$("#btn-set-back").onclick = () => { location.hash = "#/"; };

/* --------------------------- dropdown menus --------------------------- */
const allMenus = () => Array.from(document.querySelectorAll(".menu"));
const anyMenuOpen = () => allMenus().some(m => m.classList.contains("open"));
function closeMenus(except){
  allMenus().forEach(m => {
    if (m === except) return;
    m.classList.remove("open");
    m.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  });
}
allMenus().forEach(m => {
  const t = m.querySelector(".menu-toggle");
  t.addEventListener("click", e => {
    e.stopPropagation();
    const open = !m.classList.contains("open");
    closeMenus(m);
    m.classList.toggle("open", open);
    t.setAttribute("aria-expanded", String(open));
  });
  /* Print and the two saves are one-shot, so they dismiss the panel. Delete does
     not: its first click only arms it, and the label has to stay readable. */
  m.querySelectorAll(".menu-panel [data-shut]").forEach(b =>
    b.addEventListener("click", () => closeMenus()));
});
document.addEventListener("click", e => { if (!e.target.closest(".menu")) closeMenus(); });

/* ------------------------------- actions ------------------------------ */
$("#search").addEventListener("input", e => { query = e.target.value; selIdx = 0; renderHome(); });
$("#btn-sort").onclick = () => { sortBy = sortBy === "edited" ? "title" : "edited"; renderHome(); };

$("#btn-new").onclick = () => {
  const n = { id: uid(), title: "Untitled note", mode: "md", tags: [], body: TEMPLATE, updated: Date.now() };
  notes.unshift(n); persist();
  location.hash = "#/n/" + n.id + "?w";
};

let armed = 0;
$("#btn-del").onclick = async () => {
  if (!cur) return;
  const b = $("#btn-del");
  if (Date.now() > armed) {
    armed = Date.now() + 4000;
    b.textContent = "Delete for good";
    setTimeout(() => { if (Date.now() > armed) b.textContent = "Delete"; }, 4100);
    return;
  }
  armed = 0; b.textContent = "Delete";
  notes = notes.filter(n => n.id !== cur.id);
  await Store.save(notes);
  location.hash = "#/";
};

function downloadBlob(name, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function download(name, text, type){ downloadBlob(name, new Blob([text], { type: type })); }

/* ------------------------------- zip writer --------------------------- */
/* Store-only zip, written by hand so exporting needs no library and no network.
   Everything goes in uncompressed: notes are small, and this keeps the whole
   thing to a CRC table and three record layouts. */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(bytes){
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = (c >>> 8) ^ crcTable[(c ^ bytes[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}
function makeZip(files){
  const enc = new TextEncoder();
  const body = [], dir = [];
  let offset = 0, dirSize = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const d = new Date(f.date || Date.now());
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);   /* utf-8 names */
    lh.setUint16(8, 0, true);                                    /* stored      */
    lh.setUint16(10, time, true); lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    body.push(new Uint8Array(lh.buffer), name, data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    dir.push(new Uint8Array(ch.buffer), name);

    offset += 30 + name.length + data.length;
    dirSize += 46 + name.length;
  });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true); end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true); end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);
  return new Blob(body.concat(dir, [new Uint8Array(end.buffer)]), { type: "application/zip" });
}

/* Every note leaves as the same file it would arrive as, so a round trip through
   export and import is lossless. Tags ride along in the body, which is where the
   importer reads them from. */
function exportAll(){
  if (!notes.length) { notify("There is nothing to export yet."); return; }
  const used = Object.create(null);
  const files = notes.map(n => {
    const ext = n.mode === "html" ? ".html" : ".md";
    const base = fileBase(titleOf(n));
    let name = base + ext, k = 2;
    while (used[name.toLowerCase()]) name = base + " (" + (k++) + ")" + ext;
    used[name.toLowerCase()] = 1;
    return { name: name,
             text: n.mode === "md" ? bodyWithTags(n.body, n.tags || []) : n.body,
             date: n.updated };
  });
  downloadBlob("fieldnote-notes.zip", makeZip(files));
  notify(files.length + (files.length === 1 ? " note exported." : " notes exported."));
}
const noteHtml = () => cur.mode === "md" ? mdToHtml(bodyWithoutTags(cur.body)) : cur.body;

$("#btn-md").onclick = () => { if (cur) download(fileBase(titleOf(cur)) + ".md", cur.body, "text/markdown"); };
$("#btn-html").onclick = () => { if (cur) download(fileBase(titleOf(cur)) + ".html", buildDoc(noteHtml(), titleOf(cur)), "text/html"); };
$("#btn-print").onclick = () => { try { window.print(); } catch(e){} };
$("#btn-export").onclick = exportAll;
$("#btn-import").onclick = () => $("#fileLib").click();
$("#btn-import-set").onclick = () => $("#fileLib").click();

/* Accepts a whole exported folder at once, and still reads the old json backups. */
$("#fileLib").addEventListener("change", async e => {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;
  let added = 0, only = null;
  const failed = [];
  for (const f of files) {
    try {
      const text = await f.text();
      if (/\.json$/i.test(f.name)) {
        const inc = JSON.parse(text);
        if (!Array.isArray(inc)) throw new Error("expected a list of notes");
        const ids = new Set(notes.map(n => n.id));
        inc.forEach(n => {
          if (!n || !n.body) return;
          notes.push({ id: ids.has(n.id) ? uid() : (n.id || uid()),
            title: n.title || "Untitled note", mode: n.mode === "html" ? "html" : "md",
            tags: Array.isArray(n.tags) && n.tags.length ? n.tags : tagsFromBody(n.body, n.title || ""),
            body: String(n.body), updated: n.updated || Date.now() });
          added++;
        });
      } else {
        const n = { id: uid(), title: f.name.replace(/\.[^.]+$/, ""),
          mode: /\.html?$/i.test(f.name) ? "html" : "md", tags: [],
          body: text, updated: f.lastModified || Date.now() };
        n.title = titleOf(n);
        n.tags = tagsFromBody(n.body, n.title);
        notes.unshift(n);
        added++; only = n.id;
      }
    } catch(err) { failed.push(f.name); }
  }
  await Store.save(notes);
  /* One markdown file opens straight into the note; a batch goes back to the list. */
  if (added === 1 && only && !failed.length) { location.hash = "#/n/" + only; return; }
  route();
  notify(failed.length
    ? "Imported " + added + ", could not read " + failed.join(", ")
    : added + (added === 1 ? " note imported." : " notes imported."));
});

/* -------------------------------- prompt ------------------------------ */
const PROMPT = "Write a study note I can paste into a Fieldnote renderer.\n\n" +
"Reply with Markdown only, no explanation before or after, and no outer code fence.\n" +
"Beyond normal Markdown these are supported:\n" +
"- Math: $inline$ and $$display$$, rendered with KaTeX.\n" +
"- Diagrams: a fence tagged mermaid (flowchart, sequenceDiagram, stateDiagram, gantt).\n" +
"- Graphs: a fence tagged chart holding a Chart.js v4 config as JSON, for example\n" +
'  {"type":"line","data":{"labels":[...],"datasets":[{"label":"...","data":[...]}]}}\n' +
"- Shapes and animation: a fence tagged svg with raw inline SVG. A style block inside\n" +
"  it is allowed, so CSS animation works. Size by viewBox so it scales.\n" +
"- A fence tagged html for anything custom.\n" +
"Avoid single-underscore _italics_, since it collides with LaTeX subscripts. Use *italics*.\n" +
"Open with a level-1 heading, since that becomes the note title.\n\n" +
"The full authoring guide lives next to this app as fieldnote-authoring-guide.md;\n" +
"paste that instead when you want figures, equations and animation.\n\n" +
"Topic: <your topic here>\n" +
"Depth: exam level, with a worked example and a summary table.";
$("#promptText").textContent = PROMPT;
$("#btn-prompt").onclick = () => $("#dlg-prompt").showModal();
document.querySelectorAll("[data-close]").forEach(b =>
  b.onclick = e => e.target.closest("dialog").close());
$("#btn-copy").onclick = async e => {
  const b = e.target;
  try { await navigator.clipboard.writeText(PROMPT); b.textContent = "Copied"; }
  catch(err) {
    const r = document.createRange(); r.selectNodeContents($("#promptText"));
    getSelection().removeAllRanges(); getSelection().addRange(r);
    b.textContent = "Selected, press copy";
  }
  setTimeout(() => { b.textContent = "Copy prompt"; }, 2000);
};

/* ------------------------------ keyboard ------------------------------ */
document.addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  const onNote = $("#note").classList.contains("on");

  if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
    if (anyMenuOpen()) { closeMenus(); return; }
    if (onNote) { location.hash = "#/"; return; }
    if (typing) document.activeElement.blur();
    return;
  }
  if (typing) return;

  if (!onNote) {
    if (e.key === "/") { e.preventDefault(); $("#search").focus(); return; }
    if (e.key === "n") { e.preventDefault(); $("#btn-new").click(); return; }
    const v = visible();
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); selIdx = Math.min(selIdx + 1, v.length - 1); renderHome(); scrollSel(); }
    if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); renderHome(); scrollSel(); }
    if (e.key === "Enter" && v[selIdx]) { e.preventDefault(); location.hash = "#/n/" + v[selIdx].id; }
  } else if (e.key === "e" || e.key === "w") {
    e.preventDefault();
    pane($("#note").classList.contains("read") ? "write" : "read");
  }
});
function scrollSel(){
  const el = $("#list .row.sel");
  if (el) el.scrollIntoView({ block: "nearest" });
}

/* ------------------------------- resizer ------------------------------ */
(function(){
  const grip = $("#grip");
  let drag = false;
  grip.addEventListener("pointerdown", e => { drag = true; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener("pointerup", () => { drag = false; });
  grip.addEventListener("pointermove", e => {
    if (!drag) return;
    const pct = Math.min(74, Math.max(20, (e.clientX / window.innerWidth) * 100));
    document.documentElement.style.setProperty("--col", pct + "%");
  });
})();

boot();
