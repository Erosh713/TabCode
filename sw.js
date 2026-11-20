/* TabCode service worker: offline cache + virtual "Live Server" (live/<projectId>/<file>). */
"use strict";
importScripts("js/db.js");

const VERSION = "96e86a09ef1d"; // replaced by tools/build.py
const CACHE = "tabcode-" + VERSION;
const SCOPE = new URL(self.registration.scope);
const LIVE = SCOPE.pathname + "live/";   // Live Server window (auto reload)
const EMBED = SCOPE.pathname + "embed/"; // preview inside TabCode (console bridge)

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const res = await fetch("precache.json", { cache: "no-store" });
    const list = (await res.json()).files;
    const cache = await caches.open(CACHE);
    // Add in small batches so one slow file does not block everything
    for (let i = 0; i < list.length; i += 20) {
      await cache.addAll(list.slice(i, i + 20).map(f => new Request(f, { cache: "reload" })));
    }
    // First install: activate right away. Updates wait for the user to accept.
    if (!self.registration.active) self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("tabcode-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin) return; // GitHub API, etc.
  if (url.pathname.startsWith(LIVE)) { event.respondWith(serveLive(url, LIVE, false)); return; }
  if (url.pathname.startsWith(EMBED)) { event.respondWith(serveLive(url, EMBED, true)); return; }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === "navigate") {
        const shell = await cache.match("index.html") || await cache.match("./");
        if (shell) return shell;
      }
      return new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

/* ---------------- Live Server ---------------- */
const TYPES = {
  html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", jsx: "text/javascript",
  json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", ico: "image/x-icon", avif: "image/avif", bmp: "image/bmp", txt: "text/plain", md: "text/markdown",
  xml: "application/xml", csv: "text/csv", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf"
};
const extOf = p => { const b = p.split("/").pop(); const i = b.lastIndexOf("."); return i > 0 ? b.slice(i + 1).toLowerCase() : ""; };

function dataUrlToBytes(u) {
  const comma = u.indexOf(",");
  const meta = u.slice(5, comma), data = u.slice(comma + 1);
  if (!/;base64/i.test(meta)) return { mime: meta.split(";")[0], bytes: new TextEncoder().encode(decodeURIComponent(data)) };
  const bin = atob(data); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: meta.split(";")[0], bytes };
}

const EMBED_BRIDGE = `<script>(function(){
function f(v){try{if(v instanceof Error)return v.name+": "+v.message;if(typeof Element!=="undefined"&&v instanceof Element)return v.outerHTML.slice(0,300);if(typeof v==="object"&&v!==null)return JSON.stringify(v,null,2);if(typeof v==="undefined")return "undefined";return String(v)}catch(e){return String(v)}}
function s(l,a){try{parent.postMessage({__tabcode:1,type:"console",level:l,args:[].map.call(a,f)},"*")}catch(e){}}
["log","info","warn","error","debug","table"].forEach(function(l){var o=console[l];console[l]=function(){s(l==="debug"||l==="table"?"log":l,arguments);try{o&&o.apply(console,arguments)}catch(e){}}});
addEventListener("error",function(e){s("error",[(e.message||"Erreur")+(e.filename?" — "+e.filename.split("/").pop()+":"+e.lineno:"")])});
addEventListener("unhandledrejection",function(e){s("error",["Promise: "+f(e.reason)])});
addEventListener("message",function(e){var d=e.data;if(!d||!d.__tabcode||d.type!=="eval")return;try{var r=(0,eval)(d.code);parent.postMessage({__tabcode:1,type:"result",value:f(r)},"*")}catch(err){parent.postMessage({__tabcode:1,type:"console",level:"error",args:[f(err)]},"*")}});
document.addEventListener("keydown",function(e){var c=e.ctrlKey||e.metaKey,k=(e.key||"").toLowerCase();if((c&&"psbj,".indexOf(k)>=0&&k.length===1)||(c&&k==="enter")||(c&&e.shiftKey&&"vfe".indexOf(k)>=0)||e.key==="F1"||(e.altKey&&k==="n")){e.preventDefault();parent.postMessage({__tabcode:1,type:"key",key:e.key,ctrl:c,shift:e.shiftKey,alt:e.altKey},"*")}},true);
parent.postMessage({__tabcode:1,type:"loaded",path:location.pathname},"*");
})();<\/script>`;

const liveReload = id => `<script>(function(){try{var bc=new BroadcastChannel("tabcode-live");bc.onmessage=function(e){var d=e.data;if(d&&d.type==="reload"&&d.project===${JSON.stringify(id)})location.reload()}}catch(e){}})();<\/script>`;

function inject(html, snippet) {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + snippet);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => m + snippet);
  return snippet + html;
}

function page(status, title, body) {
  return new Response(`<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font:15px/1.5 system-ui,sans-serif;color:#333;max-width:520px;margin:12vh auto;padding:0 20px"><h1 style="font-size:20px">${title}</h1>${body}</body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function serveLive(url, prefix, embed) {
  const rest = url.pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  const id = decodeURIComponent(slash < 0 ? rest : rest.slice(0, slash));
  if (slash < 0) return Response.redirect(url.href + "/", 302);
  let path = rest.slice(slash + 1);
  try { path = decodeURIComponent(path); } catch (e) {}
  let project;
  try { project = await TCDB.get("projects", id); } catch (e) {}
  if (!project) return page(404, "Projet introuvable", "<p>Ce projet n'existe plus dans TabCode sur cet appareil.</p>");
  const files = project.files || {};
  const candidates = path === "" || path.endsWith("/") ? [path + "index.html", path + "index.htm"] : [path, path + ".html", path + "/index.html"];
  const found = candidates.find(c => files[c]);
  if (!found) {
    return page(404, "Fichier introuvable : " + path.replace(/</g, "&lt;"),
      `<p>Le fichier <code>${path.replace(/</g, "&lt;")}</code> n'existe pas dans le projet « ${String(project.name).replace(/</g, "&lt;")} ».</p><p style="color:#777">Vérifie le nom et le dossier dans ton lien (majuscules comprises).</p>`);
  }
  if (found !== path && !path.endsWith("/") && found.endsWith("/index.html")) return Response.redirect(url.href + "/", 302);
  const f = files[found];
  const ext = extOf(found);
  const headers = { "Cache-Control": "no-store", "Content-Type": (TYPES[ext] || "application/octet-stream") };
  if (f.k === "image") {
    const { mime, bytes } = dataUrlToBytes(f.c);
    headers["Content-Type"] = mime || headers["Content-Type"];
    return new Response(bytes, { headers });
  }
  if (/^text\/|json|xml|javascript|svg/.test(headers["Content-Type"])) headers["Content-Type"] += "; charset=utf-8";
  let body = f.c;
  if (ext === "html" || ext === "htm") body = inject(body, embed ? EMBED_BRIDGE : liveReload(id));
  return new Response(body, { headers });
}
