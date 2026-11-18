import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** App intent only: session permissions and credentials never belong in this file. */
export class AutomationEnabledPreference {
    private queue: Promise<unknown> = Promise.resolve();
    private saved: boolean | undefined;

    constructor(private readonly location: () => string) {}

    read(): Promise<boolean> {
        const work = async (): Promise<boolean> => {
            try {
                const value: unknown = JSON.parse(await readFile(this.location(), "utf8"));
                if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
                    || !("enabled" in value) || typeof value.enabled !== "boolean") throw new Error("INVALID_MCP_SETTINGS");
                this.saved = value.enabled;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
                this.saved = false;
            }
            return this.saved;
        };
        const result = this.queue.then(work, work);
        this.queue = result;
        return result;
    }

    write(enabled: boolean): Promise<void> {
        const work = async (): Promise<void> => {
            if (this.saved === enabled) return;
            const location = this.location();
            const temporary = `${location}.${randomUUID()}.tmp`;
            await mkdir(path.dirname(location), { recursive: true });
            try {
                await writeFile(temporary, JSON.stringify({ version: 1, enabled }), { mode: 0o600, flag: "wx" });
                // A replacement on the same volume preserves the previous complete document if writing fails.
                await rename(temporary, location);
                this.saved = enabled;
            } finally {
                await unlink(temporary).catch(error => {
                    // Successful rename already removed the temporary file.
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
                });
            }
        };
        const result = this.queue.then(work, work);
        this.queue = result;
        return result;
    }
}
