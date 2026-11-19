/* TabCode — main module: projects, editor, explorer, tabs, preview, console, layout, commands */
import { $, $$, esc, uid, debounce, ext, base, dir, isHtml, langOf, LANG_NAMES, validName, slug, IMG_EXT, BIN_EXT, MIME, readAs, bytesToB64, timeAgo } from "./util.js";
import { t, setLang, getLang, applyDom } from "./i18n.js";
import { toast, openDialog, closeDialog, askText, confirmBox, infoBox, showMenu, hideMenu, menuOpen, dialogOpen } from "./ui.js";
import { THEMES, defineThemes, applyTheme } from "./themes.js";
import { fileIcon, folderIcon } from "./icons.js";
import * as Ext from "./extensions.js";
import * as GH from "./github.js";
import { initKeybar, updateKeybar } from "./keybar.js";

const APP_VERSION = "1.0.0";
const TRASH_DAYS = 30;

/* ======================= State ======================= */
const DEFAULT_SETTINGS = {
  lang: (navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en",
  theme: "dark-plus", fontSize: 15, tabSize: 2, wordWrap: "on", minimap: true, lineNumbers: "on",
  autoPreview: true, layout: "auto", showPreview: true, split: 0.55, sidebar: true, view: "explorer", device: "0",
  keybar: "auto", current: null, ext: {}, formatOnSave: false
};
const app = {
  version: APP_VERSION, monaco: null, editor: null,
  projects: {}, settings: { ...DEFAULT_SETTINGS },
  P: () => app.projects[app.settings.current],
  t, toast, openDialog, closeDialog, askText, confirmBox, infoBox, showMenu,
  listeners: {}, on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
  emit(ev, ...a) { (this.listeners[ev] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }); },
};
window.TabCode = app; // handy for debugging from the console
const P = app.P;

const saveTimers = {};
function saveProject(p, delay = 400) {
  clearTimeout(saveTimers[p.id]);
  return new Promise(res => { saveTimers[p.id] = setTimeout(() => { delete saveTimers[p.id]; TCDB.put("projects", strip(p)).then(res, e => { storageError(e); res(); }); }, delay); });
}
function strip(p) { const c = { ...p }; delete c._models; return c; }
app.saveNow = p => { p = p || P(); clearTimeout(saveTimers[p.id]); delete saveTimers[p.id]; return TCDB.put("projects", strip(p)).catch(storageError); };
let storageWarned = false;
function storageError(e) { console.error(e); if (!storageWarned) { storageWarned = true; toast(t("Impossible d'enregistrer sur cet appareil (stockage plein ?). Exporte ton projet en .zip."), { error: true }); } }
const saveSettings = debounce(() => TCDB.put("kv", app.settings, "settings").catch(console.error), 300);
app.saveSettings = saveSettings;
function touch(p, why) { p = p || P(); p.updated = Date.now(); saveProject(p); app.emit("projectChanged", p, why); }
app.touch = touch;
async function flushAll() { await Promise.all(Object.keys(saveTimers).map(id => app.projects[id] && app.saveNow(app.projects[id]))); }
app.flushAll = flushAll;

function starterFiles(name) {
  const fr = getLang() === "fr";
  return {
    "index.html": { k: "text", c:
`<!DOCTYPE html>
<html lang="${fr ? "fr" : "en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="carte">
    <h1>${fr ? "Bonjour" : "Hello"} 👋</h1>
    <p>${fr ? "Modifie <code>index.html</code>, <code>style.css</code> ou <code>script.js</code> : l'aperçu se met à jour tout seul." : "Edit <code>index.html</code>, <code>style.css</code> or <code>script.js</code>: the preview updates by itself."}</p>
    <button id="bouton">${fr ? "Clique-moi" : "Click me"}</button>
  </main>

  <script src="script.js"></script>
</body>
</html>
` },
    "style.css": { k: "text", c:
`* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: #222;
}

.carte {
  background: white;
  padding: 2rem 2.5rem;
  border-radius: 16px;
  max-width: 420px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
}

button {
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 8px;
  background: #2a5298;
  color: white;
  font-size: 1rem;
  cursor: pointer;
}
` },
    "script.js": { k: "text", c:
`const bouton = document.querySelector("#bouton");
let clics = 0;

bouton.addEventListener("click", () => {
  clics++;
  bouton.textContent = \`${fr ? "Cliqué" : "Clicked"} \${clics} ${fr ? "fois" : "times"}\`;
  console.log("${fr ? "Nombre de clics" : "Clicks"} :", clics);
});
` }
  };
}
function newProject(name, files) {
  const f = files || starterFiles(name);
  const first = f["index.html"] ? "index.html" : Object.keys(f)[0] || null;
  return { id: uid(), name, files: f, folders: [], open: first ? [first] : [], active: first, updated: Date.now(), created: Date.now(), gh: null };
}
app.newProject = newProject;
app.addProject = async (p, open = true) => { app.projects[p.id] = p; await app.saveNow(p); if (open) switchProject(p.id); return p; };

/* ======================= Monaco ======================= */
const models = new Map();      // path -> model (current project only)
const viewStates = new Map();
let suppressChange = false;

function startMonaco() {
  if (typeof require === "undefined" || !require.config) return loadFail();
  const vs = new URL("vendor/monaco/vs", location.href).href; // absolute, so the web workers find it too
  window.MonacoEnvironment = { getWorkerUrl: () => vs + "/base/worker/workerMain.js" };
  require.config({ paths: { vs } });
  const go = () => require(["vs/editor/editor.main"], () => { app.monaco = window.monaco; initEditor(); }, loadFail);
  if (getLang() === "fr") { globalThis._VSCODE_NLS_LANGUAGE = "fr"; require(["vs/nls.messages.fr"], go, go); } else go();
}
function loadFail(err) {
  console.error(err);
  $("#loading").innerHTML = `<div style="padding:20px;max-width:360px">${esc(t("Impossible de charger l'éditeur. Recharge la page ; si le problème continue, vérifie ta connexion la toute première fois."))}</div>`;
}

