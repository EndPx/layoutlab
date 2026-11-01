import { expect, test, type TestInfo } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

// Per-test output dir: desktop/mobile projects run concurrently and must
// not share one fixed filename.
function tmpFile(info: TestInfo, name: string, contents: string): string {
  const p = info.outputPath(name);
  fs.writeFileSync(p, contents);
  return p;
}

test.describe("M2 trust boundaries", () => {
  test("malformed scenario and replay imports show useful errors", async ({ page }, testInfo) => {
    await page.goto("/");
    const badJson = tmpFile(testInfo, "bad.json", "{not json");
    await page.getByTestId("input-scenario").setInputFiles(badJson);
    await expect(page.getByTestId("scenario-error")).toContainText(/Invalid/i);
    fs.unlinkSync(badJson);

    const wrongShape = tmpFile(testInfo, "wrong.json", JSON.stringify({ foo: 1 }));
    await page.getByTestId("input-scenario").setInputFiles(wrongShape);
    await expect(page.getByTestId("scenario-error")).toContainText(/Invalid/i);
    fs.unlinkSync(wrongShape);

    const badReplay = tmpFile(testInfo, "bad-replay.json", "{oops");
    await page.getByTestId("input-replay").setInputFiles(badReplay);
    await expect(page.getByTestId("replay-error")).toContainText(/Replay failed/i);
    fs.unlinkSync(badReplay);
  });

  test("tampered envelope metadata is rejected before replay", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("btn-export").click();
    const file = await download;
    const tmp = testInfo.outputPath("export-manual.json");
    await file.saveAs(tmp);
    const envelope = JSON.parse(fs.readFileSync(tmp, "utf8")) as Record<string, unknown>;
    expect(envelope["provider"]).toBe("manual");
    fs.unlinkSync(tmp);

    // Claim a live model request: must fail provenance validation.
    const tampered = { ...envelope, modelRequests: 1 };
    const t1 = tmpFile(testInfo, "tampered-1.json", JSON.stringify(tampered));
    await page.getByTestId("input-replay").setInputFiles(t1);
    await expect(page.getByTestId("replay-error")).toContainText(/modelRequests/);
    fs.unlinkSync(t1);

    // Manual envelopes must hold zero generated candidates.
    const tampered2 = {
      ...envelope,
      candidates: [
        {
          name: "forged",
          assignment: [],
          valid: true,
          weightedTravelMm: 1,
          relocationCount: 0,
          workload: null,
        },
      ],
    };
    const t2 = tmpFile(testInfo, "tampered-2.json", JSON.stringify(tampered2));
    await page.getByTestId("input-replay").setInputFiles(t2);
    await expect(page.getByTestId("replay-error")).toContainText(/Manual envelopes/);
    fs.unlinkSync(t2);
  });

  test("malicious storage cannot crash the planner", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("layoutlab.m2.v1", "{corrupt");
    });
    await page.reload();
    await expect(page.getByTestId("notice")).toContainText(/valid JSON|fresh/i);
    await page.getByTestId("btn-sample").click();
    await expect(page.getByTestId("valid-badge")).toBeVisible();

    // Crafted stub candidate with non-string members must fail validation, not crash core.
    await page.evaluate(() => {
      const raw = localStorage.getItem("layoutlab.m2.v1");
      if (!raw) return;
      const state = JSON.parse(raw) as Record<string, unknown>;
      state["stubCandidates"] = [
        { name: "evil", mapping: [{ productId: 1, locationId: 2 }], rationale: "x" },
      ];
      state["stubBaselineRevision"] = 0;
      state["stubBaselineId"] = "warehouse-basic";
      state["stubBaselineFingerprint"] = "x";
      state["mode"] = "STUB";
      localStorage.setItem("layoutlab.m2.v1", JSON.stringify(state));
    });
    await page.reload();
    // Either a clean notice or a fresh load; the planner must stay usable.
    await expect(page.getByTestId("btn-sample")).toBeVisible();
    await page.getByTestId("btn-sample").click();
    await expect(page.getByTestId("valid-badge")).toBeVisible();
  });

  test("2D/3D views render without console errors (screenshot)", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.goto("/");
    await page.getByTestId("btn-sample").click();
    await expect(page.getByTestId("svg-2d")).toBeVisible();
    await expect(page.getByTestId("route-polyline")).toBeVisible();
    await expect(page.getByTestId("view-3d")).toBeVisible();
    await expect(page.getByTestId("three-canvas")).toBeVisible();

    // No page-level horizontal overflow at the configured viewport (mobile
    // emulation can expand innerWidth to content, so the oracle is the
    // configured viewport width, not innerWidth).
    const viewportWidth = page.viewportSize()?.width ?? 0;
    expect(viewportWidth, "e2e viewport width must be configured").toBeGreaterThan(0);
    const metrics = await page.evaluate(() => {
      const box = (el: Element | null): { x: number; width: number } | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, width: r.width };
      };
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        main: box(document.querySelector(".main")),
        view2d: box(document.querySelector('[data-testid="view-2d"]')),
        leftTable: box(document.querySelector('[data-testid="left-panel"] table')),
        comparisonTable: box(document.querySelector('[data-testid="comparison-table"]')),
      };
    });
    expect(
      metrics.scrollWidth,
      `page overflow at viewport ${viewportWidth}px (innerWidth ${metrics.innerWidth}): boxes ${JSON.stringify(metrics)}`,
    ).toBeLessThanOrEqual(viewportWidth + 1);
    if (metrics.view2d) {
      expect(metrics.view2d.x + metrics.view2d.width).toBeLessThanOrEqual(viewportWidth + 1);
    }

    const dir = path.join(process.cwd(), "..", "..", "evidence", "sanitized");
    fs.mkdirSync(dir, { recursive: true });
    const tag = testInfo.project.name === "mobile" ? "mobile-390" : "desktop-1440";
    await page.screenshot({ path: path.join(dir, `m2-${tag}.png`), fullPage: true });
    await page.getByTestId("view-2d").screenshot({ path: path.join(dir, `m2-${tag}-2d.png`) });
    await page.getByTestId("view-3d").screenshot({ path: path.join(dir, `m2-${tag}-3d.png`) });

    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });
});
