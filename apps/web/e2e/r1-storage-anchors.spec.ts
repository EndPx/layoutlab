// R1 storage anchors: products render INSIDE rack slots at synthetic
// storage anchors; aisle approaches stay hidden unless selected or on the
// selected order's route. Routing endpoints and travel math are unchanged.
import { expect, test } from "@playwright/test";
import { clickOpen } from "./helpers/ui";

test.describe("R1 storage anchors", () => {
  test("valid sample renders products inside rack slots", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    // Baseline truth preserved (evaluator-owned, never hardcoded in views).
    await expect(page.getByTestId("baseline-metrics")).toContainText("36.8 m");
    await expect(page.getByTestId("metric-reachable")).toContainText("3 / 3");
    await page.getByTestId("view-tab-2d").click();
    // L1 slot + Product A box at the shared anchor (900,1500,base 0).
    await expect(page.getByTestId("slot-L1")).toHaveAttribute("data-anchor", "900,1500,0");
    const storedA = page.getByTestId("stored-sku-a");
    await expect(storedA).toHaveAttribute("data-location", "L1");
    await expect(storedA).toHaveAttribute("data-anchor", "900,1500,0");
    await expect(page.getByTestId("stored-sku-f")).toHaveAttribute("data-location", "L8");
    // Slot geometry is truly inside the R1 footprint (500..2100,1100..1900).
    const slot = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="slot-L1"]');
      return {
        x: Number(el?.getAttribute("x")),
        y: Number(el?.getAttribute("y")),
        w: Number(el?.getAttribute("width")),
        h: Number(el?.getAttribute("height")),
      };
    });
    expect(slot).toEqual({ x: 500, y: 1200, w: 800, h: 600 });
  });

  test("selected order reveals only its actual pick approaches", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("view-tab-2d").click();
    // Default order O1 visits sku-a@L1 + sku-c@L3: exactly those approaches.
    await expect(page.getByTestId("approach-L1")).toBeVisible();
    await expect(page.getByTestId("approach-L1")).toHaveAttribute("data-pick", "2900,1500");
    await expect(page.getByTestId("approach-L3")).toBeVisible();
    expect(await page.getByTestId("approach-L2").count()).toBe(0);
    expect(await page.getByTestId("approach-L5").count()).toBe(0);
    // O2 visits sku-b@L2 + sku-f@L8 instead.
    await page.getByTestId("select-order").selectOption("O2");
    await expect(page.getByTestId("approach-L2")).toBeVisible();
    await expect(page.getByTestId("approach-L8")).toBeVisible();
    expect(await page.getByTestId("approach-L1").count()).toBe(0);
    expect(await page.getByTestId("approach-L3").count()).toBe(0);
  });

  test("location selection reveals its approach with exact readout", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("view-tab-2d").click();
    await page.getByTestId("select-location").selectOption("L6");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L6 storage (1700, 4500, base 0) · approach (1300, 3300)",
    );
    await expect(page.getByTestId("approach-L6")).toBeVisible();
    // Route is untouched by selection: identical polyline points.
    const before = await page.getByTestId("route-polyline-current").getAttribute("points");
    await page.getByTestId("select-location").selectOption("L4");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L4 storage (5100, 1500, base 0) · approach (4700, 2700)",
    );
    expect(await page.getByTestId("route-polyline-current").getAttribute("points")).toBe(before);
  });

  test("locate + reassignment moves the stored marker, selection follows", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("view-tab-2d").click();
    await page.getByTestId("locate-sku-b").click();
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L2 storage (1700, 1500, base 0) · approach (1300, 2700)",
    );
    await page.getByTestId("assign-sku-b").selectOption("L6");
    await expect(page.getByTestId("stored-sku-b")).toHaveAttribute("data-location", "L6");
    await expect(page.getByTestId("stored-sku-b")).toHaveAttribute("data-anchor", "1700,4500,0");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L6 storage (1700, 4500, base 0) · approach (1300, 3300)",
    );
  });

  test("duplicate assignment renders every occupant, diagnosed, never repaired", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("assign-sku-f").selectOption("L1");
    await expect(page.getByTestId("valid-badge")).toContainText("INVALID");
    await page.getByTestId("view-tab-2d").click();
    // Both occupants stay rendered at L1; nothing is Map-overwritten away.
    await expect(page.getByTestId("stored-sku-a")).toHaveAttribute("data-location", "L1");
    await expect(page.getByTestId("stored-sku-f")).toHaveAttribute("data-location", "L1");
    await expect(page.getByTestId("svg-2d")).toContainText("⚠×2");
    // Recovery is explicit: back to L8 restores validity.
    await page.getByTestId("assign-sku-f").selectOption("L8");
    await expect(page.getByTestId("valid-badge")).toContainText("VALID");
    await expect(page.getByTestId("stored-sku-f")).toHaveAttribute("data-location", "L8");
  });

  test("3D shares the same anchors with boxed products, no label overlap", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    const canvas = page.getByTestId("three-canvas");
    await expect(canvas).toHaveAttribute("data-asset", "simready-glb", { timeout: 30_000 });
    await expect(canvas).toHaveAttribute(
      "data-anchors",
      "L1:900,1500,0;L2:1700,1500,0;L3:4300,1500,0;L4:5100,1500,0;L5:900,4500,0;L6:1700,4500,0;L7:4300,4500,0;L8:5100,4500,0",
    );
    // Default O1 stops only.
    await expect(canvas).toHaveAttribute("data-approaches-shown", "L1,L3");
    await expect(canvas).toHaveAttribute("data-label-count", "13");
    await expect(canvas).toHaveAttribute("data-label-overlap", "0");
    await expect(canvas).toHaveAttribute("data-racks-loaded", "4");
  });

  test("product selection follows the displayed frame both directions", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("btn-approve").click();
    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("stub-outcome")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("select-heuristic").click();
    await page.getByTestId("toggle-candidate-view").click();
    await page.getByTestId("view-tab-2d").click();
    await page.getByTestId("locate-sku-b").click();
    // Candidate frame: heuristic moves sku-b L2 -> L4.
    await expect(page.getByTestId("stored-sku-b")).toHaveAttribute("data-location", "L4");
    await expect(page.getByTestId("select-location")).toHaveValue("L4");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L4 storage (5100, 1500, base 0) · approach (4700, 2700)",
    );
    // Current frame: the same product resolves to its baseline L2.
    await page.getByTestId("frame-current").click();
    await expect(page.getByTestId("stored-sku-b")).toHaveAttribute("data-location", "L2");
    await expect(page.getByTestId("select-location")).toHaveValue("L2");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L2 storage (1700, 1500, base 0) · approach (1300, 2700)",
    );
    // Back to candidate: L4 again, no stale L2 highlight/readout.
    await page.getByTestId("toggle-candidate-view").click();
    await expect(page.getByTestId("stored-sku-b")).toHaveAttribute("data-location", "L4");
    await expect(page.getByTestId("select-location")).toHaveValue("L4");
    // Another candidate keeps coherence: select follows displayed assignment.
    await page.getByTestId("select-stub-1").click();
    const loc = await page.getByTestId("stored-sku-b").getAttribute("data-location");
    await expect(page.getByTestId("select-location")).toHaveValue(loc ?? "");
    await expect(page.getByTestId("anchor-readout")).toContainText(`${loc} storage`);
    // Independent explicit location still works with no product followed.
    await page.getByTestId("select-location").selectOption("");
    await expect(page.getByTestId("select-location")).toHaveValue("");
    await page.getByTestId("select-location").selectOption("L6");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L6 storage (1700, 4500, base 0) · approach (1300, 3300)",
    );
    await page.getByTestId("frame-current").click();
    await expect(page.getByTestId("select-location")).toHaveValue("L6");
  });

  test("None clears product selection; order stops still shown", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("view-tab-2d").click();
    await page.getByTestId("locate-sku-b").click();
    await page.getByTestId("toggle-route").uncheck();
    await page.getByTestId("toggle-previous-route").uncheck();
    await page.getByTestId("select-location").selectOption("");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "No location selected; approaches hidden except the selected order's stops.",
    );
    expect(await page.locator('[data-testid^="approach-"]').count()).toBe(0);
    expect(await page.locator('tr[aria-current="true"]').count()).toBe(0);
    await page.getByTestId("view-tab-3d").click();
    const canvas = page.getByTestId("three-canvas");
    await expect(canvas).toHaveAttribute("data-asset", "simready-glb", { timeout: 30_000 });
    await expect(canvas).toHaveAttribute("data-approaches-shown", "");
    // The None label states the route-stop exception honestly.
    await expect(page.getByTestId("select-location").locator('option[value=""]')).toHaveText(
      "None (order stops still shown)",
    );
    await page.getByTestId("toggle-previous-route").check();
    await page.getByTestId("view-tab-2d").click();
    await expect(page.getByTestId("approach-L1")).toBeVisible();
    await expect(page.getByTestId("approach-L3")).toBeVisible();
  });

  test("3D selection preserves pan and zoom; reset returns home", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    const canvas = page.getByTestId("three-canvas");
    await expect(canvas).toHaveAttribute("data-asset", "simready-glb", { timeout: 30_000 });
    const homeCam = await canvas.getAttribute("data-cam");
    const homeDist = await canvas.getAttribute("data-cam-dist");
    await canvas.locator("canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      (before) => document.querySelector('[data-testid="three-canvas"]')?.getAttribute("data-cam") !== before,
      homeCam,
      { timeout: 5000 },
    );
    await page.getByTestId("view-3d-zoom-in").click();
    const pannedCam = await canvas.getAttribute("data-cam");
    const pannedPos = await canvas.getAttribute("data-cam-pos");
    const pannedDist = await canvas.getAttribute("data-cam-dist");
    expect(pannedCam).not.toBe(homeCam);
    expect(pannedDist).not.toBe(homeDist);
    // View-only selection keeps position, target, and zoom.
    await page.getByTestId("locate-sku-c").click();
    await expect(canvas).toHaveAttribute("data-cam", pannedCam ?? "");
    await expect(canvas).toHaveAttribute("data-cam-pos", pannedPos ?? "");
    await expect(canvas).toHaveAttribute("data-cam-dist", pannedDist ?? "");
    // Explicit reset returns to the actual home.
    await page.getByTestId("view-3d-reset").click();
    await expect(canvas).toHaveAttribute("data-cam", homeCam ?? "");
    await expect(canvas).toHaveAttribute("data-cam-dist", homeDist ?? "");
  });

  test("3D chips avoid UI overlays and stay inside the canvas", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await expect(page.getByTestId("three-canvas")).toHaveAttribute("data-asset", "simready-glb", { timeout: 30_000 });
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300);
      const overlaps = await page.evaluate(() => {
        const overlap = (a: DOMRect, b: DOMRect): boolean =>
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
        const chips = Array.from(document.querySelectorAll(".tag3d"));
        const vis = (el: Element | null): DOMRect | null =>
          el && (el as HTMLElement).offsetParent !== null ? el.getBoundingClientRect() : null;
        const ribbon = vis(document.querySelector(".proxy-ribbon"));
        const cam = vis(document.querySelector(".three-wrap .cam3d"));
        const status = vis(document.querySelector('[data-testid="three-asset-status"]'));
        const canvas = document.querySelector('[data-testid="three-canvas"] canvas')?.getBoundingClientRect() ?? null;
        const out: string[] = [];
        for (const el of chips) {
          const r = (el as HTMLElement).getBoundingClientRect();
          const label = (el as HTMLElement).textContent ?? "?";
          if (ribbon && overlap(r, ribbon)) out.push(`${label} x ribbon`);
          if (cam && overlap(r, cam)) out.push(`${label} x cam`);
          if (status && overlap(r, status)) out.push(`${label} x status`);
          if (canvas && (r.left < canvas.left - 1 || r.right > canvas.right + 1 || r.top < canvas.top - 1 || r.bottom > canvas.bottom + 1)) {
            out.push(`${label} x clip`);
          }
        }
        return out;
      });
      expect(overlaps, `chip/overlay overlaps at ${width}px`).toEqual([]);
    }
  });

  test("keyboard operates locate and location selection, no page overflow", async ({ page }) => {
    await page.goto("/?mode=planning");
    await clickOpen(page, "btn-sample");
    await page.getByTestId("locate-sku-a").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L1 storage (900, 1500, base 0) · approach (2900, 1500)",
    );
    await page.getByTestId("select-location").focus();
    // Native select moves L1 -> L2 with the keyboard alone.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("select-location")).toHaveValue("L2");
    await expect(page.getByTestId("anchor-readout")).toHaveText(
      "L2 storage (1700, 1500, base 0) · approach (1300, 2700)",
    );
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `page overflow at viewport ${viewportWidth}px`).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
