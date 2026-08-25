import { afterEach, describe, expect, it, vi } from "vitest";
import {
    ViewportAxisHandleController,
    type ViewportAxisHandleAccessoryEditValue,
    type ViewportAxisHandleBoneEditValue,
} from "../../src/ui/viewport-axis-handle-controller";

type PointerListener = (event: PointerEvent) => void;

function createPointerEvent(pointerId: number, clientY: number, button = 0): PointerEvent {
    return {
        button,
        clientY,
        pointerId,
        preventDefault: vi.fn(),
    } as unknown as PointerEvent;
}

function createWheelEvent(deltaY: number, modifiers: { shiftKey?: boolean; altKey?: boolean } = {}): WheelEvent {
    return {
        deltaY,
        shiftKey: modifiers.shiftKey ?? false,
        altKey: modifiers.altKey ?? false,
        preventDefault: vi.fn(),
    } as unknown as WheelEvent;
}

describe("ViewportAxisHandleController", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("routes an accessory handle drag to the accessory without editing the camera", () => {
        const elementListeners = new Map<string, PointerListener>();
        const windowListeners = new Map<string, PointerListener>();
        const capturedPointers = new Set<number>();
        const handleElement = {
            dataset: { handleKind: "move", handleAxis: "x" },
            addEventListener: (type: string, listener: PointerListener) => elementListeners.set(type, listener),
            setPointerCapture: (pointerId: number) => capturedPointers.add(pointerId),
            hasPointerCapture: (pointerId: number) => capturedPointers.has(pointerId),
            releasePointerCapture: (pointerId: number) => capturedPointers.delete(pointerId),
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
            },
        } as unknown as HTMLElement;

        vi.stubGlobal("document", {
            querySelectorAll: () => [handleElement],
        } as unknown as Document);
        vi.stubGlobal("window", {
            addEventListener: (type: string, listener: PointerListener) => windowListeners.set(type, listener),
        } as unknown as Window);

        const previewAccessory = vi.fn(() => true);
        const commitAccessory = vi.fn(() => true);
        const previewCamera = vi.fn(() => true);
        const commitCamera = vi.fn(() => true);
        const controller = new ViewportAxisHandleController({
            onPreviewBoneTransform: vi.fn(() => true),
            onPreviewCameraTransform: previewCamera,
            onPreviewAccessoryTransform: previewAccessory,
            onCommitBoneTransform: vi.fn(() => true),
            onCommitCameraTransform: commitCamera,
            onCommitAccessoryTransform: commitAccessory,
        });
        controller.applyMode("accessory");
        controller.updateAccessoryTransform({
            position: { x: 0, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        });

        elementListeners.get("pointerdown")?.(createPointerEvent(7, 100));
        windowListeners.get("pointermove")?.(createPointerEvent(7, 50));
        windowListeners.get("pointerup")?.(createPointerEvent(7, 50));

        const expectedAfter: ViewportAxisHandleAccessoryEditValue = {
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        };
        expect(previewAccessory).toHaveBeenLastCalledWith(expectedAfter);
        expect(commitAccessory).toHaveBeenCalledWith(expectedAfter, {
            position: { x: 0, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        });
        expect(previewCamera).not.toHaveBeenCalled();
        expect(commitCamera).not.toHaveBeenCalled();
    });

    it("allows model translation drags beyond the former 30-unit limit", () => {
        const elementListeners = new Map<string, PointerListener>();
        const windowListeners = new Map<string, PointerListener>();
        const capturedPointers = new Set<number>();
        const handleElement = {
            dataset: { handleKind: "move", handleAxis: "x" },
            addEventListener: (type: string, listener: PointerListener) => elementListeners.set(type, listener),
            setPointerCapture: (pointerId: number) => capturedPointers.add(pointerId),
            hasPointerCapture: (pointerId: number) => capturedPointers.has(pointerId),
            releasePointerCapture: (pointerId: number) => capturedPointers.delete(pointerId),
            classList: { add: vi.fn(), remove: vi.fn() },
        } as unknown as HTMLElement;

        vi.stubGlobal("document", {
            querySelectorAll: () => [handleElement],
        } as unknown as Document);
        vi.stubGlobal("window", {
            addEventListener: (type: string, listener: PointerListener) => windowListeners.set(type, listener),
        } as unknown as Window);

        const previewBone = vi.fn(() => true);
        const commitBone = vi.fn(() => true);
        const controller = new ViewportAxisHandleController({
            onPreviewBoneTransform: previewBone,
            onCommitBoneTransform: commitBone,
            onCommitCameraTransform: vi.fn(() => true),
            onCommitAccessoryTransform: vi.fn(() => true),
        });
        controller.applyMode("model");
        controller.updateModelTransform({
            position: { x: 0, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        });

        elementListeners.get("pointerdown")?.(createPointerEvent(8, 2_000));
        windowListeners.get("pointermove")?.(createPointerEvent(8, 0));
        windowListeners.get("pointerup")?.(createPointerEvent(8, 0));

        const expectedAfter: ViewportAxisHandleBoneEditValue = {
            position: { x: 40, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        };
        expect(previewBone).toHaveBeenLastCalledWith(expectedAfter);
        expect(commitBone).toHaveBeenCalledWith(expectedAfter, {
            position: { x: 0, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        });
    });

    it("uses the wheel over a handle as a screen-edge-independent edit and commits one command", () => {
        vi.useFakeTimers();
        const elementListeners = new Map<string, (event: Event) => void>();
        const windowListeners = new Map<string, (event: Event) => void>();
        const handleElement = {
            dataset: { handleKind: "move", handleAxis: "x" },
            addEventListener: (type: string, listener: (event: Event) => void) => elementListeners.set(type, listener),
            classList: { add: vi.fn(), remove: vi.fn() },
        } as unknown as HTMLElement;

        vi.stubGlobal("document", {
            querySelectorAll: () => [handleElement],
        } as unknown as Document);
        vi.stubGlobal("window", {
            addEventListener: (type: string, listener: (event: Event) => void) => windowListeners.set(type, listener),
            setTimeout,
            clearTimeout,
        } as unknown as Window);

        const previewBone = vi.fn(() => true);
        const commitBone = vi.fn(() => true);
        const controller = new ViewportAxisHandleController({
            onPreviewBoneTransform: previewBone,
            onCommitBoneTransform: commitBone,
            onCommitCameraTransform: vi.fn(() => true),
            onCommitAccessoryTransform: vi.fn(() => true),
        });
        controller.applyMode("model");
        controller.updateModelTransform({
            position: { x: 31, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        });

        elementListeners.get("wheel")?.(createWheelEvent(-100));
        elementListeners.get("wheel")?.(createWheelEvent(-100));

        expect(previewBone).toHaveBeenLastCalledWith({
            position: { x: 31.2, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        });
        expect(commitBone).not.toHaveBeenCalled();

        vi.advanceTimersByTime(180);
        expect(commitBone).toHaveBeenCalledTimes(1);
        expect(commitBone).toHaveBeenCalledWith({
            position: { x: 31.2, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        }, {
            position: { x: 31, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        });
    });
});
