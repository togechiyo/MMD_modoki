import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareAutomationPngOutput } from "../../src/main/automation/png-output";

const bytes = new Uint8Array([1, 2, 3]);
describe("MCP PNG sequence output", () => {
    it("requires a new directory, writes only planned files, and counts completed output", async () => {
        const root = await mkdtemp(join(tmpdir(), "mmd-png-test-"));
        try {
            const directory = join(root, "frames");
            const output = await prepareAutomationPngOutput(directory, ["a.png", "b.png"], () => true);
            await expect(prepareAutomationPngOutput(directory, ["a.png"], () => true)).rejects.toThrow("OUTPUT_EXISTS");
            expect(await output.complete()).toBe(false);
            await output.write(directory, "a.png", bytes);
            expect(await output.complete()).toBe(false);
            await output.write(directory, "b.png", bytes);
            expect(await output.complete()).toBe(true);
            expect(await output.stop()).toMatchObject({ savedFiles: 2, totalFiles: 2, byteLength: 6 });
        } finally { await rm(root, { recursive: true, force: true }); }
    });
    it("protects a file created during export and retains partial results", async () => {
        const root = await mkdtemp(join(tmpdir(), "mmd-png-test-"));
        try {
            const directory = join(root, "frames");
            const output = await prepareAutomationPngOutput(directory, ["a.png", "b.png"], () => true);
            await output.write(directory, "a.png", bytes);
            await writeFile(join(directory, "b.png"), "existing");
            await expect(output.write(directory, "b.png", bytes)).rejects.toThrow("OUTPUT_EXISTS");
            expect(await readFile(join(directory, "b.png"), "utf8")).toBe("existing");
            expect(await output.complete()).toBe(false);
            expect((await output.stop()).savedFiles).toBe(1);
            expect(await readdir(directory)).toHaveLength(2);
        } finally { await rm(root, { recursive: true, force: true }); }
    });
    it("rejects revocation, wrong paths and new writes after stop", async () => {
        const root = await mkdtemp(join(tmpdir(), "mmd-png-test-"));
        try {
            let allowed = true;
            const directory = join(root, "frames");
            const output = await prepareAutomationPngOutput(directory, ["a.png"], () => allowed);
            allowed = false;
            await expect(output.write(directory, "a.png", bytes)).rejects.toThrow("ACCESS_REVOKED");
            expect((await output.stop()).savedFiles).toBe(0);
            const second = await prepareAutomationPngOutput(join(root, "second"), ["a.png"], () => true);
            await expect(second.write(root, "a.png", bytes)).rejects.toThrow("INVALID_OUTPUT");
            await second.stop();
            await expect(second.write(join(root, "second"), "a.png", bytes)).rejects.toThrow("ACCESS_REVOKED");
        } finally { await rm(root, { recursive: true, force: true }); }
    });
    it("waits for started writes before reporting cancellation counts", async () => {
        const root = await mkdtemp(join(tmpdir(), "mmd-png-test-"));
        try {
            const directory = join(root, "frames");
            const output = await prepareAutomationPngOutput(directory, ["a.png"], () => true);
            const write = output.write(directory, "a.png", bytes);
            const stopped = await output.stop();
            await write;
            expect(stopped.savedFiles).toBe(1);
            expect(await output.complete()).toBe(false);
        } finally { await rm(root, { recursive: true, force: true }); }
    });
});
