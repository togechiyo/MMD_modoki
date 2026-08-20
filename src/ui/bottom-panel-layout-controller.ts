export type BottomPanelMode = "model" | "camera" | "accessory";

type BottomPanelSectionId =
    | "info"
    | "interpolation"
    | "boneOperation"
    | "bone"
    | "morph"
    | "lighting"
    | "shadow"
    | "gravity";

const MODE_SECTIONS: Record<BottomPanelMode, BottomPanelSectionId[]> = {
    model: ["info", "interpolation", "bone", "morph"],
    camera: ["info", "interpolation", "bone", "lighting", "shadow", "gravity"],
    accessory: ["info", "interpolation", "bone"],
};

const MODE_GRID_TEMPLATES: Record<BottomPanelMode, string> = {
    model: "repeat(6, minmax(0, 1fr))",
    camera: "repeat(6, minmax(0, 1fr))",
    accessory: "repeat(6, minmax(0, 1fr))",
};

const MODE_SECTION_SPANS: Record<BottomPanelMode, Partial<Record<BottomPanelSectionId, number>>> = {
    model: {
        morph: 3,
    },
    camera: {},
    accessory: {},
};

export class BottomPanelLayoutController {
    private readonly root: HTMLElement | null;
    private readonly sections: Record<BottomPanelSectionId, HTMLElement | null>;
    private mode: BottomPanelMode = "camera";

    constructor() {
        this.root = document.querySelector<HTMLElement>(".bottom-panel-inner");
        this.sections = {
            info: document.getElementById("info-section"),
            interpolation: document.getElementById("interpolation-section"),
            boneOperation: document.getElementById("bone-operation-section"),
            bone: document.getElementById("bone-section"),
            morph: document.getElementById("morph-section"),
            lighting: document.getElementById("lighting-section"),
            shadow: document.getElementById("shadow-section"),
            gravity: document.getElementById("gravity-section"),
        };
    }

    public applyMode(mode: BottomPanelMode): void {
        this.mode = mode;
        const visibleSections = MODE_SECTIONS[mode];
        const visibleSet = new Set<BottomPanelSectionId>(visibleSections);

        this.root?.setAttribute("data-bottom-panel-mode", mode);
        this.root?.style.setProperty("--bottom-panel-section-count", "6");
        this.root?.style.setProperty("--bottom-panel-grid-template", MODE_GRID_TEMPLATES[mode]);

        Object.entries(this.sections).forEach(([sectionId, section]) => {
            if (!section) return;
            const id = sectionId as BottomPanelSectionId;
            const visible = visibleSet.has(id);
            const span = MODE_SECTION_SPANS[mode][id] ?? 1;
            section.hidden = !visible;
            if (visible) {
                section.style.order = String(visibleSections.indexOf(id) + 1);
                section.style.gridColumn = `span ${span}`;
            } else {
                section.style.removeProperty("order");
                section.style.removeProperty("grid-column");
            }
        });
    }

    public getMode(): BottomPanelMode {
        return this.mode;
    }
}
