import { expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { closeRcLighting, openRcLighting, rcLightingRow } from "./rc-lighting-controls.mjs";

export const giVolume = { min: [-8, -2, -8], size: 16 };
export const giSection = page => rcLightingRow(page, "rcDiffuseGi");
export const giInput = (page, field) => giSection(page).locator(`[name="rcDiffuseGi${field}"]`);
export const giStatus = page => giSection(page).locator('[data-rc-diffuse-gi-status]');
export const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
export const giSettings = async page => (await project(page)).lighting.rcDiffuseGi;
export const giKeys = async page => (await project(page)).keyframes?.effectAnimations?.tracks.find(track => track.effectId === "rcDiffuseGi");
export async function openGi(page) {
  await openRcLighting(page, "rcDiffuseGi");
}
export const closeGi = closeRcLighting;
export async function seek(page, frame) { await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter"); }
export async function numberControl(page, key, value) {
  const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
  await field.fill(String(value)); await field.press("Enter");
}
export async function camera(page, values = {}) {
  await page.locator("#info-model-select").selectOption("__camera__");
  for (const [key, value] of Object.entries({ tx: -0.5, ty: 1, tz: 0, rx: -25, ry: -20, rz: 0, camDistance: 16, ...values })) await numberControl(page, key, value);
  return page.evaluate(() => ({ ...window.mmdModokiE2e.exportProjectState().camera,
    position: window.mmdModokiE2e.getCameraPosition(), target: window.mmdModokiE2e.getCameraTarget() }));
}
export async function giSlider(page, value) {
  await giInput(page, "Strength").focus(); await giInput(page, "Strength").press("Home");
  for (let i = 0; i < value; i++) await giInput(page, "Strength").press("ArrowRight");
  await expect(giInput(page, "Strength")).toHaveValue(String(value));
}
export async function setGi(page, enabled) {
  await openGi(page); await giInput(page, "Enabled").setChecked(enabled);
  await expect(giStatus(page)).toHaveAttribute("data-state", enabled ? "ready" : "off", { timeout: 45000 }); await closeGi(page);
}
export async function initialState(page, { fixed = true } = {}) {
  await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
  await page.evaluate(async ({ volume, fixed }) => {
    const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
    Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
    // Explicit setup fixture state: no change to the application's shadow defaults.
    Object.assign(state.lighting, { x: -1, y: -1, z: 0, intensity: 0.6, ambientIntensity: 0, shadowEnabled: false,
      lightColor: { r: 1, g: 1, b: 1 }, rcDiffuseGi: { enabled: false, strength: 0.5, volume: fixed ? volume : null } });
    await window.mmdModokiE2e.importProjectState(state);
  }, { volume: giVolume, fixed });
}
export async function capture(page, testInfo, report, name) {
  const directory = testInfo.outputPath(name); mkdirSync(directory, { recursive: true });
  const result = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 640, 360), directory);
  report.captures[name] = result; expect(result.surfaceReleased).toBe(true);
  const image = PNG.sync.read(readFileSync(result.path)); expect([image.width, image.height]).toEqual([640, 360]);
  const validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
  report.validation = validation; expect(validation.count).toBe(0); expect(report.errors).toEqual([]);
  return image;
}
export function difference(a, b) {
  const left = a.data ?? a, right = b.data ?? b; expect(left.length).toBe(right.length);
  let sum = 0; for (let i = 0; i < left.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(left[i+c] - right[i+c]);
  return sum / (left.length * 0.75);
}
const dot = (a,b) => a.reduce((sum,value,i) => sum+value*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize = a => a.map(value => value/Math.hypot(...a));
export function projectPoints(view, points) {
  const eye = Object.values(view.position), target = Object.values(view.target);
  const forward = normalize(target.map((v,i)=>v-eye[i])), right = normalize(cross([0,1,0],forward)), up = cross(forward,right);
  const tangent = Math.tan(view.fov*Math.PI/360);
  return points.map(point => { const delta=point.map((v,i)=>v-eye[i]), depth=dot(delta,forward);
    return [320+dot(delta,right)/depth/tangent/(640/360)*320,180-dot(delta,up)/depth/tangent*180,depth]; });
}
export function receiverDifference(off, on, view) {
  const polygon = projectPoints(view, [[-1.5,0,-1.5],[1.5,0,-1.5],[1.5,0,1.5],[-1.5,0,1.5]]);
  const inside = (x,y) => { let positive=false,negative=false;
    for(let i=0;i<4;i++){const a=polygon[i],b=polygon[(i+1)%4],side=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);positive ||= side>0;negative ||= side<0;}
    return !(positive&&negative);
  };
  const signed=[0,0,0], absolute=[0,0,0]; let pixels=0;
  for(let y=0;y<360;y++)for(let x=0;x<640;x++)if(inside(x+.5,y+.5)) {
    const i=(y*640+x)*4; if(off.data[i+3]<250)continue; pixels++;
    for(let c=0;c<3;c++){const d=on.data[i+c]-off.data[i+c];signed[c]+=d;absolute[c]+=Math.abs(d);}
  }
  expect(pixels).toBeGreaterThan(100);
  const mean=signed.map(v=>v/pixels);
  return { polygon,pixels,rgbSigned:mean,rgbAbsolute:absolute.map(v=>v/pixels),redExcess:mean[0]-(mean[1]+mean[2])/2 };
}
