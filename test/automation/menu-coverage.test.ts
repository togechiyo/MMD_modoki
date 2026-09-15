import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { menuItems, readMenuItems } from "../../src/automation/menu-catalog";
import { menuActionSchema } from "../../src/automation/menu-actions";
import { automationTools } from "../../src/automation/contracts";
import { applyAutomationControl } from "../../src/automation/controls";
import type { MmdManager } from "../../src/mmd-manager";

describe("MCP menu coverage", () => {
    it("accounts for every visible menu command without exposing hidden entries", () => {
        const html = readFileSync("index.html", "utf8").split("</nav>")[0];
        const buttons = [...html.matchAll(/<button\b[^>]*data-menu-command="([^"]+)"[^>]*>/g)];
        const visible = [...new Set(buttons.filter(([tag]) => !/\bhidden\b/.test(tag)).map(([, id]) => id))].sort();
        expect(menuItems.map(item => item.command).sort()).toEqual(visible);
        expect(new Set(menuItems.map(item => item.command)).size).toBe(menuItems.length);
        for (const item of menuItems) for (const route of item.routes) expect(automationTools).toHaveProperty(route.tool);
    });

    it("rejects arbitrary invocation and keeps consent outside the edit API", () => {
        for (const action of [{ kind: "execute", method: "dispose" }, { kind: "menu", command: "tools.experimentalSettings" },
            { kind: "cameraView", view: "front", script: "private" }, { kind: "clearModelMotion" }]) {
            expect(menuActionSchema.safeParse(action).success).toBe(false);
        }
        expect(menuActionSchema.safeParse({ kind: "cameraView", view: "front" }).success).toBe(true);
        expect(menuActionSchema.safeParse({ kind: "clearModelMotion", modelInstanceId: "model", dryRun: true }).success).toBe(true);
    });

    it("resolves actual menu labels in all five locales and searches localized names", () => {
        for (const locale of ["ja", "en", "zh-Hant", "zh-Hans", "ko"]) {
            const dictionary = JSON.parse(readFileSync(`language/${locale}.json`, "utf8").replace(/^\uFEFF/, ""));
            const items = readMenuItems("", key => dictionary[key] ?? key).items;
            for (const entry of items) {
                expect(entry.label).not.toMatch(/^menu\./);
                expect(entry.group).not.toMatch(/^menu\./);
            }
            expect(readMenuItems(dictionary["menu.view.camera.front"], key => dictionary[key] ?? key).items.map(entry => entry.command)).toContain("view.camera.front");
        }
    });

    it("rejects GUI-disabled settings before mutating and reports normalized values", () => {
        let written = false;
        let fps = 0;
        const manager = {
            getLoadedModels: () => [{ instanceId: "model" }], setMmdRenderOrderMode: () => { written = true; },
            shadowMode: "standard", isCascadedShadowSupported: () => false,
            getRenderFpsLimit: () => fps, setRenderFpsLimit: (value: number) => { fps = value; },
        } as unknown as MmdManager;
        expect(() => applyAutomationControl(manager, { id: "render.modelOrderMode", value: "mmd-fixed" })).toThrow("SETTING_UNAVAILABLE");
        expect(() => applyAutomationControl(manager, { id: "shadow.mode", value: "cascaded" })).toThrow("SETTING_UNAVAILABLE");
        expect(written).toBe(false);
        expect(manager.shadowMode).toBe("standard");
        expect(applyAutomationControl(manager, { id: "runtime.fpsLimit", value: 30 })).toMatchObject({ changed: true, applied: 30 });
        expect(applyAutomationControl(manager, { id: "runtime.fpsLimit", value: 30 })).toMatchObject({ changed: false });
    });
});
