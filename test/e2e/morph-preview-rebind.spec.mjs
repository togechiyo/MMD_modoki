import { test, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { writeFile } from "node:fs/promises";
import { createTofuModel, writePmx } from "../../scripts/generate-external-parent-test-models.mjs";
import { launchMmdModoki } from "./electron-app.mjs";

test("unregistered group/UV preview after motion load, project restore and runtime switch", async () => {
    test.setTimeout(180000);
    const launched = await launchMmdModoki(resolve(import.meta.dirname, "../.."));
    try {
        const model = createTofuModel();
        model.vertexMorphs = Array.from({ length: 12 }, (_, i) => `Vertex ${i + 1}`).map(name => ({
            name, offsets: [{ index: 0, offset: [0.05, 0, 0] }],
        }));
        model.uvMorphs = [{ name: "UV Test", offsets: [{ index: 0, offset: [0.1, 0.1, 0, 0] }] }];
        model.groupMorphs = [{ name: "Group", elements: Array.from({ length: 12 }, (_, i) => ({ index: i + 1, ratio: 1 })) }];
        const modelPath = join(launched.tempDir, "preview-rebind.pmx");
        await writeFile(modelPath, writePmx(model));
        // Original minimal VMD: one vertex morph key at frame 0, no other tracks.
        const motion = Buffer.alloc(97);
        motion.write("Vocaloid Motion Data 0002", 0, "ascii");
        motion.write("Preview probe", 30, "ascii");
        motion.writeUInt32LE(1, 54);
        motion.write("Vertex 1", 58, "ascii");
        motion.writeFloatLE(1, 77);
        const motionPath = join(launched.tempDir, "preview-rebind.vmd");
        await writeFile(motionPath, motion);
        const page = await launched.app.firstWindow();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
        await launched.app.evaluate(({ dialog }, filePath) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, motionPath);
        await page.locator('[data-i18n="menu.file"]').click();
        await page.locator('[data-menu-command="file.openMotion"]').click();
        await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models[0].motionImports.length)).toBe(1);
        const geometry = () => page.evaluate(() => window.mmdModokiE2e.getMorphGeometryForE2e());
        const set = async (name, value) => {
            const slider = page.locator("#morph-controls .morph-slider-row")
                .filter({ has: page.getByRole("button", { name: `${name} keyframe`, exact: true }) }).locator('input[type="range"]');
            await slider.fill(String(value)); await slider.dispatchEvent("input");
        };
        const checkPreview = async () => {
            await set("Group", 0.6);
            await expect.poll(async () => (await geometry())[0].numInfluencers).toBe(13);
            await expect.poll(async () => (await geometry())[0].numMaxInfluencers).toBe(17);
            await set("Group", 0);
            await set("UV Test", 0.4);
            await expect.poll(async () => (await geometry())[0].numInfluencers).toBe(2);
            expect((await geometry())[0].numMaxInfluencers).toBe(17); // no shrinking during editing
            expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
            await set("UV Test", 0);
        };
        await expect.poll(async () => (await geometry())[0].numMaxInfluencers).toBe(8);
        const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        await checkPreview();
        await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), project);
        await page.evaluate(() => window.mmdModokiE2e.seekTo(0));
        await expect.poll(async () => (await geometry())[0].numMaxInfluencers).toBe(8);
        await checkPreview();
        for (const mode of ["wasm", "classic"]) {
            await page.locator('[data-i18n="menu.physics"]').click();
            await page.locator('[data-menu-command="physics.settings"]').click();
            const runtimeSelect = page.locator('[data-popup-id="physics-settings"] select')
                .filter({ has: page.locator('option[value="wasm"]') });
            await Promise.all([
                page.waitForEvent("load"),
                runtimeSelect.selectOption(mode),
            ]);
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
            await expect(page.locator("#toolbar-runtime-mode-select")).toHaveValue(mode);
            await expect.poll(async () => (await geometry())[0]?.numMaxInfluencers).toBe(8);
            await checkPreview();
        }
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});
