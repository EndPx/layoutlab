// M3c operations evidence: exhibit screenshots, playback recording, and
// renderer/perf facts (cargo-C2 model: integrated luggage-platform carts,
// 2 equipment docks x 2 cells, wireframe bounds markers from canonical
// SKU dims). Artifact series prefix defaults to m3c-final (env
// M3C_EVIDENCE_PREFIX overrides); the historical v3-m3c-* series is
// preserved, never overwritten. Wall-paced playback with slow software
// GL: every capture pauses, reads the EXACT sim clock, derives expected
// readings headlessly (ops-facts.mjs), and asserts the UI matches, plus
// exact signature parity. Exact clocks are logged for traceability (the
// status band also shows the sim time in every shot).
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// Repo-root evidence dir (Playwright runs with cwd apps/web; a relative
// path would strand artifacts under apps/web/evidence).
const evidenceDir = fileURLToPath(new URL("../../../evidence/sanitized", import.meta.url));
const evidencePrefix = process.env.M3C_EVIDENCE_PREFIX ?? "m3c-final";
const channelTag = (() => {
  const channel = (process.env.M3C_CHANNEL ?? "").toLowerCase();
  if (channel.includes("edge")) return "edge";
  if (channel.includes("chrome")) return "chrome";
  return "chromium";
})();

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
      carried: [string, number][];
      cost: number;
      cap: number;
    }
  >;
  locations: Record<string, { productId: string | null; qty: number; full: number; partial: number }>;
};

