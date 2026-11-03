// M3c operations playback: engine-connected truth in the real app.
//
// Cargo-C2 model (centered 680x1220+100 r799, capacity 4, consistent disc
// occupancy). Playback is wall-paced and software GL renders take tens of
// seconds per frame, so wall sleeps never imply a clock: every run pauses,
// reads the EXACT sim clock (data-ops-clock, integer ms), derives the
// expected UI readings headlessly at that clock (ops-facts.mjs), and
// asserts the UI matches, plus exact signature parity (ops-signature.mjs).
// Gates kept: ready/reset, unit truth, waiting-state witness (stepped to
// an exact event clock inside a long open wait), order/stock truth,
// Step-event/Reset determinism (direct button verification + headless
// parity at a strict event-time gap), speeds + stage completion.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

type Facts = {
  clockMs: number;
  busyCount: number;
  completion: string;
  units: Record<
    string,
    {
      role: string;
      busy: boolean;
      transport: string;
      task: string;
      slotId: string | null;
      resourceId: string | null;
      orderId: string | null;
      legIndex: number | null;
      carried: [string, number][];
      cost: number;
      cap: number;
      plan: { dx: number; dz: number; ver: number; pts: number } | null;
      pose: { x: number; z: number };
      openWait: { reason: string; startMs: number; detail: string } | null;
    }
  >;
  orders: Record<string, { state: string; unitId: string | null; stops: string; stopCoords: [number, number][] }>;
  locations: Record<string, { productId: string | null; qty: number; full: number; partial: number }>;
};

