import { access, link, mkdir, mkdtemp, rename, rmdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { automationLocalPathSchema } from "../../automation/ui-operation-schema";
import { AutomationError } from "../../automation/diagnostics";

/** Encode beside the destination; publish only a completed file under the current permission. */
export async function prepareAutomationVideoOutput(filePath: string, overwrite: boolean, authorized: () => boolean) {
    if (!automationLocalPathSchema.safeParse(filePath).success || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== ".webm" || typeof overwrite !== "boolean") throw new AutomationError("INVALID_OUTPUT");
    if (!authorized()) throw new AutomationError("ACCESS_REVOKED");
    if (!overwrite) {
        const exists = await access(filePath).then(() => true, () => false);
        if (exists) throw new AutomationError("OUTPUT_EXISTS");
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    const directory = await mkdtemp(path.join(path.dirname(filePath), ".mmd-webm-"));
    const temporaryPath = path.join(directory, "output.webm");
    const dispose = async () => {
        await unlink(temporaryPath).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
        await rmdir(directory).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
    };
    return { temporaryPath, dispose, async publish() {
        if (!authorized()) throw new AutomationError("ACCESS_REVOKED");
        const info = await stat(temporaryPath);
        if (!info.isFile() || info.size === 0) throw new AutomationError("OUTPUT_WRITE_FAILED");
        if (!authorized()) throw new AutomationError("ACCESS_REVOKED");
        try {
            // Same volume. link gives exclusive creation even if the destination appeared during encoding.
            if (overwrite) await rename(temporaryPath, filePath);
            else await link(temporaryPath, filePath);
        } catch (error) {
            throw new AutomationError((error as NodeJS.ErrnoException).code === "EEXIST" ? "OUTPUT_EXISTS" : "OUTPUT_WRITE_FAILED");
        }
        return { filePath, byteLength: info.size };
    } };
}
