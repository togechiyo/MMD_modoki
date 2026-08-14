import { describe, expect, it, vi } from "vitest";

import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import {
    MmdBoneAnimationTrack,
    MmdCameraAnimationTrack,
    MmdMovableBoneAnimationTrack,
    MmdPropertyAnimationTrack,
} from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";

import {
    applyTimelineKeyframePayload,
    ensureModelAnimationForEditing,
    getActiveModelTimelineTracks,
    removeTimelineKeyframePayloads,
} from "../../src/editor/timeline-edit-service";
import type { KeyframeTrack, ModelInfo } from "../../src/types";

type TestModel = {
    name: string;
};

type TestHost = Parameters<typeof ensureModelAnimationForEditing>[0];

function createModelInfo(bones: Array<{ name: string; movable: boolean }>): ModelInfo {
    return {
        instanceId: "model-test",
        name: "test-model",
        path: "test.pmx",
        vertexCount: 0,
        boneCount: bones.length,
        boneNames: bones.map((bone) => bone.name),
        physicsBoneNames: [],
        boneControlInfos: bones.map((bone) => ({
            name: bone.name,
            movable: bone.movable,
            rotatable: true,
        })),
        morphCount: 0,
        morphNames: [],
        morphDisplayFrames: [],
    };
}

function createModelInfoWithPhysicsBones(): ModelInfo {
    return {
        instanceId: "model-physics-test",
        name: "test-model",
        path: "test.pmx",
        vertexCount: 0,
        boneCount: 2,
        boneNames: ["センター"],
        physicsBoneNames: ["スカート_0_0"],
        boneControlInfos: [
            { name: "センター", movable: true, rotatable: true },
            { name: "スカート_0_0", movable: false, rotatable: true },
        ],
        morphCount: 0,
        morphNames: [],
        morphDisplayFrames: [],
    };
}

function createAnimation(): MmdAnimation {
    return new MmdAnimation(
        "test-animation",
        [],
        [],
        [],
        new MmdPropertyAnimationTrack(0, []),
        new MmdCameraAnimationTrack(0),
    );
}

function createHost(modelInfo: ModelInfo): { host: TestHost; model: TestModel } {
    const model: TestModel = { name: "model" };
    const host = {
        currentModel: model,
        activeModelInfo: modelInfo,
        sceneModels: [{ model }],
        modelKeyframeTracksByModel: new WeakMap<TestModel, Map<string, Uint32Array>>(),
        modelSourceAnimationsByModel: new WeakMap<TestModel, MmdAnimation>(),
        cameraKeyframeFrames: new Uint32Array(0),
        cameraSourceAnimation: null,
        cameraMotionPath: null,
        timelineTarget: "model",
        mmdRuntime: {
            animationFrameTimeDuration: 1 / 30,
            seekAnimation: () => undefined,
        },
        audioPlayer: null,
        _totalFrames: 300,
        _currentFrame: 0,
        manualPlaybackWithoutAudio: false,
        manualPlaybackFrameCursor: 0,
    } satisfies TestHost;
    return { host, model };
}

