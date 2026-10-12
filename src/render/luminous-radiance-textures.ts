import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { logWarn } from "../app-logger";

export const RADIANCE_TEXTURE_SIZE = 64;
const PIXEL_FLOATS = RADIANCE_TEXTURE_SIZE * RADIANCE_TEXTURE_SIZE * 4;
const MAX_TEXTURES = 128;

/** Small linear RGBA field; readback already has the GPU texture's UV row orientation. */
export function packRadianceTexture(pixels: Uint8Array | Uint8ClampedArray | Float32Array,
    width: number, height: number, gammaSpace: boolean): Float32Array {
    if (width < 1 || height < 1 || pixels.length < width * height * 4) throw new Error("Invalid RC texture pixels");
    const divisor = pixels instanceof Float32Array ? 1 : 255;
    const result = new Float32Array(PIXEL_FLOATS);
    for (let y = 0; y < RADIANCE_TEXTURE_SIZE; y++) for (let x = 0; x < RADIANCE_TEXTURE_SIZE; x++) {
        const offset = (y * RADIANCE_TEXTURE_SIZE + x) * 4;
        // Four stratified samples reduce aliasing when shrinking a large sign or texture atlas.
        for (const dy of [0.25, 0.75]) for (const dx of [0.25, 0.75]) {
            const sx = Math.min(width - 1, Math.floor((x + dx) * width / RADIANCE_TEXTURE_SIZE));
            const sy = Math.min(height - 1, Math.floor((y + dy) * height / RADIANCE_TEXTURE_SIZE));
            const source = (sy * width + sx) * 4;
            for (let channel = 0; channel < 4; channel++) {
                const value = Math.max(0, pixels[source + channel] / divisor);
                if (!Number.isFinite(value)) throw new Error("Invalid RC texture color");
                result[offset + channel] += (channel < 3 && gammaSpace ? value ** 2.2 : value) * 0.25;
            }
        }
    }
    return result;
}

type Entry = { index: number; ready: boolean; failed: boolean };

/** Static emission textures are read once, outside FrameGraph execution, and shared by all triangles. */
export class LuminousRadianceTextures {
    public pixels = new Float32Array(4);
    public revision = 0;
    private readonly entries = new Map<Texture, Entry>();
    private pending = Promise.resolve();
    private disposed = false;

    public get ready(): boolean { return [...this.entries.values()].every(entry => entry.ready || entry.failed); }

    public source(texture: Texture): number {
        let entry = this.entries.get(texture);
        if (!entry) {
            if (!texture.isReady()) return -2;
            if (this.entries.size >= MAX_TEXTURES) throw new Error(`3D RC supports at most ${MAX_TEXTURES} emission textures`);
            entry = { index: this.entries.size, ready: false, failed: false };
            this.entries.set(texture, entry);
            const next = new Float32Array(this.entries.size * PIXEL_FLOATS);
            next.set(this.pixels); this.pixels = next; this.revision++;
            const target = entry;
            // A microtask starts after the current graph has finished; no readback flush splits its passes.
            this.pending = this.pending.then(async () => {
                if (this.disposed) return;
                try {
                    const size = texture.getSize();
                    const pixels = await texture.readPixels();
                    if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray || pixels instanceof Float32Array)) {
                        throw new Error("Texture readback is unavailable");
                    }
                    const packed = packRadianceTexture(pixels, size.width, size.height, texture.gammaSpace);
                    if (this.disposed) return;
                    this.pixels.set(packed, target.index * PIXEL_FLOATS); target.ready = true; this.revision++;
                } catch (error) {
                    if (this.disposed) return;
                    target.failed = true;
                    logWarn("render", "RC emission texture readback failed; using material color", {
                        message: error instanceof Error ? error.message : String(error),
                    });
                }
            });
        }
        return entry.ready ? entry.index : entry.failed ? -1 : -2;
    }

    public dispose(): void { this.disposed = true; this.entries.clear(); }
}
