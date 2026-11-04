// Operations Simulation mode: main-environment integration in the real app.
import { expect, test } from "@playwright/test";

test.describe("operations environment", () => {
  // Sourced geometry is ~64 MB with ~19M triangles; software rendering in CI
  // needs a generous budget for first load + first frames.
  test.setTimeout(180_000);
  test("mode switch preserves the planner scene", async ({ page }) => {
    await page.goto("/?mode=planning");
    await page.getByTestId("scenario-menu-toggle").click();
    await page.getByTestId("btn-sample").click();
    await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic");
    await page.getByTestId("mode-operations").click();
    await expect(page.getByTestId("ops-state-badge")).toContainText("READY");
    await expect(page.getByTestId("ops-status")).toContainText("picking-packing-burst");
    await page.getByTestId("mode-planning").click();
    await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic");
    await expect(page.getByTestId("selected-status")).toContainText("Current assignment");
  });

  test("mode URL loads the environment with sourced geometry", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
    });
    await page.goto("/?mode=operations");
    await expect(page.getByTestId("ops-status")).toContainText("picking-packing-burst");
    await expect(page.getByTestId("ops-status")).toContainText("6 orders");
    await expect(page.getByTestId("ops-status")).toContainText("2 single-lane packing");
    // All 8 sourced assets must load (never silent proxies).
    await expect(page.getByTestId("ops-asset-status")).toContainText("sourced assets loaded", { timeout: 120_000 });
    const canvas = page.getByTestId("ops-canvas");
    await expect(canvas).toHaveAttribute("data-containers", "336");
    const assets = await canvas.getAttribute("data-assets");
    expect(assets).toBeTruthy();
    for (const part of (assets ?? "").split(";")) {
      expect(part).toMatch(/:loaded$/);
    }
    expect(errors).toEqual([]);
  });

  test("camera presets and selection inspection work", async ({ page }) => {
    await page.goto("/?mode=operations");
    await expect(page.getByTestId("ops-asset-status")).toContainText("sourced assets loaded", { timeout: 120_000 });
    const canvas = page.getByTestId("ops-canvas");
    const homePos = await canvas.getAttribute("data-cam-pos");
    await page.getByTestId("ops-preset-top").click();
    const topPos = await canvas.getAttribute("data-cam-pos");
    expect(topPos).not.toEqual(homePos);
    // Top-down: camera high above the room center (12, 9).
    const [tx, ty, tz] = (topPos ?? "").split(",").map(Number);
    expect(ty).toBeGreaterThan(25);
    expect(Math.abs((tx ?? 0) - 12)).toBeLessThan(1);
    expect(Math.abs((tz ?? 0) - 9)).toBeLessThan(1);
    await page.getByTestId("ops-preset-reset").click();
    expect(await canvas.getAttribute("data-cam-pos")).toEqual(homePos);
    // Selection drives the inspector, approach marker, and Inspect preset.
    await expect(page.getByTestId("ops-preset-inspect")).toBeDisabled();
    await page.getByTestId("ops-select").selectOption("location:L01");
    await expect(page.getByTestId("ops-inspector")).toContainText("Slot");
    await expect(page.getByTestId("ops-inspector")).toContainText("L01");
    await expect(canvas).toHaveAttribute("data-approaches-shown", "L01");
    await expect(page.getByTestId("ops-preset-inspect")).toBeEnabled();
    await page.getByTestId("ops-preset-inspect").click();
    const inspectPos = await canvas.getAttribute("data-cam-pos");
    expect(inspectPos).not.toEqual(homePos);
    // Slot labels layer shows all 24 storage slots (leave inspect focus first).
    await page.getByTestId("ops-preset-reset").click();
    await page.getByTestId("ops-labels-slots").click();
    const labelCount = Number(await canvas.getAttribute("data-label-count"));
    expect(labelCount).toBeGreaterThanOrEqual(24);
    // Developer diagnostics carry engineering data, not the main view.
    await page.getByTestId("ops-diagnostics").locator("summary").first().click();
    await expect(page.getByTestId("ops-diagnostics")).toContainText("picking-packing-burst.json");
    await expect(page.getByTestId("ops-diagnostics")).toContainText("336");
  });

  test("header is mode-separated: planner controls hide in operations, restore on return", async ({ page }) => {
    // (a) initialize the planner with the sample scenario.
    await page.goto("/?mode=planning");
    await page.getByTestId("scenario-menu-toggle").click();
    await page.getByTestId("btn-sample").click();
    await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic");
    // (b) operations shows the loaded scenario id + synthetic/configured
    // label, with no planner badges/menu/export (incl. LIVE-USED).
    await page.getByTestId("mode-operations").click();
    await expect(page.getByTestId("scenario-label")).toContainText("picking-packing-burst");
    await expect(page.getByTestId("ops-sample-badge")).toContainText("SYNTHETIC SAMPLE");
    await expect(page.getByTestId("ops-sample-badge")).toContainText("CONFIGURED");
    for (const id of ["sample-badge", "mode-badge", "valid-badge", "live-used-badge", "fixture-badge", "scenario-menu", "btn-export"]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    // No new page-level horizontal overflow at the configured viewport.
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `page overflow at viewport ${viewportWidth}px`).toBeLessThanOrEqual(viewportWidth + 1);
    // (c) switching back restores planner state and controls unchanged.
    await page.getByTestId("mode-planning").click();
    await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic");
    await expect(page.getByTestId("selected-status")).toContainText("Current assignment");
    for (const id of ["scenario-menu", "btn-export", "mode-badge", "valid-badge", "sample-badge"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test("operations URL loads with a truthful header", async ({ page }) => {
    // (d) ?mode=operations initial load labels the loaded scene honestly.
    await page.goto("/?mode=operations");
    await expect(page.getByTestId("scenario-label")).toContainText("picking-packing-burst");
    await expect(page.getByTestId("ops-sample-badge")).toContainText("SYNTHETIC SAMPLE");
    await expect(page.getByTestId("scenario-menu")).toHaveCount(0);
    await expect(page.getByTestId("btn-export")).toHaveCount(0);
    await expect(page.getByTestId("mode-badge")).toHaveCount(0);
  });
});
