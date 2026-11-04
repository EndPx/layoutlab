// Entry defaults (E4b follow-up): bare URL opens Operations Simulation;
// the planner and Experiments stay reachable by explicit mode, with state
// preserved across switches.
import { expect, test } from "@playwright/test";

test("bare URL defaults to operations; explicit modes preserve planner state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("mode-operations")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ops-panel")).toBeVisible();

  await page.goto("/?mode=planning");
  await expect(page.getByTestId("mode-planning")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("scenario-menu-toggle").click();
  await page.getByTestId("btn-sample").click();
  await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic");

  await page.getByTestId("mode-operations").click();
  await expect(page.getByTestId("ops-panel")).toBeVisible();
  await page.getByTestId("mode-planning").click();
  await expect(page.getByTestId("scenario-label")).toContainText("warehouse-basic");

  // Brand: generated symbol loads at its declared size; favicon is the PNG.
  const symbol = page.getByTestId("brand-symbol");
  await expect(symbol).toBeVisible();
  expect(await symbol.evaluate((img: HTMLImageElement) => ({ ok: img.complete && img.naturalWidth === 1254, w: img.width, h: img.height }))).toEqual({ ok: true, w: 24, h: 24 });
  const favicon = await page.evaluate(() => {
    const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    return link ? { href: link.getAttribute("href"), type: link.type, sizes: link.sizes.value } : null;
  });
  expect(favicon).toEqual({ href: "/brand/layoutlab-symbol-v1.png", type: "image/png", sizes: "1254x1254" });

  await page.goto("/?mode=experiments");
  await expect(page.getByTestId("mode-experiments")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("experiments-panel")).toBeVisible();
});
