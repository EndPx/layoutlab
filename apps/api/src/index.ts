// API entrypoint: loopback by default, no inference on startup, never logs keys.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig, loadEnvFileInto } from "./config.js";
import { createApp } from "./server.js";

// Server-only root .env (user-filled key/model). Explicit process env wins;
// a missing file simply yields setup_required status downstream.
const here = dirname(fileURLToPath(import.meta.url));
loadEnvFileInto(process.env, join(here, "..", "..", "..", ".env"));

const config = loadConfig();
const { app } = createApp({ config });
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
      liveAvailable: config.apiKeyPresent,
      budgets: { maxProposals: config.maxProposals, maxRequests: config.maxRequests, timeoutMs: config.timeoutMs },
      concurrency: config.concurrency,
    }),
  );
});
server.on("error", (e: Error) => {
  console.error(`layoutlab-api failed: ${e.message.slice(0, 300)}`);
  process.exitCode = 1;
});
