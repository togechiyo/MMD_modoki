import { describe, expect, it } from "vitest";
import { captureViewportSequence } from "../../src/automation/viewport-sequence";
import { automationTools } from "../../src/automation/contracts";

function clock(captureMs = 25) {
    let time = 0;
    let revoked = false;
    const host = {
        now: () => time,
        wait: async (ms: number) => { time += ms; },
        validate: () => { if (revoked) throw new Error("ACCESS_REVOKED"); },
        capture: async () => { time += captureMs; return { data: { frameAfter: time }, image: { data: "jpeg", mimeType: "image/jpeg" as const } }; },
    };
    return { host, revoke: () => { revoked = true; } };
}

describe("viewport sequence", () => {
    it("samples at the requested interval and maps images to observed metadata", async () => {
        const { host } = clock();
        const result = await captureViewportSequence({ durationSeconds: 3, fps: 2 }, host);
        expect(result.images).toHaveLength(6);
        expect(result.data.frames.map(frame => frame.startedOffsetMs)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
        expect(result.data.frames.map(frame => frame.imageIndex)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(result.data).toMatchObject({ droppedFrames: 0, elapsedMs: 2525, base64Bytes: 24, sceneModified: false });
    });
    it("drops missed slots without a catch-up burst", async () => {
        const { host } = clock(1100);
        const result = await captureViewportSequence({ durationSeconds: 3, fps: 2 }, host);
        expect(result.data.frames.map(frame => frame.sampleIndex)).toEqual([0, 3]);
        expect(result.data.frames.map(frame => frame.startedOffsetMs)).toEqual([0, 1500]);
        expect(result.data.droppedFrames).toBe(4);
    });
    it("aborts during interval waits without returning earlier images", async () => {
        const { host, revoke } = clock();
        const wait = host.wait;
        host.wait = async ms => { await wait(ms); revoke(); };
        await expect(captureViewportSequence({ durationSeconds: 3, fps: 2 }, host)).rejects.toThrow("ACCESS_REVOKED");
        expect(host.now()).toBe(125);
    });
    it("revalidates after an in-flight capture", async () => {
        const { host, revoke } = clock();
        const capture = host.capture;
        host.capture = async () => { const result = await capture(); revoke(); return result; };
        await expect(captureViewportSequence({ durationSeconds: 3, fps: 2 }, host)).rejects.toThrow("ACCESS_REVOKED");
    });
    it("bounds total response image bytes", async () => {
        const { host } = clock();
        host.capture = async () => ({ data: { frameAfter: 0 }, image: { data: "x".repeat(7 * 1024 * 1024), mimeType: "image/jpeg" } });
        await expect(captureViewportSequence({ durationSeconds: 3, fps: 2 }, host)).rejects.toMatchObject({ code: "CAPTURE_TOO_LARGE" });
    });
    it("rejects unbounded requests and applies conservative defaults", () => {
        const schema = automationTools.mmd_capture_viewport_sequence.schema;
        const target = { editorSessionId: "38b81a97-d939-4efa-8a10-aefc4ce5bdba", sceneGeneration: 1 };
        expect(schema.parse({ target })).toMatchObject({ durationSeconds: 3, fps: 2, maxEdge: 640 });
        for (const options of [{ durationSeconds: 6 }, { fps: 5 }, { durationSeconds: 5, fps: 4 }, { maxEdge: 4096 }, { filePath: "output.jpg" }]) {
            expect(schema.safeParse({ target, ...options }).success).toBe(false);
        }
    });
});
