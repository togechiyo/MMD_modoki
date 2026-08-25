import { TRANSLATION_CONTROL_MAX, TRANSLATION_CONTROL_MIN } from "./transform-control-limits";

export type ViewportEditMode = "model" | "camera" | "accessory";
type ViewportHandleKind = "move" | "rotate";
type ViewportHandleAxis = "x" | "y" | "z";

type Vector3Like = {
    x: number;
    y: number;
    z: number;
};

export type ViewportAxisHandleBoneEditValue = {
    position: Vector3Like;
    rotation: Vector3Like;
};

export type ViewportAxisHandleCameraEditValue = {
    target: Vector3Like;
    rotation: Vector3Like;
    distance: number;
    fov: number;
};

export type ViewportAxisHandleAccessoryEditValue = {
    position: Vector3Like;
    rotation: Vector3Like;
};

type ViewportAxisHandleEditValue =
    | ViewportAxisHandleBoneEditValue
    | ViewportAxisHandleCameraEditValue
    | ViewportAxisHandleAccessoryEditValue;

type ViewportAxisHandleOptions = {
    onPreviewBoneTransform?: (value: ViewportAxisHandleBoneEditValue) => boolean;
    onPreviewCameraTransform?: (value: ViewportAxisHandleCameraEditValue) => boolean;
    onPreviewAccessoryTransform?: (value: ViewportAxisHandleAccessoryEditValue) => boolean;
    onCommitBoneTransform: (value: ViewportAxisHandleBoneEditValue, before?: ViewportAxisHandleBoneEditValue) => boolean;
    onCommitCameraTransform: (value: ViewportAxisHandleCameraEditValue, before?: ViewportAxisHandleCameraEditValue) => boolean;
    onCommitAccessoryTransform: (
        value: ViewportAxisHandleAccessoryEditValue,
        before?: ViewportAxisHandleAccessoryEditValue,
    ) => boolean;
};

export class ViewportAxisHandleController {
    private readonly onPreviewBoneTransform: (value: ViewportAxisHandleBoneEditValue) => boolean;
    private readonly onPreviewCameraTransform: (value: ViewportAxisHandleCameraEditValue) => boolean;
    private readonly onPreviewAccessoryTransform: (value: ViewportAxisHandleAccessoryEditValue) => boolean;
    private readonly onCommitBoneTransform: (value: ViewportAxisHandleBoneEditValue, before?: ViewportAxisHandleBoneEditValue) => boolean;
    private readonly onCommitCameraTransform: (value: ViewportAxisHandleCameraEditValue, before?: ViewportAxisHandleCameraEditValue) => boolean;
    private readonly onCommitAccessoryTransform: (
        value: ViewportAxisHandleAccessoryEditValue,
        before?: ViewportAxisHandleAccessoryEditValue,
    ) => boolean;
    private mode: ViewportEditMode = "camera";
    private lastModelTransform: ViewportAxisHandleBoneEditValue | null = null;
    private lastCameraTransform: ViewportAxisHandleCameraEditValue | null = null;
    private lastAccessoryTransform: ViewportAxisHandleAccessoryEditValue | null = null;
    private handleDrag:
        | {
            pointerId: number;
            element: HTMLElement;
            mode: ViewportEditMode;
            kind: ViewportHandleKind;
            axis: ViewportHandleAxis;
            startClientY: number;
            startValue: number;
            startEditValue: ViewportAxisHandleEditValue;
            currentEditValue: ViewportAxisHandleEditValue;
            min: number;
            max: number;
            scale: number;
        }
        | null = null;
    private wheelEdit:
        | {
            element: HTMLElement;
            mode: ViewportEditMode;
            kind: ViewportHandleKind;
            axis: ViewportHandleAxis;
            startEditValue: ViewportAxisHandleEditValue;
            currentEditValue: ViewportAxisHandleEditValue;
            min: number;
            max: number;
            commitTimer: number;
        }
        | null = null;

    constructor(options: ViewportAxisHandleOptions) {
        this.onPreviewBoneTransform = options.onPreviewBoneTransform ?? (() => false);
        this.onPreviewCameraTransform = options.onPreviewCameraTransform ?? (() => false);
        this.onPreviewAccessoryTransform = options.onPreviewAccessoryTransform ?? (() => false);
        this.onCommitBoneTransform = options.onCommitBoneTransform;
        this.onCommitCameraTransform = options.onCommitCameraTransform;
        this.onCommitAccessoryTransform = options.onCommitAccessoryTransform;
        this.installHandleDragHandlers();
    }

    public applyMode(mode: ViewportEditMode): void {
        if (this.mode !== mode) this.finishWheelEdit(true);
        this.mode = mode;
    }

