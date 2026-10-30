import { expect } from "@playwright/test";

export const rcLightingRow = (page, id) => page.locator(`[data-effect-stack-row="${id}"]`);
export const rcLightingInput = (page, id, field) => rcLightingRow(page, id).locator(`[name="${id}${field}"]`);
export const rcLightingStatus = (page, id) => rcLightingRow(page, id).locator(id === "rcDiffuseGi" ? "[data-rc-diffuse-gi-status]" : "[data-rc-sky-occlusion-status]");
export async function openPostEffects(page) {
  if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
  await page.locator('[data-effect-tab="post"]').click();
}
export async function addRcLighting(page, id) {
  await openPostEffects(page);
  await page.locator("#btn-effect-add-post").click();
  await page.locator(`[data-effect-add-post="${id}"]`).click();
  await expect(rcLightingRow(page, id)).toHaveCount(1);
}
export async function openRcLighting(page, id) {
  await openPostEffects(page);
  if (!await rcLightingRow(page, id).count()) {
    const before = await page.evaluate(id => window.mmdModokiE2e.exportProjectState().lighting[id], id);
    await addRcLighting(page, id);
    const header = rcLightingRow(page, id).locator(`[data-effect-stack-item="${id}"]`);
    if (await header.getAttribute("aria-expanded") !== "true") await header.click();
    // Compatibility setup for rendering tests: opening a previously absent card
    // must preserve their imported OFF reference. Dedicated lifecycle tests call add directly.
    if (before?.enabled === false) await rcLightingInput(page, id, "Enabled").uncheck();
  }
  const header = rcLightingRow(page, id).locator(`[data-effect-stack-item="${id}"]`);
  if (await header.getAttribute("aria-expanded") !== "true") await header.click();
  const volume = rcLightingRow(page, id).locator(`[data-rc-volume-controls="${id}"]`);
  if (await volume.count() && await volume.getAttribute("open") === null) await volume.locator("summary").click();
  await expect(rcLightingInput(page, id, "Enabled")).toBeVisible();
}
export async function closeRcLighting(page) {
  if (await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
}
export async function setRcLightingEnabled(page, id, enabled) {
  await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(enabled);
  await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", enabled ? "ready" : "off", { timeout: 45000 });
  await closeRcLighting(page);
}
export async function registerRcLighting(page, id) {
  await rcLightingRow(page, id).locator(`[data-rc-register-key="${id}"]`).click();
}
