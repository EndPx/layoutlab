// W1 isolated section server: serves experiments/warehouse-section at /,
// fixture-assets from the built warehouse-section GLBs, and three.js vendor
// files from the existing apps/web install. Loopback only. No app edits.
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const ROOT = "experiments/warehouse-section";
const GLB_DIR = "apps/web/public/assets/warehouse-section";
const THREE_DIR = "node_modules/three"; // workspace-hoisted existing install
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    let file;
    if (url.pathname === "/") file = join(ROOT, "index.html");
    else if (url.pathname.startsWith("/fixture-assets/")) file = join(GLB_DIR, url.pathname.slice(16));
    else if (url.pathname.startsWith("/vendor/three/")) file = join(THREE_DIR, url.pathname.slice(13));
    else if (url.pathname === "/index.html" || url.pathname === "/main.js" || url.pathname === "/fixture.json") {
      file = join(ROOT, url.pathname.slice(1));
    } else {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    file = normalize(file);
    const st = statSync(file);
    if (!st.isFile()) throw new Error("not a file");
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "content-length": st.size });
    res.end(readFileSync(file));
  } catch (e) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
const port = Number(process.env.W1_PORT || 5183);
server.listen(port, "127.0.0.1", () => console.log(`W1-SECTION: http://127.0.0.1:${port}/`));
