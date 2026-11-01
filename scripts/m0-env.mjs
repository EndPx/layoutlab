// M0 environment diagnostic: versions, env-var presence (never values), URL reachability.
// Usage: node scripts/m0-env.mjs
// Exit 0 always; prints JSON to stdout. No secrets printed, no writes.
import { execSync } from "node:child_process";

const out = { generatedAt: new Date().toISOString(), versions: {}, envPresence: {}, urls: [] };

function cmd(bin, args) {
  try {
    return execSync([bin, ...args].join(" "), { encoding: "utf8", timeout: 15000, shell: "cmd.exe", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0];
  } catch (e) {
    return `UNAVAILABLE: ${(e.shortMessage || e.message || "").split("\n")[0]}`;
  }
}

out.versions = {
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  npm: cmd("npm", ["--version"]),
  pnpm: cmd("pnpm", ["--version"]),
  git: cmd("git", ["--version"]),
  python: cmd("python", ["--version"]),
  curl: cmd("curl.exe", ["--version"]),
  npx: cmd("npx", ["--version"]),
  tsc: cmd("tsc", ["--version"]),
};

// Presence only: never print values.
for (const n of ["META_API_BASE_URL", "META_MODEL_ID", "MODEL_API_KEY", "META_API_KEY", "HUGGINGFACE_HUB_TOKEN", "HF_TOKEN"]) {
  const v = process.env[n];
  out.envPresence[n] = v == null || v === "" ? "ABSENT" : `PRESENT (len=${v.length})`;
}

const urls = [
  "https://dev.meta.ai/events/global-hackathon",
  "https://dev.meta.ai/docs/overview",
  "https://dev.meta.ai/docs/quickstart",
  "https://dev.meta.ai/docs/protocols",
  "https://huggingface.co/spaces/nvidia/simready-central",
  "https://docs.omniverse.nvidia.com/simready/latest/simready-central.html",
  "https://huggingface.co/datasets/nvidia/simready-assets",
  "https://github.com/NVIDIA/simready-foundation",
  "https://huggingface.co/docs/huggingface_hub/guides/download",
  "https://openusd.org/release/api/group___usd_geom_linear_units__group.html",
  "https://creativecommons.org/licenses/by/4.0/",
  "https://registry.npmjs.org/typescript/latest",
];
for (const u of urls) {
  const row = { url: u, ok: false, status: null, ms: null, note: "" };
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(u, { method: "GET", redirect: "follow", signal: ctrl.signal, headers: { "user-agent": "LayoutLab-M0-diagnostic" } });
    clearTimeout(t);
    row.ms = Date.now() - t0;
    row.status = r.status;
    row.ok = r.ok;
    if (!r.ok) row.note = r.statusText;
    await r.arrayBuffer().catch(() => {});
  } catch (e) {
    row.ms = Date.now() - t0;
    row.note = `FETCH_FAIL: ${(e.cause?.message || e.message || "").slice(0, 120)}`;
  }
  out.urls.push(row);
}

console.log(JSON.stringify(out, null, 2));
