// Operations Simulation mode: live playback of the accepted M3b burst on the
// canonical main-warehouse geometry.
//
// ONE engine controller per run, owned above the mode switch (App): leaving
// Operations pauses presentation but never destroys, reruns, or resets the
// run. Browser frames advance the actual engine with monotonic integer ms;
// pause freezes the logical clock, Reset builds a new engine from the same
// frozen inputs, Step runs one actual engine event. Every metric, pose,
// queue, and timeline row is the engine snapshot at the shown clock —
// no invented animation, routes, or results.
import { useEffect, useRef, useState } from "react";
import type { OperationsController, OperationsSnapshot } from "@layoutlab/simulation";
import {
  buildOpsSnapshotSignature,
  burstHandlingDurations,
  isUnitOperationallyBusy,
  unitOperationalLabel,
  visualContainersForQty,
  type OperationsScene,
  type OperationsSelection,
} from "../lib/operations";
import { OperationsView, type LabelLayer, type OpsRenderStats } from "./OperationsView";

export type OpsRunState =
  | { scene: OperationsScene; controller: OperationsController }
  | { error: string };

type Speed = 1 | 4 | 16;

type PerfCounters = {
  frames: number;
  advances: number;
  advanceMsTotal: number;
  advanceMsMax: number;
  snapshots: number;
  wallMs: number;
};

const ZERO_PERF: PerfCounters = { frames: 0, advances: 0, advanceMsTotal: 0, advanceMsMax: 0, snapshots: 0, wallMs: 0 };

