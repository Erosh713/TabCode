/* Extensions panel: each extension recreates a popular VS Code extension and can be switched on/off. */
import { $, esc, ext, dir, base, IMG_EXT, debounce } from "./util.js";
import { t } from "./i18n.js";
import { setMaterial } from "./icons.js";

let app = null, monaco = null;
const active = {};   // id -> array of disposables (when on)

const DEFAULT_SNIPPETS = `{
  // Tes snippets perso, au format de VS Code.
  // "prefix" = ce que tu tapes, "body" = ce qui est inséré, $1 $2 = arrêts du curseur.
  // "scope" (facultatif) = langages : html, css, javascript…
  "Section avec titre": {
    "scope": "html",
    "prefix": "sectiont",
    "body": [
      "<section class=\\"$1\\">",
      "  <h2>$2</h2>",
      "  $0",
      "</section>"
    ],
    "description": "Section avec un titre h2"
  },
  "Media query mobile": {
    "scope": "css,scss",
    "prefix": "mqmobile",
    "body": [
      "@media (max-width: 768px) {",
      "  $0",
      "}"
    ]
  },
  "Console log": {
    "scope": "javascript,typescript",
    "prefix": "clg",
    "body": ["console.log($1);"]
  }
}
`;

/* ---------------- Registry ---------------- */
const EXTS = [
  { id: "prettier", name: "Prettier", by: "Prettier", color: "#1a2b34", fg: "#f7b93e", letter: "P",
    desc: "Formate ton code (HTML, CSS, JS, JSON, Markdown) avec le vrai Prettier. Shift+Alt+F ou à l'enregistrement.",
    activate: activatePrettier, extra: () => [{ label: app.settings.formatOnSave ? "✓ Formater à l'enregistrement" : "Formater à l'enregistrement", run: () => { app.settings.formatOnSave = !app.settings.formatOnSave; app.saveSettings(); renderList(); } }] },
  { id: "auto-rename-tag", name: "Auto Rename Tag", by: "Jun Han (recréée)", color: "#e44d26", letter: "</>",
    desc: "Quand tu renommes une balise ouvrante, la balise fermante change aussi (et inversement).",
    activate: () => { app.editor.updateOptions({ linkedEditing: true }); return [{ dispose: () => app.editor.updateOptions({ linkedEditing: false }) }]; } },
  { id: "error-lens", name: "Error Lens", by: "Alexander (recréée)", color: "#c74e39", letter: "⚠",
    desc: "Affiche les erreurs et avertissements directement au bout de la ligne concernée.", activate: activateErrorLens },
  { id: "indent-rainbow", name: "indent-rainbow", by: "oderwat (recréée)", color: "#5a4fcf", letter: "≡",
    desc: "Colore chaque niveau d'indentation pour mieux voir la structure du code.", activate: activateIndentRainbow },
  { id: "material-icons", name: "Material Icon Theme", by: "Philipp Kief", color: "#0277bd", letter: "◆",
    desc: "Icônes de fichiers et de dossiers en couleur, comme dans VS Code.",
    activate: () => { setMaterial(true); app.renderTree(); app.renderTabs(); return [{ dispose: () => { setMaterial(false); app.renderTree(); app.renderTabs(); } }]; } },
  { id: "path-intellisense", name: "Path Intellisense", by: "Christian Kohler (recréée)", color: "#2e7d32", letter: "./",
    desc: "Propose les noms de tes fichiers quand tu écris href=\"…\", src=\"…\", url(…) ou import.", activate: activatePathIntellisense },
  { id: "color-highlight", name: "Color Highlight", by: "Sergii N (recréée)", color: "#ad1457", letter: "●",
    desc: "Affiche un carré de couleur à côté de #2a5298, rgb(), hsl()… et ouvre un sélecteur de couleur au clic.", activate: activateColors },
  { id: "css-peek", name: "CSS Peek", by: "Pranay Prakash (recréée)", color: "#1565c0", letter: "{ }",
    desc: "Depuis class=\"…\" ou id=\"…\" dans le HTML : F12 (ou Ctrl+clic) pour aller à la règle CSS, Alt+F12 pour la voir sur place.", activate: activateCssPeek },
  { id: "image-preview", name: "Image Preview", by: "Kiss Tamás (recréée)", color: "#6a1b9a", letter: "▣",
    desc: "Survole un src=\"logo.png\" ou url(…) pour voir l'image.", activate: activateImagePreview },
  { id: "snippets", name: "Snippets perso", by: "TabCode", color: "#00796b", letter: "✂",
    desc: "Crée tes propres raccourcis de code (comme les User Snippets de VS Code).", activate: activateSnippets,
    extra: () => [{ label: "Modifier mes snippets", run: editSnippets }] },
  { id: "themes", name: "Pack de thèmes", by: "TabCode", color: "#282c34", fg: "#61afef", letter: "◐", builtin: true,
    desc: "One Dark Pro, Dracula, Monokai, GitHub Dark/Light, Dark+ et Light+.", extra: () => [{ label: "Choisir un thème", run: () => app.themePicker() }] },
  { id: "live-server", name: "Live Server", by: "TabCode", color: "#41205f", letter: "((•))", builtin: true,
    desc: "Ouvre ton site dans une fenêtre séparée qui se recharge toute seule quand tu modifies le code.", extra: () => [{ label: "Ouvrir", run: () => $("#liveBtn").click() }] },
  { id: "emmet", name: "Emmet", by: "Emmet", color: "#4c8c2b", letter: "E", builtin: true,
    desc: "Abréviations HTML/CSS : ! , link:css, div.carte, ul>li*3… puis Tab. Toujours actif, comme dans VS Code." },
];