    public updateModelTransform(transform: { position: Vector3Like; rotation: Vector3Like } | null): void {
        if (this.handleDrag?.mode === "model" || this.wheelEdit?.mode === "model") return;
        this.lastModelTransform = transform
            ? { position: { ...transform.position }, rotation: { ...transform.rotation } }
            : null;
    }

    public updateCameraTransform(transform: { target: Vector3Like; rotation: Vector3Like; distance: number; fov: number }): void {
        if (this.handleDrag?.mode === "camera" || this.wheelEdit?.mode === "camera") return;
        this.lastCameraTransform = {
            target: { ...transform.target },
            rotation: { ...transform.rotation },
            distance: transform.distance,
            fov: transform.fov,
        };
    }

    public updateAccessoryTransform(transform: { position: Vector3Like; rotation: Vector3Like } | null): void {
        if (this.handleDrag?.mode === "accessory" || this.wheelEdit?.mode === "accessory") return;
        this.lastAccessoryTransform = transform
            ? { position: { ...transform.position }, rotation: { ...transform.rotation } }
            : null;
    }

    private installHandleDragHandlers(): void {
        for (const element of document.querySelectorAll<HTMLElement>(".viewport-axis-handle-tool")) {
            element.addEventListener("pointerdown", (event) => this.beginHandleDrag(event, element));
            element.addEventListener("wheel", (event) => this.updateHandleFromWheel(event, element), { passive: false });
        }
        window.addEventListener("pointermove", (event) => this.updateHandleDrag(event));
        window.addEventListener("pointerup", (event) => this.finishHandleDrag(event, true));
        window.addEventListener("pointercancel", (event) => this.finishHandleDrag(event, false));
    }

    private beginHandleDrag(event: PointerEvent, element: HTMLElement): void {
        if (event.button !== 0 || this.handleDrag) return;
        this.finishWheelEdit(true);
        const kind = this.parseHandleKind(element.dataset.handleKind);
        const axis = this.parseHandleAxis(element.dataset.handleAxis);
        if (!kind || !axis) return;
        const startEditValue = this.getCurrentEditValue();
        if (!startEditValue) return;
        const startValue = this.resolveAxisValue(startEditValue, kind, axis);
        if (!Number.isFinite(startValue)) return;

        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        element.classList.add("is-dragging");
        const range = this.resolveRange(kind);
        this.handleDrag = {
            pointerId: event.pointerId,
            element,
            mode: this.mode,
            kind,
            axis,
            startClientY: event.clientY,
            startValue,
            startEditValue: this.cloneEditValue(startEditValue),
            currentEditValue: this.cloneEditValue(startEditValue),
            min: range.min,
            max: range.max,
            scale: range.scale,
        };
    }

    private updateHandleDrag(event: PointerEvent): void {
        const drag = this.handleDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        const delta = drag.startClientY - event.clientY;
        const value = Math.max(drag.min, Math.min(drag.max, drag.startValue + delta * drag.scale));
        drag.currentEditValue = this.withAxisValue(drag.startEditValue, drag.kind, drag.axis, value);
        this.previewEditValue(drag.mode, drag.currentEditValue);
    }

    private finishHandleDrag(event: PointerEvent, shouldCommit: boolean): void {
        const drag = this.handleDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        this.handleDrag = null;
        drag.element.classList.remove("is-dragging");
        if (drag.element.hasPointerCapture(event.pointerId)) {
            drag.element.releasePointerCapture(event.pointerId);
        }
        if (!shouldCommit) {
            this.previewEditValue(drag.mode, drag.startEditValue);
            return;
        }
        this.commitEditValue(drag.mode, drag.currentEditValue, drag.startEditValue);
    }

    private updateHandleFromWheel(event: WheelEvent, element: HTMLElement): void {
        if (this.handleDrag || event.deltaY === 0) return;
        const kind = this.parseHandleKind(element.dataset.handleKind);
        const axis = this.parseHandleAxis(element.dataset.handleAxis);
        if (!kind || !axis) return;

        const active = this.wheelEdit;
        if (
            active
            && (active.element !== element || active.mode !== this.mode || active.kind !== kind || active.axis !== axis)
        ) {
            this.finishWheelEdit(true);
        }

        if (!this.wheelEdit) {
            const startEditValue = this.getCurrentEditValue();
            if (!startEditValue) return;
            const range = this.resolveRange(kind);
            this.wheelEdit = {
                element,
                mode: this.mode,
                kind,
                axis,
                startEditValue: this.cloneEditValue(startEditValue),
                currentEditValue: this.cloneEditValue(startEditValue),
                min: range.min,
                max: range.max,
                commitTimer: 0,
            };
        }

        event.preventDefault();
        const wheelEdit = this.wheelEdit;
        window.clearTimeout(wheelEdit.commitTimer);
        const direction = event.deltaY < 0 ? 1 : -1;
        const baseStep = wheelEdit.kind === "move" ? 0.1 : 1;
        const modifierScale = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
        const currentValue = this.resolveAxisValue(wheelEdit.currentEditValue, wheelEdit.kind, wheelEdit.axis);
        const steppedValue = Number((currentValue + direction * baseStep * modifierScale).toFixed(10));
        const nextValue = Math.max(
            wheelEdit.min,
            Math.min(wheelEdit.max, steppedValue),
        );
        const nextEditValue = this.withAxisValue(
            wheelEdit.currentEditValue,
            wheelEdit.kind,
            wheelEdit.axis,
            nextValue,
        );
        if (this.previewEditValue(wheelEdit.mode, nextEditValue)) {
            wheelEdit.currentEditValue = nextEditValue;
        }
        wheelEdit.commitTimer = window.setTimeout(() => this.finishWheelEdit(true), 180);
    }