function fmtClock(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

function taskText(task: { kind: string; orderId?: string; legIndex?: number; resourceId?: string; slotId?: string }): string {
  switch (task.kind) {
    case "idle": return "Idle";
    case "to-pick": return `Moving to pick ${task.orderId} (stop ${(task.legIndex ?? 0) + 1})`;
    case "picking": return `Picking ${task.orderId} (stop ${(task.legIndex ?? 0) + 1})`;
    case "awaiting-queue-slot": return `Awaiting packing queue slot at ${task.resourceId}`;
    case "awaiting-head": return `Holding outside queue for head at ${task.resourceId}`;
    case "to-queue": return `Moving to queue slot ${task.slotId}`;
    case "in-queue": return `Waiting in queue slot ${task.slotId}`;
    case "to-service": return `Moving to service lane at ${task.resourceId}`;
    case "unloading": return `Unloading at ${task.resourceId}`;
    case "awaiting-staging": return `Awaiting staged input at ${task.resourceId}`;
    case "awaiting-service-start": return `Awaiting service start at ${task.resourceId}`;
    case "to-vacate": return `Vacating service to ${task.slotId}`;
    case "to-parking": return "Returning to parking";
    default: return task.kind;
  }
}

function stateBadge(
  started: boolean,
  playing: boolean,
  engineError: string | null,
  completion: { stage: string } | null,
): { label: string; cls: string } {
  if (engineError) return { label: "ENGINE ERROR", cls: "invalid" };
  if (completion?.stage === "SUPPORTED_STAGE_COMPLETE") return { label: "COMPLETE · SHIPPED", cls: "valid" };
  if (completion?.stage === "BLOCKED") return { label: "BLOCKED", cls: "warn" };
  if (completion?.stage === "WINDOW_ENDED") return { label: "WINDOW ENDED", cls: "warn" };
  if (playing) return { label: "RUNNING", cls: "valid" };
  return started ? { label: "PAUSED", cls: "warn" } : { label: "READY", cls: "badge-info" };
}

function selectionDetail(
  scene: OperationsScene,
  snap: OperationsSnapshot | null,
  selection: NonNullable<OperationsSelection>,
): React.JSX.Element {
  if (selection.kind === "order") {
    const o = snap?.orders.find((x) => x.orderId === selection.id);
    if (!o) return <p>Unknown order.</p>;
    return (
      <dl className="ops-facts">
        <div><dt>Order</dt><dd>{o.orderId} · arrived {fmtClock(o.arrivalTimeMs)} · {o.state}</dd></div>
        <div><dt>Lines</dt><dd>{o.lines.map((l) => `${l.productId} ×${l.quantity}`).join(" · ")}</dd></div>
        <div><dt>Reserved</dt><dd>{o.reservation.length > 0 ? o.reservation.map((r) => `${r.productId} @ ${r.locationId} (remaining ${r.quantity})`).join(" · ") : "No reservation (order not yet reserved or waiting for stock)"}</dd></div>
        <div><dt>Handling</dt><dd>Unit {o.unitId ?? "—"} · Packing {o.packingResourceId ?? "—"} · Slot {o.queueSlotId ?? "—"}</dd></div>
        <div><dt>Timestamps</dt><dd>{Object.entries(o.timestamps).map(([k, v]) => `${k} ${fmtClock(v)}`).join(" · ") || "No transitions yet"}</dd></div>
        {o.waitReason && <div><dt>Waiting</dt><dd>⏸ {o.waitReason}</dd></div>}
        {o.diagnostic && <div><dt>Diagnostic</dt><dd>! {o.diagnostic.code}: {o.diagnostic.message}</dd></div>}
      </dl>
    );
  }
  if (selection.kind === "location") {
    const l = scene.locations.find((x) => x.id === selection.id);
    if (!l) return <p>Unknown location.</p>;
    const stored = snap?.inventory.storage.find((s) => s.locationId === l.id);
    const storedQty = stored?.quantity ?? l.quantity;
    const productId = stored?.productId ?? l.productId;
    let reserved = 0;
    for (const r of snap?.inventory.reservations ?? []) {
      for (const line of r.lines) {
        for (const src of line.sources) {
          if (src.locationId === l.id) reserved += src.remaining;
        }
      }
    }
    const available = Math.max(0, storedQty - reserved);
    const product = productId ? scene.scenario.products.find((p) => p.id === productId) : undefined;
    const upv = l.unitsPerVisual;
    const vis = upv > 0 ? visualContainersForQty(storedQty, upv) : { full: 0, partial: 0 };
    return (
      <dl className="ops-facts">
        <div><dt>Slot</dt><dd>{l.id} · Rack {l.rackId} · Shelf deck {l.deck + 1} of 3</dd></div>
        <div><dt>Stored</dt><dd>{productId ? `${product?.label ?? productId} (${productId})` : "Empty slot (zero stock)"}</dd></div>
        <div><dt>Ledger</dt><dd>Stored {storedQty} · Reserved {reserved} (of stored) · Available {available}</dd></div>
        <div><dt>Visual</dt><dd>{storedQty === 0 ? "No containers" : `${vis.full} full + ${vis.partial > 0 ? `1 partial ×${vis.partial}` : "0 partial"} containers`}</dd></div>
        <div><dt>Pick approach</dt><dd>Aisle point ({l.approachMm.x}, {l.approachMm.z})</dd></div>
      </dl>
    );
  }
  if (selection.kind === "rack") {
    const slots = scene.locations.filter((x) => x.rackId === selection.id);
    const live = (id: string): string => {
      const s = snap?.inventory.storage.find((x) => x.locationId === id);
      if (!s?.productId) return `${id} empty`;
      return `${id} ${s.productId}×${s.quantity}`;
    };
    return (
      <dl className="ops-facts">
        <div><dt>Rack</dt><dd>{selection.id} · {slots.length} modeled slots · top deck bare (not counted)</dd></div>
        <div><dt>Slots</dt><dd>{slots.map((l) => live(l.id)).join(" · ")}</dd></div>
      </dl>
    );
  }
  if (selection.kind === "unit") {
    const u = snap?.units.find((x) => x.unitId === selection.id);
    const meta = scene.units.find((x) => x.id === selection.id);
    if (!u || !meta) return <p>Unknown unit.</p>;
    const openWaits = (snap?.waits ?? []).filter((w) => w.unitId === u.unitId && w.endMs === null);
    const target = u.authorizedRoute
      ? `(${u.authorizedRoute.destination.x}, ${u.authorizedRoute.destination.z}) · plan v${u.authorizedRoute.planVersion} · ${u.authorizedRoute.points.length} points`
      : u.transportState === "idle" && u.task.kind === "idle"
        ? (u.role === "putaway" ? "Idle at parking (putaway has no tasks in this slice)" : "Idle: no assignment (see order states)")
        : "Awaiting movement grant (no authorized plan)";
    return (
      <dl className="ops-facts">
        <div><dt>Unit</dt><dd>{u.unitId} · {u.role} · {isUnitOperationallyBusy(u) ? "busy" : "idle"} (wheels {u.transportState})</dd></div>
        <div><dt>Task</dt><dd>{taskText(u.task)}</dd></div>
        <div><dt>Position</dt><dd>({u.pose.x}, {u.pose.z})</dd></div>
        <div><dt>Target</dt><dd>{target}</dd></div>
        <div><dt>Carried</dt><dd>{u.carried.length > 0 ? `${u.carried.map((l) => `${l.productId} ×${l.quantity}`).join(" + ")} · ${u.carriedCostUnits}/${u.loadCapacityUnits} cost units` : `Empty · 0/${u.loadCapacityUnits} cost units`}</dd></div>
        <div><dt>Wait</dt><dd>{openWaits.length > 0 ? openWaits.map((w) => `⏸ ${w.reason} for ${((snap?.clockMs ?? w.startMs) - w.startMs) / 1000}s: ${w.detail}`).join(" · ") : "No open wait"}</dd></div>
      </dl>
    );
  }
  const r = scene.resources.find((x) => x.id === selection.id);
  if (!r) return <p>Unknown station.</p>;
  const kindLabel = r.kind === "receiving" ? "Receiving" : r.kind === "packing" ? "Packing" : "Dispatch";
  const packing = snap?.packing.find((p) => p.resourceId === r.id);
  if (!packing) {
    return (
      <dl className="ops-facts">
        <div><dt>Station</dt><dd>{r.id} · {kindLabel}</dd></div>
        <div><dt>Queues</dt><dd>No engine queue in this slice (picking/packing only)</dd></div>
      </dl>
    );
  }
  const occupant = (slotId: string | null): string => {
    if (!slotId) return "—";
    const job = packing.jobs.find((j) => j.queueSlotId === slotId && j.state === "queued");
    return job ? `${job.jobId} (queued)` : "free";
  };
  return (
    <dl className="ops-facts">
      <div><dt>Station</dt><dd>{r.id} · {kindLabel} · {r.serviceCapacity} service {r.serviceCapacity === 1 ? "lane" : "lanes"} · {packing.serviceDurationMs / 1000}s service</dd></div>
      <div><dt>Queue slots</dt><dd>{r.queue.map((q) => `${q.id}: ${occupant(q.id)}`).join(" · ")}</dd></div>
      <div><dt>Jobs</dt><dd>{packing.jobs.length > 0 ? packing.jobs.map((j) => `${j.jobId} ${j.state}${j.queueSlotId ? ` @${j.queueSlotId}` : ""}${j.positionId ? ` lane ${j.positionId}` : ""}${j.waitMs !== null ? ` waited ${j.waitMs / 1000}s` : ""}`).join(" · ") : "No jobs placed"}</dd></div>
      <div><dt>Approaching</dt><dd>{packing.approachingJobId ?? "None"}</dd></div>
      <div><dt>Packed output</dt><dd>{packing.packedOutput.length > 0 ? `${packing.packedOutput.map((o) => `${o.orderId} ×${o.costUnits}`).join(" + ")} · ${packing.outputUsedUnits}/${packing.outputStagingCapacity} units staged` : `Empty · 0/${packing.outputStagingCapacity} units staged`}</dd></div>
    </dl>
  );
}

export function OperationsPanel(props: { run: OpsRunState; onResetRun: () => void }): React.JSX.Element {
  const { run, onResetRun } = props;
  const [selection, setSelection] = useState<OperationsSelection>(null);
  const [labelLayer, setLabelLayer] = useState<LabelLayer>("areas");
  const [stats, setStats] = useState<OpsRenderStats | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [completion, setCompletion] = useState<{ stage: string; detail?: string; note?: string } | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [perf, setPerf] = useState<PerfCounters>(ZERO_PERF);
  const perfRef = useRef<PerfCounters>({ ...ZERO_PERF });
  const wallStartRef = useRef<number | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  const controller = "error" in run ? null : run.controller;
  const scene = "error" in run ? null : run.scene;

  // Sync the presented snapshot from the retained engine: on mount, on
  // controller replacement (Reset), and when returning from Planning mode.
  useEffect(() => {
    if (!controller) {
      setSnapshot(null);
      setCompletion(null);
      return;
    }
    try {
      setSnapshot(controller.snapshot());
      setCompletion(controller.getCompletionStatus());
      setDiagnostic(null);
      setEngineError(null);
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e));
      setPlaying(false);
    }
    setPlaying(false);
    perfRef.current = { ...ZERO_PERF };
    wallStartRef.current = null;
    setPerf({ ...ZERO_PERF });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  // The bounded timeline always shows the most recent committed events;
  // full history stays reachable by scrolling up (keyboard: focus + arrows).
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snapshot?.timeline.length]);

  // Auto-pause on terminal engine states (state retained, never rerun).
  useEffect(() => {
    if (!playing || !completion) return;
    if (completion.stage === "SUPPORTED_STAGE_COMPLETE" || completion.stage === "BLOCKED" || completion.stage === "WINDOW_ENDED") {
      setPlaying(false);
    }
  }, [playing, completion]);

  // Playback: each browser frame advances the REAL engine to a monotonic
  // integer-ms target from elapsed presentation time. Speed changes and
  // pause/resume restart this effect, resetting the wall origin without
  // touching configured operation durations. Snapshots commit at a 40ms
  // presentation cadence (~25Hz) so React never re-renders per frame;
  // the engine itself processes every event up to the target (no dropped
  // work after frame jank).
  useEffect(() => {
    if (!playing || !controller) return;
    let raf = 0;
    const wallOrigin = performance.now();
    const simOrigin = controller.getClockMs();
    let lastSnapWall = 0;
    let lastSnapClock = -1;
    if (wallStartRef.current === null) wallStartRef.current = performance.now();
    const perfAcc = perfRef.current;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const target = simOrigin + Math.max(0, Math.floor((now - wallOrigin) * speed));
      const cur = controller.getClockMs();
      if (target > cur) {
        const a0 = performance.now();
        try {
          controller.advanceTo(target);
        } catch (e) {
          setEngineError(e instanceof Error ? e.message : String(e));
          setPlaying(false);
          return;
        }
        const dt = performance.now() - a0;
        perfAcc.advances += 1;
        perfAcc.advanceMsTotal += dt;
        if (dt > perfAcc.advanceMsMax) perfAcc.advanceMsMax = dt;
      }
      perfAcc.frames += 1;
      const clock = controller.getClockMs();
      if (clock !== lastSnapClock && now - lastSnapWall >= 40) {
        lastSnapWall = now;
        lastSnapClock = clock;
        try {
          const snap = controller.snapshot();
          const done = controller.getCompletionStatus();
          perfAcc.snapshots += 1;
          perfAcc.wallMs = (wallStartRef.current === null ? now : now - wallStartRef.current);
          setSnapshot(snap);
          setCompletion(done);
          setPerf({ ...perfAcc });
          if (done.stage === "BLOCKED") {
            const d = controller.getDiagnostic();
            setDiagnostic(d ? `${d.status}: ${d.detail}` : "Blocked (no further diagnostic)");
          } else {
            setDiagnostic(null);
          }
        } catch (e) {
          setEngineError(e instanceof Error ? e.message : String(e));
          setPlaying(false);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      // Presentation pause: one final sync so the shown state always
      // matches the retained engine clock.
      try {
        if (controller) {
          setSnapshot(controller.snapshot());
          setCompletion(controller.getCompletionStatus());
          setPerf({ ...perfRef.current });
        }
      } catch {
        // Keep the last good snapshot; the error surface stays below.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, controller]);

  if ("error" in run || !scene || !controller) {
    return (
      <div className="panel" data-testid="ops-panel">
        <h2>Operations Simulation</h2>
        <p role="alert" className="error">
          Operations failed to load: {"error" in run ? run.error : "unknown error"}. No warehouse is shown; the Storage Planning mode is unaffected.
        </p>
        <p className="actions"><button type="button" onClick={onResetRun} data-testid="ops-retry">Retry</button></p>
      </div>
    );
  }

  const c = scene.counts;
  const snap = snapshot;
  const started = snap !== null && (snap.clockMs > 0 || snap.timeline.length > 0);
  const badge = stateBadge(started, playing, engineError, completion);
  const durations = burstHandlingDurations();
  const signature = snap ? buildOpsSnapshotSignature(snap) : "";
  const selectValue = selection ? `${selection.kind}:${selection.id}` : "";
  const stepOnce = (): void => {
    if (playing || !controller) return;
    try {
      controller.stepEvent();
      setSnapshot(controller.snapshot());
      const done = controller.getCompletionStatus();
      setCompletion(done);
      if (done.stage === "BLOCKED") {
        const d = controller.getDiagnostic();
        setDiagnostic(d ? `${d.status}: ${d.detail}` : "Blocked (no further diagnostic)");
      }
      setEngineError(null);
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e));
    }
  };
  const doReset = (): void => {
    setPlaying(false);
    setSelection(null);
    onResetRun();
  };

  const activeAgents = snap?.units.filter(isUnitOperationallyBusy).length ?? 0;
  const packingJobs = (snap?.packing ?? []).flatMap((p) => p.jobs.map((j) => ({ ...j, resourceId: p.resourceId })));
  const queuedJobs = packingJobs.filter((j) => j.state === "queued");
  const arrivedUnits = (snap?.units ?? []).filter((u) =>
    u.task.kind === "in-queue" || u.task.kind === "to-service" || u.task.kind === "unloading" || u.task.kind === "awaiting-service-start",
  ).length;
  const timeline = snap?.timeline ?? [];
  const pickerCount = scene.units.filter((u) => u.role === "picker").length;
  const putawayCount = scene.units.filter((u) => u.role === "putaway").length;
  const packingResources = scene.resources.filter((r) => r.kind === "packing");
  const packingText =
    packingResources.length > 0 && packingResources.every((r) => r.serviceCapacity === 1)
      ? `${packingResources.length} single-lane packing`
      : `${packingResources.length} packing (${packingResources.map((r) => r.serviceCapacity).join("+")} lanes)`;

  return (
    <div data-testid="ops-panel" data-ops-signature={signature} data-ops-clock={snap?.clockMs ?? -1} data-perf-frames={perf.frames} data-perf-advances={perf.advances} data-perf-advance-total={perf.advanceMsTotal} data-perf-snapshots={perf.snapshots}>
      <div className="ops-status" data-testid="ops-status" data-ops-state={badge.label} data-ops-speed={`${speed}x`} data-ops-playing={playing ? "true" : "false"}>
        <span className={`badge ${badge.cls}`} data-testid="ops-state-badge">{badge.cls === "valid" ? "✓ " : badge.cls === "warn" ? "⏸ " : badge.cls === "invalid" ? "× " : "○ "}{badge.label}</span>
        <span className="mono">
          {scene.scenario.id} · seed {scene.scenario.seed} · pick {durations.pickDurationMsPerItem / 1000}s/item · unload {durations.unloadDurationMsPerItem / 1000}s/item
        </span>
        <span className="ops-clock mono" data-testid="ops-clock" aria-label="Simulation clock">⏱ {snap ? fmtClock(snap.clockMs) : "—"}</span>
        <div className="ops-controls" role="group" aria-label="Simulation playback controls">
          {playing ? (
            <button type="button" className="primary" onClick={() => setPlaying(false)} data-testid="ops-pause">⏸ Pause</button>
          ) : (
            <button type="button" className="primary" onClick={() => { setEngineError(null); setPlaying(true); }} disabled={engineError !== null || completion?.stage === "SUPPORTED_STAGE_COMPLETE"} title={completion?.stage === "SUPPORTED_STAGE_COMPLETE" ? "Stage complete; Reset starts a new run from the same inputs" : engineError ? `Engine error: ${engineError}` : "Run the engine"} data-testid="ops-run">▶ Run</button>
          )}
          <button type="button" onClick={doReset} data-testid="ops-reset">↺ Reset</button>
          <button type="button" onClick={stepOnce} disabled={playing || engineError !== null} title={playing ? "Pause before stepping a single event" : "Advance exactly one engine event"} data-testid="ops-step">Step event</button>
          <div className="segmented" role="group" aria-label="Playback speed">
            {([1, 4, 16] as Speed[]).map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)} data-testid={`ops-speed-${s}`}>{s}×</button>
            ))}
          </div>
        </div>
        <span className="hint">SYNTHETIC picking-to-packing burst: {c.orders} orders · {pickerCount} pickers + {putawayCount} putaway · {packingText}. A model was not used in this run; engine-running is not LIVE inference.</span>
        {completion?.stage === "SUPPORTED_STAGE_COMPLETE" && (
          <span className="hint" data-testid="ops-complete-note">Complete: all {snap?.counts.shipped} orders SHIPPED · unshipped backlog {snap?.counts.backlog} · stage backlog {snap?.counts.stageBacklog}.</span>
        )}
        {completion?.stage === "BLOCKED" && (
          <span className="hint" role="alert" data-testid="ops-blocked-note">⚠ Blocked: {diagnostic ?? "see inspector and timeline"} · orders and inventory preserved · no teleporting or task deletion.</span>
        )}
        {engineError && (
          <span className="hint error" role="alert" data-testid="ops-error-note">Engine error: {engineError} · state retained at {snap ? fmtClock(snap.clockMs) : "—"} · Reset starts a new run.</span>
        )}
      </div>

      <div className="metrics ops-metrics" data-testid="ops-metrics" aria-label="Operations metrics">
        <div className="metric"><div><p className="metric-label">Arrived orders</p><p className="metric-value" data-testid="ops-m-arrived">{snap ? `${snap.counts.arrived}/${snap.counts.selected}` : "—"}</p><p className="metric-caption">Scheduled burst arrivals so far</p></div></div>
        <div className="metric"><div><p className="metric-label">Ready for dispatch</p><p className="metric-value" data-testid="ops-m-ready">{snap?.counts.readyForDispatch ?? "—"}</p><p className="metric-caption">Packed {snap?.counts.packed ?? "—"} · stage backlog {snap?.counts.stageBacklog ?? "—"}</p></div></div>
        <div className="metric"><div><p className="metric-label">Shipped / backlog</p><p className="metric-value" data-testid="ops-m-backlog">{snap?.counts.shipped ?? "—"} / {snap?.counts.backlog ?? "—"}</p><p className="metric-caption">Unshipped backlog = arrived − shipped</p></div></div>
        <div className="metric"><div><p className="metric-label">Active agents</p><p className="metric-value" data-testid="ops-m-agents">{snap ? `${activeAgents}/${snap.units.length}` : "—"}</p><p className="metric-caption">On task or wheels engaged (true idle excluded)</p></div></div>
        <div className="metric"><div><p className="metric-label">Packing queue</p><p className="metric-value" data-testid="ops-m-queue">{snap ? `${queuedJobs.length} jobs · ${arrivedUnits} arrived` : "—"}</p><p className="metric-caption">Jobs placed (some still travelling) · units physically at a station</p></div></div>
      </div>

      {snap && snap.deliveries.length > 0 && (
        <div className="panel" data-testid="ops-deliveries" aria-label="Inbound deliveries">
          <h2>Inbound deliveries</h2>
          <ul className="ops-delivery-list">
            {snap.deliveries.map((d) => (
              <li key={d.deliveryId} data-delivery-id={d.deliveryId}>
                {d.deliveryId} · {d.state} · {d.lines.map((l) => `${l.productId} ×${l.quantity}`).join(" · ")}
                {d.waitReason ? ` · waiting: ${d.waitReason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ops-workspace">
        <div className="panel ops-viewport" data-testid="ops-viewport-panel">
          <div className="warehouse-head">
            <h2>Warehouse</h2>
            <span className="proxy-ribbon">SOURCED GEOMETRY · LIVE ENGINE</span>
          </div>
          <OperationsView scene={scene} snapshot={snap} selection={selection} labelLayer={labelLayer} onStats={setStats} />
        </div>
        <div className="panel" data-testid="ops-inspector">
          <h2>Inspector</h2>
          <div className="ops-select-block" data-testid="ops-entities">
            <label>
              Selected entity
              <select
                data-testid="ops-select"
                value={selectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setSelection(null);
                    return;
                  }
                  const [kind, id] = v.split(":");
                  if ((kind === "location" || kind === "rack" || kind === "unit" || kind === "resource" || kind === "order") && id) {
                    setSelection({ kind, id });
                  }
                }}
              >
                <option value="">None</option>
                <optgroup label="Orders">
                  {(snap?.orders ?? scene.scenario.orderSchedule.map((o) => ({ orderId: o.id, state: "—" }))).map((o) => (
                    <option key={o.orderId} value={`order:${o.orderId}`}>
                      {o.orderId} · {o.state}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Mobile units">
                  {scene.units.map((u) => {
                    const live = snap?.units.find((x) => x.unitId === u.id);
                    return (
                      <option key={u.id} value={`unit:${u.id}`}>{u.id} · {u.role}{live ? ` · ${unitOperationalLabel(live)}` : ""}</option>
                    );
                  })}
                </optgroup>
                <optgroup label="Storage slots">
                  {scene.locations.map((l) => {
                    const s = snap?.inventory.storage.find((x) => x.locationId === l.id);
                    const pid = s?.productId ?? l.productId;
                    const qty = s?.quantity ?? l.quantity;
                    return (
                      <option key={l.id} value={`location:${l.id}`}>
                        {l.id} · {pid ? `${pid} ×${qty}` : "empty"}
                      </option>
                    );
                  })}
                </optgroup>
                <optgroup label="Racks">
                  {scene.racks.map((r) => (
                    <option key={r.id} value={`rack:${r.id}`}>{r.id}</option>
                  ))}
                </optgroup>
                <optgroup label="Stations">
                  {scene.resources.map((r) => (
                    <option key={r.id} value={`resource:${r.id}`}>{r.id} · {r.kind}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <div className="segmented" role="group" aria-label="Label layer">
              {(["areas", "slots", "all"] as LabelLayer[]).map((layer) => (
                <button
                  key={layer}
                  type="button"
                  aria-pressed={labelLayer === layer}
                  className={labelLayer === layer ? "on" : ""}
                  onClick={() => setLabelLayer(layer)}
                  data-testid={`ops-labels-${layer}`}
                >
                  {layer === "areas" ? "Areas" : layer === "slots" ? "Slots" : "All"}
                </button>
              ))}
            </div>
            <p className="hint">Labels: area identities (racks, stations, units, entrances) or all 24 storage slots. Selection markers and chips follow the entity.</p>
          </div>
          {selection ? (
            selectionDetail(scene, snap, selection)
          ) : (
            <p className="hint">Select an order, mobile unit, storage slot, rack, or station to inspect its live engine state. Use Inspect in the viewport to frame it.</p>
          )}
          <h3>Resource queues</h3>
          <div data-testid="ops-queues">
            {(snap?.packing ?? []).map((p) => {
              const queued = p.jobs.filter((j) => j.state === "queued");
              const busy = p.jobs.filter((j) => j.state === "in-service" || j.state === "output-held");
              return (
                <p className="hint" key={p.resourceId}>
                  {p.resourceId}: {queued.length > 0 ? queued.map((j) => `${j.jobId} queued${j.queueSlotId ? ` @${j.queueSlotId}` : " (travelling)"} since ${fmtClock(j.enqueueTimeMs)}`).join(" · ") : "queue empty"}
                  {busy.length > 0 ? ` · lane: ${busy.map((j) => `${j.jobId} ${j.state}${j.positionId ? ` ${j.positionId}` : ""}`).join(" · ")}` : " · lane idle"}
                  {p.approachingJobId ? ` · approaching: ${p.approachingJobId}` : ""}
                </p>
              );
            })}
            {(!snap || snap.packing.length === 0) && <p className="hint">No packing jobs placed yet.</p>}
          </div>
        </div>
      </div>

      <div className="panel" data-testid="ops-timeline-panel">
        <h2>Event timeline <span className="h2sub">committed engine events only · {timeline.length} events</span></h2>
        {timeline.length === 0 ? (
          <p className="hint" data-testid="ops-timeline-empty">No events committed yet — Run or Step the engine.</p>
        ) : (
          <div className="table-scroll ops-timeline-scroll" tabIndex={0} role="region" aria-label="Committed engine events" ref={timelineScrollRef}>
            <table data-testid="ops-timeline">
              <thead><tr><th>Time</th><th>Event</th><th>Order</th><th>Unit</th><th>Detail</th></tr></thead>
              <tbody>
                {timeline.map((e) => (
                  <tr key={e.seq}><td className="mono">{fmtClock(e.timeMs)}</td><td>{e.kind}</td><td className="mono">{e.orderId ?? "—"}</td><td className="mono">{e.unitId ?? "—"}</td><td>{e.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className="panel ops-diagnostics" data-testid="ops-diagnostics">
        <summary>
          Developer diagnostics: dimensions, assets, renderer counts ({c.containers} containers · {stats ? `${stats.drawCalls} draws · ${(stats.triangles / 1_000_000).toFixed(1)}M tris` : "render pending"})
        </summary>
        <div className="mono ops-diag-grid">
          <section>
            <h3>Fixture</h3>
            <p>fixtures/operations/picking-packing-burst.json · {scene.scenario.id} · schema {scene.scenario.schemaVersion}</p>
            <p>Derived from main-warehouse-1: room/rack/obstacle/location/resource/mobile-unit spatial identity verified field by field before binding visuals.</p>
            <p>Room {scene.roomMm.width}×{scene.roomMm.depth} mm · racks {c.racks} · slots {c.locations} · products {c.products} · stock entries {c.stockEntries} · units {c.units} · resources {c.resources} · orders {c.orders} · deliveries {c.deliveries} · obstacles {c.obstacles}</p>
            <p>Seed {scene.scenario.seed} · run {scene.scenario.policies.run.mode} {scene.scenario.policies.run.mode === "fixed-window" ? scene.scenario.policies.run.horizonMs : scene.scenario.policies.run.arrivalCutoffMs} ms</p>
            <p>Engine {snap?.versions.operationsEngine ?? "—"} · schema {snap?.versions.operationsSchema ?? "—"} · sim {snap?.versions.simulation ?? "—"}</p>
          </section>
          <section>
            <h3>Assets</h3>
            <ul>
              {(stats?.assets ?? []).map((a) => (
                <li key={a.url}>{a.url} — {a.status}{a.status !== "loaded" ? ` (${a.detail})` : ""}</li>
              ))}
              {(!stats || stats.assets.length === 0) && <li>Asset load in progress…</li>}
            </ul>
            <p>Containers: {scene.containerGlbs.map((g) => `${g.asset.split("/")[1]} ×${g.count}`).join(" · ")}</p>
            <p>Materials (R1): v2 derivatives preserve source material splits + st UVs; box/crate embed their source PNG textures. Cart/floor/rack v2 splits use documented replacement PBR factors (their texture closures are too large or UDIM — see docs/WAREHOUSE_R1_RENDER_REVIEW.md). Walls/entrance/packing tables remain v1 with role PBR replacements. Source MDL (OmniPBR) fidelity is never claimed.</p>
            {stats?.materialSummary && <p>Loaded material modes: {stats.materialSummary}</p>}
            {stats?.carryFit && <p>Carry fit: {stats.carryFit}</p>}
            <p>Solid cargo in carts: {stats?.cargoSolid ?? 0} item(s) as sourced carton meshes at exact SKU bounds (empty carts show empty equipment; wireframe bounds appear only on the All diagnostic label layer).</p>
          </section>
          <section>
            <h3>Renderer</h3>
            <p>{stats ? `Triangles ${stats.triangles} · draw calls ${stats.drawCalls} · geometries ${stats.geometries} · load ${stats.loadMs ?? "…"} ms` : "Render pending."}</p>
            <p>Renderer: {stats?.gpu ?? "unavailable"}</p>
            <p>Playback: {perf.frames} rAF callbacks · {perf.advances} engine advances · avg advance {(perf.advances > 0 ? (perf.advanceMsTotal / perf.advances).toFixed(2) : "—")} ms · max advance {perf.advanceMsMax.toFixed(2)} ms · {perf.snapshots} snapshots · {(perf.wallMs / 1000).toFixed(1)}s wall</p>
            <p>Renders: {stats ? `${stats.renders} WebGL renders · avg render CPU ${(stats.renders > 0 ? (stats.renderMsTotal / stats.renders).toFixed(2) : "—")} ms · max render CPU ${stats.renderMsMax.toFixed(2)} ms · ${(stats.renderSpanMs / 1000).toFixed(1)}s span` : "Render pending."}</p>
            <p>Custom annotations (not sourced geometry): room outline, staging outlines + wash, waiting discs, service octahedra, parking outlines, selected-approach marker, route overlay (authorized plan points only), carried-load attachments, text chips + leader lines, 2.5 m shell cutaway.</p>
            <p>Load errors, if any, appear in the viewport status line and above; failed assets render nothing (no silent proxy cubes).</p>
          </section>
        </div>
      </details>
    </div>
  );
}
