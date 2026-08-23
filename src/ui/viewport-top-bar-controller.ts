import { t } from "../i18n";

type ViewportEditMode = "model" | "camera";
type ViewPreset = "left" | "front" | "right" | "top" | "back" | "bottom";
type CameraToolKind = "fov" | "distance" | "pan";

type Vector3Like = {
    x: number;
    y: number;
    z: number;
};

export type ViewportTopBarCameraTransform = {
    target: Vector3Like;
    rotation: Vector3Like;
    distance: number;
    fov: number;
};

type ViewportTopBarState = {
    mode: ViewportEditMode;
    canSwitchToModel: boolean;
    perspectiveEnabled: boolean;
};

type ViewportTopBarOptions = {
    getCameraTransform: () => ViewportTopBarCameraTransform;
    onToggleMode: () => void;
    onPreviewCameraTransform: (value: ViewportTopBarCameraTransform) => boolean;
    onPreviewCameraPan: (
        before: ViewportTopBarCameraTransform,
        deltaX: number,
        deltaY: number,
    ) => ViewportTopBarCameraTransform | null;
    onCommitCameraTransform: (
        value: ViewportTopBarCameraTransform,
        before: ViewportTopBarCameraTransform,
    ) => boolean;
    onTogglePerspective: (enabled: boolean) => void;
    onViewPreset: (view: ViewPreset) => void;
};

export class ViewportTopBarController {
    private readonly modeToggleButton: HTMLButtonElement | null;
    private readonly fovButton: HTMLButtonElement | null;
    private readonly distanceButton: HTMLButtonElement | null;
    private readonly panButton: HTMLButtonElement | null;
    private readonly perspectiveButton: HTMLButtonElement | null;
    private readonly viewCubeButton: HTMLButtonElement | null;
    private readonly getCameraTransform: ViewportTopBarOptions["getCameraTransform"];
    private readonly onToggleMode: ViewportTopBarOptions["onToggleMode"];
    private readonly onPreviewCameraTransform: ViewportTopBarOptions["onPreviewCameraTransform"];
    private readonly onPreviewCameraPan: ViewportTopBarOptions["onPreviewCameraPan"];
    private readonly onCommitCameraTransform: ViewportTopBarOptions["onCommitCameraTransform"];
    private readonly onTogglePerspective: ViewportTopBarOptions["onTogglePerspective"];
    private readonly onViewPreset: ViewportTopBarOptions["onViewPreset"];
    private state: ViewportTopBarState = {
        mode: "camera",
        canSwitchToModel: false,
        perspectiveEnabled: true,
    };
    private toolDrag:
        | {
            pointerId: number;
            element: HTMLButtonElement;
            kind: CameraToolKind;
            startClientX: number;
            startClientY: number;
            before: ViewportTopBarCameraTransform;
            current: ViewportTopBarCameraTransform;
        }
        | null = null;
    private viewMenu: HTMLElement | null = null;
    private cameraPlaybackLocked = false;

    constructor(options: ViewportTopBarOptions) {
        this.getCameraTransform = options.getCameraTransform;
        this.onToggleMode = options.onToggleMode;
        this.onPreviewCameraTransform = options.onPreviewCameraTransform;
        this.onPreviewCameraPan = options.onPreviewCameraPan;
        this.onCommitCameraTransform = options.onCommitCameraTransform;
        this.onTogglePerspective = options.onTogglePerspective;
        this.onViewPreset = options.onViewPreset;

        this.modeToggleButton = document.getElementById("btn-toolbar-mode-toggle") as HTMLButtonElement | null;
        this.fovButton = document.getElementById("viewport-tool-fov") as HTMLButtonElement | null;
        this.distanceButton = document.getElementById("viewport-tool-distance") as HTMLButtonElement | null;
        this.panButton = document.getElementById("viewport-tool-pan") as HTMLButtonElement | null;
        this.perspectiveButton = document.getElementById("viewport-tool-perspective") as HTMLButtonElement | null;
        this.viewCubeButton = document.getElementById("viewport-tool-viewcube") as HTMLButtonElement | null;

        this.installEventHandlers();
        this.refreshLocale();
    }

    public refresh(state: ViewportTopBarState): void {
        this.state = { ...state };
        this.refreshModeToggle();
        this.refreshPerspectiveButton();
        this.refreshLocale();
    }

    public setCameraPlaybackLocked(locked: boolean): void {
        this.cameraPlaybackLocked = locked;
        if (locked) this.closeViewMenu(false);
        this.refreshCameraToolAvailability();
    }

    public refreshLocale(): void {
        this.setButtonTitle(this.fovButton, "viewportTopBar.fov");
        this.setButtonTitle(this.distanceButton, "viewportTopBar.distance");
        this.setButtonTitle(this.panButton, "viewportTopBar.pan");
        this.setButtonTitle(this.viewCubeButton, "viewportTopBar.viewCube");
        this.refreshModeToggle();
        this.refreshPerspectiveButton();
        this.refreshViewMenuLabels();
    }

