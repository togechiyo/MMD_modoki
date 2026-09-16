// Design probe only: installed Babylon's custom-buffer declaration processing.
// This is not a WGSL parser, GPU compilation test, or application integration test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL.js";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext.js";

const tint = readFileSync(new URL("tint.wgsl", import.meta.url), "utf8");
const pulse = readFileSync(new URL("pulse.wgsl", import.meta.url), "utf8");
for (const [label, source, expectedBuffers] of [
    ["constants and hook", tint, 0],
    ["TIME custom UBO", pulse, 1],
    ["different field layout", pulse.replace("    TIME: f32,", "    LIGHT_DIRECTION: vec3f,\n    TIME: f32,"), 1],
]) {
    const processor = new WebGPUShaderProcessorWGSL();
    const context = new WebGPUShaderProcessingContext(1);
    processor.initializeShaders(context);
    // Isolate the same buffer step called by finalizeShaders; preserve author text.
    const processed = processor._processCustomBuffers(source, false);
    assert.equal(Object.keys(context.availableBuffers).length, expectedBuffers);
    assert.equal(context.leftOverUniforms.length, 0);
    assert.equal(processed.replace(/@group\(\d+\) @binding\(\d+\) /g, ""), source);
    assert.match(processed, /const MODOKI_API_VERSION: u32 = 2u;/);
    if (expectedBuffers) {
        assert.ok(context.availableBuffers.effectInputs);
        assert.equal(context.availableBuffers.EffectInputs, undefined);
        assert.match(processed, /@group\(\d+\) @binding\(\d+\) var<uniform> effectInputs: EffectInputs;/);
    }
    console.log(`PASS: ${label}`);
}
console.log("CPU declaration probe passed; this probe does not test GPU compilation or material integration.");
