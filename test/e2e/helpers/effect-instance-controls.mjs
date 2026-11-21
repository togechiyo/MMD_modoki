import { selectTimelineTrack } from "../electron-app.mjs";

export function effectStackRow(page, type) {
  return page.locator(type === "ringParticles"
    ? '[data-effect-stack-row="ringParticles"]'
    : `[data-effect-instance-type="${type}"]`);
}

export function effectStackToggle(page, type) {
  return effectStackRow(page, type).locator(type === "ringParticles"
    ? '[data-effect-stack-toggle="ringParticles"]'
    : '[data-instance-field="enabled"]');
}

export function effectInstanceRuntimeState() {
  const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
  const effects = window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances;
  const controller = window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects.controller;
  const types = new Map(controller?.instances.map(instance => [instance.instanceId, instance.type]) ?? []);
  const instanceTypes = new Set(types.values());
  return {
    backend: state.backend,
    ready: state.ready,
    hasExecuted: state.executedFrameCount >= 2,
    stack: (effects?.order ?? []).map(id => types.get(id) ?? id).join(","),
    // The graph also connects built-in passes that are absent from the authored stack.
    connectedInstanceOrder: controller?.connectedOrder.filter(type => instanceTypes.has(type)),
  };
}

export async function expandEffectInstance(row) {
  const header = row.locator('[data-instance-action="select"]');
  if (await header.getAttribute("aria-expanded") !== "true") await header.click();
}

export async function selectEffectInstance(row) {
  await expandEffectInstance(row);
  const page = row.page(), id = await row.getAttribute("data-effect-instance-row");
  if (!id) throw new Error("Effect instance ID is missing");
  await page.locator("#info-model-select").selectOption("__camera__");
  await selectTimelineTrack(page, "effect", id);
}

export async function registerEffectInstance(row) {
  await row.locator('[data-instance-action="registerKeyframe"]').click();
}

export async function dragEffectStackRow(source, target, placement) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Effect drop target is not visible");
  await source.locator('[data-effect-stack-drag]').dragTo(target, {
    targetPosition: { x: Math.min(40, box.width / 2), y: placement === "before" ? 2 : box.height - 2 },
  });
}
