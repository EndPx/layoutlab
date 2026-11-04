// M4 browser acceptance: heuristic comparison + attribution, scene gate,
// SimReady GLB racks, and historical M3 smoke replay. Stub tests need no API;
// the live test uses the local fixture transport (providerKind "fixture").
import { expect, test } from "@playwright/test";
import { replayReport } from "@layoutlab/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { startLiveFixture, type LiveFixture } from "./helpers/live-fixture";
import { clickOpen, openDetails } from "./helpers/ui";

const GLB_SHA256 = "571cc601bbbf8759977e05c5104a1d9381a682d2537942a238c68ebf8f8ae9ea";

test.describe("M4 heuristic comparison + attribution + scene gate", () => {
  test("stub run shows current, heuristic, stub best with budgets and honest win", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });

    // Heuristic ran first with its own explicit budget (15/32 on the sample).
    await expect(page.getByTestId("stub-outcome")).toContainText("heuristic 15/32 evals");
    await expect(page.getByTestId("timeline-heuristic")).toContainText("29.8 m");

    // Comparison rows carry exact method labels.
    const heuristicRow = page.getByTestId("compare-heuristic");
    await expect(heuristicRow).toContainText("heuristic");
    await expect(heuristicRow).toContainText("29.8 m");
    await expect(page.getByTestId("compare-stub-1")).toContainText("stub");

    // Budgets are actual per-method counts with no equal-compute claim.
    const budgets = page.getByTestId("candidate-budgets");
    await expect(budgets).toContainText("heuristic 15/32 candidate evaluations");
    await expect(budgets).toContainText("stub 3/3 proposals");
    await expect(budgets).toContainText("not an equal-compute comparison");

    // Attribution: run baseline vs heuristic vs stub best, overall selected separate.
    const summary = page.getByTestId("method-summary");
    await expect(summary).toContainText("Run baseline: 36.8 m");
    await expect(summary).toContainText("Heuristic: 29.8 m");
    await expect(summary).toContainText("Stub best:");
    await expect(summary).toContainText("Overall selected: heuristic (heuristic)");

    // Honest win: the heuristic applies like any valid completed candidate.
    await page.getByTestId("select-heuristic").click();
    await openDetails(page, "run-details");
    await expect(page.getByTestId("relocation-table")).toBeVisible();
    await page.getByTestId("apply-heuristic").click();
    await expect(page.getByTestId("apply-message")).toContainText("Applied heuristic");

    // Export carries heuristic counter, budgets, labels, and asset refs.
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("btn-export").click();
    const file = await download;
    const tmp = testInfo.outputPath("m4-stub-export.json");
    await file.saveAs(tmp);
    const envelope = JSON.parse(fs.readFileSync(tmp, "utf8")) as Record<string, unknown>;
    expect(envelope["envelopeVersion"]).toBe("layoutlab.m2export/1");
    expect(envelope["provider"]).toBe("stub");
    const heuristicMeta = envelope["heuristic"] as Record<string, unknown>;
    expect(heuristicMeta["evaluationsUsed"]).toBe(15);
    expect(heuristicMeta["evaluationsBudget"]).toBe(32);
    expect(heuristicMeta["method"]).toBe("demand-greedy-swaps/1");
    const labels = envelope["methodLabels"] as Record<string, string>;
    expect(labels["baseline"]).toBe("current");
    expect(labels["heuristic"]).toBe("heuristic");
    expect(labels["stub-1"]).toBe("stub");
    const refs = envelope["assetRefs"] as Record<string, unknown>[];
    expect(refs).toHaveLength(4);
    for (const ref of refs) {
      expect(ref["kind"]).toBe("simready-glb");
      expect(ref["sha256"]).toBe(GLB_SHA256);
    }
    const replayed = replayReport({
      reportVersion: envelope["reportVersion"],
      coreVersion: envelope["coreVersion"],
      routePolicy: envelope["routePolicy"],
      scenario: envelope["scenario"],
      requirements: envelope["requirements"],
      baseline: envelope["baseline"],
      candidates: envelope["candidates"],
      bestName: envelope["bestName"],
      improvementPercents: envelope["improvementPercents"],
      outcome: envelope["outcome"],
    });
    expect(replayed.matchesSaved).toBe(true);
    fs.unlinkSync(tmp);

    const replayTmp = testInfo.outputPath("m4-stub-replay.json");
    fs.writeFileSync(replayTmp, JSON.stringify(envelope));
    await page.getByTestId("input-replay").setInputFiles(replayTmp);
    await expect(page.getByTestId("replay-verdict")).toContainText("matches saved");
    fs.unlinkSync(replayTmp);

    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("invalid scene geometry blocks generation before any search", async ({ page }, testInfo) => {
    await page.goto("/?mode=planning");
    const sample = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "..", "..", "fixtures", "sample", "warehouse-basic.json"), "utf8"),
    ) as { racks: Record<string, unknown>[] };
    sample.racks.push({ ...sample.racks[0], id: "RX-OVERLAP" });
    const tmp = testInfo.outputPath("m4-bad-scene.json");
    fs.writeFileSync(tmp, JSON.stringify(sample));
    await page.getByTestId("input-scenario").setInputFiles(tmp);
    await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("notice")).toContainText("INPUT_INVALID");
    await expect(page.getByTestId("notice")).toContainText("RACK_OVERLAP");
    await expect(page.getByTestId("stub-status")).toContainText("idle");
    expect(await page.getByTestId("timeline-heuristic").count()).toBe(0);
    fs.unlinkSync(tmp);
  });

  test("historical M3 live-smoke report still replays", async ({ page }) => {
    await page.goto("/?mode=planning");
    const smoke = path.join(process.cwd(), "..", "..", "evidence", "sanitized", "m3-live-smoke-report.json");
    await page.getByTestId("input-replay").setInputFiles(smoke);
    await expect(page.getByTestId("replay-verdict")).toContainText("matches saved");
  });
});

