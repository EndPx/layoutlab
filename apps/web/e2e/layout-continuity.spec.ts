import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
test("draft guards, sequential apply/reset/reopen and original controller restoration",async({page},info)=>{
 test.setTimeout(240000); await page.goto("/"); await expect(page.getByTestId("ops-canvas")).toBeVisible({timeout:30000});
 await page.getByTestId("ws-run").click(); await expect(page.getByTestId("ws-clock")).not.toContainText("00:00.000"); await page.getByTestId("ws-pause").click();
 const clock=await page.getByTestId("ws-clock").textContent(); const poses=await page.getByTestId("ops-canvas").getAttribute("data-poses");
 const editor=page.getByTestId("layout-editor"); const button=(name:string)=>editor.getByRole("button",{name,exact:true});
 await button("Run baseline").click(); await expect(page.getByTestId("layout-baseline")).toBeVisible({timeout:60000}); await button("Edit layout").click();
 await expect(page.getByTestId("ws-run")).toBeDisabled(); await expect(page.getByTestId("ws-step")).toBeDisabled();
 const x=editor.getByRole("spinbutton",{name:"X centre (mm)"}); await x.fill("1000000"); await x.press("Tab"); await expect(editor.getByRole("alert")).toBeVisible();
 await expect(page.getByTestId("ws-step")).toBeDisabled(); await expect(page.getByTestId("ws-run")).toBeDisabled();
 await page.waitForTimeout(200); await expect(page.getByTestId("ws-clock")).toHaveText(clock!);
 await button("Discard / Undo draft").click(); await expect(page.getByTestId("ops-canvas")).toHaveAttribute("data-poses",poses!); await expect(page.getByTestId("ws-clock")).toHaveText(clock!);
 for(const [station,z] of [["PACK-1","4000"],["PACK-2","12000"]]){
  if(station==="PACK-2") { await page.getByTestId("ws-reset").click(); await button("Run baseline").click(); await expect(page.getByTestId("layout-baseline")).toBeVisible({timeout:60000}); }
  await button("Edit layout").click(); await editor.getByRole("combobox",{name:"Packing station",exact:true}).selectOption(station);
  await editor.getByRole("spinbutton",{name:"Z centre (mm)"}).fill(z); await editor.getByRole("spinbutton",{name:"Z centre (mm)"}).press("Tab");
  await button("Validate layout").click(); await expect(page.getByTestId("layout-validation")).toContainText("Validated "+station,{timeout:60000});
  await button("Test layout").click(); await expect(page.getByTestId("layout-comparison")).toBeVisible({timeout:60000});
  await button("Recompute layout export").click(); await expect(editor).toContainText("Verified exact geometry",{timeout:60000});
  const dir=fileURLToPath(new URL("../../../evidence/sanitized/l1-continuity",import.meta.url)); mkdirSync(dir,{recursive:true});
  const downloadPromise=page.waitForEvent("download");await button("Export exact layout results").click();await(await downloadPromise).saveAs(resolve(dir,station+"-"+info.project.name+".json"));
  await button("Apply tested layout").click(); await expect(button("Run baseline")).toBeEnabled();
 }
 await expect(page.getByText("Layout test history (2)",{exact:true})).toBeVisible();
 await page.getByTestId("layout-return-original").click(); await expect(page.getByTestId("ws-clock")).toHaveText(clock!); await expect(page.getByTestId("ops-canvas")).toHaveAttribute("data-poses",poses!);
 await expect(page.getByText("Layout test history (2)",{exact:true})).toBeVisible();
});
