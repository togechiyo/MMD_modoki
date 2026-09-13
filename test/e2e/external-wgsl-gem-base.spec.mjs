import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { editWgslParameter, wgslFixtureEditor } from "./external-wgsl-fixture-editor.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const gems = ["moonstone-schiller", "white-opal", "black-opal", "prismatic-fire", "aurora-opal"];
test.setTimeout(120000);

// Only recolour the two known material records in our generated, redistributable fixture.
function tintedFixture(testInfo, name, rgb) {
    const data = readFileSync(resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
    const original = Buffer.alloc(16); [0.8, 0.65, 0.5, 1].forEach((v, i) => original.writeFloatLE(v, i * 4));
    const offsets = [];
    for (let offset = data.indexOf(original); offset !== -1; offset = data.indexOf(original, offset + 16)) offsets.push(offset);
    expect(offsets).toHaveLength(2);
    for (const offset of offsets) rgb.forEach((v, i) => data.writeFloatLE(v, offset + i * 4));
    const path = testInfo.outputPath(name + ".pmx"); writeFileSync(path, data); return path;
}

async function difference(app, first, second) {
    return app.evaluate(({ nativeImage }, paths) => {
        const a = nativeImage.createFromPath(paths[0]).toBitmap(); const b = nativeImage.createFromPath(paths[1]).toBitmap();
        if (!a.length || a.length !== b.length) throw new Error("Invalid captures");
        let count = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.max(...[0, 1, 2].map(c => Math.abs(a[i + c] - b[i + c]))) > 8) count++;
        return count;
    }, [first, second]);
}

for (const mode of ["mmd", "pbr"]) test(`gem coatings retain the model colour and zero strength is identity (${mode})`, async ({}, testInfo) => {
    const app = await launchMmdModoki(root);
    try {
        const page = await app.app.firstWindow();
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const red = tintedFixture(testInfo, "red", [0.55, 0.055, 0.025]);
        const blue = tintedFixture(testInfo, "blue", [0.025, 0.085, 0.55]);
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), red);
        await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0.4, y: 2, z: -7 }, { x: 0, y: 1.5, z: 0 }));
        await page.locator('[data-i18n="menu.tools"]').click();
        await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        const dialog = page.locator('[data-popup-id="experimental-settings"]');
        if (mode === "pbr") {
            const pbr = dialog.getByLabel("PBRモード", { exact: true });
            await pbr.check(); await expect(pbr).toBeEnabled();
        }
        const permission = dialog.getByLabel("外部WGSL材質を有効にする", { exact: true });
        await permission.check(); await expect(permission).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        const initial = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        const editor = wgslFixtureEditor(app.app, page, testInfo, root);
        const capture = async name => {
            const folder = testInfo.outputPath(name); mkdirSync(folder, { recursive: true });
            return (await page.evaluate(folder => window.mmdModokiE2e.captureSinglePngSurfaceToPath(folder, 640, 360), folder)).path;
        };
        const pictures = {};
        for (const [colour, path] of [["red", red], ["blue", blue]]) {
            const project = structuredClone(initial); project.scene.models[0].path = path;
            await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), project);
            pictures[colour] = { original: await capture(colour + "-original") };
            for (const gem of gems) {
                await editor.load(gem);
                pictures[colour][gem] = await capture(colour + "-" + gem);
                const file = testInfo.outputPath("shaders", gem + ".wgsl");
                editWgslParameter(file, "Coating", 0);
                await editor.importFile(file); await editor.apply();
                expect(await difference(app.app, pictures[colour].original, await capture(colour + "-" + gem + "-zero"))).toBeLessThan(100);
            }
        }
        const baseDifference = await difference(app.app, pictures.red.original, pictures.blue.original);
        expect(baseDifference).toBeGreaterThan(5000);
        for (const gem of gems) {
            // Old fixed body colours erased this difference at full coating strength.
            expect(await difference(app.app, pictures.red[gem], pictures.blue[gem])).toBeGreaterThan(baseDifference * 0.75);
        }
        expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).messages).toEqual([]);
        expect(errors).toEqual([]);
    } finally { await app.close(); }
});
