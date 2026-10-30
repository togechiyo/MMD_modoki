import { MmdManager } from "/src/mmd-manager.ts";
import { WebGPUPerfCounter } from "@babylonjs/core/Engines/WebGPU/webgpuPerfCounter";

let manager = null;
const getter = MmdManager.prototype.getRcDiffuseGiSettings;
MmdManager.prototype.getRcDiffuseGiSettings = function (...args) { manager = this; return getter.apply(this, args); };
const summarize = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  return { count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],min:sorted[0],max:sorted.at(-1) };
};
function context() {
  if (!manager) throw new Error("Open GI settings after importing the performance probe");
  return { manager,scene:manager.scene,engine:manager.engine,controller:manager.rcDiffuseGiController };
}
export function giPerformanceState() {
  const {scene,engine,controller}=context();
  return {size:[engine.getRenderWidth(),engine.getRenderHeight()],sceneFrameId:scene.getFrameId(),diagnostics:controller?.diagnostics??null,
    deviceTimestampQuery:engine._device.features.has("timestamp-query"),gpuTimingEnabled:engine.enableGPUTimingMeasurements,
    adapterInfo:engine._adapter?.info?{vendor:engine._adapter.info.vendor,architecture:engine._adapter.info.architecture,device:engine._adapter.info.device,description:engine._adapter.info.description}:null};
}
export async function prepareGiPerformance({width,height}) {
  const {engine}=context(); manager.setAutoRenderEnabled(false); engine.setSize(width,height);manager.setRenderFpsLimit(0);
  await manager.waitForPostEffectBackendReadyForCapture();engine.beginFrame();manager.renderOnceForCapture(0);engine.endFrame();
  await engine._device.queue.onSubmittedWorkDone();manager.setAutoRenderEnabled(true);return giPerformanceState();
}
export async function measureGiPerformance({moving=false,warmFrames=12,frames=40,completionFrames=12}={}) {
  const {scene,engine,controller}=context(),field=controller?.field,restores=[],loops=engine.activeRenderLoops.slice(),wasAuto=manager.isAutoRenderEnabled();
  let rows=[],byFrame=new Map(),current=null,phase=null,observed=0,motionStep=0,previousStart=null,pendingSeekMs=0,resolveWindow,measurement;
  const gpuNames=new Map();
  if(engine._device.features.has("timestamp-query"))engine.enableGPUTimingMeasurements=true;
  for(const task of field?.graph.tasks??[]) {
    if(!task.computeShader)continue;
    const counter=new WebGPUPerfCounter();task.computeShader.gpuTimeInFrame=counter;gpuNames.set(counter,task.name);
    // Babylon 9.2 caches timestampWrites in a module-global compute descriptor.
    // Keep counters and the diagnostic QuerySet alive until this engine closes.
    const dispatch=task.computeShader.dispatch;
    task.computeShader.dispatch=function(...args){if(current&&args.every(value=>typeof value!=="number"||value>0))current.computeDispatches++;return dispatch.apply(this,args);};
    restores.push(()=>{task.computeShader.dispatch=dispatch;});
  }
  const query=engine._timestampQuery,endPass=query.endPass;
  query.endPass=function(index,counter){const row=byFrame.get(engine.frameId),name=gpuNames.get(counter)??"render";
    if(!row||!engine.enableGPUTimingMeasurements)return endPass.call(this,index,counter);
    row.expectedGpuPasses++;
    return endPass.call(this,index,{_addDuration(frame,duration){row.receivedGpuPasses++;if(duration>0)row.gpuPassMs[name]=(row.gpuPassMs[name]??0)+duration/1e6;counter?._addDuration(frame,duration);}});
  };
  restores.push(()=>{query.endPass=endPass;});
  const timed=(object,key,metric,count)=>{if(!object)return;const original=object[key];object[key]=function(...args){const start=performance.now(),row=current;
    try{return original.apply(this,args);}finally{if(row){row[metric]+=performance.now()-start;row[count]++;}}};restores.push(()=>{object[key]=original;});};
  timed(controller,"prepareFrame","controllerCpuMs","controllerCalls");timed(field?.source,"update","sourceCpuMs","sourceCalls");timed(field,"execute","fieldSubmitCpuMs","fieldUpdates");
  const before=scene.onBeforeRenderObservable.add(()=>{
    current=null;if(!phase||observed>=warmFrames+phase.frames)return;
    const start=performance.now();if(observed++>=warmFrames){current={engineFrameId:engine.frameId,sceneFrameId:scene.getFrameId(),start,intervalMs:previousStart===null?null:start-previousStart,
      seekCpuMs:pendingSeekMs,controllerCpuMs:0,controllerCalls:0,sourceCpuMs:0,sourceCalls:0,fieldSubmitCpuMs:0,fieldUpdates:0,computeDispatches:0,gpuPassMs:{},expectedGpuPasses:0,receivedGpuPasses:0};rows.push(current);byFrame.set(engine.frameId,current);}previousStart=start;
  });
  const after=scene.onAfterRenderObservable.add(()=>{if(current)current.sceneCpuMs=performance.now()-current.start;});
  const begin=engine.onBeginFrameObservable.add(()=>{pendingSeekMs=0;if(phase&&moving){const cycle=(motionStep++*3)%120,start=performance.now();manager.seekTo(cycle<=60?cycle:120-cycle);pendingSeekMs=performance.now()-start;}});
  const end=engine.onEndFrameObservable.add(()=>{if(current)current.renderSubmitCpuMs=performance.now()-current.start;if(phase&&rows.length===phase.frames)resolveWindow?.();});
  restores.push(()=>{scene.onBeforeRenderObservable.remove(before);scene.onAfterRenderObservable.remove(after);engine.onBeginFrameObservable.remove(begin);engine.onEndFrameObservable.remove(end);});
  const reset=count=>{rows=[];byFrame=new Map();current=null;observed=0;motionStep=0;previousStart=null;phase={frames:count};};
  const result=()=>{
    const complete=rows.filter(row=>row.expectedGpuPasses>0&&row.receivedGpuPasses===row.expectedGpuPasses&&Object.keys(row.gpuPassMs).length);
    return {frames:rows.length,warmFrames,state:giPerformanceState(),metrics:Object.fromEntries(["intervalMs","seekCpuMs","sceneCpuMs","renderSubmitCpuMs","controllerCpuMs","sourceCpuMs","fieldSubmitCpuMs","completionWallMs"].map(key=>[key,summarize(rows.flatMap(row=>Number.isFinite(row[key])?[row[key]]:[]))])),
      counts:Object.fromEntries(["controllerCalls","sourceCalls","fieldUpdates","computeDispatches"].map(key=>[key,rows.reduce((sum,row)=>sum+row[key],0)])),
      gpu:{available:engine.enableGPUTimingMeasurements,completeFrames:complete.length,passSumMs:summarize(complete.map(row=>Object.values(row.gpuPassMs).reduce((a,b)=>a+b,0))),
        renderPassMs:summarize(complete.map(row=>row.gpuPassMs.render??0)),computePassMs:summarize(complete.map(row=>Object.entries(row.gpuPassMs).reduce((sum,[key,value])=>sum+(key==="render"?0:value),0)))},
      samples:rows.map(({start,...row})=>row),validation:window.mmdModokiE2e.getWebGpuValidationDiagnostics()};
  };
  try {
    reset(frames);manager.setAutoRenderEnabled(true);
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`GI performance stalled at ${rows.length}/${frames}`)),60000);resolveWindow=()=>{clearTimeout(timeout);resolve();};});
    phase=null;current=null;resolveWindow=null;await engine._device.queue.onSubmittedWorkDone();
    for(let i=0;i<4;i++)await new Promise(resolve=>requestAnimationFrame(resolve));const realtime=result();
    manager.setAutoRenderEnabled(false);engine.stopRenderLoop();engine.flushFramebuffer();await engine._device.queue.onSubmittedWorkDone();
    reset(completionFrames);
    for(let i=0;i<warmFrames+completionFrames;i++){const start=performance.now();engine.beginFrame();manager.renderOnceForCapture(0);engine.endFrame();await engine._device.queue.onSubmittedWorkDone();if(current)current.completionWallMs=performance.now()-start;}
    phase=null;current=null;for(let i=0;i<4;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
    measurement={realtime,completion:result(),validationAfterCleanup:null,timestampLifetime:"Diagnostic counters and timing survive through reference PNG until engine disposal"};return measurement;
  } finally {
    phase=null;current=null;manager.setAutoRenderEnabled(false);engine.stopRenderLoop();for(const restore of restores.reverse())restore();
    await engine._device.queue.onSubmittedWorkDone();await new Promise(resolve=>requestAnimationFrame(resolve));
    if(measurement)measurement.validationAfterCleanup=window.mmdModokiE2e.getWebGpuValidationDiagnostics();
    manager.setAutoRenderEnabled(wasAuto);for(const loop of loops)if(!engine.activeRenderLoops.includes(loop))engine.runRenderLoop(loop);
  }
}
export function disposeGiPerformanceProbe(){MmdManager.prototype.getRcDiffuseGiSettings=getter;manager=null;}
