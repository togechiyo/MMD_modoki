import { BlurPostProcess } from "@babylonjs/core/PostProcesses/blurPostProcess";
import type { BloomEffect } from "@babylonjs/core/PostProcesses/bloomEffect";
import type { ThinBloomEffect } from "@babylonjs/core/PostProcesses/thinBloomEffect";

// The largest supported width at half resolution fits this fixed sampling kernel.
// Only delta changes during playback; assigning Babylon's kernel would recompile.
export const KEYFRAMED_BLOOM_KERNEL = 129;
type Blur = { kernel: number; direction: { x: number; y: number } };

export function applyKeyframedBloomBlur(x: Blur, y: Blur, width: number, scale: number): void {
    const reach = Math.max(1, Math.min(256, Number.isFinite(width) ? width : 100));
    x.kernel = y.kernel = KEYFRAMED_BLOOM_KERNEL;
    const direction = reach * scale / KEYFRAMED_BLOOM_KERNEL;
    x.direction.x = direction; x.direction.y = 0;
    y.direction.x = 0; y.direction.y = direction;
}

export function applyClassicKeyframedBloomBlur(bloom: BloomEffect, width: number): void {
    const blurs = bloom._effects.filter((effect): effect is BlurPostProcess => effect instanceof BlurPostProcess);
    if (blurs.length !== 2) throw new Error("Unsupported Babylon bloom blur layout");
    applyKeyframedBloomBlur(blurs[0], blurs[1], width, bloom.bloomScale);
}

export function applyFrameGraphKeyframedBloomBlur(bloom: ThinBloomEffect, width: number): void {
    applyKeyframedBloomBlur(bloom._blurX, bloom._blurY, width, bloom.scale);
}
