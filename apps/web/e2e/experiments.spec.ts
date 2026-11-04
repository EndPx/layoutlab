// Unified-workspace investigation acceptance (real Edge via
// M3C_CHANNEL=msedge). Recorded/replay paths make zero provider requests;
// the live flow runs against the local fixture transport with real engine
// feedback, all inside the one warehouse workspace.
import { expect, test } from "@playwright/test";
import { expFinish, expRunExp, startExperimentsFixture, type ExperimentsFixture } from "./helpers/experiments-fixture";

let fixture: ExperimentsFixture | null = null;
test.afterEach(async () => {
  await fixture?.stop().catch(() => {});
  fixture = null;
});

test("workspace: recorded replay, candidate inspection, export (offline, 0 paid)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?mode=experiments");
  await expect(page.getByTestId("ws-assistant")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ws-m-scheduled")).toHaveText("6");
  await expect(page.getByTestId("ws-allow-packingDurationMs")).not.toBeChecked();
  await expect(page.getByTestId("ws-start")).toBeDisabled();
  await expect(page.getByTestId("ws-start-reason")).toContainText("Start disabled");

  await page.getByTestId("ws-recorded-load").click();
  await expect(page.getByTestId("ws-results-provenance")).toContainText("Recorded", { timeout: 30_000 });
  await expect(page.getByTestId("ws-results-provenance")).toContainText("fd2247b1-8335-4575-a55b-1f579cc3717b");
  await page.getByTestId("ws-compare-details").locator("summary").click();
  await expect(page.getByTestId("ws-compare-table")).toContainText("8min 22sec");
  await page.getByTestId("ws-tested-details").locator("summary").click();
  await expect(page.getByTestId("ws-tested-details")).toContainText("assistant assertion");

  // Candidate inspection reuses the same single viewer (recorded engine).
  await page.getByTestId("ws-view-exp-2").click();
  await expect(page.getByTestId("ws-viewing-badge")).toContainText("Option 2", { timeout: 30_000 });
  await expect(page.locator("[data-testid=ops-canvas]")).toHaveCount(1);
  await page.getByTestId("ws-return-current").click();
  await expect(page.getByTestId("ws-viewing-badge")).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("ws-export").click(),
  ]);
  expect(await download.suggestedFilename()).toContain("fd2247b1");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("workspace: malformed import shows an error, never a result", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?mode=experiments");
  await page.getByTestId("ws-recorded-load").click();
  await expect(page.getByTestId("ws-results-provenance")).toContainText("Recorded", { timeout: 30_000 });
  await page.getByTestId("ws-import").setInputFiles({
    name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{not json"),
  });
  await expect(page.getByTestId("ws-import-error")).toContainText("Malformed report");
  await page.getByTestId("ws-import").setInputFiles({
    name: "wrong.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ schema: "other/1" })),
  });
  await expect(page.getByTestId("ws-import-error")).toContainText("Unsupported schema");
  await expect(page.getByTestId("ws-results-provenance")).toContainText("Recorded");
});

test("workspace live flow: fixture feedback, recommendation, zero-spend verify", async ({ page }) => {
  test.setTimeout(240_000);
  fixture = await startExperimentsFixture({
    decide: (fb) => (fb.results.some((r) => r.candidateId === "exp-1") ? expFinish("exp-1") : expRunExp({ dispatchDurationMs: 1000 })),
  });
  await page.goto("/?mode=experiments");
  await page.getByTestId("ws-allow-dispatchDurationMs").check();
  await page.getByTestId("ws-live-toggle").check();
  await page.getByTestId("ws-consent").check();
  await expect(page.getByTestId("ws-server-status")).toContainText("fixture", { timeout: 30_000 });
  await expect(page.getByTestId("ws-start")).toBeEnabled();
  await page.getByTestId("ws-start").click();
  await expect(page.getByTestId("ws-run-status")).toContainText("requests 2/4", { timeout: 120_000 });
  await page.getByTestId("ws-compare-details").locator("summary").click();
  await expect(page.getByTestId("ws-compare-table")).toContainText("Option 1");
  expect(fixture.transportRequests()).toBe(2);
  const verifiedResponse = page.waitForResponse(r => r.url().endsWith("/api/operations/investigations/verify") && r.request().method() === "POST");
  await page.getByTestId("ws-verify").click();
  await expect(page.getByTestId("ws-verify-result")).toContainText("Verified", { timeout: 60_000 });
  const metadata = await (await verifiedResponse).json();
  expect(metadata.verifierImplementationVersion).toBe("0.1.1");
  await page.getByTestId("ws-result-tech").locator("summary").click();
  await expect(page.getByTestId("ws-result-tech")).toContainText("Verifier implementation: 0.1.1");
  await page.getByTestId("ws-tech").locator("summary").click();
  await expect(page.getByTestId("ws-tech")).toContainText("Server operations implementation: 0.1.1");
  await page.screenshot({ path: "../../evidence/sanitized/u1-workspace/final-fixture-http-edge.png", fullPage: true });
  expect(fixture.transportRequests()).toBe(2);
});

test("workspace live flow: slower candidate is no improvement", async ({ page }) => {
  test.setTimeout(240_000);
  fixture = await startExperimentsFixture({
    decide: (_fb, call) => (call === 1 ? expRunExp({ dispatchDurationMs: 300000 }) : expFinish("baseline")),
  });
  await page.goto("/?mode=experiments");
  await page.getByTestId("ws-allow-dispatchDurationMs").check();
  await page.getByTestId("ws-live-toggle").check();
  await page.getByTestId("ws-consent").check();
  await page.getByTestId("ws-start").click();
  await page.getByTestId("ws-tested-details").locator("summary").click();
  await expect(page.getByTestId("ws-tested-details")).toContainText("no measured improvement", { timeout: 120_000 });
});

test("workspace: 401 on Start shows sign-in recovery without resubmission", async ({ page }) => {
  test.setTimeout(120_000);
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
  const link = page.getByTestId("ws-live-access");
  await expect(link).toHaveAttribute("href", "/live-access");
  await expect(link).toHaveAttribute("target", "_blank");
  await page.getByTestId("ws-allow-dispatchDurationMs").check();
  await page.getByTestId("ws-live-toggle").check();
  await page.getByTestId("ws-consent").check();
  await expect(page.getByTestId("ws-start")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("ws-start").click();
  await expect(page.getByTestId("ws-error")).toContainText("Sign-in required (401)");
  await page.waitForTimeout(1500);
  expect(creates).toBe(1);
  expect(fixture.transportRequests()).toBe(0);
  await page.getByTestId("ws-recorded-load").click();
  await expect(page.getByTestId("ws-results-provenance")).toContainText("Recorded", { timeout: 30_000 });
});

test("workspace: no-key server disables Start with its reason", async ({ page }) => {
  test.setTimeout(120_000);
  fixture = await startExperimentsFixture({ decide: () => expFinish("baseline"), noKey: true });
  await page.goto("/?mode=experiments");
  await page.getByTestId("ws-live-toggle").check();
  await page.getByTestId("ws-consent").check();
  await page.getByTestId("ws-allow-dispatchDurationMs").check();
  await expect(page.getByTestId("ws-start")).toBeDisabled();
  await expect(page.getByTestId("ws-start-reason")).toContainText("MODEL_API_KEY", { timeout: 30_000 });
});
