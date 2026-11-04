// Entry defaults (unified workspace): bare URL opens the one warehouse
// workspace; ?mode=experiments / ?mode=operations are compatibility aliases
// to the same workspace; legacy storage planning needs explicit access.
import { expect, test } from "@playwright/test";

test("bare URL opens the unified warehouse; legacy planning is explicit", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByTestId("ws-header")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("mode-planning")).toHaveCount(0);
  await expect(page.getByTestId("ws-assistant")).toBeVisible();
  await expect(page.getByTestId("ops-canvas")).toBeVisible({ timeout: 30_000 });

  // Compatibility aliases land on the same workspace.
  await page.goto("/?mode=experiments");
  await expect(page.getByTestId("ws-assistant")).toBeVisible({ timeout: 30_000 });
  await page.goto("/?mode=operations");
  await expect(page.getByTestId("ws-viewport-panel")).toBeVisible({ timeout: 30_000 });
  // The planner's own deep link stays isolated legacy access.
  await page.goto("/?mode=planning&legacy=1");
  await page.getByTestId("scenario-menu-toggle").click();
  await page.getByTestId("btn-sample").click();
  await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic", { timeout: 30_000 });
  await page.getByTestId("ws-back-workspace").click();
  await expect(page.getByTestId("ws-header")).toBeVisible({ timeout: 30_000 });

  // Brand: generated symbol loads at its declared size; favicon is the PNG.
  const symbol = page.getByTestId("brand-symbol");
  await expect(symbol).toBeVisible();
  expect(await symbol.evaluate((img: HTMLImageElement) => ({ ok: img.complete && img.naturalWidth === 1254, w: img.width, h: img.height }))).toEqual({ ok: true, w: 24, h: 24 });
  const favicon = await page.evaluate(() => {
    const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    return link ? { href: link.getAttribute("href"), type: link.type, sizes: link.sizes.value } : null;
  });
  expect(favicon).toEqual({ href: "/brand/layoutlab-symbol-v1.png", type: "image/png", sizes: "1254x1254" });
});
