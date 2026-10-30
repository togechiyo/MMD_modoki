import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { camera, initialState, numberControl, seek, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";

const root=resolve(import.meta.dirname,"../.."),fixture=resolve(root,"test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx");
const output=process.env.MMD_RC_GI_PERF_OUTPUT?resolve(process.env.MMD_RC_GI_PERF_OUTPUT):null;
const invoke=(page,name,value)=>page.evaluate(async({name,value})=>(await import("/test/e2e/helpers/rc-diffuse-gi-performance-probe.mjs"))[name](value),{name,value});
const configurations=[{width:640,height:360,moving:false,enabled:false},...[640,1280].flatMap(width=>[false,true].map(moving=>({width,height:width*9/16,moving,enabled:true})))];
for(const configuration of configurations){const id=`${configuration.width}x${configuration.height}-${configuration.moving?"moving":"static"}-${configuration.enabled?"on":"off"}`;
  test(`RC diffuse GI performance: ${id}`,async({},testInfo)=>{
    test.setTimeout(180000);
    const launched=await launchMmdModoki(root),report={configuration,errors:[],consoleErrors:[],
      interpretation:"36-triangle original fixture. Independent warmed diagnostic device. GPU timestamps exclude queue gaps; completion/capture wall includes CPU and waits. No device FPS guarantee."};let page;
    try {
      page=await launched.app.firstWindow();
      await page.addInitScript(()=>{if(typeof GPUAdapter==="undefined")return;const request=GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice=function(descriptor={}){const features=new Set(descriptor.requiredFeatures??[]);if(this.features.has("timestamp-query"))features.add("timestamp-query");return request.call(this,{...descriptor,requiredFeatures:[...features]});};});
      await page.reload();page.on("pageerror",error=>report.errors.push(error.stack??error.message));page.on("console",message=>{if(message.type()==="error")report.consoleErrors.push(message.text());});
      await page.waitForFunction(()=>Boolean(window.mmdModokiE2e));await invoke(page,"giPerformanceState").catch(()=>null);
      await initialState(page);await page.evaluate(path=>window.mmdModokiE2e.loadModel(path),fixture);
      await page.locator("#info-model-select").selectOption("0");
      const category=await page.evaluate(()=>window.mmdModokiE2e.getTimelineTracks().find(track=>track.name==="光遮蔽板")?.category);expect(category).toBeTruthy();
      for(const [frame,x] of [[0,0],[60,-20]]){await seek(page,frame);await selectTimelineTrack(page,category,"光遮蔽板");await numberControl(page,"tx",x);await page.locator("#btn-bone-keyframe").click();}
      await camera(page);await seek(page,0);await setGi(page,configuration.enabled);
      report.prepared=await invoke(page,"prepareGiPerformance",configuration);expect(report.prepared.size).toEqual([configuration.width,configuration.height]);
      report.measurement=await invoke(page,"measureGiPerformance",{moving:configuration.moving,warmFrames:12,frames:40,completionFrames:12});
      for(const [name,count] of [["realtime",40],["completion",12]]){
        const result=report.measurement[name];expect(result.frames).toBe(count);expect(result.state.size).toEqual([configuration.width,configuration.height]);
        expect(result.counts.fieldUpdates).toBe(configuration.enabled&&configuration.moving?count:0);
        expect(result.validation.count).toBe(0);if(result.state.deviceTimestampQuery)expect(result.gpu.completeFrames).toBeGreaterThan(0);
      }
      expect(report.measurement.validationAfterCleanup.count).toBe(0);
      await seek(page,0);const directory=testInfo.outputPath("reference-png");mkdirSync(directory,{recursive:true});const start=performance.now();
      report.referencePng=await page.evaluate(({path,width,height})=>window.mmdModokiE2e.captureSinglePngSurfaceToPath(path,width,height),{path:directory,...configuration});
      report.captureWallMs=performance.now()-start;expect(report.referencePng.surfaceReleased).toBe(true);
      report.validation=await page.evaluate(()=>window.mmdModokiE2e.getWebGpuValidationDiagnostics());expect(report.validation.count).toBe(0);expect(report.errors).toEqual([]);
    } finally {
      if(page&&!page.isClosed())await invoke(page,"disposeGiPerformanceProbe").catch(()=>undefined);
      mkdirSync(testInfo.outputDir,{recursive:true});writeFileSync(testInfo.outputPath("report.json"),JSON.stringify(report,null,2));
      if(output){mkdirSync(output,{recursive:true});writeFileSync(resolve(output,`${id}.json`),JSON.stringify(report,null,2));}await launched.close();
    }
  });
}
