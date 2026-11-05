import { LayoutInvestigationStore, parseLayoutInvestigationInput, parseLayoutApproval, verifyLayoutInvestigationExport } from "./layout-investigations.js";
// Express app factory for M3 (+M6B same-origin production). Same-origin only
// (no CORS wildcard); the Vite dev server proxies /api to this loopback API
// in development, while `npm start` serves the built web from this same app.
// All errors are sanitized.
import { CORE_VERSION, ROUTE_POLICY_ID } from "@layoutlab/core";
import { CURRENT_IMPLEMENTATION_VERSION } from "@layoutlab/simulation";
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { API_VERSION, liveAvailable, loadConfig, sanitizeMessage, type ApiConfig } from "./config.js";
import { PROMPT_VERSION } from "./prompts.js";
import { createBudgetGuard, BudgetGuardError, type BudgetGuard } from "./budget-guard.js";
import { proposePatch, runExperiment, validatePatch } from "./operations-api.js";
import {
  InvestigationStore,
  parseInvestigationInput,
  verifyInvestigationExport,
  type InvestigationRecord,
} from "./operations-investigations.js";
import { generationSettingsOf, type FetchLike } from "./provider.js";
import { RunStore, toSummary, type RunRecord } from "./runs.js";

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

// Setup guidance when the API runs without a built web (dev before build, or
// `npm start` before `npm run build`): explicit 503, never a blank success.
export const WEB_BUILD_GUIDANCE =
  "LayoutLab web build not found.\n" +
  "The API is running, but the planner UI was not built.\n" +
  "Run `npm run build` from the repository root, then restart with `npm start`.\n" +
  "API status: GET /api/status\n";

// A web build counts only when its entry point exists; an empty or partial
// directory is the same guidance case as a missing one.
export function hasWebBuild(webDir: string | undefined): webDir is string {
  return typeof webDir === "string" && webDir !== "" && existsSync(join(webDir, "index.html"));
}

