import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

// Synthetic solid colors only; no user or third-party media is needed.
export async function createMedia(page, directory, video) {
    const bytes = await page.evaluate(async ({ isVideo, moduleSource }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (!isVideo) {
            ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 64, 64);
            const blob = await new Promise(done => canvas.toBlob(done));
            return Array.from(new Uint8Array(await blob.arrayBuffer()));
        }
        const moduleUrl = URL.createObjectURL(new Blob([moduleSource], { type: "text/javascript" }));
        const { Output, BufferTarget, WebMOutputFormat, VideoSampleSource, VideoSample } = await import(moduleUrl);
        URL.revokeObjectURL(moduleUrl);
        const target = new BufferTarget();
        const output = new Output({ format: new WebMOutputFormat(), target });
        const source = new VideoSampleSource({ codec: "vp8", bitrate: 1_000_000 });
        output.addVideoTrack(source, { frameRate: 30 });
        await output.start();
        for (let frame = 0; frame < 90; frame++) {
            ctx.fillStyle = ["#ff0000", "#00ff00", "#0000ff"][Math.floor(frame / 30)];
            ctx.fillRect(0, 0, 64, 64);
            const sample = new VideoSample(canvas, { timestamp: frame / 30, duration: 1 / 30 });
            await source.add(sample); sample.close();
        }
        source.close(); await output.finalize();
        return Array.from(new Uint8Array(target.buffer));
    }, { isVideo: video, moduleSource: video ? readFileSync(resolve(root, "node_modules/mediabunny/dist/bundles/mediabunny.mjs"), "utf8") : "" });
    const file = resolve(directory, video ? "rgb.webm" : "red.png");
    await writeFile(file, Buffer.from(bytes));
    return file;
}
