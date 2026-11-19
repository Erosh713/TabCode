/* GitHub: one private repository per project, three-way sync with conflict choice, import, publish with GitHub Pages.
   Talks directly to api.github.com with the user's own fine-grained token (stored only on this device). */
import { $, esc, slug, debounce, fileBytes, bytesToFile, bytesToB64, b64ToBytes, gitSha, ext, base, timeAgo } from "./util.js";
import { t } from "./i18n.js";

let app = null, auth = null; // { token, login, avatar }
let busy = false, remoteAhead = false;
const API = "https://api.github.com";
const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

class GHError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(path, opts = {}) {
  if (!auth) throw new GHError(401, t("Pas connecté à GitHub."));
  let res;
  try {
    res = await fetch(path.startsWith("http") ? path : API + path, {
      method: opts.method || "GET",
      headers: { Authorization: "Bearer " + auth.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store"
    });
  } catch (e) { throw new GHError(0, t("Pas de connexion internet.")); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GHError(res.status, (data && data.message) || res.statusText);
  return data;
}
function explain(e) {
  if (!e || e.status === undefined) return String(e && e.message || e);
  if (e.status === 0) return t("Pas de connexion internet.");
  if (e.status === 401) return t("Ton jeton GitHub n'est plus valide (expiré ou supprimé). Reconnecte-toi.");
  if (e.status === 403) return t("GitHub refuse l'action : ton jeton n'a pas les bonnes permissions ({m}).", { m: e.message });
  if (e.status === 404) return t("Dépôt introuvable, ou ton jeton n'y a pas accès.");
  return `GitHub (${e.status}) : ${e.message}`;
}

export async function init(a) {
  app = a;
  try { auth = (await TCDB.get("kv", "github")) || null; } catch (e) {}
  $("#sbSync").onclick = () => app.showView("github");
  app.on("projectChanged", debounce(refresh, 600));
  app.on("projectLoaded", () => { remoteAhead = false; refresh(); checkRemote(); });
  app.on("view", v => { if (v === "github") { refresh(); checkRemote(); } });
  addEventListener("online", () => checkRemote());
  refresh(); checkRemote();
}

/* ---------------- Local changes ---------------- */
const shaMemo = new Map(); // "projectId/path" -> { c, sha }
async function localShas(p) {
  const out = {};
  for (const [path, f] of Object.entries(p.files)) {
    const key = p.id + "/" + path; const m = shaMemo.get(key);
    if (m && m.c === f.c) { out[path] = m.sha; continue; }
    const sha = await gitSha(fileBytes(f)); shaMemo.set(key, { c: f.c, sha }); out[path] = sha;
  }
  return out;
}
async function changes(p) {
  if (!p.gh) return [];
  const loc = await localShas(p), b = p.gh.base || {}; const out = [];
  for (const path of new Set([...Object.keys(loc), ...Object.keys(b)])) {
    if (loc[path] === b[path]) continue;
    out.push({ path, st: !b[path] ? "A" : !loc[path] ? "D" : "M" });
  }
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

/* ---------------- Panel & status ---------------- */
async function refresh() {
  const p = app.P(); if (!p) return;
  const ch = await changes(p);
  // status bar
  const sb = $("#sbSyncText");
  $("#sbSync").classList.toggle("spin", busy);
  if (busy) sb.textContent = t("Synchronisation…");
  else if (!p.gh) sb.textContent = t("Local");
  else sb.textContent = `${p.gh.repo}${ch.length ? " ↑" + ch.length : ""}${remoteAhead ? " ↓" : ""}`;
  const badge = $("#ghBadge"); badge.textContent = ch.length || (remoteAhead ? "↓" : ""); badge.classList.toggle("show", !!(ch.length || remoteAhead));
  if (app.settings.view === "github") renderPanel(p, ch);
}
function renderPanel(p, ch) {
  const el = $("#ghPanel"); let h = "";
  if (!auth) {
    h += `<div class="gh-card"><h4>${esc(t("Connecter GitHub"))}</h4><p>${esc(t("Sauvegarde chaque projet dans un dépôt privé sur ton GitHub, retrouve-le sur ton téléphone et publie ton site en un clic."))}</p>
      <button class="btn primary" data-a="login">${esc(t("Se connecter avec un jeton"))}</button></div>`;
    el.innerHTML = h; return;
  }
  h += `<div class="gh-user">${auth.avatar ? `<img src="${esc(auth.avatar)}" alt="">` : ""}<div style="flex:1"><b>${esc(auth.login)}</b><br><button style="color:var(--info);font-size:12px" data-a="logout">${esc(t("Se déconnecter"))}</button></div></div>`;
  if (!p.gh) {
    h += `<div class="gh-card"><h4>${esc(p.name)}</h4><p>${esc(t("Ce projet n'est pas encore sur GitHub."))}</p>
      <button class="btn primary" data-a="create" ${busy ? "disabled" : ""}>${esc(t("Créer un dépôt privé et synchroniser"))}</button>
      <button class="btn" data-a="link">${esc(t("Lier à un dépôt existant…"))}</button></div>`;
  } else {
    const g = p.gh;
    h += `<div class="gh-card"><h4>${esc(g.owner)}/${esc(g.repo)}</h4>
      <p>${g.lastSync ? esc(t("Dernière synchro : {w}", { w: timeAgo(g.lastSync, t) })) : esc(t("Jamais synchronisé"))}${remoteAhead ? "<br><b style=\"color:var(--info)\">" + esc(t("Des modifications t'attendent sur GitHub.")) + "</b>" : ""}</p>
      ${ch.length ? `<p>${esc(t("{n} modification(s) locale(s) :", { n: ch.length }))}</p><div class="gh-files">${ch.map(c => `<div class="st-${c.st}">${c.st} ${esc(c.path)}</div>`).join("")}</div>` : `<p>${esc(t("Aucune modification locale."))}</p>`}
      <button class="btn primary" data-a="sync" ${busy ? "disabled" : ""}>${esc(busy ? t("Synchronisation…") : t("Synchroniser"))}</button>
      ${g.pagesUrl ? `<a class="btn" href="${esc(g.pagesUrl)}" target="_blank" rel="noopener">${esc(t("Ouvrir mon site"))} ↗</a>` : `<button class="btn" data-a="publish">${esc(t("Publier mon site"))}</button>`}
      <a class="btn" href="https://github.com/${esc(g.owner)}/${esc(g.repo)}" target="_blank" rel="noopener">${esc(t("Voir sur GitHub"))} ↗</a>
      <button class="btn" data-a="unlink">${esc(t("Délier ce projet"))}</button></div>`;
  }
  h += `<div class="gh-card"><h4>${esc(t("Récupérer un projet"))}</h4><p>${esc(t("Ouvre ici un dépôt de ton GitHub (par exemple un projet commencé sur un autre appareil)."))}</p><button class="btn" data-a="import">${esc(t("Importer un dépôt GitHub…"))}</button></div>`;
  el.innerHTML = h;
}
$("#ghPanel").addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  ({ login: loginDialog, logout, create: () => createRepo(app.P()), link: () => repoPicker("link"), sync: () => syncCurrent(), publish: () => publishCurrent(), unlink, import: () => importRepoDialog() })[b.dataset.a]();
});

/* ---------------- Auth ---------------- */
function loginDialog() {
  app.openDialog(`<h3>${esc(t("Connecter GitHub"))}</h3>
    <p>${esc(t("TabCode a besoin d'un « jeton » GitHub. Tu le crées une seule fois :"))}</p>
    <ol>
      <li>${t("Ouvre <a href=\"{u}\" target=\"_blank\" rel=\"noopener\">cette page GitHub</a> (connecte-toi si besoin).", { u: TOKEN_URL })}</li>
      <li>${t("<b>Token name</b> : TabCode · <b>Expiration</b> : 1 an (ou plus).")}</li>
      <li>${t("<b>Repository access</b> : <b>All repositories</b>.")}</li>
      <li>${t("<b>Permissions</b> → <b>Repositories</b> → ajoute : <b>Administration</b>, <b>Contents</b> et <b>Pages</b>, chacune en <b>Read and write</b>.")}</li>
      <li>${t("Touche <b>Generate token</b>, copie le jeton (il commence par <code>github_pat_</code>) et colle-le ici :")}</li>
    </ol>
    <input class="field" id="ghToken" placeholder="github_pat_…" autocomplete="off" spellcheck="false" autocapitalize="off">
    <p style="font-size:12px;color:var(--muted)">${esc(t("Le jeton reste sur cet appareil et n'est envoyé qu'à GitHub. Tu peux le supprimer à tout moment sur GitHub ou avec « Se déconnecter »."))}</p>
    <div class="row"><button class="btn" id="ghCancel">${esc(t("Annuler"))}</button><button class="btn primary" id="ghOk">${esc(t("Connecter"))}</button></div>`, d => {
    const inp = d.querySelector("#ghToken"); setTimeout(() => inp.focus(), 50);
    d.querySelector("#ghCancel").onclick = () => app.closeDialog(null);
    const go = async () => {
      const token = inp.value.trim(); if (!token) return;
      const btn = d.querySelector("#ghOk"); btn.disabled = true; btn.textContent = t("Vérification…");
      auth = { token };
      try {
        const u = await api("/user");
        auth = { token, login: u.login, avatar: u.avatar_url };
        await TCDB.put("kv", auth, "github");
        app.closeDialog(true); app.toast(t("Connecté en tant que {l}.", { l: u.login })); refresh();
      } catch (e) { auth = null; btn.disabled = false; btn.textContent = t("Connecter"); app.toast(explain(e), { error: true }); }
    };
    d.querySelector("#ghOk").onclick = go;
    inp.onkeydown = e => { if (e.key === "Enter") go(); };
  });
}
async function logout() {
  if (!(await app.confirmBox(t("Se déconnecter de GitHub ?"), t("Le jeton sera effacé de cet appareil. Tes projets et tes dépôts ne changent pas."), t("Se déconnecter")))) return;
  auth = null; await TCDB.del("kv", "github"); refresh();
}
const needAuth = () => { if (auth) return true; app.showView("github"); loginDialog(); return false; };

/* ---------------- Repositories ---------------- */
async function createRepo(p) {
  if (busy || !needAuth()) return; // ignore a second tap while the first one is still running
  if (p.gh) return sync(p);
  let name = slug(p.name);
  setBusy(true);
  try {
    let repo = null;
    for (let i = 1; i <= 5 && !repo; i++) {
      try { repo = await api("/user/repos", { method: "POST", body: { name: i === 1 ? name : `${name}-${i}`, private: true, auto_init: true, description: t("Projet créé avec TabCode") } }); }
      catch (e) { if (e.status !== 422) throw e; }
    }
    if (!repo) throw new Error(t("Impossible de trouver un nom libre pour le dépôt."));
    p.gh = { owner: repo.owner.login, repo: repo.name, branch: repo.default_branch || "main", base: {}, head: null, lastSync: 0 };
    app.touch(p, "gh");
    app.toast(t("Dépôt privé « {r} » créé.", { r: repo.name }));
  } catch (e) { setBusy(false); app.toast(explain(e), { error: true }); return; }
  setBusy(false);
  await sync(p);
}
async function listRepos() {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const r = await api(`/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator&page=${page}`);
    all.push(...r); if (r.length < 100) break;
  }
  return all;
}
export async function importRepoDialog() { if (needAuth()) repoPicker("import"); }
async function repoPicker(mode) {
  if (!needAuth()) return;
  let repos = [];
  app.openDialog(`<h3>${esc(mode === "import" ? t("Importer un dépôt GitHub") : t("Lier à un dépôt existant"))}</h3>
    <input class="field" id="rpFilter" placeholder="${esc(t("Filtrer"))}" autocomplete="off" spellcheck="false">
    <div id="rpList" style="max-height:50vh;overflow:auto"><div class="empty-hint">${esc(t("Chargement…"))}</div></div>
    <div class="row"><button class="btn" id="rpCancel">${esc(t("Annuler"))}</button></div>`, d => {
    d.querySelector("#rpCancel").onclick = () => app.closeDialog(null);
    const render = () => {
      const q = d.querySelector("#rpFilter").value.toLowerCase();
      d.querySelector("#rpList").innerHTML = repos.filter(r => r.full_name.toLowerCase().includes(q)).map(r =>
        `<div class="pi" data-r="${esc(r.full_name)}"><span>${esc(r.full_name)}</span><span class="sub">${r.private ? "🔒" : ""} ${esc(timeAgo(new Date(r.pushed_at || r.updated_at).getTime(), t))}</span></div>`).join("") || `<div class="empty-hint">${esc(t("Aucun dépôt."))}</div>`;
    };
    d.querySelector("#rpFilter").oninput = render;
    d.querySelector("#rpList").onclick = async e => {
      const row = e.target.closest("[data-r]"); if (!row) return;
      const r = repos.find(x => x.full_name === row.dataset.r); app.closeDialog(r);
      const gh = { owner: r.owner.login, repo: r.name, branch: r.default_branch || "main", base: {}, head: null, lastSync: 0, pagesUrl: r.has_pages ? `https://${r.owner.login.toLowerCase()}.github.io/${r.name}/` : null };
      if (mode === "import") {
        const existing = Object.values(app.projects).find(p => p.gh && p.gh.owner === gh.owner && p.gh.repo === gh.repo);
        if (existing) { app.switchProject(existing.id); app.toast(t("Ce dépôt est déjà ouvert dans TabCode.")); return; }
        const p = app.newProject(r.name, {}); p.gh = gh; await app.addProject(p);
        await sync(p);
      } else { const p = app.P(); p.gh = gh; app.touch(p, "gh"); await sync(p); }
    };
    listRepos().then(r => { repos = r; render(); }).catch(e => { d.querySelector("#rpList").innerHTML = `<div class="empty-hint">${esc(explain(e))}</div>`; });
  });
}
async function unlink() {
  const p = app.P();
  if (!(await app.confirmBox(t("Délier ce projet ?"), t("Le projet reste dans TabCode et le dépôt reste sur GitHub, mais ils ne seront plus synchronisés."), t("Délier")))) return;
  p.gh = null; app.touch(p, "gh"); refresh();
}

