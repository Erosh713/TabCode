/* Colour themes: one Monaco theme + matching interface colours each.
   Palettes are inspired by the original themes (all MIT licensed). */
const R = (token, foreground, fontStyle) => ({ token, foreground, ...(fontStyle ? { fontStyle } : {}) });

function rules(p) {
  return [
    R("comment", p.comment, "italic"), R("keyword", p.keyword), R("keyword.flow", p.keyword), R("storage", p.keyword),
    R("string", p.string), R("string.html", p.string), R("number", p.number), R("regexp", p.regexp || p.string),
    R("type", p.type), R("type.identifier", p.type), R("identifier", p.ident), R("delimiter", p.delim), R("delimiter.html", p.tagDelim || p.delim),
    R("tag", p.tag), R("tag.html", p.tag), R("metatag", p.tag), R("metatag.content", p.string),
    R("attribute.name", p.attr), R("attribute.value", p.attrValue || p.string), R("attribute.value.number", p.number), R("attribute.value.unit", p.number),
    R("attribute.value.hex", p.number), R("tag.css", p.selector || p.tag), R("attribute.name.css", p.prop || p.attr),
    R("string.key.json", p.attr), R("string.value.json", p.string), R("keyword.json", p.keyword),
    R("variable", p.ident), R("variable.predefined", p.type), R("predefined", p.fn || p.type),
  ];
}

