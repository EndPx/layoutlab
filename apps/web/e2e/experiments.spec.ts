// E4b Experiments acceptance (real Edge via M3C_CHANNEL=msedge). Offline
// recorded/replay paths make zero provider requests; the live flow runs
// against the local fixture transport with actual engine feedback.
import { expect, test } from "@playwright/test";
import { expFinish, expRunExp, startExperimentsFixture, type ExperimentsFixture } from "./helpers/experiments-fixture";

let fixture: ExperimentsFixture | null = null;
test.afterEach(async () => {
  await fixture?.stop().catch(() => {});
  fixture = null;
});

test("experiments: baseline, recorded replay, inspection, export (offline)", async ({ page }) => {
  await page.goto("/?mode=experiments");
  await expect(page.getByTestId("mode-experiments")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("exp-scenario")).toContainText("picking-packing-burst");
  await expect(page.getByTestId("exp-scenario")).toContainText("6 orders");
  // Local baseline with zero model requests: honest engine metrics.
  await expect(page.getByTestId("exp-compare-table")).toContainText("502.4 s");
  await expect(page.getByTestId("exp-compare-table")).toContainText("valid-complete");
  // Permissions start unchecked; staffing is disabled with its reason.
  await expect(page.getByTestId("exp-allow-packingDurationMs")).not.toBeChecked();
  await expect(page.getByTestId("exp-allow-staffing")).toBeDisabled();
  await expect(page.getByTestId("exp-staffing-note")).toContainText("cannot support added staff");
  // Start stays disabled until live + consent are explicit.
  await expect(page.getByTestId("exp-start")).toBeDisabled();
  await expect(page.getByTestId("exp-start-reason")).toContainText("Start disabled");
  // Recorded Meta replay: provenance, original run, all three candidates.
  await page.getByTestId("exp-recorded-load").click();
  await expect(page.getByTestId("exp-provenance")).toContainText("Recorded Meta run / replay");
  await expect(page.getByTestId("exp-provenance")).toContainText("fd2247b1-8335-4575-a55b-1f579cc3717b");
  await expect(page.getByTestId("exp-compare-table")).toContainText("exp-2");
  await expect(page.getByTestId("exp-recommendation")).toContainText("exp-2");
  await expect(page.getByTestId("exp-trace")).toContainText("model assertion");
  // Changed fields for the recommended dispatch candidate.
  await page.getByTestId("exp-details").locator("summary").click();
  await expect(page.getByTestId("exp-details")).toContainText("30000 ms");
  // Engine inspection of the baseline (separate replay, real canvas).
  await page.getByTestId("exp-inspect-baseline").click();
  await expect(page.getByTestId("exp-inspection")).toBeVisible();
  await expect(page.getByTestId("exp-inspection").getByTestId("ops-panel")).toBeVisible();
  await page.getByTestId("exp-close-inspection").click();
  await expect(page.getByTestId("exp-inspection")).toHaveCount(0);
  // Export is exactly the held report.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("exp-export").click(),
  ]);
  expect(await download.suggestedFilename()).toContain("fd2247b1");
  // No page-level horizontal overflow.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "../../evidence/sanitized/e4b-experiments-recorded.png", fullPage: true });
});

test("experiments: malformed import shows an error, never a result", async ({ page }) => {
  await page.goto("/?mode=experiments");
  // A failed import preserves the last good state.
  await page.getByTestId("exp-recorded-load").click();
  await expect(page.getByTestId("exp-provenance")).toContainText("Recorded Meta run / replay");
  await page.getByTestId("exp-import").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not json"),
  });
  await expect(page.getByTestId("exp-import-error")).toContainText("Malformed report");
  await page.getByTestId("exp-import").setInputFiles({
    name: "wrong.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "other/1" })),
  });
  await expect(page.getByTestId("exp-import-error")).toContainText("Unsupported schema");
  await expect(page.getByTestId("exp-provenance")).toContainText("Recorded Meta run / replay");
});

test("experiments live flow: fixture feedback, recommendation, zero-spend replay/verify", async ({ page }) => {
  fixture = await startExperimentsFixture({
    decide: (fb) => (fb.results.some((r) => r.candidateId === "exp-1") ? expFinish("exp-1") : expRunExp({ dispatchDurationMs: 1000 })),
  });
  await page.goto("/?mode=experiments");
  await page.getByTestId("exp-allow-dispatchDurationMs").check();
  await page.getByTestId("exp-live-toggle").check();
  await page.getByTestId("exp-consent").check();
  await expect(page.getByTestId("exp-server-status")).toContainText("fixture");
  await expect(page.getByTestId("exp-start")).toBeEnabled();
  await page.getByTestId("exp-start").click();
  await expect(page.getByTestId("exp-run-status")).toContainText("requests 2/4", { timeout: 120_000 });
  await expect(page.getByTestId("exp-compare-table")).toContainText("343.2 s");
  await expect(page.getByTestId("exp-recommendation")).toContainText("exp-1");
  await expect(page.getByTestId("exp-provenance")).toContainText("Fixture investigation");
  expect(fixture.transportRequests()).toBe(2);
  // Mode switching preserves the run; replay + verify spend nothing more.
  await page.getByTestId("mode-planning").click();
  await page.getByTestId("mode-experiments").click();
  await expect(page.getByTestId("exp-recommendation")).toContainText("exp-1");
  await page.getByTestId("exp-verify").click();
  await expect(page.getByTestId("exp-verify-result")).toContainText("Recomputed successfully", { timeout: 60_000 });
  expect(fixture.transportRequests()).toBe(2);
  await page.screenshot({ path: "../../evidence/sanitized/e4b-experiments-fixture-live.png", fullPage: true });
});

