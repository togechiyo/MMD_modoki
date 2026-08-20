import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

type ToastType = "success" | "error" | "info";

type RuntimeFeatureUiElements = {
    btnToggleAa: HTMLButtonElement | null;
    aaToggleText: HTMLElement | null;
    btnTogglePhysics: HTMLButtonElement | null;
    physicsToggleText: HTMLElement | null;
    btnToggleShadow: HTMLButtonElement | null;
    shadowToggleText: HTMLElement | null;
    btnToggleRigidBodies: HTMLButtonElement | null;
    rigidBodiesToggleText: HTMLElement | null;
    btnToggleGi: HTMLButtonElement | null;
    giToggleText: HTMLElement | null;
    physicsGravityAccelSlider: HTMLInputElement | null;
    physicsGravityAccelValue: HTMLElement | null;
    physicsGravityDirXSlider: HTMLInputElement | null;
    physicsGravityDirXValue: HTMLElement | null;
    physicsGravityDirYSlider: HTMLInputElement | null;
    physicsGravityDirYValue: HTMLElement | null;
    physicsGravityDirZSlider: HTMLInputElement | null;
    physicsGravityDirZValue: HTMLElement | null;
    physicsSimulationRateSelect: HTMLSelectElement | null;
    physicsSimulationRateValue: HTMLElement | null;
};

