import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, difference, projectPoints } from "./helpers/rc-diffuse-gi-controls.mjs";
import { closeRcLighting, openRcLighting, rcLightingInput, rcLightingStatus } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = file => resolve(root, "test/fixtures/rc-window-room", file);
const gi = "rcDiffuseGi", sky = "rcSkyOcclusion";
const volume = { min: [-8, -2, -8], size: 16 };
const regions = {
  bounceWall: [[-1.2,.25,6],[1.2,.25,6],[1.2,1,6],[-1.2,1,6]],
  nearFloor: [[-.5,0,3.8],[.5,0,3.8],[.5,0,4.4],[-.5,0,4.4]],
  deepFloor: [[-.8,0,-.5],[.8,0,-.5],[.8,0,.5],[-.8,0,.5]],
};
const read = page => page.evaluate(() => window.rcRoomProbe.roomState());

function regionDelta(off, on, view, points) {
  const polygon = projectPoints(view, points);
  const rgb = [0,0,0], absolute = [0,0,0], offSum = [0,0,0]; let pixels = 0;
  for (let y=0;y<360;y++) for (let x=0;x<640;x++) {
    let positive=false, negative=false;
    for (let j=0;j<4;j++) {
      const a=polygon[j], b=polygon[(j+1)%4], side=(b[0]-a[0])*(y+.5-a[1])-(b[1]-a[1])*(x+.5-a[0]);
      positive ||= side>0; negative ||= side<0;
    }
    if (positive && negative) continue;
    const i=(y*640+x)*4; if(off.data[i+3]<250 || on.data[i+3]<250) continue;
    pixels++;
    for (let c=0;c<3;c++) { const d=on.data[i+c]-off.data[i+c]; rgb[c]+=d; absolute[c]+=Math.abs(d); offSum[c]+=off.data[i+c]; }
  }
  expect(pixels, "ROI must contain visible opaque pixels").toBeGreaterThan(30);
  const mean=rgb.map(v=>v/pixels);
  return { polygon, pixels, rgb:mean, absolute:absolute.map(v=>v/pixels), offMean:offSum.map(v=>v/pixels),
    redExcess:mean[0]-(mean[1]+mean[2])/2 };
}

async function effect(page, id, enabled, expected = enabled ? "ready" : "off") {
  await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(enabled);
  await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", expected, { timeout:45000 });
  await closeRcLighting(page);
}

async function setup(page, file) {
  await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
  await page.evaluate(async volume => {
    const state=window.mmdModokiE2e.exportProjectState(); state.physics.enabled=false;
    Object.assign(state.viewport,{ groundVisible:false, skydomeVisible:false, backgroundDisplayMode:"black" });
    // Fixture illumination only; raster-shadow generator, cascades, bias and distance are untouched.
    Object.assign(state.lighting,{ x:0,y:-1,z:-1,intensity:.6,ambientIntensity:0,shadowEnabled:false,
      lightColor:{r:1,g:1,b:1}, rcDiffuseGi:{enabled:false,strength:.5,volume},
      rcSkyOcclusion:{enabled:false,strength:.5,minimum:.2,volume} });
    await window.mmdModokiE2e.importProjectState(state);
    // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
    window.rcRoomProbe=await import("/test/e2e/helpers/rc-window-room-probe.mjs");
  },volume);
  expect(await page.evaluate(path => path.endsWith(".pmx") ? window.mmdModokiE2e.loadModel(path) : window.mmdModokiE2e.loadAccessory(path),fixture(file))).toBeTruthy();
  if(file.endsWith(".x")) await matchXScale(page,0);
  const view=await camera(page,{tx:0,ty:1.5,tz:3,rx:-10.62,ry:0,rz:0,camDistance:8.14,camFov:60});
  await openRcLighting(page,gi); await closeRcLighting(page);
  await openRcLighting(page,sky); await closeRcLighting(page);
  return view;
}

async function matchXScale(page,index) {
  // X import has a 10x base scale, whereas the UI's Si starts at 1.
  // Match actual world coordinates to the PMX instead of comparing unlike rooms.
  await page.locator("#info-model-select").selectOption(`__accessory__:${index}`);
  await page.locator("#accessory-scale").fill("0.1"); await page.locator("#accessory-scale").press("Enter");
  await expect(page.locator("#accessory-scale")).toHaveValue("0.1");
}

function assertBounds(meshes,min,max) {
  for(let axis=0;axis<3;axis++) {
    expect(Math.min(...meshes.map(m=>m.bounds.min[axis]))).toBeCloseTo(min[axis],4);
    expect(Math.max(...meshes.map(m=>m.bounds.max[axis]))).toBeCloseTo(max[axis],4);
  }
}

