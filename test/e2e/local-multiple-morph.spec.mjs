import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const model = process.env.MMD_MORPH_LOCAL_MODEL;
const pbr = process.env.MMD_MORPH_PBR === "1";
const cpuFallback = process.env.MMD_MORPH_CPU_FALLBACK === "1";
const wasm = process.env.MMD_MORPH_WASM === "1";
const skin = process.env.MMD_MORPH_SKIN === "1";
test("local authorized model: two vertex morph visual audit", async () => {
    test.skip(!model || !existsSync(model), "Set MMD_MORPH_LOCAL_MODEL to an explicitly authorized local model");
    test.setTimeout(180000);
    const output = resolve(root, "local-references/multiple-morph-audit-2026-09-17", [pbr ? "pbr" : "mmd", cpuFallback && "cpu-fallback", wasm && "wasm", skin && "skin", "register-first"].filter(Boolean).join("-"));
    mkdirSync(output, { recursive: true });
    const launched = await launchMmdModoki(root);
    const report = { requested: { pbr, cpuFallback, wasm, skin }, states: {}, errors: [] };
    try {
        const page = await launched.app.firstWindow();
        page.on("pageerror", error => report.errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        if (cpuFallback || wasm) {
            await page.evaluate(({ cpuFallback, wasm }) => {
                if (cpuFallback) localStorage.setItem("mmd_modoki.webGpuSdefCpuFallback", "true");
                if (wasm) localStorage.setItem("mmd_modoki.runtimeMode", "wasm");
            }, { cpuFallback, wasm });
            await page.reload();
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        }
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(model));
        report.runtimeMode = await page.locator("#toolbar-runtime-mode-select").inputValue();
        expect(report.runtimeMode).toBe(wasm ? "wasm" : "classic");
        if (pbr) {
            await page.locator('[data-i18n="menu.window"]').click();
            await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
            const dialog = page.locator('[data-popup-id="experimental-settings"]');
            const toggle = dialog.getByLabel("PBRモード", { exact: true });
            await toggle.check(); await expect(toggle).toBeEnabled();
            await dialog.locator(".app-menu-dialog-close").click();
        }
        const head = await page.evaluate(() => window.mmdModokiE2e.getModelBoneRenderedPosition(0, "頭"));
        await page.locator("#info-model-select").selectOption("__camera__");
        for (const [key, value] of Object.entries({ tx: 0, ty: (head?.y ?? 16) + 0.5, tz: 0, rx: 0, ry: 0, rz: 0, camDistance: 6 })) {
            const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
            await field.fill(String(value)); await field.press("Enter");
        }
        await page.locator("#info-model-select").selectOption("0");
        if (skin) {
            await page.locator("#btn-toggle-shader-panel").click();
            await page.locator('[data-effect-tab="materials"]').click();
            await page.locator("#shader-preset-select").selectOption("pbr-skin-face");
            await page.locator("#btn-shader-apply-all").click();
            await page.locator("#btn-toggle-shader-panel").click();
        }
        const slider = name => page.locator("#morph-controls .morph-slider-row")
            .filter({ has: page.getByRole("button", { name: `${name} keyframe`, exact: true }) }).locator('input[type="range"]');
        const set = async (name, value) => { await slider(name).fill(String(value)); await slider(name).dispatchEvent("input"); };
        const capture = async name => {
            await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => requestAnimationFrame(resolve)); });
            report.states[name] = await page.evaluate(() => {
                const meshes = window.mmdModokiE2e.getMorphGeometryForE2e();
                return {
                    runtime: window.mmdModokiE2e.getMaterialModeRuntimeState(),
                    backend: window.mmdModokiE2e.getFrameGraphPostEffectsState().backend,
                    validation: window.mmdModokiE2e.getWebGpuValidationDiagnostics(),
                    meshes: meshes.map(mesh => {
                        let nonFinite = 0, maxDelta = 0;
                        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
                        for (let i = 0; i < mesh.morphed.length; i++) {
                            const value = mesh.morphed[i];
                            if (!Number.isFinite(value)) nonFinite++;
                            min[i % 3] = Math.min(min[i % 3], value); max[i % 3] = Math.max(max[i % 3], value);
                            maxDelta = Math.max(maxDelta, Math.abs(value - mesh.base[i]));
                        }
                        return { name: mesh.name, gpuSkinning: mesh.gpuSkinning, vertices: mesh.base.length / 3,
                            numMaxInfluencers: mesh.numMaxInfluencers, numInfluencers: mesh.numInfluencers, usesTexture: mesh.usesTexture,
                            targets: mesh.targets.length, active: mesh.targets.filter(target => target.weight !== 0), nonFinite, maxDelta, min, max };
                    }),
                };
            });
            await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) });
        };
        await capture("00-neutral");
        await set("あ", 1); await capture("01-a-preview");
        await page.getByRole("button", { name: "あ keyframe", exact: true }).click();
        await capture("01b-a-registered");
        await set("口角上げ", 0.61); await capture("02-both-preview");
        await page.getByRole("button", { name: "口角上げ keyframe", exact: true }).click();
        await capture("03-both-registered");
        await page.evaluate(() => window.mmdModokiE2e.seekTo(15));
        await capture("04-both-seek");
        await set("あ", 0); await capture("05-corners-only");
        await set("口角上げ", 0); await capture("06-reset");
        for (const state of Object.values(report.states)) {
            expect(state.validation.count).toBe(0);
            expect(state.meshes.every(mesh => mesh.nonFinite === 0)).toBe(true);
        }
        expect(report.errors).toEqual([]);
    } finally {
        writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
        await launched.close();
    }
});
