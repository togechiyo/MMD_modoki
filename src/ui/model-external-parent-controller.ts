import type { EditorAction } from "../actions/types";
import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import { isModelExternalParentStateForChildBone } from "../shared/model-external-parent";

type ModelExternalParentControllerDeps = {
    mmdManager: MmdManager;
    getSelectedBone: () => string | null;
    registerKeyframe: (
        childModelIndex: number,
        childBoneName: string,
        parentModelIndex: number | null,
        parentBoneName: string | null,
    ) => boolean;
    showToast: (message: string, type: "success" | "error" | "info") => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

const DEFAULT_PARENT_BONE_NAMES = ["センター", "center", "Center"];

export class ModelExternalParentController {
    private readonly mmdManager: MmdManager;
    private readonly getSelectedBone: () => string | null;
    private readonly registerKeyframe: ModelExternalParentControllerDeps["registerKeyframe"];
    private readonly showToast: ModelExternalParentControllerDeps["showToast"];
    private readonly dispatchAction: ModelExternalParentControllerDeps["dispatchAction"];
    private readonly container = document.querySelector(".bone-parent-controls") as HTMLElement | null;
    private readonly parentModelSelect = document.getElementById("info-external-parent-select") as HTMLSelectElement | null;
    private readonly parentBoneSelect = document.getElementById("info-parent-bone-select") as HTMLSelectElement | null;
    private readonly registerButton = document.getElementById("btn-model-external-parent-register") as HTMLButtonElement | null;
    private syncing = false;

    constructor(deps: ModelExternalParentControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.getSelectedBone = deps.getSelectedBone;
        this.registerKeyframe = deps.registerKeyframe;
        this.showToast = deps.showToast;
        this.dispatchAction = deps.dispatchAction;

        this.parentModelSelect?.addEventListener("change", () => {
            if (this.syncing) return;
            this.refreshParentBoneOptions(this.readParentModelIndex(), null);
        });
        this.registerButton?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "model.setExternalParent", source: "button" })) return;
            this.setExternalParentFromPanel();
        });
        this.refresh();
    }

    public refresh(): void {
        if (!this.container || !this.parentModelSelect || !this.parentBoneSelect || !this.registerButton) return;
        const models = this.mmdManager.getLoadedModels();
        const childModel = models.find((model) => model.active) ?? null;
        const childBoneName = this.getSelectedBone();
        const visible = this.mmdManager.getTimelineTarget() === "model" && childModel !== null;
        this.container.hidden = !visible;
        if (!visible) return;

        const activeState = this.mmdManager.getModelExternalParent(childModel.index);
        const state = isModelExternalParentStateForChildBone(activeState, childBoneName) ? activeState : null;
        this.syncing = true;
        try {
            this.refreshParentModelOptions(childModel.index, state?.parentModelIndex ?? null);
            this.refreshParentBoneOptions(state?.parentModelIndex ?? null, state?.parentBoneName ?? null);
            const canChooseParent = Boolean(childBoneName) && models.length >= 2;
            this.parentModelSelect.disabled = !canChooseParent;
            this.registerButton.disabled = !childBoneName || (models.length < 2 && state === null);
        } finally {
            this.syncing = false;
        }
    }

    public setExternalParentFromPanel(): void {
        const childModel = this.mmdManager.getLoadedModels().find((model) => model.active) ?? null;
        const childBoneName = this.getSelectedBone();
        if (!childModel || !childBoneName) {
            this.showToast("外部親にする子ボーンを選択してください", "info");
            return;
        }

        const parentModelIndex = this.readParentModelIndex();
        const parentBoneName = parentModelIndex === null ? null : this.parentBoneSelect?.value || null;
        const ok = this.registerKeyframe(
            childModel.index,
            childBoneName,
            parentModelIndex,
            parentBoneName,
        );
        if (!ok) {
            this.showToast("外部親を登録できません（自己参照・循環参照・ボーン指定を確認してください）", "error");
            return;
        }

        this.refresh();
        const frame = this.mmdManager.currentFrame;
        this.showToast(
            parentModelIndex === null
                ? `Frame ${frame}: モデル外部親の解除キーを登録しました`
                : `Frame ${frame}: モデル外部親キーを登録しました`,
            "success",
        );
    }

    private readParentModelIndex(): number | null {
        const value = this.parentModelSelect?.value ?? "";
        if (value === "") return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed) ? parsed : null;
    }

    private refreshParentModelOptions(childModelIndex: number, selectedParentModelIndex: number | null): void {
        const select = this.parentModelSelect;
        if (!select) return;
        select.textContent = "";

        const noneOption = document.createElement("option");
        noneOption.value = "";
        noneOption.textContent = t("option.none");
        select.appendChild(noneOption);

        for (const model of this.mmdManager.getLoadedModels()) {
            if (model.index === childModelIndex) continue;
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            select.appendChild(option);
        }
        const selectedValue = selectedParentModelIndex === null ? "" : String(selectedParentModelIndex);
        select.value = Array.from(select.options).some((option) => option.value === selectedValue)
            ? selectedValue
            : "";
    }

    private refreshParentBoneOptions(parentModelIndex: number | null, selectedBoneName: string | null): void {
        const select = this.parentBoneSelect;
        if (!select) return;
        select.textContent = "";

        if (parentModelIndex === null) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "-";
            select.appendChild(option);
            select.disabled = true;
            return;
        }

        const boneNames = this.mmdManager.getModelBoneNames(parentModelIndex);
        for (const boneName of boneNames) {
            const option = document.createElement("option");
            option.value = boneName;
            option.textContent = boneName;
            select.appendChild(option);
        }
        const defaultBoneName = DEFAULT_PARENT_BONE_NAMES.find((candidate) => boneNames.includes(candidate))
            ?? boneNames[0]
            ?? "";
        const target = selectedBoneName && boneNames.includes(selectedBoneName) ? selectedBoneName : defaultBoneName;
        select.value = target;
        select.disabled = boneNames.length === 0;
    }
}
