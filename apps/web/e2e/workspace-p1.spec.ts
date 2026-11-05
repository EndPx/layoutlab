import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {startExperimentsFixture,expFinish} from "./helpers/experiments-fixture";
test("P1 no-key layout and recorded evidence", async ({ page }, info) => {
 test.setTimeout(240000);
 const posts: string[]=[]; page.on("request",r=>{if(r.method()==="POST")posts.push(r.url());});
 await page.goto("/"); await expect(page.getByTestId("ops-canvas")).toBeVisible({timeout:30000});
 await page.screenshot({path:resolve(import.meta.dirname,"../../../evidence/sanitized/workspace-p1",info.project.name+"-entry.png"),fullPage:true});
 await page.getByTestId("ws-run").click();await expect.poll(()=>page.getByTestId("ws-clock").textContent()).not.toContain("00:00.000");await page.getByTestId("ws-pause").click();
 const clock=await page.getByTestId("ws-clock").textContent();await page.waitForTimeout(500);await expect(page.getByTestId("ws-clock")).toHaveText(clock!);
 await page.getByTestId("ws-select-assistant").selectOption({index:1});await expect(page.getByTestId("ws-inspector")).toBeVisible();await page.getByTestId("ws-back-assistant").click();
 const editor=page.getByTestId("layout-editor");
 await editor.getByRole("button",{name:"Run baseline",exact:true}).click();
 await expect(page.getByTestId("layout-baseline")).toContainText("Baseline: 6 shipped",{timeout:90000});
 await editor.getByRole("button",{name:"Edit layout",exact:true}).click();
 const z=editor.getByRole("spinbutton",{name:"Z centre (mm)"});
 await z.fill("4039"); await z.press("Tab"); await expect(z).toHaveValue("4000");
 await editor.getByRole("button",{name:"Validate layout",exact:true}).click();
 await expect(page.getByTestId("layout-validation")).toContainText("Validated PACK-1",{timeout:40000});
 const dir=resolve(import.meta.dirname,"../../../evidence/sanitized/workspace-p1"); mkdirSync(dir,{recursive:true});
 await page.screenshot({path:resolve(dir,info.project.name+"-preview.png"),fullPage:true});
 await editor.getByRole("button",{name:"Test layout",exact:true}).click();
 await expect(page.getByTestId("layout-comparison")).toBeVisible({timeout:90000});
 await expect(page.getByTestId("layout-comparison").getByRole("table")).toContainText("Time to finish");
 await expect(page.getByTestId("layout-comparison").getByRole("table")).not.toContainText("makespanMs");
 await expect(page.getByTestId("layout-outcome")).toContainText("Valid proposed layout");
 await expect(page.getByTestId("layout-comparison-tech").locator("pre")).toContainText("makespanMs");
 await editor.getByRole("button",{name:"Recompute layout export",exact:true}).click();
 await expect(editor).toContainText("Verified exact geometry",{timeout:90000});
 const downloadPromise=page.waitForEvent("download"); await editor.getByRole("button",{name:"Export exact layout results",exact:true}).click(); const download=await downloadPromise; await download.saveAs(resolve(dir,info.project.name+"-comparison.json"));
 await page.screenshot({path:resolve(dir,info.project.name+"-comparison.png"),fullPage:true});
 await z.fill("11000"); await z.press("Tab");
 await expect(page.getByTestId("layout-comparison")).toHaveCount(0);
 await expect(editor.getByRole("button",{name:"Test layout",exact:true})).toBeDisabled();
 await editor.getByRole("button",{name:"Validate layout",exact:true}).click();
 await expect(page.getByTestId("layout-validation")).toContainText("Invalid preview",{timeout:40000});
 await expect(editor.getByRole("button",{name:"Test layout",exact:true})).toBeDisabled();
 await expect(editor.getByRole("button",{name:"Apply tested layout",exact:true})).toBeDisabled();
 await page.screenshot({path:resolve(dir,info.project.name+"-invalid.png"),fullPage:true});
 await editor.getByRole("button",{name:"Discard / Undo draft",exact:true}).click();
 await expect(editor).toContainText("Previous layout tests (1)");
 await editor.getByRole("button",{name:"Edit layout",exact:true}).click(); await expect(z).toHaveValue("5000");
 await editor.getByRole("button",{name:"Discard / Undo draft",exact:true}).click();
 // Apply only the freshly validated/tested candidate, never a stale one.
 await editor.getByRole("button",{name:"Edit layout",exact:true}).click();
 await z.fill("4000"); await z.press("Tab");
 await editor.getByRole("button",{name:"Validate layout",exact:true}).click();
 await expect(page.getByTestId("layout-validation")).toContainText("Validated PACK-1",{timeout:40000});
 await editor.getByRole("button",{name:"Test layout",exact:true}).click();
 await expect(page.getByTestId("layout-comparison")).toBeVisible({timeout:90000});
 await editor.getByRole("button",{name:"Apply tested layout",exact:true}).click();
 await expect(editor.getByRole("button",{name:"Run baseline",exact:true})).toBeEnabled();
 await expect(page.getByTestId("ws-run")).toBeEnabled();
 await page.getByTestId("ws-reset").click(); await expect(page.getByTestId("ws-clock")).toContainText("00:00.000");
 await page.getByTestId("ws-scenario").selectOption("full"); await expect(page.getByTestId("layout-baseline")).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.getByTestId("ws-recorded-load").click();await expect(page.getByTestId("ws-results-provenance")).toContainText("Recorded",{timeout:15000});await page.screenshot({path:resolve(dir,info.project.name+"-recorded.png"),fullPage:true});
 expect(posts).toEqual([]); writeFileSync(resolve(dir,info.project.name+"-browser.json"),JSON.stringify({browser:info.project.use.channel,posts,scenarioReset:true,realEngine:true},null,2));
});


