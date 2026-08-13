import { getLocale, t } from "../i18n";
import type { MmdModelHeaderPreview } from "../shared/mmd-model-header";

export type ModelCommentNoticeContent = {
    title: string;
    comment: string;
    formatVersion: string;
};

export function resolveModelCommentNoticeContent(
    header: MmdModelHeaderPreview,
    preferEnglish: boolean,
): ModelCommentNoticeContent {
    const primaryComment = preferEnglish ? header.englishComment : header.comment;
    const fallbackComment = preferEnglish ? header.comment : header.englishComment;
    const primaryName = preferEnglish ? header.englishModelName : header.modelName;
    const fallbackName = preferEnglish ? header.modelName : header.englishModelName;
    return {
        title: primaryName.trim() || fallbackName.trim() || t("viewport.modelComment.unnamed"),
        comment: primaryComment.trim() || fallbackComment.trim() || t("viewport.modelComment.noComment"),
        formatVersion: `${header.format.toUpperCase()} ver${header.version}`,
    };
}

export class ModelCommentNoticeController {
    private readonly root: HTMLElement | null;
    private readonly title: HTMLElement | null;
    private readonly meta: HTMLElement | null;
    private readonly body: HTMLElement | null;
    private readonly closeButton: HTMLButtonElement | null;
    private readonly okButton: HTMLButtonElement | null;
    private readonly cancelButton: HTMLButtonElement | null;
    private pendingResolve: ((confirmed: boolean) => void) | null = null;
    private currentHeader: MmdModelHeaderPreview | null = null;

    constructor() {
        this.root = document.getElementById("model-comment-notice");
        this.title = document.getElementById("model-comment-notice-title");
        this.meta = document.getElementById("model-comment-notice-meta");
        this.body = document.getElementById("model-comment-notice-body");
        this.closeButton = document.getElementById("model-comment-notice-close") as HTMLButtonElement | null;
        this.okButton = document.getElementById("model-comment-notice-ok") as HTMLButtonElement | null;
        this.cancelButton = document.getElementById("model-comment-notice-cancel") as HTMLButtonElement | null;
        this.closeButton?.addEventListener("click", () => this.finish(false));
        this.okButton?.addEventListener("click", () => this.finish(true));
        this.cancelButton?.addEventListener("click", () => this.finish(false));
        document.addEventListener("keydown", (event) => {
            if (!this.pendingResolve) return;
            if (event.key === "Escape") {
                event.preventDefault();
                this.finish(false);
            }
        });
    }

    public confirm(header: MmdModelHeaderPreview): Promise<boolean> {
        this.finish(false);
        this.currentHeader = header;
        this.render();
        if (!this.root) return Promise.resolve(true);
        this.root.hidden = false;
        this.okButton?.focus();
        return new Promise<boolean>((resolve) => {
            this.pendingResolve = resolve;
        });
    }

    public refreshLocale(): void {
        if (!this.currentHeader || !this.pendingResolve) return;
        this.render();
    }

    private render(): void {
        if (!this.currentHeader || !this.title || !this.meta || !this.body) return;
        const content = resolveModelCommentNoticeContent(this.currentHeader, getLocale() === "en");
        this.title.textContent = t("viewport.modelComment.title", { name: content.title });
        this.meta.textContent = content.formatVersion;
        this.body.textContent = content.comment;
        this.body.scrollTop = 0;
        if (this.okButton) this.okButton.textContent = t("viewport.modelComment.ok");
        if (this.cancelButton) this.cancelButton.textContent = t("viewport.modelComment.cancel");
    }

    private finish(confirmed: boolean): void {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.currentHeader = null;
        if (this.root) this.root.hidden = true;
        resolve?.(confirmed);
    }
}
