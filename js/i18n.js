/* Translations. The French text is the key; EN holds the English version.
   To add a language: copy EN, translate the values, register it in LANGS. */
import { EN } from "./i18n-en.js";

const LANGS = { fr: null, en: EN };
let lang = "fr";

export function setLang(l) { lang = LANGS[l] !== undefined ? l : "fr"; document.documentElement.lang = lang; }
export function getLang() { return lang; }
export function t(key, vars) {
  let s = (LANGS[lang] && LANGS[lang][key]) || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return s;
}
/* Translate static HTML marked with data-i18n / data-i18n-title / data-i18n-placeholder */
export function applyDom(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); el.setAttribute("aria-label", el.title); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}