/* ---------------- Sync ---------------- */
function setBusy(b) { busy = b; refresh(); }
async function getRemote(g) {
  let head = null;
  try { head = (await api(`/repos/${g.owner}/${g.repo}/git/ref/heads/${encodeURIComponent(g.branch)}`)).object.sha; }
  catch (e) { if (e.status !== 404 && e.status !== 409) throw e; }
  const files = {};
  if (head) {
    const commit = await api(`/repos/${g.owner}/${g.repo}/git/commits/${head}`);
    const tree = await api(`/repos/${g.owner}/${g.repo}/git/trees/${commit.tree.sha}?recursive=1`);
    for (const it of tree.tree) if (it.type === "blob" && it.mode !== "120000") files[it.path] = it.sha;
  }
  return { head, files };
}
async function fetchBlob(g, sha, path) {
  const b = await api(`/repos/${g.owner}/${g.repo}/git/blobs/${sha}`);
  return bytesToFile(path, b64ToBytes(b.content || ""));
}
async function checkRemote() {
  const p = app.P(); if (!auth || !p || !p.gh || !navigator.onLine || busy) return;
  try {
    const r = await api(`/repos/${p.gh.owner}/${p.gh.repo}/git/ref/heads/${encodeURIComponent(p.gh.branch)}`);
    const was = remoteAhead; remoteAhead = !!(r.object.sha && r.object.sha !== p.gh.head);
    if (remoteAhead && !was) app.toast(t("Des modifications de « {r} » t'attendent sur GitHub.", { r: p.gh.repo }), { action: t("Synchroniser"), onAction: () => syncCurrent() });
    refresh();
  } catch (e) { /* silent */ }
}
export async function syncCurrent() { const p = app.P(); if (!needAuth()) return; if (!p.gh) { app.showView("github"); return createRepo(p); } return sync(p); }

