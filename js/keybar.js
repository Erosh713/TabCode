/* Extra keys above the on-screen keyboard (Tab, Esc, arrows, < > { } …) for coding without a physical keyboard */
import { $ } from "./util.js";

let app = null, maxH = 0, lastOrient = null;
const KEYS = [
  ["Tab", "tab", "wide"], ["💡", "suggest"], ["Esc", "esc", "wide"], "|",
  ["←", "left"], ["↑", "up"], ["↓", "down"], ["→", "right"], "|",
  ["<"], [">"], ["/"], ["="], ['"'], ["'"], ["{"], ["}"], ["("], [")"], ["["], ["]"], [";"], [":"], ["."], ["#"], ["!"], ["-"], ["_"], ["$"], ["`"], ["*"], ["&"], ["|"], "|",
  ["↶", "undo"], ["↷", "redo"], ["⌘", "palette", "wide"]
];

function ctx(key) { try { return app.editor._contextKeyService.getContextKeyValue(key); } catch (e) { return undefined; } }

function press(action, text) {
  const ed = app.editor; if (!ed || !ed.getModel()) return;
  ed.focus();
  const suggest = ctx("suggestWidgetVisible");
  switch (action) {
    case "tab": suggest ? ed.trigger("keybar", "acceptSelectedSuggestion") : ed.trigger("keybar", "tab"); break;
    case "esc": ed.trigger("keybar", "hideSuggestWidget"); ed.trigger("keybar", "closeFindWidget"); ed.trigger("keybar", "leaveSnippet"); break;
    case "left": ed.trigger("keybar", "cursorLeft"); break;
    case "right": ed.trigger("keybar", "cursorRight"); break;
    case "up": suggest ? ed.trigger("keybar", "selectPrevSuggestion") : ed.trigger("keybar", "cursorUp"); break;
    case "down": suggest ? ed.trigger("keybar", "selectNextSuggestion") : ed.trigger("keybar", "cursorDown"); break;
    case "suggest": ed.trigger("keybar", "editor.action.triggerSuggest", {}); break;
    case "undo": ed.trigger("keybar", "undo"); break;
    case "redo": ed.trigger("keybar", "redo"); break;
    case "palette": app.openPalette(">"); break;
    default: ed.trigger("keyboard", "type", { text });
  }
}

export function initKeybar(a) {
  app = a;
  const bar = $("#keybar");
  bar.innerHTML = KEYS.map(k => k === "|" ? '<span class="sep"></span>' : `<button data-a="${k[1] || ""}" data-t="${k[0].replace(/"/g, "&quot;")}"${k[2] ? ' class="wide"' : ""}>${k[0].replace(/</g, "&lt;")}</button>`).join("");
  let repeat = null;
  const stop = () => { clearTimeout(repeat); clearInterval(repeat); repeat = null; };
  bar.addEventListener("pointerdown", e => {
    const b = e.target.closest("button"); if (!b) return;
    e.preventDefault(); // keep the focus (and the on-screen keyboard) in the editor
    const go = () => press(b.dataset.a, b.dataset.t);
    go();
    if (["left", "right", "up", "down"].includes(b.dataset.a)) { repeat = setTimeout(() => { repeat = setInterval(go, 60); }, 380); }
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => bar.addEventListener(ev, stop));
  bar.addEventListener("click", e => e.preventDefault());
  app.editor.onDidFocusEditorText(() => setTimeout(updateKeybar, 250));
  app.editor.onDidBlurEditorText(() => setTimeout(updateKeybar, 250));
  addEventListener("resize", () => setTimeout(updateKeybar, 120));
  if (window.visualViewport) visualViewport.addEventListener("resize", () => setTimeout(updateKeybar, 120));
  updateKeybar();
}

/* Is the on-screen keyboard open? The window shrinks a lot compared to its usual height. */
function keyboardOpen() {
  const orient = innerWidth > innerHeight ? "l" : "p";
  if (orient !== lastOrient) { lastOrient = orient; maxH = 0; }
  const h = window.visualViewport ? Math.min(visualViewport.height, innerHeight) : innerHeight;
  maxH = Math.max(maxH, innerHeight, h);
  return h < maxH * 0.78;
}

export function updateKeybar() {
  if (!app || !app.editor) return;
  const mode = app.settings.keybar;
  const coarse = matchMedia("(pointer:coarse)").matches;
  let show = mode === "always" || (mode === "auto" && coarse && app.editor.hasTextFocus() && keyboardOpen());
  if (app.isPhone() && !document.body.classList.contains("phone-code")) show = false;
  const bar = $("#keybar");
  if (bar.hidden === !show) return;
  bar.hidden = !show;
  app.editor.layout();
}