export const isOn = id => { const e = EXTS.find(x => x.id === id); return e && (e.builtin || app.settings.ext[id] !== false); };

export function init(a) {
  app = a; monaco = a.monaco;
  for (const e of EXTS) if (!e.builtin && isOn(e.id)) enable(e, false);
  if (!isOn("material-icons")) setMaterial(false);
  $("#extFilter").addEventListener("input", renderList);
  $("#extList").addEventListener("click", onListClick);
  renderList(); updateStatus();
}
function enable(e, render = true) {
  try { active[e.id] = e.activate() || []; } catch (err) { console.error(e.id, err); active[e.id] = []; }
  if (render) renderList();
}
function disable(e) { (active[e.id] || []).forEach(d => { try { d.dispose(); } catch (er) {} }); delete active[e.id]; renderList(); }
function toggle(id) {
  const e = EXTS.find(x => x.id === id); if (!e || e.builtin) return;
  const on = !isOn(id); app.settings.ext[id] = on; app.saveSettings();
  on ? enable(e) : disable(e);
  updateStatus();
  app.toast(on ? t("{n} activée.", { n: e.name }) : t("{n} désactivée.", { n: e.name }));
}
function updateStatus() { const s = $("#sbPrettier"); if (s) s.hidden = !isOn("prettier"); }
function renderList() {
  const q = ($("#extFilter").value || "").toLowerCase();
  $("#extList").innerHTML = EXTS.filter(e => !q || (e.name + " " + t(e.desc)).toLowerCase().includes(q)).map(e => {
    const on = isOn(e.id);
    const extra = e.extra ? e.extra() : [];
    return `<div class="ext${on ? "" : " ext-off"}">
      <div class="ext-ico" style="background:${e.color};${e.fg ? `color:${e.fg}` : ""}">${esc(e.letter)}</div>
      <div class="ext-body">
        <div class="ext-name">${esc(e.name)}${e.builtin ? ` <span class="tag">${esc(t("intégrée"))}</span>` : ""}</div>
        <div class="ext-desc">${esc(t(e.desc))}</div>
        <div class="ext-actions">
          ${e.builtin ? "" : `<button class="btn${on ? "" : " primary"}" data-toggle="${e.id}">${esc(on ? t("Désactiver") : t("Activer"))}</button>`}
          ${on || e.builtin ? extra.map((x, i) => `<button class="btn" data-extra="${e.id}" data-i="${i}">${esc(t(x.label))}</button>`).join("") : ""}
        </div>
      </div></div>`;
  }).join("");
}
function onListClick(ev) {
  const tg = ev.target.closest("[data-toggle]"); if (tg) return toggle(tg.dataset.toggle);
  const x = ev.target.closest("[data-extra]"); if (x) { const e = EXTS.find(y => y.id === x.dataset.extra); e.extra()[+x.dataset.i].run(); }
}
export function commands() {
  return [
    { t: "Prettier : " + t("Formater le document"), run: () => { app.editor.focus(); app.editor.getAction("editor.action.formatDocument").run(); } },
    { t: t("Modifier mes snippets"), run: editSnippets },
    ...EXTS.filter(e => !e.builtin).map(e => ({ t: t("Extension : activer/désactiver {n}", { n: e.name }), run: () => toggle(e.id) })),
  ];
}
const currentPath = model => model.__path || app.pathFromUri(model.uri);