async function sync(p, attempt = 1) {
  if (busy && attempt === 1) return;
  const g = p.gh; setBusy(true);
  try {
    await app.flushAll();
    const remote = await getRemote(g);
    const local = await localShas(p);
    const baseShas = g.base || {};
    const pull = [], conflicts = [];
    const final = {}; // path -> sha in the result
    for (const path of new Set([...Object.keys(local), ...Object.keys(remote.files), ...Object.keys(baseShas)])) {
      const l = local[path], r = remote.files[path], b = baseShas[path];
      if (l === r) { if (l) final[path] = l; continue; }
      if (l === b) { pull.push(path); if (r) final[path] = r; continue; }   // only GitHub changed
      if (r === b) { if (l) final[path] = l; continue; }                     // only this device changed
      conflicts.push({ path, l, r });                                         // both changed
    }
    if (conflicts.length) {
      const choice = await resolveConflicts(p, g, conflicts);
      if (!choice) { setBusy(false); app.toast(t("Synchronisation annulée.")); return; }
      for (const c of conflicts) {
        if (choice[c.path] === "remote") { pull.push(c.path); if (c.r) final[c.path] = c.r; }
        else if (c.l) final[c.path] = c.l;
      }
    }
    // Apply what comes from GitHub (deleted files go to the trash)
    const touched = [];
    for (const path of pull) {
      const r = remote.files[path];
      if (r) p.files[path] = await fetchBlob(g, r, path);
      else if (p.files[path]) await app.trashFile(path, p);
      touched.push(path);
    }
    // Push if the result differs from GitHub
    let head = remote.head, pushedCount = 0;
    const differs = Object.keys(final).length !== Object.keys(remote.files).length || Object.entries(final).some(([k, v]) => remote.files[k] !== v);
    if (differs) {
      const pushed = Object.keys(final).filter(k => remote.files[k] !== final[k]);
      pushedCount = pushed.length + Object.keys(remote.files).filter(k => !final[k]).length;
      for (const path of pushed) {
        const blob = await api(`/repos/${g.owner}/${g.repo}/git/blobs`, { method: "POST", body: { content: bytesToB64(fileBytes(p.files[path])), encoding: "base64" } });
        final[path] = blob.sha;
      }
      const tree = await api(`/repos/${g.owner}/${g.repo}/git/trees`, { method: "POST", body: { tree: Object.entries(final).map(([path, sha]) => ({ path, mode: "100644", type: "blob", sha })) } });
      const now = new Date();
      const commit = await api(`/repos/${g.owner}/${g.repo}/git/commits`, { method: "POST", body: { message: t("TabCode : {n} fichier(s) modifié(s)", { n: pushedCount }) + ` — ${now.toLocaleString()}`, tree: tree.sha, parents: head ? [head] : [] } });
      try {
        if (head) await api(`/repos/${g.owner}/${g.repo}/git/refs/heads/${encodeURIComponent(g.branch)}`, { method: "PATCH", body: { sha: commit.sha, force: false } });
        else await api(`/repos/${g.owner}/${g.repo}/git/refs`, { method: "POST", body: { ref: "refs/heads/" + g.branch, sha: commit.sha } });
      } catch (e) {
        if (e.status === 422 && attempt < 3) { busy = false; return sync(p, attempt + 1); } // someone pushed meanwhile: start again
        throw e;
      }
      head = commit.sha;
    }
    g.base = final; g.head = head; g.lastSync = Date.now(); remoteAhead = false;
    if (touched.length && p.id === app.settings.current) app.afterExternalChange(touched);
    await app.saveNow(p);
    const nPull = touched.length;
    app.toast(nPull || differs ? t("Synchronisé : {a} fichier(s) reçu(s), {b} envoyé(s).", { a: nPull, b: pushedCount }) : t("Déjà à jour."));
  } catch (e) {
    console.error(e); app.toast(explain(e), { error: true });
  } finally { busy = false; refresh(); }
}

