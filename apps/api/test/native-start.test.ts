// M6B native-start tests: one same-origin server serves the built planner and
// /api. Fixture web roots only (no web build required); the real dist is
// covered by the production browser smoke. No inference anywhere here.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, type ApiConfig } from "../src/config.js";
import type { FetchLike } from "../src/provider.js";
import { createApp } from "../src/server.js";

// Pinned derivative hash/bytes from assets/manifests/rack_large_empty_a01.manifest.json.
const PINNED_GLB_SHA256 = "571cc601bbbf8759977e05c5104a1d9381a682d2537942a238c68ebf8f8ae9ea";
const PINNED_GLB_BYTES = 3176476;
const OUTSIDE_SECRET = "m6b-outside-secret-not-served";
const DOTFILE_SECRET = "m6b-dotfile-secret-not-served";

function rootDir(): string {
  return dirname(dirname(dirname(fileURLToPath(new URL(".", import.meta.url)))));
}

function emptyKeyConfig(): ApiConfig {
  // Explicit empty key wins over any ambient value: deterministic setup_required.
  return loadConfig({ ...process.env, MODEL_API_KEY: "" });
}

function fixtureWeb(): { webDir: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), "layoutlab-m6b-"));
  const webDir = join(base, "web");
  const assets = join(webDir, "assets");
  mkdirSync(assets, { recursive: true });
  cpSync(
    join(rootDir(), "apps", "web", "public", "assets", "rack_large_empty_a01.glb"),
    join(assets, "rack_large_empty_a01.glb"),
  );
  writeFileSync(join(webDir, "index.html"), "<!doctype html><title>LayoutLab</title><div id=\"root\">M6B-FIXTURE-SHELL</div>");
  writeFileSync(join(assets, "app.js"), "console.log(\"M6B-FIXTURE-ASSET\");");
  writeFileSync(join(webDir, ".env"), `MODEL_API_KEY=${DOTFILE_SECRET}`);
  writeFileSync(join(base, "outside-secret.txt"), OUTSIDE_SECRET);
  return { webDir, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

async function startApi(config: ApiConfig, webDir?: string, fetchImpl?: FetchLike): Promise<{ apiUrl: string; port: number; webBuilt: boolean; close: () => Promise<void> }> {
  const built = createApp({
    config,
    ...(webDir !== undefined ? { webDir } : {}),
    ...(fetchImpl !== undefined ? { fetchImpl } : {}),
  });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = built.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    apiUrl: `http://127.0.0.1:${port}`,
    port,
    webBuilt: built.webBuilt,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const closers: (() => Promise<void>)[] = [];
const cleanups: (() => void)[] = [];
afterEach(async () => {
  while (closers.length > 0) {
    const c = closers.pop() as () => Promise<void>;
    await c().catch(() => {});
  }
  while (cleanups.length > 0) {
    const c = cleanups.pop() as () => void;
    try {
      c();
    } catch {
      // ignore cleanup failures
    }
  }
});

function rawGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("M6B same-origin built web", () => {
  it("serves the planner root as HTML with exact asset bytes", async () => {
    const fixture = fixtureWeb();
    cleanups.push(fixture.cleanup);
    const api = await startApi(emptyKeyConfig(), fixture.webDir);
    closers.push(api.close);
    expect(api.webBuilt).toBe(true);

    const root = await fetch(`${api.apiUrl}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toContain("text/html");
    expect(await root.text()).toContain("M6B-FIXTURE-SHELL");

    const asset = await fetch(`${api.apiUrl}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log(\"M6B-FIXTURE-ASSET\");");
  });

  it("serves the pinned GLB with model MIME and manifest hash", async () => {
    const fixture = fixtureWeb();
    cleanups.push(fixture.cleanup);
    const api = await startApi(emptyKeyConfig(), fixture.webDir);
    closers.push(api.close);

    const res = await fetch(`${api.apiUrl}/assets/rack_large_empty_a01.glb`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("model/gltf-binary");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.length).toBe(PINNED_GLB_BYTES);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(PINNED_GLB_SHA256);
  });

  it("404s every miss: no shell fallback for any path", async () => {
    const fixture = fixtureWeb();
    cleanups.push(fixture.cleanup);
    const api = await startApi(emptyKeyConfig(), fixture.webDir);
    closers.push(api.close);

    for (const path of ["/planner-view", "/assets/missing-chunk.js"]) {
      const miss = await fetch(`${api.apiUrl}${path}`);
      expect(miss.status).toBe(404);
      expect((await miss.json()) as Record<string, unknown>).toMatchObject({ code: "NOT_FOUND" });
    }
    const post = await fetch(`${api.apiUrl}/planner-view`, { method: "POST" });
    expect(post.status).toBe(404);
  });

  it("never discloses dotfiles or outside paths", async () => {
    const fixture = fixtureWeb();
    cleanups.push(fixture.cleanup);
    const api = await startApi(emptyKeyConfig(), fixture.webDir);
    closers.push(api.close);

    const dotfile = await fetch(`${api.apiUrl}/.env`);
    expect(dotfile.status).not.toBe(200);
    expect(await dotfile.text()).not.toContain(DOTFILE_SECRET);

    const normalized = await fetch(`${api.apiUrl}/outside-secret.txt`);
    expect(normalized.status).toBe(404);
    expect(await normalized.text()).not.toContain(OUTSIDE_SECRET);

    const traversal = await rawGet(api.port, "/assets/%2e%2e/%2e%2e/outside-secret.txt");
    expect(traversal.status).not.toBe(200);
    expect(traversal.body).not.toContain(OUTSIDE_SECRET);
  });
});

describe("M6B API behavior with and without a build", () => {
  it("returns JSON 404 for unknown /api routes, never the shell", async () => {
    const fixture = fixtureWeb();
    cleanups.push(fixture.cleanup);
    const api = await startApi(emptyKeyConfig(), fixture.webDir);
    closers.push(api.close);

    for (const path of ["/api", "/api/does-not-exist", "/api/runs/nope/report/extra"]) {
      const res = await fetch(`${api.apiUrl}${path}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect((await res.json()) as Record<string, unknown>).toMatchObject({ code: "UNKNOWN_API_ROUTE" });
    }
  });

  it("reports setup_required without a key and performs zero inference on startup/serving", async () => {
    const fixture = fixtureWeb();
    cleanups.push(fixture.cleanup);
    let fetchCalls = 0;
    const fetchImpl: FetchLike = (async () => {
      fetchCalls++;
      throw new Error("inference must not run");
    }) as unknown as FetchLike;
    const api = await startApi(emptyKeyConfig(), fixture.webDir, fetchImpl);
    closers.push(api.close);

    const status = await fetch(`${api.apiUrl}/api/status`);
    expect(status.status).toBe(200);
    const body = (await status.json()) as Record<string, unknown>;
    expect(body["status"]).toBe("setup_required");
    expect(body["liveAvailable"]).toBe(false);
    expect(body["reason"]).toContain("MODEL_API_KEY");
    expect(body["provider"]).toBe("meta");

    await fetch(`${api.apiUrl}/`);
    await fetch(`${api.apiUrl}/assets/app.js`);
    await fetch(`${api.apiUrl}/api/does-not-exist`);
    expect(fetchCalls).toBe(0);
  });

  it("serves the API with setup guidance when no web build exists", async () => {
    const empty = mkdtempSync(join(tmpdir(), "layoutlab-m6b-empty-"));
    cleanups.push(() => rmSync(empty, { recursive: true, force: true }));
    for (const webDir of [undefined, empty]) {
      const api = await startApi(emptyKeyConfig(), webDir);
      closers.push(api.close);
      expect(api.webBuilt).toBe(false);

      const root = await fetch(`${api.apiUrl}/`);
      expect(root.status).toBe(503);
      const guidance = await root.text();
      expect(guidance).toContain("npm run build");
      expect(guidance).toContain("npm start");

      const status = await fetch(`${api.apiUrl}/api/status`);
      expect(status.status).toBe(200);
      expect(((await status.json()) as Record<string, unknown>)["status"]).toBe("setup_required");

      const unknown = await fetch(`${api.apiUrl}/api/nope`);
      expect(unknown.status).toBe(404);
      expect((await unknown.json()) as Record<string, unknown>).toMatchObject({ code: "UNKNOWN_API_ROUTE" });
    }
  });
});
