// M6A reference-interface acceptance: every value is actual state, never a
// reference constant. Oracles below are reviewer-confirmed measurements
// (baseline 36800mm, B->L6 35600mm, heuristic 29800mm, O1 3400mm both
// frames, 3 templates/7 weighted); the UI derives them from core.
import { expect, test } from "@playwright/test";
import { startLiveFixture } from "./helpers/live-fixture";
import { clickOpen } from "./helpers/ui";

test.describe("M6A data truth", () => {
  test("empty state shows N/A with load directions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.goto("/");
    await expect(page.getByTestId("selected-status")).toContainText("No scenario");
    await expect(page.getByTestId("baseline-metrics")).toContainText("N/A");
    await expect(page.getByTestId("metric-reachable")).toContainText("N/A");
    await expect(page.getByTestId("metric-relocated")).toContainText("N/A");
    await expect(page.getByTestId("metric-status")).toContainText("N/A");
    await expect(page.getByTestId("btn-export")).toBeDisabled();
    expect(await page.getByTestId("sample-badge").count()).toBe(0);
    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("sample load shows actual baseline truth", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await expect(page.getByTestId("baseline-metrics")).toContainText("36.8 m");
    await expect(page.getByTestId("metric-reachable")).toContainText("3 / 3");
    await expect(page.getByTestId("metric-cards")).toContainText("3 order templates · 7 frequency-weighted orders");
    await expect(page.getByTestId("metric-relocated")).toContainText("0 / 4");
    await expect(page.getByTestId("metric-cards")).toContainText("Planning limit 4 (requirements not approved)");
    await expect(page.getByTestId("metric-status")).toContainText("Valid");
    await expect(page.getByTestId("sample-badge")).toContainText("Sample mode");
    await expect(page.getByTestId("mode-badge")).toContainText("MANUAL");
    await expect(page.getByTestId("selected-status")).toContainText("Current assignment");
    await expect(page.getByTestId("compare-baseline")).toContainText("36.8 m");
  });

  test("manual edits update every value (no constants)", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("assign-sku-b").selectOption("L6");
    await expect(page.getByTestId("scenario-label")).toContainText("rev 1");
    await expect(page.getByTestId("baseline-metrics")).toContainText("35.6 m");
    await expect(page.getByTestId("compare-baseline")).toContainText("35.6 m");
    // Invalid edit surfaces INVALID + N/A travel, then restores.
    await page.getByTestId("assign-sku-f").selectOption("L1");
    await expect(page.getByTestId("valid-badge")).toContainText("INVALID");
    await expect(page.getByTestId("baseline-metrics")).toContainText("N/A");
    await expect(page.getByTestId("metric-status")).toContainText("Invalid");
    await expect(page.getByTestId("compat-sku-f")).toContainText("class");
    await page.getByTestId("assign-sku-f").selectOption("L8");
    await expect(page.getByTestId("valid-badge")).toContainText("VALID");
    await expect(page.getByTestId("baseline-metrics")).toContainText("35.6 m");
  });

  test("run frame compares against the frozen run baseline, stale is explicit", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
    // Heuristic wins on the sample: 29.8 m vs frozen 36.8 m run baseline.
    await expect(page.getByTestId("selected-status")).toContainText("heuristic selected");
    await expect(page.getByTestId("valid-badge")).toHaveAttribute("title", "Candidate heuristic validity");
    await expect(page.getByTestId("baseline-metrics")).toContainText("29.8 m");
    await expect(page.getByTestId("metric-cards")).toContainText("Run baseline 36.8 m · 19.0% shorter");
    await expect(page.getByTestId("metric-relocated")).toContainText("2 / 4");
    await expect(page.getByTestId("compare-baseline")).toContainText("Run baseline");
    await expect(page.getByTestId("apply-selected")).toBeEnabled();
    // A new edit keeps candidate numbers frozen and marks everything stale.
    await page.getByTestId("frame-current").click();
    await page.getByTestId("assign-sku-c").selectOption("L7");
    await expect(page.getByTestId("valid-badge")).toHaveAttribute("title", "Current assignment validity");
    await expect(page.getByTestId("baseline-metrics")).toContainText("48.8 m");
    await expect(page.getByTestId("stale-notice")).toContainText("Stale revision");
    await expect(page.getByTestId("historical-notice")).toBeVisible();
    await expect(page.getByTestId("compare-baseline")).toContainText("Run baseline (historical)");
    await expect(page.getByTestId("apply-heuristic")).toBeDisabled();
    await expect(page.getByTestId("apply-selected")).toBeDisabled();
    await expect(page.getByTestId("select-baseline")).toBeDisabled();
    await expect(page.getByTestId("route-legend")).toContainText("Current (edited scene)");
    await expect(page.getByTestId("frame-edited-note")).toBeVisible();
    // Back in the candidate frame the frozen numbers are unchanged.
    await page.getByTestId("toggle-candidate-view").click();
    await expect(page.getByTestId("baseline-metrics")).toContainText("29.8 m");
    await expect(page.getByTestId("metric-cards")).toContainText("Historical run baseline 36.8 m");
  });

  test("stepper is data-bound and invalidates approval", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await expect(page.getByTestId("approval-state")).toContainText("approved");
    await page.getByTestId("req-budget-inc").click();
    await expect(page.getByTestId("req-budget")).toHaveValue("5");
    await expect(page.getByTestId("approval-state")).toContainText("not approved");
    await page.getByTestId("req-budget-dec").click();
    await page.getByTestId("req-budget-dec").click();
    await expect(page.getByTestId("req-budget")).toHaveValue("3");
  });

  test("product filter is local-only and preserves rows", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("product-filter").fill("sku-a");
    expect(await page.getByTestId("product-row-sku-a").count()).toBe(1);
    expect(await page.getByTestId("product-row-sku-b").count()).toBe(0);
    await expect(page.getByTestId("demand-sku-a")).toContainText("high (8)");
    await page.getByTestId("product-filter").fill("");
    expect(await page.getByTestId("product-row-sku-f").count()).toBe(1);
  });
  test("candidate frame is read-only; toggles never mutate state", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
    const rev = await page.getByTestId("scenario-label").textContent();
    // Candidate frame: actual heuristic destinations (B->L4, D->L2), no selects.
    await expect(page.getByTestId("frame-readonly-note")).toBeVisible();
    await expect(page.getByTestId("dest-sku-b")).toContainText("L4");
    await expect(page.getByTestId("dest-sku-d")).toContainText("L2");
    expect(await page.getByTestId("assign-sku-b").count()).toBe(0);
    // Current frame: selects return; revision untouched by view toggles.
    await page.getByTestId("frame-current").click();
    await expect(page.getByTestId("assign-sku-b")).toBeVisible();
    await page.getByTestId("toggle-candidate-view").click();
    await expect(page.getByTestId("dest-sku-b")).toBeVisible();
    await expect(page.getByTestId("scenario-label")).toHaveText(rev ?? "");
  });

  test("2D zoom/reset and keyboard switch work without moving racks", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("view-tab-2d").click();
    const svg = page.getByTestId("svg-2d");
    await expect(svg).toHaveAttribute("data-zoom", "1.00");
    const before = await svg.getAttribute("viewBox");
    await page.getByTestId("view-2d-zoom-in").click();
    await expect(svg).toHaveAttribute("data-zoom", "1.25");
    const zoomed = await svg.getAttribute("viewBox");
    expect(zoomed).not.toBe(before);
    await page.getByTestId("view-2d-reset").click();
    await expect(svg).toHaveAttribute("data-zoom", "1.00");
    expect(await svg.getAttribute("viewBox")).toBe(before);
    // Rack geometry never moves: the R1 rect keeps canonical coordinates.
    const r1 = await page.evaluate(() => {
      const svgEl = document.querySelector('[data-testid="svg-2d"]');
      const rect = svgEl?.querySelector("g rect");
      return rect ? [rect.getAttribute("x"), rect.getAttribute("y")] : null;
    });
    expect(r1).toEqual(["500", "1100"]);
    // Keyboard operates the switch.
    await page.getByTestId("view-tab-3d").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("view-3d")).toBeVisible();
    // 3D camera buttons act without console errors.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    await page.getByTestId("view-3d-zoom-in").click();
    await page.getByTestId("view-3d-zoom-out").click();
    await page.getByTestId("view-3d-reset").click();
    expect(errors).toEqual([]);
  });

  test("route coincidence is reported, never invented", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("view-tab-2d").click();
    // O1 is identical in both frames (3400 mm): coincidence is stated.
    await page.getByTestId("select-order").selectOption("O1");
    await expect(page.getByTestId("route-coincide")).toBeVisible();
    await expect(page.getByTestId("route-polyline")).toBeVisible();
    // O2 differs (8000 vs 4600 mm): both routes draw, no coincide note.
    await page.getByTestId("select-order").selectOption("O2");
    await expect(page.getByTestId("route-coincide")).toBeHidden();
    await expect(page.getByTestId("route-polyline")).toBeVisible();
    await expect(page.getByTestId("route-polyline-current")).toBeVisible();
    // Hiding both routes shows the honest fallback, not a fake path.
    await page.getByTestId("toggle-route").click();
    await page.getByTestId("toggle-previous-route").click();
    await expect(page.getByTestId("route-fallback")).toBeVisible();
  });

  test("apply-selected applies the valid completed candidate", async ({ page }) => {
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("apply-selected").click();
    await expect(page.getByTestId("apply-message")).toContainText("Applied heuristic");
    await expect(page.getByTestId("scenario-label")).toContainText("rev 1");
  });

  test("fixture run is labeled FIXTURE, never LIVE, with no bleed into later runs", async ({ page }) => {
    const fixture = await startLiveFixture("fixture-muse-shape");
    try {
      await page.goto("/");
      await clickOpen(page, "btn-sample");
      await clickOpen(page, "provider-live");
      await expect(page.getByTestId("live-status")).toContainText("Fixture ready", { timeout: 15_000 });
      await expect(page.getByTestId("mode-badge")).toContainText("MANUAL");
      await page.getByTestId("live-consent").click();
      await page.getByTestId("btn-interpret").click();
      await expect(page.getByTestId("live-interpreted")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("btn-approve").click();
      await page.getByTestId("btn-generate-live").click();
      await expect(page.getByTestId("live-outcome")).toBeVisible({ timeout: 30_000 });
      // Four local fixture requests ran: the primary badge says FIXTURE —
      // the raw LIVE label from the paused first pass is gone for good.
      await expect(page.getByTestId("mode-badge")).toContainText("FIXTURE");
      expect(await page.getByTestId("mode-badge").innerText()).not.toMatch(/^LIVE$/);
      await expect(page.getByTestId("fixture-badge")).toContainText("FIXTURE");
      expect(await page.getByTestId("live-used-badge").count()).toBe(0);
      // Header validity names the presented frame (invalid attempts have
      // no evaluated candidate and stay unselectable, so the frame title
      // is the observable contract here).
      await expect(page.getByTestId("valid-badge")).toHaveAttribute("title", "Candidate heuristic validity");
      await page.getByTestId("frame-current").click();
      await expect(page.getByTestId("valid-badge")).toHaveAttribute("title", "Current assignment validity");
      // A later stub run supersedes the live run: no fixture/live bleed.
      await clickOpen(page, "provider-stub");
      await page.getByTestId("btn-generate").click();
      await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("mode-badge")).toContainText("STUB");
      expect(await page.getByTestId("fixture-badge").count()).toBe(0);
      expect(await page.getByTestId("live-used-badge").count()).toBe(0);
    } finally {
      await fixture.stop();
    }
  });

  test("desktop reference density at 1586x1007 with readable 3D labels", async ({ page }) => {
    await page.setViewportSize({ width: 1586, height: 1007 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.goto("/");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("select-order").selectOption("O2");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("select-heuristic").click();
    await page.getByTestId("toggle-candidate-view").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="three-canvas"]')?.getAttribute("data-asset") === "simready-glb",
      { timeout: 30_000 },
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    const geo = await page.evaluate(() => {
      const box = (id: string): { top: number; height: number } => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        const r = el?.getBoundingClientRect();
        return { top: Math.round((r?.top ?? 0) + window.scrollY), height: Math.round(r?.height ?? 0) };
      };
      const canvas = document.querySelector('[data-testid="three-canvas"]');
      return {
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        left: box("left-panel"),
        warehouse: box("warehouse-panel"),
        right: box("right-panel"),
        bottom: box("bottom-panel"),
        labelOverlap: canvas?.getAttribute("data-label-overlap"),
        labelCount: canvas?.getAttribute("data-label-count"),
        racks: canvas?.getAttribute("data-racks-loaded"),
        cam: canvas?.getAttribute("data-cam"),
      };
    });
    // Reference density: workspace panels align near 560px, comparison
    // heading near y800, whole page near 1007 (target <=1150 with the
    // actual third proposal row). Bounds carry headroom for font variance;
    // they fail if disclosures regress toward the paused 1413/2290 layout.
    expect(geo.left.height).toBeLessThanOrEqual(640);
    expect(geo.warehouse.height).toBeLessThanOrEqual(640);
    expect(geo.right.height).toBeLessThanOrEqual(640);
    expect(geo.bottom.top).toBeLessThanOrEqual(880);
    expect(geo.scrollHeight).toBeLessThanOrEqual(1180);
    expect(geo.scrollWidth).toBeLessThanOrEqual(1586 + 1);
    // Labels: all 13 canonical chips with zero residual overlap.
    expect(geo.labelCount).toBe("13");
    expect(geo.labelOverlap).toBe("0");
    expect(geo.racks).toBe("4");
    // Keyboard camera pan moves the target without errors.
    await page.getByTestId("three-canvas").locator("canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      (before) => document.querySelector('[data-testid="three-canvas"]')?.getAttribute("data-cam") !== before,
      geo.cam,
      { timeout: 5000 },
    );
    expect(errors).toEqual([]);
  });

  test("fixture transport never reports live-used", async ({ page }) => {
    const fixture = await startLiveFixture("fixture-muse-shape");
    try {
      await page.goto("/");
      await clickOpen(page, "btn-sample");
      await clickOpen(page, "provider-live");
      await expect(page.getByTestId("live-status")).toContainText("Fixture ready", { timeout: 15_000 });
      // Configured + selected, but nothing sent: no live-used badge.
      expect(await page.getByTestId("live-used-badge").count()).toBe(0);
      await page.getByTestId("live-consent").click();
      await page.getByTestId("btn-interpret").click();
      await expect(page.getByTestId("live-interpreted")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("btn-approve").click();
      await page.getByTestId("btn-generate-live").click();
      await expect(page.getByTestId("live-outcome")).toBeVisible({ timeout: 30_000 });
      // Four fixture requests ran; live-used still requires real Meta.
      await expect(page.getByTestId("live-run-status")).toContainText("real Meta 0");
      await expect(page.getByTestId("fixture-badge")).toContainText("FIXTURE");
      expect(await page.getByTestId("live-used-badge").count()).toBe(0);
    } finally {
      await fixture.stop();
    }
  });
});
