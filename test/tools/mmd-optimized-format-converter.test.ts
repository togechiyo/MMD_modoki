import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { BvmdLoader } from "babylon-mmd/esm/Loader/Optimized/bvmdLoader";
import { describe, expect, it } from "vitest";

import { VMD_LINEAR_BEZIER } from "../../src/export/vmd-export-document";
import { serializeVmd } from "../../src/export/vmd-serializer";
import { convertVmdBytesToBvmd } from "../../src/tools/mmd-optimized-format-converter";

describe("optimized MMD format converter", () => {
    it("converts VMD to BVMD 3.0 and preserves multilingual track names", async () => {
        const serialized = serializeVmd({
            kind: "model",
            modelName: "テストモデル",
            boneKeys: [{
                boneName: "センター",
                frame: 7,
                position: [1, 2, 3],
                rotation: [0, 0.25, 0, 0.96875],
                positionInterpolations: [VMD_LINEAR_BEZIER, VMD_LINEAR_BEZIER, VMD_LINEAR_BEZIER],
                rotationInterpolation: VMD_LINEAR_BEZIER,
                physicsEnabled: true,
            }],
            morphKeys: [{ morphName: "笑い", frame: 3, weight: 0.5 }],
            propertyKeys: [],
            unsupportedExternalParentKeyCount: 0,
        });
        expect(serialized.ok).toBe(true);
        if (!serialized.ok) return;

        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const converted = await convertVmdBytesToBvmd(scene, "日本語モーション.vmd", serialized.bytes);
            expect(new TextDecoder().decode(converted.slice(0, 4))).toBe("BVMD");
            expect(Array.from(converted.slice(4, 7))).toEqual([3, 0, 0]);

            const animation = new BvmdLoader(scene).loadFromBuffer("converted", converted.buffer);
            expect(animation.movableBoneTracks.map((track) => track.name)).toContain("センター");
            expect(animation.morphTracks.map((track) => track.name)).toContain("笑い");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
