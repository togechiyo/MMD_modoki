import { t } from "../i18n";
import type { TimelineSeekPhase } from "../actions/types";
import { installEnterCommitNumberInput } from "./panel-control-helpers";

type PlaybackRangeState = {
    startFrame: number;
    endFrame: number;
    frameStartEnabled: boolean;
};

type ViewportSeekBarState = {
    currentFrame: number;
    totalFrames: number;
    isPlaying: boolean;
    loopEnabled: boolean;
    playbackRange: PlaybackRangeState;
};

type ViewportSeekBarOptions = {
    onSeekFrame: (frame: number, phase: TimelineSeekPhase) => void;
    onCommitCurrentFrame: (frame: number) => void;
    onTogglePlayback: () => void;
    onSetLoopEnabled: (enabled: boolean) => void;
    onStepFrame: (deltaFrames: number) => void;
    onSeekBoundary: (boundary: "start" | "end") => void;
    onSeekAdjacentKeyframe: (direction: -1 | 1) => void;
    onRangeFrameChange: (boundary: "start" | "end", frame: number, phase: "input" | "commit") => void;
    onRangeToggle: (kind: "start" | "stop", enabled: boolean) => void;
    onExportPng: () => void;
    onToggleUi: () => void;
};

export class ViewportSeekBarController {
    private readonly root: HTMLElement | null;
    private readonly btnSeekStart: HTMLButtonElement | null;
    private readonly btnSeekEnd: HTMLButtonElement | null;
    private readonly btnPrevFrame: HTMLButtonElement | null;
    private readonly btnNextFrame: HTMLButtonElement | null;
    private readonly btnPrevKey: HTMLButtonElement | null;
    private readonly btnNextKey: HTMLButtonElement | null;
    private readonly btnPlayToggle: HTMLButtonElement | null;
    private readonly btnLoopToggle: HTMLButtonElement | null;
    private readonly btnExportPng: HTMLButtonElement | null;
    private readonly btnToggleUi: HTMLButtonElement | null;
    private readonly currentFrameInput: HTMLInputElement | null;
    private readonly totalFrameLabel: HTMLElement | null;
    private readonly track: HTMLElement | null;
    private readonly trackFill: HTMLElement | null;
    private readonly trackThumb: HTMLElement | null;
    private readonly rangeFill: HTMLElement | null;
    private readonly rangeStartHandle: HTMLElement | null;
    private readonly rangeEndHandle: HTMLElement | null;
    private readonly rangeStartInput: HTMLInputElement | null;
    private readonly rangeEndInput: HTMLInputElement | null;
    private readonly frameStartToggle: HTMLInputElement | null;
    private readonly onSeekFrame: ViewportSeekBarOptions["onSeekFrame"];
    private readonly onCommitCurrentFrame: ViewportSeekBarOptions["onCommitCurrentFrame"];
    private readonly onTogglePlayback: ViewportSeekBarOptions["onTogglePlayback"];
    private readonly onSetLoopEnabled: ViewportSeekBarOptions["onSetLoopEnabled"];
    private readonly onStepFrame: ViewportSeekBarOptions["onStepFrame"];
    private readonly onSeekBoundary: ViewportSeekBarOptions["onSeekBoundary"];
    private readonly onSeekAdjacentKeyframe: ViewportSeekBarOptions["onSeekAdjacentKeyframe"];
    private readonly onRangeFrameChange: ViewportSeekBarOptions["onRangeFrameChange"];
    private readonly onRangeToggle: ViewportSeekBarOptions["onRangeToggle"];
    private readonly onExportPng: ViewportSeekBarOptions["onExportPng"];
    private readonly onToggleUi: ViewportSeekBarOptions["onToggleUi"];
    private state: ViewportSeekBarState = {
        currentFrame: 0,
        totalFrames: 0,
        isPlaying: false,
        loopEnabled: false,
        playbackRange: {
            startFrame: 0,
            endFrame: 0,
            frameStartEnabled: false,
        },
    };
    private seekDragPointerId: number | null = null;
    private rangeDrag: {
        pointerId: number;
        boundary: "start" | "end";
        element: HTMLElement;
    } | null = null;