export const THEMES = {
  "dark-plus": {
    name: "Dark+ (VS Code)", base: "vs-dark", dark: true,
    ui: {},
    rules: [], colors: { "editor.background": "#1e1e1e" }
  },
  "light-plus": {
    name: "Light+ (VS Code)", base: "vs", dark: false,
    ui: { bg: "#ffffff", side: "#f3f3f3", activity: "#2c2c2c", title: "#dddddd", "title-fg": "#333333", tabs: "#f3f3f3", tab: "#ececec", "tab-active": "#ffffff",
      border: "#e0e0e0", text: "#333333", "text-strong": "#000000", muted: "#6f6f6f", hover: "#e8e8e8", sel: "#cce6ff", "sel-inactive": "#e4e6f1",
      input: "#ffffff", "input-border": "#cecece", menu: "#ffffff", panel: "#ffffff", shadow: "0 6px 24px rgba(0,0,0,.18)", info: "#0066b8" },
    rules: [], colors: {}
  },
  "one-dark-pro": {
    name: "One Dark Pro", base: "vs-dark", dark: true,
    ui: { bg: "#282c34", side: "#21252b", activity: "#282c34", "activity-fg": "#5c6370", title: "#21252b", "title-fg": "#9da5b4", tabs: "#21252b", tab: "#21252b", "tab-active": "#282c34",
      border: "#181a1f", text: "#abb2bf", "text-strong": "#d7dae0", muted: "#7f848e", hover: "#2c313a", sel: "#2c313a", "sel-inactive": "#2c313a", input: "#1d1f23", "input-border": "#181a1f",
      menu: "#21252b", panel: "#282c34", accent: "#4d78cc", status: "#21252b", "status-fg": "#9da5b4", "status-alt": "#21252b" },
    rules: rules({ comment: "7f848e", keyword: "c678dd", string: "98c379", number: "d19a66", type: "e5c07b", ident: "e06c75", delim: "abb2bf", tag: "e06c75", attr: "d19a66", prop: "56b6c2", selector: "d19a66", fn: "61afef" }),
    colors: { "editor.background": "#282c34", "editor.foreground": "#abb2bf", "editorLineNumber.foreground": "#495162", "editor.selectionBackground": "#3e4451", "editor.lineHighlightBackground": "#2c313c", "editorCursor.foreground": "#528bff" }
  },
  "dracula": {
    name: "Dracula", base: "vs-dark", dark: true,
    ui: { bg: "#282a36", side: "#21222c", activity: "#343746", "activity-fg": "#6272a4", "activity-fg-on": "#f8f8f2", title: "#21222c", "title-fg": "#f8f8f2", tabs: "#191a21", tab: "#21222c", "tab-active": "#282a36",
      border: "#191a21", text: "#f8f8f2", "text-strong": "#ffffff", muted: "#6272a4", hover: "#44475a75", sel: "#44475a", "sel-inactive": "#44475a75", input: "#282a36", "input-border": "#191a21",
      menu: "#21222c", panel: "#282a36", accent: "#bd93f9", status: "#191a21", "status-fg": "#f8f8f2", "status-alt": "#ff79c6", info: "#8be9fd" },
    rules: rules({ comment: "6272a4", keyword: "ff79c6", string: "f1fa8c", number: "bd93f9", type: "8be9fd", ident: "f8f8f2", delim: "f8f8f2", tag: "ff79c6", attr: "50fa7b", prop: "8be9fd", selector: "50fa7b", fn: "50fa7b" }),
    colors: { "editor.background": "#282a36", "editor.foreground": "#f8f8f2", "editorLineNumber.foreground": "#6272a4", "editor.selectionBackground": "#44475a", "editor.lineHighlightBackground": "#44475a55", "editorCursor.foreground": "#f8f8f0" }
  },
  "monokai": {
    name: "Monokai", base: "vs-dark", dark: true,
    ui: { bg: "#272822", side: "#1e1f1c", activity: "#272822", "activity-fg": "#75715e", title: "#1e1f1c", "title-fg": "#cccccc", tabs: "#1e1f1c", tab: "#34352f", "tab-active": "#272822",
      border: "#1e1f1c", text: "#f8f8f2", "text-strong": "#ffffff", muted: "#75715e", hover: "#3e3d32", sel: "#49483e", "sel-inactive": "#3e3d32", input: "#414339", "input-border": "#414339",
      menu: "#1e1f1c", panel: "#272822", accent: "#a6e22e", status: "#414339", "status-alt": "#414339", info: "#66d9ef" },
    rules: rules({ comment: "75715e", keyword: "f92672", string: "e6db74", number: "ae81ff", type: "66d9ef", ident: "f8f8f2", delim: "f8f8f2", tag: "f92672", attr: "a6e22e", prop: "66d9ef", selector: "a6e22e", fn: "a6e22e" }),
    colors: { "editor.background": "#272822", "editor.foreground": "#f8f8f2", "editorLineNumber.foreground": "#90908a", "editor.selectionBackground": "#49483e", "editor.lineHighlightBackground": "#3e3d32", "editorCursor.foreground": "#f8f8f0" }
  },
  "github-dark": {
    name: "GitHub Dark", base: "vs-dark", dark: true,
    ui: { bg: "#0d1117", side: "#010409", activity: "#010409", "activity-fg": "#7d8590", "activity-fg-on": "#e6edf3", title: "#010409", "title-fg": "#7d8590", tabs: "#010409", tab: "#010409", "tab-active": "#0d1117",
      border: "#30363d", text: "#e6edf3", "text-strong": "#ffffff", muted: "#7d8590", hover: "#6e76811a", sel: "#1f6feb33", "sel-inactive": "#6e768133", input: "#0d1117", "input-border": "#30363d",
      menu: "#161b22", panel: "#0d1117", accent: "#1f6feb", status: "#0d1117", "status-fg": "#7d8590", "status-alt": "#0d1117", info: "#2f81f7" },
    rules: rules({ comment: "8b949e", keyword: "ff7b72", string: "a5d6ff", number: "79c0ff", type: "ffa657", ident: "e6edf3", delim: "e6edf3", tag: "7ee787", attr: "79c0ff", prop: "79c0ff", selector: "7ee787", fn: "d2a8ff" }),
    colors: { "editor.background": "#0d1117", "editor.foreground": "#e6edf3", "editorLineNumber.foreground": "#6e7681", "editor.selectionBackground": "#264f78", "editor.lineHighlightBackground": "#6e76811a", "editorCursor.foreground": "#2f81f7" }
  },
  "github-light": {
    name: "GitHub Light", base: "vs", dark: false,
    ui: { bg: "#ffffff", side: "#f6f8fa", activity: "#f6f8fa", "activity-fg": "#636c76", "activity-fg-on": "#1f2328", title: "#f6f8fa", "title-fg": "#636c76", tabs: "#f6f8fa", tab: "#f6f8fa", "tab-active": "#ffffff",
      border: "#d0d7de", text: "#1f2328", "text-strong": "#000000", muted: "#636c76", hover: "#eaeef2", sel: "#0969da1a", "sel-inactive": "#eaeef2", input: "#ffffff", "input-border": "#d0d7de",
      menu: "#ffffff", panel: "#ffffff", accent: "#0969da", status: "#f6f8fa", "status-fg": "#636c76", "status-alt": "#f6f8fa", shadow: "0 6px 24px rgba(0,0,0,.15)", info: "#0969da" },
    rules: rules({ comment: "6e7781", keyword: "cf222e", string: "0a3069", number: "0550ae", type: "953800", ident: "1f2328", delim: "1f2328", tag: "116329", attr: "0550ae", prop: "0550ae", selector: "116329", fn: "8250df" }),
    colors: { "editor.background": "#ffffff", "editor.foreground": "#1f2328", "editorLineNumber.foreground": "#8c959f", "editor.lineHighlightBackground": "#eaeef280" }
  },
};

let defined = false;
export function defineThemes(monaco) {
  if (defined) return; defined = true;
  for (const [id, th] of Object.entries(THEMES)) monaco.editor.defineTheme("tc-" + id, { base: th.base, inherit: true, rules: th.rules, colors: th.colors });
}

const UI_VARS = ["bg","side","activity","activity-fg","activity-fg-on","title","title-fg","tabs","tab","tab-active","status","status-alt","status-fg","border","text","text-strong","muted","accent","hover","sel","sel-inactive","input","input-border","menu","panel","shadow","info"];
export function applyTheme(id, monaco) {
  const th = THEMES[id] || THEMES["dark-plus"];
  const st = document.documentElement.style;
  UI_VARS.forEach(v => st.removeProperty("--" + v));
  Object.entries(th.ui).forEach(([k, v]) => st.setProperty("--" + k, v));
  document.documentElement.style.colorScheme = th.dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = th.ui.title || "#3c3c3c";
  if (monaco) monaco.editor.setTheme("tc-" + (THEMES[id] ? id : "dark-plus"));
}
