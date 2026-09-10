import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { writeAutomationOutput } from "../../src/main/automation/output-file";

it("writes generated output locally with exclusive creation and explicit overwrite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mmd-output-test-"));
    try {
        const filePath = join(directory, "scene.mmdproj");
        const input = { filePath, overwrite: false, format: "project" as const, bytes: new TextEncoder().encode("first") };
        expect(await writeAutomationOutput(input)).toMatchObject({ status: "saved", byteLength: 5 });
        expect(await writeAutomationOutput({ ...input, bytes: new TextEncoder().encode("second") })).toMatchObject({ status: "failed", code: "OUTPUT_EXISTS" });
        expect(await readFile(filePath, "utf8")).toBe("first");
        expect(await writeAutomationOutput({ ...input, overwrite: true, bytes: new TextEncoder().encode("second") })).toMatchObject({ status: "saved" });
        expect(await readFile(filePath, "utf8")).toBe("second");
        expect(await writeAutomationOutput({ ...input, filePath: join(directory, "model.pmx") })).toMatchObject({ status: "failed", code: "INVALID_OUTPUT" });
        expect(await writeAutomationOutput({ ...input, overwrite: true }, () => false)).toMatchObject({ status: "failed", code: "ACCESS_REVOKED" });
        expect(await readFile(filePath, "utf8")).toBe("second");
    } finally { await rm(directory, { recursive: true, force: true }); }
});