function initEditor() {
  const monaco = app.monaco;
  defineThemes(monaco);
  try { if (window.emmetMonaco) { emmetMonaco.emmetHTML(monaco, ["html", "php", "xml"]); emmetMonaco.emmetCSS(monaco, ["css", "scss", "less"]); } } catch (e) { console.warn("Emmet", e); }
  const js = monaco.languages.typescript.javascriptDefaults;
  js.setCompilerOptions({ target: monaco.languages.typescript.ScriptTarget.ES2020, allowNonTsExtensions: true, allowJs: true, checkJs: false, jsx: monaco.languages.typescript.JsxEmit.React, lib: ["es2020", "dom", "dom.iterable"] });
  js.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  const S = app.settings;
  const editor = app.editor = monaco.editor.create($("#editor"), {
    theme: "tc-" + (THEMES[S.theme] ? S.theme : "dark-plus"), automaticLayout: true,
    fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace", fontSize: S.fontSize, tabSize: S.tabSize, insertSpaces: true, detectIndentation: false,
    wordWrap: S.wordWrap, minimap: { enabled: S.minimap && innerWidth > 900 }, lineNumbers: S.lineNumbers,
    bracketPairColorization: { enabled: true }, guides: { bracketPairs: "active", indentation: true },
    autoClosingBrackets: "always", autoClosingQuotes: "always", autoClosingTags: true,
    formatOnPaste: true, smoothScrolling: true, cursorSmoothCaretAnimation: "on", cursorBlinking: "smooth",
    stickyScroll: { enabled: true }, mouseWheelZoom: true, scrollBeyondLastLine: false, renderWhitespace: "selection",
    suggest: { showStatusBar: true, preview: true }, quickSuggestions: { other: true, comments: false, strings: true },
    tabCompletion: "on", padding: { top: 6 }, fixedOverflowWidgets: true, unicodeHighlight: { ambiguousCharacters: false },
    dragAndDrop: true, accessibilitySupport: "off", definitionLinkOpensInPeek: false, hover: { delay: 350 },
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => monaco.editor.remeasureFonts());
  applyTheme(S.theme, monaco);

  editor.onDidChangeCursorPosition(e => { $("#sbPos").textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`; });
  editor.onDidChangeModelContent(onEditorChange);
  monaco.editor.onDidChangeMarkers(updateProblems);

  // Let "Go to definition" (CSS Peek) open other files of the project
  if (monaco.editor.registerEditorOpener) monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, sel) {
      const path = pathFromUri(resource); if (!path || !P().files[path]) return false;
      openFile(path);
      if (sel) { const r = sel.startLineNumber ? sel : { startLineNumber: sel.lineNumber, startColumn: sel.column, endLineNumber: sel.lineNumber, endColumn: sel.column };
        editor.setSelection(r); editor.revealRangeInCenter(r); }
      return true;
    }
  });

  const K = monaco.KeyMod, C = monaco.KeyCode;
  const cmd = (keys, fn) => editor.addCommand(keys, fn);
  cmd(K.CtrlCmd | C.KeyS, () => saveCommand());
  cmd(K.CtrlCmd | C.KeyP, () => openPalette(""));
  cmd(K.CtrlCmd | K.Shift | C.KeyP, () => openPalette(">"));
  cmd(K.CtrlCmd | C.Enter, () => refreshPreview(true));
  cmd(K.CtrlCmd | C.KeyB, () => toggleSidebar());
  cmd(K.CtrlCmd | C.KeyJ, () => toggleConsole());
  cmd(K.CtrlCmd | K.Shift | C.KeyV, () => togglePreview());
  cmd(K.CtrlCmd | K.Shift | C.KeyF, () => showView("search", true));
  cmd(K.CtrlCmd | K.Shift | C.KeyE, () => showView("explorer"));
  cmd(K.CtrlCmd | K.Shift | C.KeyX, () => showView("extensions"));
  cmd(K.CtrlCmd | K.Shift | C.KeyG, () => showView("github"));
  cmd(K.Alt | C.KeyN, () => createFile());
  cmd(K.Alt | C.KeyW, () => closeTab(P().active));
  cmd(K.CtrlCmd | C.Comma, () => openSettings());
  cmd(K.CtrlCmd | C.Equal, () => setFont(app.settings.fontSize + 1));
  cmd(K.CtrlCmd | C.Minus, () => setFont(app.settings.fontSize - 1));
  cmd(K.Alt | C.PageDown, () => cycleTab(1));
  cmd(K.Alt | C.PageUp, () => cycleTab(-1));
  cmd(K.CtrlCmd | C.Tab, () => cycleTab(1));
  cmd(K.Alt | C.KeyZ, () => toggleWrap());
  // Android/ChromeOS report "Linux": use the Windows shortcuts people know from VS Code
  const run = id => () => { const a = editor.getAction(id); a ? a.run() : editor.trigger("kb", id); };
  cmd(K.Shift | K.Alt | C.KeyF, run("editor.action.formatDocument"));
  cmd(K.Shift | K.Alt | C.DownArrow, run("editor.action.copyLinesDownAction"));
  cmd(K.Shift | K.Alt | C.UpArrow, run("editor.action.copyLinesUpAction"));
  cmd(K.CtrlCmd | K.Alt | C.DownArrow, run("editor.action.insertCursorBelow"));
  cmd(K.CtrlCmd | K.Alt | C.UpArrow, run("editor.action.insertCursorAbove"));
  cmd(C.F2, () => ["javascript", "typescript"].includes(langOf(P().active || "")) ? editor.trigger("kb", "editor.action.rename") : renameFile(P().active));

  $("#loading").remove();
  Ext.init(app);
  GH.init(app);
  initKeybar(app);
  loadProject();
  app.emit("ready");
}

const pathFromUri = uri => { const pre = "/" + app.settings.current + "/"; return uri.path.startsWith(pre) ? decodeURIComponent(uri.path.slice(pre.length)) : null; };
app.pathFromUri = pathFromUri;
const uriFor = path => app.monaco.Uri.from({ scheme: "file", path: "/" + app.settings.current + "/" + path });
function getModel(path) {
  let m = models.get(path);
  if (m && !m.isDisposed()) return m;
  const f = P().files[path];
  m = app.monaco.editor.getModel(uriFor(path));
  if (m) { if (m.getValue() !== f.c) m.setValue(f.c); }
  else m = app.monaco.editor.createModel(f.c, langOf(path), uriFor(path));
  m.__path = path; m.updateOptions({ tabSize: app.settings.tabSize, insertSpaces: true });
  models.set(path, m);
  return m;
}
app.getModel = getModel;
/* Make sure every text file of the project has a model (needed by CSS Peek / Path Intellisense) */
app.ensureModels = filter => { for (const [p, f] of Object.entries(P().files)) if (f.k === "text" && (!filter || filter(p))) getModel(p); };
function disposeModels() { models.forEach(m => { try { m.dispose(); } catch (e) {} }); models.clear(); viewStates.clear(); }
function dropModel(path) { const m = models.get(path); if (m) { try { m.dispose(); } catch (e) {} models.delete(path); } viewStates.delete(path); }
/* Called when a file's content was changed from outside the editor (sync, replace all, restore) */
app.reloadFile = path => { const m = models.get(path); const f = P().files[path];
  if (!f) { dropModel(path); return; }
  if (m && !m.isDisposed() && f && f.k === "text" && m.getValue() !== f.c) { suppressChange = true; m.pushEditOperations([], [{ range: m.getFullModelRange(), text: f.c }], () => null); suppressChange = false; }
  else if (m && f && f.k !== "text") dropModel(path); };

/* VS Code-like auto closing of HTML tags when typing ">" */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "param"]);
function onEditorChange(e) {
  if (suppressChange) return;
  const model = app.editor.getModel(); if (!model) return;
  const path = model.__path; const p = P();
  if (path && p.files[path]) { p.files[path].c = model.getValue(); touch(p, "edit"); markSearchDirty(); }
  if (app.settings.autoPreview) schedulePreview();
  if (e.isUndoing || e.isRedoing || e.changes.length !== 1) return;
  const ch = e.changes[0];
  if (ch.text !== ">" || model.getLanguageId() !== "html") return;
  setTimeout(() => {
    const pos = app.editor.getPosition(); if (!pos) return;
    const line = model.getLineContent(pos.lineNumber);
    const before = line.slice(0, pos.column - 1);
    const m = before.match(/<([a-zA-Z][\w:.-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?>$/);
    if (!m || before.endsWith("/>") || VOID.has(m[1].toLowerCase())) return;
    if (line.slice(pos.column - 1).startsWith("</" + m[1])) return;
    app.editor.executeEdits("autoclose", [{ range: new app.monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: `</${m[1]}>` }]);
    app.editor.setPosition(pos);
  }, 0);
}
function updateProblems() {
  const monaco = app.monaco; if (!monaco) return;
  const marks = monaco.editor.getModelMarkers({}).filter(m => m.resource.path.startsWith("/" + app.settings.current + "/"));
  $("#sbErrCount").textContent = marks.filter(m => m.severity === monaco.MarkerSeverity.Error).length;
  $("#sbWarnCount").textContent = marks.filter(m => m.severity === monaco.MarkerSeverity.Warning).length;
}

/* ======================= Projects ======================= */
function loadProject() {
  const p = P();
  disposeModels();
  p.open = (p.open || []).filter(f => p.files[f]);
  if (!p.files[p.active]) p.active = p.open[0] || Object.keys(p.files).find(isHtml) || Object.keys(p.files)[0] || null;
  if (p.active && !p.open.includes(p.active)) p.open.push(p.active);
  previewFile = null; collapsed.clear();
  renderProjectName(); renderTree(); renderTabs();
  if (app.editor) openFile(p.active, true);
  clearConsole(); refreshPreview(true); markSearchDirty(); runSearch();
  app.emit("projectLoaded", p);
}
app.loadProject = loadProject;
function renderProjectName() {
  $("#projectName").textContent = P().name; $("#projSectionName").textContent = P().name;
  document.title = P().name + " — TabCode";
}
function switchProject(id) {
  if (!app.projects[id]) return;
  const cur = app.editor && app.editor.getModel(); if (cur && cur.__path) viewStates.set(cur.__path, app.editor.saveViewState());
  app.settings.current = id; saveSettings(); loadProject();
}
app.switchProject = switchProject;
function projectMenu(anchor) {
  const items = [{ label: t("Projets") }];
  Object.values(app.projects).sort((a, b) => b.updated - a.updated).forEach(p => items.push({ text: p.name + (p.gh ? "  ⎇" : ""), checked: p.id === app.settings.current, run: () => switchProject(p.id) }));
  items.push("-",
    { text: t("Nouveau projet…"), run: createProject },
    { text: t("Importer un dépôt GitHub…"), run: () => GH.importRepoDialog() },
    { text: t("Renommer le projet…"), run: renameProject },
    { text: t("Dupliquer le projet"), run: duplicateProject },
    "-",
    { text: t("Supprimer le projet…"), danger: true, run: deleteProject });
  showMenu(items, anchor);
}
async function createProject() {
  const name = await askText(t("Nouveau projet"), t("Nouveau projet"), t("Il contiendra index.html, style.css et script.js pour démarrer."), t("Créer"));
  if (!name) return;
  await app.addProject(newProject(name));
}
async function renameProject() {
  const p = P(); const name = await askText(t("Renommer le projet"), p.name, p.gh ? t("Le dépôt GitHub garde son nom.") : "", t("Renommer"));
  if (!name) return; p.name = name; touch(p); renderProjectName();
}
async function duplicateProject() {
  const p = P(); const c = JSON.parse(JSON.stringify(strip(p)));
  c.id = uid(); c.name = p.name + t(" (copie)"); c.updated = c.created = Date.now(); c.gh = null;
  await app.addProject(c); toast(t("Projet dupliqué."));
}
async function deleteProject() {
  const p = P();
  const ok = await confirmBox(t("Supprimer le projet ?"), t("« {name} » ira dans la corbeille pendant {d} jours.", { name: p.name, d: TRASH_DAYS }) + (p.gh ? " " + t("Le dépôt GitHub n'est pas supprimé.") : ""), t("Supprimer"), true);
  if (!ok) return;
  await flushAll();
  await TCDB.put("trash", { tid: uid(), type: "project", project: strip(p), name: p.name, deletedAt: Date.now() });
  await TCDB.del("projects", p.id); delete app.projects[p.id];
  if (!Object.keys(app.projects).length) { const n = newProject(t("Mon projet")); app.projects[n.id] = n; await app.saveNow(n); }
  app.settings.current = Object.values(app.projects).sort((a, b) => b.updated - a.updated)[0].id; saveSettings();
  loadProject(); renderTrash();
}

/* ======================= Files & tabs ======================= */
function openFile(path, keepFocus) {
  const p = P(); if (!app.editor) return;
  const cur = app.editor.getModel();
  if (cur && cur.__path) viewStates.set(cur.__path, app.editor.saveViewState());
  if (!path || !p.files[path]) {
    p.active = null; app.editor.setModel(null);
    $("#editor").style.visibility = "hidden"; $("#imageView").style.display = "none"; $("#welcome").style.display = "flex";
    renderTabs(); renderTree(); renderCrumbs(); updateLang(); touchUi(); return;
  }
  $("#welcome").style.display = "none";
  if (!p.open.includes(path)) p.open.push(path);
  p.active = path;
  const f = p.files[path];
  if (f.k !== "text") {
    app.editor.setModel(null); $("#editor").style.visibility = "hidden";
    const iv = $("#imageView"); iv.style.display = "grid";
    const img = $("#imageEl");
    if (IMG_EXT.includes(ext(path))) { img.style.display = ""; img.src = f.c; img.onload = () => $("#imageMeta").textContent = `${img.naturalWidth} × ${img.naturalHeight} px · ${Math.round(f.c.length * 0.75 / 1024)} ${t("Ko")}`; }
    else { img.style.display = "none"; $("#imageMeta").textContent = `${base(path)} · ${Math.round(f.c.length * 0.75 / 1024)} ${t("Ko")} · ${t("fichier binaire")}`; }
  } else {
    $("#imageView").style.display = "none"; $("#editor").style.visibility = "visible";
    suppressChange = true; app.editor.setModel(getModel(path)); suppressChange = false;
    const vs = viewStates.get(path); if (vs) app.editor.restoreViewState(vs);
    if (!keepFocus && !isPhone()) app.editor.focus();
  }
  if (isHtml(path) && previewFile !== path) { previewFile = path; refreshPreview(true); }
  renderTabs(); renderTree(); renderCrumbs(); updateLang(); touchUi();
  const tEl = $(".tab.active"); if (tEl) tEl.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (isPhone() && !keepFocus) setPhonePane("code");
  app.emit("activeChanged", path);
}
app.openFile = openFile;
const touchUi = () => saveProject(P(), 1000); // remember open tabs without bumping "updated"
function updateLang() {
  const p = P(); const l = p.active ? langOf(p.active) : null;
  $("#sbLang").textContent = p.active ? (p.files[p.active].k !== "text" ? t("Binaire") : (LANG_NAMES[l] || l)) : "—";
  $("#sbIndent").textContent = t("Espaces : {n}", { n: app.settings.tabSize });
}
function renderCrumbs() {
  const p = P();
  $("#crumbs").innerHTML = p.active ? [p.name, ...p.active.split("/")].map(esc).join(' <span style="opacity:.6">›</span> ') : "";
}
function renderTabs() {
  const p = P();
  $("#tabs").innerHTML = p.open.map(f => `<div class="tab${f === p.active ? " active" : ""}" data-f="${esc(f)}" title="${esc(f)}">${fileIcon(f)}<span>${esc(base(f))}</span><button class="x" data-close="${esc(f)}" aria-label="${esc(t("Fermer"))}"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`).join("");
}
app.renderTabs = () => renderTabs();
$("#tabs").addEventListener("click", e => {
  const c = e.target.closest("[data-close]"); if (c) { e.stopPropagation(); closeTab(c.dataset.close); return; }
  const tb = e.target.closest(".tab"); if (tb) openFile(tb.dataset.f);
});
$("#tabs").addEventListener("auxclick", e => { const tb = e.target.closest(".tab"); if (tb && e.button === 1) closeTab(tb.dataset.f); });
function closeTab(path) {
  const p = P(); if (!path) return;
  const i = p.open.indexOf(path); if (i < 0) return;
  p.open.splice(i, 1); viewStates.delete(path);
  if (p.active === path) openFile(p.open[Math.min(i, p.open.length - 1)] || null, true);
  else { renderTabs(); touchUi(); }
}
function cycleTab(d) { const p = P(); if (p.open.length < 2) return; const i = p.open.indexOf(p.active); openFile(p.open[(i + d + p.open.length) % p.open.length]); }

/* ----- Explorer tree ----- */
const collapsed = new Set();
function buildTree() {
  const p = P(); const root = { dirs: {}, files: [] };
  const ensure = path => { let n = root; if (!path) return n; for (const s of path.split("/")) { n.dirs[s] = n.dirs[s] || { dirs: {}, files: [] }; n = n.dirs[s]; } return n; };
  (p.folders || []).forEach(ensure);
  Object.keys(p.files).forEach(f => ensure(dir(f)).files.push(f));
  return root;
}
function renderTree() {
  const p = P(); const root = buildTree(); let html = "";
  const DOTS = '<svg class="ico" viewBox="0 0 24 24" style="width:15px"><circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/></svg>';
  const walk = (node, depth, prefix) => {
    Object.keys(node.dirs).sort((a, b) => a.localeCompare(b)).forEach(d => {
      const full = prefix ? prefix + "/" + d : d; const open = !collapsed.has(full);
      html += `<div class="tree-row" data-dir="${esc(full)}" style="padding-left:${6 + depth * 14}px" draggable="true"><svg class="ico chev${open ? " open" : ""}" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>${folderIcon(d, open)}<span class="name">${esc(d)}</span><button class="more" data-menu-dir="${esc(full)}" aria-label="Actions">${DOTS}</button></div>`;
      if (open) walk(node.dirs[d], depth + 1, full);
    });
    node.files.sort((a, b) => base(a).localeCompare(base(b))).forEach(f => {
      html += `<div class="tree-row${f === p.active ? " active" : ""}" data-file="${esc(f)}" style="padding-left:${20 + depth * 14}px" draggable="true">${fileIcon(f)}<span class="name">${esc(base(f))}</span><button class="more" data-menu-file="${esc(f)}" aria-label="Actions">${DOTS}</button></div>`;
    });
  };
  walk(root, 0, "");
  if (!Object.keys(p.files).length && !(p.folders || []).length)
    html = `<div class="empty-hint">${esc(t("Ce projet est vide."))}<br><button id="emptyNew">${esc(t("Créer un fichier"))}</button> · <button id="emptyImport">${esc(t("importer des fichiers"))}</button></div>`;
  $("#tree").innerHTML = html;
  const en = $("#emptyNew"); if (en) en.onclick = () => createFile();
  const ei = $("#emptyImport"); if (ei) ei.onclick = () => $("#fileInput").click();
}
app.renderTree = () => renderTree();
let longPressTimer = null, longPressed = false;
$("#tree").addEventListener("click", e => {
  if (longPressed) { longPressed = false; return; }
  const mf = e.target.closest("[data-menu-file]"); if (mf) { e.stopPropagation(); fileMenu(mf.dataset.menuFile, mf); return; }
  const md = e.target.closest("[data-menu-dir]"); if (md) { e.stopPropagation(); dirMenu(md.dataset.menuDir, md); return; }
  const r = e.target.closest(".tree-row"); if (!r) return;
  if (r.dataset.dir !== undefined) { const d = r.dataset.dir; collapsed.has(d) ? collapsed.delete(d) : collapsed.add(d); renderTree(); return; }
  openFile(r.dataset.file);
});
$("#tree").addEventListener("contextmenu", e => {
  const r = e.target.closest(".tree-row"); if (!r) return; e.preventDefault();
  r.dataset.file ? fileMenu(r.dataset.file, { x: e.clientX, y: e.clientY }) : dirMenu(r.dataset.dir, { x: e.clientX, y: e.clientY });
});
$("#tree").addEventListener("touchstart", e => {
  const r = e.target.closest(".tree-row"); if (!r || e.target.closest(".more")) return;
  longPressed = false;
  longPressTimer = setTimeout(() => { longPressed = true; r.dataset.file ? fileMenu(r.dataset.file, r) : dirMenu(r.dataset.dir, r); }, 550);
}, { passive: true });
["touchend", "touchmove", "touchcancel"].forEach(ev => $("#tree").addEventListener(ev, () => clearTimeout(longPressTimer), { passive: true }));
// Drag & drop to move files into folders
let dragSrc = null;
$("#tree").addEventListener("dragstart", e => { const r = e.target.closest(".tree-row"); if (!r) return; dragSrc = r.dataset.file !== undefined ? { file: r.dataset.file } : { dir: r.dataset.dir }; e.dataTransfer.effectAllowed = "move"; });
$("#tree").addEventListener("dragover", e => { if (!dragSrc) return; e.preventDefault(); $$(".tree-row.drop").forEach(x => x.classList.remove("drop")); const r = e.target.closest(".tree-row[data-dir]"); if (r) r.classList.add("drop"); });
$("#tree").addEventListener("drop", e => {
  if (!dragSrc) return; e.preventDefault(); $$(".tree-row.drop").forEach(x => x.classList.remove("drop"));
  const r = e.target.closest(".tree-row[data-dir]"); const target = r ? r.dataset.dir : "";
  if (dragSrc.file) { const to = (target ? target + "/" : "") + base(dragSrc.file); if (to !== dragSrc.file && !P().files[to]) { moveFile(dragSrc.file, to); touch(); renderTree(); renderTabs(); renderCrumbs(); } }
  dragSrc = null;
});
$("#tree").addEventListener("dragend", () => { dragSrc = null; $$(".tree-row.drop").forEach(x => x.classList.remove("drop")); });
// Drop files from the device into the explorer
$("#sidebar").addEventListener("dragover", e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
$("#sidebar").addEventListener("drop", e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } });

function fileMenu(f, anchor) {
  const items = [
    { text: t("Ouvrir"), run: () => openFile(f) },
    { text: t("Renommer…"), key: "F2", run: () => renameFile(f) },
    { text: t("Dupliquer"), run: () => duplicateFile(f) },
    { text: t("Copier le contenu"), run: () => copyText(P().files[f].k === "text" ? P().files[f].c : P().files[f].c) },
    { text: t("Copier le chemin"), run: () => copyText(f) },
  ];
  if (isHtml(f)) items.push({ text: t("Afficher dans l'aperçu"), run: () => { previewFile = f; togglePreview(true); refreshPreview(true); } },
    { text: t("Ouvrir avec Live Server"), run: () => openLive(f) });
  items.push("-", { text: t("Supprimer"), danger: true, run: () => deleteFile(f) });
  showMenu(items, anchor);
}
function dirMenu(d, anchor) {
  showMenu([
    { text: t("Nouveau fichier ici…"), run: () => createFile(d) },
    { text: t("Nouveau dossier ici…"), run: () => createFolder(d) },
    { text: t("Importer ici…"), run: () => { importDir = d; $("#fileInput").click(); } },
    { text: t("Renommer…"), run: () => renameFolder(d) },
    "-",
    { text: t("Supprimer le dossier"), danger: true, run: () => deleteFolder(d) }
  ], anchor);
}
const currentDir = () => { const p = P(); return p.active ? dir(p.active) : ""; };
async function createFile(inDir) {
  const d = inDir !== undefined ? inDir : currentDir();
  const name = await askText(t("Nouveau fichier"), "", (d ? t("Dans le dossier « {d} ».", { d }) + " " : "") + t("Exemple : page.html, style.css, js/app.js"), t("Créer"));
  if (!name) return;
  const path = (d ? d + "/" : "") + name.replace(/^\/+/, "");
  if (!validName(path)) return toast(t("Nom de fichier invalide."), { error: true });
  const p = P();
  if (p.files[path]) return toast(t("Ce fichier existe déjà."), { error: true });
  p.files[path] = { k: "text", c: "" };
  touch(p, "files"); renderTree(); openFile(path);
}
app.createFile = createFile;
async function createFolder(inDir) {
  const d = inDir !== undefined ? inDir : currentDir();
  const name = await askText(t("Nouveau dossier"), "", d ? t("Dans « {d} »", { d }) : t("Exemple : images, css, js"), t("Créer"));
  if (!name) return;
  const path = (d ? d + "/" : "") + name.replace(/^\/+|\/+$/g, "");
  if (!validName(path)) return toast(t("Nom de dossier invalide."), { error: true });
  const p = P(); p.folders = p.folders || [];
  if (!p.folders.includes(path)) p.folders.push(path);
  collapsed.delete(path); touch(p, "files"); renderTree();
}
async function renameFile(f) {
  const p = P(); if (!f || !p.files[f]) return;
  const name = await askText(t("Renommer"), f, t("Tu peux aussi changer de dossier, ex. css/style.css"), t("Renommer"));
  if (!name || name === f) return;
  if (!validName(name)) return toast(t("Nom invalide."), { error: true });
  if (p.files[name]) return toast(t("Un fichier porte déjà ce nom."), { error: true });
  moveFile(f, name); touch(p, "files"); renderTree(); renderTabs(); renderCrumbs(); updateLang();
}
function moveFile(from, to) {
  const p = P();
  p.files[to] = p.files[from]; delete p.files[from];
  const wasActive = p.active === from;
  const vs = viewStates.get(from); dropModel(from); if (vs) viewStates.set(to, vs);
  p.open = p.open.map(x => x === from ? to : x);
  if (previewFile === from) previewFile = to;
  if (wasActive) { p.active = to; if (app.editor && p.files[to].k === "text") { suppressChange = true; app.editor.setModel(getModel(to)); suppressChange = false; if (vs) app.editor.restoreViewState(vs); } }
}
async function renameFolder(d) {
  const p = P();
  const name = await askText(t("Renommer le dossier"), d, "", t("Renommer"));
  if (!name || name === d) return;
  if (!validName(name)) return toast(t("Nom invalide."), { error: true });
  Object.keys(p.files).filter(f => f.startsWith(d + "/")).forEach(f => moveFile(f, name + f.slice(d.length)));
  p.folders = (p.folders || []).map(x => x === d || x.startsWith(d + "/") ? name + x.slice(d.length) : x);
  touch(p, "files"); renderTree(); renderTabs(); renderCrumbs();
}
function duplicateFile(f) {
  const p = P(); const e = ext(f); const stem = e ? f.slice(0, -(e.length + 1)) : f;
  let n = 1, to; do { to = `${stem}-${t("copie")}${n > 1 ? n : ""}${e ? "." + e : ""}`; n++; } while (p.files[to]);
  p.files[to] = JSON.parse(JSON.stringify(p.files[f])); touch(p, "files"); renderTree(); openFile(to);
}
async function trashFile(f, p = P()) {
  await TCDB.put("trash", { tid: uid(), type: "file", projectId: p.id, projectName: p.name, path: f, file: p.files[f], deletedAt: Date.now() });
  delete p.files[f];
  p.open = p.open.filter(x => x !== f);
  if (p.id === app.settings.current) { dropModel(f); if (previewFile === f) previewFile = null; }
}
app.trashFile = trashFile;
/* After files were changed from outside the editor (GitHub sync) */
app.afterExternalChange = paths => {
  const p = P();
  paths.forEach(f => app.reloadFile(f));
  p.open = p.open.filter(f => p.files[f]);
  renderTree(); renderTabs();
  if (!p.files[p.active]) openFile(p.open[0] || Object.keys(p.files).find(isHtml) || null, true);
  touch(p, "sync"); refreshPreview(true); markSearchDirty();
};
async function deleteFile(f) {
  const p = P(); const wasActive = p.active === f;
  await trashFile(f);
  touch(p, "files"); renderTree();
  if (wasActive) openFile(p.open[0] || null, true); else renderTabs();
  refreshPreview(true); renderTrash();
  toast(t("« {f} » est dans la corbeille.", { f: base(f) }), { action: t("Annuler"), onAction: () => restoreLast() });
}
async function deleteFolder(d) {
  const p = P(); const inside = Object.keys(p.files).filter(f => f.startsWith(d + "/"));
  if (inside.length && !(await confirmBox(t("Supprimer le dossier ?"), t("« {d} » et ses {n} fichier(s) iront dans la corbeille.", { d, n: inside.length }), t("Supprimer"), true))) return;
  for (const f of inside) await trashFile(f);
  p.folders = (p.folders || []).filter(x => x !== d && !x.startsWith(d + "/"));
  touch(p, "files"); renderTree();
  if (!p.files[p.active]) openFile(p.open[0] || null, true); else renderTabs();
  refreshPreview(true); renderTrash();
}
function copyText(txt) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast(t("Copié dans le presse-papiers.")), () => toast(t("Copie impossible ici."), { error: true }));
  else toast(t("Copie impossible ici."), { error: true });
}
app.copyText = copyText;

/* ----- Trash ----- */
async function renderTrash() {
  const items = (await TCDB.all("trash").catch(() => [])).sort((a, b) => b.deletedAt - a.deletedAt);
  const list = $("#trashList");
  if (!items.length) { list.innerHTML = `<div class="empty-hint">${esc(t("La corbeille est vide."))}<br>${esc(t("Les fichiers supprimés y restent {d} jours.", { d: TRASH_DAYS }))}</div>`; return; }
  list.innerHTML = items.map(it => `<div class="trash-row">${it.type === "project" ? folderIcon("", false) : fileIcon(it.path)}<div class="name">${esc(it.type === "project" ? it.name : it.path)}<div class="sub">${esc(it.type === "project" ? t("Projet entier") : it.projectName)} · ${esc(timeAgo(it.deletedAt, t))}</div></div><button class="btn" data-restore="${it.tid}">${esc(t("Restaurer"))}</button></div>`).join("");
}
$("#trashList").addEventListener("click", e => { const b = e.target.closest("[data-restore]"); if (b) restore(b.dataset.restore); });
async function restore(tid) {
  const it = await TCDB.get("trash", tid); if (!it) return;
  if (it.type === "project") {
    let p = it.project; if (app.projects[p.id]) p = { ...p, id: uid() };
    app.projects[p.id] = p; await app.saveNow(p); await TCDB.del("trash", tid);
    toast(t("Projet « {n} » restauré.", { n: p.name })); renderTrash(); switchProject(p.id); return;
  }
  const p = app.projects[it.projectId];
  if (!p) { toast(t("Le projet d'origine n'existe plus."), { error: true }); return; }
  let path = it.path; const e = ext(path);
  while (p.files[path]) path = e ? path.slice(0, -(e.length + 1)) + `-${t("restauré")}.${e}` : path + `-${t("restauré")}`;
  p.files[path] = it.file; await TCDB.del("trash", tid);
  if (p.id !== app.settings.current) switchProject(p.id);
  touch(p, "files"); renderTree(); openFile(path); refreshPreview(true); renderTrash();
  toast(t("« {f} » restauré.", { f: base(path) }));
}
async function restoreLast() { const items = (await TCDB.all("trash")).sort((a, b) => b.deletedAt - a.deletedAt); if (items[0]) restore(items[0].tid); }
$("#emptyTrashBtn").onclick = async () => {
  if (!(await confirmBox(t("Vider la corbeille ?"), t("Les éléments seront supprimés définitivement."), t("Vider"), true))) return;
  for (const it of await TCDB.all("trash")) await TCDB.del("trash", it.tid);
  renderTrash();
};
async function purgeTrash() { const limit = Date.now() - TRASH_DAYS * 864e5; for (const it of await TCDB.all("trash").catch(() => [])) if (it.deletedAt < limit) await TCDB.del("trash", it.tid); }

/* ----- Import / export ----- */
let importDir = null;
$("#importBtn").onclick = () => { importDir = null; $("#fileInput").click(); };
$("#newFileBtn").onclick = () => createFile();
$("#newFolderBtn").onclick = () => createFolder();
$("#collapseBtn").onclick = () => { Object.keys(buildTree().dirs).forEach(d => collapsed.add(d)); P().folders.forEach(d => collapsed.add(d)); Object.keys(P().files).forEach(f => { let d = dir(f); while (d) { collapsed.add(d); d = dir(d); } }); renderTree(); };
$("#fileInput").onchange = e => { const files = [...e.target.files]; e.target.value = ""; importFiles(files); };
async function importFiles(files) {
  if (!files.length) return;
  const p = P(); const d = importDir !== null ? importDir : currentDir(); importDir = null; let count = 0;
  for (const file of files) {
    const e2 = ext(file.name);
    if (e2 === "zip") { count += await importZip(file, p); continue; }
    const path = (d ? d + "/" : "") + file.name;
    p.files[path] = BIN_EXT.includes(e2) ? { k: "image", c: await readAs(file, "dataurl") } : { k: "text", c: await readAs(file, "text") };
    app.reloadFile(path); dropModel(path); count++;
  }
  touch(p, "files"); renderTree(); refreshPreview(true);
  toast(t("{n} fichier(s) importé(s).", { n: count }));
}
async function importZip(file, p) {
  const zip = await JSZip.loadAsync(file); let n = 0;
  const entries = Object.values(zip.files).filter(z => !z.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(z.name));
  const tops = new Set(entries.map(z => z.name.split("/")[0]));
  const stripTop = tops.size === 1 && entries.every(z => z.name.includes("/")) ? [...tops][0] + "/" : "";
  for (const z of entries) {
    const path = z.name.slice(stripTop.length); if (!validName(path)) continue;
    const e = ext(path);
    p.files[path] = BIN_EXT.includes(e) ? { k: "image", c: `data:${MIME[e] || "application/octet-stream"};base64,${await z.async("base64")}` } : { k: "text", c: await z.async("string") };
    dropModel(path); n++;
  }
  return n;
}
async function downloadBlob(name, blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportZip() {
  const p = P(); const zip = new JSZip();
  (p.folders || []).forEach(d => zip.folder(d));
  Object.entries(p.files).forEach(([f, v]) => v.k !== "text" ? zip.file(f, v.c.split(",")[1] || "", { base64: true }) : zip.file(f, v.c));
  downloadBlob(slug(p.name) + ".zip", await zip.generateAsync({ type: "blob" }));
}
function exportSingleHtml() {
  const html = buildInlineHtml(false);
  if (html == null) return toast(t("Aucun fichier HTML à exporter."), { error: true });
  downloadBlob(slug(P().name) + ".html", new Blob([html], { type: "text/html" }));
}

/* ======================= Preview & Live Server ======================= */
let previewFile = null, previewTimer = null, swReady = false;
const liveChannel = "BroadcastChannel" in window ? new BroadcastChannel("tabcode-live") : null;
function pickPreviewFile() {
  const p = P();
  if (previewFile && p.files[previewFile]) return previewFile;
  if (p.files["index.html"]) return "index.html";
  return Object.keys(p.files).find(isHtml) || null;
}
const encPath = path => path.split("/").map(encodeURIComponent).join("/");
async function refreshPreview(force) {
  if (!force && !app.settings.autoPreview) return;
  const file = pickPreviewFile(); const p = P();
  $("#previewFileName").textContent = file || t("aucun fichier HTML");
  resetErrors();
  if (!file) { $("#preview").removeAttribute("src"); $("#preview").srcdoc = `<body style="font:14px system-ui;color:#666;display:grid;place-items:center;height:90vh;margin:0">${esc(t("Crée un fichier index.html pour voir l'aperçu."))}</body>`; return; }
  await app.saveNow(p);
  if (liveChannel) liveChannel.postMessage({ type: "reload", project: p.id });
  if (swReady) { $("#preview").removeAttribute("srcdoc"); $("#preview").src = `embed/${encodeURIComponent(p.id)}/${encPath(file)}?r=${Date.now()}`; }
  else { $("#preview").removeAttribute("src"); $("#preview").srcdoc = buildInlineHtml(true); }
}
app.refreshPreview = refreshPreview;
const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(() => refreshPreview(false), 700); };
function openLive(file) {
  const p = P(); file = file || pickPreviewFile();
  if (!file) return toast(t("Crée un fichier index.html pour voir l'aperçu."), { error: true });
  if (!swReady) return toast(t("Le Live Server démarre… réessaie dans une seconde."), { error: true });
  app.saveNow(p).then(() => window.open(`live/${encodeURIComponent(p.id)}/${encPath(file)}`, "tabcode-live-" + p.id));
}
window.addEventListener("message", e => {
  const d = e.data; if (!d || !d.__tabcode) return;
  if (e.source !== $("#preview").contentWindow) return;
  if (d.type === "console") logConsole(d.level, d.args.join(" "));
  else if (d.type === "result") logConsole("result", d.value);
  else if (d.type === "key") handleShortcut(d, false);
  else if (d.type === "loaded" && d.path) {
    const m = d.path.match(/\/embed\/[^/]+\/(.*)$/); if (m) { const f = decodeURIComponent(m[1]) || "index.html"; if (P().files[f]) { previewFile = f; $("#previewFileName").textContent = f; } }
  }
});

/* Fallback when the service worker is not available: inline CSS/JS/images into one document */
function resolveRef(fromFile, ref) {
  if (!ref) return null; ref = ref.trim();
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null;
  ref = ref.split(/[?#]/)[0]; try { ref = decodeURIComponent(ref); } catch (e) {}
  const parts = ref.startsWith("/") ? [] : dir(fromFile).split("/").filter(Boolean);
  for (const s of ref.replace(/^\/+/, "").split("/")) { if (s === "..") parts.pop(); else if (s && s !== ".") parts.push(s); }
  return parts.join("/");
}
app.resolveRef = resolveRef;
function assetUrl(fromFile, ref) {
  const p = P(); const path = resolveRef(fromFile, ref); if (!path) return null; const f = p.files[path]; if (!f) return null;
  if (f.k !== "text") return f.c;
  if (ext(path) === "svg") return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(f.c);
  return null;
}
const rewriteCss = (css, from) => css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => { const a = assetUrl(from, u); return a ? `url("${a}")` : m; });
function buildInlineHtml(withBridge) {
  const p = P(); const file = pickPreviewFile(); if (!file) return null;
  let html = p.files[file].c;
  html = html.replace(/<link\b[^>]*>/gi, tag => {
    const h = tag.match(/href\s*=\s*["']([^"']+)["']/i); if (!h) return tag;
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) { const a = assetUrl(file, h[1]); return a ? tag.replace(h[1], a) : tag; }
    const path = resolveRef(file, h[1]); if (!path || !p.files[path]) return tag;
    return `<style>\n${rewriteCss(p.files[path].c, path)}\n</style>`;
  });
  html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, a, src, b) => {
    const path = resolveRef(file, src); if (!path || !p.files[path] || p.files[path].k !== "text") return m;
    return `<script${a}${b}>\n${p.files[path].c.replace(/<\/script/gi, "<\\/script")}\n<\/script>`;
  });
  html = html.replace(/(\s(?:src|poster|data-src)\s*=\s*)(["'])([^"']+)\2/gi, (m, pre, q, v) => { const a = assetUrl(file, v); return a ? `${pre}${q}${a}${q}` : m; });
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (m, a, css) => `<style${a}>${rewriteCss(css, file)}</style>`);
  if (withBridge) {
    const bridge = `<script>(function(){function f(v){try{if(v instanceof Error)return v.name+": "+v.message;if(typeof v==="object"&&v!==null)return JSON.stringify(v,null,2);return String(v)}catch(e){return String(v)}}function s(l,a){parent.postMessage({__tabcode:1,type:"console",level:l,args:[].map.call(a,f)},"*")}["log","info","warn","error"].forEach(function(l){var o=console[l];console[l]=function(){s(l,arguments);o.apply(console,arguments)}});addEventListener("error",function(e){s("error",[e.message])});addEventListener("message",function(e){var d=e.data;if(!d||!d.__tabcode||d.type!=="eval")return;try{parent.postMessage({__tabcode:1,type:"result",value:f((0,eval)(d.code))},"*")}catch(err){s("error",[f(err)])}})})();<\/script>`;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + bridge) : bridge + html;
  }
  return html;
}

/* ======================= Console ======================= */
let errCount = 0;
function logConsole(level, text) {
  const log = $("#consoleLog");
  const div = document.createElement("div"); div.className = "cl " + level; div.textContent = text;
  log.appendChild(div);
  while (log.children.length > 500) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  if (level === "error") { errCount++; const b = $("#errBadge"); b.textContent = errCount; b.classList.toggle("show", $("#consoleBox").classList.contains("hidden")); }
}
function resetErrors() { errCount = 0; $("#errBadge").classList.remove("show"); if ($("#consoleLog").children.length) logConsole("sys", t("— Page rechargée —")); }
function clearConsole() { $("#consoleLog").innerHTML = ""; errCount = 0; $("#errBadge").classList.remove("show"); }
function toggleConsole(force) {
  const box = $("#consoleBox"); const show = force !== undefined ? force : box.classList.contains("hidden");
  if (show) { togglePreview(true); if (isPhone()) setPhonePane("preview"); }
  box.classList.toggle("hidden", !show); $("#pvConsole").classList.toggle("on", show);
  if (show) { $("#errBadge").classList.remove("show"); if (!isPhone()) setTimeout(() => $("#consoleField").focus(), 0); }
}
const consoleHistory = []; let histIdx = -1;
$("#consoleField").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim()) {
    const code = e.target.value; consoleHistory.unshift(code); histIdx = -1;
    logConsole("cmd", code); e.target.value = "";
    $("#preview").contentWindow.postMessage({ __tabcode: 1, type: "eval", code }, "*");
  } else if (e.key === "ArrowUp") { if (histIdx < consoleHistory.length - 1) { histIdx++; e.target.value = consoleHistory[histIdx]; } e.preventDefault(); }
  else if (e.key === "ArrowDown") { if (histIdx > 0) { histIdx--; e.target.value = consoleHistory[histIdx]; } else { histIdx = -1; e.target.value = ""; } e.preventDefault(); }
});
$("#consoleClear").onclick = clearConsole;
$("#consoleClose").onclick = () => toggleConsole(false);
$("#pvConsole").onclick = () => toggleConsole();

/* ======================= Layout ======================= */
const phoneMQ = matchMedia("(max-width:719px)");
const isPhone = () => phoneMQ.matches;
app.isPhone = isPhone;
let phonePane = "code";
function setPhonePane(pane) {
  phonePane = pane;
  document.body.classList.remove("phone-files", "phone-code", "phone-preview");
  if (isPhone()) document.body.classList.add("phone-" + pane);
  $$("#phoneNav button").forEach(b => b.classList.toggle("on", b.dataset.pane === pane));
  if (pane === "preview") refreshPreview(true);
  if (app.editor) setTimeout(() => app.editor.layout(), 0);
  updateKeybar();
}
$("#phoneNav").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.pane === "more") return moreMenu(b);
  setPhonePane(b.dataset.pane);
});
phoneMQ.addEventListener("change", () => { applyLayout(); setPhonePane(phonePane); });
function applyLayout() {
  const S = app.settings, ws = $("#workspace");
  const stack = S.layout === "stack" || (S.layout === "auto" && innerWidth < innerHeight && innerWidth < 1000);
  ws.classList.toggle("stack", stack);
  ws.classList.toggle("nopreview", !S.showPreview && !isPhone());
  $("#editorCol").style.flex = `${S.split} 1 0`;
  $("#previewCol").style.flex = `${1 - S.split} 1 0`;
  $("#previewToggle").classList.toggle("on", S.showPreview);
  $("#pvAuto").classList.toggle("on", S.autoPreview);
  $("#sidebar").classList.toggle("hidden", !S.sidebar && !isPhone());
  $$("#activity .act[data-view]").forEach(b => b.classList.toggle("on", S.sidebar && b.dataset.view === S.view));
  $$(".phone-views button").forEach(b => b.classList.toggle("on", b.dataset.view === S.view));
  $$("#sidebar .view").forEach(v => v.hidden = v.id !== "view-" + S.view);
  $("#pvDevice").value = S.device;
  const w = +S.device, fr = $("#preview");
  $("#previewWrap").classList.toggle("device", w > 0);
  fr.style.width = w ? w + "px" : "100%";
}
app.applyLayout = applyLayout;
function togglePreview(force) {
  if (isPhone()) { setPhonePane(force === false ? "code" : "preview"); return; }
  app.settings.showPreview = force !== undefined ? force : !app.settings.showPreview;
  saveSettings(); applyLayout(); if (app.settings.showPreview) refreshPreview(true);
}
function toggleSidebar(force) { app.settings.sidebar = force !== undefined ? force : !app.settings.sidebar; saveSettings(); applyLayout(); }
function showView(view, focus) {
  app.settings.view = view; app.settings.sidebar = true; saveSettings(); applyLayout();
  if (isPhone()) setPhonePane("files");
  if (view === "search" && focus) { const sel = app.editor && app.editor.getModel() ? app.editor.getModel().getValueInRange(app.editor.getSelection()) : ""; const i = $("#searchInput"); if (sel && !sel.includes("\n")) { i.value = sel; runSearch(); } setTimeout(() => { i.focus(); i.select(); }, 0); }
  if (view === "trash") renderTrash();
  app.emit("view", view);
}
app.showView = showView;
$$("#activity .act[data-view]").forEach(b => b.onclick = () => {
  const v = b.dataset.view;
  if (app.settings.sidebar && app.settings.view === v) toggleSidebar(false); else showView(v, true);
});
// Phone: view switcher on top of the sidebar
(() => {
  const bar = document.createElement("div"); bar.className = "phone-views";
  bar.innerHTML = [["explorer", "Explorateur"], ["search", "Rechercher"], ["github", "GitHub"], ["extensions", "Extensions"], ["trash", "Corbeille"]]
    .map(([v, l]) => `<button data-view="${v}" data-i18n="${l}">${l}</button>`).join("");
  bar.onclick = e => { const b = e.target.closest("button"); if (b) showView(b.dataset.view); };
  $("#sidebar").prepend(bar);
})();
$("#actSettings").onclick = () => openSettings();
$("#actHelp").onclick = () => openShortcuts();
$("#previewToggle").onclick = () => togglePreview();
$("#runBtn").onclick = () => { togglePreview(true); refreshPreview(true); };
$("#liveBtn").onclick = () => openLive();
$("#pvRefresh").onclick = () => refreshPreview(true);
$("#pvAuto").onclick = () => { app.settings.autoPreview = !app.settings.autoPreview; saveSettings(); applyLayout(); toast(app.settings.autoPreview ? t("Actualisation automatique activée.") : t("Actualisation automatique désactivée : utilise Ctrl+Entrée.")); };
$("#pvDevice").onchange = e => { app.settings.device = e.target.value; saveSettings(); applyLayout(); };
$("#pvLayout").onclick = () => { app.settings.layout = $("#workspace").classList.contains("stack") ? "side" : "stack"; saveSettings(); applyLayout(); };
$("#pvFull").onclick = () => { document.body.classList.toggle("fullpreview"); $("#pvFull").classList.toggle("on", document.body.classList.contains("fullpreview")); };
$("#projSection").onclick = () => projectMenu($("#projSection"));
$("#projectBtn").onclick = e => projectMenu(e.currentTarget);
addEventListener("resize", debounce(() => { applyLayout(); if (app.editor) app.editor.updateOptions({ minimap: { enabled: app.settings.minimap && innerWidth > 900 } }); }, 100));
(() => { // splitter
  const sp = $("#splitter"); let dragging = false;
  sp.addEventListener("pointerdown", e => { dragging = true; sp.setPointerCapture(e.pointerId); sp.classList.add("drag"); $("#preview").style.pointerEvents = "none"; e.preventDefault(); });
  sp.addEventListener("pointermove", e => {
    if (!dragging) return;
    const r = $("#workspace").getBoundingClientRect(); const stack = $("#workspace").classList.contains("stack");
    app.settings.split = Math.min(0.85, Math.max(0.15, stack ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width)); applyLayout();
  });
  const end = () => { if (!dragging) return; dragging = false; sp.classList.remove("drag"); $("#preview").style.pointerEvents = ""; saveSettings(); };
  sp.addEventListener("pointerup", end); sp.addEventListener("pointercancel", end);
  sp.addEventListener("dblclick", () => { app.settings.split = 0.55; saveSettings(); applyLayout(); });
})();

/* ======================= Search across files ======================= */
let searchTimer = null;
function markSearchDirty() { if (app.settings.view === "search") { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 400); } }
function runSearch() {
  const q = $("#searchInput").value; const out = $("#searchResults"); const p = P();
  if (!q) { out.innerHTML = ""; $("#searchCount").textContent = ""; return; }
  let total = 0, files = 0, html = ""; const ql = q.toLowerCase();
  Object.keys(p.files).sort().forEach(f => {
    const v = p.files[f]; if (v.k !== "text") return;
    const hits = [];
    v.c.split("\n").forEach((ln, i) => { const idx = ln.toLowerCase().indexOf(ql); if (idx >= 0) { hits.push([i, idx, ln]); total += ln.toLowerCase().split(ql).length - 1; } });
    if (!hits.length) return; files++;
    html += `<div class="sr-file" data-f="${esc(f)}">${fileIcon(f)}<span>${esc(base(f))}</span><span style="color:var(--muted);font-weight:400;font-size:12px">${esc(dir(f))}</span></div>`;
    hits.slice(0, 50).forEach(([i, idx, ln]) => {
      const start = Math.max(0, idx - 20);
      html += `<div class="sr-line" data-f="${esc(f)}" data-l="${i + 1}" data-c="${idx + 1}">${start > 0 ? "…" : ""}${esc(ln.slice(start, idx).trimStart())}<mark>${esc(ln.slice(idx, idx + q.length))}</mark>${esc(ln.slice(idx + q.length, idx + q.length + 60))}</div>`;
    });
  });
  out.innerHTML = html || `<div class="empty-hint">${esc(t("Aucun résultat."))}</div>`;
  $("#searchCount").textContent = total ? t("{n} résultat(s) dans {f} fichier(s)", { n: total, f: files }) : "";
}
$("#searchInput").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 200); });
$("#searchResults").addEventListener("click", e => {
  const r = e.target.closest("[data-f]"); if (!r) return;
  openFile(r.dataset.f);
  if (r.dataset.l && app.editor.getModel()) {
    const l = +r.dataset.l, c = +r.dataset.c; const range = new app.monaco.Range(l, c, l, c + $("#searchInput").value.length);
    app.editor.setSelection(range); app.editor.revealRangeInCenter(range); app.editor.focus();
  }
});
$("#replaceAllBtn").onclick = async () => {
  const q = $("#searchInput").value, rep = $("#replaceInput").value; if (!q) return;
  const p = P(); let n = 0; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const targets = Object.keys(p.files).filter(f => p.files[f].k === "text" && (re.lastIndex = 0, re.test(p.files[f].c)));
  if (!targets.length) return toast(t("Aucun résultat à remplacer."));
  if (!(await confirmBox(t("Tout remplacer ?"), t("Remplacer « {q} » par « {r} » dans {n} fichier(s) ?", { q, r: rep, n: targets.length }), t("Remplacer")))) return;
  targets.forEach(f => { re.lastIndex = 0; p.files[f].c = p.files[f].c.replace(re, () => { n++; return rep; }); app.reloadFile(f); });
  touch(p, "edit"); runSearch(); refreshPreview(true); toast(t("{n} remplacement(s) effectué(s).", { n }));
};

/* ======================= Command palette ======================= */
const fmt = () => { app.editor.focus(); app.editor.getAction("editor.action.formatDocument").run(); };
const COMMANDS = () => [
  { t: t("Nouveau fichier"), k: "Alt+N", run: () => createFile() },
  { t: t("Nouveau dossier"), run: () => createFolder() },
  { t: t("Nouveau projet"), run: createProject },
  { t: t("Changer de projet…"), run: () => projectMenu($("#projectBtn")) },
  { t: t("Importer des fichiers (ou un .zip)"), run: () => $("#fileInput").click() },
  { t: t("Formater le document"), k: "Shift+Alt+F", run: fmt },
  { t: t("Lancer / actualiser l'aperçu"), k: "Ctrl+Entrée", run: () => { togglePreview(true); refreshPreview(true); } },
  { t: t("Ouvrir avec Live Server"), run: () => openLive() },
  { t: t("Afficher/masquer l'aperçu"), k: "Ctrl+Shift+V", run: () => togglePreview() },
  { t: t("Afficher/masquer la console"), k: "Ctrl+J", run: () => toggleConsole() },
  { t: t("Afficher/masquer la barre latérale"), k: "Ctrl+B", run: () => toggleSidebar() },
  { t: t("Rechercher dans tous les fichiers"), k: "Ctrl+Shift+F", run: () => showView("search", true) },
  { t: t("Extensions"), k: "Ctrl+Shift+X", run: () => showView("extensions") },
  { t: "GitHub : " + t("Synchroniser"), k: "Ctrl+Shift+G", run: () => GH.syncCurrent() },
  { t: "GitHub : " + t("Publier mon site"), run: () => GH.publishCurrent() },
  { t: t("Corbeille"), run: () => showView("trash") },
  { t: t("Rechercher dans le fichier"), k: "Ctrl+F", run: () => { app.editor.focus(); app.editor.getAction("actions.find").run(); } },
  { t: t("Remplacer dans le fichier"), k: "Ctrl+H", run: () => { app.editor.focus(); app.editor.getAction("editor.action.startFindReplaceAction").run(); } },
  { t: t("Aller à la ligne…"), k: "Ctrl+G", run: () => { app.editor.focus(); app.editor.getAction("editor.action.gotoLine").run(); } },
  { t: t("Aperçu en plein écran"), run: () => $("#pvFull").click() },
  { t: t("Retour à la ligne automatique"), k: "Alt+Z", run: toggleWrap },
  { t: t("Thème de couleur…"), run: themePicker },
  { t: t("Agrandir le texte"), k: "Ctrl+=", run: () => setFont(app.settings.fontSize + 1) },
  { t: t("Réduire le texte"), k: "Ctrl+-", run: () => setFont(app.settings.fontSize - 1) },
  { t: t("Exporter le projet en .zip"), run: exportZip },
  { t: t("Exporter en un seul fichier .html"), run: exportSingleHtml },
  { t: t("Fermer le fichier"), k: "Alt+W", run: () => closeTab(P().active) },
  { t: t("Renommer le fichier"), run: () => P().active && renameFile(P().active) },
  { t: t("Paramètres"), k: "Ctrl+,", run: openSettings },
  { t: t("Raccourcis clavier"), run: openShortcuts },
  { t: t("À propos de TabCode"), run: openAbout },
  { t: t("Commandes avancées de l'éditeur…"), k: "F1", run: () => { app.editor.focus(); app.editor.trigger("palette", "editor.action.quickCommand"); } },
  ...Ext.commands(),
];
let palItems = [], palSel = 0;
function openPalette(prefix) {
  hideMenu();
  const pal = $("#palette"), inp = $("#paletteInput");
  pal.classList.add("show"); const ov = $("#overlay"); ov.className = "show"; ov.onclick = closePalette;
  inp.placeholder = t("Nom de fichier, > commande, : ligne");
  inp.value = prefix || ""; renderPalette(); setTimeout(() => inp.focus(), 0);
}
app.openPalette = openPalette;
function closePalette() { $("#palette").classList.remove("show"); $("#overlay").className = ""; if (app.editor && !isPhone()) app.editor.focus(); }
function fuzzy(q, s) {
  if (!q) return { score: 0, html: esc(s) };
  const ql = q.toLowerCase(), sl = s.toLowerCase(); const i = sl.indexOf(ql);
  if (i >= 0) return { score: 100 - i, html: esc(s.slice(0, i)) + "<b>" + esc(s.slice(i, i + q.length)) + "</b>" + esc(s.slice(i + q.length)) };
  let j = 0, out = "", score = 0;
  for (let k = 0; k < s.length; k++) { if (j < ql.length && sl[k] === ql[j]) { out += "<b>" + esc(s[k]) + "</b>"; j++; score++; } else out += esc(s[k]); }
  return j === ql.length ? { score, html: out } : null;
}
function renderPalette() {
  const v = $("#paletteInput").value; const list = $("#paletteList");
  if (v.startsWith(">")) {
    const q = v.slice(1).trim();
    palItems = COMMANDS().map(c => ({ c, m: fuzzy(q, c.t) })).filter(x => x.m).sort((a, b) => b.m.score - a.m.score)
      .map(x => ({ html: `<span>${x.m.html}</span>${x.c.k ? `<span class="k">${esc(x.c.k)}</span>` : ""}`, run: x.c.run }));
  } else if (v.startsWith(":")) {
    const n = parseInt(v.slice(1), 10);
    palItems = [{ html: `<span>${esc(t("Aller à la ligne {n}", { n: isNaN(n) ? "…" : n }))}</span>`, run: () => { if (!isNaN(n) && app.editor.getModel()) { app.editor.revealLineInCenter(n); app.editor.setPosition({ lineNumber: n, column: 1 }); } } }];
  } else {
    const p = P(); const q = v.trim();
    palItems = Object.keys(p.files).map(f => ({ f, m: fuzzy(q, base(f)) || (q && fuzzy(q, f)) })).filter(x => x.m)
      .sort((a, b) => (b.m.score - a.m.score) || (p.open.indexOf(b.f) - p.open.indexOf(a.f)))
      .map(x => ({ html: `${fileIcon(x.f)}<span>${x.m.html}</span><span class="sub">${esc(dir(x.f))}</span>`, run: () => openFile(x.f) }));
    if (!q) palItems.push({ keep: true, html: `<span class="sub">${t("Tape <b>&gt;</b> pour les commandes, <b>:</b> pour aller à une ligne")}</span>`, run: () => { $("#paletteInput").value = ">"; renderPalette(); } });
  }
  palSel = 0;
  list.innerHTML = palItems.length ? palItems.map((it, i) => `<div class="pi${i === 0 ? " sel" : ""}" data-i="${i}">${it.html}</div>`).join("") : `<div class="pi-empty">${esc(t("Aucun résultat"))}</div>`;
}
function palMove(d) {
  if (!palItems.length) return;
  palSel = (palSel + d + palItems.length) % palItems.length;
  $$(".pi").forEach((el, i) => el.classList.toggle("sel", i === palSel));
  const el = $(".pi.sel"); el && el.scrollIntoView({ block: "nearest" });
}
function palRun(i) { const it = palItems[i]; if (!it) return; if (it.keep) { it.run(); $("#paletteInput").focus(); return; } closePalette(); setTimeout(() => it.run(), 0); }
$("#paletteInput").addEventListener("input", renderPalette);
$("#paletteInput").addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); palMove(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); palMove(-1); }
  else if (e.key === "Enter") { e.preventDefault(); palRun(palSel); }
  else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
});
$("#paletteList").addEventListener("click", e => { const r = e.target.closest(".pi"); if (r) palRun(+r.dataset.i); });
$("#searchBox").onclick = () => openPalette("");
$("#searchBox").onkeydown = e => { if (e.key === "Enter") openPalette(""); };

function moreMenu(anchor) {
  showMenu([
    { text: t("Toutes les commandes…"), key: "Ctrl+Shift+P", run: () => openPalette(">") },
    "-",
    { text: t("Nouveau fichier…"), key: "Alt+N", run: () => createFile() },
    { text: t("Nouveau dossier…"), run: () => createFolder() },
    { text: t("Importer des fichiers ou un .zip…"), run: () => $("#fileInput").click() },
    "-",
    { text: t("Ouvrir avec Live Server"), run: () => openLive() },
    { text: "GitHub : " + t("Synchroniser"), run: () => GH.syncCurrent() },
    { text: t("Exporter le projet (.zip)"), run: exportZip },
    { text: t("Exporter en un seul .html"), run: exportSingleHtml },
    "-",
    { text: t("Formater le document"), key: "Shift+Alt+F", run: fmt },
    { text: t("Thème de couleur…"), run: themePicker },
    { text: t("Paramètres"), key: "Ctrl+,", run: openSettings },
    { text: t("Raccourcis clavier"), run: openShortcuts },
    { text: t("Installer l'application"), run: installApp },
    { text: t("À propos de TabCode"), run: openAbout },
  ], anchor);
}
$("#moreBtn").onclick = e => moreMenu(e.currentTarget);

/* ======================= Settings & dialogs ======================= */
function setFont(n) { app.settings.fontSize = Math.max(10, Math.min(30, n)); saveSettings(); app.editor && app.editor.updateOptions({ fontSize: app.settings.fontSize }); toast(t("Taille du texte : {n}", { n: app.settings.fontSize })); }
function toggleWrap() { app.settings.wordWrap = app.settings.wordWrap === "on" ? "off" : "on"; saveSettings(); app.editor.updateOptions({ wordWrap: app.settings.wordWrap }); }
function setTheme(id) { app.settings.theme = id; saveSettings(); applyTheme(id, app.monaco); app.emit("theme", id); }
app.setTheme = setTheme;
function themePicker() {
  const cur = app.settings.theme;
  showMenu([{ label: t("Thème de couleur") }, ...Object.entries(THEMES).map(([id, th]) => ({ text: th.name, checked: id === cur, run: () => setTheme(id) }))], $("#moreBtn"));
}
app.themePicker = themePicker;
function openSettings() {
  const S = app.settings;
  openDialog(`<h3>${esc(t("Paramètres"))}</h3>
    <div class="settings-grid">
      <label for="sLang">${esc(t("Langue"))}</label><select id="sLang"><option value="fr">Français</option><option value="en">English</option></select>
      <label for="sTheme">${esc(t("Thème"))}</label><select id="sTheme">${Object.entries(THEMES).map(([id, th]) => `<option value="${id}">${esc(th.name)}</option>`).join("")}</select>
      <label for="sFont">${esc(t("Taille du texte"))}</label><input id="sFont" type="number" min="10" max="30" style="width:80px">
      <label for="sTab">${esc(t("Indentation (espaces)"))}</label><select id="sTab"><option>2</option><option>4</option></select>
      <label for="sWrap">${esc(t("Retour à la ligne auto"))}</label><select id="sWrap"><option value="on">${esc(t("Activé"))}</option><option value="off">${esc(t("Désactivé"))}</option></select>
      <label for="sMini">Minimap</label><select id="sMini"><option value="1">${esc(t("Affichée"))}</option><option value="0">${esc(t("Masquée"))}</option></select>
      <label for="sLines">${esc(t("Numéros de ligne"))}</label><select id="sLines"><option value="on">${esc(t("Affichés"))}</option><option value="relative">${esc(t("Relatifs"))}</option><option value="off">${esc(t("Masqués"))}</option></select>
      <label for="sAuto">${esc(t("Aperçu automatique"))}</label><select id="sAuto"><option value="1">${esc(t("Activé"))}</option><option value="0">${esc(t("Désactivé"))}</option></select>
      <label for="sLayout">${esc(t("Position de l'aperçu"))}</label><select id="sLayout"><option value="auto">${esc(t("Automatique"))}</option><option value="side">${esc(t("À droite"))}</option><option value="stack">${esc(t("En dessous"))}</option></select>
      <label for="sKeybar">${esc(t("Barre de touches tactile"))}</label><select id="sKeybar"><option value="auto">${esc(t("Automatique (clavier à l'écran)"))}</option><option value="always">${esc(t("Toujours"))}</option><option value="never">${esc(t("Jamais"))}</option></select>
    </div>
    <div class="row"><button class="btn primary" id="sOk">${esc(t("Fermer"))}</button></div>`, d => {
    const set = (id, v) => d.querySelector(id).value = v;
    set("#sLang", getLang()); set("#sTheme", S.theme); set("#sFont", S.fontSize); set("#sTab", S.tabSize); set("#sWrap", S.wordWrap);
    set("#sMini", S.minimap ? "1" : "0"); set("#sLines", S.lineNumbers); set("#sAuto", S.autoPreview ? "1" : "0"); set("#sLayout", S.layout); set("#sKeybar", S.keybar);
    d.querySelectorAll("select,input").forEach(el => el.onchange = () => {
      const lang = d.querySelector("#sLang").value;
      S.fontSize = Math.max(10, Math.min(30, +d.querySelector("#sFont").value || 15));
      S.tabSize = +d.querySelector("#sTab").value; S.wordWrap = d.querySelector("#sWrap").value;
      S.minimap = d.querySelector("#sMini").value === "1"; S.lineNumbers = d.querySelector("#sLines").value;
      S.autoPreview = d.querySelector("#sAuto").value === "1"; S.layout = d.querySelector("#sLayout").value; S.keybar = d.querySelector("#sKeybar").value;
      if (d.querySelector("#sTheme").value !== S.theme) setTheme(d.querySelector("#sTheme").value);
      saveSettings(); applyLayout(); updateKeybar();
      if (app.editor) { app.editor.updateOptions({ fontSize: S.fontSize, wordWrap: S.wordWrap, minimap: { enabled: S.minimap && innerWidth > 900 }, lineNumbers: S.lineNumbers }); models.forEach(m => m.updateOptions({ tabSize: S.tabSize })); updateLang(); }
      if (lang !== S.lang) { S.lang = lang; saveSettings(); flushAll().then(() => setTimeout(() => location.reload(), 350)); }
    });
    d.querySelector("#sOk").onclick = () => closeDialog(null);
  });
}
app.openSettings = openSettings;
function openShortcuts() {
  const rows = [
    ["Ctrl+P", "Ouvrir un fichier"], ["Ctrl+Shift+P", "Toutes les commandes"], ["F1", "Commandes avancées de l'éditeur"],
    ["Ctrl+S", "Enregistrer (et formater si activé)"], ["Ctrl+Entrée", "Lancer l'aperçu"], ["Alt+N", "Nouveau fichier"], ["Alt+W", "Fermer le fichier"],
    ["Ctrl+Tab", "Fichier suivant"], ["Ctrl+B", "Barre latérale"], ["Ctrl+J", "Console"], ["Ctrl+Shift+V", "Aperçu"],
    ["Ctrl+Shift+F", "Rechercher partout"], ["Ctrl+Shift+X", "Extensions"], ["Ctrl+Shift+G", "GitHub"], ["Ctrl+F", "Rechercher dans le fichier"], ["Ctrl+H", "Remplacer dans le fichier"], ["Ctrl+G", "Aller à la ligne"],
    ["Shift+Alt+F", "Formater le document"], ["Ctrl+/", "Commenter la ligne"], ["Alt+↑", "Déplacer la ligne"],
    ["Shift+Alt+↓", "Dupliquer la ligne"], ["Ctrl+D", "Sélectionner l'occurrence suivante"], ["Ctrl+Shift+K", "Supprimer la ligne"],
    ["Ctrl+Alt+↓", "Ajouter un curseur"], ["F12", "Aller à la définition (CSS Peek)"], ["Alt+F12", "Aperçu de la définition"], ["Ctrl+Espace", "Afficher les suggestions"], ["Tab", "Développer une abréviation Emmet"],
    ["Ctrl+=", "Agrandir le texte"], ["Alt+Z", "Retour à la ligne automatique"]
  ];
  infoBox(t("Raccourcis clavier"), `<div class="shortcuts">${rows.map(([k, v]) => `<div>${k.split("+").map(z => `<kbd>${esc(z)}</kbd>`).join("+")}</div><div>${esc(t(v))}</div>`).join("")}</div>
    <p style="color:var(--muted);font-size:12px">${t("Emmet : tape par exemple <code>link:css</code>, <code>div.carte</code>, <code>ul&gt;li*3</code> ou <code>!</code> puis <kbd>Tab</kbd>.")}</p>`);
}
function openAbout() {
  infoBox(t("À propos de TabCode"), `<p><b>TabCode ${APP_VERSION}</b> — ${esc(t("éditeur de code open source pour tablette et téléphone."))}<br>${esc(t("Licence MIT."))} <a href="https://github.com/Erosh713/TabCode" target="_blank" rel="noopener">github.com/Erosh713/TabCode</a></p>
    <p><b>${esc(t("Confidentialité"))}</b><br>${esc(t("TabCode ne collecte aucune donnée. Tes projets restent dans ce navigateur. Ton jeton GitHub reste sur cet appareil et n'est envoyé qu'à GitHub (api.github.com) quand tu synchronises ou publies."))}</p>
    <p><b>${esc(t("Logiciels libres utilisés"))}</b></p>
    <ul style="font-size:12px"><li>Monaco Editor — MIT — Microsoft</li><li>Emmet (emmet-monaco-es) — MIT</li><li>Prettier — MIT</li><li>JSZip — MIT</li><li>Material Icon Theme — MIT — Philipp Kief</li><li>JetBrains Mono — SIL OFL 1.1</li></ul>
    <p style="font-size:12px;color:var(--muted)">${esc(t("TabCode n'est pas affilié à Microsoft ni à Visual Studio Code."))}</p>`);
}

/* ======================= Shortcuts outside the editor ======================= */
document.addEventListener("keydown", e => {
  if (dialogOpen() || $("#palette").classList.contains("show")) return;
  if (e.key === "Escape") {
    if (menuOpen()) { hideMenu(); return; }
    if (document.body.classList.contains("fullpreview")) { $("#pvFull").click(); return; }
  }
  if (app.editor && app.editor.hasTextFocus()) return;
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (handleShortcut({ key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey }, inField)) { e.preventDefault(); e.stopPropagation(); }
}, true);
function handleShortcut(e, inField) {
  const ctrl = e.ctrl, k = (e.key || "").toLowerCase();
  let hit = true;
  if (ctrl && e.shift && k === "p") openPalette(">");
  else if (ctrl && k === "p") openPalette("");
  else if (ctrl && k === "s") saveCommand();
  else if (ctrl && k === "enter") refreshPreview(true);
  else if (ctrl && k === "b") toggleSidebar();
  else if (ctrl && k === "j") toggleConsole();
  else if (ctrl && e.shift && k === "v") togglePreview();
  else if (ctrl && e.shift && k === "f") showView("search", true);
  else if (ctrl && e.shift && k === "e") showView("explorer");
  else if (ctrl && e.shift && k === "x") showView("extensions");
  else if (ctrl && e.shift && k === "g") showView("github");
  else if (ctrl && k === ",") openSettings();
  else if (e.alt && k === "n") createFile();
  else if (e.key === "F1") { app.editor && (app.editor.focus(), app.editor.trigger("palette", "editor.action.quickCommand")); }
  else if (e.key === "F2" && !inField && P().active) renameFile(P().active);
  else hit = false;
  return hit;
}
async function saveCommand() {
  if (Ext.isOn("prettier") && app.settings.formatOnSave && app.editor && app.editor.getModel()) { try { await app.editor.getAction("editor.action.formatDocument").run(); } catch (e) {} }
  await app.saveNow(P());
  refreshPreview(true);
  toast(P().gh ? t("Enregistré. Pense à synchroniser avec GitHub.") : t("Enregistré sur cet appareil."));
}

/* ======================= PWA: service worker, install, updates ======================= */
let installPrompt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; });
function installApp() {
  if (installPrompt) { installPrompt.prompt(); installPrompt = null; return; }
  infoBox(t("Installer l'application"), `<p>${esc(t("Dans le menu de ton navigateur (⋮), choisis « Ajouter à l'écran d'accueil » ou « Installer l'application ». TabCode s'ouvrira ensuite comme une vraie appli, même sans internet."))}</p>`);
}
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    const ready = () => { swReady = true; };
    if (reg.active) ready();
    navigator.serviceWorker.ready.then(() => { const was = swReady; ready(); if (!was) refreshPreview(true); });
    const offerUpdate = w => toast(t("Une nouvelle version de TabCode est prête."), { action: t("Mettre à jour"), sticky: true, onAction: async () => { await flushAll(); w.postMessage({ type: "skipWaiting" }); } });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offerUpdate(w); });
    });
    let reloading = false, hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) { hadController = true; return; } // first install: nothing to reload
      if (reloading) return; reloading = true; location.reload();
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  } catch (e) { console.warn("Service worker", e); }
}
const updateOnline = () => { $("#sbOffline").hidden = navigator.onLine; };
addEventListener("online", updateOnline); addEventListener("offline", updateOnline);

/* Save everything when the app goes to the background */
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
addEventListener("pagehide", () => flushAll());

/* Monaco cancels some internal promises on purpose */
addEventListener("unhandledrejection", e => { const r = e.reason; if (r && (r.name === "Canceled" || r.message === "Canceled")) e.preventDefault(); });

/* ======================= Boot ======================= */
async function boot() {
  try {
    const saved = await TCDB.get("kv", "settings");
    if (saved) app.settings = { ...DEFAULT_SETTINGS, ...saved, ext: { ...(saved.ext || {}) } };
  } catch (e) { console.error(e); }
  setLang(app.settings.lang); applyDom(); applyTheme(app.settings.theme, null);
  try { for (const p of await TCDB.all("projects")) app.projects[p.id] = p; } catch (e) { console.error(e); toast(t("Impossible d'ouvrir le stockage de cet appareil."), { error: true }); }
  if (!Object.keys(app.projects).length) { const p = newProject(t("Mon premier projet")); app.projects[p.id] = p; await app.saveNow(p); }
  if (!app.projects[app.settings.current]) app.settings.current = Object.values(app.projects).sort((a, b) => b.updated - a.updated)[0].id;
  Object.values(app.projects).forEach(p => { p.folders = p.folders || []; p.open = p.open || []; });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  purgeTrash().then(renderTrash);
  applyLayout(); setPhonePane("code"); renderProjectName(); renderTree(); updateOnline();
  registerSW();
  startMonaco();
}
boot();