/* ---------------- Prettier ---------------- */
let prettierP = null;
function loadPrettier() {
  if (!prettierP) prettierP = Promise.all(["standalone", "html", "postcss", "babel", "estree", "markdown"].map(n => import(`../vendor/prettier/${n}.mjs`)))
    .then(([core, ...plugins]) => ({ format: core.format || core.default.format, plugins: plugins.map(m => m.default || m) }))
    .catch(e => { prettierP = null; throw e; });
  return prettierP;
}
const PARSERS = { html: "html", css: "css", scss: "scss", less: "less", javascript: "babel", typescript: "babel-ts", json: "json", markdown: "markdown" };
function activatePrettier() {
  const disp = [];
  for (const [lang, parser] of Object.entries(PARSERS)) {
    disp.push(monaco.languages.registerDocumentFormattingEditProvider(lang, {
      displayName: "Prettier",
      async provideDocumentFormattingEdits(model, options) {
        try {
          const { format, plugins } = await loadPrettier();
          const text = await format(model.getValue(), { parser, plugins, tabWidth: options.tabSize, useTabs: !options.insertSpaces, printWidth: 100, htmlWhitespaceSensitivity: "ignore" });
          if (text === model.getValue()) return [];
          return [{ range: model.getFullModelRange(), text }];
        } catch (e) {
          const msg = String(e && e.message || e).split("\n")[0];
          app.toast("Prettier : " + msg, { error: true });
          return [];
        }
      }
    }));
  }
  // Turn off Monaco's own formatters so Shift+Alt+F always uses Prettier (restored when Prettier is disabled)
  const L = monaco.languages;
  const defaults = [L.html && L.html.htmlDefaults, L.css && L.css.cssDefaults, L.css && L.css.scssDefaults, L.css && L.css.lessDefaults,
    L.json && L.json.jsonDefaults, L.typescript && L.typescript.javascriptDefaults, L.typescript && L.typescript.typescriptDefaults].filter(d => d && d.setModeConfiguration);
  for (const d of defaults) {
    const before = { ...d.modeConfiguration };
    d.setModeConfiguration({ ...before, documentFormattingEdits: false, documentRangeFormattingEdits: false });
    disp.push({ dispose: () => d.setModeConfiguration(before) });
  }
  loadPrettier().catch(() => {}); // warm up
  return disp;
}

