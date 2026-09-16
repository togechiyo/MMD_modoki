import { expect } from "@playwright/test";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const constantName = name => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
function readWgslConstant(path, name) {
    const text = readFileSync(path, "utf8");
    const pattern = new RegExp("(const " + constantName(name) + ": (\\w+) = )([^;]+);");
    const match = pattern.exec(text);
    if (!match) throw new Error("Missing sample constant: " + name);
    return { text, pattern, type: match[2], value: match[3] };
}
export function editWgslParameter(path, name, value) {
    const { text, pattern, type } = readWgslConstant(path, name);
    const scalar = n => type === "u32" ? n + "u" : Number.isInteger(n) ? n + ".0" : String(n);
    const literal = Array.isArray(value) ? type + "(" + value.map(scalar).join(", ") + ")" : scalar(value);
    writeFileSync(path, text.replace(pattern, (_match, prefix) => prefix + literal + ";"));
}
function readConstantValue(path, name) {
    const { type, value } = readWgslConstant(path, name);
    if (type.startsWith("vec")) return value.slice(value.indexOf("(") + 1, -1).split(",").map(Number);
    return Number(value.replace(/[ui]$/, ""));
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
        parameterValue(name) { return readConstantValue(sourcePath, name); },
    };
}
