import { afterEach, describe, expect, it, vi } from "vitest";
import {
    ViewportAxisHandleController,
    type ViewportAxisHandleAccessoryEditValue,
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

describe("ViewportAxisHandleController", () => {
    afterEach(() => {
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
});
