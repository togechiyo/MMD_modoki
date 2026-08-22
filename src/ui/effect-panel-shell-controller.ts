export type EffectPanelTabId = "post" | "particles" | "materials" | "lighting";

const EFFECT_PANEL_TABS: EffectPanelTabId[] = ["post", "particles", "materials", "lighting"];

type EffectPanelShellElements = {
    tabs: HTMLButtonElement[];
    views: HTMLElement[];
};

function isEffectPanelTabId(value: string | null): value is EffectPanelTabId {
    return value === "post" || value === "particles" || value === "materials" || value === "lighting";
}

function resolveElements(root: ParentNode = document): EffectPanelShellElements {
    return {
        tabs: Array.from(root.querySelectorAll<HTMLButtonElement>("[data-effect-tab]")),
        views: Array.from(root.querySelectorAll<HTMLElement>("[data-effect-tab-view]")),
    };
}

export class EffectPanelShellController {
    private readonly elements: EffectPanelShellElements;
    private readonly onTabChanged: ((tab: EffectPanelTabId) => void) | null;
    private activeTab: EffectPanelTabId = "materials";

    constructor(
        root: ParentNode = document,
        onTabChanged: ((tab: EffectPanelTabId) => void) | null = null,
    ) {
        this.elements = resolveElements(root);
        this.onTabChanged = onTabChanged;
        this.setupEventListeners();
        this.applyActiveTab();
    }

    public setActiveTab(tab: EffectPanelTabId): void {
        if (this.activeTab === tab) return;
        this.activeTab = tab;
        this.applyActiveTab();
        this.onTabChanged?.(tab);
    }

    public getActiveTab(): EffectPanelTabId {
        return this.activeTab;
    }

    private setupEventListeners(): void {
        for (const tab of this.elements.tabs) {
            tab.addEventListener("click", () => {
                const nextTab = tab.dataset.effectTab ?? null;
                if (!isEffectPanelTabId(nextTab)) return;
                this.setActiveTab(nextTab);
            });
        }
    }

    private applyActiveTab(): void {
        for (const tab of this.elements.tabs) {
            const tabId = tab.dataset.effectTab ?? null;
            const active = tabId === this.activeTab;
            tab.classList.toggle("effect-panel-tab--active", active);
            tab.setAttribute("aria-selected", active ? "true" : "false");
            tab.tabIndex = active ? 0 : -1;
        }

        for (const view of this.elements.views) {
            const viewId = view.dataset.effectTabView ?? null;
            view.hidden = viewId !== this.activeTab || !EFFECT_PANEL_TABS.includes(viewId as EffectPanelTabId);
        }
    }
}
