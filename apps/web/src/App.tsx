import { useEffect, useMemo, useRef, useState } from "react";
import {
  HEURISTIC_NAME,
  applyAssignment,
  applyProposal,
  buildNavContext,
  createReport,
  evaluateBaseline,
  evaluateCandidate,
  freezeScenario,
  methodLabelFor,
  parseProposal,
  parseRequirements,
  parseScenario,
  runHeuristic,
  settingsFingerprint,
  shortestPathPointsMm,
  validateScene,
  type Assignment,
  type CandidateResult,
  type PlanningRequirements,
  type Scenario,
} from "@layoutlab/core";
import sampleJson from "../../../fixtures/sample/warehouse-basic.json";
import { BottomPanel } from "./components/BottomPanel";
import { CenterView } from "./components/CenterView";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { ThreeView } from "./components/ThreeView";
import {
  approveLiveRun,
  cancelLiveRun,
  createLiveRun,
  getLiveFailureReport,
  getLiveReport,
  getLiveRun,
  getStatus,
  type ApiStatus,
  type RunSummary,
} from "./lib/api";
import { buildExportEnvelope, newRunId, replayAnyEnvelope, type M4HeuristicMeta } from "./lib/export";
import {
  clearPersisted,
  loadPersisted,
  savePersisted,
  type PersistedStubCandidate,
} from "./lib/persist";
import { generateStubProposals } from "./lib/stub";

const DEFAULT_REQUIREMENTS: PlanningRequirements = {
  objective: "minimize_weighted_picking_travel",
  maxRelocatedProducts: 4,
  lockedProductIds: [],
  assumptions: [],
  unresolvedQuestions: [],
};

export type StubProposalState = {
  name: string;
  rationale: string;
  parseOk: boolean;
  parseError: string | null;
  applyOk: boolean;
  applyErrors: string[];
  candidate: CandidateResult | null;
};

export type StubRunState = {
  status: "idle" | "running" | "completed" | "cancelled";
  runId: string | null;
  baseline: Scenario | null;
  baselineFingerprint: string | null;
  requirements: PlanningRequirements | null;
  proposals: StubProposalState[];
  bestName: string | null;
  outcome: string | null;
  progress: string;
  heuristicMeta: M4HeuristicMeta | null;
};

