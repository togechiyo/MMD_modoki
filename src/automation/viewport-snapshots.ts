import { AutomationError } from "./diagnostics";
import { z } from "zod";

const coordinate = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }).strict();
export const snapshotCameraSchema = z.object({ target: coordinate, rotation: coordinate, distance: z.number().finite(), fov: z.number().finite() }).strict();

export type ViewportSnapshot = {
    id: string; label: string; capturedAt: string; frame: number; editRevision: number;
    width: number; height: number; materialMode: string; backend: string;
    camera: z.infer<typeof snapshotCameraSchema>; physicsEnabled: boolean;
    image: { data: string; mimeType: "image/png" };
};
const metadata = (value: ViewportSnapshot): Omit<ViewportSnapshot, "image"> => ({
    id: value.id, label: value.label, capturedAt: value.capturedAt, frame: value.frame, editRevision: value.editRevision,
    width: value.width, height: value.height, materialMode: value.materialMode, backend: value.backend,
    camera: value.camera, physicsEnabled: value.physicsEnabled,
});

/** Grant/scene-scoped memory only. Limits account for the actual base64 strings retained. */
export class ViewportSnapshots {
    private scope = "";
    private readonly entries = new Map<string, ViewportSnapshot>();
    constructor(private readonly maxCount = 8, private readonly maxBytes = 24 * 1024 * 1024, private readonly comparisonMaxBytes = 12 * 1024 * 1024) {}
    clear(): void { this.entries.clear(); this.scope = ""; }
    synchronize(scope: string): void { if (scope !== this.scope) { this.clear(); this.scope = scope; } }
    add(value: ViewportSnapshot) {
        if (value.image.data.length > this.maxBytes) throw new AutomationError("CAPTURE_TOO_LARGE");
        this.entries.set(value.id, value);
        const evictedIds: string[] = [];
        while (this.entries.size > this.maxCount || [...this.entries.values()].reduce((sum, item) => sum + item.image.data.length, 0) > this.maxBytes) {
            const id = this.entries.keys().next().value;
            if (!id) break;
            this.entries.delete(id); evictedIds.push(id);
        }
        return { snapshot: metadata(value), evictedIds };
    }
    list() { return [...this.entries.values()].map(metadata); }
    compare(ids: readonly string[]) {
        const entries = ids.map(id => { const value = this.entries.get(id); if (!value) throw new AutomationError("SNAPSHOT_NOT_FOUND"); return value; });
        if (entries.reduce((sum, item) => sum + item.image.data.length, 0) > this.comparisonMaxBytes) throw new AutomationError("CAPTURE_TOO_LARGE");
        return { data: { snapshots: entries.map((entry, imageIndex) => ({ ...metadata(entry), imageIndex })),
            source: "stored-viewport-snapshots", sceneModified: false, modelContentShared: false }, images: entries.map(entry => entry.image) };
    }
}
