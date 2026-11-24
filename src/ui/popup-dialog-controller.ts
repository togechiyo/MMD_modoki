import { t } from "../i18n";

export type PopupSurface = "modal";
export type PopupSize = "sm" | "md" | "lg" | "wide";

export type PopupContentController = {
    mount(container: HTMLElement): void;
    unmount?(): void;
    refreshLocale?(): void;
    canClose?(): boolean;
};

export type PopupOpenOptions = {
    id: string;
    surface: PopupSurface;
    title: string;
    size?: PopupSize;
    closeOnBackdrop?: boolean;
    restoreFocusTo?: HTMLElement | null;
    content: PopupContentController | ((container: HTMLElement) => void);
};

function isContentController(
    content: PopupContentController | ((container: HTMLElement) => void)
): content is PopupContentController {
    return typeof content !== "function";
}

export class PopupDialogController {
    private readonly backdrop: HTMLElement;
    private readonly dialog: HTMLElement;
    private readonly titleElement: HTMLElement;
    private readonly bodyElement: HTMLElement;
    private readonly closeButton: HTMLButtonElement;
    private activeContent: PopupContentController | null = null;
    private restoreFocusTo: HTMLElement | null = null;
    private closeOnBackdrop = true;

    constructor() {
        const backdrop = document.createElement("div");
        backdrop.className = "app-menu-dialog-backdrop";
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <section class="app-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="app-menu-dialog-title">
                <header class="app-menu-dialog-header">
                    <h2 id="app-menu-dialog-title" class="app-menu-dialog-title"></h2>
                    <button class="app-menu-dialog-close" type="button" data-i18n-aria-label="dialog.close">&times;</button>
                </header>
                <div class="app-menu-dialog-body"></div>
            </section>
        `;
        document.body.appendChild(backdrop);

        const dialog = backdrop.querySelector<HTMLElement>(".app-menu-dialog");
        const titleElement = backdrop.querySelector<HTMLElement>("#app-menu-dialog-title");
        const bodyElement = backdrop.querySelector<HTMLElement>(".app-menu-dialog-body");
        const closeButton = backdrop.querySelector<HTMLButtonElement>(".app-menu-dialog-close");
        if (!dialog || !titleElement || !bodyElement || !closeButton) {
            throw new Error("Popup dialog host initialization failed");
        }

        this.backdrop = backdrop;
        this.dialog = dialog;
        this.titleElement = titleElement;
        this.bodyElement = bodyElement;
        this.closeButton = closeButton;

        backdrop.addEventListener("pointerdown", (event) => {
            if (event.target === backdrop && this.closeOnBackdrop) this.close();
        });
        closeButton.addEventListener("click", () => this.close());
        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || this.backdrop.hidden) return;
            event.preventDefault();
            this.close();
        });
    }

    public open(options: PopupOpenOptions): void {
        if (options.surface !== "modal") return;
        if (!this.close({ restoreFocus: false })) return;

        this.restoreFocusTo = options.restoreFocusTo ?? null;
        this.closeOnBackdrop = options.closeOnBackdrop ?? true;
        this.titleElement.textContent = options.title;
        this.closeButton.setAttribute("aria-label", t("dialog.close"));
        this.dialog.dataset.popupId = options.id;
        this.dialog.dataset.popupSize = options.size ?? "md";
        this.bodyElement.replaceChildren();
        this.bodyElement.scrollTop = 0;

        if (isContentController(options.content)) {
            this.activeContent = options.content;
            options.content.mount(this.bodyElement);
        } else {
            this.activeContent = null;
            options.content(this.bodyElement);
        }

        this.backdrop.hidden = false;
        const focusTarget = this.bodyElement.querySelector<HTMLElement>(
            "input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)"
        );
        (focusTarget ?? this.closeButton).focus();
    }

    public close(options: { restoreFocus?: boolean } = {}): boolean {
        if (this.backdrop.hidden) return true;
        if (this.activeContent?.canClose && !this.activeContent.canClose()) return false;

        this.activeContent?.unmount?.();
        this.activeContent = null;
        this.bodyElement.replaceChildren();
        this.backdrop.hidden = true;

        if (options.restoreFocus !== false) {
            if (this.restoreFocusTo?.isConnected) {
                this.restoreFocusTo.focus();
            }
        }
        this.restoreFocusTo = null;
        return true;
    }

    public refreshLocale(): void {
        this.activeContent?.refreshLocale?.();
    }
}
