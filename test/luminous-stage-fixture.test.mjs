import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PmxReader } from "babylon-mmd/esm/Loader/Parser/pmxReader.js";
import { PNG } from "playwright-core/lib/utilsBundle";
import { createLuminousStage, validateLuminousStage, encodeLuminousStage, createPanelTexture } from "../scripts/generate-luminous-stage-fixture.mjs";

const model = createLuminousStage(), report = validateLuminousStage(model);
const parse = bytes => PmxReader.ParseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

describe("distributable luminous stage PMX", () => {
  it("reproduces the committed asset and keeps non-emitting receivers separate", async () => {
    const bytes = encodeLuminousStage(model, report);
    expect(bytes.equals(readFileSync(fileURLToPath(new URL("./fixtures/luminous-stage/luminous-stage-fixture.pmx", import.meta.url))))).toBe(true);
    const pmx = await parse(bytes);
    expect(report).toMatchObject({ vertexCount: 8781, triangleCount: 8462, materialCount: 69, luminousMaterialCount: 64, sourceTriangleCount: 3072, textureCount: 16 });
    expect(pmx.materials.filter(value => value.name.startsWith("AutoLuminous_"))).toHaveLength(64);
    expect(pmx.materials.slice(0, 5).every(value => value.textureIndex === -1)).toBe(true);
    expect(pmx.materials.every(value => value.diffuse[3] === 1 && value.flag === 0x0c)).toBe(true);
    expect(pmx.materials.reduce((sum, value) => sum + value.indexCount, 0)).toBe(pmx.indices.length);
    expect(pmx.morphs.map(value => value.name)).toEqual(["LightOff", "LightUp", "遮蔽板スライド"]);
    expect(pmx.morphs[2].indices.length).toBe(24);
    expect(pmx.rigidBodies).toHaveLength(0);
    expect(pmx.joints).toHaveLength(0);
  });

  it("preserves indices and vertex morph targets above the 16-bit boundary", async () => {
    const high = { ...model, vertices: [...model.vertices], groups: model.groups.map(value => ({ ...value, indices: [...value.indices] })), screenVertices: [65536] };
    while (high.vertices.length < 65537) high.vertices.push(model.vertices[0]);
    high.groups[0].indices[0] = 65536;
    const pmx = await parse(encodeLuminousStage(high));
    expect(pmx.indices[0]).toBe(65536);
    expect(pmx.morphs[2].indices[0]).toBe(65536);
  });

  it("rejects inverted surfaces before writing them", () => {
    const inverted = { ...model, groups: [{ ...model.groups[0], indices: [...model.groups[0].indices] }] };
    [inverted.groups[0].indices[0], inverted.groups[0].indices[1]] = [inverted.groups[0].indices[1], inverted.groups[0].indices[0]];
    expect(() => validateLuminousStage(inverted)).toThrow("Invalid winding");
    expect(() => createLuminousStage("unknown")).toThrow("Unknown stage preset");
  });

  it("ships every referenced texture locally with opaque patterned pixels", () => {
    for (const [index, texture] of model.textures.entries()) {
      const bytes = createPanelTexture(index);
      expect(bytes.equals(readFileSync(fileURLToPath(new URL(`./fixtures/luminous-stage/${texture}`, import.meta.url))))).toBe(true);
      const image = PNG.sync.read(bytes);
      expect([image.width, image.height]).toEqual([64, 64]);
      expect(image.data.filter((_, offset) => offset % 4 === 3).every(value => value === 255)).toBe(true);
      expect(new Set(image.data.filter((_, offset) => offset % 4 === 0)).size).toBeGreaterThan(10);
    }
  });
});
