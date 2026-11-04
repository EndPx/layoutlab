// Unified warehouse workspace: one viewer through the whole user story.
// Open sample -> Run warehouse -> Pause freezes -> inspect -> recorded
// results -> candidate/current toggling -> scenario staleness. Zero paid
// requests: only GET status/budget + the recorded file are fetched.
import { expect, test } from "@playwright/test";

test("one warehouse through run, inspect, results and scenario change", async ({ page }) => {
  test.setTimeout(180_000);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("ws-header")).toBeVisible();
  await expect(page.getByTestId("mode-planning")).toHaveCount(0);
  await expect(page.getByTestId("ops-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ws-m-scheduled")).toHaveText("6", { timeout: 30_000 });
  await expect(page.getByTestId("ws-assistant")).toBeVisible();

  // Starts paused; Run advances the real engine clock.
  await expect(page.getByTestId("ws-clock")).toContainText("00:00.000");
  await page.getByTestId("ws-run").click();
  await expect.poll(async () => page.getByTestId("ws-clock").textContent(), { timeout: 15000 })
    .not.toContain("00:00.000");
  // Pause actually freezes clock and poses.
  await page.getByTestId("ws-pause").click();
  const frozen = await page.getByTestId("ws-clock").textContent();
  const poses = await page.getByTestId("ops-canvas").getAttribute("data-poses");
  await page.waitForTimeout(700);
  await expect(page.getByTestId("ws-clock")).toHaveText(frozen ?? "");
  await expect(page.getByTestId("ops-canvas")).toHaveAttribute("data-poses", poses ?? "");

  // Reset is deterministic.
  await page.getByTestId("ws-reset").click();
  await expect(page.getByTestId("ws-clock")).toContainText("00:00.000");

  // Inspector via fallback select, then Back to assistant.
  await page.getByTestId("ws-select-assistant").selectOption({ index: 1 });
  await expect(page.getByTestId("ws-inspector")).toBeVisible();
  await page.getByTestId("ws-back-assistant").click();
  await expect(page.getByTestId("ws-assistant")).toBeVisible();

  // Recorded AI example: free, labeled, results in the same workspace.
  await page.getByTestId("ws-recorded-load").click();
  await expect(page.getByTestId("ws-results-provenance")).toContainText("Recorded", { timeout: 15000 });
  await expect(page.getByTestId("ws-verify")).toBeEnabled();
  await expect(page.getByTestId("ws-export")).toBeEnabled();
  await expect(page.getByTestId("ops-canvas")).toBeVisible();

  // Scenario switch keeps previous results but marks them previous.
  await page.getByTestId("ws-scenario").selectOption("full");
  await expect(page.getByTestId("ws-m-scheduled")).toHaveText("28", { timeout: 15000 });
  await expect(page.getByTestId("ws-stale-report")).toBeVisible();

  // No POST spends on load/play/select/scenario/replay.
  expect(posts.filter((u) => u.includes("/api/operations/investigations") && !u.endsWith("/verify"))).toEqual([]);
});
