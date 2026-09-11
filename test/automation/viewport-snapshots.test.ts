import { expect, it } from "vitest";
import { ViewportSnapshots, type ViewportSnapshot } from "../../src/automation/viewport-snapshots";
const snapshot = (id: string, data = "AAAA"): ViewportSnapshot => ({ id, label: id, capturedAt: "now", frame: 0, editRevision: 1,
    camera: { target: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, distance: 45, fov: 30 }, physicsEnabled: false,
    width: 100, height: 100, materialMode: "mmd-standard", backend: "frameGraph", image: { data, mimeType: "image/png" } });
it("returns images in requested order and exposes only metadata in lists", () => {
    const store = new ViewportSnapshots();
    store.synchronize("grant:scene");
    store.add(snapshot("before")); store.add(snapshot("after"));
    const result = store.compare(["after", "before"]);
    expect(result.data.snapshots.map(item => item.id)).toEqual(["after", "before"]);
    expect(result.images).toHaveLength(2);
    expect(JSON.stringify(store.list())).not.toContain("AAAA");
    store.synchronize("grant:scene");
    expect(store.list()).toHaveLength(2);
    store.synchronize("grant:newScene");
    expect(store.list()).toEqual([]);
    expect(() => store.compare(["before"])).toThrow("SNAPSHOT_NOT_FOUND");
});
it("evicts oldest entries by count and bytes, and bounds comparison responses", () => {
    const store = new ViewportSnapshots(2, 10, 6);
    store.add(snapshot("a")); store.add(snapshot("b"));
    expect(store.add(snapshot("c")).evictedIds).toEqual(["a"]);
    expect(() => store.compare(["b", "c"])).toThrow("CAPTURE_TOO_LARGE");
    expect(store.add(snapshot("d", "AAAAAAAA")).evictedIds).toEqual(["b", "c"]);
    expect(() => store.add(snapshot("large", "A".repeat(11)))).toThrow("CAPTURE_TOO_LARGE");
    expect(store.list().map(item => item.id)).toEqual(["d"]);
    store.clear(); expect(store.list()).toEqual([]);
});
