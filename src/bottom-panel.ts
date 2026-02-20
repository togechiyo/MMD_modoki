import type { MmdManager } from "./mmd-manager";
import type { ModelInfo, MotionInfo } from "./types";

export class BottomPanel {
    private morphContainer: HTMLElement;
    private morphSliders: Map<string, HTMLInputElement> = new Map();
    private mmdManager: MmdManager | null = null;

    constructor() {
        this.morphContainer = document.getElementById("morph-controls")!;
    }

    setMmdManager(manager: MmdManager): void {
        this.mmdManager = manager;
    }

    updateMorphControls(info: ModelInfo): void {
        this.morphContainer.innerHTML = "";

        if (info.morphNames.length === 0) {
            this.morphContainer.innerHTML =
                '<div class="morph-empty-state">モーフなし</div>';
            return;
        }

        // Only show first 30 morphs to avoid overwhelming the UI
        const morphsToShow = info.morphNames.slice(0, 30);

        morphsToShow.forEach((name) => {
            const row = document.createElement("div");
            row.className = "morph-slider-row";

            const label = document.createElement("label");
            label.textContent = name;
            label.title = name;

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0";
            slider.max = "1";
            slider.step = "0.01";
            slider.value = "0";

            const valueDisplay = document.createElement("span");
            valueDisplay.className = "morph-value";
            valueDisplay.textContent = "0.00";

            slider.addEventListener("input", () => {
                const val = parseFloat(slider.value);
                valueDisplay.textContent = val.toFixed(2);
                this.mmdManager?.setMorphWeight(name, val);
            });

            this.morphSliders.set(name, slider);

            row.appendChild(label);
            row.appendChild(slider);
            row.appendChild(valueDisplay);
            this.morphContainer.appendChild(row);
        });

        if (info.morphNames.length > 30) {
            const notice = document.createElement("div");
            notice.style.cssText =
                "padding: 4px 0; font-size: 10px; color: var(--text-tertiary); text-align: center;";
            notice.textContent = `+${info.morphNames.length - 30} more...`;
            this.morphContainer.appendChild(notice);
        }
    }

    updateModelInfo(info: ModelInfo): void {
        const nameEl = document.getElementById("info-model-name");
        const verticesEl = document.getElementById("info-vertices");
        const bonesEl = document.getElementById("info-bones");
        const morphsEl = document.getElementById("info-morphs");

        if (nameEl) nameEl.textContent = info.name;
        if (verticesEl) verticesEl.textContent = info.vertexCount.toLocaleString();
        if (bonesEl) bonesEl.textContent = info.boneCount.toLocaleString();
        if (morphsEl) morphsEl.textContent = info.morphCount.toLocaleString();
    }

    clearMorphControls(): void {
        this.morphContainer.innerHTML =
            '<div class="morph-empty-state">モデル未読込</div>';
        this.morphSliders.clear();
    }
}
