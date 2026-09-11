import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareAutomationVideoOutput } from "../../src/main/automation/video-output";

describe("completed video publication", () => {
    it("protects files created during encoding, supports explicit overwrite, and rejects revoked publication", async () => {
        const directory = await mkdtemp(join(tmpdir(), "mmd-video-test-"));
        const filePath = join(directory, "movie.webm");
        try {
            const first = await prepareAutomationVideoOutput(filePath, false, () => true);
            await writeFile(first.temporaryPath, "new video");
            await writeFile(filePath, "existing");
            await expect(first.publish()).rejects.toThrow("OUTPUT_EXISTS");
            await first.dispose();
            expect(await readFile(filePath, "utf8")).toBe("existing");
            const replacement = await prepareAutomationVideoOutput(filePath, true, () => true);
            await writeFile(replacement.temporaryPath, "complete video");
            expect((await replacement.publish()).byteLength).toBe(14);
            await replacement.dispose();
            expect(await readFile(filePath, "utf8")).toBe("complete video");
            let allowed = true;
            const revoked = await prepareAutomationVideoOutput(filePath, true, () => allowed);
            await writeFile(revoked.temporaryPath, "revoked");
            allowed = false;
            await expect(revoked.publish()).rejects.toThrow("ACCESS_REVOKED");
            await revoked.dispose();
            expect(await readFile(filePath, "utf8")).toBe("complete video");
        } finally { await rm(directory, { recursive: true, force: true }); }
    });
});