    private finishWheelEdit(shouldCommit: boolean): void {
        const wheelEdit = this.wheelEdit;
        if (!wheelEdit) return;
        this.wheelEdit = null;
        window.clearTimeout(wheelEdit.commitTimer);
        if (!shouldCommit) {
            this.previewEditValue(wheelEdit.mode, wheelEdit.startEditValue);
            return;
        }
        this.commitEditValue(wheelEdit.mode, wheelEdit.currentEditValue, wheelEdit.startEditValue);
    }

    private commitEditValue(
        mode: ViewportEditMode,
        currentEditValue: ViewportAxisHandleEditValue,
        startEditValue: ViewportAxisHandleEditValue,
    ): void {
        if (mode === "model") {
            this.onCommitBoneTransform(
                currentEditValue as ViewportAxisHandleBoneEditValue,
                startEditValue as ViewportAxisHandleBoneEditValue,
            );
            return;
        }
        if (mode === "accessory") {
            this.onCommitAccessoryTransform(
                currentEditValue as ViewportAxisHandleAccessoryEditValue,
                startEditValue as ViewportAxisHandleAccessoryEditValue,
            );
            return;
        }
        this.onCommitCameraTransform(
            currentEditValue as ViewportAxisHandleCameraEditValue,
            startEditValue as ViewportAxisHandleCameraEditValue,
        );
    }

    private getCurrentEditValue(): ViewportAxisHandleEditValue | null {
        if (this.mode === "model") return this.lastModelTransform;
        if (this.mode === "accessory") return this.lastAccessoryTransform;
        return this.lastCameraTransform;
    }

    private previewEditValue(
        mode: ViewportEditMode,
        value: ViewportAxisHandleEditValue,
    ): boolean {
        if (mode === "model") {
            return this.onPreviewBoneTransform(value as ViewportAxisHandleBoneEditValue);
        }
        if (mode === "accessory") {
            return this.onPreviewAccessoryTransform(value as ViewportAxisHandleAccessoryEditValue);
        }
        return this.onPreviewCameraTransform(value as ViewportAxisHandleCameraEditValue);
    }

    private resolveAxisValue(
        value: ViewportAxisHandleEditValue,
        kind: ViewportHandleKind,
        axis: ViewportHandleAxis,
    ): number {
        if ("position" in value) {
            return kind === "move" ? value.position[axis] : value.rotation[axis];
        }
        return kind === "move" ? value.target[axis] : value.rotation[axis];
    }

    private withAxisValue(
        source: ViewportAxisHandleEditValue,
        kind: ViewportHandleKind,
        axis: ViewportHandleAxis,
        value: number,
    ): ViewportAxisHandleEditValue {
        const next = this.cloneEditValue(source);
        if ("position" in next) {
            if (kind === "move") next.position[axis] = value;
            else next.rotation[axis] = value;
            return next;
        }
        if (kind === "move") next.target[axis] = value;
        else next.rotation[axis] = value;
        return next;
    }

    private resolveRange(kind: ViewportHandleKind): { min: number; max: number; scale: number } {
        return kind === "move"
            ? { min: TRANSLATION_CONTROL_MIN, max: TRANSLATION_CONTROL_MAX, scale: 0.02 }
            : { min: -180, max: 180, scale: 0.2 };
    }

    private cloneEditValue<T extends ViewportAxisHandleEditValue>(value: T): T {
        if ("position" in value) {
            return {
                position: { ...value.position },
                rotation: { ...value.rotation },
            } as T;
        }
        return {
            target: { ...value.target },
            rotation: { ...value.rotation },
            distance: value.distance,
            fov: value.fov,
        } as T;
    }

    private parseHandleKind(value: string | undefined): ViewportHandleKind | null {
        return value === "move" || value === "rotate" ? value : null;
    }

    private parseHandleAxis(value: string | undefined): ViewportHandleAxis | null {
        return value === "x" || value === "y" || value === "z" ? value : null;
    }

}
