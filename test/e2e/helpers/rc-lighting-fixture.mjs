/** Prepare hidden legacy lighting settings through project import, not a GUI control. */
export async function setRcLightingFixtureSettings(page, id, patch) {
  await page.evaluate(async ({ id, patch }) => {
    const state = window.mmdModokiE2e.exportProjectState();
    state.lighting[id] = { ...state.lighting[id], ...patch };
    await window.mmdModokiE2e.importProjectState(state);
  }, { id, patch });
}
