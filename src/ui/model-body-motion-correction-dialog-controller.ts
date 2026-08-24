import type { EditorAction } from "../actions/types";
import { t } from "../i18n";
import type {
    ModelBodyCorrectionModel,
    ModelBodyMotionCorrectionPreview,
} from "../editor/model-body-motion-correction";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormButton,
    createPopupFormButtonRow,
    createPopupFormField,
} from "./popup-form-helpers";

export type ModelBodyMotionCorrectionDialogControllerDeps = {
    models: readonly ModelBodyCorrectionModel[];
    dispatchAction: (action: EditorAction) => boolean;
    previewCorrection: (sourceModelIndex: number) => ModelBodyMotionCorrectionPreview;
    close: () => void;
};

function formatRatio(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(3)}x` : "-";
}

export class ModelBodyMotionCorrectionDialogController implements PopupContentController {
    private readonly models: readonly ModelBodyCorrectionModel[];
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly previewCorrection: (sourceModelIndex: number) => ModelBodyMotionCorrectionPreview;
    private readonly closeDialog: () => void;

    constructor(deps: ModelBodyMotionCorrectionDialogControllerDeps) {
        this.models = deps.models;
        this.dispatchAction = deps.dispatchAction;
        this.previewCorrection = deps.previewCorrection;
        this.closeDialog = deps.close;
    }

    public mount(container: HTMLElement): void {
        const target = this.models.find((model) => model.active) ?? null;
        const sources = this.models.filter((model) => !model.active);
        const form = document.createElement("div");
        form.className = "popup-form";

        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.textContent = t("dialog.bodyMotionCorrection.note");
        form.appendChild(note);

        const targetValue = document.createElement("span");
        targetValue.className = "popup-form-value";
        targetValue.textContent = target?.name ?? "-";
        form.appendChild(createPopupFormField(
            t("dialog.bodyMotionCorrection.targetModel"),
            targetValue,
            "div",
        ));

        const sourceSelect = document.createElement("select");
        sourceSelect.className = "popup-form-control";
        sourceSelect.setAttribute("aria-label", t("dialog.bodyMotionCorrection.sourceModel"));
        for (const model of sources) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = model.name;
            sourceSelect.appendChild(option);
        }
        form.appendChild(createPopupFormField(
            t("dialog.bodyMotionCorrection.sourceModel"),
            sourceSelect,
        ));

        const previewNote = document.createElement("p");
        previewNote.className = "popup-form-note";
        previewNote.setAttribute("aria-live", "polite");
        const applyButton = createPopupFormButton(t("button.apply"), "primary");
        const cancelButton = createPopupFormButton(t("button.cancel"), "secondary");

        const updatePreview = (): ModelBodyMotionCorrectionPreview => {
            const sourceModelIndex = Number(sourceSelect.value);
            const preview = this.previewCorrection(sourceModelIndex);
            previewNote.textContent = preview.valid
                ? t("dialog.bodyMotionCorrection.preview", {
                    global: formatRatio(preview.plan.globalScale),
                    leftLeg: formatRatio(preview.plan.leftLegScale),
                    rightLeg: formatRatio(preview.plan.rightLegScale),
                    tracks: preview.compatibleTrackCount,
                    keys: preview.changedKeyCount,
                })
                : t("dialog.bodyMotionCorrection.invalidProfile");
            applyButton.disabled = !preview.valid || preview.changedKeyCount === 0;
            return preview;
        };

        sourceSelect.addEventListener("change", () => updatePreview());
        applyButton.addEventListener("click", () => {
            const preview = updatePreview();
            if (!preview.valid || preview.changedKeyCount === 0) return;
            this.dispatchAction({
                type: "keyframe.correctBodyScale",
                source: "menu",
                sourceModelIndex: Number(sourceSelect.value),
            });
            this.closeDialog();
        });
        cancelButton.addEventListener("click", () => this.closeDialog());

        form.appendChild(previewNote);
        form.appendChild(createPopupFormButtonRow([applyButton, cancelButton]));
        container.appendChild(form);
        sourceSelect.disabled = sources.length === 0;
        updatePreview();
    }
}
