import { test, expect } from "@playwright/test";
test("main human asset and pause diagnostics", async ({ page }, info) => {
 await page.route("**/api/status", r=>r.fulfill({json:{configured:false}}));
 await page.route("**/api/budget", r=>r.fulfill({json:{}}));
 await page.goto("/");
 const canvas=page.getByTestId("ops-canvas");
 await expect(canvas).toHaveAttribute("data-human-asset-status","loaded-cyclic-gait",{timeout:30000});
 await page.screenshot({path:`../../evidence/sanitized/human-main-viewer/${info.project.name}-paused.png`,fullPage:true});
 await page.getByTestId("ws-run").click(); await page.waitForTimeout(1500);
 await page.getByTestId("ws-pause").click();
 const poses=await canvas.getAttribute("data-poses"); await page.waitForTimeout(500);
 await expect(canvas).toHaveAttribute("data-poses",poses!);
 await page.screenshot({path:`../../evidence/sanitized/human-main-viewer/${info.project.name}-run-paused.png`,fullPage:true});
 await page.getByTestId("ws-reset").click();
 await expect(page.getByTestId("ws-clock")).toContainText("00:00.000");
});
