// M5 failure-audit browser acceptance (desktop 1440 + mobile 390, serialized).
// A cancelled live run exports an honest failure audit (no measurements),
// never a silent success report. Fixture transport only.
import { expect, test } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { startLiveFixture, type LiveFixture } from "./helpers/live-fixture";

test.describe("M5 failure audit flow", () => {
  let fixture: LiveFixture | null = null;

  test.beforeAll(async () => {
    fixture = await startLiveFixture("fixture-muse-shape", "slow-interpret");
  });

  test.afterAll(async () => {
    if (!fixture) return;
    await fixture.stop();
    fixture = null;
  });

  test("cancelled live run exports a failure audit and replays the no-measurement boundary", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    await page.getByTestId("provider-live").click();
    await expect(page.getByTestId("live-status")).toContainText("Live ready", { timeout: 15_000 });
    await page.getByTestId("live-consent").click();
    await page.getByTestId("btn-interpret").click();
    await expect(page.getByTestId("live-busy")).toBeVisible();
    await page.getByTestId("btn-cancel-live").click();
    await expect(page.getByTestId("live-run-status")).toContainText("CANCELLED", { timeout: 15_000 });

    // Export offers the failure audit, explicitly without measurements.
    await expect(page.getByTestId("btn-export")).toContainText("failure audit");
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("btn-export").click();
    const file = await download;
    const tmp = testInfo.outputPath("playwright-failure-audit.json");
    await file.saveAs(tmp);
    const envelope = JSON.parse(fs.readFileSync(tmp, "utf8")) as Record<string, unknown>;
    expect(envelope["envelopeVersion"]).toBe("layoutlab.m5failure/1");
    expect(envelope["state"]).toBe("CANCELLED");
    expect(envelope["outcome"]).toBeNull();
    expect(envelope["reportAvailable"]).toBe(false);
    expect(envelope["measurement"]).toBeNull();
    expect(envelope["attempts"]).toEqual([]);
    expect(envelope["proposalsUsed"]).toBe(0);
    expect(envelope).not.toHaveProperty("candidates");
    expect(envelope).not.toHaveProperty("bestName");
    expect(JSON.stringify(envelope)).not.toContain("IMPROVED");
    expect(JSON.stringify(envelope)).not.toContain("fixture-only-key");

    // Import replays the audit and states the no-measurement boundary.
    await page.getByTestId("input-replay").setInputFiles(tmp);
    await expect(page.getByTestId("replay-verdict")).toContainText("No deterministic measurement existed");
    fs.unlinkSync(tmp);
    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("tampered failure audits are rejected before replay", async ({ page }, testInfo) => {
    await page.goto("/");
    const scenario = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "..", "..", "fixtures", "sample", "warehouse-basic.json"), "utf8"),
    );
    const base = {
      envelopeVersion: "layoutlab.m5failure/1",
      provider: "meta",
      providerKind: "fixture",
      realMetaRequests: 0,
      runId: "run-failure-tamper",
      exportedAt: new Date().toISOString(),
      apiVersion: "0.4.0",
      coreVersion: "0.1.0",
      routePolicy: "nearest-neighbor-a-star/1",
      modelId: "fixture-muse-shape",
      promptVersion: "layoutlab.m4prompt/1",
      generationSettings: { reasoningEffort: "low", maxCompletionTokens: 2000 },
      state: "CANCELLED",
      phase: "INTERPRETING",
      outcome: null,
      reportAvailable: false,
      measurement: null,
      evaluationBoundary: "no measurement",
      proposalsUsed: 0,
      attempts: [],
      modelRequestsUsed: 1,
      budgets: { maxProposals: 3, maxRequests: 4, timeoutMs: 120000 },
      usageTotals: null,
      usageIncomplete: true,
      scenario,
      requestText: "reduce travel",
      requirements: null,
      requirementsDraft: null,
      interpretedUnresolved: [],
      interpretError: null,
      interpretDiagnostics: null,
      lastError: "cancelled",
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
    await tamper("m5-success-claim", (e) => {
      e["outcome"] = "IMPROVED_VALID_ASSIGNMENT";
    }, /outcome/);
    await tamper("m5-report-claim", (e) => {
      e["reportAvailable"] = true;
    }, /reportAvailable/);
    await tamper("m5-attempts-claim", (e) => {
      e["attempts"] = [{ name: "proposal-1" }];
    }, /attempts/);
  });
});
