#!/usr/bin/env node
// raw/galaxy/serve.mjs — a tiny local server for ARC GALAXY screenshots: the repo's static files + the live feed.
//   node raw/galaxy/serve.mjs   → http://localhost:9055/galaxy   (GET /api/social?arc=galaxy reads Arc's public RPC)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { galaxy } from "../../api/_arc-galaxy.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".mp4": "video/mp4", ".ico": "image/x-icon" };
const PORT = +(process.env.PORT || 9055);

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/api/social" && u.searchParams.get("arc") === "galaxy") {
      const j = await galaxy();
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(j));
    }
    let p = decodeURIComponent(u.pathname);
    if (p === "/" || p === "/galaxy") p = "/galaxy.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
    const st = fs.statSync(f, { throwIfNoEntry: false });
    if (!st || !st.isFile()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    console.error(req.url, e);
    res.writeHead(500, { "content-type": "text/plain" }); res.end(String(e && e.message || e));
  }
}).listen(PORT, () => console.log("ARC GALAXY on http://localhost:" + PORT + "/galaxy"));