    constructor(options: ViewportSeekBarOptions) {
        this.onSeekFrame = options.onSeekFrame;
        this.onCommitCurrentFrame = options.onCommitCurrentFrame;
        this.onTogglePlayback = options.onTogglePlayback;
        this.onSetLoopEnabled = options.onSetLoopEnabled;
        this.onStepFrame = options.onStepFrame;
        this.onSeekBoundary = options.onSeekBoundary;
        this.onSeekAdjacentKeyframe = options.onSeekAdjacentKeyframe;
        this.onRangeFrameChange = options.onRangeFrameChange;
        this.onRangeToggle = options.onRangeToggle;
        this.onExportPng = options.onExportPng;
        this.onToggleUi = options.onToggleUi;

        this.root = document.getElementById("viewport-bottom-bar");
        this.btnSeekStart = document.getElementById("viewport-seek-start") as HTMLButtonElement | null;
        this.btnSeekEnd = document.getElementById("viewport-seek-end") as HTMLButtonElement | null;
        this.btnPrevFrame = document.getElementById("viewport-seek-prev-frame") as HTMLButtonElement | null;
        this.btnNextFrame = document.getElementById("viewport-seek-next-frame") as HTMLButtonElement | null;
        this.btnPrevKey = document.getElementById("viewport-seek-prev-key") as HTMLButtonElement | null;
        this.btnNextKey = document.getElementById("viewport-seek-next-key") as HTMLButtonElement | null;
        this.btnPlayToggle = document.getElementById("viewport-seek-play-toggle") as HTMLButtonElement | null;
        this.btnLoopToggle = document.getElementById("viewport-seek-loop-toggle") as HTMLButtonElement | null;
        this.btnExportPng = document.getElementById("viewport-seek-export-png") as HTMLButtonElement | null;
        this.btnToggleUi = document.getElementById("viewport-seek-toggle-ui") as HTMLButtonElement | null;
        this.currentFrameInput = document.getElementById("viewport-seek-current-frame") as HTMLInputElement | null;
        this.totalFrameLabel = document.getElementById("viewport-seek-total-frame");
        this.track = document.getElementById("viewport-seek-track");
        this.trackFill = document.getElementById("viewport-seek-track-fill");
        this.trackThumb = document.getElementById("viewport-seek-track-thumb");
        this.rangeFill = document.getElementById("viewport-seek-range-fill");
        this.rangeStartHandle = document.getElementById("viewport-seek-range-start-handle");
        this.rangeEndHandle = document.getElementById("viewport-seek-range-end-handle");
        this.rangeStartInput = document.getElementById("viewport-seek-range-start") as HTMLInputElement | null;
        this.rangeEndInput = document.getElementById("viewport-seek-range-end") as HTMLInputElement | null;
        this.frameStartToggle = document.getElementById("viewport-seek-frame-start-toggle") as HTMLInputElement | null;

        this.installEventHandlers();
        this.refreshLocale();
    }

