import { expect, test } from "@playwright/test";
import { replayReport } from "@layoutlab/core";
import * as fs from "node:fs";
import { clickOpen, openDetails } from "./helpers/ui";

test.describe("M2 manual + stub flow", () => {
  test("load, evaluate, manual edit, stub, apply, export, replay", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });

    await page.goto("/?mode=planning");
    await expect(page.getByTestId("scenario-label")).toContainText("no scenario");

    await clickOpen(page, "btn-sample");
    await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic");
    await expect(page.getByTestId("scenario-label")).toContainText("rev 0");
    await expect(page.getByTestId("valid-badge")).toContainText("VALID");
    // Sample baseline is honestly computed by core (M1 observed 36800 mm).
    await expect(page.getByTestId("baseline-metrics")).toContainText("36.8 m");
    // Functional 2D/3D switch: exactly one view visible at a time.
    await expect(page.getByTestId("view-3d")).toBeVisible();
    await expect(page.getByTestId("three-canvas")).toBeVisible();
    await expect(page.getByTestId("view-2d")).toBeHidden();
    await page.getByTestId("view-tab-2d").click();
    await expect(page.getByTestId("view-2d")).toBeVisible();
    await expect(page.getByTestId("svg-2d")).toBeVisible();
    await expect(page.getByTestId("route-polyline-current")).toBeVisible();
    // No candidate exists yet: no fake candidate route is drawn.
    expect(await page.getByTestId("route-polyline").count()).toBe(0);
    await expect(page.getByTestId("view-3d")).toBeHidden();
    await page.getByTestId("view-tab-3d").click();
    await expect(page.getByTestId("view-3d")).toBeVisible();
    await expect(page.getByTestId("btn-export")).toContainText("Export current evaluation");

    // Manual edit bumps revision and updates the measurement.
    await page.getByTestId("assign-sku-b").selectOption("L6");
    await expect(page.getByTestId("scenario-label")).toContainText("rev 1");
    await expect(page.getByTestId("valid-badge")).toBeVisible();

    // Invalid manual state is visible (cold product into ambient slot).
    await page.getByTestId("assign-sku-f").selectOption("L1");
    await expect(page.getByTestId("valid-badge")).toContainText("INVALID");
    await expect(page.getByTestId("compat-sku-f")).toContainText("class");
    // Restore validity for the stub run.
    await page.getByTestId("assign-sku-f").selectOption("L8");
    await expect(page.getByTestId("valid-badge")).toContainText("VALID");

    // Stub is gated on explicit approval.
    await expect(page.getByTestId("btn-generate")).toBeDisabled();
    await page.getByTestId("btn-approve").click();
    await expect(page.getByTestId("approval-state")).toContainText("approved");
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mode-badge")).toContainText("STUB");
    await expect(page.getByTestId("btn-export")).toContainText("Export run report");
    const timeline = page.getByTestId("stub-timeline");
    await expect(timeline.getByTestId("timeline-stub-1")).toBeVisible();
    // Stub must exercise valid alternatives on the sample (no forced invalid demo).
    const outcome = await page.getByTestId("stub-outcome").textContent();
    expect(outcome).toContain("model requests 0");

    // Compare: select the first valid stub candidate and inspect relocations.
    const candidates = ["stub-1", "stub-2", "stub-3"];
    let applied: string | null = null;
    for (const name of candidates) {
      const row = page.getByTestId(`compare-${name}`);
      if ((await row.count()) === 0) continue;
      await page.getByTestId(`select-${name}`).click();
      await openDetails(page, "run-details");
      await expect(page.getByTestId("relocation-table")).toBeVisible();
      const applyBtn = page.getByTestId(`apply-${name}`);
      if (await applyBtn.isEnabled()) {
        applied = name;
        break;
      }
    }
    expect(applied, "at least one valid stub candidate to apply").not.toBeNull();

    // Valid apply bumps revision and reports success.
    const before = await page.getByTestId("scenario-label").textContent();
    await page.getByTestId(`apply-${applied as string}`).click();
    await expect(page.getByTestId("apply-message")).toContainText("Applied");
    const after = await page.getByTestId("scenario-label").textContent();
    expect(after).not.toEqual(before);
    // The run report is now historical: export still reflects the frozen run.
    await expect(page.getByTestId("historical-notice")).toBeVisible();
    await expect(page.getByTestId("btn-export")).toContainText("Export run report");

    // Export downloads a versioned envelope; independently replay it with core.
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("btn-export").click();
    const file = await download;
    // Per-test output dir: desktop/mobile projects run concurrently and must
    // not share one fixed filename.
    const tmp = testInfo.outputPath("playwright-export.json");
    await file.saveAs(tmp);
    const envelope = JSON.parse(fs.readFileSync(tmp, "utf8")) as Record<string, unknown>;
    expect(envelope["envelopeVersion"]).toBe("layoutlab.m2export/1");
    expect(envelope["provider"]).toBe("stub");
    expect(envelope["modelRequests"]).toBe(0);
    expect(typeof envelope["runId"]).toBe("string");
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

    // UI import/replay of the same envelope reports a match without inference.
    const replayTmp = testInfo.outputPath("playwright-replay.json");
    fs.writeFileSync(replayTmp, JSON.stringify(envelope));
    await page.getByTestId("input-replay").setInputFiles(replayTmp);
    await expect(page.getByTestId("replay-verdict")).toContainText("matches saved");
    fs.unlinkSync(replayTmp);

    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("stale apply is rejected after a new scene edit", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });

    // New scene edit invalidates the frozen run baseline (edits live in the
    // Current frame; the candidate frame is read-only).
    await page.getByTestId("frame-current").click();
    await page.getByTestId("assign-sku-c").selectOption("L7");
    const row = page.getByTestId("compare-stub-1");
    await expect(row).toBeVisible();
    const applyBtn = page.getByTestId("apply-stub-1");
    if (await applyBtn.isEnabled()) {
      await applyBtn.click();
      await expect(page.getByTestId("apply-message")).toContainText(/rejected|stale/i);
    } else {
      // Disabled apply on a stale run is also a rejection; force via select+apply is impossible.
      expect(await applyBtn.isDisabled()).toBe(true);
    }
  });

  test("cancellation prevents apply from an unfinished run", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("btn-cancel")).toBeEnabled();
    await page.getByTestId("btn-cancel").click();
    await expect(page.getByTestId("stub-status")).toContainText(/cancelled/i);
    // No completed-run apply may succeed after cancel.
    for (const name of ["stub-1", "stub-2", "stub-3"]) {
      const btn = page.getByTestId(`apply-${name}`);
      if ((await btn.count()) > 0) expect(await btn.isDisabled()).toBe(true);
    }
  });

  test("persistence reload restores revision and approval", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("assign-sku-b").selectOption("L6");
    await expect(page.getByTestId("scenario-label")).toContainText("rev 1");
    await page.reload();
    await expect(page.getByTestId("scenario-label")).toContainText("rev 1");
    await expect(page.getByTestId("approval-state")).toContainText("approved");
    await expect(page.getByTestId("baseline-metrics")).toBeVisible();
  });

  test("constraint change after a run blocks apply until re-run", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });

    // Change the budget after the run: candidates were validated against old constraints.
    await page.getByTestId("req-budget").fill("0");
    await expect(page.getByTestId("approval-state")).toContainText("not approved");
    const btn = page.getByTestId("apply-stub-1");
    if ((await btn.count()) > 0 && (await btn.isEnabled())) {
      await btn.click();
      await expect(page.getByTestId("apply-message")).toContainText(/requirements changed/i);
    } else if ((await btn.count()) > 0) {
      expect(await btn.isDisabled()).toBe(true);
    }
    // Decimal budgets are rejected at approval with a useful error.
    await page.getByTestId("req-budget").fill("2.5");
    await page.getByTestId("btn-approve").click();
    await expect(page.getByTestId("requirements-error")).toContainText(/Requirements invalid/i);
  });

  test("stale async run cannot overwrite reset or reload", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("btn-cancel")).toBeEnabled();
    // Reset mid-run: the stale loop must commit nothing afterwards.
    await clickOpen(page, "btn-reset");
    await expect(page.getByTestId("scenario-label")).toContainText("no scenario");
    await expect(page.getByTestId("stub-status")).toContainText("idle");
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("scenario-label")).toContainText("no scenario");
    await expect(page.getByTestId("stub-status")).toContainText("idle");
    // Planner stays usable after the race.
    await clickOpen(page, "btn-sample");
    await expect(page.getByTestId("valid-badge")).toBeVisible();
  });

  test("stale async run cannot overwrite a fresh sample load", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("btn-cancel")).toBeEnabled();
    await clickOpen(page, "btn-sample");
    await expect(page.getByTestId("scenario-label")).toContainText("rev 0");
    await expect(page.getByTestId("stub-status")).toContainText("idle");
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("stub-status")).toContainText("idle");
  });
});
