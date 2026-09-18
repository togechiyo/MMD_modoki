import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

test("lighting, shadow and gravity rows remain aligned across window sizes", async ({}, testInfo) => {
    const root = resolve(import.meta.dirname, "../..");
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
        await page.locator("#info-model-select").selectOption("__camera__");
        for (const [width, height] of [[1440, 810], [1920, 1080], [2400, 1300]]) {
            await launched.app.evaluate(({ BrowserWindow }, size) => {
                BrowserWindow.getAllWindows()[0].setContentSize(...size);
            }, [width, height]);
            await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
            if (height > 1120) {
                const handle = await page.locator("#bottom-panel-resizer").boundingBox();
                await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
                await page.mouse.down();
                await page.mouse.move(handle.x + handle.width / 2, handle.y - 100, { steps: 5 });
                await page.mouse.up();
            }
            // Compare actual row pitch and control geometry, not CSS declarations.
            await expect.poll(() => page.evaluate(() => {
                const panels = ["lighting-section", "shadow-section", "gravity-section"].map(id => {
                    const section = document.getElementById(id);
                    const rows = [...section.querySelectorAll(".light-row")].filter(row => row.getBoundingClientRect().height > 0);
                    const origin = section.getBoundingClientRect();
                    return rows.slice(0, 4).map(row => {
                        const bounds = row.getBoundingClientRect();
                        const slider = row.querySelector("input[type=range]").getBoundingClientRect();
                        const number = row.querySelector(".range-number-input").getBoundingClientRect();
                        return [bounds.y - origin.y, bounds.height, slider.x - origin.x, slider.width, slider.height, number.width, number.height];
                    });
                });
                const baseline = panels[0];
                return Math.max(...panels.flatMap(rows => rows.flatMap((values, row) => values.map((value, column) => Math.abs(value - baseline[row][column])))));
            })).toBeLessThan(1.1);
            await page.locator("#bottom-panel").screenshot({ path: testInfo.outputPath(`scene-controls-${width}x${height}.png`) });
        }
    } finally {
        await launched.close();
    }
});