test.describe("operations playback", () => {
  test.setTimeout(900_000);

  async function opsClockMs(page: Page): Promise<number> {
    return Number(await page.getByTestId("ops-panel").getAttribute("data-ops-clock"));
  }

  async function opsSignature(page: Page): Promise<string> {
    return (await page.getByTestId("ops-panel").getAttribute("data-ops-signature")) ?? "";
  }

  const factsHelper = fileURLToPath(new URL("./helpers/ops-facts.mjs", import.meta.url));
  const signatureHelper = fileURLToPath(new URL("./helpers/ops-signature.mjs", import.meta.url));

  function headlessSignature(clockMs: number): string {
    return execFileSync("node", [signatureHelper, String(clockMs)], {
      encoding: "utf8",
      timeout: 120_000,
    })
      .trim()
      .replace(/^\uFEFF/, "");
  }

  function headlessFacts(clockMs: number): Facts {
    return JSON.parse(
      execFileSync("node", [factsHelper, String(clockMs)], {
        encoding: "utf8",
        timeout: 120_000,
      }).replace(/^\uFEFF/, ""),
    ) as Facts;
  }

  async function renderCount(page: Page): Promise<number> {
    return Number(await page.getByTestId("ops-canvas").getAttribute("data-renders"));
  }

  // Click Step and wait for the resulting render commit (renders increment
  // strictly after the clock/signature datasets refresh), then return the
  // exact clock. Renders are slow on software GL; the poll is bounded.
  async function stepOnceExact(page: Page): Promise<number> {
    const before = await renderCount(page);
    await page.getByTestId("ops-step").click();
    await expect.poll(() => renderCount(page), { timeout: 300_000 }).toBeGreaterThan(before);
    return opsClockMs(page);
  }

  async function ensurePaused(page: Page): Promise<void> {
    // The app auto-pauses on terminal states; only click when playing.
    if ((await page.getByTestId("ops-status").getAttribute("data-ops-playing")) === "true") {
      await page.getByTestId("ops-pause").click();
    }
    await expect(page.getByTestId("ops-status")).toHaveAttribute("data-ops-playing", "false");
  }

  // Run until the shown clock reaches targetMs, pause, prove the clock is
  // frozen, and return the exact clock. No upper bound: renders are slow
  // on software GL, so callers derive expectations at the exact clock.
  async function runPauseExact(page: Page, targetMs: number): Promise<number> {
    await page.getByTestId("ops-run").click();
    await expect.poll(() => opsClockMs(page), { timeout: 300_000 }).toBeGreaterThanOrEqual(targetMs);
    await ensurePaused(page);
    const first = await opsClockMs(page);
    await page.waitForTimeout(1_000);
    expect(await opsClockMs(page)).toBe(first);
    return first;
  }

  // Independent twin of the panel's taskText (oracle, not shared code).
  function expectedTaskText(f: Facts["units"][string]): string {
    switch (f.task) {
      case "idle":
        return "Idle";
      case "to-pick":
        return `Moving to pick ${f.orderId} (stop ${(f.legIndex ?? 0) + 1})`;
      case "picking":
        return `Picking ${f.orderId} (stop ${(f.legIndex ?? 0) + 1})`;
      case "awaiting-queue-slot":
        return `Awaiting packing queue slot at ${f.resourceId}`;
      case "awaiting-head":
        return `Holding outside queue for head at ${f.resourceId}`;
      case "to-queue":
        return `Moving to queue slot ${f.slotId}`;
      case "in-queue":
        return `Waiting in queue slot ${f.slotId}`;
      case "to-service":
        return `Moving to service lane at ${f.resourceId}`;
      case "unloading":
        return `Unloading at ${f.resourceId}`;
      case "awaiting-staging":
        return `Awaiting staged input at ${f.resourceId}`;
      case "awaiting-service-start":
        return `Awaiting service start at ${f.resourceId}`;
      case "to-vacate":
        return `Vacating service to ${f.slotId}`;
      case "to-parking":
        return "Returning to parking";
      default:
        return f.task;
    }
  }

  async function expectUnitInspector(page: Page, unitId: string, f: Facts["units"][string], clockMs: number): Promise<void> {
    await page.getByTestId("ops-select").selectOption(`unit:${unitId}`);
    const inspector = page.getByTestId("ops-inspector");
    await expect(inspector).toContainText(`${unitId} · ${f.role} · ${f.busy ? "busy" : "idle"} (wheels ${f.transport})`);
    await expect(inspector).toContainText(expectedTaskText(f));
    await expect(inspector).toContainText(`(${f.pose.x}, ${f.pose.z})`);
    if (f.plan) {
      await expect(inspector).toContainText(`(${f.plan.dx}, ${f.plan.dz}) · plan v${f.plan.ver} · ${f.plan.pts} points`);
    } else if (f.transport === "idle" && f.task === "idle") {
      await expect(inspector).toContainText(
        f.role === "putaway" ? "Idle at parking (putaway has no tasks in this slice)" : "Idle: no assignment (see order states)",
      );
    } else {
      await expect(inspector).toContainText("Awaiting movement grant (no authorized plan)");
    }
    if (f.carried.length > 0) {
      await expect(inspector).toContainText(`${f.carried.map(([p, q]) => `${p} ×${q}`).join(" + ")} · ${f.cost}/${f.cap} cost units`);
    } else {
      await expect(inspector).toContainText(`Empty · 0/${f.cap} cost units`);
    }
    if (f.openWait) {
      const secs = (clockMs - f.openWait.startMs) / 1000;
      await expect(inspector).toContainText(`⏸ ${f.openWait.reason} for ${secs}s: ${f.openWait.detail}`);
    } else {
      await expect(inspector).toContainText("No open wait");
    }
  }

  function expectedStopsDataset(order: Facts["orders"][string]): string {
    if (!order.stops) return "";
    const states = order.stops.split(",");
    return states.map((s, i) => `${i + 1}:${order.stopCoords[i]![0]},${order.stopCoords[i]![1]}:${s}`).join(";");
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/?mode=operations");
    await expect(page.getByTestId("ops-status")).toContainText("picking-packing-burst");
    await expect(page.getByTestId("ops-asset-status")).toContainText("sourced assets loaded", { timeout: 120_000 });
  });

  test("loads at READY and resets to the frozen inputs", async ({ page }) => {
    await expect(page.getByTestId("ops-state-badge")).toContainText("READY");
    await expect(page.getByTestId("ops-clock")).toContainText("00:00.000");
    expect(await opsClockMs(page)).toBe(0);
    await page.getByTestId("ops-run").click();
    await page.getByTestId("ops-pause").click();
    await page.getByTestId("ops-reset").click();
    await expect(page.getByTestId("ops-clock")).toContainText("00:00.000");
    expect(await opsClockMs(page)).toBe(0);
  });

  test("mid-run unit truth matches the engine at the exact paused clock", async ({ page }) => {
    const pausedAt = await runPauseExact(page, 30_000);
    const facts = headlessFacts(pausedAt);
    expect(facts.clockMs).toBe(pausedAt);
    await expect(page.getByTestId("ops-m-agents")).toContainText(`${facts.busyCount}/6`);
    await expectUnitInspector(page, "PK-1", facts.units["PK-1"]!, pausedAt);
    // Route overlay: shown plan identity is exact; the split vertex is the
    // exact engine pose (never snapped); counts bracket the plan length.
    const canvas = page.getByTestId("ops-canvas");
    const plan = facts.units["PK-1"]!.plan;
    if (plan) {
      await expect(canvas).toHaveAttribute("data-route-shown", `PK-1:v${plan.ver}:${plan.pts}pts`);
      // The split vertex is the exact engine pose (never snapped); the
      // segment index brackets the plan. Poll for the pose-prefixed value
      // (selection commits lag a render behind on software GL).
      const posePrefix = `${facts.units["PK-1"]!.pose.x},${facts.units["PK-1"]!.pose.z}:seg`;
      await expect
        .poll(() => canvas.getAttribute("data-route-split"), { timeout: 120_000 })
        .toMatch(new RegExp(`^${posePrefix}(\\d+)$`));
      const split = (await canvas.getAttribute("data-route-split")) ?? "";
      const seg = Number(/^(\d+),(\d+):seg(\d+)$/.exec(split)![3]);
      expect(seg).toBeGreaterThanOrEqual(0);
      expect(seg).toBeLessThanOrEqual(plan.pts - 2);
    } else {
      await expect(canvas).toHaveAttribute("data-route-shown", "none");
      await expect(canvas).toHaveAttribute("data-route-split", "none");
    }
    // Carry notes: every carried unit lists exact per-SKU ordinals, every
    // empty unit reports empty equipment, never overflow/blocker notes.
    const carry = (await canvas.getAttribute("data-carry")) ?? "";
    for (const [id, u] of Object.entries(facts.units)) {
      if (u.carried.length > 0) {
        expect(carry).toContain(`${id}:`);
        for (const [pid, qty] of u.carried) {
          for (let k = 1; k <= qty; k++) expect(carry).toContain(`${pid}#${k}`);
        }
      } else {
        expect(carry).toContain(`${id}: empty equipment`);
      }
    }
    expect(carry).not.toContain("OVERFLOW");
    expect(carry).not.toContain("nothing drawn");
    expect(await opsSignature(page)).toBe(headlessSignature(pausedAt));
  });

  test("waiting-state witness matches the engine at the exact paused clock", async ({ page }) => {
    // PK-2's TRAFFIC wait spans 52400..80900 headless-verified: run, pause,
    // then step event-by-event to the first clock strictly inside the
    // window (bounded steps from any pause below it; a fresh retry covers
    // a pause past 80900). Strictly inside: one step processes one event,
    // so landing exactly on 52400 can precede same-clock wait-open events
    // that headless advanceTo(52400) already ran; past the batch both agree.
    // Every landing clock in (52400, 80900) has the wait open.
    let pausedAt = -1;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await page.getByTestId("ops-reset").click();
      pausedAt = await runPauseExact(page, 40_000);
      if (pausedAt >= 80_900) continue;
      for (let i = 0; i < 25 && pausedAt <= 52_400; i++) {
        pausedAt = await stepOnceExact(page);
      }
      if (pausedAt > 52_400 && pausedAt < 80_900) break;
      pausedAt = -1;
    }
    expect(pausedAt, "landing inside PK-2 open wait 52400..80900").toBeGreaterThan(52_400);
    expect(pausedAt).toBeLessThan(80_900);
    const facts = headlessFacts(pausedAt);
    const pk2 = facts.units["PK-2"]!;
    expect(pk2.openWait, "headless PK-2 open wait").toBeTruthy();
    await expectUnitInspector(page, "PK-2", pk2, pausedAt);
    await expect(page.getByTestId("ops-inspector")).toContainText("TRAFFIC");
    expect(await opsSignature(page)).toBe(headlessSignature(pausedAt));
  });

  test("order lifecycle and stock truth match the engine at the exact paused clock", async ({ page }) => {
    const pausedAt = await runPauseExact(page, 30_000);
    const facts = headlessFacts(pausedAt);
    const canvas = page.getByTestId("ops-canvas");
    await page.getByTestId("ops-select").selectOption("order:B-01");
    await expect(canvas).toHaveAttribute("data-route-stops", expectedStopsDataset(facts.orders["B-01"]!));
    await page.getByTestId("ops-select").selectOption("order:B-05");
    await expect(canvas).toHaveAttribute("data-route-stops", expectedStopsDataset(facts.orders["B-05"]!));
    await page.getByTestId("ops-select").selectOption("location:L01");
    const l01 = facts.locations["L01"]!;
    const inspector = page.getByTestId("ops-inspector");
    await expect(inspector).toContainText(`Stored ${l01.qty}`);
    await expect(inspector).toContainText(
      l01.partial > 0 ? `${l01.full} full + 1 partial ×${l01.partial} containers` : `${l01.full} full + 0 partial containers`,
    );
    await expect(canvas).toHaveAttribute("data-containers", "336");
    expect(await opsSignature(page)).toBe(headlessSignature(pausedAt));
  });

  test("Step-event Reset determinism matches the headless oracle exactly", async ({ page }) => {
    // Direct Step-button verification: 4 step events land deterministically
    // on clock 5000 (next event 10000: strict gap, so advanceTo(5000) is
    // the identical state). Same 4 steps after Reset reproduce it, and the
    // headless oracle agrees.
    for (let i = 0; i < 4; i++) await stepOnceExact(page);
    const clockA = await opsClockMs(page);
    expect(clockA).toBe(5_000);
    const sigA = await opsSignature(page);
    await page.getByTestId("ops-reset").click();
    expect(await opsClockMs(page)).toBe(0);
    for (let i = 0; i < 4; i++) await stepOnceExact(page);
    expect(await opsClockMs(page)).toBe(5_000);
    expect(await opsSignature(page)).toBe(sigA);
    expect(sigA).toBe(headlessSignature(5_000));
  });

  test("speeds reach stage completion with exact parity", async ({ page }) => {
    await page.getByTestId("ops-speed-4").click();
    await page.getByTestId("ops-run").click();
    await expect.poll(() => opsClockMs(page), { timeout: 300_000 }).toBeGreaterThanOrEqual(20_000);
    await page.getByTestId("ops-speed-16").click();
    await expect(page.getByTestId("ops-state-badge")).toContainText("STAGE COMPLETE", { timeout: 600_000 });
    await expect(page.getByTestId("ops-complete-note")).toContainText("6 orders READY_FOR_DISPATCH");
    await expect(page.getByTestId("ops-complete-note")).toContainText("shipped 0");
    await ensurePaused(page);
    const endClock = await opsClockMs(page);
    expect(await opsSignature(page)).toBe(headlessSignature(endClock));
    expect(await page.getByTestId("ops-canvas").getAttribute("data-containers")).toBe("336");
  });
});