async function lightDirection(page, direction) {
  await page.locator("#info-model-select").selectOption("__camera__");
  for(const [axis,value] of direction.map((v,i)=>[["x","y","z"][i],v])) {
    const input=page.locator(`#light-direction-${axis}`);
    if(!await input.isVisible()) await page.locator("#btn-toolbar-mode-toggle").click();
    const min=Number(await input.getAttribute("min")), max=Number(await input.getAttribute("max")), step=Number(await input.getAttribute("step"));
    const fromMin=value-min<=max-value;
    await input.focus(); await input.press(fromMin?"Home":"End");
    for(let i=0;i<Math.round((fromMin?value-min:max-value)/step);i++) await input.press(fromMin?"ArrowRight":"ArrowLeft");
    await expect(input).toHaveValue(String(value));
  }
  const stored=await page.evaluate(()=>window.mmdModokiE2e.exportProjectState().lighting);
  expect([stored.x,stored.y,stored.z]).toEqual(direction);
}

async function applyStandard(page, accessory = true) {
  await page.locator("#info-model-select").selectOption(accessory?"__accessory__:0":"0");
  if(!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
  await page.locator('[data-effect-tab="materials"]').click();
  await page.locator("#shader-preset-select").selectOption(accessory?"wgsl-mmd-standard":"wgsl-light-and-shadow");
  await page.locator("#btn-shader-apply-all").click();
  await page.locator("#btn-toggle-shader-panel").click();
}

async function pair(page,testInfo,report,view,id,label,expected="ready") {
  await effect(page,id,false);
  const viewportPair=label==="gi-open"||label==="sky-standard"||label==="sky-light-shadow";
  if(viewportPair) await page.locator("#render-canvas").screenshot({path:testInfo.outputPath(`${label}-viewport-off.png`)});
  const off=await capture(page,testInfo,report,`${label}-off`);
  await effect(page,id,true,expected);
  if(viewportPair) await page.locator("#render-canvas").screenshot({path:testInfo.outputPath(`${label}-viewport-on.png`)});
  const on=await capture(page,testInfo,report,`${label}-on`);
  const result={ state:await read(page), difference:difference(off,on),
    regions:Object.fromEntries(Object.entries(regions).map(([name,points])=>[name,regionDelta(off,on,view,points)])) };
  report.cases[label]=result;
  await effect(page,id,false);
  if(label==="gi-open") {
    const restored=await capture(page,testInfo,report,`${label}-off-restored`);
    result.offRestoreDifference=difference(off,restored);
    expect(result.offRestoreDifference).toBeLessThan(.1);
  }
  return {off,on,result};
}

for (const variant of ["pmx","plain","opaque-png","opaque-jpg"]) {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires its fixture argument to be a destructured object.
  test(`RC window room: ${variant} material eligibility and indoor light`,async({},testInfo)=>{
    test.setTimeout(300000);
    const launched=await launchMmdModoki(root);
    const report={variant,errors:[],consoleErrors:[],captures:{},cases:{},
      scope:"Original identical 26-triangle room. GUI effect/preset/light changes. Fixed volume. Known unsupported cases are diagnosed, not claimed as support."};
    try {
      const page=await launched.app.firstWindow();
      page.on("pageerror",e=>report.errors.push(e.stack??e.message));
      page.on("console",m=>{if(m.type()==="error") report.consoleErrors.push(m.text());});
      const file=variant==="pmx"?"window-room.pmx":`window-room-${variant}.x`;
      const view=await setup(page,file); report.camera=view;
      const png=variant==="opaque-png";
      report.initial=await read(page);
      assertBounds(report.initial.meshes,[-6,0,-6],[6,6,6]);
      const materials=report.initial.materials;
      expect(materials.length).toBeGreaterThanOrEqual(2);
      expect(materials.every(m=>m.alpha===1 && m.alphaTesting===png && !m.alphaBlending)).toBe(true);
      expect(materials.every(m=>m.giReceiver===!png && m.giSource===!png)).toBe(true);
      // Sky with a fixed volume can report ready with zero accepted receivers;
      // GI instead remains preparing. Neither label proves visible contribution.
      const giOpen=await pair(page,testInfo,report,view,gi,"gi-open",png?"preparing":"ready");
      if(png) {
        expect(giOpen.result.difference).toBeLessThan(.1);
        expect(giOpen.result.state.gi.view).toBe(false);
        expect(giOpen.result.state.gi.diagnostics.supportedMaterialCount).toBe(0);
      }
      else {
        expect(giOpen.result.state.gi.diagnostics.triangleCount).toBe(26);
        expect(giOpen.result.regions.bounceWall.rgb[0]).toBeGreaterThan(1);
      }
      await lightDirection(page,[0,0,-1]);
      const skyDefault=await pair(page,testInfo,report,view,sky,"sky-default");
      if(variant!=="pmx") {
        expect(materials.every(m=>!m.skyReceiver)).toBe(true);
        expect(skyDefault.result.difference).toBeLessThan(.1);
      } else {
        // This minimal PMX deliberately has no toon texture. Sky subtracts only
        // toon shadow residual; an eligible material alone cannot supply it.
        expect(materials.every(m=>!m.toonTexture)).toBe(true);
        expect(skyDefault.result.difference).toBeLessThan(.1);
      }
      await applyStandard(page,variant!=="pmx");
      const skyOpen=await pair(page,testInfo,report,view,sky,variant==="pmx"?"sky-light-shadow":"sky-standard");
      if(png) {
        expect(skyOpen.result.state.materials.every(m=>!m.skyReceiver && !m.giReceiver)).toBe(true);
        expect(skyOpen.result.state.sky.diagnostics.triangleCount).toBe(0);
        expect(skyOpen.result.difference).toBeLessThan(.1);
      } else {
        expect(skyOpen.result.state.materials.every(m=>m.skyReceiver)).toBe(true);
        expect(skyOpen.result.state.sky.diagnostics.triangleCount).toBe(26);
        expect(skyOpen.result.regions.deepFloor.rgb[0]).toBeLessThan(-1);
      }

      // Full geometric open/closed/reopened audit for PMX and untextured .x.
      if(variant==="pmx"||variant==="plain") {
        await lightDirection(page,[0,-1,-1]);
        const comparableGiOpen=await pair(page,testInfo,report,view,gi,"gi-shaded-open");
        await lightDirection(page,[0,0,-1]);
        expect(await page.evaluate(path=>window.mmdModokiE2e.loadAccessory(path),fixture("window-shutter.x"))).toBe(true);
        const shutterIndex=variant==="pmx"?0:1;
        await matchXScale(page,shutterIndex);
        const shutterMeshes=(await read(page)).meshes.filter(m=>m.name.includes("Shutter"));
        expect(shutterMeshes).toHaveLength(1);
        assertBounds(shutterMeshes,[-2,1.2,6],[2,4.8,6]);
        const skyClosed=await pair(page,testInfo,report,view,sky,"sky-closed");
        expect(skyClosed.result.state.sky.diagnostics.triangleCount).toBe(28);
        report.skyOpeningChange=regionDelta(skyClosed.on,skyOpen.on,view,regions.nearFloor);
        for(const value of report.skyOpeningChange.rgb) expect(value).toBeGreaterThan(1);
        await lightDirection(page,[0,-1,-1]);
        const giClosed=await pair(page,testInfo,report,view,gi,"gi-closed");
        expect(giClosed.result.state.gi.diagnostics.triangleCount).toBe(28);
        report.giOpeningChange={ open:comparableGiOpen.result.regions.bounceWall, closed:giClosed.result.regions.bounceWall };
        for(let c=0;c<3;c++) expect(report.giOpeningChange.closed.rgb[c]).toBeLessThan(report.giOpeningChange.open.rgb[c]*.5);
        report.giOpeningChange.remainingFraction=report.giOpeningChange.closed.rgb.map((value,c)=>value/report.giOpeningChange.open.rgb[c]);
        await page.locator("#info-model-select").selectOption(`__accessory__:${shutterIndex}`);
        page.once("dialog",dialog=>dialog.accept());
        await page.locator("#btn-accessory-delete").click();
        await expect(page.locator(`#info-model-select option[value="__accessory__:${shutterIndex}"]`)).toHaveCount(0);
        const giReopened=await pair(page,testInfo,report,view,gi,"gi-reopened");
        expect(giReopened.result.state.gi.diagnostics.triangleCount).toBe(26);
        report.giReopenDifference=difference(comparableGiOpen.on,giReopened.on);
        expect(report.giReopenDifference).toBeLessThan(.15);
        await lightDirection(page,[0,0,-1]);
        const skyReopened=await pair(page,testInfo,report,view,sky,"sky-reopened");
        expect(skyReopened.result.state.sky.diagnostics.triangleCount).toBe(26);
        report.skyReopenDifference=difference(skyOpen.on,skyReopened.on);
        expect(report.skyReopenDifference).toBeLessThan(.15);
      }
      report.validation=await page.evaluate(()=>window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
    } finally {
      mkdirSync(testInfo.outputDir,{recursive:true}); writeFileSync(testInfo.outputPath("report.json"),JSON.stringify(report,null,2));
      await launched.close();
    }
  });
}
