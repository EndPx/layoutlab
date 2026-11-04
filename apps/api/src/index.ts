// API entrypoint: loopback by default, no inference on startup, never logs keys.
// `npm start` serves the built planner and /api on this one origin; without a
// web build the API still runs and GET / explains the setup step.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { liveAvailable, loadConfig, loadEnvFileInto } from "./config.js";
import { createApp, hasWebBuild, WEB_BUILD_GUIDANCE } from "./server.js";

// Server-only root .env (user-filled key/model). Explicit process env wins;
// a missing file simply yields setup_required status downstream.
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..", "..", "..");
loadEnvFileInto(process.env, join(projectRoot, ".env"));

// Module-relative on purpose: production static resolution must not depend
// on the caller's working directory.
const webDir = join(projectRoot, "apps", "web", "dist");
const webBuilt = hasWebBuild(webDir);

const config = loadConfig();
const { app } = createApp({ config, webDir });
const server = app.listen(config.port, config.host, () => {
  // Deliberately omit apiKey and any Authorization material.
  console.log(
    JSON.stringify({
      event: "layoutlab-api-listen",
      host: config.host,
      port: config.port,
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      providerKind: config.providerKind,
      liveAvailable: liveAvailable(config).ok,
      configurationStatus: liveAvailable(config).ok ? "configured-not-tested" : "setup-required",
      web: webBuilt ? "built" : "missing",
      budgets: { maxProposals: config.maxProposals, maxRequests: config.maxRequests, timeoutMs: config.timeoutMs },
      concurrency: config.concurrency,
    }),
  );
  if (!webBuilt) {
    for (const line of WEB_BUILD_GUIDANCE.trim().split("\n")) {
      console.error(`layoutlab-api: ${line}`);
    }
  }
});
server.on("error", (e: Error) => {
  console.error(`layoutlab-api failed: ${e.message.slice(0, 300)}`);
  process.exitCode = 1;
});