test.describe("operations evidence", () => {
  test.setTimeout(900_000);

  async function collectErrors(page: Page): Promise<string[]> {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
    });
    return errors;
  }

  async function loadOps(page: Page): Promise<void> {
    await page.goto("/?mode=operations");
    await expect(page.getByTestId("ops-status")).toContainText("picking-packing-burst");
    await expect(page.getByTestId("ops-asset-status")).toContainText("sourced assets loaded", { timeout: 120_000 });
  }

  async function opsClockMs(page: Page): Promise<number> {
    return Number(await page.getByTestId("ops-panel").getAttribute("data-ops-clock"));
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

  async function ensurePaused(page: Page): Promise<void> {
    if ((await page.getByTestId("ops-status").getAttribute("data-ops-playing")) === "true") {
      await page.getByTestId("ops-pause").click();
    }
    await expect(page.getByTestId("ops-status")).toHaveAttribute("data-ops-playing", "false");
  }

  async function runPauseExact(page: Page, targetMs: number): Promise<number> {
    await page.getByTestId("ops-run").click();
    await expect.poll(() => opsClockMs(page), { timeout: 300_000 }).toBeGreaterThanOrEqual(targetMs);
    await ensurePaused(page);
    const first = await opsClockMs(page);
    await page.waitForTimeout(1_000);
    expect(await opsClockMs(page)).toBe(first);
    return first;
  }

  test("loaded operations evidence with exact parity", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "desktop evidence only");
    const errors = await collectErrors(page);
    mkdirSync(evidenceDir, { recursive: true });
    await loadOps(page);
    const pausedAt = await runPauseExact(page, 30_000);
    const facts = headlessFacts(pausedAt);
    console.log(`evidence iso/top at exact clock ${pausedAt}ms (${channelTag})`);
    await expect(page.getByTestId("ops-m-agents")).toContainText(`${facts.busyCount}/6`);
    const canvas = page.getByTestId("ops-canvas");
    await expect(canvas).toHaveAttribute("data-carry-model", "cargo-c2-centered680x1220");
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
    const l01 = facts.locations["L01"]!;
    await page.getByTestId("ops-select").selectOption("location:L01");
    await expect(page.getByTestId("ops-inspector")).toContainText(`Stored ${l01.qty}`);
    await expect(canvas).toHaveAttribute("data-containers", "336");
    await page.getByTestId("ops-select").selectOption("unit:PK-1");
    await page.screenshot({ path: `${evidenceDir}/${evidencePrefix}-operations-iso-${channelTag}.png`, fullPage: true });
    await page.getByTestId("ops-preset-top").click();
    await page.screenshot({ path: `${evidenceDir}/${evidencePrefix}-operations-top-${channelTag}.png`, fullPage: true });
    expect(await page.getByTestId("ops-panel").getAttribute("data-ops-signature")).toBe(headlessSignature(pausedAt));
    expect(errors).toEqual([]);
  });

  test("loaded-cart closeup on a crated unit with exact parity", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "desktop evidence only");
    const errors = await collectErrors(page);
    mkdirSync(evidenceDir, { recursive: true });
    await loadOps(page);
    // Pick the best loaded unit at the paused clock (prefer stationary
    // unloading/in-queue over moving); if nothing carries yet, run on in
    // bounded rounds (mid-run loads are near-certain).
    const preference = ["unloading", "in-queue", "to-service", "to-queue", "picking", "to-pick"];
    let pausedAt = await runPauseExact(page, 30_000);
    let facts = headlessFacts(pausedAt);
    for (let round = 0; round < 3; round++) {
      const loaded = Object.entries(facts.units).filter(([, u]) => u.carried.length > 0);
      if (loaded.length > 0) break;
      pausedAt = await runPauseExact(page, pausedAt + 15_000);
      facts = headlessFacts(pausedAt);
    }
    const loaded = Object.entries(facts.units)
      .filter(([, u]) => u.carried.length > 0)
      .sort((a, b) => preference.indexOf(a[1].task) - preference.indexOf(b[1].task));
    expect(loaded.length, "a crated unit in frame").toBeGreaterThan(0);
    const [unitId, unit] = loaded[0]!;
    console.log(`evidence closeup: ${unitId} ${unit.task} carried=${JSON.stringify(unit.carried)} at exact clock ${pausedAt}ms (${channelTag})`);
    await page.getByTestId("ops-select").selectOption(`unit:${unitId}`);
    const inspector = page.getByTestId("ops-inspector");
    await expect(inspector).toContainText(`${unit.carried.map(([p, q]) => `${p} ×${q}`).join(" + ")} · ${unit.cost}/${unit.cap} cost units`);
    // Crate labels render on the next frame: wait for both, then prove
    // every carried SKU appears in at least one crate label.
    await expect(page.locator(".tag3d", { hasText: "crate A" }).first()).toBeAttached({ timeout: 300_000 });
    await expect(page.locator(".tag3d", { hasText: "crate B" }).first()).toBeAttached({ timeout: 300_000 });
    const crateLabels =
      (await page.locator(".tag3d", { hasText: "crate A" }).first().innerText()) +
      "|" +
      (await page.locator(".tag3d", { hasText: "crate B" }).first().innerText());
    for (const [pid] of unit.carried) expect(crateLabels).toContain(pid);
    await page.getByTestId("ops-preset-inspect").click();
    await page.screenshot({ path: `${evidenceDir}/${evidencePrefix}-carry-closeup-${channelTag}.png`, fullPage: true });
    expect(await page.getByTestId("ops-panel").getAttribute("data-ops-signature")).toBe(headlessSignature(pausedAt));
    expect(errors).toEqual([]);
  });

  test("playback recording to stage completion", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "desktop recording only");
    const errors = await collectErrors(page);
    mkdirSync(evidenceDir, { recursive: true });
    await loadOps(page);
    await page.getByTestId("ops-speed-16").click();
    await page.getByTestId("ops-run").click();
    await expect(page.getByTestId("ops-state-badge")).toContainText("STAGE COMPLETE", { timeout: 600_000 });
    await expect(page.getByTestId("ops-complete-note")).toContainText("6 orders READY_FOR_DISPATCH");
    await ensurePaused(page);
    const endClock = await opsClockMs(page);
    console.log(`evidence recording completes at exact clock ${endClock}ms (${channelTag})`);
    expect(await page.getByTestId("ops-panel").getAttribute("data-ops-signature")).toBe(headlessSignature(endClock));
    expect(errors).toEqual([]);
    // Finalize the recording before copying: the video file is complete
    // and unlocked only after the page closes.
    const video = page.video();
    await page.close();
    const videoPath = await video?.path();
    if (process.env.M3C_VIDEO === "on") expect(videoPath).toBeTruthy();
    if (videoPath) {
      copyFileSync(videoPath, `${evidenceDir}/${evidencePrefix}-playback-1440-${channelTag}.webm`);
      for (let i = 0; ; i++) {
        try {
          unlinkSync(videoPath);
          break;
        } catch (e) {
          if ((e as NodeJS.ErrnoException)?.code !== "EBUSY" || i >= 9) throw e;
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  });

  test("playback performance over real renders with renderer facts", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "desktop measurement only");
    const errors = await collectErrors(page);
    mkdirSync(evidenceDir, { recursive: true });
    await loadOps(page);
    const canvas = page.getByTestId("ops-canvas");
    // True active-window deltas: baseline counters + page
    // performance.now AFTER assets load and settle just before Run;
    // end counters + time after >=5s ACTIVE playback BEFORE
    // Pause/screenshot/diagnostics/layout writes. The delta window
    // excludes load/static draws; lifetime diagnostics below are a
    // labeled reference only.
    // One synchronous in-page read: separate attribute round-trips can
    // straddle a 40ms snapshot commit and mix two commits in one sample.
    const counters = async () =>
      page.evaluate(() => {
        const canvasEl = document.querySelector('[data-testid="ops-canvas"]')!;
        const panelEl = document.querySelector('[data-testid="ops-panel"]')!;
        const num = (el: Element, name: string): number => Number(el.getAttribute(name));
        return {
          renders: num(canvasEl, "data-renders"),
          renderCpuTotalMs: num(canvasEl, "data-render-cpu-total"),
          rafCallbacks: num(panelEl, "data-perf-frames"),
          engineAdvances: num(panelEl, "data-perf-advances"),
          advanceMsTotal: num(panelEl, "data-perf-advance-total"),
          snapshots: num(panelEl, "data-perf-snapshots"),
          simClockMs: num(panelEl, "data-ops-clock"),
          perfNowMs: performance.now(),
        };
      });
    await page.waitForTimeout(1_000);
    const settleA = Number(await canvas.getAttribute("data-renders"));
    await page.waitForTimeout(500);
    if (Number(await canvas.getAttribute("data-renders")) !== settleA) {
      await page.waitForTimeout(1_000);
    }
    const start = await counters();
    await page.getByTestId("ops-run").click();
    // Wait for fresh renders AND >=6s of active wall time (software GL
    // renders rarely; hardware GL renders constantly): both lanes
    // measured. The end sample below closes the window pre-Pause.
    await expect
      .poll(
        async () =>
          Number(await canvas.getAttribute("data-renders")) > start.renders &&
          (await page.evaluate(() => performance.now())) - start.perfNowMs >= 6_000,
        { timeout: 600_000 },
      )
      .toBe(true);
    const end = await counters();
    // Frame-loop invariant per sample (advances run at most once per
    // rAF): guards the atomic in-page read against mixed commits.
    expect(start.engineAdvances).toBeLessThanOrEqual(start.rafCallbacks);
    expect(end.engineAdvances).toBeLessThanOrEqual(end.rafCallbacks);
    await ensurePaused(page);
    const wallClock = await opsClockMs(page);
    await page.getByTestId("ops-diagnostics").locator("summary").first().click();
    const diag = await page.getByTestId("ops-diagnostics").innerText();
    const playback = /Playback: (\d+) rAF callbacks · (\d+) engine advances · avg advance ([\d.]+) ms · max advance ([\d.]+) ms · (\d+) snapshots · ([\d.]+)s wall/.exec(diag);
    expect(playback, `playback stats in diagnostics: ${diag.slice(0, 400)}`).toBeTruthy();
    const rendersStat = /Renders: (\d+) WebGL renders · avg render CPU ([\d.]+) ms · max render CPU ([\d.]+) ms · ([\d.]+)s span/.exec(diag);
    expect(rendersStat, `render stats in diagnostics: ${diag.slice(0, 600)}`).toBeTruthy();
    const renderer = /Renderer: (.+)/.exec(diag)?.[1]?.trim() ?? "unavailable";
    const payload = await page.evaluate(() => {
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const glbs = entries.filter((e) => e.name.endsWith(".glb"));
      return {
        glbCount: glbs.length,
        glbBytes: Math.round(glbs.reduce((n, e) => n + (e.decodedBodySize || e.transferSize || 0), 0)),
      };
    });
    const deltaWallS = (end.perfNowMs - start.perfNowMs) / 1000;
    const deltaRenders = end.renders - start.renders;
    const deltaRenderCpuMs = end.renderCpuTotalMs - start.renderCpuTotalMs;
    const deltaRaf = end.rafCallbacks - start.rafCallbacks;
    const deltaAdvances = end.engineAdvances - start.engineAdvances;
    const deltaAdvanceMs = end.advanceMsTotal - start.advanceMsTotal;
    const deltaSnapshots = end.snapshots - start.snapshots;
    const avgRenderCpuMs = deltaRenders > 0 ? deltaRenderCpuMs / deltaRenders : null;
    const avgAdvanceMs = deltaAdvances > 0 ? deltaAdvanceMs / deltaAdvances : null;
    const activeRenderFps = deltaWallS > 0 ? deltaRenders / deltaWallS : null;
    const report = {
      browser: test.info().project.name,
      channel: process.env.M3C_CHANNEL ?? "(bundled chromium)",
      viewport: page.viewportSize(),
      speed: "1x",
      simClockMs: wallClock,
      window: {
        startPerfNowMs: start.perfNowMs,
        endPerfNowMs: end.perfNowMs,
        wallSeconds: deltaWallS,
        startSimClockMs: start.simClockMs,
        endSimClockMs: end.simClockMs,
      },
      start,
      end,
      delta: {
        wallSeconds: deltaWallS,
        renders: deltaRenders,
        renderCpuTotalMs: deltaRenderCpuMs,
        avgRenderCpuMs,
        activeRenderFps,
        rafCallbacks: deltaRaf,
        engineAdvances: deltaAdvances,
        advanceMsTotal: deltaAdvanceMs,
        avgAdvanceMs,
        snapshots: deltaSnapshots,
      },
      lifetimeReference: {
        renders: rendersStat ? Number(rendersStat[1]) : null,
        avgRenderCpuMs: rendersStat ? Number(rendersStat[2]) : null,
        maxRenderCpuMsLifetime: rendersStat ? Number(rendersStat[3]) : null,
        renderSpanSeconds: rendersStat ? Number(rendersStat[4]) : null,
        rafCallbacks: playback ? Number(playback[1]) : null,
        engineAdvances: playback ? Number(playback[2]) : null,
        avgAdvanceMs: playback ? Number(playback[3]) : null,
        maxAdvanceMsLifetime: playback ? Number(playback[4]) : null,
        snapshots: playback ? Number(playback[5]) : null,
        wallSeconds: playback ? Number(playback[6]) : null,
      },
      renderer,
      assetGlbCount: payload.glbCount,
      assetGlbBytes: payload.glbBytes,
      consoleErrors: errors,
      note: "Active-window deltas only: start/end counters and page performance.now bracket >=5s of ACTIVE 1x playback (load/static draws excluded; start/end ship above so arithmetic checks offline). Actual WebGL renders, rAF callbacks, engine advances, snapshots, render-CPU cost, GPU renderer string, and asset payload stay separate. Maxima are renderer-lifetime values (labeled), never window maxima by subtraction; no window-maximum claim is made. Render CPU is main-thread JS/WebGL-call cost, not GPU time. No 60fps/mobile/GPU-time claim is made.",
    };
    writeFileSync(`${evidenceDir}/${evidencePrefix}-perf-1440-${channelTag}.json`, `${JSON.stringify(report, null, 2)}\n`);
    expect(deltaWallS).toBeGreaterThanOrEqual(5);
    expect(deltaRenders).toBeGreaterThanOrEqual(3);
    expect(deltaAdvances).toBeGreaterThan(0);
    expect(deltaSnapshots).toBeGreaterThan(0);
    expect(avgAdvanceMs ?? 999).toBeLessThan(250);
    expect(report.delta.avgRenderCpuMs).toBe(avgRenderCpuMs);
    expect(report.delta.activeRenderFps).toBe(activeRenderFps);
    expect(end.renders - start.renders).toBe(deltaRenders);
    expect(errors).toEqual([]);
  });

  test("responsive evidence at tablet 768 and narrow 390", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "viewport-driven evidence only");
    const errors = await collectErrors(page);
    mkdirSync(evidenceDir, { recursive: true });
    await loadOps(page);
    await page.setViewportSize({ width: 1586, height: 992 });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1587);
    await page.screenshot({ path: `${evidenceDir}/${evidencePrefix}-operations-1586-${channelTag}.png`, fullPage: true });
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(769);
    await page.screenshot({ path: `${evidenceDir}/${evidencePrefix}-operations-768-${channelTag}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    await page.screenshot({ path: `${evidenceDir}/${evidencePrefix}-operations-390-${channelTag}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
});
