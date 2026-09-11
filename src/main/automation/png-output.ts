import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { automationLocalPathSchema } from "../../automation/ui-operation-schema";
import { AutomationError } from "../../automation/diagnostics";

/** A new directory only; completed files remain available after failure/cancellation. */
export async function prepareAutomationPngOutput(directoryPath: string, fileNames: readonly string[], authorized: () => boolean) {
    if (!automationLocalPathSchema.safeParse(directoryPath).success || !path.isAbsolute(directoryPath)
        || fileNames.length < 1 || fileNames.length > 10000 || fileNames.some(name => path.basename(name) !== name || !/^[A-Za-z0-9_-]+\.png$/.test(name))) throw new AutomationError("INVALID_OUTPUT");
    if (!authorized()) throw new AutomationError("ACCESS_REVOKED");
    try { await mkdir(directoryPath); } catch (error) {
        throw new AutomationError((error as NodeJS.ErrnoException).code === "EEXIST" ? "OUTPUT_EXISTS" : "OUTPUT_WRITE_FAILED");
    }
    const allowed = new Set(fileNames);
    const pending = new Set<Promise<void>>();
    let stopped = false;
    let savedFiles = 0;
    let byteLength = 0;
    let errorCode: string | null = null;
    return {
        directoryPath,
        get errorCode() { return errorCode; },
        async write(directory: string, name: string, bytes: Uint8Array): Promise<string> {
            if (stopped || !authorized()) { errorCode = "ACCESS_REVOKED"; throw new AutomationError(errorCode); }
            if (path.resolve(directory) !== path.resolve(directoryPath) || !allowed.delete(name)) { errorCode = "INVALID_OUTPUT"; throw new AutomationError(errorCode); }
            const filePath = path.join(directoryPath, name);
            const task = (async () => {
                try { await writeFile(filePath, bytes, { flag: "wx" }); savedFiles++; byteLength += bytes.byteLength; }
                catch (error) {
                    errorCode = (error as NodeJS.ErrnoException).code === "EEXIST" ? "OUTPUT_EXISTS" : "OUTPUT_WRITE_FAILED";
                    throw new AutomationError(errorCode);
                }
            })();
            pending.add(task);
            try { await task; } finally { pending.delete(task); }
            return filePath;
        },
        async complete(): Promise<boolean> {
            await Promise.allSettled([...pending]);
            if (!authorized()) errorCode = "ACCESS_REVOKED";
            return !stopped && !errorCode && savedFiles === fileNames.length;
        },
        async stop() {
            stopped = true;
            await Promise.allSettled([...pending]);
            return { outputDirectoryPath: directoryPath, savedFiles, totalFiles: fileNames.length, byteLength };
        },
    };
}
export type AutomationPngOutput = Awaited<ReturnType<typeof prepareAutomationPngOutput>>;
