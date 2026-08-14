import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VpdReader } from "babylon-mmd/esm/Loader/Parser/vpdReader";
import { VpdLoader } from "babylon-mmd/esm/Loader/vpdLoader";
import { describe, expect, it } from "vitest";

import type { VpdExportDocument } from "../../src/export/vpd-export-document";
import { serializeVpd } from "../../src/export/vpd-serializer";

const document = (overrides: Partial<VpdExportDocument> = {}): VpdExportDocument => ({
    modelName: "テストモデル",
    bones: [{
        boneName: "センター",
        position: [1.25, 0, -2.5],
        rotation: [0, 0.25, 0, Math.sqrt(1 - 0.25 ** 2)],
    }],
    unsupportedExternalParentBoneCount: 0,
    ...overrides,
});

describe("VPD serializer", () => {
    it("writes canonical Shift-JIS text with an exact bone count and six decimals", () => {
        const result = serializeVpd(document());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const text = new TextDecoder("shift_jis").decode(result.bytes);
        expect(text).toContain("Vocaloid Pose Data file\r\n");
        expect(text).toContain("テストモデル.osm; // parent model\r\n1; // bone pose count");
        expect(text).toContain("Bone0{センター\r\n  1.250000,0.000000,-2.500000;");
        expect(text).not.toContain("-0.000000");

        const parsed = VpdReader.Parse(text);
        expect(parsed.bones["センター"].position).toEqual([1.25, 0, -2.5]);
        expect(parsed.bones["センター"].rotation[1]).toBe(0.25);
        expect(parsed.morphs).toEqual({});
    });

    it("allows a single selected bone and round-trips it through VpdLoader", () => {
        const result = serializeVpd(document());
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const buffer = result.bytes.buffer.slice(
                result.bytes.byteOffset,
                result.bytes.byteOffset + result.bytes.byteLength,
            ) as ArrayBuffer;
            const animation = new VpdLoader(scene).loadFromBuffer("pose", buffer);
            expect(animation.boneTracks).toHaveLength(0);
            expect(animation.movableBoneTracks).toHaveLength(1);
            expect(animation.movableBoneTracks[0].name).toBe("センター");
            expect(Array.from(animation.movableBoneTracks[0].frameNumbers)).toEqual([0]);
            expect(Array.from(animation.movableBoneTracks[0].positions)).toEqual([1.25, 0, -2.5]);
            expect(animation.morphTracks).toHaveLength(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("fails closed for empty, duplicate, invalid syntax, Unicode and non-normalized rotations", () => {
        const empty = serializeVpd(document({ bones: [] }));
        expect(empty.ok).toBe(false);
        if ("errors" in empty) expect(empty.errors.map((entry) => entry.code)).toContain("empty_pose");

        const duplicateBone = document().bones[0];
        const duplicate = serializeVpd(document({ bones: [duplicateBone, duplicateBone] }));
        expect(duplicate.ok).toBe(false);
        if ("errors" in duplicate) expect(duplicate.errors.map((entry) => entry.code)).toContain("duplicate_bone");

        const invalidName = serializeVpd(document({ bones: [{ ...duplicateBone, boneName: "bad{name" }] }));
        expect(invalidName.ok).toBe(false);
        if ("errors" in invalidName) expect(invalidName.errors.map((entry) => entry.code)).toContain("invalid_name");

        const unicode = serializeVpd(document({ bones: [{ ...duplicateBone, boneName: "😀" }] }));
        expect(unicode.ok).toBe(false);
        if ("errors" in unicode) expect(unicode.errors.map((entry) => entry.code)).toContain("unencodable_name");

        const rotation = serializeVpd(document({ bones: [{ ...duplicateBone, rotation: [0, 0, 0, 2] }] }));
        expect(rotation.ok).toBe(false);
        if ("errors" in rotation) expect(rotation.errors.map((entry) => entry.code)).toContain("invalid_rotation");
    });

    it("warns when selected bones are affected by an external parent", () => {
        const result = serializeVpd(document({ unsupportedExternalParentBoneCount: 1 }));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.warnings.map((entry) => entry.code)).toContain("unsupported_external_parent");
    });
});