/* Conflict dialog: choose, file by file, which version to keep (with a side-by-side comparison) */
function resolveConflicts(p, g, conflicts) {
  const choice = {}; conflicts.forEach(c => (choice[c.path] = "local"));
  let diff = null;
  return app.openDialog(`<h3>${esc(t("Modifié des deux côtés"))}</h3>
    <p>${esc(t("Ces fichiers ont changé sur cet appareil ET sur GitHub depuis la dernière synchro. Choisis quelle version garder :"))}</p>
    <div id="cfList">${conflicts.map((c, i) => `<div class="conflict"><span class="name">${esc(c.path)}</span>
      <label><input type="radio" name="cf${i}" value="local" checked> ${esc(c.l ? t("Cet appareil") : t("Supprimé ici"))}</label>
      <label><input type="radio" name="cf${i}" value="remote"> ${esc(c.r ? "GitHub" : t("Supprimé sur GitHub"))}</label>
      ${c.l && c.r && p.files[c.path] && p.files[c.path].k === "text" ? `<button class="btn" data-cmp="${i}">${esc(t("Comparer"))}</button>` : ""}</div>`).join("")}</div>
    <div class="diff-labels" id="cfLabels" hidden><span>GitHub</span><span>${esc(t("Cet appareil"))}</span></div>
    <div id="diffHost" hidden style="min-height:300px"></div>
    <div class="row"><button class="btn" id="cfCancel">${esc(t("Annuler"))}</button><button class="btn primary" id="cfOk">${esc(t("Continuer la synchro"))}</button></div>`, d => {
    d.querySelectorAll("input[type=radio]").forEach(r => r.onchange = () => { choice[conflicts[+r.name.slice(2)].path] = r.value; });
    d.querySelector("#cfCancel").onclick = () => app.closeDialog(null);
    d.querySelector("#cfOk").onclick = () => app.closeDialog(choice);
    d.querySelector("#cfList").onclick = async e => {
      const b = e.target.closest("[data-cmp]"); if (!b) return;
      const c = conflicts[+b.dataset.cmp]; b.disabled = true;
      try {
        const remoteFile = await fetchBlob(g, c.r, c.path);
        const host = d.querySelector("#diffHost"); host.hidden = false; d.querySelector("#cfLabels").hidden = false;
        d.classList.add("wide");
        const m = app.monaco;
        if (!diff) diff = m.editor.createDiffEditor(host, { automaticLayout: true, readOnly: true, renderSideBySide: !app.isPhone(), minimap: { enabled: false } });
        const old = diff.getModel();
        diff.setModel({ original: m.editor.createModel(remoteFile.c, undefined), modified: m.editor.createModel(p.files[c.path].c, undefined) });
        if (old) { old.original.dispose(); old.modified.dispose(); }
      } catch (er) { app.toast(explain(er), { error: true }); }
      b.disabled = false;
    };
    return () => { if (diff) { const mo = diff.getModel(); diff.dispose(); if (mo) { mo.original.dispose(); mo.modified.dispose(); } } };
  }, { closeOnOverlay: false });
}

