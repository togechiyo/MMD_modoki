import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";
import type { BackgroundDisplayMode } from "../shared/background-display-mode";

type ToastType = "success" | "error" | "info";

type SceneEnvironmentUiElements = {
    btnToggleGround: HTMLElement | null;
    groundToggleText: HTMLElement | null;
    btnToggleBackground: HTMLElement | null;
    backgroundToggleText: HTMLElement | null;
    btnToggleSkydome: HTMLElement | null;
    skydomeToggleText: HTMLElement | null;
};

export type SceneEnvironmentUiControllerDeps = {
    mmdManager: MmdManager;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveSceneEnvironmentUiElements(): SceneEnvironmentUiElements {
    return {
        btnToggleGround: document.getElementById("btn-toggle-ground"),
        groundToggleText: document.getElementById("ground-toggle-text"),
        btnToggleBackground: document.getElementById("btn-toggle-background"),
        backgroundToggleText: document.getElementById("background-toggle-text"),
        btnToggleSkydome: document.getElementById("btn-toggle-skydome"),
        skydomeToggleText: document.getElementById("skydome-toggle-text"),
    };
}

function getBaseNameForRenderer(filePath: string): string {
    const normalized = filePath.replace(/[\\/]+$/, "");
    const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
    if (index < 0) return normalized;
    return normalized.slice(index + 1);
}

export class SceneEnvironmentUiController {
    private readonly elements: SceneEnvironmentUiElements;
    private readonly mmdManager: MmdManager;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: SceneEnvironmentUiControllerDeps) {
        this.elements = resolveSceneEnvironmentUiElements();
        this.mmdManager = deps.mmdManager;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupEventListeners();
    }

    public refresh(): void {
        this.updateGroundToggleButton(this.mmdManager.isGroundVisible());
        this.updateBackgroundToggleButton();
        this.updateSkydomeToggleButton(this.mmdManager.isSkydomeVisible());
    }

    public toggleGround(): void {
        const visible = this.mmdManager.toggleGroundVisible();
        this.updateGroundToggleButton(visible);
        this.showToast(visible ? t("toast.ground.on") : t("toast.ground.off"), "info");
    }

    public toggleBackgroundBlack(): void {
        const enabled = this.mmdManager.toggleBackgroundBlack();
        this.showToast(
            enabled ? t("toast.background.black") : t("toast.background.default"),
            "info"
        );
    }

    public setBackgroundDisplayMode(mode: BackgroundDisplayMode): void {
        const applied = this.mmdManager.setBackgroundDisplayMode(mode);
        const toastKey = applied === "white"
            ? "toast.background.white"
            : applied === "black"
                ? "toast.background.black"
                : applied === "checker"
                    ? "toast.background.checker"
                    : "toast.background.default";
        this.showToast(t(toastKey), "info");
    }

    public toggleBackgroundMedia(): void {
        const visible = this.mmdManager.toggleBackgroundMediaVisible();
        this.updateBackgroundToggleButton();
        this.showToast(visible ? t("toast.backgroundMedia.on") : t("toast.backgroundMedia.off"), "info");
    }

    public toggleSkydome(): void {
        const visible = this.mmdManager.toggleSkydomeVisible();
        this.updateSkydomeToggleButton(visible);
        this.showToast(visible ? t("toast.sky.on") : t("toast.sky.off"), "info");
    }

    public async applyBackgroundImage(filePath: string): Promise<void> {
        this.setStatus("Loading background image...", true);
        try {
            await this.mmdManager.setBackgroundImageFromPath(filePath);
            this.updateBackgroundToggleButton();
            this.updateSkydomeToggleButton(this.mmdManager.isSkydomeVisible());
            this.setStatus("Background image loaded", false);
            this.showToast(`${t("toast.backgroundImage.loaded")}: ${getBaseNameForRenderer(filePath)}`, "success");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.setStatus("Background image load failed", false);
            this.showToast(`${t("toast.backgroundImage.failed")}: ${message}`, "error");
        }
    }

    public async applyBackgroundVideo(filePath: string): Promise<void> {
        this.setStatus("Loading background video...", true);
        try {
            await this.mmdManager.setBackgroundVideoFromPath(filePath);
            this.updateBackgroundToggleButton();
            this.updateSkydomeToggleButton(this.mmdManager.isSkydomeVisible());
            this.setStatus("Background video loaded", false);
            this.showToast(`${t("toast.backgroundVideo.loaded")}: ${getBaseNameForRenderer(filePath)}`, "success");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.setStatus("Background video load failed", false);
            this.showToast(`${t("toast.backgroundVideo.failed")}: ${message}`, "error");
        }
    }

    private setupEventListeners(): void {
        this.elements.btnToggleGround?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "viewport.toggleGround", source: "button" })) return;
            this.toggleGround();
        });
        this.elements.btnToggleBackground?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "viewport.toggleBackgroundMedia", source: "button" })) return;
            this.toggleBackgroundMedia();
        });
        this.elements.btnToggleSkydome?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "viewport.toggleSkydome", source: "button" })) return;
            this.toggleSkydome();
        });
    }

    private updateGroundToggleButton(visible: boolean): void {
        if (!this.elements.btnToggleGround || !this.elements.groundToggleText) return;
        this.elements.groundToggleText.textContent = t("toolbar.ground.short");
        this.elements.btnToggleGround.setAttribute("aria-pressed", visible ? "true" : "false");
        this.elements.btnToggleGround.classList.toggle("toggle-on", visible);
        this.elements.btnToggleGround.title = visible
            ? t("toolbar.ground.title.on")
            : t("toolbar.ground.title.off");
    }

    private updateBackgroundToggleButton(): void {
        if (!this.elements.btnToggleBackground || !this.elements.backgroundToggleText) return;
        const hasBackground = this.mmdManager.hasBackgroundMedia();
        const visible = this.mmdManager.isBackgroundMediaVisible();
        this.elements.backgroundToggleText.textContent = t("toolbar.background.short");
        this.elements.btnToggleBackground.setAttribute("aria-pressed", visible ? "true" : "false");
        this.elements.btnToggleBackground.classList.toggle("toggle-on", visible);
        if (this.elements.btnToggleBackground instanceof HTMLButtonElement) {
            this.elements.btnToggleBackground.disabled = !hasBackground;
        }
        this.elements.btnToggleBackground.title = hasBackground
            ? (visible ? t("toolbar.background.title.on") : t("toolbar.background.title.off"))
            : t("toolbar.background.title.unavailable");
    }

    private updateSkydomeToggleButton(visible: boolean): void {
        if (!this.elements.btnToggleSkydome || !this.elements.skydomeToggleText) return;
        this.elements.skydomeToggleText.textContent = t("toolbar.sky.short");
        this.elements.btnToggleSkydome.setAttribute("aria-pressed", visible ? "true" : "false");
        this.elements.btnToggleSkydome.classList.toggle("toggle-on", visible);
        this.elements.btnToggleSkydome.title = visible
            ? t("toolbar.sky.title.on")
            : t("toolbar.sky.title.off");
    }
}
