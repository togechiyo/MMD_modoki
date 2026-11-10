/** Prepare hidden legacy lighting settings through project import, not a GUI control. */
export async function setRcLightingFixtureSettings(page, id, patch) {
  await page.evaluate(async ({ id, patch }) => {
    const state = window.mmdModokiE2e.exportProjectState();
    state.lighting[id] = { ...state.lighting[id], ...patch };
    await window.mmdModokiE2e.importProjectState(state);
  }, { id, patch });
}

/** Restore a saved retired card as fixture setup; this does not exercise GUI addition. */
export async function restoreRetiredRcLightingFixture(page, id, patch = {}) {
  if (id !== "rcSkyOcclusion") throw new Error(`Not a retired RC fixture: ${id}`);
  const selection = await page.locator("#info-model-select").inputValue();
  await page.evaluate(async ({ id, patch }) => {
    const state = window.mmdModokiE2e.exportProjectState();
    state.lighting[id] = { ...state.lighting[id], ...patch };
    state.effects.rcSceneEffectsInStack = true;
    const stack = state.effects.frameGraphPostStack ??= [];
    const entry = stack.find(entry => entry.id === id);
    if (entry) entry.enabled = state.lighting[id].enabled;
    else stack.push({ id, enabled: state.lighting[id].enabled });
    const order = state.effects.frameGraphInstances?.order;
    if (order && !order.includes(id)) order.push(id);
    await window.mmdModokiE2e.importProjectState(state);
  }, { id, patch });
  // The test import hook restores runtime state; reselect through the GUI to
  // synchronize the editor layout after any fixture models were reloaded.
  // Empty-scene fixtures have no selection to restore and disable the selector.
  const target = page.locator("#info-model-select");
  if (await target.isEnabled()) await target.selectOption(selection);
}
