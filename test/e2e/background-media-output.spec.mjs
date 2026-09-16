import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { createMedia } from "../fixtures/background-media/create.mjs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

async function loadBackground(page, file, video) {
    const imported = await page.evaluate(async ({ file, video }) => {
        const project = window.mmdModokiE2e.exportProjectState();
        Object.assign(project.viewport, {
            groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black",
            backgroundImagePath: video ? null : file, backgroundVideoPath: video ? file : null,
            backgroundMediaVisible: true,
        });
        project.effects.gamma = 1.2;
        project.effects.frameGraphPostStack = [{ id: "gamma", enabled: true }];
        return await window.mmdModokiE2e.importProjectState(project);
    }, { file, video });
    expect(imported.warnings).toEqual([]);
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().viewport.backgroundMediaVisible)).toBe(true);
}

async function exportMedia(page, directory, name, video, startFrame = 0, endFrame = startFrame, fps = 30, transparent = false) {
    const launched = await page.evaluate(async args => {
        const api = window.electronAPI;
        const request = {
            project: window.mmdModokiE2e.exportProjectState(),
            outputWidth: 160, outputHeight: 90,
            startFrame: args.startFrame, endFrame: args.endFrame, fps: args.fps,
            ...(args.video ? {
                outputFilePath: args.directory + "/" + args.name + ".webm",
                includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface",
            } : {
                outputDirectoryPath: args.directory, prefix: args.name, step: 30, precision: 1,
                transparentBackground: args.transparent,
            }),
        };
        let remove;
        const finished = new Promise(done => {
            remove = args.video ? api.onWebmExportResult(done)
                : api.onPngSequenceExportProgress(progress => {
                    if (progress.total > 0 && progress.saved === progress.total) done({ status: "completed" });
                });
        });
        try {
            const launched = await (args.video ? api.startWebmExportWindow : api.startPngSequenceExportWindow)(request);
            if (!launched?.jobId) throw new Error("Export did not start");
            const result = await finished;
            if (result.status !== "completed") throw new Error(JSON.stringify(result));
            return launched;
        } finally { remove(); }
    }, { directory, name, video, startFrame, endFrame, fps, transparent });
    expect(launched?.jobId).toBeTruthy();
    const lastFile = resolve(directory, video ? `${name}.webm` : `${name}_${String(endFrame).padStart(4, "0")}.png`);
    await expect.poll(() => existsSync(lastFile), { timeout: 60000 }).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
    return { status: "completed" };
}

async function sampleMedia(page, file, video, time = 0.001) {
    return await page.evaluate(async ({ file, video, time }) => {
        const bytes = await window.electronAPI.readBinaryFile(file);
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: video ? "video/webm" : "image/png" }));
        const media = document.createElement(video ? "video" : "img");
        try {
            const loaded = new Promise((done, fail) => {
                media.addEventListener(video ? "loadeddata" : "load", done, { once: true });
                media.addEventListener("error", () => fail(new Error(`Decode failed: ${file} (${bytes?.byteLength} bytes) ${media.error?.message ?? ""}`)), { once: true });
            });
            media.src = url; await loaded;
            if (video) {
                const seeked = new Promise(done => media.addEventListener("seeked", done, { once: true }));
                media.currentTime = time; await seeked;
            }
            const canvas = document.createElement("canvas");
            canvas.width = 16; canvas.height = 16;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(media, 0, 0, 16, 16);
            return Array.from(ctx.getImageData(8, 8, 1, 1).data);
        } finally { media.removeAttribute("src"); URL.revokeObjectURL(url); }
    }, { file, video, time });
}

const expectColor = (rgb, channel) => {
    expect(rgb[channel], JSON.stringify(rgb)).toBeGreaterThan(180);
    for (let c = 0; c < 3; c++) if (c !== channel) expect(rgb[c], JSON.stringify(rgb)).toBeLessThan(55);
};

for (const backend of ["classic", "frameGraph"]) {
    for (const video of [false, true]) test(`background ${video ? "video synchronization" : "visibility roundtrip"} (${backend})`, async () => {
        test.setTimeout(180000);
        const launched = await launchMmdModoki(root);
        const handleDialogs = page => page.on("dialog", dialog => { void dialog.dismiss().catch(() => undefined); });
        launched.app.on("window", handleDialogs);
        try {
            const page = await launched.app.firstWindow();
            handleDialogs(page);
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
            await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
            await page.reload();
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
            expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
            await loadBackground(page, await createMedia(page, launched.tempDir, video), video);
            const preview = resolve(launched.tempDir, "preview.png");
            await expect.poll(async () => {
                await page.locator("#render-canvas").screenshot({ path: preview });
                return (await sampleMedia(page, preview, false))[0];
            }).toBeGreaterThan(180);
            if (video) {
                expect((await exportMedia(page, launched.tempDir, "sequence", false, 15, 75)).status).toBe("completed");
                for (const [frame, color] of [[15, 0], [45, 1], [75, 2]]) {
                    expectColor(await sampleMedia(page, resolve(launched.tempDir, `sequence_${String(frame).padStart(4, "0")}.png`), false), color);
                }
                expect((await exportMedia(page, launched.tempDir, "ended", false, 105)).status).toBe("completed");
                expectColor(await sampleMedia(page, resolve(launched.tempDir, "ended_0105.png"), false), 2);
                for (const fps of [30, 60]) {
                    expect((await exportMedia(page, launched.tempDir, `motion${fps}`, true, 15, 75, fps)).status).toBe("completed");
                    for (const [time, color] of [[0.1, 0], [1.1, 1], [1.9, 2]]) {
                        expectColor(await sampleMedia(page, resolve(launched.tempDir, `motion${fps}.webm`), true, time), color);
                    }
                }
            } else {
                const single = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 320, 180), launched.tempDir);
                expect(single.surfaceReleased).toBe(true);
                expectColor(await sampleMedia(page, single.path, false), 0);
                expect((await exportMedia(page, launched.tempDir, "visible", false)).status).toBe("completed");
                expectColor(await sampleMedia(page, resolve(launched.tempDir, "visible_0000.png"), false), 0);
                expect((await exportMedia(page, launched.tempDir, "transparent", false, 0, 0, 30, true)).status).toBe("completed");
                expect((await sampleMedia(page, resolve(launched.tempDir, "transparent_0000.png"), false))[3]).toBe(0);
            }
            await page.locator('.app-menu-trigger[data-i18n="menu.background"]').click();
            await page.locator('[data-menu-command="background.toggleMedia"]').click();
            const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
            expect(project.viewport.backgroundMediaVisible).toBe(false);
            await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), project);
            await page.locator('.app-menu-trigger[data-i18n="menu.background"]').click();
            await expect(page.locator('[data-menu-command="background.toggleMedia"]')).toHaveAttribute("aria-checked", "false");
            await page.keyboard.press("Escape");
            for (const outputVideo of [false, true]) {
                expect((await exportMedia(page, launched.tempDir, "hidden", outputVideo)).status).toBe("completed");
                const rgb = await sampleMedia(page, resolve(launched.tempDir, outputVideo ? "hidden.webm" : "hidden_0000.png"), outputVideo);
                expect(Math.max(...rgb.slice(0, 3)), JSON.stringify(rgb)).toBeLessThan(20);
            }
        } finally { await launched.close(); }
    });
}