test('P1 keyboard recorded example and real API verification without a key',async({page},info)=>{
 test.setTimeout(120000);
 const fixture=await startExperimentsFixture({noKey:true,decide:()=>expFinish('baseline')});
 try{
 const posts:string[]=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await page.goto('/');await expect(page.getByTestId('ws-recorded-load')).toBeVisible({timeout:30000});
 await page.getByTestId('ws-recorded-load').focus();await expect(page.getByTestId('ws-recorded-load')).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.getByTestId('ws-recorded-result-cue')).toContainText('Recorded');
 const link=page.getByTestId('ws-recorded-result-cue').getByRole('link');await link.focus();await page.keyboard.press('Enter');await expect(page.getByTestId('ws-results')).toBeInViewport();
 await page.getByTestId('ws-verify').click();await expect(page.getByTestId('ws-verify-result')).toContainText('Verified',{timeout:90000});
 expect(fixture.transportRequests()).toBe(0);expect(posts).toHaveLength(1);expect(posts[0]).toContain('/investigations/verify');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const dir=resolve(import.meta.dirname,'../../../evidence/sanitized/workspace-p1');
 await page.screenshot({path:resolve(dir,info.project.name+'-verified.png'),fullPage:true});
 writeFileSync(resolve(dir,info.project.name+'-verified.json'),JSON.stringify({posts,providerCalls:fixture.transportRequests(),keyboard:true,noKey:true,apiVerify:true},null,2));
 }finally{await fixture.stop();}
});


test('P1 comparison presentation final evidence',async({page},info)=>{
 test.setTimeout(120000);await page.goto('/');await expect(page.getByTestId('ops-canvas')).toBeVisible({timeout:30000});
 const editor=page.getByTestId('layout-editor'),button=(name:string)=>editor.getByRole('button',{name,exact:true});
 await button('Run baseline').click();await expect(page.getByTestId('layout-baseline')).toContainText('6 shipped',{timeout:90000});await button('Edit layout').click();
 const z=editor.getByRole('spinbutton',{name:'Z centre (mm)'});await z.fill('4000');await z.press('Tab');await button('Validate layout').click();await expect(page.getByTestId('layout-validation')).toContainText('Validated PACK-1',{timeout:40000});await button('Test layout').click();
 const comparison=page.getByTestId('layout-comparison');await expect(comparison).toBeVisible({timeout:90000});const table=comparison.getByRole('table');await expect(table).toContainText('8 min 22.4 s');await expect(table).toContainText('+8.7 s');await expect(table.locator('[title="502400 ms"]').first()).toBeVisible();await expect(comparison).toContainText('Worse on at least one measured criterion');
 await page.getByTestId('layout-comparison-tech').locator('summary').click();await expect(page.getByTestId('layout-comparison-tech')).toContainText('502400');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByTestId('layout-comparison-tech').locator('summary').click();await table.scrollIntoViewIfNeeded();
 const dir=resolve(import.meta.dirname,'../../../evidence/sanitized/workspace-p1');await page.screenshot({path:resolve(dir,info.project.name+'-comparison-after-format.png'),fullPage:true});
});
