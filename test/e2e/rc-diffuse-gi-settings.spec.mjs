import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, closeGi, difference, giInput, giKeys, giSection, giSettings, giSlider, giStatus,
  initialState, openGi, project, receiverDifference, seek } from "./helpers/rc-diffuse-gi-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx");
const withWebm = process.env.MMD_RC_GI_SETTINGS_WEBM === "1";
async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator(`[data-menu-command="${command}"]`).click();
}
async function history(page, action) { await page.locator(`.app-menu-quick-button[data-menu-command="edit.${action}"]`).click(); }
async function register(page) { await giSection(page).getByRole("button", { name: /キー登録|キーを更新|Register key|Update key/ }).click(); }

test("RC diffuse GI settings: GUI, Undo, singleton keys, save, backend, PNG and optional WebM", async ({}, testInfo) => {
  test.setTimeout(withWebm ? 300000 : 180000);
  const launched = await launchMmdModoki(root), report = { errors: [], consoleErrors: [], captures: {}, webm: { requested: withWebm } };
  try {
    launched.app.on("window", page => {
      page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
      page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    });
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page, { fixed: false }); await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    const view = await camera(page); report.projectionCamera = view; report.camera = (await project(page)).camera;
    await openGi(page); expect(await giSettings(page)).toEqual({ enabled: false, strength: 0.5, volume: null });
    await expect(giInput(page, "Strength")).toHaveValue("25");
    await giInput(page, "Enabled").check(); await expect(giStatus(page)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await expect(giStatus(page)).toHaveAttribute("data-automatic-volume", "true");
    await expect(giInput(page, "Size")).not.toHaveValue(""); expect((await giSettings(page)).volume).toBeNull();
    await closeGi(page); await history(page, "undo"); expect((await giSettings(page)).enabled).toBe(false);
    await history(page, "redo"); expect((await giSettings(page)).enabled).toBe(true);
    await openGi(page);
    for (const [field, value] of [["MinX", -8], ["MinY", -2], ["MinZ", -8], ["Size", 16]]) await giInput(page, field).fill(String(value));
    expect((await giSettings(page)).volume).toBeNull(); await giInput(page, "Size").press("Enter");
    const fixed = { min: [-8, -2, -8], size: 16 }; expect((await giSettings(page)).volume).toEqual(fixed);
    await closeGi(page); await history(page, "undo"); expect((await giSettings(page)).volume).toBeNull();
    await history(page, "redo"); expect((await giSettings(page)).volume).toEqual(fixed);
    await openGi(page); await giSection(page).getByRole("button", { name: /^(自動範囲|Automatic volume)$/ }).click();
    expect((await giSettings(page)).volume).toBeNull();
    await giSection(page).getByRole("button", { name: /範囲を再計算|Recalculate volume/ }).click();
    expect((await giSettings(page)).volume?.size).toBeGreaterThan(0); await closeGi(page);
    await history(page, "undo"); expect((await giSettings(page)).volume).toBeNull();
    // Keep the bounded fixed volume for image comparisons, independent of the parked blocker.
    await openGi(page);
    for (const [field, value] of [["MinX", -8], ["MinY", -2], ["MinZ", -8], ["Size", 16]]) await giInput(page, field).fill(String(value));
    await giInput(page, "Size").press("Enter"); await closeGi(page);

    await seek(page, 0); await openGi(page); await giSlider(page, 0); await register(page); await closeGi(page);
    await history(page, "undo"); expect((await giKeys(page))?.keys ?? []).toEqual([]);
    await history(page, "undo"); expect((await giSettings(page)).strength).toBe(0.5);
    await history(page, "redo"); await history(page, "redo");
    await seek(page, 20); await openGi(page); await giSlider(page, 50); await register(page); await closeGi(page);
    await seek(page, 40); await openGi(page); await giInput(page, "Enabled").uncheck(); await register(page); await closeGi(page);
    await seek(page, 60); await openGi(page); await giInput(page, "Enabled").check(); await register(page); await closeGi(page);
    const expectedKeys = [
      { frame: 0, value: { enabled: true, strength: 0 } }, { frame: 20, value: { enabled: true, strength: 1 } },
      { frame: 40, value: { enabled: false, strength: 1 } }, { frame: 60, value: { enabled: true, strength: 1 } },
    ];
    expect((await giKeys(page)).keys).toEqual(expectedKeys);
    await seek(page, 10); await openGi(page); await expect(giInput(page, "Strength")).toHaveValue("25");
    await giInput(page, "Strength").focus(); await giInput(page, "Strength").press("End");
    await closeGi(page); await seek(page, 11); await history(page, "undo");
    expect((await giKeys(page)).keys).toEqual(expectedKeys); expect((await giKeys(page)).preview).toBeUndefined();
    await seek(page, 0); const png0 = await capture(page, testInfo, report, "key-0");
    await seek(page, 20); const png20 = await capture(page, testInfo, report, "key-20");
    report.keyDifference = difference(png0, png20);
    // Background dominates the full image. Measure signed color on the authored
    // white receiver: GI from the red source must add red rather than darken it.
    report.keyReceiver = receiverDifference(png0, png20, view);
    expect(report.keyReceiver.rgbSigned[0]).toBeGreaterThan(0.5);
    expect(report.keyReceiver.redExcess).toBeGreaterThan(0.3);
    await seek(page, 10);
    const path = testInfo.outputPath("rc-gi-project.json");
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, path);
    await menu(page, "file.saveProject"); await expect.poll(() => existsSync(path)).toBe(true);
    const saved = JSON.parse(readFileSync(path, "utf8")); expect(saved.camera).toEqual(report.camera);
    expect(saved.lighting.rcDiffuseGi.volume).toEqual(fixed);
    expect(saved.keyframes.effectAnimations.tracks.find(track => track.effectId === "rcDiffuseGi").keys).toEqual(expectedKeys);
    await openGi(page); await giInput(page, "Enabled").uncheck(); await closeGi(page);
    await menu(page, "file.loadProject"); await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    const restoredState = async () => { const state=await project(page); return { settings:state.lighting.rcDiffuseGi,
      keys:state.keyframes?.effectAnimations?.tracks.find(track=>track.effectId==="rcDiffuseGi")?.keys, frame:state.scene.currentFrame }; };
    const expected = { settings:saved.lighting.rcDiffuseGi,keys:expectedKeys,frame:10 };
    await expect.poll(restoredState).toEqual(expected);
    for (const backend of ["classic", "frameGraph"]) {
      if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
      await page.locator('[data-effect-tab="post"]').click();
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force:true });
      // Backend changes reload the renderer; wait through the gap before its test API exists.
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend===value,backend);
      await expect.poll(restoredState).toEqual(expected);
      await openGi(page); await expect(giInput(page,"Enabled")).toBeChecked(); await expect(giInput(page,"Strength")).toHaveValue("25");
      await expect(giStatus(page)).toHaveAttribute("data-state",backend==="classic"?"unsupported":"ready",{timeout:45000}); await closeGi(page);
    }
    await seek(page,20); const restored=await capture(page,testInfo,report,"restored-key-20");
    report.restoredDifference=difference(png20,restored); expect(report.restoredDifference).toBeLessThan(0.15);
    report.restoredReceiver=receiverDifference(png20,restored,view);
    for(const error of report.restoredReceiver.rgbAbsolute)expect(error).toBeLessThan(0.15);
    await page.evaluate(()=>window.mmdModokiE2e.setAutoRenderEnabled(false));
    // No producer-ready wait after seeking: this covers warm-up of a future ON key.
    await seek(page,40); const png40=await capture(page,testInfo,report,"manual-off-40");
    await seek(page,60); const png60=await capture(page,testInfo,report,"manual-on-60");
    report.manual={off:difference(png0,png40),on:difference(png20,png60),
      offReceiver:receiverDifference(png0,png40,view),onReceiver:receiverDifference(png20,png60,view),
      transitionReceiver:receiverDifference(png40,png60,view)};
    expect(report.manual.off).toBeLessThan(0.15); expect(report.manual.on).toBeLessThan(0.15);
    for(const value of [...report.manual.offReceiver.rgbAbsolute,...report.manual.onReceiver.rgbAbsolute])expect(value).toBeLessThan(0.15);
    expect(report.manual.transitionReceiver.rgbSigned[0]).toBeGreaterThan(0.5);
    expect(report.manual.transitionReceiver.redExcess).toBeGreaterThan(0.3);
    if(withWebm) {
      const webm=testInfo.outputPath("rc-gi-keys.webm");
      await launched.app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},webm);
      await menu(page,"file.webmExportSettings"); await page.locator("#webm-output-use-playback-range").uncheck();
      for(const [name,value] of [["width",640],["height",360],["start-frame",0],["end-frame",60]]) {
        await page.locator(`#webm-output-${name}`).fill(String(value)); await page.locator(`#webm-output-${name}`).press("Enter");
      }
      await page.locator("#webm-output-fps").selectOption("30"); await page.locator("#webm-output-include-audio").uncheck();
      await page.getByRole("button",{name:/^(WebM出力|Export WebM)$/}).click();
      await expect.poll(()=>existsSync(webm)&&statSync(webm).size>1000,{timeout:90000}).toBe(true);
      await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/,{timeout:30000});
      const frames=await page.evaluate(async path=>{
        const bytes=await window.electronAPI.readBinaryFile(path),video=document.createElement("video"),canvas=document.createElement("canvas");
        canvas.width=640;canvas.height=360; const context=canvas.getContext("2d",{willReadFrequently:true});
        if(!context)throw new Error("2D context unavailable");
        const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"video/webm"}));
        try {
          const loaded=new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error("GI WebM decode failed"));});video.src=url;await loaded;
          const result=[];
          for(const frame of [0,20,40,60]) {const sought=new Promise(resolve=>{video.onseeked=resolve;});video.currentTime=(frame+.1)/30;await sought;
            context.drawImage(video,0,0);result.push(Array.from(context.getImageData(0,0,640,360).data));}
          return result;
        } finally {video.removeAttribute("src");video.load();URL.revokeObjectURL(url);}
      },webm);
      const references=[png0,png20,png40,png60];
      const images=frames.map(pixels=>({data:Buffer.from(pixels)}));
      report.webm={requested:true,path:webm,frames:frames.map((pixels,i)=>({frame:i*20,matching:difference(pixels,references[i]),opposite:difference(pixels,i%2?png0:png20),
        receiverMatching:receiverDifference(references[i],images[i],view),receiverOpposite:receiverDifference(i%2?png0:png20,images[i],view)})),
        decodedTransitions:[receiverDifference(images[0],images[1],view),receiverDifference(images[2],images[3],view)]};
      frames.forEach((pixels,i)=>writeFileSync(testInfo.outputPath(`webm-${i*20}.png`),PNG.sync.write({width:640,height:360,data:Buffer.from(pixels)})));
      for(const result of report.webm.frames){
        expect(result.matching).toBeLessThan(1);
        const matching=result.receiverMatching.rgbAbsolute.reduce((sum,value)=>sum+value,0)/3;
        const opposite=result.receiverOpposite.rgbAbsolute.reduce((sum,value)=>sum+value,0)/3;
        expect(matching).toBeLessThan(opposite);
      }
      // Independently compare decoded OFF→ON pairs, so codec bias cannot hide a
      // video worker that omitted GI while the direct PNG path remained correct.
      for(const transition of report.webm.decodedTransitions){
        expect(transition.rgbSigned[0]).toBeGreaterThan(0.3);expect(transition.redExcess).toBeGreaterThan(0.3);
      }
    }
    expect(await page.evaluate(()=>window.mmdModokiE2e.getAutoRenderEnabled())).toBe(false);
    report.validation=await page.evaluate(()=>window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);expect(report.errors).toEqual([]);expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir,{recursive:true});writeFileSync(testInfo.outputPath("report.json"),JSON.stringify(report,null,2));await launched.close();
  }
});