    public refresh(state: ViewportSeekBarState): void {
        this.state = {
            currentFrame: this.normalizeFrame(state.currentFrame),
            totalFrames: Math.max(0, this.normalizeFrame(state.totalFrames)),
            isPlaying: state.isPlaying,
            loopEnabled: state.loopEnabled,
            playbackRange: {
                startFrame: this.normalizeFrame(state.playbackRange.startFrame),
                endFrame: this.normalizeFrame(state.playbackRange.endFrame),
                frameStartEnabled: state.playbackRange.frameStartEnabled,
            },
        };

        if (this.currentFrameInput && document.activeElement !== this.currentFrameInput) {
            this.currentFrameInput.value = String(this.state.currentFrame);
        }
        if (this.totalFrameLabel) {
            this.totalFrameLabel.textContent = String(this.state.totalFrames);
        }
        if (this.btnLoopToggle) {
            this.btnLoopToggle.setAttribute("aria-pressed", String(this.state.loopEnabled));
        }
        if (this.rangeStartInput && document.activeElement !== this.rangeStartInput) {
            this.rangeStartInput.value = String(this.state.playbackRange.startFrame);
        }
        if (this.rangeEndInput && document.activeElement !== this.rangeEndInput) {
            this.rangeEndInput.value = String(this.state.playbackRange.endFrame);
        }
        if (this.frameStartToggle) {
            this.frameStartToggle.checked = this.state.playbackRange.frameStartEnabled;
        }
        this.updateTrack();
        this.refreshLocale();
    }

    public refreshLocale(): void {
        if (this.btnPlayToggle) {
            const key = this.state.isPlaying ? "viewportSeekBar.pause" : "viewportSeekBar.play";
            const label = t(key);
            this.btnPlayToggle.textContent = this.state.isPlaying ? "⏸" : "▶";
            this.btnPlayToggle.title = label;
            this.btnPlayToggle.setAttribute("aria-label", label);
        }
        if (this.btnLoopToggle) {
            const label = t(this.state.loopEnabled ? "viewportSeekBar.repeatOn" : "viewportSeekBar.repeatOff");
            this.btnLoopToggle.title = label;
            this.btnLoopToggle.setAttribute("aria-label", label);
        }
        this.setButtonTitle(this.btnSeekStart, "viewportSeekBar.seekStart");
        this.setButtonTitle(this.btnSeekEnd, "viewportSeekBar.seekEnd");
        this.setButtonTitle(this.btnPrevFrame, "viewportSeekBar.prevFrame");
        this.setButtonTitle(this.btnNextFrame, "viewportSeekBar.nextFrame");
        this.setButtonTitle(this.btnPrevKey, "viewportSeekBar.prevKey");
        this.setButtonTitle(this.btnNextKey, "viewportSeekBar.nextKey");
        this.setButtonTitle(this.btnExportPng, "menu.file.exportPng");
        this.setButtonTitle(this.btnToggleUi, "toolbar.ui.title.off");
    }

    private installEventHandlers(): void {
        this.btnSeekStart?.addEventListener("click", () => this.onSeekBoundary("start"));
        this.btnSeekEnd?.addEventListener("click", () => this.onSeekBoundary("end"));
        this.btnPrevFrame?.addEventListener("click", () => this.onStepFrame(-1));
        this.btnNextFrame?.addEventListener("click", () => this.onStepFrame(1));
        this.btnPrevKey?.addEventListener("click", () => this.onSeekAdjacentKeyframe(-1));
        this.btnNextKey?.addEventListener("click", () => this.onSeekAdjacentKeyframe(1));
        this.btnPlayToggle?.addEventListener("click", () => this.onTogglePlayback());
        this.btnLoopToggle?.addEventListener("click", () => this.onSetLoopEnabled(!this.state.loopEnabled));
        this.btnExportPng?.addEventListener("click", () => this.onExportPng());
        this.btnToggleUi?.addEventListener("click", () => this.onToggleUi());

        this.currentFrameInput?.addEventListener("focus", () => this.currentFrameInput?.select());
        if (this.currentFrameInput) {
            installEnterCommitNumberInput(this.currentFrameInput, {
                commit: () => this.commitCurrentFrameInput(),
                revert: () => this.restoreCurrentFrameInput(),
            });
        }

        this.installRangeInputHandlers(this.rangeStartInput, "start");
        this.installRangeInputHandlers(this.rangeEndInput, "end");
        this.frameStartToggle?.addEventListener("change", () => {
            this.onRangeToggle("start", Boolean(this.frameStartToggle?.checked));
        });
        this.rangeStartHandle?.addEventListener("pointerdown", (event) => this.beginRangeDrag(event, "start"));
        this.rangeEndHandle?.addEventListener("pointerdown", (event) => this.beginRangeDrag(event, "end"));
        this.track?.addEventListener("pointerdown", (event) => this.beginSeekDrag(event));
        window.addEventListener("pointermove", (event) => this.updateSeekDrag(event));
        window.addEventListener("pointerup", (event) => this.finishSeekDrag(event));
        window.addEventListener("pointercancel", (event) => this.cancelSeekDrag(event));
        window.addEventListener("pointermove", (event) => this.updateRangeDrag(event));
        window.addEventListener("pointerup", (event) => this.finishRangeDrag(event, true));
        window.addEventListener("pointercancel", (event) => this.finishRangeDrag(event, false));
    }

