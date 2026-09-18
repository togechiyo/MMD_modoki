import { test, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { writeFile } from "node:fs/promises";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const modelPath = resolve(root, "test/fixtures/external-parent/tofu.pmx");
const ready = page => page.waitForFunction(() => Boolean(window.mmdModokiE2e));

// Supply real disk-backed Files at the OS boundary, then exercise the document drop listener.
async function dropFiles(page, paths, separately = false) {
    await page.evaluate(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.id = "e2e-drop-files";
        input.hidden = true;
        document.body.append(input);
    });
    await page.locator("#e2e-drop-files").setInputFiles(paths);
    const transfer = await page.evaluateHandle(() => {
        const input = document.getElementById("e2e-drop-files");
        const data = new DataTransfer();
        for (const file of input.files) data.items.add(file);
        input.remove();
        return data;
    });
    if (separately) {
        await page.evaluate(data => {
            for (const file of data.files) {
                const single = new DataTransfer();
                single.items.add(file);
                document.getElementById("render-canvas").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: single }));
            }
        }, transfer);
    } else {
        await page.locator("#render-canvas").dispatchEvent("drop", { dataTransfer: transfer });
    }
    await transfer.dispose();
}

async function newEmptyWindow(app, page) {
    const next = app.waitForEvent("window");
    await page.keyboard.press("Control+N");
    const created = await next;
    await ready(created);
    return created;
}

for (const backend of ["frameGraph", "classic"]) test(`project drop preserves existing work (${backend})`, async () => {
    test.setTimeout(180000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await ready(page);
        if (backend === "classic") {
            await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
            await page.reload();
            await ready(page);
        }
        const blank = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        const firstPath = join(launched.tempDir, "日本語 first.modoki.json");
        const secondPath = join(launched.tempDir, "second.mmdproj");
        await writeFile(firstPath, JSON.stringify({ ...blank, scene: { ...blank.scene, currentFrame: 17 } }));
        await writeFile(secondPath, JSON.stringify({ ...blank, scene: { ...blank.scene, currentFrame: 31 } }));

        // Fresh window loads in place and displays the imported frame.
        await dropFiles(page, [firstPath]);
        await expect(page.locator("#current-frame")).toHaveValue("17");
        expect(launched.app.windows()).toHaveLength(1);
        const before = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());

        // Even a project with no model is occupied after opening it.
        const next = launched.app.waitForEvent("window");
        await dropFiles(page, [secondPath]);
        const imported = await next;
        await ready(imported);
        await expect(imported.locator("#current-frame")).toHaveValue("31");
        await expect(page.locator("#current-frame")).toHaveValue("17");
        const after = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        expect({ ...after, savedAt: null }).toEqual({ ...before, savedAt: null });
        // Startup handoff is consumed; a reload must not reopen the dropped file.
        expect(await imported.evaluate(() => window.electronAPI.takeInitialProjectPath())).toBeNull();
        await imported.close();

        // Unsaved lighting-only work counts even without a model or registered key.
        const lightingPage = await newEmptyWindow(launched.app, page);
        await page.close();
        const lightValue = lightingPage.locator("#light-direction-x + .range-number-input");
        await lightValue.fill("0.5");
        await lightValue.press("Enter");
        const lightingNext = launched.app.waitForEvent("window");
        await dropFiles(lightingPage, [secondPath]);
        const lightingImported = await lightingNext;
        await ready(lightingImported);
        await expect(lightingImported.locator("#current-frame")).toHaveValue("31");
        await expect(lightValue).toHaveValue("0.5");
        await lightingImported.close();

        // Existing models also remain in their own window.
        const modelPage = await newEmptyWindow(launched.app, lightingPage);
        await lightingPage.close();
        await modelPage.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
        await expect(modelPage.locator('#info-model-select option:not([value="__camera__"])')).toHaveCount(1);
        const modelNext = launched.app.waitForEvent("window");
        await dropFiles(modelPage, [firstPath]);
        const modelImported = await modelNext;
        await ready(modelImported);
        await expect(modelImported.locator("#current-frame")).toHaveValue("17");
        expect(await modelPage.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(1);
        await modelImported.close();

        // Invalid JSON and combined drops leave a fresh editor usable.
        const fresh = await newEmptyWindow(launched.app, modelPage);
        await modelPage.close();
        const invalid = join(launched.tempDir, "invalid.json");
        await writeFile(invalid, JSON.stringify({ effects: { lutSourceMode: "project-relative" } }));
        await dropFiles(fresh, [invalid]);
        await expect(fresh.locator(".toast.error")).toContainText("Project load error");
        await dropFiles(fresh, [firstPath, modelPath]);
        await expect(fresh.locator(".toast.error").last()).toContainText("1つずつ");
        await expect(fresh.locator("#current-frame")).toHaveValue("0");
        expect(launched.app.windows()).toHaveLength(1);
        await dropFiles(fresh, [firstPath]);
        await expect(fresh.locator("#current-frame")).toHaveValue("17");
        expect(launched.app.windows()).toHaveLength(1);

        // Two separate drops in the same turn cannot both claim the empty window.
        const racePage = await newEmptyWindow(launched.app, fresh);
        await fresh.close();
        const raceNext = launched.app.waitForEvent("window");
        await dropFiles(racePage, [firstPath, secondPath], true);
        const raceImported = await raceNext;
        await ready(raceImported);
        await expect(racePage.locator("#current-frame")).toHaveValue("17");
        await expect(raceImported.locator("#current-frame")).toHaveValue("31");
        expect(launched.app.windows()).toHaveLength(2);
        await raceImported.close();
    } finally {
        await launched.close();
    }
});
