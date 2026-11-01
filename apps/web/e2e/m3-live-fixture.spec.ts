// M3 live-fixture browser acceptance (desktop 1440 + mobile 390, serialized).
// The browser talks same-origin /api to a real API server backed by a LOCAL
// fake Meta transport: providerKind "fixture", realMetaRequests 0.
import { expect, test } from "@playwright/test";
import { replayReport } from "@layoutlab/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { startLiveFixture, type LiveFixture } from "./helpers/live-fixture";

test.describe("M3 live fixture flow", () => {
  let fixture: LiveFixture | null = null;

  test.beforeAll(async () => {
    fixture = await startLiveFixture("fixture-muse-shape");
  });

  test.afterAll(async () => {
    if (!fixture) return;
    await fixture.stop();
    fixture = null;
  });

  test("live and stub are distinguishable; consent gates inference", async ({ page }) => {
    const before = fixture?.transportRequests() ?? 0;
    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    await expect(page.getByTestId("provider-stub")).toBeChecked();

    await page.getByTestId("provider-live").click();
    await expect(page.getByTestId("live-privacy")).toContainText("sent to Meta Model API");
    await expect(page.getByTestId("live-status")).toContainText("fixture-muse-shape");
    await expect(page.getByTestId("live-status")).toContainText("127.0.0.1");
    await expect(page.getByTestId("live-status")).toContainText("fixture");
    // No contributor disclosure for the non-contributor fixture model.
    expect(await page.getByTestId("live-contributor").count()).toBe(0);
    // Consent gates inference: no transport request without the checkbox.
    await expect(page.getByTestId("btn-interpret")).toBeDisabled();
    expect((fixture?.transportRequests() ?? 0) - before).toBe(0);
    await page.getByTestId("live-consent").click();
    await expect(page.getByTestId("btn-interpret")).toBeEnabled();
  });

  test("interpret, approve, propose, apply, export, replay over fixture transport", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    const before = fixture?.transportRequests() ?? 0;

    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    await page.getByTestId("provider-live").click();
    await expect(page.getByTestId("live-status")).toContainText("Live ready", { timeout: 15_000 });
    await page.getByTestId("live-consent").click();

    await page.getByTestId("btn-interpret").click();
    await expect(page.getByTestId("live-interpreted")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("live-run-status")).toContainText("AWAITING_APPROVAL");
    // Interpretation consumed the first model request; budget is not reset.
    await expect(page.getByTestId("live-run-status")).toContainText("requests 1/4");
    await expect(page.getByTestId("live-run-status")).toContainText("fixture");
    await expect(page.getByTestId("live-run-status")).toContainText("real Meta 0");
    // Default draft carries no open questions.
    expect(await page.getByTestId("live-questions").count()).toBe(0);

    // Approval gate shared with stub: generation stays disabled until approve.
    await expect(page.getByTestId("btn-generate-live")).toBeDisabled();
    await page.getByTestId("btn-approve").click();
    await expect(page.getByTestId("approval-state")).toContainText("approved");
    await page.getByTestId("btn-generate-live").click();
    await expect(page.getByTestId("live-outcome")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("mode-badge")).toContainText("LIVE");
    await expect(page.getByTestId("live-run-status")).toContainText("requests 4/4");
    await expect(page.getByTestId("live-run-status")).toContainText("proposals 3/3");
    expect((fixture?.transportRequests() ?? 0) - before).toBe(4);

    // Timeline retains the invalid unknown-ref proposal beside valid ones.
    await expect(page.getByTestId("timeline-proposal-1")).toContainText("valid");
    await expect(page.getByTestId("timeline-proposal-2")).toContainText("PROPOSAL_UNKNOWN_PRODUCT");
    await expect(page.getByTestId("timeline-proposal-3")).toContainText("valid");

    // Compare + apply the best valid live candidate (proposal-1, 35600).
    await page.getByTestId("select-proposal-1").click();
    await expect(page.getByTestId("relocation-table")).toBeVisible();
    await expect(page.getByTestId("compare-proposal-1")).toContainText("35600");
    await page.getByTestId("apply-proposal-1").click();
    await expect(page.getByTestId("apply-message")).toContainText("Applied proposal-1");

    // No page-level horizontal overflow with the full live UI rendered.
    const viewportWidth = page.viewportSize()?.width ?? 0;
    expect(viewportWidth, "e2e viewport width must be configured").toBeGreaterThan(0);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `page overflow at viewport ${viewportWidth}px`).toBeLessThanOrEqual(viewportWidth + 1);

    const dir = path.join(process.cwd(), "..", "..", "evidence", "sanitized");
    fs.mkdirSync(dir, { recursive: true });
    const tag = testInfo.project.name === "mobile" ? "mobile-390" : "desktop-1440";
    await page.screenshot({ path: path.join(dir, `m3-${tag}-live.png`), fullPage: true });

    // Export downloads the verbatim server report; independently replay it.
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("btn-export").click();
    const file = await download;
    const tmp = testInfo.outputPath("playwright-live-export.json");
    await file.saveAs(tmp);
    const envelope = JSON.parse(fs.readFileSync(tmp, "utf8")) as Record<string, unknown>;
    expect(envelope["envelopeVersion"]).toBe("layoutlab.m3report/1");
    expect(envelope["provider"]).toBe("meta");
    expect(envelope["providerKind"]).toBe("fixture");
    expect(envelope["realMetaRequests"]).toBe(0);
    expect(envelope["modelId"]).toBe("fixture-muse-shape");
    expect(envelope["modelRequestsUsed"]).toBe(4);
    expect(envelope["proposalsUsed"]).toBe(3);
    expect(JSON.stringify(envelope)).not.toContain("fixture-only-key");
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

    const replayTmp = testInfo.outputPath("playwright-live-replay.json");
    fs.writeFileSync(replayTmp, JSON.stringify(envelope));
    await page.getByTestId("input-replay").setInputFiles(replayTmp);
    await expect(page.getByTestId("replay-verdict")).toContainText("matches saved");
    fs.unlinkSync(replayTmp);

    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("open interpreted questions block proposals until resolved", async ({ page }, testInfo) => {
    await fixture?.stop();
    fixture = await startLiveFixture("fixture-muse-shape", "questions");
    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    await page.getByTestId("provider-live").click();
    await expect(page.getByTestId("live-status")).toContainText("Live ready", { timeout: 15_000 });
    await page.getByTestId("live-consent").click();
    await page.getByTestId("btn-interpret").click();
    await expect(page.getByTestId("live-questions")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("live-question-0")).toContainText("cold-chain");
    await page.getByTestId("btn-approve").click();
    // Approval succeeds but generation stays gated on the open question.
    await expect(page.getByTestId("btn-generate-live")).toBeDisabled();
    await page.getByTestId("resolve-question-0").click();
    expect(await page.getByTestId("live-questions").count()).toBe(0);
    // Resolving invalidates approval; re-approve, then generation opens.
    await expect(page.getByTestId("approval-state")).toContainText("not approved");
    await page.getByTestId("btn-approve").click();
    await expect(page.getByTestId("btn-generate-live")).toBeEnabled();
    await page.getByTestId("btn-generate-live").click();
    await expect(page.getByTestId("live-outcome")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("live-run-status")).toContainText("COMPLETED");
  });

  test("failed runs stay inspectable but cannot apply", async ({ page }, testInfo) => {
    await fixture?.stop();
    fixture = await startLiveFixture("fixture-muse-shape", "fail-second");
    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    await page.getByTestId("provider-live").click();
    await expect(page.getByTestId("live-status")).toContainText("Live ready", { timeout: 15_000 });
    await page.getByTestId("live-consent").click();
    await page.getByTestId("btn-interpret").click();
    await expect(page.getByTestId("live-interpreted")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate-live").click();
    await expect(page.getByTestId("live-outcome")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("live-run-status")).toContainText("FAILED");
    // The valid first proposal is visible but not applicable.
    await expect(page.getByTestId("compare-proposal-1")).toContainText("35600");
    await expect(page.getByTestId("apply-proposal-1")).toBeDisabled();
  });

  test("reset during slow interpretation leaves no stale live state", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await fixture?.stop();
    fixture = await startLiveFixture("fixture-muse-shape", "slow-interpret");
    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    await page.getByTestId("provider-live").click();
    await expect(page.getByTestId("live-status")).toContainText("Live ready", { timeout: 15_000 });
    await page.getByTestId("live-consent").click();
    await page.getByTestId("btn-interpret").click();
    await expect(page.getByTestId("live-busy")).toBeVisible();
    // Reset mid-interpretation: the stale result must commit nothing.
    await page.getByTestId("btn-reset").click();
    await expect(page.getByTestId("scenario-label")).toContainText("no scenario");
    await page.waitForTimeout(3500);
    await expect(page.getByTestId("scenario-label")).toContainText("no scenario");
    expect(await page.getByTestId("live-run-status").count()).toBe(0);
    // Fresh load works afterwards.
    await page.getByTestId("btn-sample").click();
    await expect(page.getByTestId("valid-badge")).toBeVisible();
    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("tampered M3 metadata is rejected before replay", async ({ page }, testInfo) => {
    await page.goto("/");
    const base = {
      envelopeVersion: "layoutlab.m3report/1",
      provider: "meta",
      providerKind: "fixture",
      realMetaRequests: 0,
      runId: "run-tamper",
      exportedAt: new Date().toISOString(),
      modelId: "fixture-muse-shape",
      promptVersion: "layoutlab.m3prompt/1",
      modelRequestsUsed: 4,
      proposalsUsed: 3,
      budgets: { maxProposals: 3, maxRequests: 4, timeoutMs: 120000 },
      attempts: [{}, {}, {}],
      candidates: [],
      limitations: ["x"],
    };
    const tamper = async (name: string, mutate: (e: Record<string, unknown>) => void, match: RegExp): Promise<void> => {
      const e = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
      mutate(e);
      const tmp = testInfo.outputPath(`${name}.json`);
      fs.writeFileSync(tmp, JSON.stringify(e));
      await page.getByTestId("input-replay").setInputFiles(tmp);
      await expect(page.getByTestId("replay-error")).toContainText(match);
      fs.unlinkSync(tmp);
    };
    await tamper("m3-negative-budget", (e) => {
      e["budgets"] = { maxProposals: -1, maxRequests: 4, timeoutMs: 120000 };
    }, /budgets/);
    await tamper("m3-props-exceed-requests", (e) => {
      e["modelRequestsUsed"] = 1;
      e["proposalsUsed"] = 3;
    }, /cannot exceed/);
    await tamper("m3-fixture-real", (e) => {
      e["realMetaRequests"] = 1;
    }, /realMetaRequests 0/);
  });

  test("contributor model id discloses training-data use", async ({ page }, testInfo) => {
    await fixture?.stop();
    fixture = await startLiveFixture("muse-spark-1.3-contributor");
    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    await page.getByTestId("provider-live").click();
    await expect(page.getByTestId("live-status")).toContainText("muse-spark-1.3-contributor", { timeout: 15_000 });
    await expect(page.getByTestId("live-contributor")).toContainText("training-data use");
  });
});