    private installRangeInputHandlers(input: HTMLInputElement | null, boundary: "start" | "end"): void {
        if (!input) return;
        input.addEventListener("focus", () => input.select());
        installEnterCommitNumberInput(input, {
            commit: () => this.commitRangeInput(input, boundary),
            revert: () => {
                input.value = String(boundary === "start" ? this.state.playbackRange.startFrame : this.state.playbackRange.endFrame);
            },
        });
    }

    private beginSeekDrag(event: PointerEvent): void {
        if (event.button !== 0 || !this.track || this.seekDragPointerId !== null) return;
        event.preventDefault();
        this.seekDragPointerId = event.pointerId;
        this.track.setPointerCapture(event.pointerId);
        this.track.classList.add("is-dragging");
        this.onSeekFrame(this.frameFromPointerEvent(event), "dragStart");
    }

    private updateSeekDrag(event: PointerEvent): void {
        if (this.seekDragPointerId !== event.pointerId) return;
        event.preventDefault();
        this.onSeekFrame(this.frameFromPointerEvent(event), "dragMove");
    }

    private finishSeekDrag(event: PointerEvent): void {
        if (this.seekDragPointerId !== event.pointerId) return;
        event.preventDefault();
        this.seekDragPointerId = null;
        this.track?.classList.remove("is-dragging");
        if (this.track?.hasPointerCapture(event.pointerId)) {
            this.track.releasePointerCapture(event.pointerId);
        }
        this.onSeekFrame(this.frameFromPointerEvent(event), "dragEnd");
    }

    private cancelSeekDrag(event: PointerEvent): void {
        if (this.seekDragPointerId !== event.pointerId) return;
        event.preventDefault();
        this.seekDragPointerId = null;
        this.track?.classList.remove("is-dragging");
        if (this.track?.hasPointerCapture(event.pointerId)) {
            this.track.releasePointerCapture(event.pointerId);
        }
    }

    private beginRangeDrag(event: PointerEvent, boundary: "start" | "end"): void {
        if (event.button !== 0 || this.rangeDrag !== null) return;
        event.preventDefault();
        event.stopPropagation();

        const element = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
        if (!element) return;

        this.rangeDrag = {
            pointerId: event.pointerId,
            boundary,
            element,
        };
        element.setPointerCapture(event.pointerId);
        element.classList.add("is-dragging");
        this.onRangeFrameChange(boundary, this.rangeFrameFromPointerEvent(event, boundary), "input");
    }

    private updateRangeDrag(event: PointerEvent): void {
        const drag = this.rangeDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        this.onRangeFrameChange(drag.boundary, this.rangeFrameFromPointerEvent(event, drag.boundary), "input");
    }

    private finishRangeDrag(event: PointerEvent, commit: boolean): void {
        const drag = this.rangeDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        this.rangeDrag = null;
        drag.element.classList.remove("is-dragging");
        if (drag.element.hasPointerCapture(event.pointerId)) {
            drag.element.releasePointerCapture(event.pointerId);
        }
        if (commit) {
            this.onRangeFrameChange(drag.boundary, this.rangeFrameFromPointerEvent(event, drag.boundary), "commit");
        }
    }