const IDLE_RUN: StubRunState = {
  status: "idle",
  runId: null,
  baseline: null,
  baselineFingerprint: null,
  requirements: null,
  proposals: [],
  bestName: null,
  outcome: null,
  progress: "",
  heuristicMeta: null,
};

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function App(): React.JSX.Element {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<PlanningRequirements>(DEFAULT_REQUIREMENTS);
  const [approved, setApproved] = useState(false);
  const [approvedSnapshot, setApprovedSnapshot] = useState<PlanningRequirements | null>(null);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [baselineResult, setBaselineResult] = useState<CandidateResult | null>(null);
  const [stubRun, setStubRun] = useState<StubRunState>(IDLE_RUN);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showSelected, setShowSelected] = useState(true);
  const [mode, setMode] = useState<"MANUAL" | "STUB" | "REPLAY" | "LIVE">("MANUAL");
  // Live (Meta) run state. Server owns the run; the browser keeps only the
  // summary plus the local baseline snapshot needed for apply guards. Live
  // runs are session-scoped and never persisted (see save effect below).
  const [providerMode, setProviderMode] = useState<"stub" | "live">("stub");
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [liveRequest, setLiveRequest] = useState(
    "Reduce picking travel for the loaded orders. Keep locked products fixed and relocate no more than the approved budget.",
  );
  const [liveConsent, setLiveConsent] = useState(false);
  const [liveRun, setLiveRun] = useState<RunSummary | null>(null);
  const [liveBaseline, setLiveBaseline] = useState<Scenario | null>(null);
  const [liveBaselineFingerprint, setLiveBaselineFingerprint] = useState<string | null>(null);
  const [liveBusy, setLiveBusy] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveSeq = useRef(0);
  const [replayInfo, setReplayInfo] = useState<{
    matches: boolean;
    mismatches: string[];
    provider: string;
    runId: string;
    failureNotice: string | null;
  } | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const runSeq = useRef(0);

  // Restore persisted state once, then re-evaluate from core (never trust stored numbers).
  useEffect(() => {
    const loaded = loadPersisted();
    if (!loaded.ok) {
      if (loaded.error !== "empty") setNotice(loaded.error);
      return;
    }
    const s = loaded.state;
    setScenario(s.scenario);
    setRequirements(s.requirements);
    setApproved(s.approved);
    setApprovedSnapshot(s.approvedRequirements);
    setMode(s.mode);
    setSelectedOrderId(s.selectedOrderId);
    try {
      const base = evaluateBaseline(s.scenario, s.requirements);
      setBaselineResult(base);
      if (s.scenario.orders.length > 0 && !s.selectedOrderId) {
        setSelectedOrderId(s.scenario.orders[0]!.id);
      }
      // Restore candidates only on full run identity (id + revision +
      // settings), never revision alone; otherwise discard.
      const identityOk =
        s.stubBaselineId === s.scenario.id &&
        s.stubBaselineRevision === s.scenario.revision &&
        s.stubBaselineFingerprint === settingsFingerprint(s.scenario);
      if (s.mode === "STUB" && (s.stubCandidates.length > 0 || s.heuristic !== null) && identityOk) {
        const proposals: StubProposalState[] = s.stubCandidates.map((c) => ({
          name: c.name,
          rationale: c.rationale,
          parseOk: true,
          parseError: null,
          applyOk: true,
          applyErrors: [],
          candidate: evaluateCandidate(s.scenario, s.requirements, c.mapping, c.name),
        }));
        // The heuristic restores first (it ran before the stub proposals),
        // re-evaluated through core like every restored candidate.
        let heuristicMeta: M4HeuristicMeta | null = null;
        if (s.heuristic) {
          proposals.unshift({
            name: HEURISTIC_NAME,
            rationale: s.heuristic.rationale,
            parseOk: true,
            parseError: null,
            applyOk: true,
            applyErrors: [],
            candidate: evaluateCandidate(s.scenario, s.requirements, s.heuristic.mapping, HEURISTIC_NAME),
          });
          heuristicMeta = {
            evaluationsUsed: s.heuristic.evaluationsUsed,
            evaluationsBudget: s.heuristic.evaluationsBudget,
            method: "demand-greedy-swaps/1",
            reason: s.heuristic.reason,
            retainedBaseline: s.heuristic.retainedBaseline,
            sceneOk: true,
            rankingExhausted: s.heuristic.rankingExhausted,
          };
        }
        const entries = proposals
          .filter((p) => p.candidate !== null)
          .map((p) => ({ name: p.name, mapping: (p.candidate as CandidateResult).assignment }));
        const report = createReport(s.scenario, s.requirements, entries);
        setStubRun({
          status: "completed",
          // Validated non-null by loadPersisted whenever candidates exist.
          runId: s.stubRunId as string,
          baseline: structuredClone(s.scenario),
          baselineFingerprint: settingsFingerprint(s.scenario),
          requirements: structuredClone(s.requirements),
          proposals,
          bestName: report.bestName,
          outcome: report.outcome,
          progress: `Restored run ${s.stubRunId} from saved state; re-evaluated with core (restored provenance).`,
          heuristicMeta,
        });
        setSelectedCandidate(s.selectedCandidate ?? report.bestName ?? "baseline");
      } else {
        if (s.stubCandidates.length > 0) setNotice("Saved stub run was stale for the restored scene identity; cleared.");
        setSelectedCandidate("baseline");
      }
    } catch (e) {
      setNotice(e instanceof Error ? `Restore failed: ${e.message}` : "Restore failed.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStatus = (): void => {
    getStatus()
      .then((s) => {
        setApiStatus(s);
        setApiError(null);
      })
      .catch((e: unknown) => {
        setApiStatus(null);
        setApiError(e instanceof Error ? e.message.slice(0, 120) : "unreachable");
      });
  };

  // Live server status loads lazily when Live is selected (never on mount),
  // so the stub flow makes zero /api calls and stays console-clean without
  // the API running.
  useEffect(() => {
    if (providerMode === "live" && apiStatus === null && apiError === null) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerMode]);

  // Persist on change (bounded, versioned). Live runs are session-scoped:
  // a LIVE view persists as MANUAL so reload never shows a run without data.
  useEffect(() => {
    if (!scenario) return;
    const stubCandidates: PersistedStubCandidate[] = stubRun.proposals
      .filter((p) => p.candidate !== null && p.name !== HEURISTIC_NAME)
      .map((p) => ({
        name: p.name,
        mapping: (p.candidate as CandidateResult).assignment,
        rationale: p.rationale,
      }));
    // The heuristic persists separately (distinct method, own budget).
    const heuristicEntry = stubRun.proposals.find((p) => p.name === HEURISTIC_NAME && p.candidate !== null);
    const completed = stubRun.status === "completed";
    savePersisted({
      version: 1,
      scenario,
      requirements,
      approved,
      approvedRequirements: approved ? approvedSnapshot : null,
      mode: mode === "LIVE" ? "MANUAL" : mode,
      selectedCandidate,
      selectedOrderId,
      stubCandidates: completed ? stubCandidates : [],
      stubBaselineRevision: completed ? (stubRun.baseline?.revision ?? null) : null,
      stubBaselineId: completed ? (stubRun.baseline?.id ?? null) : null,
      stubBaselineFingerprint: completed ? (stubRun.baselineFingerprint ?? null) : null,
      stubRunId: completed ? (stubRun.runId ?? null) : null,
      heuristic:
        completed && heuristicEntry?.candidate && stubRun.heuristicMeta
          ? {
              mapping: heuristicEntry.candidate.assignment,
              rationale: heuristicEntry.rationale,
              evaluationsUsed: stubRun.heuristicMeta.evaluationsUsed,
              evaluationsBudget: stubRun.heuristicMeta.evaluationsBudget,
              retainedBaseline: stubRun.heuristicMeta.retainedBaseline,
              reason: stubRun.heuristicMeta.reason,
              rankingExhausted: stubRun.heuristicMeta.rankingExhausted,
            }
          : null,
    });
  }, [scenario, requirements, approved, approvedSnapshot, mode, selectedCandidate, selectedOrderId, stubRun]);

  const evaluateCurrent = (scn: Scenario, req: PlanningRequirements): void => {
    try {
      const base = evaluateBaseline(scn, req);
      setBaselineResult(base);
      if (!selectedOrderId && scn.orders.length > 0) setSelectedOrderId(scn.orders[0]!.id);
    } catch (e) {
      setBaselineResult(null);
      setScenarioError(e instanceof Error ? e.message : "Evaluation failed.");
    }
  };

  const clearLive = (): void => {
    // Sequence bump first: stale interpret/generate/cancel results commit nothing.
    liveSeq.current++;
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;
    // Best-effort server cancel for the known run so reset/load orphan no inference.
    if (liveRun) void cancelLiveRun(liveRun.runId).catch(() => {});
    setLiveRun(null);
    setLiveBaseline(null);
    setLiveBaselineFingerprint(null);
    setLiveBusy(null);
    setLiveError(null);
  };

  const loadSample = (): void => {
    // Invalidate any active async run before replacing the scene.
    runSeq.current++;
    cancelRef.current = true;
    clearLive();
    try {
      const scn = parseScenario(structuredClone(sampleJson));
      setScenario(scn);
      setScenarioError(null);
      setStubRun(IDLE_RUN);
      setMode("MANUAL");
      setReplayInfo(null);
      setReplayError(null);
      setApplyMessage(null);
      setSelectedCandidate("baseline");
      setSelectedOrderId(scn.orders[0]?.id ?? null);
      evaluateCurrent(scn, requirements);
    } catch (e) {
      setScenarioError(e instanceof Error ? e.message : "Sample failed to parse.");
    }
  };

  const loadFile = async (file: File): Promise<void> => {
    runSeq.current++;
    cancelRef.current = true;
    clearLive();
    if (file.size > 1_000_000) {
      setScenarioError("File exceeds 1 MB; refusing to parse.");
      return;
    }
    try {
      const text = await file.text();
      const scn = parseScenario(JSON.parse(text));
      setScenario(scn);
      setScenarioError(null);
      setStubRun(IDLE_RUN);
      setMode("MANUAL");
      setReplayInfo(null);
      setReplayError(null);
      setApplyMessage(null);
      setSelectedCandidate("baseline");
      setSelectedOrderId(scn.orders[0]?.id ?? null);
      evaluateCurrent(scn, requirements);
    } catch (e) {
      setScenarioError(e instanceof Error ? `Invalid scenario: ${e.message}` : "Invalid scenario file.");
    }
  };

  const manualEdit = (productId: string, locationId: string): void => {
    if (!scenario) return;
    const next: Assignment[] = scenario.assignments.map((a) =>
      a.productId === productId ? { productId, locationId } : { ...a },
    );
    const updated: Scenario = { ...structuredClone(scenario), assignments: next, revision: scenario.revision + 1 };
    setScenario(updated);
    setMode("MANUAL");
    setApplyMessage(null);
    evaluateCurrent(updated, requirements);
  };

  const updateRequirements = (next: PlanningRequirements): void => {
    setRequirements(next);
    setApproved(false);
    setApprovedSnapshot(null);
    setRequirementsError(null);
    // Refresh validation against the new constraints; approval/apply stay
    // invalidated until the user explicitly re-approves the parsed snapshot.
    if (scenario) evaluateCurrent(scenario, next);
  };

  const approveRequirements = (): void => {
    try {
      const parsed = parseRequirements(structuredClone(requirements));
      setRequirements(parsed);
      setApprovedSnapshot(structuredClone(parsed));
      setApproved(true);
      setRequirementsError(null);
      setApplyMessage(null);
    } catch (e) {
      setApproved(false);
      setApprovedSnapshot(null);
      setRequirementsError(e instanceof Error ? `Requirements invalid: ${e.message}` : "Requirements invalid.");
    }
  };

  const generateStub = async (): Promise<void> => {
    if (!scenario || stubRun.status === "running") return;
    // Internal guard, not button-only: the approved snapshot must equal the
    // current requirements, otherwise a stale approval could launch a run.
    if (!approved || !approvedSnapshot || JSON.stringify(approvedSnapshot) !== JSON.stringify(requirements)) {
      setNotice("Stub blocked: approve the current requirements first.");
      return;
    }
    const seq = ++runSeq.current;
    cancelRef.current = false;
    const alive = (): boolean => seq === runSeq.current;
    const frozen = freezeScenario(scenario);
    const reqSnap = structuredClone(requirements);
    // Shared scene gate (brief section 13): invalid fixed geometry blocks the
    // run before any assignment search. Assignment-invalid baselines still run.
    const sceneCheck = validateScene(frozen);
    if (!sceneCheck.ok) {
      setNotice(
        `Stub blocked: scene geometry is invalid (INPUT_INVALID: ${sceneCheck.issues.map((i) => i.code).join(", ")}); fix racks, locations, or packing before generating.`,
      );
      return;
    }
    const proposals = generateStubProposals(frozen, reqSnap, 3);
    const runId = newRunId();
    // Bounded demand heuristic FIRST (synchronous, deterministic, no model),
    // then the explicitly labeled stub proposals.
    const heuristic = runHeuristic(frozen, reqSnap);
    const heuristicMeta: M4HeuristicMeta = {
      evaluationsUsed: heuristic.evaluationsUsed,
      evaluationsBudget: heuristic.evaluationsBudget,
      method: heuristic.method,
      reason: heuristic.reason,
      retainedBaseline: heuristic.retainedBaseline,
      sceneOk: heuristic.sceneOk,
      rankingExhausted: heuristic.rankingExhausted,
    };
    const heuristicEntry: StubProposalState | null = heuristic.candidate
      ? {
          name: HEURISTIC_NAME,
          rationale:
            `Heuristic ${heuristic.method}: ${heuristic.reason} ` +
            `(${heuristic.evaluationsUsed}/${heuristic.evaluationsBudget} candidate evaluations, no model used)` +
            (heuristic.rankingExhausted
              ? " [location ranking exhausted its computation budget; unranked locations were not treated as unreachable]."
              : "."),
          parseOk: true,
          parseError: null,
          applyOk: true,
          applyErrors: [],
          candidate: heuristic.candidate,
        }
      : null;
    setStubRun({
      status: "running",
      runId,
      baseline: frozen,
      baselineFingerprint: settingsFingerprint(frozen),
      requirements: reqSnap,
      proposals: heuristicEntry ? [heuristicEntry] : [],
      bestName: null,
      outcome: null,
      progress: `Starting stub run ${runId} (heuristic done, 0/${proposals.length} stub)…`,
      heuristicMeta,
    });
    setApplyMessage(null);
    const done: StubProposalState[] = heuristicEntry ? [heuristicEntry] : [];
    for (let i = 0; i < proposals.length; i++) {
      if (!alive() || cancelRef.current) break;
      setStubRun((r) => (seq === runSeq.current ? { ...r, progress: `Generating stub proposal ${i + 1}/${proposals.length}…` } : r));
      await delay(400);
      if (!alive() || cancelRef.current) break;
      const raw = proposals[i]!;
      const name = `stub-${i + 1}`;
      let parseOk = true;
      let parseError: string | null = null;
      let parsed: ReturnType<typeof parseProposal> | null = null;
      try {
        parsed = parseProposal(structuredClone(raw));
      } catch (e) {
        parseOk = false;
        parseError = e instanceof Error ? e.message : "parse failed";
      }
      if (!alive()) return; // stale loop returns silently, never commits
      if (!parseOk || !parsed) {
        done.push({ name, rationale: raw.rationale, parseOk, parseError, applyOk: false, applyErrors: [], candidate: null });
        setStubRun((r) => (seq === runSeq.current ? { ...r, proposals: [...done] } : r));
        continue;
      }
      const applied = applyProposal(frozen, parsed);
      if (!alive()) return;
      if (!applied.ok) {
        done.push({
          name,
          rationale: raw.rationale,
          parseOk: true,
          parseError: null,
          applyOk: false,
          applyErrors: applied.errors.map((e) => `${e.code}: ${e.message}`),
          candidate: null,
        });
        setStubRun((r) => (seq === runSeq.current ? { ...r, proposals: [...done] } : r));
        continue;
      }
      const candidate = evaluateCandidate(frozen, reqSnap, applied.finalMapping, name);
      if (!alive()) return;
      done.push({ name, rationale: raw.rationale, parseOk: true, parseError: null, applyOk: true, applyErrors: [], candidate });
      setStubRun((r) => (seq === runSeq.current ? { ...r, proposals: [...done] } : r));
    }
    if (!alive()) return; // superseded by reset/load/new run: commit nothing
    if (cancelRef.current) {
      setStubRun((r) => ({ ...r, status: "cancelled", progress: "Stub run cancelled — apply is disabled for this run." }));
      return;
    }
    const entries = done
      .filter((p) => p.candidate !== null)
      .map((p) => ({ name: p.name, mapping: (p.candidate as CandidateResult).assignment }));
    const report = createReport(frozen, reqSnap, entries);
    const generatedCount = done.filter((p) => p.name !== HEURISTIC_NAME).length;
    const heuristicCount = done.some((p) => p.name === HEURISTIC_NAME) ? 1 : 0;
    setStubRun((r) => ({
      ...r,
      status: "completed",
      proposals: done,
      bestName: report.bestName,
      outcome: report.outcome,
      progress: `Completed: ${generatedCount} generated proposal(s) + ${heuristicCount} heuristic candidate, best ${report.bestName ?? "none"} (${report.outcome}).`,
      heuristicMeta,
    }));
    setMode("STUB");
    setSelectedCandidate(report.bestName ?? "baseline");
  };

  const cancelStub = (): void => {
    if (stubRun.status !== "running") return;
    cancelRef.current = true;
    // The running loop commits the cancelled state itself while still alive;
    // show immediate feedback without invalidating its sequence.
    setStubRun((r) => (r.status === "running" ? { ...r, progress: "Cancelling stub run…" } : r));
  };

  // Shared guarded apply for stub and live runs: re-evaluate the stored
  // mapping against the frozen run baseline, then check identity + revision
  // + settings. Cancelled runs never apply.
  const applyFromRun = (
    run: Pick<StubRunState, "status" | "baseline" | "baselineFingerprint" | "requirements" | "proposals">,
    name: string,
    providerLabel: string,
  ): void => {
    setApplyMessage(null);
    if (run.status !== "completed" || !run.baseline || !run.requirements || !scenario) {
      setApplyMessage(`Apply rejected: no completed ${providerLabel} run (cancelled or unfinished runs cannot apply).`);
      return;
    }
    // Constraints guard: the current approved requirements must equal the run
    // requirements, otherwise the candidate was validated against old locks/budget.
    if (!approved || JSON.stringify(requirements) !== JSON.stringify(run.requirements)) {
      setApplyMessage("Apply rejected: requirements changed since the run; re-approve and re-run before applying.");
      return;
    }
    const entry = run.proposals.find((p) => p.name === name);
    if (!entry?.candidate) {
      setApplyMessage(`Apply rejected: candidate ${name} has no evaluated result.`);
      return;
    }
    // Re-evaluate the stored mapping against the frozen run baseline before
    // applying, so stale or tampered candidate data cannot slip through.
    let fresh: CandidateResult;
    try {
      fresh = evaluateCandidate(run.baseline, run.requirements, entry.candidate.assignment, name);
    } catch (e) {
      setApplyMessage(e instanceof Error ? `Apply rejected: re-evaluation failed (${e.message}).` : "Apply rejected: re-evaluation failed.");
      return;
    }
    if (!fresh.valid) {
      setApplyMessage(`Apply rejected: candidate ${name} is invalid on re-evaluation (${fresh.errors[0]?.code ?? "see errors"}).`);
      return;
    }
    // Identity + revision + settings, never revision alone.
    if (scenario.id !== run.baseline.id) {
      setApplyMessage(`Apply rejected: scenario changed (${scenario.id} ≠ ${run.baseline.id}).`);
      return;
    }
    if (scenario.revision !== run.baseline.revision) {
      setApplyMessage(
        `Apply rejected: stale revision (current ${scenario.revision}, run baseline ${run.baseline.revision}). New edits invalidate apply.`,
      );
      return;
    }
    if (settingsFingerprint(scenario) !== run.baselineFingerprint) {
      setApplyMessage("Apply rejected: settings changed since the run (room/racks/orders/cart).");
      return;
    }
    const applied = applyAssignment(run.baseline, entry.candidate.assignment, run.baseline.revision);
    if (!applied.ok) {
      setApplyMessage(`Apply rejected: ${applied.errors[0]?.message ?? "stale revision"}.`);
      return;
    }
    setScenario(applied.scenario);
    setMode("MANUAL");
    setSelectedCandidate("baseline");
    setApplyMessage(`Applied ${name}: revision ${applied.scenario.revision}. Previous run is now stale.`);
    evaluateCurrent(applied.scenario, requirements);
  };

  const applyCandidate = (name: string): void => {
    applyFromRun(stubRun, name, "stub");
  };

  const applyLiveCandidate = (name: string): void => {
    // Actual COMPLETED only: no apply from running, failed, timed-out, or
    // cancelled runs (partial results stay inspectable, never applicable).
    if (!liveRun || liveRun.state !== "COMPLETED" || !liveBaseline || !liveRun.requirements) {
      setApplyMessage(
        `Apply rejected: no completed live run (state ${liveRun?.state ?? "none"}; only COMPLETED runs can apply).`,
      );
      return;
    }
    applyFromRun(
      {
        status: "completed",
        baseline: liveBaseline,
        baselineFingerprint: liveBaselineFingerprint,
        requirements: liveRun.requirements,
        proposals: liveRun.attempts.map((a) => ({
          name: a.name,
          rationale: a.rationale,
          parseOk: a.parseOk,
          parseError: a.parseError,
          applyOk: a.applyOk,
          applyErrors: a.applyErrors,
          candidate: a.candidate,
        })),
      },
      name,
      "live",
    );
  };

  const pollLiveRun = async (
    runId: string,
    seq: number,
    controller: AbortController,
    deadlineMs: number,
  ): Promise<RunSummary | null> => {
    for (;;) {
      if (seq !== liveSeq.current || controller.signal.aborted) return null;
      let run: RunSummary;
      try {
        run = await getLiveRun(runId, controller.signal);
      } catch {
        return null; // aborted or superseded; caller checks the sequence
      }
      if (seq !== liveSeq.current) return null;
      if (run.state !== "INTERPRETING") return run;
      if (Date.now() > deadlineMs) throw new Error("Timed out waiting for the live server.");
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const interpretLive = async (): Promise<void> => {
    if (!scenario || liveBusy !== null) return;
    if (!liveConsent) {
      setLiveError("Consent is required before sending anything to Meta.");
      return;
    }
    const seq = ++liveSeq.current;
    liveAbortRef.current?.abort();
    const controller = new AbortController();
    liveAbortRef.current = controller;
    // Freeze the exact sent baseline before any await.
    const sent = scenario;
    const frozen = freezeScenario(sent);
    const fingerprint = settingsFingerprint(frozen);
    setLiveBusy("Interpreting request with Meta (1 model request)…");
    setLiveError(null);
    setApplyMessage(null);
    try {
      const created = await createLiveRun(sent, liveRequest, controller.signal);
      if (seq !== liveSeq.current) return; // superseded by reset/load/new run
      setLiveRun(created);
      setLiveBaseline(frozen);
      setLiveBaselineFingerprint(fingerprint);
      const deadlineMs = Date.parse(created.expiresAt) + 15000;
      const run = await pollLiveRun(created.runId, seq, controller, deadlineMs);
      if (!run || seq !== liveSeq.current) return;
      setLiveRun(run);
      // Draft populates the shared form but is never auto-approved: the user
      // must review, edit, resolve open questions, and explicitly approve.
      if (run.requirementsDraft) {
        setRequirements(structuredClone(run.requirementsDraft));
        setApproved(false);
        setApprovedSnapshot(null);
        evaluateCurrent(sent, run.requirementsDraft);
      }
      if (run.interpretError) setLiveError(`Interpretation needed manual constraints: ${run.interpretError}`);
      if (run.state === "FAILED" || run.state === "TIMED_OUT" || run.state === "CANCELLED") {
        setLiveError(run.lastError ?? `Interpretation ended: ${run.state}.`);
      }
    } catch (e) {
      if (seq !== liveSeq.current) return;
      if (controller.signal.aborted) {
        setLiveError("Interpretation cancelled; the server run was cancelled by ID when known.");
      } else {
        setLiveError(e instanceof Error ? e.message.slice(0, 500) : "Interpretation failed.");
      }
    } finally {
      if (seq === liveSeq.current) {
        if (liveAbortRef.current === controller) liveAbortRef.current = null;
        setLiveBusy(null);
      }
    }
  };

  const generateLive = async (): Promise<void> => {
    if (!scenario || !liveRun || liveBusy !== null) return;
    if (!approved || !approvedSnapshot || JSON.stringify(approvedSnapshot) !== JSON.stringify(requirements)) {
      setLiveError("Live blocked: approve the current requirements first.");
      return;
    }
    if (requirements.unresolvedQuestions.length > 0) {
      setLiveError(`Live blocked: resolve ${requirements.unresolvedQuestions.length} open question(s) first.`);
      return;
    }
    const seq = ++liveSeq.current;
    liveAbortRef.current?.abort();
    const controller = new AbortController();
    liveAbortRef.current = controller;
    const runId = liveRun.runId;
    setLiveBusy("Generating live proposals (up to 3, bounded)…");
    setLiveError(null);
    setApplyMessage(null);
    try {
      const run = await approveLiveRun(runId, requirements, controller.signal);
      if (seq !== liveSeq.current) return;
      setLiveRun(run);
      setMode("LIVE");
      setSelectedCandidate(run.bestName ?? "baseline");
    } catch (e) {
      if (seq !== liveSeq.current) return;
      if (controller.signal.aborted) {
        setLiveError("Live generation cancelled.");
      } else {
        setLiveError(e instanceof Error ? e.message.slice(0, 500) : "Live generation failed.");
      }
      // Refresh the run so the timeline shows the true terminal state.
      try {
        const run = await getLiveRun(runId);
        if (seq === liveSeq.current) setLiveRun(run);
      } catch {
        // Keep the last known summary if the refresh itself fails.
      }
    } finally {
      if (seq === liveSeq.current) {
        if (liveAbortRef.current === controller) liveAbortRef.current = null;
        setLiveBusy(null);
      }
    }
  };

  const cancelLive = async (): Promise<void> => {
    const seq = ++liveSeq.current;
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;
    if (!liveRun) return;
    const runId = liveRun.runId;
    setLiveBusy("Cancelling live run…");
    try {
      const run = await cancelLiveRun(runId);
      if (seq !== liveSeq.current) return;
      setLiveRun(run);
    } catch (e) {
      if (seq !== liveSeq.current) return;
      // Refresh to show the true state even when cancel races completion.
      try {
        const run = await getLiveRun(runId);
        if (seq === liveSeq.current) setLiveRun(run);
      } catch {
        setLiveError(e instanceof Error ? e.message.slice(0, 300) : "Cancel failed.");
      }
    } finally {
      if (seq === liveSeq.current) setLiveBusy(null);
    }
  };

  const resolveLiveQuestion = (index: number): void => {
    setRequirements((prev) => ({
      ...prev,
      unresolvedQuestions: prev.unresolvedQuestions.filter((_, i) => i !== index),
    }));
    setApproved(false);
    setApprovedSnapshot(null);
  };

  // A terminal live run (except cancelled) exports the verbatim server
  // report with real provider/model/budget provenance; cancelled live runs
  // have no report and stay cancelled.
  const liveExportable =
    liveRun !== null &&
    liveRun.requirements !== null &&
    (liveRun.state === "COMPLETED" || liveRun.state === "FAILED" || liveRun.state === "TIMED_OUT");
  // A terminal live run WITHOUT approved requirements (failure/cancel/
  // timeout before approval) exports the honest server failure audit —
  // never a silent manual-success report with synthetic metrics.
  const liveFailureExportable =
    liveRun !== null &&
    liveRun.requirements === null &&
    (liveRun.state === "FAILED" || liveRun.state === "CANCELLED" || liveRun.state === "TIMED_OUT");

  const downloadJson = (filename: string, data: unknown): void => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportJson = async (): Promise<void> => {
    if (!scenario) return;
    if (liveExportable && liveRun) {
      try {
        const report = await getLiveReport(liveRun.runId);
        downloadJson(`layoutlab-m3-live-${liveRun.runId.slice(0, 8)}.json`, report);
      } catch (e) {
        setNotice(e instanceof Error ? `Live export failed: ${e.message}` : "Live export failed.");
      }
      return;
    }
    if (liveFailureExportable && liveRun) {
      try {
        const audit = await getLiveFailureReport(liveRun.runId);
        downloadJson(`layoutlab-m5-failure-${liveRun.runId.slice(0, 8)}.json`, audit);
      } catch (e) {
        setNotice(e instanceof Error ? `Failure-audit export failed: ${e.message}` : "Failure-audit export failed.");
      }
      return;
    }
    // A completed stub run exports its run report (frozen baseline + all
    // candidates), even after apply/manual edits moved the live scene on;
    // otherwise export the current manual state with a fresh evaluation ID
    // (never reuse a cancelled/stale stub run's ID for a manual export).
    const useStub = stubRun.status === "completed" && stubRun.baseline && stubRun.requirements;
    const scn = useStub ? (stubRun.baseline as Scenario) : scenario;
    const req = useStub ? (stubRun.requirements as PlanningRequirements) : requirements;
    const entries = useStub
      ? stubRun.proposals.filter((p) => p.candidate !== null).map((p) => ({ name: p.name, mapping: (p.candidate as CandidateResult).assignment }))
      : [];
    const envelope = buildExportEnvelope({
      scenario: scn,
      requirements: req,
      entries,
      provider: useStub ? "stub" : "manual",
      runId: useStub ? (stubRun.runId ?? newRunId()) : newRunId(),
      heuristic: useStub ? (stubRun.heuristicMeta ?? null) : null,
    });
    downloadJson(`layoutlab-m2-${envelope.provider}-${envelope.runId.slice(0, 8)}.json`, envelope);
  };

  const importReplay = async (file: File): Promise<void> => {
    setReplayError(null);
    setReplayInfo(null);
    if (file.size > 1_000_000) {
      setReplayError("File exceeds 1 MB; refusing to parse.");
      return;
    }
    try {
      const text = await file.text();
      const result = replayAnyEnvelope(JSON.parse(text));
      setReplayInfo({
        matches: result.matchesSaved,
        mismatches: result.mismatches,
        provider: result.provider,
        runId: result.runId,
        failureNotice: result.failure?.notice ?? null,
      });
      setMode("REPLAY");
    } catch (e) {
      setReplayError(e instanceof Error ? `Replay failed: ${e.message}` : "Replay failed.");
    }
  };

  const resetAll = (): void => {
    runSeq.current++;
    cancelRef.current = true;
    clearLive();
    clearPersisted();
    setScenario(null);
    setScenarioError(null);
    setRequirements(DEFAULT_REQUIREMENTS);
    setApproved(false);
    setApprovedSnapshot(null);
    setRequirementsError(null);
    setBaselineResult(null);
    setStubRun(IDLE_RUN);
    setSelectedCandidate(null);
    setSelectedOrderId(null);
    setShowSelected(true);
    setMode("MANUAL");
    setReplayInfo(null);
    setReplayError(null);
    setApplyMessage(null);
    setNotice("Reset: cleared scenario, runs, replay, and saved state.");
  };

  // Comparison reuses the stub run shape for live attempts (same candidate
  // contracts, provider-labeled). Only COMPLETED enables apply; other
  // terminal states stay inspectable with apply disabled.
  const liveComparison: StubRunState = useMemo(() => {
    if (!liveRun || liveRun.state === "CANCELLED" || liveRun.attempts.length === 0) return IDLE_RUN;
    // Server heuristic first (it ran before the model proposals), then attempts.
    const proposals: StubProposalState[] = [];
    let heuristicMeta: M4HeuristicMeta | null = null;
    if (liveRun.heuristic?.candidate) {
      const h = liveRun.heuristic;
      proposals.push({
        name: HEURISTIC_NAME,
        rationale:
          `Heuristic ${h.method}: ${h.reason} ` +
          `(${h.evaluationsUsed}/${h.evaluationsBudget} candidate evaluations, no model used)` +
          (h.rankingExhausted
            ? " [location ranking exhausted its computation budget; unranked locations were not treated as unreachable]."
            : "."),
        parseOk: true,
        parseError: null,
        applyOk: true,
        applyErrors: [],
        candidate: h.candidate,
      });
      heuristicMeta = {
        evaluationsUsed: h.evaluationsUsed,
        evaluationsBudget: h.evaluationsBudget,
        method: h.method,
        reason: h.reason,
        retainedBaseline: h.retainedBaseline,
        sceneOk: h.sceneOk,
        rankingExhausted: h.rankingExhausted,
      };
    }
    for (const a of liveRun.attempts) {
      proposals.push({
        name: a.name,
        rationale: a.rationale,
        parseOk: a.parseOk,
        parseError: a.parseError,
        applyOk: a.applyOk,
        applyErrors: a.applyErrors,
        candidate: a.candidate,
      });
    }
    return {
      status:
        liveRun.state === "COMPLETED"
          ? "completed"
          : liveRun.state === "INTERPRETING" || liveRun.state === "AWAITING_APPROVAL" || liveRun.state === "RUNNING"
            ? "running"
            : "cancelled",
      runId: liveRun.runId,
      baseline: liveBaseline,
      baselineFingerprint: liveBaselineFingerprint,
      requirements: liveRun.requirements,
      proposals,
      bestName: liveRun.bestName,
      outcome: liveRun.outcome,
      progress: `Live ${liveRun.state}: ${liveRun.proposalsUsed} proposal(s), best ${liveRun.bestName ?? "none"}.`,
      heuristicMeta,
    };
  }, [liveRun, liveBaseline, liveBaselineFingerprint]);

  const comparisonRun = mode === "LIVE" ? liveComparison : stubRun;
  const comparisonProvider = mode === "LIVE" ? "live" : "stub";
  // Exact method labels: server-provided for live, core-derived for stub.
  const comparisonLabels: Record<string, string> = useMemo(() => {
    if (mode === "LIVE" && liveRun?.methodLabels) return { ...liveRun.methodLabels };
    const labels: Record<string, string> = { baseline: methodLabelFor("baseline") };
    for (const p of comparisonRun.proposals) {
      if (p.candidate) labels[p.name] = methodLabelFor(p.name);
    }
    return labels;
  }, [mode, liveRun, comparisonRun.proposals]);
  const comparisonBudgets = useMemo(() => {
    if (mode === "LIVE" && liveRun) {
      return {
        heuristic: { ...liveRun.candidateBudgets.heuristic },
        generated: {
          proposalsUsed: liveRun.proposalsUsed,
          maxProposals: liveRun.budgets.maxProposals,
          extra: `${liveRun.modelRequestsUsed}/${liveRun.budgets.maxRequests} model requests`,
        },
      };
    }
    const stubCount = comparisonRun.proposals.filter((p) => p.candidate !== null && p.name !== HEURISTIC_NAME).length;
    return {
      heuristic: {
        evaluationsUsed: comparisonRun.heuristicMeta?.evaluationsUsed ?? 0,
        evaluationsBudget: comparisonRun.heuristicMeta?.evaluationsBudget ?? 0,
      },
      generated: { proposalsUsed: stubCount, maxProposals: 3, extra: "0 model requests" },
    };
  }, [mode, liveRun, comparisonRun]);

  const selectedStub = useMemo(
    () => comparisonRun.proposals.find((p) => p.name === selectedCandidate) ?? null,
    [comparisonRun.proposals, selectedCandidate],
  );

  const displayedAssignment: Assignment[] | null = useMemo(() => {
    if (!scenario) return null;
    if (showSelected && selectedStub?.candidate) return selectedStub.candidate.assignment;
    return scenario.assignments;
  }, [scenario, showSelected, selectedStub]);

  const routePolylines = useMemo((): { points: { x: number; z: number }[] } | null => {
    try {
      if (!scenario || !displayedAssignment || !selectedOrderId) return null;
      const order = scenario.orders.find((o) => o.id === selectedOrderId);
      if (!order) return null;
      const result = showSelected && selectedStub?.candidate ? selectedStub.candidate : baselineResult;
      const orderResult = result?.workload?.orders.find((o) => o.orderId === selectedOrderId);
      // Suppress incomplete/unreachable routes: never draw a partial tour as complete.
      if (!orderResult || !orderResult.reachable || orderResult.distanceMm === null) return null;
      const visit = orderResult.visitSequence;
      const locOf = new Map(displayedAssignment.map((a) => [a.productId, a.locationId]));
      const pickOf = new Map(scenario.locations.map((l) => [l.id, l.pickPointMm]));
      const stops = [scenario.packingPointMm];
      for (const pid of visit) {
        const lid = locOf.get(pid);
        const pt = lid ? pickOf.get(lid) : undefined;
        if (!pt) return null;
        stops.push(pt);
      }
      stops.push(scenario.packingPointMm);
      const nav = buildNavContext(scenario);
      const full: { x: number; z: number }[] = [];
      for (let k = 1; k < stops.length; k++) {
        const pts = shortestPathPointsMm(stops[k - 1]!, stops[k]!, scenario, nav);
        if (!pts) return null;
        for (const p of pts) {
          const last = full[full.length - 1];
          if (!last || last.x !== p.x || last.z !== p.z) full.push(p);
        }
      }
      return { points: full };
    } catch {
      // Budget exhaustion or any nav failure suppresses the route (fallback
      // schematic) instead of crashing the planner.
      return null;
    }
  }, [scenario, displayedAssignment, selectedOrderId, selectedStub, baselineResult, showSelected]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>LayoutLab — Storage planner</h1>
        <span className="mono" data-testid="scenario-label">
          {scenario ? `${scenario.id} · rev ${scenario.revision}` : "no scenario"}
        </span>
        <span
          className={`badge ${mode === "STUB" ? "stub" : mode === "REPLAY" ? "replay" : mode === "LIVE" ? "live" : ""}`}
          data-testid="mode-badge"
        >
          {mode}
        </span>
        {baselineResult && (
          <span className={`badge ${baselineResult.valid ? "valid" : "invalid"}`} data-testid="valid-badge">
            {baselineResult.valid ? "VALID" : "INVALID"}
          </span>
        )}
        <span className="spacer" />
        <button type="button" onClick={loadSample} data-testid="btn-sample">Load sample</button>
        <label style={{ display: "inline-block", width: "auto" }}>
          Load JSON
          <input
            type="file"
            accept="application/json"
            data-testid="input-scenario"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" onClick={() => void exportJson()} disabled={!scenario} data-testid="btn-export">
          {liveExportable
            ? "Export live run report"
            : liveFailureExportable
              ? "Export failure audit (no measurements)"
              : stubRun.status === "completed"
                ? "Export run report"
                : "Export current evaluation"}
        </button>
        <label style={{ display: "inline-block", width: "auto" }}>
          Import/Replay
          <input
            type="file"
            accept="application/json"
            data-testid="input-replay"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importReplay(f);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" onClick={resetAll} data-testid="btn-reset">Reset</button>
      </header>

      <div className="main">
        <div>
          <LeftPanel
            scenario={scenario}
            requirements={requirements}
            baselineResult={baselineResult}
            scenarioError={scenarioError}
            onEdit={manualEdit}
            onEvaluate={() => scenario && evaluateCurrent(scenario, requirements)}
          />
          {notice && <p data-testid="notice">{notice}</p>}
          {applyMessage && <p data-testid="apply-message">{applyMessage}</p>}
          {replayError && <p className="error" role="alert" data-testid="replay-error">{replayError}</p>}
          {replayInfo && (
            <div className="panel" data-testid="replay-report">
              <h3>Replay report (core, no inference)</h3>
              <p>
                Provider <span className="mono">{replayInfo.provider}</span> · run{" "}
                <span className="mono">{replayInfo.runId}</span>
              </p>
              <p data-testid="replay-verdict" className={replayInfo.matches || replayInfo.failureNotice ? "okline" : "error"}>
                {replayInfo.failureNotice ??
                  (replayInfo.matches ? "✓ matches saved measurements" : `× MISMATCH: ${replayInfo.mismatches.join(", ")}`)}
              </p>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Warehouse views</h2>
          {!scenario && <p>Load the sample or a bounded JSON scenario to begin.</p>}
          {scenario && (
            <>
              <label>
                Order route
                <select
                  data-testid="select-order"
                  value={selectedOrderId ?? ""}
                  onChange={(e) => setSelectedOrderId(e.target.value || null)}
                >
                  {scenario.orders.map((o) => (
                    <option key={o.id} value={o.id}>{o.id} (×{o.frequency})</option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showSelected}
                  onChange={(e) => setShowSelected(e.target.checked)}
                  data-testid="toggle-candidate-view"
                />{" "}
                Show selected candidate (before/after)
              </label>
              <div className="legend" data-testid="demand-legend">
                <span><span className="dot low" />○ Low</span>
                <span><span className="dot mid" />◐ Mid</span>
                <span><span className="dot high" />● High</span>
                <span>Labels are text; color is redundant.</span>
              </div>
              <div className="views">
                <div className="viewbox" data-testid="view-2d">
                  <h3>2D plan (always available)</h3>
                  <CenterView
                    scenario={scenario}
                    assignment={displayedAssignment ?? scenario.assignments}
                    baselineAssignment={scenario.assignments}
                    route={routePolylines}
                    hasRoute={routePolylines !== null}
                  />
                </div>
                <div className="viewbox" data-testid="view-3d">
                  <span className="proxy-ribbon">SIMREADY RACKS · PROXY MARKERS</span>
                  <h3>3D warehouse</h3>
                  <ThreeView
                    scenario={scenario}
                    assignment={displayedAssignment ?? scenario.assignments}
                    route={routePolylines}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="rightcol">
          <RightPanel
            scenario={scenario}
            requirements={requirements}
            approved={approved}
            requirementsError={requirementsError}
            stubRun={stubRun}
            onRequirements={updateRequirements}
            onApprove={approveRequirements}
            onGenerate={() => void generateStub()}
            onCancel={cancelStub}
            live={{
              providerMode,
              apiStatus,
              apiError,
              requestText: liveRequest,
              consent: liveConsent,
              run: liveRun,
              busy: liveBusy,
              error: liveError,
            }}
            onProviderMode={setProviderMode}
            onLiveRequest={setLiveRequest}
            onLiveConsent={setLiveConsent}
            onInterpret={() => void interpretLive()}
            onGenerateLive={() => void generateLive()}
            onCancelLive={() => void cancelLive()}
            onRefreshStatus={refreshStatus}
            onResolveQuestion={resolveLiveQuestion}
          />
        </div>
      </div>

      <div className="bottom">
        {comparisonRun.status === "completed" && comparisonRun.baseline && scenario &&
          (scenario.id !== comparisonRun.baseline.id ||
            scenario.revision !== comparisonRun.baseline.revision ||
            settingsFingerprint(scenario) !== comparisonRun.baselineFingerprint) && (
            <p className="notice" data-testid="historical-notice">
              Historical run report: the live scene (rev {scenario.revision}) differs from run baseline rev{" "}
              {comparisonRun.baseline.revision}. Export reflects the frozen run, not the live scene.
            </p>
          )}
        <BottomPanel
          baselineResult={baselineResult}
          stubRun={comparisonRun}
          scenario={scenario}
          selectedCandidate={selectedCandidate}
          onSelect={setSelectedCandidate}
          onApply={mode === "LIVE" ? applyLiveCandidate : applyCandidate}
          providerLabel={comparisonProvider}
          methodLabels={comparisonLabels}
          budgets={comparisonBudgets}
        />
      </div>
    </div>
  );
}
