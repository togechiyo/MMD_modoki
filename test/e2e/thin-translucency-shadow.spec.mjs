import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
test.setTimeout(120000);
for (const backend of ["classic", "frameGraph"]) for (const mode of ["cascaded", "standard"]) for(const zeroDepthBias of [false,true]) test(`thin cloth self-shadow comparison ${backend} ${mode} ${zeroDepthBias?"zero-bias":"default-bias"}`,async({},testInfo)=>{
  const app=await launchMmdModoki(root);
  try {
    const page=await app.app.firstWindow();
    await page.waitForFunction(()=>Boolean(window.mmdModokiE2e));
    await page.evaluate(backend=>localStorage.setItem("mmd_modoki.postEffectBackend",backend),backend);
    await page.reload();
    await page.waitForFunction(()=>Boolean(window.mmdModokiE2e));
    await page.evaluate(path=>window.mmdModokiE2e.loadModel(path),resolve(root,"test/fixtures/external-parent/sss-reference.pmx"));
    await page.locator('[data-i18n="menu.tools"]').click();
    await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    const dialog=page.locator('[data-popup-id="experimental-settings"]');
    await dialog.getByLabel("PBRモード",{exact:true}).check();
    await expect(dialog.getByLabel("PBRモード",{exact:true})).toBeEnabled();
    await dialog.locator('[data-experimental-lighting] input[type="checkbox"]').nth(1).uncheck();
    await dialog.locator(".app-menu-dialog-close").click();
    const shadowCommand=page.locator('[data-menu-command="view.lightShadowSettings"]');
    await page.locator(".app-menu-group",{has:shadowCommand}).locator(".app-menu-trigger").click();
    await shadowCommand.click();
    await page.locator("#light-shadow-mode").selectOption(mode);
    await expect.poll(()=>page.evaluate(()=>window.mmdModokiE2e.getShadowRuntimeDiagnostics())).toMatchObject({effectiveMode:mode});
    await page.keyboard.press("Escape");
    await page.locator("#info-model-select").selectOption("__camera__");
    for(const [key,value] of Object.entries({tx:0,ty:1.5,tz:0,rx:0,ry:0,rz:0,camDistance:12})) {
      const field=page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    for(const [axis,value] of [["x",0.3],["y",-0.2],["z",-0.9]]) {
      await page.locator(`#light-direction-${axis}`).fill(String(value));
      await page.locator(`#light-direction-${axis}`).dispatchEvent("input");
    }
    const output=testInfo.outputPath("captures");mkdirSync(output,{recursive:true});
    await page.evaluate(async ({output,zeroDepthBias})=>{
      const {probeThinShadow}=await import("/test/e2e/helpers/thin-translucency-shadow-probe.mjs");
      await probeThinShadow(name=>window.mmdModokiE2e.captureSinglePngSurfaceToPath(output+"/"+name,1152,648),zeroDepthBias);
    },{output,zeroDepthBias});
    const self=PNG.sync.read(readFileSync(resolve(output,"pbr-thin-translucent-self-shadow/single_rgba_surface_e2e.png"))).data;
    const clear=PNG.sync.read(readFileSync(resolve(output,"pbr-thin-translucent-no-self-shadow/single_rgba_surface_e2e.png"))).data;
    let darkened=0;
    for(let i=0;i<self.length;i+=4) if(clear[i]>self[i]+16) darkened++;
    expect(darkened).toBeLessThan(1000);
    const blocked=PNG.sync.read(readFileSync(resolve(output,"thin-external-shadow/single_rgba_surface_e2e.png"))).data;
    let occluded=0;
    for(let i=0;i<self.length;i+=4) if(self[i]>blocked[i]+16) occluded++;
    expect(occluded).toBeGreaterThan(1000);
    expect((await page.evaluate(()=>window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  }finally{await app.close();}
});
