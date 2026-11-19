/* Toasts, dialogs and pop-up menus (browser alert/confirm/prompt are never used) */
import { $, esc } from "./util.js";
import { t } from "./i18n.js";

let toastTimer;
export function toast(msg, opts = {}) {
  const el = $("#toast");
  el.innerHTML = esc(msg) + (opts.action ? ` <button>${esc(opts.action)}</button>` : "");
  el.className = "show" + (opts.error ? " err" : "");
  if (opts.action) el.querySelector("button").onclick = () => { el.className = ""; opts.onAction(); };
  clearTimeout(toastTimer);
  if (!opts.sticky) toastTimer = setTimeout(() => (el.className = ""), opts.error ? 7000 : opts.action ? 9000 : 3200);
}

let dialogResolve = null, onClose = null;
export const dialogOpen = () => $("#dialog").classList.contains("show");
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && dialogOpen() && !e.defaultPrevented) {
    const inMonaco = e.target.closest && e.target.closest("#dialog .monaco-editor");
    if (inMonaco && document.querySelector("#dialog .suggest-widget.visible, #dialog .find-widget.visible")) return;
    e.preventDefault(); closeDialog(null);
  }
}, true);
export function openDialog(html, onReady, { wide = false, closeOnOverlay = true } = {}) {
  return new Promise(res => {
    if (dialogResolve) closeDialog(null);
    const d = $("#dialog");
    d.className = wide ? "wide" : ""; d.innerHTML = html;
    requestAnimationFrame(() => d.classList.add("show"));
    d.classList.add("show");
    const ov = $("#overlay"); ov.className = "show dim"; ov.onclick = closeOnOverlay ? () => closeDialog(null) : null;
    dialogResolve = res; onClose = null;
    if (onReady) onClose = onReady(d) || null;
  });
}
export function closeDialog(val) {
  const d = $("#dialog"); d.className = ""; d.innerHTML = "";
  $("#overlay").className = "";
  if (typeof onClose === "function") { try { onClose(); } catch (e) {} }
  const r = dialogResolve; dialogResolve = null; onClose = null;
  r && r(val);
  document.dispatchEvent(new CustomEvent("tc-dialog-closed"));
}
export function askText(title, value, hint, okLabel) {
  return openDialog(`<h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ""}<input class="field" id="dlgInput" spellcheck="false" autocapitalize="off" autocomplete="off"><div class="row"><button class="btn" id="dlgCancel">${esc(t("Annuler"))}</button><button class="btn primary" id="dlgOk">${esc(okLabel || "OK")}</button></div>`, d => {
    const i = d.querySelector("#dlgInput"); i.value = value || "";
    const dot = (value || "").lastIndexOf(".");
    setTimeout(() => { i.focus(); i.setSelectionRange(dot > 0 && !value.includes("/", dot) ? value.lastIndexOf("/") + 1 : 0, dot > 0 ? dot : i.value.length); }, 40);
    i.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); closeDialog(i.value.trim()); } };
    d.querySelector("#dlgOk").onclick = () => closeDialog(i.value.trim());
    d.querySelector("#dlgCancel").onclick = () => closeDialog(null);
  });
}
export function confirmBox(title, msg, okLabel, danger) {
  return openDialog(`<h3>${esc(title)}</h3><p>${esc(msg)}</p><div class="row"><button class="btn" id="dlgCancel">${esc(t("Annuler"))}</button><button class="btn ${danger ? "danger" : "primary"}" id="dlgOk">${esc(okLabel || "OK")}</button></div>`, d => {
    const ok = d.querySelector("#dlgOk"); setTimeout(() => ok.focus(), 40);
    ok.onclick = () => closeDialog(true); d.querySelector("#dlgCancel").onclick = () => closeDialog(false);
  }).then(v => !!v);
}
export function infoBox(title, html) {
  return openDialog(`<h3>${esc(title)}</h3>${html}<div class="row"><button class="btn primary" id="dlgOk">OK</button></div>`, d => {
    d.querySelector("#dlgOk").onclick = () => closeDialog(true);
  });
}

/* items: [{text, key, run, danger, checked}] | "-" | {label} */
export function showMenu(items, anchor) {
  const m = $("#menu");
  m.innerHTML = items.map((it, i) => it === "-" ? '<div class="msep"></div>' : it.label ? `<div class="mlabel">${esc(it.label)}</div>` :
    `<button class="mi${it.danger ? " danger" : ""}${it.checked === true ? " checked" : it.checked === false ? " unchecked" : ""}" data-i="${i}">${esc(it.text)}${it.key ? `<span class="k">${esc(it.key)}</span>` : ""}</button>`).join("");
  m.classList.add("show");
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y, right: anchor.x, top: anchor.y };
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r.left, y = r.bottom + 2;
  if (x + mw > innerWidth - 6) x = Math.max(6, r.right - mw);
  if (y + mh > innerHeight - 6) y = Math.max(6, r.top - mh - 2);
  m.style.left = x + "px"; m.style.top = y + "px";
  const ov = $("#overlay"); ov.className = "show"; ov.onclick = hideMenu;
  m.onclick = e => { const b = e.target.closest(".mi"); if (!b) return; hideMenu(); items[+b.dataset.i].run(); };
  const first = m.querySelector(".mi"); first && first.focus({ preventScroll: true });
  m.onkeydown = e => {
    const btns = [...m.querySelectorAll(".mi")]; const i = btns.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); (btns[i + 1] || btns[0]).focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (btns[i - 1] || btns[btns.length - 1]).focus(); }
    if (e.key === "Escape") { e.preventDefault(); hideMenu(); }
  };
}
export const menuOpen = () => $("#menu").classList.contains("show");
export function hideMenu() { $("#menu").classList.remove("show"); if (!dialogOpen()) $("#overlay").className = ""; }
