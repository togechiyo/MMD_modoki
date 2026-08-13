import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { PopupContentController } from "./popup-dialog-controller";
import { createPopupFormField, createPopupFormRange, createPopupFormValueText } from "./popup-form-helpers";

export class RenderOrderSettingsDialogController implements PopupContentController {
    public constructor(private readonly mmdManager: MmdManager) {}

    public mount(container: HTMLElement): void {
        this.render(container);
    }

    private render(container: HTMLElement): void {
        container.replaceChildren();

        const form = document.createElement("div");
        form.className = "popup-form";
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const models = this.mmdManager.getLoadedModels();
        const mode = document.createElement("select");
        mode.id = "mmd-render-order-mode";
        mode.className = "popup-form-control";
        mode.disabled = models.length > 0;
        mode.append(
            this.createOption("evaluated", t("dialog.renderOrder.modeEvaluated")),
            this.createOption("mmd-fixed", t("dialog.renderOrder.modeMmdFixed")),
        );
        mode.value = this.mmdManager.getMmdRenderOrderMode();
        mode.addEventListener("change", () => {
            mode.value = this.mmdManager.setMmdRenderOrderMode(mode.value);
        });
        grid.appendChild(createPopupFormField(t("dialog.renderOrder.mode"), mode));

        const modeNote = document.createElement("p");
        modeNote.className = "popup-form-note";
        modeNote.textContent = models.length > 0
            ? t("dialog.renderOrder.modeLockedNote")
            : t("dialog.renderOrder.modeNote");
        grid.appendChild(modeNote);

        const coplanarStrength = document.createElement("input");
        coplanarStrength.id = "mmd-coplanar-depth-bias-strength";
        coplanarStrength.className = "popup-form-control";
        coplanarStrength.type = "range";
        coplanarStrength.min = "0";
        coplanarStrength.max = "4";
        coplanarStrength.step = "1";
        coplanarStrength.value = String(this.mmdManager.getMmdCoplanarDepthBiasStrength());
        const coplanarStrengthValue = createPopupFormValueText();
        const updateCoplanarStrengthValue = (): void => {
            coplanarStrengthValue.textContent = coplanarStrength.value === "0"
                ? t("dialog.renderOrder.coplanarOff")
                : coplanarStrength.value;
        };
        updateCoplanarStrengthValue();
        coplanarStrength.addEventListener("input", () => {
            coplanarStrength.value = String(this.mmdManager.setMmdCoplanarDepthBiasStrength(coplanarStrength.value));
            updateCoplanarStrengthValue();
        });
        grid.appendChild(createPopupFormField(
            t("dialog.renderOrder.coplanarCorrection"),
            createPopupFormRange(coplanarStrength, coplanarStrengthValue),
            "div",
        ));

        const coplanarNote = document.createElement("p");
        coplanarNote.className = "popup-form-note";
        coplanarNote.textContent = t("dialog.renderOrder.coplanarNote");
        grid.appendChild(coplanarNote);

        const list = document.createElement("div");
        list.className = "render-order-list";
        const sorted = [...models].sort((a, b) => a.renderOrder - b.renderOrder || a.index - b.index);
        if (sorted.length === 0) {
            const empty = document.createElement("p");
            empty.className = "popup-form-note";
            empty.textContent = t("dialog.renderOrder.empty");
            list.appendChild(empty);
        }
        sorted.forEach((model, rank) => {
            const row = document.createElement("div");
            row.className = "render-order-row";

            const label = document.createElement("span");
            label.className = "render-order-model-name";
            label.textContent = `${String(rank + 1)}. ${model.name}`;
            label.title = model.path;

            const actions = document.createElement("span");
            actions.className = "render-order-actions";
            const up = this.createMoveButton("↑", t("dialog.renderOrder.moveUp"), rank === 0, () => {
                this.mmdManager.moveModelRenderOrder(model.index, -1);
                this.render(container);
            });
            const down = this.createMoveButton("↓", t("dialog.renderOrder.moveDown"), rank === sorted.length - 1, () => {
                this.mmdManager.moveModelRenderOrder(model.index, 1);
                this.render(container);
            });
            actions.append(up, down);
            row.append(label, actions);
            list.appendChild(row);
        });
        grid.appendChild(list);

        const orderNote = document.createElement("p");
        orderNote.className = "popup-form-note";
        orderNote.textContent = t("dialog.renderOrder.orderNote");
        grid.appendChild(orderNote);
        container.appendChild(form);
    }

    private createOption(value: string, label: string): HTMLOptionElement {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
    }

    private createMoveButton(
        text: string,
        title: string,
        disabled: boolean,
        onClick: () => void,
    ): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "render-order-move-button";
        button.textContent = text;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.disabled = disabled;
        button.addEventListener("click", onClick);
        return button;
    }
}