test("experiments live flow: denied staffing stays an invalid candidate", async ({ page }) => {
  fixture = await startExperimentsFixture({
    decide: (_fb, call) => (call === 1 ? expRunExp({ extraPickers: 1 }) : expFinish("baseline")),
  });
  await page.goto("/?mode=experiments");
  await page.getByTestId("exp-allow-dispatchDurationMs").check();
  await page.getByTestId("exp-live-toggle").check();
  await page.getByTestId("exp-consent").check();
  await page.getByTestId("exp-start").click();
  await expect(page.getByTestId("exp-compare-table")).toContainText("invalid", { timeout: 120_000 });
  await expect(page.getByTestId("exp-compare-table")).toContainText("exp-1");
});

test("experiments live flow: slower candidate is no improvement, baseline kept", async ({ page }) => {
  fixture = await startExperimentsFixture({
    decide: (_fb, call) => (call === 1 ? expRunExp({ dispatchDurationMs: 300000 }) : expFinish("baseline")),
  });
  await page.goto("/?mode=experiments");
  await page.getByTestId("exp-allow-dispatchDurationMs").check();
  await page.getByTestId("exp-live-toggle").check();
  await page.getByTestId("exp-consent").check();
  await page.getByTestId("exp-start").click();
  await expect(page.getByTestId("exp-recommendation")).toContainText("baseline", { timeout: 120_000 });
  await expect(page.getByTestId("exp-recommendation")).toContainText("no measured improvement");
});

test("experiments live flow: cancel keeps partial evidence", async ({ page }) => {
  fixture = await startExperimentsFixture({
    decide: () => expRunExp({ dispatchDurationMs: 1000 }),
    delayMs: 3000,
  });
  await page.goto("/?mode=experiments");
  await page.getByTestId("exp-allow-dispatchDurationMs").check();
  await page.getByTestId("exp-live-toggle").check();
  await page.getByTestId("exp-consent").check();
  await page.getByTestId("exp-start").click();
  await expect(page.getByTestId("exp-cancel")).toBeEnabled();
  // A running investigation cannot be silently replaced by replay/import.
  await expect(page.getByTestId("exp-recorded-load")).toBeDisabled();
  await expect(page.getByTestId("exp-import")).toBeDisabled();
  await page.getByTestId("exp-cancel").click();
  await expect(page.getByTestId("experiments-panel")).toContainText("CANCELLED", { timeout: 60_000 });
  await expect(page.getByTestId("exp-trace")).toContainText("baseline");
});

test("experiments: 401 on Start shows sign-in recovery without resubmission; recorded path stays public", async ({ page }) => {
  fixture = await startExperimentsFixture({ decide: () => expFinish("baseline") });
  let creates = 0;
  await page.route("**/api/operations/investigations", async (route) => {
    if (route.request().method() === "POST") {
      creates++;
      await route.fulfill({ status: 401, contentType: "text/html", body: "Authentication required" });
      return;
    }
    await route.continue();
  });
  await page.goto("/?mode=experiments");
  const link = page.getByTestId("exp-live-access");
  await expect(link).toHaveAttribute("href", "/live-access?mode=experiments");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("exp-auth-note")).toContainText("does not mean you are signed in");
  await page.getByTestId("exp-allow-dispatchDurationMs").check();
  await page.getByTestId("exp-live-toggle").check();
  await page.getByTestId("exp-consent").check();
  await expect(page.getByTestId("exp-start")).toBeEnabled();
  await page.getByTestId("exp-start").click();
  await expect(page.getByTestId("exp-error")).toContainText("Sign-in required (401)");
  await expect(page.getByTestId("exp-error")).toContainText("Nothing was resubmitted");
  await page.waitForTimeout(1500);
  expect(creates).toBe(1);
  expect(fixture.transportRequests()).toBe(0);
  // Recorded replay needs no auth and still works.
  await page.getByTestId("exp-recorded-load").click();
  await expect(page.getByTestId("exp-provenance")).toContainText("Recorded Meta run / replay");
});

test("experiments: no-key server disables Start with its reason", async ({ page }) => {
  fixture = await startExperimentsFixture({ decide: () => expFinish("baseline"), noKey: true });
  await page.goto("/?mode=experiments");
  await page.getByTestId("exp-live-toggle").check();
  await page.getByTestId("exp-consent").check();
  await page.getByTestId("exp-allow-dispatchDurationMs").check();
  await expect(page.getByTestId("exp-start")).toBeDisabled();
  await expect(page.getByTestId("exp-start-reason")).toContainText("MODEL_API_KEY");
});

test("experiments: exhausted allowance disables Start", async ({ page }) => {
  fixture = await startExperimentsFixture({
    decide: (fb) => (fb.results.some((r) => r.candidateId === "exp-1") ? expFinish("exp-1") : expRunExp({ dispatchDurationMs: 1000 })),
    budgetCapUsd: 0.25,
  });
  await page.goto("/?mode=experiments");
  await page.getByTestId("exp-allow-dispatchDurationMs").check();
  await page.getByTestId("exp-live-toggle").check();
  await page.getByTestId("exp-consent").check();
  await page.getByTestId("exp-start").click();
  await expect(page.getByTestId("exp-run-status")).toContainText("requests 2/4", { timeout: 120_000 });
  // The single $0.25 claim is now committed: a second run cannot be funded.
  await expect(page.getByTestId("exp-allowance")).toContainText("$0.00 available", { timeout: 30_000 });
  await expect(page.getByTestId("exp-start-reason")).toContainText("insufficient public allowance");
});
