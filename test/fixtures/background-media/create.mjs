import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Synthetic solid colors only; no user or third-party media is needed.
export async function createMedia(page, directory, video) {
    const bytes = await page.evaluate(async ({ isVideo }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (!isVideo) {
            ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 64, 64);
            const blob = await new Promise(done => canvas.toBlob(done));
            return Array.from(new Uint8Array(await blob.arrayBuffer()));
        }
        // Match the application's CSP: fixture code loads from the same Vite origin.
        const { Output, BufferTarget, WebMOutputFormat, VideoSampleSource, VideoSample } =
            await import("/node_modules/mediabunny/dist/bundles/mediabunny.mjs");
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
    }, { isVideo: video });
    const file = resolve(directory, video ? "rgb.webm" : "red.png");
    await writeFile(file, Buffer.from(bytes));
    return file;
}
