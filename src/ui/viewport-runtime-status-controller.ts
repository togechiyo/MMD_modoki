import { t } from "../i18n";

export type ViewportRuntimeStatusLevel = "loading" | "success" | "warning" | "error";

export type ViewportRuntimeStatusState = {
    level: ViewportRuntimeStatusLevel;
    titleKey: string;
    detailKey?: string;
    detailParams?: Record<string, string | number>;
    detailText?: string;
    dismissible?: boolean;
    showLogAction?: boolean;
    autoDismissMs?: number;
};

type ViewportRuntimeStatusControllerOptions = {
    host: HTMLElement;
    openLogFolder: () => Promise<boolean>;
};

export class ViewportRuntimeStatusController {
    private readonly host: HTMLElement;
    private readonly openLogFolder: () => Promise<boolean>;
    private state: ViewportRuntimeStatusState | null = null;
    private dismissTimer: number | null = null;

    public constructor(options: ViewportRuntimeStatusControllerOptions) {
        this.host = options.host;
        this.openLogFolder = options.openLogFolder;
        this.host.hidden = true;
    }

    public show(state: ViewportRuntimeStatusState): void {
        this.clearDismissTimer();
        this.state = state;
        this.render();
        if (state.autoDismissMs && state.autoDismissMs > 0) {
            this.dismissTimer = window.setTimeout(() => this.clear(), state.autoDismissMs);
        }
    }

    public clear(): void {
        this.clearDismissTimer();
        this.state = null;
        this.host.replaceChildren();
        this.host.hidden = true;
    }

    public refreshLocale(): void {
        if (this.state) this.render();
    }

    private clearDismissTimer(): void {
        if (this.dismissTimer === null) return;
        window.clearTimeout(this.dismissTimer);
        this.dismissTimer = null;
    }

    private render(): void {
        const state = this.state;
        if (!state) {
            this.clear();
            return;
        }

        const card = document.createElement("section");
        card.className = `viewport-runtime-status viewport-runtime-status--${state.level}`;
        card.dataset.level = state.level;
        card.setAttribute("role", state.level === "error" ? "alert" : "status");

        const header = document.createElement("div");
        header.className = "viewport-runtime-status__header";

        const indicator = document.createElement("span");
        indicator.className = "viewport-runtime-status__indicator";
        indicator.setAttribute("aria-hidden", "true");
        header.appendChild(indicator);

        const title = document.createElement("strong");
        title.className = "viewport-runtime-status__title";
        title.textContent = t(state.titleKey);
        header.appendChild(title);
        card.appendChild(header);

        const detailValue = state.detailText
            ?? (state.detailKey ? t(state.detailKey, state.detailParams) : "");
        if (detailValue) {
            const detail = document.createElement("p");
            detail.className = "viewport-runtime-status__detail";
            detail.textContent = detailValue;
            card.appendChild(detail);
        }

        if (state.showLogAction || state.dismissible) {
            const actions = document.createElement("div");
            actions.className = "viewport-runtime-status__actions";

            if (state.showLogAction) {
                const logButton = document.createElement("button");
                logButton.className = "viewport-runtime-status__action";
                logButton.type = "button";
                logButton.textContent = t("viewport.status.openLog");
                logButton.addEventListener("click", () => {
                    void this.handleOpenLogFolder();
                });
                actions.appendChild(logButton);
            }

            if (state.dismissible) {
                const dismissButton = document.createElement("button");
                dismissButton.className = "viewport-runtime-status__action viewport-runtime-status__action--quiet";
                dismissButton.type = "button";
                dismissButton.textContent = t("viewport.status.dismiss");
                dismissButton.addEventListener("click", () => this.clear());
                actions.appendChild(dismissButton);
            }

            card.appendChild(actions);
        }

        this.host.replaceChildren(card);
        this.host.hidden = false;
    }

    private async handleOpenLogFolder(): Promise<void> {
        let opened = false;
        try {
            opened = await this.openLogFolder();
        } catch {
            opened = false;
        }
        if (opened || !this.state) return;
        this.state = {
            ...this.state,
            detailKey: "viewport.status.logFolderFailed",
            detailParams: undefined,
            detailText: undefined,
        };
        this.render();
    }
}