    private frameFromPointerEvent(event: PointerEvent): number {
        if (!this.track) return this.state.currentFrame;
        const rect = this.track.getBoundingClientRect();
        if (rect.width <= 0) return this.state.currentFrame;
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        return Math.round(ratio * Math.max(0, this.state.totalFrames));
    }

    private rangeFrameFromPointerEvent(event: PointerEvent, boundary: "start" | "end"): number {
        const frame = this.frameFromPointerEvent(event);
        return this.clampRangeFrame(boundary, frame);
    }

    private commitCurrentFrameInput(): void {
        const frame = this.parseFrameInput(this.currentFrameInput);
        if (frame === null) {
            this.restoreCurrentFrameInput();
            return;
        }
        this.onCommitCurrentFrame(frame);
    }

    private commitRangeInput(input: HTMLInputElement | null, boundary: "start" | "end"): void {
        const fallback = boundary === "start" ? this.state.playbackRange.startFrame : this.state.playbackRange.endFrame;
        const frame = this.parseFrameInput(input);
        if (frame === null) {
            if (input) input.value = String(fallback);
            return;
        }
        this.onRangeFrameChange(boundary, frame, "commit");
    }

    private restoreCurrentFrameInput(): void {
        if (this.currentFrameInput) {
            this.currentFrameInput.value = String(this.state.currentFrame);
        }
    }

    private updateTrack(): void {
        const maxFrame = Math.max(0, this.state.totalFrames);
        const percent = maxFrame > 0
            ? Math.max(0, Math.min(100, (this.state.currentFrame / maxFrame) * 100))
            : 0;
        const value = `${percent}%`;
        if (this.trackFill) this.trackFill.style.width = value;
        if (this.trackThumb) this.trackThumb.style.left = value;
        this.track?.style.setProperty("--viewport-seek-progress", value);

        const rangeStart = this.clampFrame(this.state.playbackRange.startFrame);
        const rangeEnd = Math.max(rangeStart, this.clampFrame(this.state.playbackRange.endFrame));
        const rangeStartPercent = this.frameToPercent(rangeStart);
        const rangeEndPercent = this.frameToPercent(rangeEnd);
        if (this.rangeFill) {
            this.rangeFill.style.left = `${rangeStartPercent}%`;
            this.rangeFill.style.width = `${Math.max(0, rangeEndPercent - rangeStartPercent)}%`;
        }
        if (this.rangeStartHandle) this.rangeStartHandle.style.left = `${rangeStartPercent}%`;
        if (this.rangeEndHandle) this.rangeEndHandle.style.left = `${rangeEndPercent}%`;
    }

    private parseFrameInput(input: HTMLInputElement | null): number | null {
        const value = input?.value.trim() ?? "";
        if (value.length === 0) return null;
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return null;
        return Math.max(0, parsed);
    }

    private normalizeFrame(value: number): number {
        return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    }

    private clampRangeFrame(boundary: "start" | "end", frame: number): number {
        const clamped = this.clampFrame(frame);
        if (boundary === "start") {
            return Math.min(clamped, this.clampFrame(this.state.playbackRange.endFrame));
        }
        return Math.max(clamped, this.clampFrame(this.state.playbackRange.startFrame));
    }

    private clampFrame(frame: number): number {
        return Math.max(0, Math.min(this.normalizeFrame(frame), Math.max(0, this.state.totalFrames)));
    }

    private frameToPercent(frame: number): number {
        const maxFrame = Math.max(0, this.state.totalFrames);
        if (maxFrame <= 0) return 0;
        return Math.max(0, Math.min(100, (this.clampFrame(frame) / maxFrame) * 100));
    }

    private setButtonTitle(button: HTMLButtonElement | null, key: string): void {
        if (!button) return;
        const label = t(key);
        button.title = label;
        button.setAttribute("aria-label", label);
    }
}
