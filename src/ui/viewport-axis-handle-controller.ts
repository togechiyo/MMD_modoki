export type ViewportEditMode = "model" | "camera";
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

type ViewportAxisHandleOptions = {
    onPreviewBoneTransform?: (value: ViewportAxisHandleBoneEditValue) => boolean;
    onPreviewCameraTransform?: (value: ViewportAxisHandleCameraEditValue) => boolean;
    onCommitBoneTransform: (value: ViewportAxisHandleBoneEditValue, before?: ViewportAxisHandleBoneEditValue) => boolean;
    onCommitCameraTransform: (value: ViewportAxisHandleCameraEditValue, before?: ViewportAxisHandleCameraEditValue) => boolean;
};

export class ViewportAxisHandleController {
    private readonly onPreviewBoneTransform: (value: ViewportAxisHandleBoneEditValue) => boolean;
    private readonly onPreviewCameraTransform: (value: ViewportAxisHandleCameraEditValue) => boolean;
    private readonly onCommitBoneTransform: (value: ViewportAxisHandleBoneEditValue, before?: ViewportAxisHandleBoneEditValue) => boolean;
    private readonly onCommitCameraTransform: (value: ViewportAxisHandleCameraEditValue, before?: ViewportAxisHandleCameraEditValue) => boolean;
    private mode: ViewportEditMode = "camera";
    private lastModelTransform: ViewportAxisHandleBoneEditValue | null = null;
    private lastCameraTransform: ViewportAxisHandleCameraEditValue | null = null;
    private handleDrag:
        | {
            pointerId: number;
            element: HTMLElement;
            mode: ViewportEditMode;
            kind: ViewportHandleKind;
            axis: ViewportHandleAxis;
            startClientY: number;
            startValue: number;
            startEditValue: ViewportAxisHandleBoneEditValue | ViewportAxisHandleCameraEditValue;
            currentEditValue: ViewportAxisHandleBoneEditValue | ViewportAxisHandleCameraEditValue;
            min: number;
            max: number;
            scale: number;
        }
        | null = null;

    constructor(options: ViewportAxisHandleOptions) {
        this.onPreviewBoneTransform = options.onPreviewBoneTransform ?? (() => false);
        this.onPreviewCameraTransform = options.onPreviewCameraTransform ?? (() => false);
        this.onCommitBoneTransform = options.onCommitBoneTransform;
        this.onCommitCameraTransform = options.onCommitCameraTransform;
        this.installHandleDragHandlers();
    }

    public applyMode(mode: ViewportEditMode): void {
        this.mode = mode;
    }

    public updateModelTransform(transform: { position: Vector3Like; rotation: Vector3Like } | null): void {
        if (this.handleDrag?.mode === "model") return;
        this.lastModelTransform = transform
            ? { position: { ...transform.position }, rotation: { ...transform.rotation } }
            : null;
    }

    public updateCameraTransform(transform: { target: Vector3Like; rotation: Vector3Like; distance: number; fov: number }): void {
        if (this.handleDrag?.mode === "camera") return;
        this.lastCameraTransform = {
            target: { ...transform.target },
            rotation: { ...transform.rotation },
            distance: transform.distance,
            fov: transform.fov,
        };
    }

    private installHandleDragHandlers(): void {
        for (const element of document.querySelectorAll<HTMLElement>(".viewport-axis-handle-tool")) {
            element.addEventListener("pointerdown", (event) => this.beginHandleDrag(event, element));
        }
        window.addEventListener("pointermove", (event) => this.updateHandleDrag(event));
        window.addEventListener("pointerup", (event) => this.finishHandleDrag(event, true));
        window.addEventListener("pointercancel", (event) => this.finishHandleDrag(event, false));
    }

    private beginHandleDrag(event: PointerEvent, element: HTMLElement): void {
        if (event.button !== 0 || this.handleDrag) return;
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
        if (drag.mode === "model") {
            this.onCommitBoneTransform(
                drag.currentEditValue as ViewportAxisHandleBoneEditValue,
                drag.startEditValue as ViewportAxisHandleBoneEditValue,
            );
            return;
        }
        this.onCommitCameraTransform(
            drag.currentEditValue as ViewportAxisHandleCameraEditValue,
            drag.startEditValue as ViewportAxisHandleCameraEditValue,
        );
    }

    private getCurrentEditValue(): ViewportAxisHandleBoneEditValue | ViewportAxisHandleCameraEditValue | null {
        return this.mode === "model"
            ? this.lastModelTransform
            : this.lastCameraTransform;
    }

    private previewEditValue(
        mode: ViewportEditMode,
        value: ViewportAxisHandleBoneEditValue | ViewportAxisHandleCameraEditValue,
    ): boolean {
        if (mode === "model") {
            return this.onPreviewBoneTransform(value as ViewportAxisHandleBoneEditValue);
        }
        return this.onPreviewCameraTransform(value as ViewportAxisHandleCameraEditValue);
    }

    private resolveAxisValue(
        value: ViewportAxisHandleBoneEditValue | ViewportAxisHandleCameraEditValue,
        kind: ViewportHandleKind,
        axis: ViewportHandleAxis,
    ): number {
        if ("position" in value) {
            return kind === "move" ? value.position[axis] : value.rotation[axis];
        }
        return kind === "move" ? value.target[axis] : value.rotation[axis];
    }

    private withAxisValue(
        source: ViewportAxisHandleBoneEditValue | ViewportAxisHandleCameraEditValue,
        kind: ViewportHandleKind,
        axis: ViewportHandleAxis,
        value: number,
    ): ViewportAxisHandleBoneEditValue | ViewportAxisHandleCameraEditValue {
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
            ? { min: -30, max: 30, scale: 0.02 }
            : { min: -180, max: 180, scale: 0.2 };
    }

    private cloneEditValue<T extends ViewportAxisHandleBoneEditValue | ViewportAxisHandleCameraEditValue>(value: T): T {
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
