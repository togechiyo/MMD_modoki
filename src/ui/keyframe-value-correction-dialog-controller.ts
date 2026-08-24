import { t } from "../i18n";
import {
    createIdentityKeyframeValueCorrection,
    isKeyframeValueCorrectionIdentity,
    type KeyframeValueCorrection,
    type KeyframeValueCorrectionKind,
    type KeyframeValueCorrectionPreview,
    type ScalarKeyframeCorrection,
} from "../editor/keyframe-value-correction";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormButton,
    createPopupFormButtonRow,
    createPopupFormField,
    createPopupFormInline,
} from "./popup-form-helpers";

type CorrectionChannel = {
    id: string;
    label: string;
    value: ScalarKeyframeCorrection;
};

export type KeyframeValueCorrectionDialogControllerDeps = {
    kind: KeyframeValueCorrectionKind;
    dispatchAction: (action: EditorAction) => boolean;
    previewCorrection: (correction: KeyframeValueCorrection) => KeyframeValueCorrectionPreview;
    close: () => void;
};

function createNumberInput(value: number, ariaLabel: string): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "popup-form-control popup-form-number";
    input.step = "0.01";
    input.value = String(value);
    input.setAttribute("aria-label", ariaLabel);
    return input;
}

function getChannels(correction: KeyframeValueCorrection): CorrectionChannel[] {
    switch (correction.kind) {
        case "bone":
            return [
                { id: "position-x", label: t("dialog.keyCorrection.channel.positionX"), value: correction.position.x },
                { id: "position-y", label: t("dialog.keyCorrection.channel.positionY"), value: correction.position.y },
                { id: "position-z", label: t("dialog.keyCorrection.channel.positionZ"), value: correction.position.z },
                { id: "rotation-x", label: t("dialog.keyCorrection.channel.rotationX"), value: correction.rotation.x },
                { id: "rotation-y", label: t("dialog.keyCorrection.channel.rotationY"), value: correction.rotation.y },
                { id: "rotation-z", label: t("dialog.keyCorrection.channel.rotationZ"), value: correction.rotation.z },
            ];
        case "camera":
            return [
                { id: "center-x", label: t("dialog.keyCorrection.channel.centerX"), value: correction.center.x },
                { id: "center-y", label: t("dialog.keyCorrection.channel.centerY"), value: correction.center.y },
                { id: "center-z", label: t("dialog.keyCorrection.channel.centerZ"), value: correction.center.z },
                { id: "rotation-x", label: t("dialog.keyCorrection.channel.rotationX"), value: correction.rotation.x },
                { id: "rotation-y", label: t("dialog.keyCorrection.channel.rotationY"), value: correction.rotation.y },
                { id: "rotation-z", label: t("dialog.keyCorrection.channel.rotationZ"), value: correction.rotation.z },
                { id: "distance", label: t("dialog.keyCorrection.channel.distance"), value: correction.distance },
                { id: "fov", label: t("dialog.keyCorrection.channel.fov"), value: correction.fov },
            ];
        case "morph":
            return [
                { id: "weight", label: t("dialog.keyCorrection.channel.weight"), value: correction.weight },
            ];
    }
}

function formatValue(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return "-";
    return Number(value.toFixed(4)).toString();
}

export class KeyframeValueCorrectionDialogController implements PopupContentController {
    private readonly kind: KeyframeValueCorrectionKind;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly previewCorrection: (correction: KeyframeValueCorrection) => KeyframeValueCorrectionPreview;
    private readonly closeDialog: () => void;

    constructor(deps: KeyframeValueCorrectionDialogControllerDeps) {
        this.kind = deps.kind;
        this.dispatchAction = deps.dispatchAction;
        this.previewCorrection = deps.previewCorrection;
        this.closeDialog = deps.close;
    }

    public mount(container: HTMLElement): void {
        const correction = createIdentityKeyframeValueCorrection(this.kind);
        const form = document.createElement("div");
        form.className = "popup-form";
        const formulaNote = document.createElement("p");
        formulaNote.className = "popup-form-note";
        formulaNote.textContent = t("dialog.keyCorrection.formula");
        form.appendChild(formulaNote);
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const previewNote = document.createElement("p");
        previewNote.className = "popup-form-note";
        previewNote.setAttribute("aria-live", "polite");

        const applyButton = createPopupFormButton(t("button.apply"), "primary");
        const cancelButton = createPopupFormButton(t("button.cancel"), "secondary");

        const updatePreview = (): void => {
            const preview = this.previewCorrection(correction);
            previewNote.textContent = preview.valid
                ? t("dialog.keyCorrection.preview", {
                    compatible: preview.compatibleKeyCount,
                    changed: preview.changedKeyCount,
                    beforeMin: formatValue(preview.beforeMin),
                    beforeMax: formatValue(preview.beforeMax),
                    afterMin: formatValue(preview.afterMin),
                    afterMax: formatValue(preview.afterMax),
                })
                : t("dialog.keyCorrection.invalid");
            applyButton.disabled = !preview.valid
                || preview.compatibleKeyCount === 0
                || preview.changedKeyCount === 0
                || isKeyframeValueCorrectionIdentity(correction);
        };

        for (const channel of getChannels(correction)) {
            const multiply = createNumberInput(
                channel.value.multiply,
                t("dialog.keyCorrection.multiplyAria", { channel: channel.label }),
            );
            const add = createNumberInput(
                channel.value.add,
                t("dialog.keyCorrection.addAria", { channel: channel.label }),
            );
            multiply.dataset.correctionChannel = channel.id;
            multiply.dataset.correctionOperation = "multiply";
            add.dataset.correctionChannel = channel.id;
            add.dataset.correctionOperation = "add";

            const updateValues = (): void => {
                channel.value.multiply = Number(multiply.value);
                channel.value.add = Number(add.value);
                updatePreview();
            };
            multiply.addEventListener("input", updateValues);
            add.addEventListener("input", updateValues);
            grid.appendChild(createPopupFormField(
                channel.label,
                createPopupFormInline(multiply, t("dialog.keyCorrection.plus"), add),
                "div",
            ));
        }

        applyButton.addEventListener("click", () => {
            const preview = this.previewCorrection(correction);
            if (!preview.valid || preview.changedKeyCount === 0) return;
            this.dispatchAction({ type: "keyframe.correctSelected", source: "menu", correction });
            this.closeDialog();
        });
        cancelButton.addEventListener("click", () => this.closeDialog());

        form.appendChild(previewNote);
        form.appendChild(createPopupFormButtonRow([applyButton, cancelButton]));
        container.appendChild(form);
        updatePreview();
    }
}
