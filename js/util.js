/* Small helpers shared by every module */
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif"];
export const BIN_EXT = [...IMG_EXT, "woff", "woff2", "ttf", "otf", "mp3", "wav", "ogg", "mp4", "webm", "pdf", "zip"];
export const ext = p => { const b = p.split("/").pop(); const i = b.lastIndexOf("."); return i > 0 ? b.slice(i + 1).toLowerCase() : ""; };
export const base = p => p.split("/").pop();
export const dir = p => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
export const isHtml = p => ["html", "htm"].includes(ext(p));

const LANGS = { html: "html", htm: "html", css: "css", scss: "scss", sass: "scss", less: "less", js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", json: "json", md: "markdown", markdown: "markdown", py: "python", php: "php", java: "java", c: "c", h: "c", cpp: "cpp", cs: "csharp", xml: "xml", svg: "xml", sql: "sql", sh: "shell", yml: "yaml", yaml: "yaml", vue: "html", txt: "plaintext", rb: "ruby", go: "go", rs: "rust", kt: "kotlin", swift: "swift", lua: "lua", bat: "bat", ini: "ini", dart: "dart" };
export const LANG_NAMES = { html: "HTML", css: "CSS", scss: "SCSS", less: "Less", javascript: "JavaScript", typescript: "TypeScript", json: "JSON", markdown: "Markdown", python: "Python", php: "PHP", java: "Java", c: "C", cpp: "C++", csharp: "C#", xml: "XML", sql: "SQL", shell: "Shell", yaml: "YAML", plaintext: "Plain text", ruby: "Ruby", go: "Go", rust: "Rust", kotlin: "Kotlin", swift: "Swift", lua: "Lua", bat: "Batch", ini: "INI", dart: "Dart" };
export const langOf = p => LANGS[ext(p)] || "plaintext";

export const validName = n => !!n && !/[\\:*?"<>|]/.test(n) && !n.split("/").some(s => s === "" || s === "." || s === "..");
export const slug = s => (s || "projet").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").toLowerCase().slice(0, 90) || "projet";

/* Bytes / base64 / text */
export function bytesToB64(bytes) {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
export function b64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, "")); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", bmp: "image/bmp", avif: "image/avif", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf", zip: "application/zip" };
/* A file in a project is { k: "text", c: string } or { k: "image", c: dataURL } (any binary file uses k:"image") */
export function fileBytes(f) {
  if (f.k === "image") return b64ToBytes(f.c.slice(f.c.indexOf(",") + 1));
  return new TextEncoder().encode(f.c);
}
export function bytesToFile(path, bytes) {
  const e = ext(path);
  if (BIN_EXT.includes(e)) return { k: "image", c: `data:${MIME[e] || "application/octet-stream"};base64,${bytesToB64(bytes)}` };
  return { k: "text", c: new TextDecoder().decode(bytes) };
}
/* Git blob SHA-1 (same value GitHub uses), to know which files changed */
export async function gitSha(bytes) {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length); all.set(head); all.set(bytes, head.length);
  const h = await crypto.subtle.digest("SHA-1", all);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function readAs(file, how) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; how === "text" ? r.readAsText(file) : how === "buffer" ? r.readAsArrayBuffer(file) : r.readAsDataURL(file); });
}
export function timeAgo(ts, t) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return t("à l'instant");
  if (s < 3600) return t("il y a {n} min", { n: Math.floor(s / 60) });
  if (s < 86400) return t("il y a {n} h", { n: Math.floor(s / 3600) });
  return t("il y a {n} j", { n: Math.floor(s / 86400) });
}
