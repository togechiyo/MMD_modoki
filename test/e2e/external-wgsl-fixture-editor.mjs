import { expect } from "@playwright/test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Edit temporary copies of redistributable packages as an author would in a text editor.
export function wgslFixtureEditor(app, page, testInfo, root) {
    let manifestPath;
    return {
        async importFile(path) {
            await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path);
            await page.locator("#external-wgsl-load").click();
            await expect(page.locator("#external-wgsl-load")).toBeEnabled();
            return page.locator("#shader-preset-select").inputValue();
        },
        async apply(all = true) {
            const button = page.locator(all ? "#btn-shader-apply-all" : "#btn-shader-apply-selected");
            await button.click(); await expect(button).toBeEnabled({ timeout: 25000 });
            await expect(page.locator("#viewport-runtime-status-host [role=alert]")).toHaveCount(0);
            await expect(page.locator(".shader-material-preset").first()).toContainText("WGSL:");
        },
        async load(name) {
            const folder = testInfo.outputPath("packages", name);
            cpSync(resolve(root, "wgsl", name), folder, { recursive: true });
            manifestPath = resolve(folder, "effect.modoki.json");
            await this.importFile(manifestPath); await this.apply();
        },
        async parameter(name, value) {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
            manifest.parameters[name].default = value;
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            await this.importFile(manifestPath); await this.apply(false);
        },
        parameterValue(name) { return JSON.parse(readFileSync(manifestPath, "utf8")).parameters[name].default; },
    };
}
