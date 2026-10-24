import { expandEffectInstance } from "./effect-instance-controls.mjs";

export const luminousInstanceRow = page => page.locator("[data-effect-instance-row]").filter({ has: page.locator('[data-instance-field="threshold"]') }).filter({ has: page.locator('[data-instance-field="radius"]') }).first();
export function luminousInstanceControl(page, key) {
  const row = luminousInstanceRow(page);
  if (key === "luminousRadianceEnabled") return row.locator('[data-instance-fixed-toggle="radiance"]');
  if (key === "luminousRadianceStrength") return row.locator('[data-instance-fixed="radianceStrength"]');
  if (key === "luminousRadianceRange") return row.locator('[data-instance-fixed="radianceRange"]');
  const field = { luminousIntensity: "intensity", luminousThreshold: "threshold", luminousRadius: "radius" }[key];
  if (!field) throw new Error(`Unsupported Luminous control: ${key}`);
  return row.locator(`[data-instance-field="${field}"]`);
}
export async function setLuminousInstancePosition(page, key, position) {
  await expandEffectInstance(luminousInstanceRow(page));
  const control = luminousInstanceControl(page, key);
  await control.fill(String(position)); await control.dispatchEvent("input"); await control.dispatchEvent("change");
}
export const getLuminousInstanceRuntime = page => page.evaluate(() => {
  const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
  const diagnostics = window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects;
  return { ...state, luminousRadiance: diagnostics.controller?.instances.find(item => item.type === "luminous")?.radiance ?? null };
});
