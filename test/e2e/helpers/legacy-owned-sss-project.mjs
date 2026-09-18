// Hidden normal-mode SSS is exercised through saved-project compatibility,
// never by putting retired options back into the live selector.
export async function restoreLegacyOwnedSss(page, presetId, materialNames = null) {
    const keys = await page.locator(".shader-material-item").evaluateAll((items, names) => items
        .filter(item => !names || names.includes(item.querySelector(".shader-material-name").textContent))
        .map(item => item.title), materialNames);
    if (!keys.length) throw new Error("No fixture materials selected for legacy SSS");
    const result = await page.evaluate(async ({ keys, presetId }) => {
        const project = window.mmdModokiE2e.exportProjectState();
        const model = project.scene.models[0];
        const shaders = new Map((model.materialShaders ?? []).map(item => [item.materialKey, item]));
        for (const materialKey of keys) shaders.set(materialKey, { materialKey, presetId });
        model.materialShaders = [...shaders.values()];
        model.materialSettingsByMode = { ...model.materialSettingsByMode,
            "mmd-standard": { materials: model.materialShaders } };
        const imported = await window.mmdModokiE2e.importProjectState(project);
        const restored = window.mmdModokiE2e.exportProjectState().scene.models[0].materialShaders ?? [];
        if (!keys.every(key => restored.some(item => item.materialKey === key && item.presetId === presetId))) {
            throw new Error("Legacy SSS assignments did not survive project import");
        }
        return imported;
    }, { keys, presetId });
    if (result.warnings.length) throw new Error(`Legacy SSS import warnings: ${JSON.stringify(result.warnings)}`);
    await page.locator("#info-model-select").selectOption("0");
    await page.locator('[data-effect-tab="materials"]').click();
}