export type RuntimeFeatureUiControllerDeps = {
    mmdManager: MmdManager;
    showToast: (message: string, type?: ToastType) => void;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveRuntimeFeatureUiElements(): RuntimeFeatureUiElements {
    return {
        btnToggleAa: document.getElementById("btn-toggle-aa") as HTMLButtonElement | null,
        aaToggleText: document.getElementById("aa-toggle-text"),
        btnTogglePhysics: document.getElementById("btn-toggle-physics") as HTMLButtonElement | null,
        physicsToggleText: document.getElementById("physics-toggle-text"),
        btnToggleShadow: document.getElementById("btn-toggle-shadow") as HTMLButtonElement | null,
        shadowToggleText: document.getElementById("shadow-toggle-text"),
        btnToggleRigidBodies: document.getElementById("btn-toggle-rigid-bodies") as HTMLButtonElement | null,
        rigidBodiesToggleText: document.getElementById("rigid-bodies-toggle-text"),
        btnToggleGi: document.getElementById("btn-toggle-gi") as HTMLButtonElement | null,
        giToggleText: document.getElementById("gi-toggle-text"),
        physicsGravityAccelSlider: document.getElementById("physics-gravity-accel") as HTMLInputElement | null,
        physicsGravityAccelValue: document.getElementById("physics-gravity-accel-val"),
        physicsGravityDirXSlider: document.getElementById("physics-gravity-dir-x") as HTMLInputElement | null,
        physicsGravityDirXValue: document.getElementById("physics-gravity-dir-x-val"),
        physicsGravityDirYSlider: document.getElementById("physics-gravity-dir-y") as HTMLInputElement | null,
        physicsGravityDirYValue: document.getElementById("physics-gravity-dir-y-val"),
        physicsGravityDirZSlider: document.getElementById("physics-gravity-dir-z") as HTMLInputElement | null,
        physicsGravityDirZValue: document.getElementById("physics-gravity-dir-z-val"),
        physicsSimulationRateSelect: document.getElementById("physics-step-rate") as HTMLSelectElement | null,
        physicsSimulationRateValue: document.getElementById("physics-step-rate-val"),
    };
}

export class RuntimeFeatureUiController {
    private readonly elements: RuntimeFeatureUiElements;
    private readonly mmdManager: MmdManager;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: RuntimeFeatureUiControllerDeps) {
        this.elements = resolveRuntimeFeatureUiElements();
        this.mmdManager = deps.mmdManager;
        this.showToast = deps.showToast;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupEventListeners();
        this.setupPhysicsControls();
    }

    public refresh(): void {
        this.refreshAa();
        this.refreshPhysics();
        this.refreshShadow();
        this.refreshRigidBodies();
        this.refreshGi();
    }

    public refreshAa(): void {
        if (!this.elements.btnToggleAa || !this.elements.aaToggleText) return;
        const enabled = this.mmdManager.antialiasEnabled;
        this.elements.aaToggleText.textContent = t("toolbar.aa.short");
        this.elements.btnToggleAa.setAttribute("aria-pressed", enabled ? "true" : "false");
        this.elements.btnToggleAa.classList.toggle("toggle-on", enabled);
        this.elements.btnToggleAa.title = enabled
            ? t("toolbar.aa.title.on")
            : t("toolbar.aa.title.off");
    }

    public refreshPhysics(): void {
        this.updatePhysicsToggleButton(
            this.mmdManager.getPhysicsEnabled(),
            this.mmdManager.isPhysicsAvailable()
        );
        this.refreshGravityControls();
    }

    public refreshGravityControls(): void {
        const acceleration = Math.round(this.mmdManager.getPhysicsGravityAcceleration());
        if (this.elements.physicsGravityAccelSlider) {
            this.elements.physicsGravityAccelSlider.value = String(acceleration);
            this.syncRangeNumberInput(this.elements.physicsGravityAccelSlider);
        }
        if (this.elements.physicsGravityAccelValue) {
            this.elements.physicsGravityAccelValue.textContent = String(acceleration);
        }

        const direction = this.mmdManager.getPhysicsGravityDirection();
        const values: Array<[HTMLInputElement | null, HTMLElement | null, number]> = [
            [this.elements.physicsGravityDirXSlider, this.elements.physicsGravityDirXValue, direction.x],
            [this.elements.physicsGravityDirYSlider, this.elements.physicsGravityDirYValue, direction.y],
            [this.elements.physicsGravityDirZSlider, this.elements.physicsGravityDirZValue, direction.z],
        ];
        for (const [slider, valueElement, rawValue] of values) {
            const value = Math.round(rawValue);
            if (slider) {
                slider.value = String(value);
                this.syncRangeNumberInput(slider);
            }
            if (valueElement) valueElement.textContent = String(value);
        }
    }

    public refreshShadow(): void {
        if (!this.elements.btnToggleShadow || !this.elements.shadowToggleText) return;
        const enabled = this.mmdManager.getShadowEnabled();
        this.elements.shadowToggleText.textContent = t("toolbar.shadow.short");
        this.elements.btnToggleShadow.setAttribute("aria-pressed", enabled ? "true" : "false");
        this.elements.btnToggleShadow.classList.toggle("toggle-on", enabled);
        this.elements.btnToggleShadow.title = enabled
            ? t("toolbar.shadow.title.on")
            : t("toolbar.shadow.title.off");
    }

    public refreshRigidBodies(): void {
        if (!this.elements.btnToggleRigidBodies || !this.elements.rigidBodiesToggleText) return;
        const available = this.mmdManager.isRigidBodyVisualizerAvailable();
        const active = available && this.mmdManager.isRigidBodyVisualizerEnabled();
        this.elements.rigidBodiesToggleText.textContent = t("button.rigidBodies");
        this.elements.btnToggleRigidBodies.setAttribute("aria-pressed", active ? "true" : "false");
        this.elements.btnToggleRigidBodies.classList.toggle("camera-view-btn--active", active);
        this.elements.btnToggleRigidBodies.disabled = !available;
        this.elements.btnToggleRigidBodies.title = available
            ? (active ? t("button.rigidBodies.title.on") : t("button.rigidBodies.title.off"))
            : t("button.rigidBodies.title.unavailable");
    }

    public refreshGi(): void {
        if (!this.elements.btnToggleGi || !this.elements.giToggleText) return;
        const active = this.mmdManager.isGlobalIlluminationEnabled();
        const pending = this.mmdManager.isGlobalIlluminationPending();
        this.elements.giToggleText.textContent = t("toolbar.gi.short");
        this.elements.btnToggleGi.setAttribute("aria-pressed", active || pending ? "true" : "false");
        this.elements.btnToggleGi.classList.toggle("toggle-on", active);
        this.elements.btnToggleGi.classList.toggle("toggle-loading", pending && !active);
        this.elements.btnToggleGi.title = pending && !active
            ? t("toolbar.gi.title.loading")
            : active
                ? t("toolbar.gi.title.on")
            : t("toolbar.gi.title.off");
    }

    public toggleAntialias(): void {
        this.mmdManager.antialiasEnabled = !this.mmdManager.antialiasEnabled;
        this.refreshAa();
        this.showToast(this.mmdManager.antialiasEnabled ? t("toast.aa.on") : t("toast.aa.off"), "info");
    }

    public togglePhysics(): void {
        if (!this.mmdManager.isPhysicsAvailable()) {
            this.updatePhysicsToggleButton(false, false);
            this.showToast(t("toast.physics.unavailable"), "error");
            return;
        }

        const enabled = this.mmdManager.togglePhysicsEnabled();
        this.updatePhysicsToggleButton(enabled, true);
        this.showToast(enabled ? t("toast.physics.on") : t("toast.physics.off"), "info");
    }

    public toggleShadow(): void {
        const enabled = !this.mmdManager.getShadowEnabled();
        this.mmdManager.setShadowEnabled(enabled);
        this.refreshShadow();
        this.showToast(enabled ? t("toast.shadow.on") : t("toast.shadow.off"), "info");
    }

    public toggleFloorCollision(): void {
        if (!this.mmdManager.isPhysicsFloorCollisionAvailable()) {
            this.showToast(t("toast.physics.floorCollision.unavailable"), "error");
            return;
        }

        const enabled = this.mmdManager.togglePhysicsFloorCollisionEnabled();
        this.showToast(
            enabled ? t("toast.physics.floorCollision.on") : t("toast.physics.floorCollision.off"),
            "info",
        );
    }

    public toggleRigidBodies(): void {
        if (!this.mmdManager.isRigidBodyVisualizerAvailable()) {
            this.refreshRigidBodies();
            this.showToast(t("toast.rigidBodies.unavailable"), "error");
            return;
        }

        const enabled = this.mmdManager.toggleRigidBodyVisualizerEnabled();
        this.refreshRigidBodies();
        this.showToast(enabled ? t("toast.rigidBodies.on") : t("toast.rigidBodies.off"), "info");
    }

    public toggleGlobalIllumination(): void {
        const wasEnabled = this.mmdManager.isGlobalIlluminationEnabled();
        const enabled = this.mmdManager.toggleGlobalIlluminationEnabled();
        this.refreshGi();
        this.showToast(
            this.mmdManager.isGlobalIlluminationPending()
                ? t("toast.gi.loading")
                : !wasEnabled && !enabled
                    ? t("toast.gi.unavailable")
                    : enabled
                        ? t("toast.gi.on")
                        : t("toast.gi.off"),
            "info",
        );
    }

    private setupEventListeners(): void {
        this.elements.btnToggleAa?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "runtime.toggleAntialias", source: "button" })) return;
            this.toggleAntialias();
        });

        this.elements.btnTogglePhysics?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "runtime.togglePhysics", source: "button" })) return;
            this.togglePhysics();
        });

        this.elements.btnToggleShadow?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "runtime.toggleShadow", source: "button" })) return;
            this.toggleShadow();
        });

        this.elements.btnToggleRigidBodies?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "runtime.toggleRigidBodies", source: "button" })) return;
            this.toggleRigidBodies();
        });

        this.elements.btnToggleGi?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "runtime.toggleGlobalIllumination", source: "button" })) return;
            this.toggleGlobalIllumination();
        });
    }

    private setupPhysicsControls(): void {
        const rateSelect = this.elements.physicsSimulationRateSelect;
        if (rateSelect) {
            rateSelect.value = String(this.mmdManager.getPhysicsSimulationRateHz());
            rateSelect.disabled = true;
            this.refreshPhysicsSimulationRateUi();
            rateSelect.addEventListener("change", () => {
                const next = this.mmdManager.setPhysicsSimulationRateHz(Number(rateSelect.value));
                rateSelect.value = String(next);
                this.refreshPhysicsSimulationRateUi();
            });
        }

        const accelSlider = this.elements.physicsGravityAccelSlider;
        const accelValue = this.elements.physicsGravityAccelValue;
        if (accelSlider && accelValue) {
            const initialAccel = Math.round(this.mmdManager.getPhysicsGravityAcceleration());
            accelSlider.value = String(initialAccel);
            accelValue.textContent = String(initialAccel);
            accelSlider.addEventListener("input", () => {
                const next = Number(accelSlider.value);
                this.mmdManager.setPhysicsGravityAcceleration(next);
                accelValue.textContent = String(Math.round(next));
            });
        }

        const xSlider = this.elements.physicsGravityDirXSlider;
        const xValue = this.elements.physicsGravityDirXValue;
        const ySlider = this.elements.physicsGravityDirYSlider;
        const yValue = this.elements.physicsGravityDirYValue;
        const zSlider = this.elements.physicsGravityDirZSlider;
        const zValue = this.elements.physicsGravityDirZValue;
        if (!xSlider || !xValue || !ySlider || !yValue || !zSlider || !zValue) return;

        const initialDir = this.mmdManager.getPhysicsGravityDirection();
        xSlider.value = String(Math.round(initialDir.x));
        ySlider.value = String(Math.round(initialDir.y));
        zSlider.value = String(Math.round(initialDir.z));
        xValue.textContent = String(Math.round(initialDir.x));
        yValue.textContent = String(Math.round(initialDir.y));
        zValue.textContent = String(Math.round(initialDir.z));

        const applyGravityDirection = (): void => {
            const x = Number(xSlider.value);
            const y = Number(ySlider.value);
            const z = Number(zSlider.value);
            this.mmdManager.setPhysicsGravityDirection(x, y, z);
            xValue.textContent = String(Math.round(x));
            yValue.textContent = String(Math.round(y));
            zValue.textContent = String(Math.round(z));
        };

        xSlider.addEventListener("input", applyGravityDirection);
        ySlider.addEventListener("input", applyGravityDirection);
        zSlider.addEventListener("input", applyGravityDirection);
    }

    private updatePhysicsToggleButton(enabled: boolean, available: boolean): void {
        if (!this.elements.btnTogglePhysics || !this.elements.physicsToggleText) return;
        const active = available && enabled;
        this.elements.physicsToggleText.textContent = available
            ? t("toolbar.physics.short")
            : t("toolbar.physics.naShort");
        this.elements.btnTogglePhysics.setAttribute("aria-pressed", active ? "true" : "false");
        this.elements.btnTogglePhysics.classList.toggle("toggle-on", active);
        this.elements.btnTogglePhysics.disabled = !available;
        this.elements.btnTogglePhysics.title = available
            ? (active ? t("toolbar.physics.title.on") : t("toolbar.physics.title.off"))
            : t("toolbar.physics.title.unavailable");
        if (this.elements.physicsGravityAccelSlider) {
            this.elements.physicsGravityAccelSlider.disabled = !available;
        }
        if (this.elements.physicsGravityDirXSlider) this.elements.physicsGravityDirXSlider.disabled = !available;
        if (this.elements.physicsGravityDirYSlider) this.elements.physicsGravityDirYSlider.disabled = !available;
        if (this.elements.physicsGravityDirZSlider) this.elements.physicsGravityDirZSlider.disabled = !available;
        if (this.elements.physicsSimulationRateSelect) this.elements.physicsSimulationRateSelect.disabled = true;
        this.refreshPhysicsSimulationRateUi();
    }

    private refreshPhysicsSimulationRateUi(): void {
        const rate = this.mmdManager.getPhysicsSimulationRateHz();
        if (this.elements.physicsSimulationRateSelect) {
            this.elements.physicsSimulationRateSelect.value = String(rate);
        }
        if (this.elements.physicsSimulationRateValue) {
            this.elements.physicsSimulationRateValue.textContent = `${rate}Hz`;
        }
    }
}
