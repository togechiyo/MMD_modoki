import { test, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { writeFile } from "node:fs/promises";
import { createTofuModel, writePmx } from "../../scripts/generate-external-parent-test-models.mjs";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const pbr of [false, true]) test(`CPU vertex morph geometry through registration and groups (PBR=${pbr})`, async ({}, testInfo) => {
    test.setTimeout(180000);
    const launched = await launchMmdModoki(root);
    try {
        const model = createTofuModel();
        model.vertexMorphs = Array.from({ length: 8 }, (_, index) => ({
            name: `Vertex ${index + 1}`,
            offsets: model.vertices.map((_, vertex) => ({ index: vertex, offset: [0.01 * (index + 1), index % 2 ? -0.025 : 0.025, 0] })),
        }));
        model.groupMorphs = [{ name: "Group", elements: [{ index: 0, ratio: 0.5 }, { index: 1, ratio: 1 }] }];
        const path = join(launched.tempDir, "multiple-vertex-morph.pmx");
        await writeFile(path, writePmx(model));
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path);
        if (pbr) {
            await page.locator('[data-i18n="menu.window"]').click();
            await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
            const dialog = page.locator('[data-popup-id="experimental-settings"]');
            const toggle = dialog.getByLabel("PBRモード", { exact: true });
            await toggle.check();
            await expect(toggle).toBeEnabled();
            await dialog.locator(".app-menu-dialog-close").click();
        }
        const geometry = () => page.evaluate(() => window.mmdModokiE2e.getMorphGeometryForE2e());
        const sliderFor = name => page.locator("#morph-controls .morph-slider-row")
            .filter({ has: page.getByRole("button", { name: `${name} keyframe`, exact: true }) }).locator('input[type="range"]');
        const seek = async frame => {
            const input = page.locator("#current-frame");
            await input.fill(String(frame)); await input.press("Enter");
        };
        const check = async (weights, group = 0) => {
            const effective = weights.map((weight, i) => weight + (i === 0 ? group * 0.5 : i === 1 ? group : 0));
            await expect.poll(async () => (await geometry()).map(mesh => mesh.targets.map(target => target.weight)))
                .toEqual((await geometry()).map(mesh => mesh.targets.map(target => expect.closeTo(effective[Number(target.name.split(" ")[1]) - 1], 5))));
            const meshes = await geometry();
            expect(meshes.length).toBeGreaterThan(0);
            for (const mesh of meshes) {
                expect(mesh.gpuSkinning).toBe(true);
                for (let i = 0; i < mesh.base.length; i++) {
                    const delta = model.vertexMorphs.reduce((sum, morph, j) => sum + morph.offsets[0].offset[i % 3] * effective[j], 0);
                    expect(mesh.morphed[i]).toBeCloseTo(mesh.base[i] + delta, 4);
                }
            }
        };
        const weights = Array(8).fill(0);
        await check(weights);
        for (let index = 0; index < 8; index++) {
            const name = `Vertex ${index + 1}`;
            const slider = sliderFor(name);
            await slider.fill("0.7"); await slider.dispatchEvent("input");
            weights[index] = 0.7;
            await check(weights);
            if (index === 1) {
                // CPU positions alone do not prove that the GPU shader can handle this preview.
                await testInfo.attach("second-preview-capacity", { body: JSON.stringify((await geometry()).map(mesh => ({
                    name: mesh.name, active: mesh.numInfluencers, capacity: mesh.numMaxInfluencers,
                }))), contentType: "application/json" });
                await page.screenshot({ path: testInfo.outputPath("second-unregistered-preview.png") });
            }
            await page.getByRole("button", { name: `${name} keyframe`, exact: true }).click();
            await check(weights);
        }
        const groupSlider = sliderFor("Group");
        await groupSlider.fill("0.8"); await groupSlider.dispatchEvent("input");
        await check(weights, 0.8);
        await page.locator("#btn-morph-keyframe").click();
        await check(weights, 0.8);
        await page.screenshot({ path: testInfo.outputPath("eight-vertex-morphs.png") });
        await seek(30);
        const laterWeights = weights.map((_, i) => (10 + 5 * i) / 100);
        for (let index = 0; index < 8; index++) {
            const slider = sliderFor(`Vertex ${index + 1}`);
            await slider.fill(String(laterWeights[index])); await slider.dispatchEvent("input");
        }
        await groupSlider.fill("0.4"); await groupSlider.dispatchEvent("input");
        await page.locator("#btn-morph-keyframe").click();
        await check(laterWeights, 0.4);
        const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        for (const frame of [15, 0, 30, 0]) {
            await seek(frame);
            await check(weights.map((weight, i) => weight + (laterWeights[i] - weight) * frame / 30), 0.8 - 0.4 * frame / 30);
        }
        await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
        // The raw import hook restores data; the normal UI load also seeks afterwards.
        await page.evaluate(() => window.mmdModokiE2e.seekTo(0));
        await check(weights, 0.8);
        for (let index = 0; index < 8; index++) {
            const slider = sliderFor(`Vertex ${index + 1}`);
            await slider.fill("0"); await slider.dispatchEvent("input");
        }
        await groupSlider.fill("0"); await groupSlider.dispatchEvent("input");
        await check(Array(8).fill(0));
        await page.locator("#btn-morph-keyframe").click();
        await check(Array(8).fill(0));
        await page.keyboard.press("Control+z");
        await check(weights, 0.8);
        await page.keyboard.press("Control+y");
        await check(Array(8).fill(0));
        await page.screenshot({ path: testInfo.outputPath("morphs-reset.png") });
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    } finally { await launched.close(); }
});
