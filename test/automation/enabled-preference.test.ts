import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationEnabledPreference } from "../../src/main/automation/enabled-preference";

describe("MCP enabled preference", () => {
    let directory: string;
    let location: string;
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "mmd-mcp-settings-"));
        location = join(directory, "mcp-settings.json");
    });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

    it("starts disabled and persists only enabled across store instances", async () => {
        const preference = new AutomationEnabledPreference(() => location);
        expect(await preference.read()).toBe(false);
        expect(await readdir(directory)).toEqual([]);
        await preference.write(true);
        expect(JSON.parse(await readFile(location, "utf8"))).toEqual({ version: 1, enabled: true });
        const restarted = new AutomationEnabledPreference(() => location);
        expect(await restarted.read()).toBe(true);
        await restarted.write(false);
        expect(await new AutomationEnabledPreference(() => location).read()).toBe(false);
        expect(await readdir(directory)).toEqual(["mcp-settings.json"]);
    });

    it("serializes rapid changes and reads after the final complete write", async () => {
        const preference = new AutomationEnabledPreference(() => location);
        await Promise.all([preference.write(true), preference.write(false), preference.write(true), preference.write(false)]);
        expect(await preference.read()).toBe(false);
        expect(JSON.parse(await readFile(location, "utf8"))).toEqual({ version: 1, enabled: false });
        expect(await readdir(directory)).toEqual(["mcp-settings.json"]);
    });

    it.each(['{"enabled":true}', '{"version":1,"enabled":"true"}', '{"version":2,"enabled":true}', 'null', '{'])("rejects invalid settings without silently resetting them: %s", async content => {
        await writeFile(location, content);
        await expect(new AutomationEnabledPreference(() => location).read()).rejects.toThrow();
        expect(await readFile(location, "utf8")).toBe(content);
    });

    it("surfaces read errors and recovers the write queue after a failed replacement", async () => {
        await mkdir(location);
        const preference = new AutomationEnabledPreference(() => location);
        await expect(preference.read()).rejects.toThrow();
        await expect(preference.write(true)).rejects.toThrow();
        expect(await readdir(directory)).toEqual(["mcp-settings.json"]);
        await rm(location, { recursive: true });
        await preference.write(true);
        expect(await preference.read()).toBe(true);
    });
});