/* ---------------- Error Lens ---------------- */
function activateErrorLens() {
  let coll = app.editor.createDecorationsCollection();
  const S = monaco.MarkerSeverity;
  const render = () => {
    const model = app.editor.getModel(); if (!model) { coll.clear(); return; }
    const byLine = new Map();
    for (const m of monaco.editor.getModelMarkers({ resource: model.uri })) {
      if (m.severity < S.Info) continue;
      const cur = byLine.get(m.startLineNumber);
      if (!cur || m.severity > cur.severity) byLine.set(m.startLineNumber, m);
    }
    const decos = [];
    for (const [line, m] of byLine) {
      const kind = m.severity === S.Error ? "error" : m.severity === S.Warning ? "warning" : "info";
      const col = model.getLineMaxColumn(line);
      decos.push({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: kind !== "info" ? "el-line-" + kind : undefined } });
      decos.push({ range: new monaco.Range(line, col, line, col), options: { showIfCollapsed: true, after: { content: "    " + m.message.split("\n")[0], inlineClassName: "el-msg-" + kind } } });
    }
    coll.set(decos);
  };
  const d1 = monaco.editor.onDidChangeMarkers(debounce(render, 150));
  const d2 = app.editor.onDidChangeModel(() => setTimeout(render, 50));
  render();
  return [d1, d2, { dispose: () => coll.clear() }];
}

/* ---------------- indent-rainbow ---------------- */
function activateIndentRainbow() {
  const coll = app.editor.createDecorationsCollection();
  const render = () => {
    const model = app.editor.getModel(); if (!model) { coll.clear(); return; }
    const ts = model.getOptions().tabSize; const decos = [];
    const n = Math.min(model.getLineCount(), 6000);
    for (let ln = 1; ln <= n; ln++) {
      const txt = model.getLineContent(ln);
      let col = 0, width = 0;
      while (col < txt.length && (txt[col] === " " || txt[col] === "\t")) { width += txt[col] === "\t" ? ts : 1; col++; }
      if (col === txt.length) continue; // blank line
      if (txt.includes("\t", 0) && txt.slice(0, col).includes("\t")) {
        for (let i = 0; i < col; i++) decos.push({ range: new monaco.Range(ln, i + 1, ln, i + 2), options: { inlineClassName: "ir-" + (i % 4) } });
      } else {
        for (let lvl = 0; (lvl + 1) * ts <= col; lvl++) decos.push({ range: new monaco.Range(ln, lvl * ts + 1, ln, (lvl + 1) * ts + 1), options: { inlineClassName: "ir-" + (lvl % 4) } });
      }
    }
    coll.set(decos);
  };
  const deb = debounce(render, 120);
  const d1 = app.editor.onDidChangeModelContent(deb);
  const d2 = app.editor.onDidChangeModel(() => setTimeout(render, 30));
  render();
  return [d1, d2, { dispose: () => coll.clear() }];
}

