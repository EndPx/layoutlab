// Express app factory for M3. Same-origin only (no CORS wildcard); the Vite
// dev server proxies /api to this loopback API. All errors are sanitized.
import { CORE_VERSION } from "@layoutlab/core";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { API_VERSION, liveAvailable, loadConfig, sanitizeMessage, type ApiConfig } from "./config.js";
import { PROMPT_VERSION } from "./prompts.js";
import type { FetchLike } from "./provider.js";
import { RunStore, toSummary } from "./runs.js";

const createRunBody = z.strictObject({
  scenario: z.unknown(),
  requestText: z.string().min(1).max(2000),
  mode: z.literal("live"),
  consent: z.literal(true),
});

const approveBody = z.strictObject({ requirements: z.unknown() });

type RateEntry = { count: number; resetAt: number };

// Deterministic bounded fixed-window limiter: hard entry cap, expired sweep
// first, then earliest-reset eviction. No randomness, no unbounded growth.
class BoundedLimiter {
  private readonly entries = new Map<string, RateEntry>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly cap: number,
  ) {}

  take(key: string, now: number): boolean {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.insert(key, { count: 1, resetAt: now + this.windowMs }, now);
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }

  private insert(key: string, value: RateEntry, now: number): void {
    if (!this.entries.has(key) && this.entries.size >= this.cap) {
      for (const [k, v] of this.entries) {
        if (v.resetAt <= now) this.entries.delete(k);
      }
      if (this.entries.size >= this.cap) {
        let oldestKey: string | null = null;
        let oldestReset = Number.POSITIVE_INFINITY;
        for (const [k, v] of this.entries) {
          if (v.resetAt < oldestReset) {
            oldestReset = v.resetAt;
            oldestKey = k;
          }
        }
        if (oldestKey !== null) this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, value);
  }
}

export function createApp(opts: {
  config?: ApiConfig;
  fetchImpl?: FetchLike;
  trustProxy?: boolean;
} = {}): { app: express.Express; store: RunStore; config: ApiConfig } {
  const config = opts.config ?? loadConfig();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const store = new RunStore(config);
  const app = express();
  if (opts.trustProxy === true) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // Inference starts are strictly bounded; reads and cancellation get a
  // generous separate allowance so polling can never starve cancel/approve
  // visibility during a long run.
  const inferenceLimiter = new BoundedLimiter(config.rateMax, config.rateWindowMs, 1000);
  const safeLimiter = new BoundedLimiter(Math.max(300, config.rateMax * 10), config.rateWindowMs, 1000);
  app.use((req, _res, next) => {
    try {
      const key = (req.ip ?? "unknown").slice(0, 64);
      const inferenceStart =
        (req.method === "POST" && req.path === "/api/runs") ||
        (req.method === "POST" && req.path.endsWith("/approve"));
      const limiter = inferenceStart ? inferenceLimiter : safeLimiter;
      if (!limiter.take(key, Date.now())) {
        (next as unknown as (e: unknown) => void)(
          Object.assign(new Error("Rate limit exceeded; retry shortly."), { code: "RATE_LIMIT", status: 429 }),
        );
        return;
      }
      next();
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/status", (_req: Request, res: Response) => {
    const live = liveAvailable(config);
    res.json({
      liveAvailable: live.ok,
      reason: live.reason,
      status: live.ok ? "ready" : "setup_required",
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      promptVersion: PROMPT_VERSION,
      apiVersion: API_VERSION,
      coreVersion: CORE_VERSION,
      budgets: { maxProposals: config.maxProposals, maxRequests: config.maxRequests, timeoutMs: config.timeoutMs },
      concurrency: config.concurrency,
      provider: "meta",
      providerKind: config.providerKind,
    });
  });

  app.post("/api/runs", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const live = liveAvailable(config);
      if (!live.ok) {
        res.status(503).json({ status: "setup_required", reason: live.reason, provider: "meta" });
        return;
      }
      const parsed = createRunBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          code: "BAD_REQUEST",
          message:
            "Body must be { scenario, requestText (1..2000 chars), mode: 'live', consent: true }. Live inference requires explicit selection and privacy consent.",
        });
        return;
      }
      // Prompt ID: the run exists (INTERPRETING) before inference finishes,
      // so the first request is cancellable by ID. Same ID, request count,
      // and deadline continue across approval. The 202 snapshot is taken
      // before the background task counts its attempt (deterministic 0).
      const record = store.createRun(parsed.data.scenario, parsed.data.requestText);
      const snapshot = toSummary(record, config);
      store.startInterpretation(record, fetchImpl);
      res.status(202).json(snapshot);
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/runs/:id", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const record = store.get(req.params["id"] as string);
      if (!record) {
        res.status(404).json({ code: "UNKNOWN_RUN", message: "Unknown run id." });
        return;
      }
      res.json(toSummary(record, config));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/runs/:id/approve", async (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const parsed = approveBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ code: "BAD_REQUEST", message: "Body must be { requirements }." });
        return;
      }
      const record = await store.approveRun(req.params["id"] as string, parsed.data.requirements, fetchImpl);
      res.json(toSummary(record, config));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/runs/:id/cancel", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const record = store.cancel(req.params["id"] as string);
      res.json(toSummary(record, config));
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/runs/:id/report", (_req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const id = _req.params["id"] as string;
      const envelope = store.buildReport(id);
      res.json(envelope);
    } catch (e) {
      next(e);
    }
  });

  // Body-limit and route errors land here; always sanitized, never echo keys.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: (e: unknown) => void) => {
    const e = err as Error & { code?: string; status?: number; type?: string };
    const raw = e instanceof Error ? e.message : "Request failed.";
    const message = sanitizeMessage(raw, config);
    if (e?.type === "entity.too.large") {
      res.status(413).json({ code: "BODY_TOO_LARGE", message: "Request body exceeds 1 MB." });
      return;
    }
    if (e instanceof SyntaxError && "body" in (e as unknown as Record<string, unknown>)) {
      res.status(400).json({ code: "BAD_JSON", message: "Request body is not valid JSON." });
      return;
    }
    const code = e?.code ?? "INTERNAL_ERROR";
    const status =
      e?.status ??
      (code === "UNKNOWN_RUN"
        ? 404
        : code === "BAD_REQUIREMENTS" || code === "BAD_REQUEST" || code === "UNRESOLVED_QUESTIONS"
          ? 400
          : code === "RUN_EXPIRED"
            ? 408
            : code === "RUN_CLOSED" || code === "RUN_NOT_COMPLETED"
              ? 409
              : code === "CONCURRENCY_LIMIT" || code === "RATE_LIMIT" || code === "RUN_STORE_FULL"
                ? 429
                : 500);
    // Map zod/core parse failures on scenario input to 400 with a clear message.
    if (!e?.code && /invalid|required|expected|duplicate|reserved|too many/i.test(raw)) {
      res.status(400).json({ code: "BAD_SCENARIO", message: message.slice(0, 1000) });
      return;
    }
    res.status(status).json({ code, message: message.slice(0, 1000) });
  });

  return { app, store, config };
}
