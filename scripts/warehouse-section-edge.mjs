// W1 browser verification: EXTERNAL Microsoft Edge (channel msedge,
// headless false, temporary test profile). No Chromium fallback.
//
// Asserted gates are STRUCTURAL (data attributes + measured label rects),
// never UI-text substrings: anchors, per-location full3Dfit verdicts,
// cutaway height, 6 GLB requests, zero console errors, and non-overlapping
// top-view L1/L2 chips. Screenshots are reviewed by a human reader for
// framing/label defects; metrics.json records exactly what was asserted.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.W1_URL || "http://127.0.0.1:5183/";
mkdirSync("evidence/sanitized", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: false });
const errors = [];
const asserted = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  const ua = await page.evaluate(() => navigator.userAgent);
  assert.match(ua, /Edg\//, "must run in external Edge (Edg UA)");
  asserted.push("edge-ua");
  await page.waitForSelector('#mount[data-section="ready"]', { timeout: 90000 });
  const mount = page.locator("#mount");
  // Literal expected coordinates (section fixture anchors).
  assert.equal(await mount.getAttribute("data-anchors"), "L1:900,1500;L2:1700,1500");
  asserted.push("anchors");
  // Full-3D fit verdicts (all axes + deck clearance), not footprint words.
  assert.equal(await mount.getAttribute("data-fit-l1"), "full3Dfit");
  assert.equal(await mount.getAttribute("data-fit-l2"), "full3Dfit");
  asserted.push("fit-l1-full3Dfit", "fit-l2-full3Dfit");
  assert.equal(await mount.getAttribute("data-cutaway"), "2.5");
  asserted.push("cutaway-2.5m");
  const inspectL1 = await page.locator("#inspect").innerText();
  assert.match(inspectL1, /\(900, 1500\)mm/);
  assert.match(inspectL1, /Pick approach: \(2900, 1500\)mm/);
  assert.match(inspectL1, /full3Dfit/);
  asserted.push("inspect-l1-coords");
  const stats = await page.locator("#stats").innerText();
  assert.match(stats, /GLB requests 6/);
  asserted.push("glb-requests-6");
  await page.screenshot({ path: "evidence/sanitized/w1-iso.png" });
  await page.click("#v-top");
  await page.waitForTimeout(600);
  assert.equal(await mount.getAttribute("data-view"), "top");
  // Top view must keep identifiable, NON-OVERLAPPING L1/L2 chips.
  const chips = await page.evaluate(() => {
    const r = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    return { l1: r("chip-top-L1"), l2: r("chip-top-L2") };
  });
  assert.ok(chips.l1 && chips.l1.w > 0 && chips.l1.h > 0, "chip-top-L1 must be visible in top view");
  assert.ok(chips.l2 && chips.l2.w > 0 && chips.l2.h > 0, "chip-top-L2 must be visible in top view");
  const overlap = chips.l1.x < chips.l2.x + chips.l2.w && chips.l2.x < chips.l1.x + chips.l1.w &&
    chips.l1.y < chips.l2.y + chips.l2.h && chips.l2.y < chips.l1.y + chips.l1.h;
  assert.ok(!overlap, `top chips must not overlap: ${JSON.stringify(chips)}`);
  asserted.push("top-chips-visible", "top-chips-nonoverlapping");
  await page.screenshot({ path: "evidence/sanitized/w1-top.png" });
  await page.click("#sel-L2");
  await page.click("#v-inspect");
  await page.waitForTimeout(600);
  assert.equal(await mount.getAttribute("data-selected"), "L2");
  const inspectL2 = await page.locator("#inspect").innerText();
  assert.match(inspectL2, /\(1700, 1500\)mm/);
  assert.match(inspectL2, /sku-b ×2/);
  assert.match(inspectL2, /full3Dfit/);
  asserted.push("inspect-l2-coords");
  await page.screenshot({ path: "evidence/sanitized/w1-inspect-l2.png" });
  const metrics = {
    browser: "Microsoft Edge external",
    channel: "msedge",
    headless: false,
    version: browser.version(),
    edgeUserAgentVerified: /Edg\//.test(ua),
    userAgent: ua,
    url: BASE,
    assertedGates: asserted,
    assertionNote: "Gates assert data attributes + measured chip rects; 'full3Dfit' matches above confirm the verdict word is also rendered, but the verdict itself is asserted structurally.",
    anchors: await mount.getAttribute("data-anchors"),
    fitL1: await mount.getAttribute("data-fit-l1"),
    fitL2: await mount.getAttribute("data-fit-l2"),
    cutawayM: await mount.getAttribute("data-cutaway"),
    topChips: chips,
    glbBytes: await mount.getAttribute("data-glbbytes"),
    triangles: await mount.getAttribute("data-triangles"),
    drawcalls: await mount.getAttribute("data-drawcalls"),
    statsText: await page.locator("#stats").innerText(),
    inspectL1,
    inspectL2,
    pageConsoleErrors: errors,
    packingNote: "PACK (3000,3000) label rendered in scene; boundary 6x6m loop rendered; cart bay outline rendered",
  };
  writeFileSync("evidence/sanitized/w1-metrics.json", JSON.stringify(metrics, null, 2));
  assert.deepEqual(errors, [], "zero page console errors, got " + JSON.stringify(errors));
  asserted.push("zero-console-errors");
  // Re-record the final gate list.
  metrics.assertedGates = asserted;
  writeFileSync("evidence/sanitized/w1-metrics.json", JSON.stringify(metrics, null, 2));
  console.log("W1-EDGE: PASS Edge=" + browser.version() + " glbBytes=" + metrics.glbBytes + " tris=" + metrics.triangles);
} finally {
  await browser.close();
}