/* ---------------- Path Intellisense ---------------- */
function activatePathIntellisense() {
  const langs = ["html", "css", "scss", "less", "javascript", "typescript", "markdown"];
  const RX = [/(?:src|href|action|poster|data-src|srcset)\s*=\s*["']([^"']*)$/i, /url\(\s*["']?([^"')]*)$/i, /(?:import\s[^"']*from\s*|import\s*\(?\s*|require\(\s*|fetch\(\s*|new URL\(\s*)["'`]([^"'`]*)$/, /@import\s+["']([^"']*)$/, /\]\(([^)\s]*)$/];
  const provider = {
    triggerCharacters: ["/", "\"", "'", "(", "."],
    provideCompletionItems(model, pos) {
      const before = model.getValueInRange({ startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: pos.column });
      let typed = null; for (const rx of RX) { const m = before.match(rx); if (m) { typed = m[1]; break; } }
      if (typed === null || /^([a-z]+:|\/\/|#)/i.test(typed)) return { suggestions: [] };
      const from = currentPath(model) || "";
      const slash = typed.lastIndexOf("/");
      const dirTyped = slash >= 0 ? typed.slice(0, slash + 1) : "";
      const target = app.resolveRef(from, (dirTyped || "./") + "x"); // resolve the folder
      const folder = target === null ? null : dir(target);
      if (folder === null) return { suggestions: [] };
      const p = app.P(); const seenDirs = new Set(); const items = [];
      const range = new monaco.Range(pos.lineNumber, pos.column - (typed.length - dirTyped.length), pos.lineNumber, pos.column);
      const prefix = folder ? folder + "/" : "";
      const all = [...Object.keys(p.files), ...(p.folders || []).map(f => f + "/")];
      for (const f of all) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length); if (!rest) continue;
        const i = rest.indexOf("/");
        if (i >= 0) { const d = rest.slice(0, i); if (seenDirs.has(d)) continue; seenDirs.add(d);
          items.push({ label: d + "/", kind: monaco.languages.CompletionItemKind.Folder, insertText: d + "/", range, sortText: "0" + d, command: { id: "editor.action.triggerSuggest", title: "" } });
        } else if (f !== from) items.push({ label: rest, kind: monaco.languages.CompletionItemKind.File, insertText: rest, range, sortText: "1" + rest, detail: f });
      }
      if (!dirTyped && from && dir(from)) items.push({ label: "../", kind: monaco.languages.CompletionItemKind.Folder, insertText: "../", range, sortText: "2", command: { id: "editor.action.triggerSuggest", title: "" } });
      return { suggestions: items };
    }
  };
  return langs.map(l => monaco.languages.registerCompletionItemProvider(l, provider));
}

/* ---------------- Color Highlight ---------------- */
function parseColor(s) {
  let m;
  if ((m = s.match(/^#([0-9a-f]{3,8})$/i))) {
    let h = m[1]; if (![3, 4, 6, 8].includes(h.length)) return null;
    if (h.length <= 4) h = h.split("").map(c => c + c).join("");
    const n = i => parseInt(h.slice(i, i + 2), 16) / 255;
    return { red: n(0), green: n(2), blue: n(4), alpha: h.length === 8 ? n(6) : 1 };
  }
  if ((m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i))) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4];
    return { red: m[1] / 255, green: m[2] / 255, blue: m[3] / 255, alpha: a };
  }
  if ((m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/i))) {
    const h = m[1] / 360, sat = m[2] / 100, l = m[3] / 100; const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4];
    const f = n => { const k = (n + h * 12) % 12; const q = sat * Math.min(l, 1 - l); return l - q * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return { red: f(0), green: f(8), blue: f(4), alpha: a };
  }
  return null;
}
const hex2 = v => Math.round(v * 255).toString(16).padStart(2, "0");
function activateColors() {
  app.editor.updateOptions({ colorDecorators: true });
  const RX = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)\n]*\)|hsla?\([^)\n]*\)/g;
  const provider = {
    provideDocumentColors(model) {
      const out = []; const n = Math.min(model.getLineCount(), 5000);
      for (let ln = 1; ln <= n; ln++) {
        const txt = model.getLineContent(ln); let m; RX.lastIndex = 0;
        while ((m = RX.exec(txt))) {
          if (m[0][0] === "#" && /[\w&]/.test(txt[m.index - 1] || "")) continue; // skip ids/entities like a#b or &#123
          const c = parseColor(m[0]); if (c) out.push({ color: c, range: new monaco.Range(ln, m.index + 1, ln, m.index + 1 + m[0].length) });
        }
      }
      return out;
    },
    provideColorPresentations(model, info) {
      const c = info.color; const orig = model.getValueInRange(info.range);
      const r = Math.round(c.red * 255), g = Math.round(c.green * 255), b = Math.round(c.blue * 255), a = Math.round(c.alpha * 100) / 100;
      const hex = "#" + hex2(c.red) + hex2(c.green) + hex2(c.blue) + (c.alpha < 1 ? hex2(c.alpha) : "");
      const rgb = a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
      const list = orig.startsWith("#") ? [hex, rgb] : [rgb, hex];
      return list.map(label => ({ label }));
    }
  };
  // CSS/SCSS/Less already have colour swatches in Monaco: add them to the other languages
  const disp = ["html", "javascript", "typescript", "markdown", "plaintext", "json"].map(l => monaco.languages.registerColorProvider(l, provider));
  disp.push({ dispose: () => app.editor.updateOptions({ colorDecorators: false }) });
  return disp;
}

