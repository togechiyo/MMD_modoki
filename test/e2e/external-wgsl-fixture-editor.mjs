import { expect } from "@playwright/test";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function readWgslMetadata(path) {
    const text = readFileSync(path, "utf8");
    const match = /^\s*\/\*\s*@modoki\b([\s\S]*?)\*\//.exec(text);
    if (!match) throw new Error("Fixture is missing WGSL metadata: " + path);
    return { text, match, metadata: JSON.parse(match[1]) };
}
export function editWgslParameter(path, name, value) {
    const { text, match, metadata } = readWgslMetadata(path);
    metadata.parameters[name].default = value;
    writeFileSync(path, `/* @modoki\n${JSON.stringify(metadata, null, 2)}\n*/` + text.slice(match[0].length));
}

// Edit temporary copies of redistributable files as an author would in a text editor.
export function wgslFixtureEditor(app, page, testInfo, root) {
    let sourcePath;
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
            const folder = testInfo.outputPath("shaders");
            mkdirSync(folder, { recursive: true });
            sourcePath = resolve(folder, name + ".wgsl");
            cpSync(resolve(root, "wgsl", name + ".wgsl"), sourcePath);
            await this.importFile(sourcePath); await this.apply();
        },
        async parameter(name, value) {
            editWgslParameter(sourcePath, name, value);
            await this.importFile(sourcePath); await this.apply(false);
        },
        parameterValue(name) { return readWgslMetadata(sourcePath).metadata.parameters[name].default; },
    };
}
