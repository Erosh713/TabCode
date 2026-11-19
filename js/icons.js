/* File icons: "Material Icon Theme" (vendor/icons, MIT) when the extension is on, simple glyphs otherwise */
import { ext, base, IMG_EXT } from "./util.js";

let material = true;
export const setMaterial = on => { material = on; };

const FILE_MAP = {
  html: "html", htm: "html", css: "css", scss: "sass", sass: "sass", less: "less", js: "javascript", mjs: "javascript", cjs: "javascript",
  jsx: "react", tsx: "react_ts", ts: "typescript", json: "json", md: "markdown", py: "python", php: "php", java: "java", c: "c", h: "c", cpp: "cpp",
  xml: "xml", svg: "svg", yml: "yaml", yaml: "yaml", vue: "vue", sh: "console", bat: "console", zip: "zip", pdf: "pdf",
  mp3: "audio", wav: "audio", ogg: "audio", mp4: "video", webm: "video", woff: "font", woff2: "font", ttf: "font", otf: "font", txt: "document"
};
const NAME_MAP = { "readme.md": "readme", "license": "license", "license.md": "license", ".gitignore": "git", "package.json": "settings" };
const FOLDER_MAP = { components: "components", css: "css", styles: "css", style: "css", images: "images", img: "images", image: "images", assets: "images",
  js: "javascript", javascript: "javascript", scripts: "scripts", script: "scripts", public: "public", src: "src", svg: "svg", icons: "svg", fonts: "font", font: "font" };

const img = name => `<span class="fi"><img src="vendor/icons/${name}.svg" alt=""></span>`;

export function fileIcon(p) {
  const e = ext(p);
  if (material) {
    const n = NAME_MAP[base(p).toLowerCase()] || FILE_MAP[e] || (IMG_EXT.includes(e) ? "image" : "file");
    return img(n);
  }
  if (["html", "htm", "vue"].includes(e)) return '<span class="fi fi-html">&lt;&gt;</span>';
  if (["css", "scss", "less", "sass"].includes(e)) return '<span class="fi fi-css">#</span>';
  if (["js", "mjs", "cjs", "jsx"].includes(e)) return '<span class="fi fi-js">JS</span>';
  if (["ts", "tsx"].includes(e)) return '<span class="fi fi-ts">TS</span>';
  if (e === "json") return '<span class="fi fi-json">{}</span>';
  if (IMG_EXT.includes(e) || e === "svg") return '<span class="fi fi-img">▣</span>';
  if (e === "md") return '<span class="fi fi-md">M↓</span>';
  if (e === "py") return '<span class="fi fi-py">py</span>';
  return '<span class="fi fi-txt">≡</span>';
}
export function folderIcon(name, open) {
  if (material) {
    const k = FOLDER_MAP[name.toLowerCase()];
    return img(k ? `folder-${k}${open ? "-open" : ""}` : `folder${open ? "-open" : ""}`);
  }
  return `<span class="fi fi-folder">${open ? "▾" : "▸"}</span>`;
}