/* ---------------- Publish (GitHub Pages) ---------------- */
export async function publishCurrent() {
  const p = app.P(); if (!needAuth()) return;
  if (!p.files["index.html"]) { app.toast(t("Il faut un fichier index.html à la racine du projet pour publier un site."), { error: true }); return; }
  if (!p.gh) { app.showView("github"); app.toast(t("Crée d'abord le dépôt GitHub de ce projet.")); return; }
  const g = p.gh;
  let repo;
  try { repo = await api(`/repos/${g.owner}/${g.repo}`); } catch (e) { app.toast(explain(e), { error: true }); return; }
  const ok = await app.confirmBox(t("Publier « {n} » ?", { n: p.name }),
    (repo.private ? t("Le dépôt va devenir PUBLIC : tout le monde pourra voir ton code (c'est normal pour un site publié, et c'est gratuit pour toujours).") + " " : "") +
    t("Ton site sera en ligne à l'adresse {u} (comptes 1 à 2 minutes).", { u: `https://${g.owner.toLowerCase()}.github.io/${g.repo}/` }), t("Publier"));
  if (!ok) return;
  await sync(p);
  setBusy(true);
  try {
    if (repo.private) await api(`/repos/${g.owner}/${g.repo}`, { method: "PATCH", body: { private: false } });
    try { await api(`/repos/${g.owner}/${g.repo}/pages`, { method: "POST", body: { source: { branch: g.branch, path: "/" } } }); }
    catch (e) { if (e.status !== 409) throw e; }
    let url = `https://${g.owner.toLowerCase()}.github.io/${g.repo}/`;
    try { const pg = await api(`/repos/${g.owner}/${g.repo}/pages`); if (pg && pg.html_url) url = pg.html_url; } catch (e) {}
    g.pagesUrl = url; app.touch(p, "gh"); await app.saveNow(p);
    app.openDialog(`<h3>🎉 ${esc(t("Site publié !"))}</h3><p>${esc(t("GitHub prépare ton site. Il sera visible dans 1 à 2 minutes ici :"))}</p><p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p><p style="color:var(--muted)">${esc(t("Après chaque synchronisation, le site se met à jour tout seul."))}</p><div class="row"><button class="btn" id="pCopy">${esc(t("Copier le lien"))}</button><button class="btn primary" id="pOk">OK</button></div>`, d => {
      d.querySelector("#pOk").onclick = () => app.closeDialog(true); d.querySelector("#pCopy").onclick = () => app.copyText(url);
    });
  } catch (e) { app.toast(explain(e), { error: true }); }
  finally { setBusy(false); }
}
