import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { automationLocalPathSchema, type AutomationOutput, type AutomationOutputResult } from "../../automation/ui-operation-schema";

const extensions: Record<AutomationOutput["format"], readonly string[]> = {
    project: [".json", ".mmdproj"], vmd: [".vmd"], vpd: [".vpd"], bvmd: [".bvmd"], bpmx: [".bpmx"], png: [".png"], lut: [".cube", ".3dl"], wgsl: [".wgsl"],
};
/** Renderer-internal sink for app-generated files. Never exposed as an MCP binary/file write tool. */
export async function writeAutomationOutput(input: AutomationOutput, authorized: () => boolean = () => true): Promise<AutomationOutputResult> {
    if (!input || !automationLocalPathSchema.safeParse(input.filePath).success || !path.isAbsolute(input.filePath) ||
        !Object.hasOwn(extensions, input.format) || !extensions[input.format].includes(path.extname(input.filePath).toLowerCase()) ||
        typeof input.overwrite !== "boolean" || !(input.bytes instanceof Uint8Array) || input.bytes.byteLength > 256 * 1024 * 1024) {
        return { status: "failed", code: "INVALID_OUTPUT" };
    }
    try {
        if (!authorized()) return { status: "failed", code: "ACCESS_REVOKED" };
        await mkdir(path.dirname(input.filePath), { recursive: true });
        if (!authorized()) return { status: "failed", code: "ACCESS_REVOKED" };
        await writeFile(input.filePath, input.bytes, { flag: input.overwrite ? "w" : "wx" });
        return { status: "saved", filePath: input.filePath, byteLength: input.bytes.byteLength };
    } catch (error) {
        return { status: "failed", code: (error as NodeJS.ErrnoException).code === "EEXIST" ? "OUTPUT_EXISTS" : "OUTPUT_WRITE_FAILED" };
    }
}
