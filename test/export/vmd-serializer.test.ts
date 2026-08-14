import { describe, expect, it } from "vitest";
import { VmdData, VmdObject } from "babylon-mmd/esm/Loader/Parser/vmdObject";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";

import { VMD_LINEAR_BEZIER, type VmdBoneKey, type VmdExportDocument } from "../../src/export/vmd-export-document";
import { createBoneInterpolationBytes, serializeVmd } from "../../src/export/vmd-serializer";

const boneKey = (overrides: Partial<VmdBoneKey> = {}): VmdBoneKey => ({
    boneName: "センター",
    frame: 7,
    position: [1, 2, 3],
    rotation: [0, 0.25, 0, 0.96875],
    positionInterpolations: [VMD_LINEAR_BEZIER, VMD_LINEAR_BEZIER, VMD_LINEAR_BEZIER],
    rotationInterpolation: VMD_LINEAR_BEZIER,
    physicsEnabled: true,
    ...overrides,
});

describe("VMD serializer", () => {
    it("writes the canonical 64-byte bone interpolation and physics flag", () => {
        expect(Buffer.from(createBoneInterpolationBytes(boneKey())).toString("hex")).toBe(
            "14140000141414146b6b6b6b6b6b6b6b"
            + "141414141414146b6b6b6b6b6b6b6b00"
            + "1414141414146b6b6b6b6b6b6b6b0000"
            + "14141414146b6b6b6b6b6b6b6b000000",
        );
        const disabled = createBoneInterpolationBytes(boneKey({ physicsEnabled: false }));
        expect(Array.from(disabled.slice(0, 4))).toEqual([20, 20, 99, 15]);
    });

    it("writes a complete model VMD with empty camera/light/shadow sections", () => {
        const document: VmdExportDocument = {
            kind: "model",
            modelName: "テストモデル",
            boneKeys: [boneKey()],
            morphKeys: [],
            propertyKeys: [],
            unsupportedExternalParentKeyCount: 0,
        };
        const result = serializeVmd(document);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.bytes.byteLength).toBe(185);
        const view = new DataView(result.bytes.buffer);
        expect(view.getUint32(50, true)).toBe(1);
        expect(view.getUint32(165, true)).toBe(0);
        expect(view.getUint32(169, true)).toBe(0);
        expect(view.getUint32(173, true)).toBe(0);
        expect(view.getUint32(177, true)).toBe(0);
        expect(view.getUint32(181, true)).toBe(0);
        expect(VmdData.CheckedCreate(result.bytes.buffer)).not.toBeNull();
        const parsed = VmdObject.ParseFromBuffer(result.bytes.buffer);
        expect(parsed.boneKeyFrames.length).toBe(1);
        const parsedKey = parsed.boneKeyFrames.get(0);
        expect(parsedKey.boneName).toBe("センター");
        expect(parsedKey.frameNumber).toBe(7);
        expect(Array.from(parsedKey.position)).toEqual([1, 2, 3]);
        expect(Array.from(parsedKey.interpolation.slice(0, 4))).toEqual([20, 20, 0, 0]);
    });

    it("writes raw camera values, rounded FOV and perspective-on byte", () => {
        const document: VmdExportDocument = {
            kind: "camera",
            cameraKeys: [{
                frame: 12,
                distance: -45,
                position: [1, 2, 3],
                rotation: [0.1, -0.2, 0.3],
                positionInterpolations: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
                rotationInterpolation: [13, 14, 15, 16],
                distanceInterpolation: [17, 18, 19, 20],
                fov: 44.6,
                fovInterpolation: [21, 22, 23, 24],
            }],
            unsupportedExternalParentKeyCount: 0,
        };
        const result = serializeVmd(document);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.bytes.byteLength).toBe(135);
        expect(result.warnings.map((entry) => entry.code)).toContain("camera_fov_rounded");
        const view = new DataView(result.bytes.buffer);
        expect(view.getUint32(58, true)).toBe(1);
        expect(view.getFloat32(66, true)).toBe(-45);
        expect(Array.from(result.bytes.slice(94, 118))).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
        expect(view.getUint32(118, true)).toBe(45);
        expect(view.getUint8(122)).toBe(0);
        expect(view.getUint32(123, true)).toBe(0);
        expect(view.getUint32(127, true)).toBe(0);
        expect(view.getUint32(131, true)).toBe(0);
        const parsed = VmdObject.ParseFromBuffer(result.bytes.buffer);
        const parsedKey = parsed.cameraKeyFrames.get(0);
        expect(parsedKey.distance).toBe(-45);
        expect(parsedKey.fov).toBe(45);
        expect(parsedKey.perspective).toBe(false);
    });

    it("writes morph and property/IK sections with their exact variable length", () => {
        const result = serializeVmd({
            kind: "model",
            modelName: "model",
            boneKeys: [],
            morphKeys: [{ morphName: "笑い", frame: 3, weight: 0.5 }],
            propertyKeys: [{
                frame: 9,
                visible: false,
                ikStates: [{ boneName: "左足ＩＫ", enabled: true }],
            }],
            unsupportedExternalParentKeyCount: 0,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.bytes.byteLength).toBe(127);
        const view = new DataView(result.bytes.buffer);
        expect(view.getUint32(50, true)).toBe(0);
        expect(view.getUint32(54, true)).toBe(1);
        expect(view.getUint32(73, true)).toBe(3);
        expect(view.getFloat32(77, true)).toBe(0.5);
        expect(view.getUint32(81, true)).toBe(0);
        expect(view.getUint32(85, true)).toBe(0);
        expect(view.getUint32(89, true)).toBe(0);
        expect(view.getUint32(93, true)).toBe(1);
        expect(view.getUint32(97, true)).toBe(9);
        expect(view.getUint8(101)).toBe(0);
        expect(view.getUint32(102, true)).toBe(1);
        expect(view.getUint8(126)).toBe(1);
        const parsed = VmdObject.ParseFromBuffer(result.bytes.buffer);
        expect(parsed.morphKeyFrames.get(0).morphName).toBe("笑い");
        expect(parsed.propertyKeyFrames[0]).toEqual({
            frameNumber: 9,
            visible: false,
            ikStates: [["左足ＩＫ", true]],
        });
    });

    it("fails closed for invalid binding names, duplicates and empty motions", () => {
        const invalidName = serializeVmd({
            kind: "model",
            modelName: "model",
            boneKeys: [boneKey({ boneName: "😀" })],
            morphKeys: [],
            propertyKeys: [],
            unsupportedExternalParentKeyCount: 0,
        });
        expect(invalidName.ok).toBe(false);
        if ("errors" in invalidName) expect(invalidName.errors.map((entry) => entry.code)).toContain("unencodable_name");

        const duplicate = serializeVmd({
            kind: "model",
            modelName: "model",
            boneKeys: [boneKey(), boneKey()],
            morphKeys: [],
            propertyKeys: [],
            unsupportedExternalParentKeyCount: 0,
        });
        expect(duplicate.ok).toBe(false);
        if ("errors" in duplicate) expect(duplicate.errors.map((entry) => entry.code)).toContain("duplicate_key");

        const empty = serializeVmd({ kind: "camera", cameraKeys: [], unsupportedExternalParentKeyCount: 0 });
        expect(empty.ok).toBe(false);
        if ("errors" in empty) expect(empty.errors.map((entry) => entry.code)).toContain("empty_motion");
    });

    it("warns for unsupported external-parent keys without changing local data", () => {
        const result = serializeVmd({
            kind: "camera",
            cameraKeys: [{
                frame: 0,
                distance: -10,
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                positionInterpolations: [VMD_LINEAR_BEZIER, VMD_LINEAR_BEZIER, VMD_LINEAR_BEZIER],
                rotationInterpolation: VMD_LINEAR_BEZIER,
                distanceInterpolation: VMD_LINEAR_BEZIER,
                fov: 45,
                fovInterpolation: VMD_LINEAR_BEZIER,
            }],
            unsupportedExternalParentKeyCount: 2,
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.warnings.map((entry) => entry.code)).toContain("unsupported_external_parent");
    });

    it("round-trips model and camera semantics through VmdLoader", async () => {
        const modelResult = serializeVmd({
            kind: "model",
            modelName: "model",
            boneKeys: [boneKey({ physicsEnabled: false })],
            morphKeys: [{ morphName: "笑い", frame: 3, weight: 0.5 }],
            propertyKeys: [{ frame: 9, visible: false, ikStates: [{ boneName: "左足ＩＫ", enabled: true }] }],
            unsupportedExternalParentKeyCount: 0,
        });
        const cameraResult = serializeVmd({
            kind: "camera",
            cameraKeys: [{
                frame: 12,
                distance: -45,
                position: [1, 2, 3],
                rotation: [0.1, -0.2, 0.3],
                positionInterpolations: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
                rotationInterpolation: [13, 14, 15, 16],
                distanceInterpolation: [17, 18, 19, 20],
                fov: 45,
                fovInterpolation: [21, 22, 23, 24],
            }],
            unsupportedExternalParentKeyCount: 0,
        });
        expect(modelResult.ok && cameraResult.ok).toBe(true);
        if (!modelResult.ok || !cameraResult.ok) return;

        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const loader = new VmdLoader(scene);
            loader.optimizeEmptyTracks = false;
            const [modelAnimation, cameraAnimation] = await Promise.all([
                loader.loadFromBufferAsync("model", modelResult.bytes.buffer),
                loader.loadFromBufferAsync("camera", cameraResult.bytes.buffer),
            ]);
            const loadedBone = modelAnimation.movableBoneTracks.find((track) => track.name === "センター");
            expect(loadedBone).toBeDefined();
            expect(Array.from(loadedBone?.frameNumbers ?? [])).toEqual([7]);
            expect(Array.from(loadedBone?.positionInterpolations ?? []).slice(0, 4)).toEqual([20, 107, 20, 107]);
            expect(Array.from(loadedBone?.physicsToggles ?? [])).toEqual([0]);
            expect(modelAnimation.morphTracks[0].name).toBe("笑い");
            expect(modelAnimation.morphTracks[0].weights[0]).toBe(0.5);
            expect(modelAnimation.propertyTrack.visibles[0]).toBe(0);
            expect(modelAnimation.propertyTrack.ikBoneNames).toEqual(["左足ＩＫ"]);
            expect(modelAnimation.propertyTrack.getIkState(0)[0]).toBe(1);

            expect(Array.from(cameraAnimation.cameraTrack.frameNumbers)).toEqual([12]);
            expect(cameraAnimation.cameraTrack.distances[0]).toBe(-45);
            expect(Array.from(cameraAnimation.cameraTrack.positionInterpolations.slice(0, 4))).toEqual([1, 2, 3, 4]);
            expect(cameraAnimation.cameraTrack.fovs[0]).toBe(45);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
