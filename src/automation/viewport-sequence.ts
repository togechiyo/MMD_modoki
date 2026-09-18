import { z } from "zod";
import { AutomationError } from "./diagnostics";

export const viewportSequenceOptions = {
    durationSeconds: z.number().int().min(1).max(5).default(3),
    fps: z.number().int().min(1).max(4).default(2),
    maxEdge: z.number().int().min(320).max(1280).default(640),
};
export type SequenceFrame = {
    data: Record<string, unknown>;
    image: { data: string; mimeType: "image/jpeg" };
};
type SequenceHost = {
    capture(): Promise<SequenceFrame>;
    validate(): void;
    now(): number;
    wait(ms: number): Promise<void>;
};

/** Samples wall-clock time; never seeks, pauses playback, or catches up missed slots. */
export async function captureViewportSequence(
    options: { durationSeconds: number; fps: number }, host: SequenceHost,
) {
    const started = host.now();
    const interval = 1000 / options.fps;
    const plannedFrames = options.durationSeconds * options.fps;
    const frames: Record<string, unknown>[] = [];
    const images: SequenceFrame["image"][] = [];
    let base64Bytes = 0;
    let slot = 0;
    while (slot < plannedFrames) {
        host.validate();
        const due = started + slot * interval;
        while (host.now() < due) {
            await host.wait(Math.min(100, due - host.now()));
            host.validate();
        }
        if (host.now() - due >= interval) {
            slot = Math.ceil((host.now() - started) / interval);
            continue;
        }
        const captureStarted = host.now();
        const frame = await host.capture();
        host.validate();
        base64Bytes += frame.image.data.length;
        if (base64Bytes > 12 * 1024 * 1024) throw new AutomationError("CAPTURE_TOO_LARGE");
        frames.push({ ...frame.data, imageIndex: images.length, sampleIndex: slot,
            scheduledOffsetMs: slot * interval, startedOffsetMs: captureStarted - started,
            completedOffsetMs: host.now() - started, captureMs: host.now() - captureStarted });
        images.push(frame.image);
        slot++;
    }
    host.validate();
    return { data: { source: "viewport-sequence", consistency: "observed", sceneModified: false,
        requestedDurationSeconds: options.durationSeconds, requestedFps: options.fps,
        plannedFrames, capturedFrames: images.length, droppedFrames: plannedFrames - images.length,
        elapsedMs: host.now() - started, base64Bytes, frames }, images };
}