    private installEventHandlers(): void {
        this.modeToggleButton?.addEventListener("click", () => {
            if (this.modeToggleButton?.disabled) return;
            this.onToggleMode();
        });
        this.fovButton?.addEventListener("pointerdown", (event) => this.beginToolDrag(event, "fov"));
        this.distanceButton?.addEventListener("pointerdown", (event) => this.beginToolDrag(event, "distance"));
        this.panButton?.addEventListener("pointerdown", (event) => this.beginToolDrag(event, "pan"));
        this.perspectiveButton?.addEventListener("click", () => {
            this.onTogglePerspective(!this.state.perspectiveEnabled);
        });
        this.viewCubeButton?.addEventListener("click", () => this.toggleViewMenu());
        window.addEventListener("pointermove", (event) => this.updateToolDrag(event));
        window.addEventListener("pointerup", (event) => this.finishToolDrag(event, true));
        window.addEventListener("pointercancel", (event) => this.finishToolDrag(event, false));
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape") this.closeViewMenu(true);
        });
        window.addEventListener("pointerdown", (event) => {
            if (!this.viewMenu || !this.viewCubeButton) return;
            const target = event.target as Node | null;
            if (target && (this.viewMenu.contains(target) || this.viewCubeButton.contains(target))) return;
            this.closeViewMenu(false);
        });
    }

    private beginToolDrag(event: PointerEvent, kind: CameraToolKind): void {
        if (event.button !== 0 || this.toolDrag) return;
        const element = event.currentTarget as HTMLButtonElement | null;
        if (!element || element.disabled) return;

        const before = this.cloneTransform(this.getCameraTransform());
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        element.classList.add("is-dragging");
        this.toolDrag = {
            pointerId: event.pointerId,
            element,
            kind,
            startClientX: event.clientX,
            startClientY: event.clientY,
            before,
            current: this.cloneTransform(before),
        };
    }

    private updateToolDrag(event: PointerEvent): void {
        const drag = this.toolDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        const deltaX = event.clientX - drag.startClientX;
        const deltaY = event.clientY - drag.startClientY;
        let next: ViewportTopBarCameraTransform | null;
        if (drag.kind === "pan") {
            next = this.onPreviewCameraPan(drag.before, deltaX, deltaY);
        } else {
            next = this.transformWithScalarDrag(drag.before, drag.kind, deltaY);
            this.onPreviewCameraTransform(next);
        }
        if (next) {
            drag.current = this.cloneTransform(next);
        }
    }

    private finishToolDrag(event: PointerEvent, shouldCommit: boolean): void {
        const drag = this.toolDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        this.toolDrag = null;
        drag.element.classList.remove("is-dragging");
        if (drag.element.hasPointerCapture(event.pointerId)) {
            drag.element.releasePointerCapture(event.pointerId);
        }
        if (!shouldCommit) {
            this.onPreviewCameraTransform(drag.before);
            return;
        }
        this.onCommitCameraTransform(drag.current, drag.before);
    }

    private transformWithScalarDrag(
        before: ViewportTopBarCameraTransform,
        kind: "fov" | "distance",
        deltaY: number,
    ): ViewportTopBarCameraTransform {
        const next = this.cloneTransform(before);
        if (kind === "fov") {
            next.fov = this.clamp(before.fov + deltaY * 0.12, 10, 120);
            return next;
        }
        const scale = Math.max(0.05, before.distance * 0.006);
        next.distance = this.clamp(before.distance + deltaY * scale, 0.1, 400);
        return next;
    }

    private toggleViewMenu(): void {
        if (this.viewMenu) {
            this.closeViewMenu(true);
            return;
        }
        if (!this.viewCubeButton) return;

        const menu = document.createElement("div");
        menu.className = "viewport-viewcube-menu viewport-viewcube-menu--cube";
        menu.setAttribute("role", "menu");
        menu.tabIndex = -1;
        const items: Array<{ view: ViewPreset; key: string }> = [
            { view: "top", key: "viewportTopBar.viewTop" },
            { view: "left", key: "viewportTopBar.viewLeft" },
            { view: "front", key: "viewportTopBar.viewFront" },
            { view: "right", key: "viewportTopBar.viewRight" },
            { view: "bottom", key: "viewportTopBar.viewBottom" },
            { view: "back", key: "viewportTopBar.viewBack" },
        ];
        for (const item of items) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `viewport-viewcube-menu-item viewport-viewcube-menu-item--${item.view}`;
            button.setAttribute("role", "menuitem");
            button.dataset.view = item.view;
            button.dataset.i18nKey = item.key;
            button.appendChild(this.createViewCubeFaceIcon(item.view));
            const label = document.createElement("span");
            label.className = "viewport-viewcube-menu-label";
            label.textContent = t(item.key);
            button.appendChild(label);
            button.addEventListener("click", () => {
                this.onViewPreset(item.view);
                this.closeViewMenu(true);
            });
            menu.appendChild(button);
        }

        document.body.appendChild(menu);
        this.viewMenu = menu;
        this.viewCubeButton.setAttribute("aria-expanded", "true");
        this.positionViewMenu();
        menu.focus();
    }

    private closeViewMenu(restoreFocus: boolean): void {
        if (!this.viewMenu) return;
        this.viewMenu.remove();
        this.viewMenu = null;
        this.viewCubeButton?.setAttribute("aria-expanded", "false");
        if (restoreFocus) this.viewCubeButton?.focus();
    }

    private positionViewMenu(): void {
        if (!this.viewMenu || !this.viewCubeButton) return;
        const rect = this.viewCubeButton.getBoundingClientRect();
        this.viewMenu.style.left = `${Math.max(4, Math.round(rect.right - this.viewMenu.offsetWidth))}px`;
        this.viewMenu.style.top = `${Math.round(rect.bottom + 4)}px`;
    }

    private refreshViewMenuLabels(): void {
        if (!this.viewMenu) return;
        for (const item of this.viewMenu.querySelectorAll<HTMLElement>("[data-i18n-key]")) {
            const key = item.dataset.i18nKey;
            const label = item.querySelector<HTMLElement>(".viewport-viewcube-menu-label");
            if (key && label) label.textContent = t(key);
        }
        this.positionViewMenu();
    }

    private createViewCubeFaceIcon(view: ViewPreset): SVGSVGElement {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "viewport-viewcube-face-icon");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        const activeFace = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        activeFace.setAttribute("points", this.getViewFacePoints(view));
        activeFace.setAttribute("class", "is-active-face");
        svg.appendChild(activeFace);

        for (const pathData of [
            "M4 4h16v16H4z",
            "M8 8h8v8H8z",
            "M4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4",
        ]) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            svg.appendChild(path);
        }
        return svg;
    }

    private getViewFacePoints(view: ViewPreset): string {
        switch (view) {
            case "front":
                return "4 4 20 4 20 20 4 20";
            case "back":
                return "8 8 16 8 16 16 8 16";
            case "left":
                return "4 4 8 8 8 16 4 20";
            case "right":
                return "20 4 16 8 16 16 20 20";
            case "top":
                return "4 4 20 4 16 8 8 8";
            case "bottom":
                return "4 20 8 16 16 16 20 20";
            default:
                return "8 8 16 8 16 16 8 16";
        }
    }

    private refreshModeToggle(): void {
        if (!this.modeToggleButton) return;
        const label = this.state.mode === "model" ? t("viewportBottomBar.cameraEdit") : t("viewportBottomBar.modelEdit");
        this.modeToggleButton.textContent = label;
        this.modeToggleButton.setAttribute("aria-label", label);
        this.modeToggleButton.setAttribute("aria-pressed", "true");
        this.modeToggleButton.classList.toggle("is-active", true);
        this.modeToggleButton.disabled = this.state.mode === "camera" && !this.state.canSwitchToModel;
    }

    private refreshPerspectiveButton(): void {
        if (!this.perspectiveButton) return;
        const key = this.state.perspectiveEnabled ? "viewportTopBar.perspectiveOn" : "viewportTopBar.perspectiveOff";
        const label = t(key);
        this.perspectiveButton.title = label;
        this.perspectiveButton.setAttribute("aria-label", label);
        this.perspectiveButton.setAttribute("aria-pressed", this.state.perspectiveEnabled ? "true" : "false");
        this.perspectiveButton.classList.toggle("is-off", !this.state.perspectiveEnabled);
        this.refreshCameraToolAvailability();
    }

    private refreshCameraToolAvailability(): void {
        for (const button of [
            this.fovButton,
            this.distanceButton,
            this.panButton,
            this.perspectiveButton,
            this.viewCubeButton,
        ]) {
            if (button) button.disabled = this.cameraPlaybackLocked;
        }
    }

    private setButtonTitle(button: HTMLButtonElement | null, key: string): void {
        if (!button) return;
        const label = t(key);
        button.title = label;
        button.setAttribute("aria-label", label);
    }

    private cloneTransform(value: ViewportTopBarCameraTransform): ViewportTopBarCameraTransform {
        return {
            target: { ...value.target },
            rotation: { ...value.rotation },
            distance: value.distance,
            fov: value.fov,
        };
    }

    private clamp(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) return min;
        return Math.max(min, Math.min(max, value));
    }
}