test.describe("M4 live heuristic + Meta attribution (fixture transport)", () => {
  let fixture: LiveFixture | null = null;

  test.beforeAll(async () => {
    fixture = await startLiveFixture("fixture-muse-shape");
  });

  test.afterAll(async () => {
    if (!fixture) return;
    await fixture.stop();
    fixture = null;
  });

  test("live comparison shows heuristic, Meta first, feedback-selected, overall", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await clickOpen(page, "provider-live");
    await expect(page.getByTestId("live-status")).toContainText("Fixture ready", { timeout: 15_000 });
    await page.getByTestId("live-consent").click();
    await page.getByTestId("btn-interpret").click();
    await expect(page.getByTestId("live-interpreted")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate-live").click();
    await expect(page.getByTestId("live-outcome")).toBeVisible({ timeout: 30_000 });

    // Server heuristic surfaced with its own budget; model budgets unchanged.
    await expect(page.getByTestId("live-run-status")).toContainText("heuristic 15/32 evals");
    await expect(page.getByTestId("timeline-heuristic")).toContainText("29.8 m");
    await expect(page.getByTestId("compare-heuristic")).toContainText("heuristic");
    await expect(page.getByTestId("compare-proposal-1")).toContainText("meta-first");
    await expect(page.getByTestId("compare-proposal-3")).toContainText("meta-feedback");

    // Attribution: actual attempt 1, best valid Meta among actual attempts
    // with winning iteration, overall selected kept separate.
    const summary = page.getByTestId("method-summary");
    await expect(summary).toContainText("Run baseline: 36.8 m");
    await expect(summary).toContainText("Heuristic: 29.8 m");
    await expect(summary).toContainText("Meta first: 35.6 m (proposal-1)");
    await expect(summary).toContainText("Meta feedback-selected: 35.6 m (best valid Meta proposal, proposal-1)");
    await expect(summary).toContainText("Overall selected: heuristic (heuristic)");
    await expect(page.getByTestId("candidate-budgets")).toContainText("not an equal-compute comparison");

    // Live export is verbatim server report with heuristic + asset provenance.
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("btn-export").click();
    const file = await download;
    const tmp = testInfo.outputPath("m4-live-export.json");
    await file.saveAs(tmp);
    const envelope = JSON.parse(fs.readFileSync(tmp, "utf8")) as Record<string, unknown>;
    expect(envelope["envelopeVersion"]).toBe("layoutlab.m3report/1");
    const heuristicMeta = envelope["heuristic"] as Record<string, unknown>;
    expect(heuristicMeta["evaluationsUsed"]).toBe(15);
    expect((envelope["methodLabels"] as Record<string, string>)["heuristic"]).toBe("heuristic");
    expect((envelope["methodLabels"] as Record<string, string>)["proposal-1"]).toBe("meta-first");
    const refs = envelope["assetRefs"] as Record<string, unknown>[];
    expect(refs).toHaveLength(4);
    expect(refs[0]?.["sha256"]).toBe(GLB_SHA256);
    // Heuristic + 2 valid model mappings: the model-proposal cap must not
    // reject the legitimate extra heuristic candidate.
    expect((envelope["candidates"] as unknown[]).length).toBe(3);
    expect(envelope["bestName"]).toBe("heuristic");
    const replayed = replayReport({
      reportVersion: envelope["reportVersion"],
      coreVersion: envelope["coreVersion"],
      routePolicy: envelope["routePolicy"],
      scenario: envelope["scenario"],
      requirements: envelope["requirements"],
      baseline: envelope["baseline"],
      candidates: envelope["candidates"],
      bestName: envelope["bestName"],
      improvementPercents: envelope["improvementPercents"],
      outcome: envelope["outcome"],
    });
    expect(replayed.matchesSaved).toBe(true);
    fs.unlinkSync(tmp);

    const replayTmp = testInfo.outputPath("m4-live-replay.json");
    fs.writeFileSync(replayTmp, JSON.stringify(envelope));
    await page.getByTestId("input-replay").setInputFiles(replayTmp);
    await expect(page.getByTestId("replay-verdict")).toContainText("matches saved");
    fs.unlinkSync(replayTmp);

    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });
});