describe("timeline edit service model animation tracks", () => {
    it("creates a bone track for ordinary PMX bones", () => {
        const { host, model } = createHost(createModelInfo([{ name: "左肩", movable: false }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "左肩", category: "bone" };

        expect(ensureModelAnimationForEditing(host, track)).toBe(true);

        expect(animation.boneTracks.map((candidate) => candidate.name)).toEqual(["左肩"]);
        expect(animation.movableBoneTracks.map((candidate) => candidate.name)).toEqual([]);
    });

    it("migrates a stale movable track into a normal bone track", () => {
        const { host, model } = createHost(createModelInfo([{ name: "左肩", movable: false }]));
        const animation = createAnimation();
        const staleMovableTrack = new MmdMovableBoneAnimationTrack("左肩", 2);
        staleMovableTrack.frameNumbers.set([0, 20]);
        staleMovableTrack.rotations.set([0, 0, 0, 1, 0.25, 0, 0, 0.96875]);
        staleMovableTrack.rotationInterpolations.set([20, 20, 107, 107, 30, 30, 100, 100]);
        staleMovableTrack.physicsToggles.set([1, 0]);
        (animation.movableBoneTracks as MmdMovableBoneAnimationTrack[]).push(staleMovableTrack);
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "左肩", category: "bone" };

        expect(ensureModelAnimationForEditing(host, track)).toBe(true);

        expect(animation.movableBoneTracks.map((candidate) => candidate.name)).toEqual([]);
        expect(animation.boneTracks.map((candidate) => candidate.name)).toEqual(["左肩"]);
        expect(Array.from(animation.boneTracks[0].frameNumbers)).toEqual([0, 20]);
        expect(Array.from(animation.boneTracks[0].rotations)).toEqual(Array.from(staleMovableTrack.rotations));
        expect(Array.from(animation.boneTracks[0].rotationInterpolations)).toEqual(Array.from(staleMovableTrack.rotationInterpolations));
        expect(Array.from(animation.boneTracks[0].physicsToggles)).toEqual([1, 0]);
    });

    it("keeps movable PMX bones in movable tracks", () => {
        const { host, model } = createHost(createModelInfo([{ name: "センター", movable: true }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "センター", category: "root" };

        expect(ensureModelAnimationForEditing(host, track)).toBe(true);

        expect(animation.boneTracks.map((candidate) => candidate.name)).toEqual([]);
        expect(animation.movableBoneTracks.map((candidate) => candidate.name)).toEqual(["センター"]);
    });

    it("applies movable payloads as rotation-only payloads for ordinary bones", () => {
        const { host, model } = createHost(createModelInfo([{ name: "左肩", movable: false }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "左肩", category: "bone" };

        const applied = applyTimelineKeyframePayload(host, track, 12, {
            kind: "movableBone",
            positions: [1, 2, 3],
            positionInterpolations: Array.from({ length: 12 }, () => 20),
            rotations: [0.1, 0.2, 0.3, 0.9],
            rotationInterpolations: [20, 20, 107, 107],
            physicsToggles: [1],
        });

        expect(applied).toBe(true);
        expect(animation.movableBoneTracks.map((candidate) => candidate.name)).toEqual([]);
        expect(animation.boneTracks.map((candidate) => candidate.name)).toEqual(["左肩"]);
        expect(Array.from(animation.boneTracks[0].frameNumbers)).toEqual([12]);
        expect(Array.from(animation.boneTracks[0].rotations)).toEqual([
            expect.closeTo(0.1),
            expect.closeTo(0.2),
            expect.closeTo(0.3),
            expect.closeTo(0.9),
        ]);
        expect(animation.startFrame).toBe(0);
        expect(animation.endFrame).toBe(12);
    });

    it("refreshes animation range when hand-keyed bone frames are added", () => {
        const { host, model } = createHost(createModelInfo([{ name: "右肩", movable: false }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "右肩", category: "bone" };

        expect(applyTimelineKeyframePayload(host, track, 0, {
            kind: "bone",
            rotations: [0, 0, 0, 1],
            rotationInterpolations: [20, 20, 107, 107],
            physicsToggles: [1],
        })).toBe(true);
        expect(applyTimelineKeyframePayload(host, track, 30, {
            kind: "bone",
            rotations: [0, 0.4, 0, 0.9165],
            rotationInterpolations: [20, 20, 107, 107],
            physicsToggles: [1],
        })).toBe(true);

        expect(Array.from(animation.boneTracks[0].frameNumbers)).toEqual([0, 30]);
        expect(animation.startFrame).toBe(0);
        expect(animation.endFrame).toBe(30);
    });

    it("keeps model external parent state coupled to the child bone key", () => {
        const { host, model } = createHost(createModelInfo([{ name: "センター", movable: true }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const upsertModelExternalParentKeyframe = vi.fn(() => true);
        const removeModelExternalParentKeyframes = vi.fn(() => true);
        const editableHost = Object.assign(host, {
            upsertModelExternalParentKeyframe,
            removeModelExternalParentKeyframes,
        });
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "センター", category: "root" };

        expect(applyTimelineKeyframePayload(editableHost, track, 15, {
            kind: "movableBone",
            positions: [0, 0, 0],
            positionInterpolations: Array.from({ length: 12 }, () => 20),
            rotations: [0, 0, 0, 1],
            rotationInterpolations: [20, 20, 107, 107],
            physicsToggles: [1],
            externalParent: {
                childBoneName: "センター",
                parentModelPath: "plate.pmx",
                parentBoneName: "センター",
            },
        })).toBe(true);
        expect(upsertModelExternalParentKeyframe).toHaveBeenCalledWith(15, {
            childBoneName: "センター",
            parentModelPath: "plate.pmx",
            parentBoneName: "センター",
        });

        expect(removeTimelineKeyframePayloads(editableHost, track, [15])).toBe(true);
        expect(removeModelExternalParentKeyframes).toHaveBeenCalledWith([15], "センター");
    });

    it("hides physics-only bone rows until timeline physics bone display is enabled", () => {
        const { host, model } = createHost(createModelInfoWithPhysicsBones());
        const animation = createAnimation();
        const physicsTrack = new MmdBoneAnimationTrack("スカート_0_0", 1);
        physicsTrack.frameNumbers.set([12]);
        physicsTrack.rotations.set([0, 0, 0, 1]);
        physicsTrack.rotationInterpolations.set([20, 20, 107, 107]);
        physicsTrack.physicsToggles.set([1]);
        (animation.boneTracks as MmdBoneAnimationTrack[]).push(physicsTrack);
        host.modelSourceAnimationsByModel.set(model, animation);
        host.modelKeyframeTracksByModel.set(model, new Map([
            ["bone\u001fスカート_0_0", new Uint32Array([12])],
        ]));

        expect(getActiveModelTimelineTracks(host).map((track) => track.name)).toEqual(["センター"]);

        host.showPhysicsBonesInTimeline = true;
        const tracks = getActiveModelTimelineTracks(host);
        const physicsRow = tracks.find((track) => track.name === "スカート_0_0");
        expect(physicsRow).toBeTruthy();
        expect(Array.from(physicsRow?.frames ?? [])).toEqual([12]);
        expect(Array.from(physicsRow?.physicsOnFrames ?? [])).toEqual([12]);
        expect(Array.from(physicsRow?.virtualPhysicsOnFrames ?? [])).toEqual([0]);
        expect(physicsRow?.physicsBone).toBe(true);
    });

    it("shows a PMX-visible physics bone without enabling physics-only rows", () => {
        const modelInfo = createModelInfoWithPhysicsBones();
        const visiblePhysicsBoneName = modelInfo.physicsBoneNames?.[0] ?? "";
        modelInfo.boneNames.push(visiblePhysicsBoneName);
        const { host } = createHost(modelInfo);

        expect(getActiveModelTimelineTracks(host).map((track) => track.name)).toEqual([
            modelInfo.boneNames[0],
            visiblePhysicsBoneName,
        ]);
    });

    it("marks only physics ON frames as x-marker frames", () => {
        const { host, model } = createHost(createModelInfoWithPhysicsBones());
        const animation = createAnimation();
        const physicsTrack = new MmdBoneAnimationTrack("スカート_0_0", 2);
        physicsTrack.frameNumbers.set([10, 20]);
        physicsTrack.rotations.set([0, 0, 0, 1, 0, 0, 0, 1]);
        physicsTrack.rotationInterpolations.set([20, 20, 107, 107, 20, 20, 107, 107]);
        physicsTrack.physicsToggles.set([1, 0]);
        (animation.boneTracks as MmdBoneAnimationTrack[]).push(physicsTrack);
        host.modelSourceAnimationsByModel.set(model, animation);
        host.modelKeyframeTracksByModel.set(model, new Map([
            ["bone\u001fスカート_0_0", new Uint32Array([10, 20])],
        ]));
        host.showPhysicsBonesInTimeline = true;

        const physicsRow = getActiveModelTimelineTracks(host).find((track) => track.name === "スカート_0_0");

        expect(Array.from(physicsRow?.frames ?? [])).toEqual([10, 20]);
        expect(Array.from(physicsRow?.physicsOnFrames ?? [])).toEqual([10]);
        expect(Array.from(physicsRow?.virtualPhysicsOnFrames ?? [])).toEqual([0]);
    });

    it("lets an explicit frame 0 physics OFF key override the default x-marker", () => {
        const modelInfo = createModelInfoWithPhysicsBones();
        const physicsBoneName = modelInfo.physicsBoneNames?.[0] ?? "";
        const { host, model } = createHost(modelInfo);
        const animation = createAnimation();
        const physicsTrack = new MmdBoneAnimationTrack(physicsBoneName, 2);
        physicsTrack.frameNumbers.set([0, 10]);
        physicsTrack.rotations.set([0, 0, 0, 1, 0, 0, 0, 1]);
        physicsTrack.rotationInterpolations.set([20, 20, 107, 107, 20, 20, 107, 107]);
        physicsTrack.physicsToggles.set([0, 1]);
        (animation.boneTracks as MmdBoneAnimationTrack[]).push(physicsTrack);
        host.modelSourceAnimationsByModel.set(model, animation);
        host.modelKeyframeTracksByModel.set(model, new Map([
            [`bone\u001f${physicsBoneName}`, new Uint32Array([0, 10])],
        ]));
        host.showPhysicsBonesInTimeline = true;

        const physicsRow = getActiveModelTimelineTracks(host).find((track) => track.name === physicsBoneName);

        expect(Array.from(physicsRow?.frames ?? [])).toEqual([0, 10]);
        expect(Array.from(physicsRow?.physicsOnFrames ?? [])).toEqual([10]);
        expect(Array.from(physicsRow?.virtualPhysicsOnFrames ?? [])).toEqual([]);
    });

    it("deletes non-zero physics ON and OFF keys like ordinary keyframes", () => {
        const modelInfo = createModelInfoWithPhysicsBones();
        const physicsBoneName = modelInfo.physicsBoneNames?.[0] ?? "";
        const { host, model } = createHost(modelInfo);
        const animation = createAnimation();
        const physicsTrack = new MmdBoneAnimationTrack(physicsBoneName, 2);
        physicsTrack.frameNumbers.set([10, 20]);
        physicsTrack.rotations.set([0, 0, 0, 1, 0, 0, 0, 1]);
        physicsTrack.rotationInterpolations.set([20, 20, 107, 107, 20, 20, 107, 107]);
        physicsTrack.physicsToggles.set([1, 0]);
        (animation.boneTracks as MmdBoneAnimationTrack[]).push(physicsTrack);
        host.modelSourceAnimationsByModel.set(model, animation);
        host.modelKeyframeTracksByModel.set(model, new Map([
            [`bone\u001f${physicsBoneName}`, new Uint32Array([10, 20])],
        ]));

        const track: Pick<KeyframeTrack, "name" | "category"> = { name: physicsBoneName, category: "bone" };

        expect(removeTimelineKeyframePayloads(host, track, [10, 20])).toBe(true);
        expect(Array.from(physicsTrack.frameNumbers)).toEqual([]);
        expect(Array.from(physicsTrack.physicsToggles)).toEqual([]);
        expect(Array.from(host.modelKeyframeTracksByModel.get(model)?.get(`bone\u001f${physicsBoneName}`) ?? [])).toEqual([]);
    });
});