export function createApp(opts: {
  config?: ApiConfig;
  fetchImpl?: FetchLike;
  trustProxy?: boolean;
  budgetGuard?: BudgetGuard;
  // Built web root (apps/web/dist). Absent or unbuilt: the API still serves
  // every /api route and answers GET / with setup guidance (dev parity).
  webDir?: string;
} = {}): { app: express.Express; store: RunStore; config: ApiConfig; webBuilt: boolean } {
  const config = opts.config ?? loadConfig();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const budgetGuard: BudgetGuard | null =
    config.publicBudgetMode === "unlimited" ? null : opts.budgetGuard ??
    (config.budgetStateFile !== ""
      ? createBudgetGuard({ filePath: config.budgetStateFile, capUsd: config.publicBudgetUsd })
      : null);
  // Legacy runs hold ONE reservation for interpretation + approval proposals.
  // The map only locates the claim; authorization is the persisted entry,
  // revalidated from disk before every dispatch (see assertRunDispatch).
  const runReservations = new Map<string, string>();
  const assertRunDispatch = (record: RunRecord): void => {
    if (!budgetGuard) return;
    const reservationId = runReservations.get(record.id);
    if (!reservationId) {
      throw new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, "run has no budget reservation; refusing inference");
    }
    budgetGuard.assertReservation(reservationId, config.publicBudgetPerRunUsd);
  };
  const store = new RunStore(config, assertRunDispatch);
  // Shared synchronous paid-inference lease: legacy runs own
  // RunStore.activeInference during their inference phases, investigations
  // own their RUNNING lifetime, and the one-shot proposal route owns
  // oneShotInFlight for its single dispatch. Every paid route checks all
  // holders synchronously before dispatching, so at the configured
  // concurrency of 1 the provider-call peak stays 1 across routes.
  let oneShotInFlight = 0;
  let layoutAdmissionPending = false;
  const layoutClaims = new Map<string, string>();
  const layoutOwners = new Set<string>();
  const layoutBusy = () => layoutAdmissionPending || layoutOwners.size > 0;
  const layouts = new LayoutInvestigationStore(config, {
    isLegacyBusy: () => store.activeInference > 0 || oneShotInFlight > 0 || investigations.hasActive(),
    beforeDispatch: record => {
      if (!budgetGuard) return;
      const claim = layoutClaims.get(record.report.runId);
      if (!claim) throw new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, "Missing layout reservation");
      budgetGuard.assertReservation(claim, config.publicBudgetPerRunUsd);
    },
    onTerminal: record => {
      const id = record.report.runId;
      const settle = () => {
        const claim = layoutClaims.get(id);
        try {
          if (budgetGuard && claim) {
            if (record.report.modelRequestsUsed === 0) budgetGuard.release(claim);
            else budgetGuard.commit(claim);
          }
          layoutClaims.delete(id);
          layoutOwners.delete(id);
        } catch { /* Fail closed: retain counted claim and ownership. */ }
      };
      // Cancellation can abort a transport before its promise settles.
      // Keep ownership until all work using that transport has unwound.
      if (record.task) void record.task.then(settle, settle);
      else settle();
    },
  });
  // E4a investigations hold ONE durable claim for the whole loop (not one
  // per model request). The map only locates the claim; authorization is
  // the persisted entry, revalidated before every dispatch.
  const investigationReservations = new Map<string, string>();
  const assertInvestigationDispatch = (record: InvestigationRecord): void => {
    if (!budgetGuard) return;
    const reservationId = investigationReservations.get(record.id);
    if (!reservationId) {
      throw new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, "investigation has no budget reservation; refusing inference");
    }
    budgetGuard.assertReservation(reservationId, config.publicBudgetPerRunUsd);
  };
  const investigations = new InvestigationStore(config, {
    beforeDispatch: assertInvestigationDispatch,
    isLegacyBusy: () => store.activeInference > 0 || oneShotInFlight > 0 || layoutBusy(),
  });
  const paidInferenceBusy = (): boolean =>
    layoutBusy() || layouts.hasActive() || oneShotInFlight > 0 || store.activeInference > 0 || investigations.hasActive();
  const settleInvestigationReservation = (investigationId: string): void => {
    if (!budgetGuard) return;
    const reservationId = investigationReservations.get(investigationId);
    if (!reservationId) return;
    const record = investigations.get(investigationId);
    if (!record || record.state === "RUNNING") return;
    try {
      // Zero dispatched requests = provably no upstream call: release.
      // Any dispatched request (incl. timeout/cancel/malformed) commits.
      if (record.modelRequestsUsed === 0) budgetGuard.release(reservationId);
      else budgetGuard.commit(reservationId);
      investigationReservations.delete(investigationId);
    } catch {
      try {
        const entry = budgetGuard.snapshot().entries.find((e) => e.id === reservationId);
        if (entry && entry.state !== "reserved") investigationReservations.delete(investigationId);
      } catch {
        // Guard unavailable: the reserved claim stays counted, never refunded.
      }
    }
  };
  const settleRunReservation = (runId: string): void => {
    if (!budgetGuard) return;
    const reservationId = runReservations.get(runId);
    if (!reservationId) return;
    const record = store.get(runId);
    if (!record) return;
    const terminalState =
      record.state === "COMPLETED" || record.state === "FAILED" ||
      record.state === "CANCELLED" || record.state === "TIMED_OUT";
    if (!terminalState) return;
    try {
      // Zero counted attempts = verifiably no provider dispatch: release.
      // Any counted attempt (incl. ambiguous timeout) commits the bound.
      if (record.modelRequestsUsed === 0) budgetGuard.release(reservationId);
      else budgetGuard.commit(reservationId);
      runReservations.delete(runId);
    } catch {
      try {
        const entry = budgetGuard.snapshot().entries.find((e) => e.id === reservationId);
        if (entry && entry.state !== "reserved") runReservations.delete(runId);
      } catch {
        // Guard unavailable: the reserved claim stays counted, never refunded.
      }
    }
  };
  const budgetUsable = (): { ok: boolean; reason: string | null } => {
    if (!budgetGuard) return { ok: true, reason: null };
    try {
      budgetGuard.snapshot();
      return { ok: true, reason: null };
    } catch {
      return { ok: false, reason: "Public budget guard unavailable; refusing to spend." };
    }
  };
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
        (req.method === "POST" && req.path === "/api/operations/layout-investigations") ||
        (req.method === "POST" && req.path === "/api/runs") ||
        (req.method === "POST" && req.path === "/api/operations/investigations") ||
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
    const baseLive = liveAvailable(config);
    const budget = budgetUsable();
    const live = baseLive.ok && budget.ok
      ? baseLive
      : { ok: false, reason: baseLive.ok ? budget.reason : baseLive.reason };
    res.json({
      liveAvailable: live.ok,
      budgetMode: config.publicBudgetMode ?? "capped",
      budgetGuard: config.publicBudgetMode === "unlimited" ? "unlimited" : !budgetGuard ? "not_configured" : budget.ok ? "active" : "unavailable",
      reason: live.reason,
      status: live.ok ? "ready" : "setup_required",
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      promptVersion: PROMPT_VERSION,
      apiVersion: API_VERSION,
      coreVersion: CORE_VERSION,
      operationsImplementationVersion: CURRENT_IMPLEMENTATION_VERSION,
      budgets: { maxProposals: config.maxProposals, maxRequests: config.maxRequests, timeoutMs: config.timeoutMs },
      concurrency: config.concurrency,
      provider: config.providerKind === "gater" ? "gater" : "meta",
      providerKind: config.providerKind,
      // Exact non-secret server settings: the benchmark live fingerprint
      // checks these against the frozen protocol before every trial, because
      // local .env alone cannot prove what the running server enforces.
      generationSettings: generationSettingsOf(config),
      contextCaps: {
        maxContextChars: config.maxContextChars,
        maxResponseBytes: config.maxResponseBytes,
      },
      routePolicy: ROUTE_POLICY_ID,
      heuristicMaxEvaluations: config.heuristicMaxEvaluations,
    });
  });

  app.post("/api/runs", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const live = liveAvailable(config);
      if (!live.ok) {
        res.status(503).json({ status: "setup_required", reason: live.reason, provider: config.providerKind === "gater" ? "gater" : "meta" });
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
      // Shared inference concurrency: a running investigation or an
      // in-flight one-shot proposal holds the slot.
      if (layoutBusy() || investigations.hasActive() || oneShotInFlight > 0) {
        res.status(429).json({ code: "CONCURRENCY_LIMIT", message: "Server is busy (concurrency limit); retry shortly." });
        return;
      }
      // Guard first: ONE durable reservation covers the whole bounded run
      // (interpretation + approval proposals) before any upstream call.
      // Local validation failures inside createRun release it again because
      // no provider attempt has been counted at that point.
      let reservationId: string | null = null;
      if (budgetGuard) {
        reservationId = `run:${randomUUID()}`;
        budgetGuard.reserve(reservationId, config.publicBudgetPerRunUsd);
      }
      let record;
      try {
        record = store.createRun(parsed.data.scenario, parsed.data.requestText);
      } catch (e) {
        if (budgetGuard && reservationId) {
          try { budgetGuard.release(reservationId); } catch { /* claim stays counted */ }
        }
        throw e;
      }
      if (reservationId) runReservations.set(record.id, reservationId);
      // Prompt ID: the run exists (INTERPRETING) before inference finishes,
      // so the first request is cancellable by ID. Same ID, request count,
      // and deadline continue across approval. The 202 snapshot is taken
      // before the background task counts its attempt (deterministic 0).
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
      settleRunReservation(record.id);
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
      const runId = req.params["id"] as string;
      if ((layoutBusy() || investigations.hasActive() || oneShotInFlight > 0) && store.get(runId)?.state === "AWAITING_APPROVAL") {
        res.status(429).json({ code: "CONCURRENCY_LIMIT", message: "Server is busy (concurrency limit); retry shortly." });
        return;
      }
      // Approval spends only against the run's persisted reservation,
      // revalidated from disk here and again before each proposal dispatch.
      // Refusal here leaves the run AWAITING_APPROVAL and the claim held,
      // so restoring the ledger allows the same approval to proceed.
      if (budgetGuard) {
        const existing = store.get(runId);
        if (existing && existing.state === "AWAITING_APPROVAL") assertRunDispatch(existing);
      }
      let record;
      try {
        record = await store.approveRun(runId, parsed.data.requirements, fetchImpl);
      } catch (e) {
        settleRunReservation(runId);
        throw e;
      }
      settleRunReservation(runId);
      res.json(toSummary(record, config));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/runs/:id/cancel", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const record = store.cancel(req.params["id"] as string);
      settleRunReservation(record.id);
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

  app.get("/api/runs/:id/failure-report", (_req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const id = _req.params["id"] as string;
      const envelope = store.buildFailureRecord(id);
      res.json(envelope);
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/budget", (_req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      if (config.publicBudgetMode === "unlimited") {
        res.json({ mode: "unlimited", guard: "unlimited", capUsd: null, reservedUsd: null, committedUsd: null, availableUsd: null, perRunReservationUsd: null, accounting: "No total allowance limit; per-run limits apply. Provider billing still applies; monetary totals unavailable." });
        return;
      }
      if (!budgetGuard) {
        res.json({
          mode: "capped",
          guard: "not_configured",
          publicBudgetUsd: config.publicBudgetUsd,
          perRunReservationUsd: config.publicBudgetPerRunUsd,
        });
        return;
      }
      const snap = budgetGuard.snapshot();
      res.json({
        mode: "capped",
        guard: "active",
        perRunReservationUsd: config.publicBudgetPerRunUsd,
        capUsd: snap.capMicroUsd / 1_000_000,
        reservedUsd: snap.reservedMicroUsd / 1_000_000,
        committedUsd: snap.committedMicroUsd / 1_000_000,
        availableUsd: snap.availableMicroUsd / 1_000_000,
        entries: snap.entries.length,
        accounting:
          "reservedUsd is a held conservative bound; committedUsd is that bound charged after dispatch. Neither is an invoice or a confirmed provider price.",
      });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/operations/patches/validate", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const patch = validatePatch((req.body as { patch?: unknown })?.patch ?? req.body);
      res.json({ valid: true, patch });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/operations/experiments", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      res.json(runExperiment(req.body as { scenario?: unknown; executionConfig?: unknown; candidates?: unknown }));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/operations/proposals", async (req: Request, res: Response, next: (e: unknown) => void) => {
    let oneShotLeaseHeld = false;
    try {
      if (paidInferenceBusy()) {
        res.status(429).json({ code: "CONCURRENCY_LIMIT", message: "Server is busy (concurrency limit); retry shortly." });
        return;
      }
      const observation = (req.body as { observation?: unknown })?.observation;
      if (typeof observation !== "string") {
        res.status(400).json({ code: "BAD_REQUEST", message: "Body must be { observation: string }." });
        return;
      }
      // Fail-closed: local preflight (key/shape/length) runs BEFORE the
      // durable reservation, so it consumes no allowance and no provider
      // call. Once proposePatch is invoked the request may have reached
      // the provider: success, provider errors, timeouts and invalid model
      // output all commit the conservative bound - never a refund.
      let reservationId: string | null = null;
      if (budgetGuard) {
        const live = liveAvailable(config);
        if (!live.ok) {
          res.status(503).json({ status: "setup_required", reason: live.reason, provider: config.providerKind === "gater" ? "gater" : "meta" });
          return;
        }
        if (observation.length === 0 || observation.length > 4000) {
          res.status(400).json({ code: "BAD_REQUEST", message: "observation must be 1..4000 characters" });
          return;
        }
        reservationId = `proposal:${randomUUID()}`;
        budgetGuard.reserve(reservationId, config.publicBudgetPerRunUsd);
      }
      // Own the shared lease synchronously before the single dispatch;
      // released when proposePatch settles on every outcome below.
      oneShotInFlight++;
      oneShotLeaseHeld = true;
      try {
        const result = await proposePatch({
          config,
          fetchImpl,
          observation,
          ...(budgetGuard && reservationId
            ? { beforeDispatch: () => budgetGuard.assertReservation(reservationId, config.publicBudgetPerRunUsd) }
            : {}),
        });
        if (budgetGuard && reservationId) budgetGuard.commit(reservationId);
        res.json(result);
      } catch (e) {
        // A guard refusal means no dispatch happened: preserve the claim
        // exactly as persisted, never commit or release it here.
        if (e instanceof BudgetGuardError) throw e;
        if (budgetGuard && reservationId) {
          try {
            budgetGuard.commit(reservationId);
          } catch {
            // Commit failure leaves the reservation counted for audit.
          }
        }
        throw e;
      }
      oneShotInFlight--;
      oneShotLeaseHeld = false;
    } catch (e) {
      if (oneShotLeaseHeld) oneShotInFlight--;
      next(e);
    }
  });

  app.post("/api/operations/layout-investigations", async (req, res, next) => {
    let claim: string | null = null;
    let admitted = false;
    try {
      let input;
      try { input = parseLayoutInvestigationInput(req.body); }
      catch { res.status(400).json({ code: "BAD_REQUEST", message: "Invalid layout investigation input." }); return; }
      const live = liveAvailable(config);
      if (!live.ok) { res.status(503).json({ status: "setup_required", reason: live.reason }); return; }
      if (paidInferenceBusy()) { res.status(429).json({ code: "CONCURRENCY_LIMIT", message: "Server is busy." }); return; }
      layoutAdmissionPending = true;
      admitted = true;
      if (budgetGuard) {
        claim = `layout:${randomUUID()}`;
        budgetGuard.reserve(claim, config.publicBudgetPerRunUsd);
      }
      const record = await layouts.create(input, claim);
      const id = record.report.runId;
      if (claim) layoutClaims.set(id, claim);
      layoutOwners.add(id);
      claim = null;
      const snapshot = layouts.toSummary(record);
      layouts.start(record, fetchImpl);
      res.status(202).json(snapshot);
    } catch (e) {
      if (budgetGuard && claim) { try { budgetGuard.release(claim); } catch { /* counted */ } }
      next(e);
    } finally { if (admitted) layoutAdmissionPending = false; }
  });
  app.post("/api/operations/layout-investigations/verify", async (req, res, next) => {
    const parsed = z.strictObject({ report: z.unknown() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ code: "BAD_REQUEST", message: "Body must be { report }." }); return; }
    try { res.json(await verifyLayoutInvestigationExport(parsed.data.report)); }
    catch (e) { next(e); }
  });
  app.get("/api/operations/layout-investigations/:id/report", (req, res) => {
    const record = layouts.get(req.params.id);
    if (!record) { res.status(404).json({ code: "UNKNOWN_INVESTIGATION", message: "Unknown layout investigation." }); return; }
    res.json(layouts.buildReport(record));
  });
  app.post("/api/operations/layout-investigations/:id/approve", (req, res, next) => {
    try {
      const parsed = z.strictObject({ approval: z.unknown() }).safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ code: "BAD_REQUEST", message: "Body must be { approval }." }); return; }
      const record = layouts.get(req.params.id);
      if (!record) { res.status(404).json({ code: "UNKNOWN_INVESTIGATION", message: "Unknown layout investigation." }); return; }
      if (record.report.state !== "AWAITING_APPROVAL" || Date.now() >= record.report.deadlineAt) {
        res.status(409).json({ code: "NOT_AWAITING_APPROVAL", message: "Layout investigation is not awaiting approval." }); return;
      }
      let approval;
      try { approval = parseLayoutApproval(parsed.data.approval, record.report.input); }
      catch { res.status(400).json({ code: "BAD_REQUEST", message: "Invalid layout approval." }); return; }
      if (budgetGuard) {
        const claim = layoutClaims.get(record.report.runId);
        if (!claim) throw new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, "Missing layout reservation");
        budgetGuard.assertReservation(claim, config.publicBudgetPerRunUsd);
      }
      layouts.approve(record.report.runId, approval, fetchImpl);
      res.status(202).json(layouts.toSummary(record));
    } catch (e) { next(e); }
  });
  app.get("/api/operations/layout-investigations/:id", (req, res) => {
    const record = layouts.get(req.params.id);
    if (!record) { res.status(404).json({ code: "UNKNOWN_INVESTIGATION", message: "Unknown layout investigation." }); return; }
    res.json(layouts.toSummary(record));
  });
  app.post("/api/operations/layout-investigations/:id/cancel", (req, res) => {
    if (!z.strictObject({}).safeParse(req.body ?? {}).success) { res.status(400).json({ code: "BAD_REQUEST", message: "Cancel body must be empty." }); return; }
    const record = layouts.get(req.params.id);
    if (!record) { res.status(404).json({ code: "UNKNOWN_INVESTIGATION", message: "Unknown layout investigation." }); return; }
    if (!["RUNNING", "AWAITING_APPROVAL"].includes(record.report.state)) { res.status(409).json({ code: "RUN_CLOSED", message: "Layout investigation closed." }); return; }
    layouts.cancel(req.params.id);
    res.json(layouts.toSummary(record));
  });

  app.post("/api/operations/investigations", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const live = liveAvailable(config);
      if (!live.ok) {
        res.status(503).json({ status: "setup_required", reason: live.reason, provider: config.providerKind === "gater" ? "gater" : "meta" });
        return;
      }
      // Strict local preflight BEFORE the durable claim: malformed input
      // spends nothing, calls nothing, and reserves nothing.
      const input = parseInvestigationInput(req.body);
      if (layoutBusy()) { res.status(429).json({ code: "CONCURRENCY_LIMIT", message: "Server is busy." }); return; }
      let reservationId: string | null = null;
      if (budgetGuard) {
        reservationId = `investigation:${randomUUID()}`;
        budgetGuard.reserve(reservationId, config.publicBudgetPerRunUsd);
      }
      let record;
      try {
        record = investigations.create(input, reservationId);
      } catch (e) {
        if (budgetGuard && reservationId) {
          try { budgetGuard.release(reservationId); } catch { /* claim stays counted */ }
        }
        throw e;
      }
      if (reservationId) investigationReservations.set(record.id, reservationId);
      const snapshot = investigations.toSummary(record);
      investigations.start(record, fetchImpl);
      res.status(202).json(snapshot);
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/operations/investigations/:id", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const record = investigations.get(req.params["id"] as string);
      if (!record) {
        res.status(404).json({ code: "UNKNOWN_INVESTIGATION", message: "Unknown investigation id." });
        return;
      }
      settleInvestigationReservation(record.id);
      res.json(investigations.toSummary(record));
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/operations/investigations/:id/report", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const record = investigations.get(req.params["id"] as string);
      if (!record) {
        res.status(404).json({ code: "UNKNOWN_INVESTIGATION", message: "Unknown investigation id." });
        return;
      }
      settleInvestigationReservation(record.id);
      res.json(investigations.buildReport(record));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/operations/investigations/:id/cancel", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const record = investigations.cancel(req.params["id"] as string);
      settleInvestigationReservation(record.id);
      res.json(investigations.toSummary(record));
    } catch (e) {
      next(e);
    }
  });

  // Offline recomputation of an exported investigation (E4b): reuses the
  // strict verifier, reruns the engine only. No key, no provider dispatch,
  // no budget-ledger touch; safe-limiter rate handling above applies.
  app.post("/api/operations/investigations/verify", (req: Request, res: Response, next: (e: unknown) => void) => {
    try {
      const body = req.body as unknown;
      const report =
        body && typeof body === "object" && !Array.isArray(body) && "report" in (body as Record<string, unknown>)
          ? (body as Record<string, unknown>)["report"]
          : body;
      if (!report || typeof report !== "object" || Array.isArray(report)) {
        res.status(400).json({ code: "BAD_REQUEST", message: "Body must be { report } containing an investigation export object." });
        return;
      }
      if (JSON.stringify(report).length > 1_000_000) {
        res.status(413).json({ code: "BODY_TOO_LARGE", message: "Investigation export exceeds 1 MB verification bound." });
        return;
      }
      const result = verifyInvestigationExport(report);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Unknown /api routes are JSON 404s. This sits before static serving so no
  // planner shell or fallback can swallow an API miss.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ code: "UNKNOWN_API_ROUTE", message: "Unknown API route." });
  });

  // Same-origin built web: only this directory is ever served, so the repo
  // root, source, and .env are unreachable through static routes.
  const webDir = opts.webDir;
  if (typeof webDir === "string" && hasWebBuild(webDir)) {
    app.use(
      express.static(webDir, {
        index: "index.html",
        dotfiles: "deny",
        extensions: false,
        // Explicit GLB media type for the pinned rack asset.
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".glb")) res.setHeader("Content-Type", "model/gltf-binary");
        },
      }),
    );
    // No shell fallback: the planner has no client router or deep links, so
    // every miss (extensionless or not) is a 404 below. express.static
    // already serves / from index.html.
  } else {
    // API-only mode: GETs outside /api explain the missing build (503).
    app.use((req: Request, res: Response, next: (e?: unknown) => void) => {
      if (req.method !== "GET") {
        next();
        return;
      }
      res.status(503).type("text/plain").send(WEB_BUILD_GUIDANCE);
    });
  }

  // Non-API misses: every path outside /api and the static files is a 404.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: "NOT_FOUND", message: "Not found." });
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
        : code === "BAD_REQUIREMENTS" || code === "BAD_REQUEST" || code === "UNRESOLVED_QUESTIONS" || code === "INPUT_INVALID"
          ? 400
          : code === "RUN_EXPIRED"
            ? 408
            : code === "RUN_CLOSED" || code === "RUN_NOT_COMPLETED" || code === "REPORT_AVAILABLE" ||
                code === "FAILURE_NOT_AVAILABLE"
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

  return { app, store, config, webBuilt: hasWebBuild(webDir) };
}
