// Cargo-C1 isolated diagnostic server: serves experiments/warehouse-cargo-section
// at /, fixture GLBs from apps/web/public/assets/warehouse-cargo (+ TEMP
// scratch cargo-*.glb allowlist for pre-integration inspection), and three.js
// vendor files from the existing workspace-hoisted install. Loopback only.
// No app edits. Port: CARGOC1_PORT (default 5191; 5173 dev + 5183 W1 taken).
import { createServer } from "node:http";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join, normalize, basename } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "experiments/warehouse-cargo-section";
const GLB_DIR = "apps/web/public/assets/warehouse-cargo";
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
    else if (url.pathname.startsWith("/fixture-assets/")) {
      const name = basename(url.pathname.slice(16));
      if (!/^[a-z0-9][a-z0-9_.-]*\.glb$/.test(name)) throw new Error("bad name");
      const shipped = join(GLB_DIR, name);
      const scratch = join(tmpdir(), name);
      if (existsSync(shipped)) file = shipped;
      else if (name.startsWith("cargo-") && existsSync(scratch)) file = scratch;
      else throw new Error("not found");
    } else if (url.pathname.startsWith("/section-assets/")) {
      const secName = basename(url.pathname.slice(16));
      if (!/^[a-z0-9][a-z0-9_.-]*\.glb$/.test(secName)) throw new Error("bad name");
      file = join("apps/web/public/assets/warehouse-section", secName);
    } else if (url.pathname.startsWith("/vendor/three/")) file = join(THREE_DIR, url.pathname.slice(13));
    else if (/^\/(index\.html|main\.js|[a-z0-9_-]+\.json)$/i.test(url.pathname)) {
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
const port = Number(process.env.CARGOC1_PORT || 5191);
server.listen(port, "127.0.0.1", () => console.log(`CARGOC1-DIAG: http://127.0.0.1:${port}/`));