/* ---------------- CSS Peek ---------------- */
function activateCssPeek() {
  const STYLE_EXT = ["css", "scss", "less"];
  const wordAt = (model, pos) => {
    const line = model.getLineContent(pos.lineNumber); const col = pos.column - 1;
    const rx = /\b(class|className|id)\s*=\s*(["'])([^"']*)\2/g; let m;
    while ((m = rx.exec(line))) {
      const start = m.index + m[0].indexOf(m[2]) + 1, end = start + m[3].length;
      if (col < start || col > end) continue;
      let s = col, e = col; while (s > start && !/\s/.test(line[s - 1])) s--; while (e < end && !/\s/.test(line[e])) e++;
      const word = line.slice(s, e); if (!word) return null;
      return { kind: m[1] === "id" ? "#" : ".", word, range: new monaco.Range(pos.lineNumber, s + 1, pos.lineNumber, e + 1) };
    }
    return null;
  };
  const find = target => {
    const p = app.P(); const locs = [];
    const rx = new RegExp(target.kind.replace(".", "\\.") + target.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])", "g");
    app.ensureModels(f => STYLE_EXT.includes(ext(f)) || ["html", "htm"].includes(ext(f)));
    for (const f of Object.keys(p.files)) {
      if (p.files[f].k !== "text") continue;
      const isStyle = STYLE_EXT.includes(ext(f)), isH = ["html", "htm"].includes(ext(f)); if (!isStyle && !isH) continue;
      const model = app.getModel(f); const n = model.getLineCount();
      let inStyle = isStyle;
      for (let ln = 1; ln <= n; ln++) {
        const txt = model.getLineContent(ln);
        if (isH) { if (/<style\b/i.test(txt)) inStyle = true; }
        if (inStyle) { let m; rx.lastIndex = 0; while ((m = rx.exec(txt))) { const after = txt.slice(m.index); if (/^[^{;]*[{,]?/.test(after) && !/:\s*[^{]*;\s*$/.test(txt)) locs.push({ uri: model.uri, range: new monaco.Range(ln, m.index + 1, ln, m.index + 1 + m[0].length) }); } }
        if (isH && /<\/style>/i.test(txt)) inStyle = false;
      }
    }
    return locs;
  };
  return [
    monaco.languages.registerDefinitionProvider("html", { provideDefinition(model, pos) { const w = wordAt(model, pos); return w ? find(w) : null; } }),
    monaco.languages.registerHoverProvider("html", { provideHover(model, pos) {
      const w = wordAt(model, pos); if (!w) return null; const locs = find(w); if (!locs.length) return null;
      const l = locs[0]; const m = monaco.editor.getModel(l.uri); const start = l.range.startLineNumber;
      const lines = []; for (let i = start; i <= Math.min(m.getLineCount(), start + 12); i++) { lines.push(m.getLineContent(i)); if (m.getLineContent(i).includes("}")) break; }
      return { range: w.range, contents: [{ value: "```" + (ext(m.__path || "") || "css") + "\n" + lines.join("\n") + "\n```" }, { value: `*${esc(m.__path || "")}* — ${t("F12 pour y aller")}${locs.length > 1 ? ` · ${t("{n} règles", { n: locs.length })}` : ""}` }] };
    } }),
  ];
}

/* ---------------- Image Preview ---------------- */
function activateImagePreview() {
  const provider = { provideHover(model, pos) {
    const line = model.getLineContent(pos.lineNumber); const col = pos.column - 1;
    const rx = /(["'(])([^"'()\s]+\.(?:png|jpe?g|gif|webp|svg|ico|avif|bmp))(?:[?#][^"')\s]*)?["')]/gi; let m;
    while ((m = rx.exec(line))) {
      const start = m.index + 1, end = start + m[2].length; if (col < start || col > end) continue;
      const from = currentPath(model) || ""; const path = app.resolveRef(from, m[2]); const f = path && app.P().files[path];
      let src = null;
      if (f) src = f.k === "text" ? "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(f.c))) : f.c;
      else if (/^https?:\/\//.test(m[2])) src = m[2];
      if (!src) return { range: new monaco.Range(pos.lineNumber, start + 1, pos.lineNumber, end + 1), contents: [{ value: "⚠️ " + t("Image introuvable dans le projet : {p}", { p: path || m[2] }) }] };
      return { range: new monaco.Range(pos.lineNumber, start + 1, pos.lineNumber, end + 1), contents: [{ value: `<img src="${src}" width="220" />`, supportHtml: true, isTrusted: true }, { value: "`" + (path || m[2]) + "`" }] };
    }
    return null;
  } };
  return ["html", "css", "scss", "less", "javascript", "markdown"].map(l => monaco.languages.registerHoverProvider(l, provider));
}

/* ---------------- Snippets ---------------- */
let snippetCache = null;
const stripJsonComments = s => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || "").replace(/,(\s*[}\]])/g, "$1");
async function loadSnippets() {
  const txt = (await TCDB.get("kv", "snippets")) || DEFAULT_SNIPPETS;
  try { snippetCache = JSON.parse(stripJsonComments(txt)); } catch (e) { snippetCache = {}; }
  return txt;
}
function activateSnippets() {
  loadSnippets();
  const langs = ["html", "css", "scss", "less", "javascript", "typescript", "json", "markdown", "python", "php", "plaintext", "xml"];
  return langs.map(lang => monaco.languages.registerCompletionItemProvider(lang, {
    provideCompletionItems(model, pos) {
      if (!snippetCache) return { suggestions: [] };
      const word = model.getWordUntilPosition(pos);
      const range = new monaco.Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);
      const out = [];
      for (const [name, s] of Object.entries(snippetCache)) {
        if (!s || !s.prefix || !s.body) continue;
        if (s.scope && !s.scope.split(",").map(x => x.trim()).includes(lang)) continue;
        for (const prefix of [].concat(s.prefix)) out.push({
          label: { label: prefix, description: name }, kind: monaco.languages.CompletionItemKind.Snippet, documentation: s.description || name,
          insertText: [].concat(s.body).join("\n"), insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: "!" + prefix
        });
      }
      return { suggestions: out };
    }
  }));
}
async function editSnippets() {
  const txt = await loadSnippets();
  let ed = null;
  app.openDialog(`<h3>${esc(t("Mes snippets"))}</h3><p style="color:var(--muted);font-size:12px;margin:0">${esc(t("Format VS Code. prefix = ce que tu tapes ; body = ce qui est inséré ; $1, $2 = positions du curseur ; scope = langages."))}</p><div id="diffHost"></div><div class="row"><button class="btn" id="snCancel">${esc(t("Annuler"))}</button><button class="btn primary" id="snSave">${esc(t("Enregistrer"))}</button></div>`, d => {
    ed = monaco.editor.create(d.querySelector("#diffHost"), { value: txt, language: "json", automaticLayout: true, minimap: { enabled: false }, fontSize: app.settings.fontSize, tabSize: 2, scrollBeyondLastLine: false });
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: true, trailingCommas: "ignore" });
    d.querySelector("#snCancel").onclick = () => app.closeDialog(null);
    d.querySelector("#snSave").onclick = async () => {
      const val = ed.getValue();
      try { JSON.parse(stripJsonComments(val)); } catch (e) { app.toast(t("Le JSON contient une erreur : {e}", { e: e.message }), { error: true }); return; }
      await TCDB.put("kv", val, "snippets"); await loadSnippets(); app.closeDialog(null); app.toast(t("Snippets enregistrés."));
    };
    setTimeout(() => ed.focus(), 50);
    return () => { ed.getModel() && ed.getModel().dispose(); ed.dispose(); };
  }, { wide: true, closeOnOverlay: false });
}
