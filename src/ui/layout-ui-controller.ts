import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";
import type { ExportUiController } from "./export-ui-controller";
import {
    DEFAULT_UI_SCALE_PERCENTAGE,
    parseUiScalePercentage,
    uiScalePercentageToZoomFactor,
    type UiScalePercentage,
} from "../shared/ui-scale";

type ToastType = "success" | "error" | "info";

type LayoutUiElements = {
    appRoot: HTMLElement | null;
    mainContent: HTMLElement | null;
    btnToggleShaderPanel: HTMLButtonElement | null;
    shaderPanelToggleText: HTMLElement | null;
    btnToggleFullscreenUi: HTMLButtonElement | null;
    fullscreenUiToggleText: HTMLElement | null;
    viewportContainer: HTMLElement | null;
    renderCanvas: HTMLCanvasElement | null;
    viewportTopBar: HTMLElement | null;
    viewportBottomBar: HTMLElement | null;
    timelinePanel: HTMLElement | null;
    timelineResizer: HTMLElement | null;
    shaderResizer: HTMLElement | null;
    shaderPanel: HTMLElement | null;
    bottomPanel: HTMLElement | null;
    bottomPanelResizer: HTMLElement | null;
};

export type LayoutUiControllerDeps = {
    mmdManager: MmdManager;
    exportUiController: ExportUiController;
    showToast: (message: string, type?: ToastType) => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

const MIN_TIMELINE_WIDTH = 160;
const MIN_SHADER_PANEL_WIDTH = 220;
const MIN_VIEWPORT_WIDTH = 360;
const MIN_BOTTOM_PANEL_HEIGHT = 132;
const MIN_MAIN_CONTENT_HEIGHT = 220;
const UI_SCALE_STORAGE_KEY = "mmd_modoki.uiScalePercentage";

function resolveLayoutUiElements(): LayoutUiElements {
    return {
        appRoot: document.getElementById("app") as HTMLElement | null,
        mainContent: document.getElementById("main-content"),
        btnToggleShaderPanel: document.getElementById("btn-toggle-shader-panel") as HTMLButtonElement | null,
        shaderPanelToggleText: document.getElementById("shader-panel-toggle-text"),
        btnToggleFullscreenUi: document.getElementById("btn-toggle-fullscreen-ui") as HTMLButtonElement | null,
        fullscreenUiToggleText: document.getElementById("fullscreen-ui-toggle-text"),
        viewportContainer: document.getElementById("viewport-container"),
        renderCanvas: document.getElementById("render-canvas") as HTMLCanvasElement | null,
        viewportTopBar: document.getElementById("viewport-top-bar"),
        viewportBottomBar: document.getElementById("viewport-bottom-bar"),
        timelinePanel: document.getElementById("timeline-panel"),
        timelineResizer: document.getElementById("timeline-resizer"),
        shaderResizer: document.getElementById("shader-resizer"),
        shaderPanel: document.getElementById("shader-panel"),
        bottomPanel: document.getElementById("bottom-panel"),
        bottomPanelResizer: document.getElementById("bottom-panel-resizer"),
    };
}

export class LayoutUiController {
    private readonly elements: LayoutUiElements;
    private readonly mmdManager: MmdManager;
    private readonly exportUiController: ExportUiController;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;
    private viewportAspectResizeObserver: ResizeObserver | null = null;
    private isTimelineResizing = false;
    private isShaderResizing = false;
    private isBottomPanelResizing = false;
    private isUiFullscreenActive = false;
    private uiScalePercentage: UiScalePercentage = DEFAULT_UI_SCALE_PERCENTAGE;
    private uiScaleApplyGeneration = 0;

    private readonly onWindowResize = (): void => {
        this.clampTimelineWidthToLayout();
        this.clampShaderWidthToLayout();
        this.clampBottomPanelHeightToLayout();
        this.applyViewportAspectPresentation();
        this.syncMainWindowPresentationAspect();
    };

    constructor(deps: LayoutUiControllerDeps) {
        this.elements = resolveLayoutUiElements();
        this.mmdManager = deps.mmdManager;
        this.exportUiController = deps.exportUiController;
        this.showToast = deps.showToast;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupEventListeners();
        this.setupTimelineResizer();
        this.setupShaderResizer();
        this.setupBottomPanelResizer();
        this.setupViewportAspectSync();
        window.addEventListener("resize", this.onWindowResize);
        this.uiScalePercentage = this.readStoredUiScalePercentage();
        this.applyUiScalePercentage(false);
        this.clampBottomPanelHeightToLayout();
        this.refreshLocalizedState();
        this.applyViewportAspectPresentation();
        this.syncMainWindowPresentationAspect();
    }

    public dispose(): void {
        this.viewportAspectResizeObserver?.disconnect();
        this.viewportAspectResizeObserver = null;
        window.removeEventListener("resize", this.onWindowResize);
    }

    public refreshLocalizedState(): void {
        this.updateShaderPanelToggleButton(this.isShaderPanelExpanded());
        this.updateFullscreenUiToggleButton(this.isUiFullscreenActive);
    }

    public isUiFullscreenModeActive(): boolean {
        return this.isUiFullscreenActive;
    }

    public getUiScalePercentage(): UiScalePercentage {
        return this.uiScalePercentage;
    }

    public setUiScalePercentage(percentage: UiScalePercentage): void {
        if (percentage === this.uiScalePercentage) return;
        this.uiScalePercentage = percentage;
        this.applyUiScalePercentage(true);
    }

    public toggleUiFullscreenMode(): void {
        if (this.isUiFullscreenActive) {
            this.exitUiFullscreenMode();
            return;
        }
        this.enterUiFullscreenMode();
    }

    public toggleShaderPanel(): void {
        const nextVisible = !this.isShaderPanelExpanded();
        this.setShaderPanelVisible(nextVisible);
        this.showToast(nextVisible ? t("toast.fx.shown") : t("toast.fx.hidden"), "info");
    }

    public exitUiFullscreenMode(): void {
        this.setUiFullscreenVisualState(false);
    }

    public applyViewportAspectPresentation(): void {
        if (!this.elements.renderCanvas || !this.elements.viewportContainer) return;

        const containerWidth = Math.max(1, Math.floor(this.elements.viewportContainer.clientWidth));
        const topBarHeight = this.elements.viewportTopBar && this.isElementVisible(this.elements.viewportTopBar)
            ? this.elements.viewportTopBar.getBoundingClientRect().height
            : 0;
        const bottomBarHeight = this.elements.viewportBottomBar
            && this.isElementVisible(this.elements.viewportBottomBar)
            && !this.isElementOverlay(this.elements.viewportBottomBar)
            ? this.elements.viewportBottomBar.getBoundingClientRect().height
            : 0;
        const containerHeight = Math.max(
            1,
            Math.floor(this.elements.viewportContainer.clientHeight - topBarHeight - bottomBarHeight),
        );
        const selectedAspect = this.exportUiController.getSelectedAspectPreset();
        if (selectedAspect === "viewport") {
            this.elements.renderCanvas.style.width = "100%";
            this.elements.renderCanvas.style.height = `${containerHeight}px`;
            this.mmdManager.resize();
            return;
        }

        const ratio = this.exportUiController.resolveSelectedOutputAspectRatio();
        let renderWidth = containerWidth;
        let renderHeight = Math.max(1, Math.round(renderWidth / Math.max(0.1, ratio)));
        if (renderHeight > containerHeight) {
            renderHeight = containerHeight;
            renderWidth = Math.max(1, Math.round(renderHeight * ratio));
        }

        this.elements.renderCanvas.style.width = `${renderWidth}px`;
        this.elements.renderCanvas.style.height = `${renderHeight}px`;
        this.mmdManager.resize();
    }

    public syncMainWindowPresentationAspect(): void {
        if (!this.isUiFullscreenActive) return;

        const selectedAspect = this.exportUiController.getSelectedAspectPreset();
        if (selectedAspect === "viewport") return;

        const ratio = this.exportUiController.resolveSelectedOutputAspectRatio();
        if (Math.abs(ratio - 16 / 9) > 0.001) return;

        void window.electronAPI.snapMainWindowContentAspect(ratio);
    }

    private isElementVisible(element: HTMLElement): boolean {
        return element.getClientRects().length > 0 && getComputedStyle(element).display !== "none";
    }

    private isElementOverlay(element: HTMLElement): boolean {
        const position = getComputedStyle(element).position;
        return position === "absolute" || position === "fixed";
    }

    private setupEventListeners(): void {
        this.elements.btnToggleShaderPanel?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "layout.shaderPanel.toggle", source: "button" })) return;
            this.toggleShaderPanel();
        });
        this.elements.btnToggleFullscreenUi?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "layout.fullscreen.toggle", source: "button" })) return;
            this.toggleUiFullscreenMode();
        });
    }

    private isShaderPanelExpanded(): boolean {
        return !this.elements.mainContent?.classList.contains("shader-panel-collapsed");
    }

    private setShaderPanelVisible(visible: boolean): void {
        this.elements.mainContent?.classList.toggle("shader-panel-collapsed", !visible);
        this.clampTimelineWidthToLayout();
        this.clampShaderWidthToLayout();
        this.applyViewportAspectPresentation();
        this.updateShaderPanelToggleButton(visible);
    }

    private updateShaderPanelToggleButton(visible: boolean): void {
        if (!this.elements.btnToggleShaderPanel) return;
        this.elements.btnToggleShaderPanel.setAttribute("aria-pressed", visible ? "true" : "false");
        this.elements.btnToggleShaderPanel.classList.toggle("toggle-on", visible);
        this.elements.btnToggleShaderPanel.title = visible
            ? t("toolbar.fx.title.on")
            : t("toolbar.fx.title.off");
        if (this.elements.shaderPanelToggleText) {
            this.elements.shaderPanelToggleText.textContent = t("toolbar.fx.short");
        }
    }

    private enterUiFullscreenMode(): void {
        this.setUiFullscreenVisualState(true);
        this.showToast(t("toast.ui.hidden"), "info");
    }

    private setUiFullscreenVisualState(active: boolean): void {
        this.isUiFullscreenActive = active;
        this.elements.appRoot?.classList.toggle("ui-presentation-mode", active);
        this.updateFullscreenUiToggleButton(active);
        this.syncMainWindowPresentationAspect();
    }

    private readStoredUiScalePercentage(): UiScalePercentage {
        try {
            return parseUiScalePercentage(window.localStorage.getItem(UI_SCALE_STORAGE_KEY));
        } catch (error) {
            window.electronAPI.logWarn("ui", "failed to read UI scale setting", {
                message: error instanceof Error ? error.message : String(error),
            });
            return DEFAULT_UI_SCALE_PERCENTAGE;
        }
    }

    private applyUiScalePercentage(persist: boolean): void {
        if (persist) {
            try {
                window.localStorage.setItem(UI_SCALE_STORAGE_KEY, String(this.uiScalePercentage));
            } catch (error) {
                window.electronAPI.logWarn("ui", "failed to persist UI scale setting", {
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }

        const generation = ++this.uiScaleApplyGeneration;
        const requestedPercentage = this.uiScalePercentage;
        void window.electronAPI
            .setWindowZoomFactor(uiScalePercentageToZoomFactor(requestedPercentage))
            .then((appliedZoomFactor) => {
                if (generation !== this.uiScaleApplyGeneration) return;
                this.uiScalePercentage = parseUiScalePercentage(Math.round(appliedZoomFactor * 100));
                window.dispatchEvent(new Event("resize"));
            })
            .catch((error: unknown) => {
                if (generation !== this.uiScaleApplyGeneration) return;
                window.electronAPI.logError("ui", "failed to apply UI scale setting", {
                    requestedPercentage,
                    message: error instanceof Error ? error.message : String(error),
                });
                this.showToast(t("toast.ui.scaleFailed"), "error");
            });
    }

    private updateFullscreenUiToggleButton(active: boolean): void {
        if (!this.elements.btnToggleFullscreenUi) return;
        this.elements.btnToggleFullscreenUi.setAttribute("aria-pressed", active ? "true" : "false");
        this.elements.btnToggleFullscreenUi.classList.toggle("toggle-on", active);
        this.elements.btnToggleFullscreenUi.title = active
            ? t("toolbar.ui.title.on")
            : t("toolbar.ui.title.off");
        if (this.elements.fullscreenUiToggleText) {
            this.elements.fullscreenUiToggleText.textContent = t("toolbar.ui.short");
        }
    }

    private setupTimelineResizer(): void {
        if (!this.elements.timelineResizer || !this.elements.timelinePanel) return;

        let startX = 0;
        let startWidth = 0;

        const stopResize = (): void => {
            if (!this.isTimelineResizing) return;
            this.isTimelineResizing = false;
            document.body.classList.remove("timeline-resizing");
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        };

        const onPointerMove = (event: PointerEvent): void => {
            if (!this.isTimelineResizing) return;

            const delta = event.clientX - startX;
            const maxWidth = this.computeTimelineMaxWidth();
            const nextWidth = Math.max(
                MIN_TIMELINE_WIDTH,
                Math.min(maxWidth, startWidth + delta)
            );

            document.documentElement.style.setProperty("--timeline-width", `${Math.round(nextWidth)}px`);
            this.applyViewportAspectPresentation();
        };

        const onPointerUp = (): void => {
            stopResize();
        };

        this.elements.timelineResizer.addEventListener("pointerdown", (event: PointerEvent) => {
            if (event.button !== 0) return;
            event.preventDefault();
            startX = event.clientX;
            startWidth = this.elements.timelinePanel?.getBoundingClientRect().width ?? MIN_TIMELINE_WIDTH;
            this.isTimelineResizing = true;
            document.body.classList.add("timeline-resizing");
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);
        });
    }

    private setupShaderResizer(): void {
        if (!this.elements.shaderResizer || !this.elements.shaderPanel) return;

        let startX = 0;
        let startWidth = 0;

        const stopResize = (): void => {
            if (!this.isShaderResizing) return;
            this.isShaderResizing = false;
            document.body.classList.remove("shader-resizing");
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        };

        const onPointerMove = (event: PointerEvent): void => {
            if (!this.isShaderResizing || !this.isShaderPanelExpanded()) return;

            const delta = startX - event.clientX;
            const maxWidth = this.computeShaderMaxWidth();
            const nextWidth = Math.max(
                MIN_SHADER_PANEL_WIDTH,
                Math.min(maxWidth, startWidth + delta)
            );

            document.documentElement.style.setProperty("--shader-panel-width", `${Math.round(nextWidth)}px`);
            this.applyViewportAspectPresentation();
        };

        const onPointerUp = (): void => {
            stopResize();
        };

        this.elements.shaderResizer.addEventListener("pointerdown", (event: PointerEvent) => {
            if (event.button !== 0 || !this.isShaderPanelExpanded()) return;
            event.preventDefault();
            startX = event.clientX;
            startWidth = this.elements.shaderPanel?.getBoundingClientRect().width ?? MIN_SHADER_PANEL_WIDTH;
            this.isShaderResizing = true;
            document.body.classList.add("shader-resizing");
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);
        });
    }

    private setupBottomPanelResizer(): void {
        if (!this.elements.bottomPanelResizer || !this.elements.bottomPanel) return;

        let startY = 0;
        let startHeight = 0;

        const stopResize = (): void => {
            if (!this.isBottomPanelResizing) return;
            this.isBottomPanelResizing = false;
            document.body.classList.remove("bottom-panel-resizing");
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        };

        const onPointerMove = (event: PointerEvent): void => {
            if (!this.isBottomPanelResizing) return;

            const delta = event.clientY - startY;
            const maxHeight = this.computeBottomPanelMaxHeight();
            const nextHeight = Math.max(
                MIN_BOTTOM_PANEL_HEIGHT,
                Math.min(maxHeight, startHeight - delta)
            );

            document.documentElement.style.setProperty("--bottom-panel-height", `${Math.round(nextHeight)}px`);
            this.applyViewportAspectPresentation();
        };

        const onPointerUp = (): void => {
            stopResize();
        };

        this.elements.bottomPanelResizer.addEventListener("pointerdown", (event: PointerEvent) => {
            if (event.button !== 0) return;
            event.preventDefault();
            startY = event.clientY;
            startHeight = this.elements.bottomPanel?.getBoundingClientRect().height ?? MIN_BOTTOM_PANEL_HEIGHT;
            this.isBottomPanelResizing = true;
            document.body.classList.add("bottom-panel-resizing");
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);
        });
    }

    private setupViewportAspectSync(): void {
        if (!this.elements.viewportContainer) return;
        this.viewportAspectResizeObserver = new ResizeObserver(() => {
            this.applyViewportAspectPresentation();
        });
        this.viewportAspectResizeObserver.observe(this.elements.viewportContainer);
    }

    private computeTimelineMaxWidth(): number {
        const panelWidth = this.elements.mainContent?.clientWidth ?? 0;
        const resizerWidth = this.elements.timelineResizer?.getBoundingClientRect().width ?? 6;
        const shaderResizerWidth = this.isShaderPanelExpanded()
            ? (this.elements.shaderResizer?.getBoundingClientRect().width ?? 6)
            : 0;
        const shaderWidth = this.isShaderPanelExpanded()
            ? (this.elements.shaderPanel?.getBoundingClientRect().width ?? 0)
            : 0;
        return Math.max(
            MIN_TIMELINE_WIDTH,
            panelWidth - resizerWidth - shaderResizerWidth - shaderWidth - MIN_VIEWPORT_WIDTH
        );
    }

    private clampTimelineWidthToLayout(): void {
        if (!this.elements.timelinePanel) return;
        const currentWidth = this.elements.timelinePanel.getBoundingClientRect().width;
        const maxWidth = this.computeTimelineMaxWidth();
        const nextWidth = Math.max(
            MIN_TIMELINE_WIDTH,
            Math.min(maxWidth, currentWidth)
        );
        document.documentElement.style.setProperty("--timeline-width", `${Math.round(nextWidth)}px`);
    }

    private computeShaderMaxWidth(): number {
        if (!this.isShaderPanelExpanded()) {
            return MIN_SHADER_PANEL_WIDTH;
        }
        const panelWidth = this.elements.mainContent?.clientWidth ?? 0;
        const timelineWidth = this.elements.timelinePanel?.getBoundingClientRect().width ?? MIN_TIMELINE_WIDTH;
        const timelineResizerWidth = this.elements.timelineResizer?.getBoundingClientRect().width ?? 6;
        const shaderResizerWidth = this.elements.shaderResizer?.getBoundingClientRect().width ?? 6;
        return Math.max(
            MIN_SHADER_PANEL_WIDTH,
            panelWidth - timelineWidth - timelineResizerWidth - shaderResizerWidth - MIN_VIEWPORT_WIDTH
        );
    }

    private clampShaderWidthToLayout(): void {
        if (!this.elements.shaderPanel || !this.isShaderPanelExpanded()) return;
        const currentWidth = this.elements.shaderPanel.getBoundingClientRect().width;
        const maxWidth = this.computeShaderMaxWidth();
        const nextWidth = Math.max(
            MIN_SHADER_PANEL_WIDTH,
            Math.min(maxWidth, currentWidth)
        );
        document.documentElement.style.setProperty("--shader-panel-width", `${Math.round(nextWidth)}px`);
    }

    private computeBottomPanelMaxHeight(): number {
        const appHeight = this.elements.appRoot?.clientHeight ?? 0;
        const toolbarHeight = document.getElementById("toolbar")?.getBoundingClientRect().height ?? 0;
        const resizerHeight = this.elements.bottomPanelResizer?.getBoundingClientRect().height ?? 6;
        return Math.max(
            MIN_BOTTOM_PANEL_HEIGHT,
            appHeight - toolbarHeight - resizerHeight - MIN_MAIN_CONTENT_HEIGHT
        );
    }

    private clampBottomPanelHeightToLayout(): void {
        if (!this.elements.bottomPanel) return;
        const currentHeight = this.elements.bottomPanel.getBoundingClientRect().height;
        const maxHeight = this.computeBottomPanelMaxHeight();
        const nextHeight = Math.max(
            MIN_BOTTOM_PANEL_HEIGHT,
            Math.min(maxHeight, currentHeight)
        );
        document.documentElement.style.setProperty("--bottom-panel-height", `${Math.round(nextHeight)}px`);
    }
}