test.describe("M4 SimReady GLB racks in the browser", () => {
  test("racks load actual GLB with canonical scale, 2D unaffected (screenshot)", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");

    // Actual GLB loaded: 4 rack instances with calibrated bounding box.
    const canvas = page.getByTestId("three-canvas");
    await expect(canvas).toHaveAttribute("data-asset", "simready-glb", { timeout: 30_000 });
    await expect(canvas).toHaveAttribute("data-racks-loaded", "4");
    await expect(page.getByTestId("three-asset-status")).toContainText("SimReady GLB");
    const bbox = (await canvas.getAttribute("data-rack-bbox")) ?? "";
    // R1: center (1.3, 1.5) m, canonical 1.6 x 2.0 x 0.8 m.
    const nums = bbox.split(/[:,]/).map(Number);
    expect(nums).toHaveLength(6);
    const [minX, minY, minZ, maxX, maxY, maxZ] = nums as number[];
    expect(Math.abs((minX as number) - 0.5)).toBeLessThan(0.01);
    expect(Math.abs((minY as number) - 0)).toBeLessThan(0.01);
    expect(Math.abs((minZ as number) - 1.1)).toBeLessThan(0.01);
    expect(Math.abs((maxX as number) - 2.1)).toBeLessThan(0.01);
    expect(Math.abs((maxY as number) - 2.0)).toBeLessThan(0.01);
    expect(Math.abs((maxZ as number) - 1.9)).toBeLessThan(0.01);

    // 2D plan is unaffected by the 3D asset integration (via the switch).
    await page.getByTestId("view-tab-2d").click();
    await expect(page.getByTestId("svg-2d")).toBeVisible();
    await expect(page.getByTestId("route-polyline-current")).toBeVisible();
    await page.getByTestId("view-tab-3d").click();

    // Full comparison UI must not overflow the page at the viewport.
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `page overflow at viewport ${viewportWidth}px`).toBeLessThanOrEqual(viewportWidth + 1);

    const dir = path.join(process.cwd(), "..", "..", "evidence", "sanitized");
    fs.mkdirSync(dir, { recursive: true });
    const tag = testInfo.project.name === "mobile" ? "mobile-390" : "desktop-1440";
    await page.screenshot({ path: path.join(dir, `m6a-run-${tag}.png`), fullPage: true });
    await page.getByTestId("view-3d").screenshot({ path: path.join(dir, `m6a-run-${tag}-3d.png`) });

    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });
});
