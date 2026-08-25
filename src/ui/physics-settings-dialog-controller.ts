import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { PopupContentController } from "./popup-dialog-controller";
import { createPopupFormField, createPopupFormRange, createPopupFormValueText } from "./popup-form-helpers";

export type PhysicsSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    getRuntimeMode: () => "classic" | "wasm";
    setRuntimeMode: (mode: "classic" | "wasm") => void;
    showToast?: (message: string, type?: "info" | "error" | "success") => void;
};

export class PhysicsSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly getRuntimeMode: () => "classic" | "wasm";
    private readonly setRuntimeMode: (mode: "classic" | "wasm") => void;
    private readonly showToast?: (message: string, type?: "info" | "error" | "success") => void;

    constructor(deps: PhysicsSettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.getRuntimeMode = deps.getRuntimeMode;
        this.setRuntimeMode = deps.setRuntimeMode;
        this.showToast = deps.showToast;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const rate = document.createElement("input");
        rate.className = "popup-form-control";
        rate.type = "text";
        rate.value = `${this.mmdManager.getPhysicsSimulationRateHz()}Hz`;
        rate.readOnly = true;
        rate.disabled = !this.mmdManager.isPhysicsAvailable();
        grid.appendChild(createPopupFormField(t("dialog.physics.simulationRate"), rate));

        const maxSubSteps = document.createElement("input");
        maxSubSteps.className = "popup-form-control";
        maxSubSteps.type = "text";
        maxSubSteps.value = String(this.mmdManager.getPhysicsMaxSubSteps());
        maxSubSteps.readOnly = true;
        maxSubSteps.disabled = !this.mmdManager.isPhysicsAvailable();
        grid.appendChild(createPopupFormField(t("dialog.physics.maxSubSteps"), maxSubSteps));

        const runtime = document.createElement("select");
        runtime.className = "popup-form-control";
        [
            { value: "classic", label: t("dialog.physics.runtimeClassic") },
            { value: "wasm", label: t("dialog.physics.runtimeWasm") },
        ].forEach((item) => {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.label;
            runtime.appendChild(option);
        });
        runtime.value = this.getRuntimeMode();
        runtime.addEventListener("change", () => {
            const next = runtime.value === "wasm" ? "wasm" : "classic";
            this.setRuntimeMode(next);
            runtime.value = this.getRuntimeMode();
        });
        grid.appendChild(createPopupFormField(t("dialog.physics.runtime"), runtime));

        const bulletBackend = document.createElement("select");
        bulletBackend.className = "popup-form-control";
        [
            { value: "auto", label: t("dialog.physics.bulletBackendAuto") },
            { value: "bullet-mpr", label: t("dialog.physics.bulletBackendMpr") },
            { value: "bullet-spr", label: t("dialog.physics.bulletBackendSpr") },
        ].forEach((item) => {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.label;
            bulletBackend.appendChild(option);
        });
        bulletBackend.value = this.mmdManager.getPreferredBulletPhysicsBackend();
        bulletBackend.addEventListener("change", () => {
            const next = PhysicsSettingsDialogController.normalizeBulletBackendValue(bulletBackend.value);
            bulletBackend.disabled = true;
            void this.mmdManager.setPreferredBulletPhysicsBackend(next).then((applied) => {
                bulletBackend.value = applied;
                if (!this.mmdManager.isPreferredBulletPhysicsBackendActive()) {
                    this.showToast?.(t("dialog.physics.bulletBackendRestartRequired"), "info");
                }
            }).finally(() => {
                bulletBackend.disabled = false;
            });
        });
        grid.appendChild(createPopupFormField(t("dialog.physics.bulletBackend"), bulletBackend));

        const buffered = document.createElement("select");
        buffered.className = "popup-form-control";
        [
            { value: "on", label: t("dialog.physics.bufferedOn") },
            { value: "off", label: t("dialog.physics.bufferedOff") },
        ].forEach((item) => {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.label;
            buffered.appendChild(option);
        });
        buffered.value = this.mmdManager.getPhysicsBufferedEvaluationEnabled() ? "on" : "off";
        buffered.disabled = !this.mmdManager.isPhysicsAvailable();
        buffered.addEventListener("change", () => {
            const enabled = this.mmdManager.setPhysicsBufferedEvaluationEnabled(buffered.value === "on");
            buffered.value = enabled ? "on" : "off";
        });
        grid.appendChild(createPopupFormField(t("dialog.physics.bufferedEvaluation"), buffered));

        const fullyDampedCorrection = document.createElement("input");
        fullyDampedCorrection.type = "checkbox";
        fullyDampedCorrection.className = "popup-form-checkbox";
        fullyDampedCorrection.checked = this.mmdManager.getFullyDampedRigidBodyCorrectionEnabled();
        fullyDampedCorrection.disabled = !this.mmdManager.isPhysicsAvailable();
        grid.appendChild(createPopupFormField(t("dialog.physics.fullyDampedCorrection"), fullyDampedCorrection));

        const dampingCorrection = this.createUnitRange(
            this.mmdManager.getFullyDampedRigidBodyDampingCorrectionAmount(),
            (value) => this.mmdManager.setFullyDampedRigidBodyDampingCorrectionAmount(value),
        );
        grid.appendChild(createPopupFormField(
            t("dialog.physics.dampingCap"),
            dampingCorrection,
            "div",
        ));

        const gravityCorrection = this.createUnitRange(
            this.mmdManager.getFullyDampedRigidBodyGravityCorrectionAmount(),
            (value) => this.mmdManager.setFullyDampedRigidBodyGravityCorrectionAmount(value),
        );
        grid.appendChild(createPopupFormField(
            t("dialog.physics.gravityScale"),
            gravityCorrection,
            "div",
        ));

        const massTowardUnit = this.createUnitRange(
            this.mmdManager.getAbnormalDynamicRigidBodyMassTowardUnit(),
            (value) => this.mmdManager.setAbnormalDynamicRigidBodyMassTowardUnit(value),
        );
        grid.appendChild(createPopupFormField(
            t("dialog.physics.massScale"),
            massTowardUnit,
            "div",
        ));

        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.textContent = t("dialog.physics.fullyDampedNote");
        form.appendChild(note);

        const syncFullyDampedControls = (): void => {
            const enabled = fullyDampedCorrection.checked && this.mmdManager.isPhysicsAvailable();
            PhysicsSettingsDialogController.setRangeDisabled(dampingCorrection, !enabled);
            PhysicsSettingsDialogController.setRangeDisabled(gravityCorrection, !enabled);
            PhysicsSettingsDialogController.setRangeDisabled(massTowardUnit, !enabled);
        };
        fullyDampedCorrection.addEventListener("change", () => {
            const enabled = this.mmdManager.setFullyDampedRigidBodyCorrectionEnabled(fullyDampedCorrection.checked);
            fullyDampedCorrection.checked = enabled;
            syncFullyDampedControls();
        });
        syncFullyDampedControls();

        container.appendChild(form);
    }

    private createUnitRange(initialValue: number, applyValue: (value: number) => number): HTMLElement {
        return this.createRange(initialValue, 0, 1, 0.01, applyValue);
    }

    private createRange(
        initialValue: number,
        min: number,
        max: number,
        step: number,
        applyValue: (value: number) => number,
    ): HTMLElement {
        const input = document.createElement("input");
        input.className = "popup-form-control";
        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = PhysicsSettingsDialogController.formatUnitValue(initialValue);
        input.disabled = !this.mmdManager.isPhysicsAvailable();
        const value = createPopupFormValueText(PhysicsSettingsDialogController.formatUnitValue(input.value));
        input.addEventListener("input", () => {
            const next = applyValue(Number(input.value));
            input.value = PhysicsSettingsDialogController.formatUnitValue(next);
            value.textContent = PhysicsSettingsDialogController.formatUnitValue(next);
        });
        return createPopupFormRange(input, value);
    }

    private static setRangeDisabled(container: HTMLElement, disabled: boolean): void {
        const input = container.querySelector<HTMLInputElement>("input");
        if (input) input.disabled = disabled;
    }

    private static formatUnitValue(value: string | number): string {
        const numberValue = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(numberValue)) return "0.90";
        return numberValue.toFixed(2);
    }

    private static normalizeBulletBackendValue(value: string): "auto" | "bullet-mpr" | "bullet-spr" {
        if (value === "bullet-mpr" || value === "bullet-spr") {
            return value;
        }
        return "auto";
    }
}
