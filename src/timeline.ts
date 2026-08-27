/**
 * Timeline – ruler-above-scroll, bidirectional label sync
 *
 * HTML structure:
 *   #timeline-labels          ← scrollable (hidden scrollbar), synced bidirectionally
 *     #timeline-label-canvas  ← full height canvas
 *   #timeline-tracks-wrapper  ← flex-column wrapper
 *     #timeline-overlay-canvas ← ruler + playhead (NOT in scroll, always at top)
 *     #timeline-tracks-scroll  ← overflow-y:auto (actual scroll container)
 *       #timeline-canvas       ← keyframe dots only (no ruler row drawn here)
 *
 * Performance:
 *   - Static canvas (#timeline-canvas): redraws ONLY on setKeyframeTracks / resize / scroll
 *   - Overlay canvas (#timeline-overlay-canvas): redraws on setCurrentFrame (ruler + playhead)
 *   - Label canvas (#timeline-label-canvas): redraws on setKeyframeTracks / resize
 *   - Bidirectional scroll sync: labelsEl ↔ trackScrollEl
 */
import type { KeyframeTrack, TimelineRotationOverlay, TrackCategory } from "./types";
import {
    createTimelineKeySelectionKey,
    createTimelineRowSelectionKey,
    createTimelineRangeSelection,
    normalizeTimelineKeySelection,
    toggleTimelineKeySelection,
    updateTimelineFrameColumnSelection,
    updateTimelineRowSelection,
    type TimelineHeaderSelectionMode,
    type TimelineKeySelectionRef,
    type TimelineRowSelectionRef,
} from "./editor/timeline-key-selection";

export type { TimelineKeySelectionRef, TimelineRowSelectionRef } from "./editor/timeline-key-selection";

export type TimelineSeekPhase = "jump" | "dragStart" | "dragMove" | "dragEnd";

export type TimelineBoneTrackSelectionRef = {
    trackCategory: TrackCategory;
    trackName: string;
};

export type TimelineSelectionChange = {
    activeTrack: KeyframeTrack | null;
    activeFrame: number | null;
    selectedKeys: TimelineKeySelectionRef[];
    selectedBoneTracks: TimelineBoneTrackSelectionRef[];
    activeHeaderAxis: TimelineHeaderSelectionAxis;
    selectedRows: TimelineRowSelectionRef[];
    selectedFrameColumns: number[];
};

export type TimelineHeaderSelectionAxis = "row" | "column" | null;

export type TimelineHeaderSelectionSnapshot = {
    axis: TimelineHeaderSelectionAxis;
    rows: TimelineRowSelectionRef[];
    frames: number[];
};

export type TimelineFrameUpdateOptions = {
    lightweight?: boolean;
};

// ── Layout ─────────────────────────────────────────────────────────
const RULER_H = 20;
const ROW_H = 18;
const CAMERA_FOLLOWING_SPACER_H = ROW_H;
const PX_PER_F = 6;
const PLAYHEAD_X_FALLBACK = 24;
const WAVEFORM_H = 22;
const ROTATION_OVERLAY_PAD_Y = 4;
const ROTATION_OVERLAY_MIN_RANGE = 15;
const ROTATION_OVERLAY_WRAP_BOUNDARY = 180;
const ROTATION_OVERLAY_WRAP_THRESHOLD = 180;
const TRACK_ROW_BG = "#1a1c22";
const TRACK_ROW_BG_SELECTED = "rgba(255,255,255,0.07)";
const CURRENT_FRAME_COLOR = "#ff4fa3";
const CURRENT_FRAME_GLOW = "rgba(255,79,163,0.5)";
const UI_FONT_FAMILY = "'Noto Sans CJK OTC', 'Noto Sans CJK JP', 'Segoe UI Variable', 'Segoe UI', 'Yu Gothic UI', 'Meiryo UI', sans-serif";
const SELECTION_KEY_SEPARATOR = "\u001f";
const RECT_SELECTION_THRESHOLD_PX = 4;
const FRAME_PAN_BUFFER_PX = 192;
const LIGHTWEIGHT_FRAME_REDRAW_PX = 144;
const MULTI_BONE_TRACK_ROW_BG = "rgba(57,197,187,0.12)";
const MULTI_BONE_LABEL_BG = "rgba(57,197,187,0.16)";
const HEADER_ROW_SELECTION_BG = "rgba(130,135,145,0.13)";
const HEADER_COLUMN_SELECTION_BG = "rgba(130,135,145,0.10)";
const EMPTY_FRAMES = new Uint32Array(0);

// ── Category palette ───────────────────────────────────────────────
const CAT = {
    root: { bg: "rgba(236,72,153,0.12)", kf: "#ec4899", text: "#f472b6", bar: "#ec4899" },
    camera: { bg: "rgba(57,197,187,0.11)", kf: "#39c5bb", text: "#7ddfd8", bar: "#39c5bb" },
    accessory: { bg: "rgba(245,158,11,0.11)", kf: "#f59e0b", text: "#fbbf24", bar: "#f59e0b" },
    light: { bg: "rgba(224,113,123,0.11)", kf: "#e0717b", text: "#efa2a9", bar: "#e0717b" },
    shadow: { bg: "rgba(111,159,218,0.11)", kf: "#6f9fda", text: "#a9c7ea", bar: "#6f9fda" },
    gravity: { bg: "rgba(217,143,183,0.11)", kf: "#d98fb7", text: "#ebbad4", bar: "#d98fb7" },
    property: { bg: "rgba(255,79,163,0.13)", kf: "#ff4fa3", text: "#ff8cc3", bar: "#ff4fa3" },
    "semi-standard": { bg: "rgba(99,102,241,0.08)", kf: "#818cf8", text: "#a5b4fc", bar: "" },
    bone: { bg: "rgba(57,197,187,0.08)", kf: "#39c5bb", text: "#7ddfd8", bar: "" },
    morph: { bg: "rgba(251,191,36,0.07)", kf: "#fbbf24", text: "#fcd34d", bar: "" },
} as const;

export function getTimelineTrackDisplayName(track: Pick<KeyframeTrack, "name" | "category">): string {
    switch (track.category) {
        case "camera":
            return "カメラ";
        case "accessory":
            return track.name;
        case "light":
            return "照明";
        case "shadow":
            return "影";
        case "gravity":
            return "重力";
        case "property":
            return "表示・IK";
        default:
            return track.name;
    }
}

// ── Binary search ──────────────────────────────────────────────────
function lowerBound(a: Uint32Array, v: number): number {
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < v) lo = m + 1; else hi = m; }
    return lo;
}
function upperBound(a: Uint32Array, v: number): number {
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] <= v) lo = m + 1; else hi = m; }
    return lo - 1;
}

function hasFrame(a: Uint32Array, v: number): boolean {
    const i = lowerBound(a, v);
    return i < a.length && a[i] === v;
}

function createSelectionKey(ref: TimelineKeySelectionRef): string {
    return createTimelineKeySelectionKey(ref);
}

function createBoneTrackSelectionKey(ref: TimelineBoneTrackSelectionRef): string {
    return `${ref.trackCategory}${SELECTION_KEY_SEPARATOR}${ref.trackName}`;
}

function isMultiSelectableBoneCategory(category: TrackCategory): boolean {
    return category === "root" || category === "semi-standard" || category === "bone";
}

function drawDiamondMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    fillStyle: string,
    strokeStyle: string | null = null,
    lineWidth = 1
): void {
    const half = size / 2;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + half);
    ctx.lineTo(x - half, y);
    ctx.closePath();
    ctx.fill();

    if (!strokeStyle) return;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + half);
    ctx.lineTo(x - half, y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

function drawXMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    strokeStyle: string,
    lineWidth = 2,
): void {
    const half = size / 2;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - half, y - half);
    ctx.lineTo(x + half, y + half);
    ctx.moveTo(x + half, y - half);
    ctx.lineTo(x - half, y + half);
    ctx.stroke();
    ctx.restore();
}

function resolveCssVarColor(name: string, fallback: string): string {
    const rootStyle = getComputedStyle(document.documentElement);
    const resolved = rootStyle.getPropertyValue(name).trim();
    return resolved || fallback;
}

function getCanvasRenderingContext2D(canvas: HTMLCanvasElement, label: string): CanvasRenderingContext2D {
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error(`Canvas 2D context is not available: ${label}`);
    }
    return context;
}

export class Timeline {
    // DOM
    private staticCanvas: HTMLCanvasElement;
    private staticCtx: CanvasRenderingContext2D;
    private overlayCanvas: HTMLCanvasElement;
    private overlayCtx: CanvasRenderingContext2D;
    private labelCanvas: HTMLCanvasElement;
    private labelCtx: CanvasRenderingContext2D;
    private waveformCanvas: HTMLCanvasElement | null;
    private waveformCtx: CanvasRenderingContext2D | null;
    private playheadTrackLine: HTMLDivElement;
    private labelsEl: HTMLElement;
    private trackScrollEl: HTMLElement;

    // State
    private currentFrame = 0;
    private totalFrames = 300;
    private tracks: KeyframeTrack[] = [];
    private viewOffset = 0;   // currentFrame * PX_PER_F
    private selectedTrackIndex = -1;
    private selectedFrame: number | null = null;
    private selectedKeySet = new Set<string>();
    private selectedBoneTrackSet = new Set<string>();
    private selectionAnchor: TimelineKeySelectionRef | null = null;
    private activeHeaderSelectionAxis: TimelineHeaderSelectionAxis = null;
    private selectedRowHeaderSet = new Set<string>();
    private selectedFrameColumnSet = new Set<number>();
    private rowHeaderSelectionAnchor: TimelineRowSelectionRef | null = null;
    private frameColumnSelectionAnchor: number | null = null;
    private pendingPointerSelection: {
        startX: number;
        startY: number;
        additive: boolean;
        event: MouseEvent;
    } | null = null;
    private rectangleSelection: {
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        baseSelection: Set<string>;
        additive: boolean;
    } | null = null;
    private timelinePan: {
        startClientX: number;
        startClientY: number;
        startFrame: number;
        startScrollTop: number;
        lastFrame: number;
        horizontalSeekStarted: boolean;
    } | null = null;
    private waveformPeaks: Float32Array | null = null;
    private rotationOverlay: TimelineRotationOverlay | null = null;
    private staticRenderViewOffset = 0;
    private waveformRenderViewOffset = 0;

    // RAF
    private staticRaf: number | null = null;
    private overlayRaf: number | null = null;
    private labelRaf: number | null = null;
    private waveformRaf: number | null = null;

    // Scroll sync guard
    private syncingScroll = false;

    public onSelectionChanged: ((track: KeyframeTrack | null, frame: number | null) => void) | null = null;
    public onKeySelectionChanged: ((change: TimelineSelectionChange) => void) | null = null;
    public onSeek: ((frame: number, phase: TimelineSeekPhase) => void) | null = null;

    // ── Constructor ─────────────────────────────────────────────────

    constructor(
        staticCanvasId: string,
        trackScrollId: string,
        labelCanvasId: string,
        labelsElId: string,
    ) {
        this.staticCanvas = document.getElementById(staticCanvasId) as HTMLCanvasElement;
        this.overlayCanvas = document.getElementById("timeline-overlay-canvas") as HTMLCanvasElement;
        this.trackScrollEl = document.getElementById(trackScrollId) as HTMLElement;
        this.labelCanvas = document.getElementById(labelCanvasId) as HTMLCanvasElement;
        this.waveformCanvas = document.getElementById("timeline-waveform-canvas") as HTMLCanvasElement | null;
        this.labelsEl = document.getElementById(labelsElId) as HTMLElement;

        this.staticCtx = getCanvasRenderingContext2D(this.staticCanvas, staticCanvasId);
        this.overlayCtx = getCanvasRenderingContext2D(this.overlayCanvas, "timeline-overlay-canvas");
        this.labelCtx = getCanvasRenderingContext2D(this.labelCanvas, labelCanvasId);
        this.waveformCtx = this.waveformCanvas?.getContext("2d") ?? null;
        this.playheadTrackLine = this.createPlayheadTrackLine();

        this.setupEvents();
        this.resize();

        const ro = new ResizeObserver(() => this.resize());
        ro.observe(this.trackScrollEl);
        ro.observe(this.labelsEl);
    }

    // ── Events ──────────────────────────────────────────────────────

    private setupEvents(): void {
        const panSurfaces = [this.trackScrollEl, this.overlayCanvas, this.labelsEl];
        for (const surface of panSurfaces) {
            surface.addEventListener("mousedown", (e) => this.beginTimelinePan(e), { capture: true });
            surface.addEventListener("auxclick", (e) => {
                if (e.button === 1) e.preventDefault();
            }, { capture: true });
        }
        window.addEventListener("mousemove", (e) => this.updateTimelinePan(e));
        window.addEventListener("mouseup", (e) => this.endTimelinePan(e));

        // Seek and select: static layer
        this.staticCanvas.style.pointerEvents = "auto";
        this.staticCanvas.addEventListener("mousedown", (e) => {
            this.beginStaticPointerSelection(e);
        });
        window.addEventListener("mousemove", (e) => this.updateStaticPointerSelection(e));
        window.addEventListener("mouseup", (e) => this.endStaticPointerSelection(e));

        // Frame-column header selection and seek: overlay layer
        this.overlayCanvas.style.pointerEvents = "auto";
        this.overlayCanvas.addEventListener("mousedown", (e) => {
            this.selectFrameColumnFromRulerEvent(e);
        });
        this.overlayCanvas.addEventListener("dblclick", (e) => {
            this.selectKeysFromFrameColumnSelectionEvent(e);
        });

        // Select from labels
        this.labelCanvas.style.pointerEvents = "auto";
        this.labelCanvas.addEventListener("mousedown", (e) => {
            this.selectRowHeaderFromLabelEvent(e);
        });
        this.labelCanvas.addEventListener("dblclick", (e) => {
            this.selectKeysFromRowHeaderSelectionEvent(e);
        });

        // ── Bidirectional scroll sync ──────────────────────────────
        this.trackScrollEl.addEventListener("scroll", () => {
            if (this.syncingScroll) return;
            this.syncingScroll = true;
            this.labelsEl.scrollTop = this.trackScrollEl.scrollTop;
            this.syncingScroll = false;
            this.scheduleStatic();  // redraw after vertical scroll
        }, { passive: true });

        this.labelsEl.addEventListener("scroll", () => {
            if (this.syncingScroll) return;
            this.syncingScroll = true;
            this.trackScrollEl.scrollTop = this.labelsEl.scrollTop;
            this.syncingScroll = false;
            this.scheduleStatic();
        }, { passive: true });
    }

    private beginTimelinePan(e: MouseEvent): void {
        if (e.button !== 1) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        this.timelinePan = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startFrame: this.currentFrame,
            startScrollTop: this.trackScrollEl.scrollTop,
            lastFrame: this.currentFrame,
            horizontalSeekStarted: false,
        };
        this.trackScrollEl.closest("#timeline-container")?.classList.add("timeline-panning");
    }

    private updateTimelinePan(e: MouseEvent): void {
        const pan = this.timelinePan;
        if (!pan) return;
        if ((e.buttons & 4) === 0) {
            this.endTimelinePan(e);
            return;
        }

        e.preventDefault();
        const deltaX = e.clientX - pan.startClientX;
        const deltaY = e.clientY - pan.startClientY;
        this.trackScrollEl.scrollTop = pan.startScrollTop + deltaY;

        const frame = Math.max(0, Math.min(this.totalFrames, Math.round(pan.startFrame + deltaX / PX_PER_F)));
        if (frame === pan.lastFrame) return;

        const phase: TimelineSeekPhase = pan.horizontalSeekStarted ? "dragMove" : "dragStart";
        pan.horizontalSeekStarted = true;
        pan.lastFrame = frame;
        if (this.onSeek) this.onSeek(frame, phase);
        else this.setCurrentFrame(frame);
    }

    private endTimelinePan(e: MouseEvent): void {
        if (e.button !== 1 && this.timelinePan && (e.buttons & 4) !== 0) return;
        const pan = this.timelinePan;
        if (!pan) return;

        e.preventDefault();
        this.timelinePan = null;
        this.trackScrollEl.closest("#timeline-container")?.classList.remove("timeline-panning");
        if (pan.horizontalSeekStarted) this.onSeek?.(pan.lastFrame, "dragEnd");
    }

    private getPlayheadX(): number {
        const labelWidth = this.labelsEl.clientWidth;
        const trackWidth = this.trackScrollEl.clientWidth;
        if (labelWidth <= 0 || trackWidth <= 0) return PLAYHEAD_X_FALLBACK;
        return Math.max(12, Math.round((trackWidth - labelWidth) / 2));
    }

    private getBufferedPlayheadX(): number {
        return this.getPlayheadX() + FRAME_PAN_BUFFER_PX;
    }

    // ── Public API ───────────────────────────────────────────────────

    setCurrentFrame(frame: number, options: TimelineFrameUpdateOptions = {}): void {
        const normalized = Math.max(0, Math.floor(frame));
        if (this.currentFrame === normalized) return;
        this.currentFrame = normalized;
        this.viewOffset = normalized * PX_PER_F;
        this.scheduleOverlay(); // ruler + playhead
        if (options.lightweight) {
            this.applyFrameCanvasPan();
            if (Math.abs(this.viewOffset - this.staticRenderViewOffset) >= LIGHTWEIGHT_FRAME_REDRAW_PX) {
                this.scheduleStatic();
            }
            if (Math.abs(this.viewOffset - this.waveformRenderViewOffset) >= LIGHTWEIGHT_FRAME_REDRAW_PX) {
                this.scheduleWaveform();
            }
            return;
        }
        this.scheduleStatic();  // keyframe dots scroll with playhead
        this.scheduleWaveform();
    }

    refreshFrameContent(): void {
        this.scheduleStatic();
        this.scheduleOverlay();
        this.scheduleWaveform();
    }

    setTotalFrames(total: number): void {
        const normalized = Math.max(0, Math.floor(total));
        if (this.totalFrames === normalized) return;
        this.totalFrames = normalized;
        this.selectedFrameColumnSet = new Set(
            Array.from(this.selectedFrameColumnSet).filter((frame) => frame <= normalized),
        );
        if (this.selectedFrameColumnSet.size === 0 && this.activeHeaderSelectionAxis === "column") {
            this.clearHeaderSelectionState();
        }
        this.scheduleOverlay();
        this.scheduleStatic();
        this.scheduleWaveform();
    }

    setWaveformPeaks(peaks: Float32Array | null): void {
        this.waveformPeaks = peaks;
        this.scheduleWaveform();
    }

    setKeyframeTracks(tracks: KeyframeTrack[], options: { resetSelection?: boolean } = {}): void {
        const prevSelectedTrack = this.getSelectedTrack();
        this.tracks = tracks;
        if (options.resetSelection) {
            this.selectedTrackIndex = this.tracks.length > 0 ? 0 : -1;
            this.selectedFrame = null;
            this.selectedKeySet.clear();
            this.selectedBoneTrackSet.clear();
            this.selectionAnchor = null;
            this.clearHeaderSelectionState();
        }
        this.reconcileSelection(prevSelectedTrack);
        this.resize();
    }

    setSelectedTrackRotationOverlay(overlay: TimelineRotationOverlay | null): void {
        this.rotationOverlay = overlay;
        this.scheduleStatic();
    }

    getSelectedTrack(): KeyframeTrack | null {
        if (this.selectedTrackIndex < 0 || this.selectedTrackIndex >= this.tracks.length) {
            return null;
        }
        return this.tracks[this.selectedTrackIndex];
    }

    getSelectedFrame(): number | null {
        return this.selectedFrame;
    }

    getSelectedKeys(): TimelineKeySelectionRef[] {
        return this.getSelectedKeyRefsFromSet(this.selectedKeySet);
    }

    getKeyframeTracks(): readonly KeyframeTrack[] {
        return this.tracks;
    }

    countKeysByCategories(categories: readonly TrackCategory[]): number {
        const categorySet = new Set(categories);
        let count = 0;
        for (const track of this.tracks) {
            if (categorySet.has(track.category)) count += track.frames.length;
        }
        return count;
    }

    selectAllKeysByCategories(categories: readonly TrackCategory[]): boolean {
        const categorySet = new Set(categories);
        const refs: TimelineKeySelectionRef[] = [];
        for (const track of this.tracks) {
            if (!categorySet.has(track.category)) continue;
            for (const frame of track.frames) refs.push(this.createSelectionRef(track, frame));
        }
        if (refs.length === 0) return false;
        this.applyKeySelectionRefs(refs);
        return true;
    }

    getHeaderSelection(): TimelineHeaderSelectionSnapshot {
        return {
            axis: this.activeHeaderSelectionAxis,
            rows: this.getSelectedRowHeaderRefs(),
            frames: Array.from(this.selectedFrameColumnSet).sort((a, b) => a - b),
        };
    }

    getSelectedBoneTracks(): TimelineBoneTrackSelectionRef[] {
        return this.getSelectedBoneTrackRefsFromSet(this.selectedBoneTrackSet);
    }

    hasMultipleSelectedKeys(): boolean {
        return this.selectedKeySet.size > 1;
    }

    hasMultipleSelectedBoneTracks(): boolean {
        return this.selectedBoneTrackSet.size > 1;
    }

    setSelectedKeys(keys: readonly TimelineKeySelectionRef[], activeKey: TimelineKeySelectionRef | null = null): void {
        this.clearHeaderSelectionState();
        this.selectedKeySet = this.createNormalizedSelectionSet(keys);
        this.selectedBoneTrackSet.clear();
        const active = activeKey && this.hasSelectionRef(activeKey)
            ? activeKey
            : this.getSelectedKeys()[0] ?? null;
        this.applyActiveSelection(active);
        this.selectionAnchor = active;
        this.scheduleStatic();
        this.scheduleLabel();
        this.emitSelectionChanged();
    }

    clearSelectedKeys(options: { keepActiveTrack?: boolean; clearActiveFrame?: boolean } = {}): void {
        this.selectedKeySet.clear();
        this.selectionAnchor = null;
        if (options.clearActiveFrame || !options.keepActiveTrack) {
            this.selectedFrame = null;
        }
        this.scheduleStatic();
        this.scheduleLabel();
        this.emitSelectionChanged();
    }

    clearAllSelections(options: { keepActiveTrack?: boolean } = {}): void {
        this.selectedKeySet.clear();
        this.selectedBoneTrackSet.clear();
        this.selectionAnchor = null;
        this.clearHeaderSelectionState();
        this.selectedFrame = null;
        if (!options.keepActiveTrack) this.selectedTrackIndex = -1;
        this.resize();
        this.emitSelectionChanged();
    }

    setSelectedFrame(frame: number | null): void {
        this.clearHeaderSelectionState();
        const track = this.getSelectedTrack();
        if (!track) {
            this.selectedFrame = null;
            this.selectedKeySet.clear();
            this.selectedBoneTrackSet.clear();
            this.selectionAnchor = null;
            this.emitSelectionChanged();
            return;
        }

        const normalizedFrame = frame === null ? null : Math.max(0, Math.floor(frame));
        if (normalizedFrame === null || !hasFrame(track.frames, normalizedFrame)) {
            this.selectedFrame = null;
            this.selectedKeySet.clear();
            this.selectedBoneTrackSet.clear();
            this.selectionAnchor = null;
        } else {
            this.selectedFrame = normalizedFrame;
            const ref = this.createSelectionRef(track, normalizedFrame);
            this.selectedKeySet = new Set([createSelectionKey(ref)]);
            this.selectedBoneTrackSet.clear();
            this.selectionAnchor = ref;
        }
        this.scheduleStatic();
        this.emitSelectionChanged();
    }

    selectTrackByNameAndCategory(name: string, categories: readonly TrackCategory[]): boolean {
        if (this.tracks.length === 0) return false;

        let targetIndex = -1;
        for (const category of categories) {
            targetIndex = this.tracks.findIndex((track) => track.name === name && track.category === category);
            if (targetIndex >= 0) break;
        }
        if (targetIndex < 0) return false;

        const changed = this.selectedTrackIndex !== targetIndex || this.selectedFrame !== null;
        this.selectedTrackIndex = targetIndex;
        this.selectedFrame = null;
        this.selectedKeySet.clear();
        this.selectedBoneTrackSet = this.createSingleBoneTrackSelectionSet(this.tracks[targetIndex]);
        this.selectionAnchor = null;
        this.clearHeaderSelectionState();
        this.resize();
        if (changed) {
            this.emitSelectionChanged();
        }
        return true;
    }

    selectBoneTrackByName(name: string, options: { additive?: boolean } = {}): boolean {
        const targetIndex = this.findBoneTrackIndexByName(name);
        if (targetIndex < 0) return false;

        const previousSelectedTrackIndex = this.selectedTrackIndex;
        const track = this.tracks[targetIndex];
        this.selectedFrame = null;
        this.selectedKeySet.clear();
        this.selectedBoneTrackSet.clear();
        this.selectionAnchor = null;
        this.clearHeaderSelectionState();

        if (options.additive === true) {
            const activeRef = this.toggleBoneTrackSelection(track);
            this.selectedTrackIndex = activeRef
                ? this.findTrackIndexByBoneTrackRef(activeRef)
                : targetIndex;
        } else {
            this.selectedTrackIndex = targetIndex;
            this.selectedBoneTrackSet = this.createSingleBoneTrackSelectionSet(track);
        }

        if (this.selectedTrackIndex !== previousSelectedTrackIndex) this.resize();
        else {
            this.scheduleStatic();
            this.scheduleLabel();
        }
        this.emitSelectionChanged();
        return true;
    }

    // ── Resize ───────────────────────────────────────────────────────

    resize(): void {
        const dpr = window.devicePixelRatio || 1;
        // Keep the track area scroll range aligned with the label column.
        // The label canvas includes the ruler row at the top, so the track canvas
        // gets a matching spacer at the bottom to avoid scroll drift near the end.
        const trackRowsH = this.getTrackRowsHeight();
        const trackContentH = trackRowsH + RULER_H;
        const tw = this.trackScrollEl.clientWidth || 400;
        const bufferedTrackWidth = tw + FRAME_PAN_BUFFER_PX * 2;

        // Static canvas (track rows + bottom spacer to match the label column height)
        this.staticCanvas.width = bufferedTrackWidth * dpr;
        this.staticCanvas.height = trackContentH * dpr;
        this.staticCanvas.style.width = `${bufferedTrackWidth}px`;
        this.staticCanvas.style.height = `${trackContentH}px`;
        this.staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.setStaticCanvasTransform();

        // Overlay canvas (ruler, RULER_H tall, full width, above scroll)
        this.overlayCanvas.width = tw * dpr;
        this.overlayCanvas.height = RULER_H * dpr;
        this.overlayCanvas.style.width = `${tw}px`;
        this.overlayCanvas.style.height = `${RULER_H}px`;
        this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Label canvas (ruler row + all track rows = same total as static + RULER_H)
        const lw = this.labelsEl.clientWidth || 52;
        const totalH = RULER_H + trackRowsH;
        this.labelCanvas.width = lw * dpr;
        this.labelCanvas.height = totalH * dpr;
        this.labelCanvas.style.width = `${lw}px`;
        this.labelCanvas.style.height = `${totalH}px`;
        this.labelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (this.waveformCanvas && this.waveformCtx) {
            this.waveformCanvas.width = bufferedTrackWidth * dpr;
            this.waveformCanvas.height = WAVEFORM_H * dpr;
            this.waveformCanvas.style.width = `${bufferedTrackWidth}px`;
            this.waveformCanvas.style.height = `${WAVEFORM_H}px`;
            this.waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.setWaveformCanvasTransform();
        }

        this.positionPlayheadTrackLine();
        this.scheduleStatic();
        this.scheduleOverlay();
        this.scheduleLabel();
        this.scheduleWaveform();
    }

    // ── RAF schedulers ────────────────────────────────────────────────

    private scheduleStatic(): void {
        if (this.staticRaf !== null) return;
        this.staticRaf = requestAnimationFrame(() => {
            this.staticRaf = null;
            this.drawStatic();
        });
    }
    private scheduleOverlay(): void {
        if (this.overlayRaf !== null) return;
        this.overlayRaf = requestAnimationFrame(() => {
            this.overlayRaf = null;
            this.drawOverlay();
        });
    }
    private scheduleLabel(): void {
        if (this.labelRaf !== null) return;
        this.labelRaf = requestAnimationFrame(() => {
            this.labelRaf = null;
            this.drawLabel();
        });
    }
    private scheduleWaveform(): void {
        if (this.waveformRaf !== null || !this.waveformCanvas || !this.waveformCtx) return;
        this.waveformRaf = requestAnimationFrame(() => {
            this.waveformRaf = null;
            this.drawWaveform();
        });
    }

    // ── Static layer: track row bgs + keyframe dots ──────────────────

    private drawStatic(): void {
        const ctx = this.staticCtx;
        this.staticRenderViewOffset = this.viewOffset;
        this.setStaticCanvasTransform();
        const w = this.staticCanvas.width / (window.devicePixelRatio || 1);
        const h = this.staticCanvas.height / (window.devicePixelRatio || 1);
        const playheadX = this.getBufferedPlayheadX();

        ctx.fillStyle = "#12121a";
        ctx.fillRect(0, 0, w, h);

        if (this.tracks.length === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.03)";
            ctx.fillRect(0, 0, w, ROW_H);
            return;
        }

        const visStart = Math.max(0, Math.floor((this.viewOffset - playheadX) / PX_PER_F));
        const visEnd = Math.min(this.totalFrames, visStart + Math.ceil(w / PX_PER_F) + 2);
        const selectedFramesByTrack = this.getSelectedFramesByTrackKey();

        // Vertical culling: only draw rows visible in the scroll viewport
        const scrollTop = this.trackScrollEl.scrollTop;
        const viewH = this.trackScrollEl.clientHeight || h;
        const firstRow = this.getRowIndexAtOffset(scrollTop, true);
        const lastRow = this.getRowIndexAtOffset(scrollTop + viewH, true);

        for (let i = firstRow; i <= lastRow; i++) {
            const track = this.tracks[i];
            const ry = this.getRowTop(i);   // NO ruler offset – ruler is outside scroll
            const rowH = ROW_H;
            const col = CAT[track.category];
            const isSelectedRow = i === this.selectedTrackIndex;
            const isSelectedBoneTrack = this.selectedBoneTrackSet.has(this.createTrackSelectionKey(track));
            const isSelectedHeaderRow = this.activeHeaderSelectionAxis === "row"
                && this.selectedRowHeaderSet.has(createTimelineRowSelectionKey(this.createRowSelectionRef(track)));

            ctx.fillStyle = TRACK_ROW_BG;
            ctx.fillRect(0, ry, w, rowH);

            if (isSelectedBoneTrack) {
                ctx.fillStyle = MULTI_BONE_TRACK_ROW_BG;
                ctx.fillRect(0, ry, w, rowH);
            }

            if (isSelectedRow) {
                ctx.fillStyle = TRACK_ROW_BG_SELECTED;
                ctx.fillRect(0, ry, w, rowH);
            }

            if (isSelectedHeaderRow) {
                ctx.fillStyle = HEADER_ROW_SELECTION_BG;
                ctx.fillRect(0, ry, w, rowH);
            }

            this.drawSelectedFrameColumnBands(ctx, ry, rowH, playheadX, visStart, visEnd);

            // Row separator
            ctx.fillStyle = "rgba(255,255,255,0.04)";
            ctx.fillRect(0, ry + rowH - 1, w, 1);

            if (isSelectedRow) {
                this.drawSelectedTrackRotationOverlay(ctx, track, ry, rowH, visStart, visEnd, w);
            }

            // Keyframe markers (binary search)
            const frames = track.frames;
            const lo = lowerBound(frames, visStart);
            const hi = upperBound(frames, visEnd);
            const markerSize = track.category === "root" ? 9 : (track.category === "camera" || track.category === "accessory" || track.category === "light" || track.category === "shadow" || track.category === "gravity") ? 8 : 6;
            const midY = ry + rowH / 2;
            const selectedFrames = selectedFramesByTrack.get(this.createTrackSelectionKey(track));
            const physicsOnFrames = track.physicsOnFrames ?? EMPTY_FRAMES;
            const virtualPhysicsOnFrames = track.virtualPhysicsOnFrames ?? EMPTY_FRAMES;

            for (let k = lo; k <= hi && k < frames.length; k++) {
                const sx = frames[k] * PX_PER_F - this.viewOffset + playheadX;
                if (sx < -markerSize || sx > w + markerSize) continue;
                const isPhysicsOnKey = hasFrame(physicsOnFrames, frames[k]);
                if (isPhysicsOnKey) {
                    drawXMarker(ctx, sx, midY, markerSize + 2, col.kf);
                } else {
                    drawDiamondMarker(ctx, sx, midY, markerSize, col.kf);
                }

                const isSelectedKey = selectedFrames?.has(frames[k]) ?? false;
                const isActiveKey = isSelectedRow && this.selectedFrame !== null && frames[k] === this.selectedFrame;
                if (isSelectedKey || isActiveKey) {
                    const fill = isActiveKey ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.09)";
                    const stroke = isActiveKey ? "#ffffff" : "rgba(255,255,255,0.72)";
                    drawDiamondMarker(ctx, sx, midY, markerSize + 4, fill, stroke, isActiveKey ? 1.5 : 1);
                    if (isPhysicsOnKey) {
                        drawXMarker(ctx, sx, midY, markerSize + 2, col.kf);
                    } else {
                        drawDiamondMarker(ctx, sx, midY, markerSize, col.kf);
                    }
                }
            }

            const virtualLo = lowerBound(virtualPhysicsOnFrames, visStart);
            const virtualHi = upperBound(virtualPhysicsOnFrames, visEnd);
            for (let k = virtualLo; k <= virtualHi && k < virtualPhysicsOnFrames.length; k++) {
                const frame = virtualPhysicsOnFrames[k];
                if (hasFrame(frames, frame)) continue;
                const sx = frame * PX_PER_F - this.viewOffset + playheadX;
                if (sx < -markerSize || sx > w + markerSize) continue;
                drawXMarker(ctx, sx, midY, markerSize + 2, col.kf);
            }
        }

        // Major frame vertical grid
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        for (let f = Math.ceil(visStart / 10) * 10; f <= visEnd; f += 10) {
            const sx = f * PX_PER_F - this.viewOffset + playheadX;
            ctx.fillRect(sx, 0, 1, h);
        }

        this.drawRectangleSelection(ctx);

    }

    // ── Overlay layer: ruler + playhead diamond ──────────────────────

    private drawOverlay(): void {
        const ctx = this.overlayCtx;
        const w = this.overlayCanvas.width / (window.devicePixelRatio || 1);
        const playheadX = this.getPlayheadX();

        ctx.fillStyle = "#0e0e1a";
        ctx.fillRect(0, 0, w, RULER_H);

        // Bottom border
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, RULER_H - 1, w, 1);

        const visStart = Math.max(0, Math.floor((this.viewOffset - playheadX) / PX_PER_F));
        const visEnd = Math.min(this.totalFrames, visStart + Math.ceil(w / PX_PER_F) + 2);

        this.drawSelectedFrameColumnBands(ctx, 0, RULER_H, playheadX, visStart, visEnd);

        // Ruler ticks + labels
        for (let f = visStart; f <= visEnd; f++) {
            const sx = f * PX_PER_F - this.viewOffset + playheadX;
            const isMajor = f % 10 === 0;
            const isMid = f % 5 === 0 && !isMajor;

            const tickH = isMajor ? 9 : isMid ? 5 : 3;
            ctx.fillStyle = isMajor ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)";
            ctx.fillRect(sx, RULER_H - tickH, 1, tickH);

            if (isMajor) {
                ctx.font = `500 9px ${UI_FONT_FAMILY}`;
                ctx.fillStyle = "#6b7280";
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                ctx.fillText(String(f), sx + 2, 2);
            }
        }

        // Playhead diamond
        const px = playheadX;
        ctx.fillStyle = CURRENT_FRAME_COLOR;
        ctx.beginPath();
        ctx.moveTo(px - 6, 0);
        ctx.lineTo(px + 6, 0);
        ctx.lineTo(px + 6, RULER_H - 6);
        ctx.lineTo(px, RULER_H);
        ctx.lineTo(px - 6, RULER_H - 6);
        ctx.closePath();
        ctx.fill();

        // Frame number
        ctx.font = `600 8px ${UI_FONT_FAMILY}`;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(String(this.currentFrame), px, 3);
    }

    private drawWaveform(): void {
        if (!this.waveformCanvas || !this.waveformCtx) return;

        const ctx = this.waveformCtx;
        this.waveformRenderViewOffset = this.viewOffset;
        this.setWaveformCanvasTransform();
        const w = this.waveformCanvas.width / (window.devicePixelRatio || 1);
        const h = this.waveformCanvas.height / (window.devicePixelRatio || 1);
        const midY = h / 2;
        const playheadX = this.getBufferedPlayheadX();

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#0c0c14";
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(0, h - 1, w, 1);

        const visStart = Math.max(0, Math.floor((this.viewOffset - playheadX) / PX_PER_F));
        const visEnd = Math.min(this.totalFrames, visStart + Math.ceil(w / PX_PER_F) + 2);

        for (let f = Math.ceil(visStart / 10) * 10; f <= visEnd; f += 10) {
            const sx = f * PX_PER_F - this.viewOffset + playheadX;
            ctx.fillStyle = "rgba(255,255,255,0.035)";
            ctx.fillRect(sx, 0, 1, h);
        }

        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(0, Math.round(midY), w, 1);

        if (this.waveformPeaks && this.waveformPeaks.length > 0) {
            ctx.strokeStyle = "rgba(57,197,187,0.95)";
            ctx.lineWidth = 1;
            ctx.beginPath();

            const peakEnd = Math.min(visEnd, this.waveformPeaks.length - 1);
            for (let frame = Math.max(0, visStart); frame <= peakEnd; frame += 1) {
                const peak = Math.max(0, Math.min(1, this.waveformPeaks[frame] ?? 0));
                const amp = Math.max(1, peak * (midY - 2));
                const sx = Math.round(frame * PX_PER_F - this.viewOffset + playheadX) + 0.5;
                ctx.moveTo(sx, midY - amp);
                ctx.lineTo(sx, midY + amp);
            }
            ctx.stroke();
        } else {
            ctx.font = `500 10px ${UI_FONT_FAMILY}`;
            ctx.fillStyle = "rgba(255,255,255,0.24)";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText("Waveform", 8, midY);
        }

    }

    private applyFrameCanvasPan(): void {
        const staticDelta = this.staticRenderViewOffset - this.viewOffset;
        this.setStaticCanvasTransform(staticDelta);

        if (!this.waveformCanvas) return;
        const waveformDelta = this.waveformRenderViewOffset - this.viewOffset;
        this.setWaveformCanvasTransform(waveformDelta);
    }

    private setStaticCanvasTransform(deltaX = 0): void {
        const x = Math.round(deltaX - FRAME_PAN_BUFFER_PX);
        this.staticCanvas.style.transform = `translateX(${x}px)`;
    }

    private setWaveformCanvasTransform(deltaX = 0): void {
        if (!this.waveformCanvas) return;
        const x = Math.round(deltaX - FRAME_PAN_BUFFER_PX);
        this.waveformCanvas.style.transform = `translateX(${x}px)`;
    }

    private createPlayheadTrackLine(): HTMLDivElement {
        const line = document.createElement("div");
        line.className = "timeline-playhead-track-line";
        line.style.position = "absolute";
        line.style.top = `${RULER_H}px`;
        line.style.bottom = "0";
        line.style.width = "1px";
        line.style.pointerEvents = "none";
        line.style.zIndex = "4";
        line.style.background = CURRENT_FRAME_GLOW;
        line.style.boxShadow = `0 0 6px ${CURRENT_FRAME_GLOW}`;
        this.trackScrollEl.parentElement?.appendChild(line);
        return line;
    }

    private positionPlayheadTrackLine(): void {
        this.playheadTrackLine.style.left = `${this.getPlayheadX()}px`;
    }

    // ── Label column ─────────────────────────────────────────────────

    private drawLabel(): void {
        const ctx = this.labelCtx;
        const w = this.labelCanvas.width / (window.devicePixelRatio || 1);
        const h = this.labelCanvas.height / (window.devicePixelRatio || 1);

        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, w, h);

        // Ruler row bg (same height as overlay ruler)
        ctx.fillStyle = "#0e0e1a";
        ctx.fillRect(0, 0, w, RULER_H);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, RULER_H - 1, w, 1);

        if (this.tracks.length === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.font = `500 10px ${UI_FONT_FAMILY}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("F", w / 2, RULER_H + ROW_H / 2);
            return;
        }

        for (let i = 0; i < this.tracks.length; i++) {
            const track = this.tracks[i];
            const rowH = ROW_H;
            const y = RULER_H + this.getRowTop(i);
            const col = CAT[track.category];
            const isSelectedRow = i === this.selectedTrackIndex;
            const isSelectedBoneTrack = this.selectedBoneTrackSet.has(this.createTrackSelectionKey(track));
            const isSelectedHeaderRow = this.activeHeaderSelectionAxis === "row"
                && this.selectedRowHeaderSet.has(createTimelineRowSelectionKey(this.createRowSelectionRef(track)));

            ctx.fillStyle = col.bg;
            ctx.fillRect(0, y, w, rowH);

            if (isSelectedBoneTrack) {
                ctx.fillStyle = MULTI_BONE_LABEL_BG;
                ctx.fillRect(0, y, w, rowH);
            }

            if (isSelectedRow) {
                ctx.fillStyle = "rgba(255,255,255,0.08)";
                ctx.fillRect(0, y, w, rowH);
            }

            if (isSelectedHeaderRow) {
                ctx.fillStyle = HEADER_ROW_SELECTION_BG;
                ctx.fillRect(0, y, w, rowH);
            }

            if (col.bar) {
                ctx.fillStyle = col.bar;
                ctx.fillRect(0, y, 2, rowH);
            }

            ctx.save();
            ctx.beginPath();
            ctx.rect(4, y, w - 6, rowH);
            ctx.clip();
            ctx.font = (track.category === "root" || track.category === "camera" || track.category === "accessory" || track.category === "light" || track.category === "shadow" || track.category === "gravity")
                ? `600 10px ${UI_FONT_FAMILY}`
                : `400 9px ${UI_FONT_FAMILY}`;
            ctx.fillStyle = col.text;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(getTimelineTrackDisplayName(track), 6, y + rowH / 2);
            ctx.restore();

            ctx.fillStyle = "rgba(255,255,255,0.04)";
            ctx.fillRect(0, y + rowH - 1, w, 1);
        }
    }

    private beginStaticPointerSelection(e: MouseEvent): void {
        if (e.button !== 0) return;

        const rect = this.staticCanvas.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const row = this.getRowIndexAtOffset(localY);
        if (row < 0 || row >= this.tracks.length) return;

        e.preventDefault();
        this.pendingPointerSelection = {
            startX: localX,
            startY: localY,
            additive: e.ctrlKey || e.metaKey,
            event: e,
        };
    }

    private updateStaticPointerSelection(e: MouseEvent): void {
        const pending = this.pendingPointerSelection;
        if (!pending) return;

        const point = this.getStaticCanvasPoint(e);
        const dragDistance = Math.max(
            Math.abs(point.x - pending.startX),
            Math.abs(point.y - pending.startY),
        );

        if (!this.rectangleSelection && dragDistance < RECT_SELECTION_THRESHOLD_PX) return;
        if (!this.rectangleSelection) {
            this.clearHeaderSelectionState();
            this.rectangleSelection = {
                startX: pending.startX,
                startY: pending.startY,
                currentX: point.x,
                currentY: point.y,
                baseSelection: pending.additive ? new Set(this.selectedKeySet) : new Set<string>(),
                additive: pending.additive,
            };
        } else {
            this.rectangleSelection.currentX = point.x;
            this.rectangleSelection.currentY = point.y;
        }

        this.applyRectangleSelection();
        this.scheduleStatic();
    }

    private endStaticPointerSelection(e: MouseEvent): void {
        const pending = this.pendingPointerSelection;
        if (!pending) return;

        if (this.rectangleSelection) {
            this.rectangleSelection.currentX = this.getStaticCanvasPoint(e).x;
            this.rectangleSelection.currentY = this.getStaticCanvasPoint(e).y;
            this.applyRectangleSelection();
            this.rectangleSelection = null;
            this.pendingPointerSelection = null;
            this.scheduleStatic();
            this.scheduleLabel();
            this.emitSelectionChanged();
            return;
        }

        this.pendingPointerSelection = null;
        this.selectTrackFromStaticEvent(pending.event);
    }

    private selectTrackFromStaticEvent(e: MouseEvent): void {
        const rect = this.staticCanvas.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const row = this.getRowIndexAtOffset(localY);
        if (row < 0 || row >= this.tracks.length) return;

        const selectionChanged = this.selectedTrackIndex !== row;
        this.clearHeaderSelectionState();
        this.selectedTrackIndex = row;
        const pickedFrame = this.pickFrameOnTrackFromX(this.tracks[row], localX);
        if (pickedFrame === null) {
            this.selectedBoneTrackSet = this.createSingleBoneTrackSelectionSet(this.tracks[row]);
        }
        this.applyKeySelectionFromPointer(this.tracks[row], pickedFrame, e);
        if (selectionChanged) this.resize();
        else {
            this.scheduleStatic();
            this.scheduleLabel();
        }
        this.emitSelectionChanged();
    }

    private selectKeysFromRowHeaderSelectionEvent(e: MouseEvent): void {
        if (e.button !== 0 || this.hasHeaderSelectionModifier(e)) return;

        const { viewportY, contentY } = this.getLabelPointerY(e);
        if (viewportY >= 0 && viewportY < RULER_H) {
            this.selectAllKeysFromAllTracks();
            return;
        }

        const row = this.getRowIndexAtOffset(contentY - RULER_H);
        if (row < 0 || row >= this.tracks.length) return;

        const target = this.createRowSelectionRef(this.tracks[row]);
        if (this.activeHeaderSelectionAxis !== "row" || !this.selectedRowHeaderSet.has(createTimelineRowSelectionKey(target))) {
            this.selectedRowHeaderSet = new Set([createTimelineRowSelectionKey(target)]);
        }
        const refs: TimelineKeySelectionRef[] = [];
        for (const track of this.tracks) {
            if (!this.selectedRowHeaderSet.has(createTimelineRowSelectionKey(this.createRowSelectionRef(track)))) continue;
            for (const frame of track.frames) refs.push(this.createSelectionRef(track, frame));
        }
        this.applyKeySelectionRefs(refs);
    }

    private selectKeysFromFrameColumnSelectionEvent(e: MouseEvent): void {
        if (e.button !== 0 || this.hasHeaderSelectionModifier(e)) return;

        const rect = this.overlayCanvas.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) return;

        const frame = Math.max(0, Math.round(this.frameFromRulerCanvasX(localX)));
        if (this.activeHeaderSelectionAxis !== "column" || !this.selectedFrameColumnSet.has(frame)) {
            this.selectedFrameColumnSet = new Set([frame]);
        }
        const refs: TimelineKeySelectionRef[] = [];
        for (const track of this.tracks) {
            for (const selectedFrame of this.selectedFrameColumnSet) {
                if (hasFrame(track.frames, selectedFrame)) refs.push(this.createSelectionRef(track, selectedFrame));
            }
        }
        this.applyKeySelectionRefs(refs);
    }

    private selectRowHeaderFromLabelEvent(e: MouseEvent): void {
        if (e.detail > 1) return;

        const { viewportY, contentY } = this.getLabelPointerY(e);
        if (viewportY >= 0 && viewportY < RULER_H) {
            e.preventDefault();
            this.clearAllSelections({ keepActiveTrack: true });
            return;
        }
        const row = this.getRowIndexAtOffset(contentY - RULER_H);
        if (row < 0 || row >= this.tracks.length) return;

        const previousSelectedTrackIndex = this.selectedTrackIndex;
        const track = this.tracks[row];
        const target = this.createRowSelectionRef(track);
        const switchingAxis = this.activeHeaderSelectionAxis !== "row";
        const currentRows = switchingAxis ? [] : this.getSelectedRowHeaderRefs();
        const currentAnchor = switchingAxis ? null : this.rowHeaderSelectionAnchor;
        const mode = this.getHeaderSelectionMode(e);
        const preserveMultiSelection = mode === "replace"
            && currentRows.length > 1
            && this.selectedRowHeaderSet.has(createTimelineRowSelectionKey(target));
        const nextRows = preserveMultiSelection
            ? currentRows
            : updateTimelineRowSelection(currentRows, target, currentAnchor, this.tracks, mode);

        this.activeHeaderSelectionAxis = nextRows.length > 0 ? "row" : null;
        this.selectedRowHeaderSet = new Set(nextRows.map(createTimelineRowSelectionKey));
        this.selectedFrameColumnSet.clear();
        this.frameColumnSelectionAnchor = null;
        this.rowHeaderSelectionAnchor = nextRows.length === 0
            ? null
            : mode === "range" && currentAnchor
                ? currentAnchor
                : target;
        this.selectedFrame = null;
        this.selectedKeySet.clear();
        this.selectionAnchor = null;
        this.selectedTrackIndex = row;
        this.selectedBoneTrackSet = this.createSingleBoneTrackSelectionSet(track);
        const selectionChanged = this.selectedTrackIndex !== previousSelectedTrackIndex;
        if (selectionChanged) this.resize();
        else {
            this.scheduleStatic();
            this.scheduleLabel();
        }
        this.emitSelectionChanged();
    }

    private selectFrameColumnFromRulerEvent(e: MouseEvent): void {
        if (e.button !== 0 || e.detail > 1) return;

        const rect = this.overlayCanvas.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) return;

        e.preventDefault();
        const frame = Math.max(0, Math.round(this.frameFromRulerCanvasX(localX)));
        const switchingAxis = this.activeHeaderSelectionAxis !== "column";
        const currentFrames = switchingAxis ? [] : Array.from(this.selectedFrameColumnSet);
        const currentAnchor = switchingAxis ? null : this.frameColumnSelectionAnchor;
        const mode = this.getHeaderSelectionMode(e);
        const preserveMultiSelection = mode === "replace"
            && currentFrames.length > 1
            && this.selectedFrameColumnSet.has(frame);
        const nextFrames = preserveMultiSelection
            ? currentFrames
            : updateTimelineFrameColumnSelection(currentFrames, frame, currentAnchor, mode)
                .filter((selectedFrame) => selectedFrame <= this.totalFrames);

        this.activeHeaderSelectionAxis = nextFrames.length > 0 ? "column" : null;
        this.selectedFrameColumnSet = new Set(nextFrames);
        this.selectedRowHeaderSet.clear();
        this.rowHeaderSelectionAnchor = null;
        this.frameColumnSelectionAnchor = nextFrames.length === 0
            ? null
            : mode === "range" && currentAnchor !== null
                ? currentAnchor
                : frame;
        this.selectedKeySet.clear();
        this.selectedBoneTrackSet.clear();
        this.selectionAnchor = null;
        this.selectedFrame = null;
        this.scheduleOverlay();
        this.scheduleStatic();
        this.scheduleLabel();
        this.emitSelectionChanged();
        this.onSeek?.(frame, "jump");
    }

    private getHeaderSelectionMode(e: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">): TimelineHeaderSelectionMode {
        if (e.shiftKey) return "range";
        if (e.ctrlKey || e.metaKey) return "toggle";
        return "replace";
    }

    private hasHeaderSelectionModifier(e: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">): boolean {
        return e.shiftKey || e.ctrlKey || e.metaKey;
    }

    private getLabelPointerY(e: Pick<MouseEvent, "clientY">): { viewportY: number; contentY: number } {
        const viewportY = e.clientY - this.labelsEl.getBoundingClientRect().top;
        return {
            viewportY,
            contentY: viewportY + this.labelsEl.scrollTop,
        };
    }

    private createRowSelectionRef(track: Pick<KeyframeTrack, "category" | "name">): TimelineRowSelectionRef {
        return {
            trackCategory: track.category,
            trackName: track.name,
        };
    }

    private getSelectedRowHeaderRefs(): TimelineRowSelectionRef[] {
        return this.tracks
            .map((track) => this.createRowSelectionRef(track))
            .filter((ref) => this.selectedRowHeaderSet.has(createTimelineRowSelectionKey(ref)));
    }

    private clearHeaderSelectionState(): void {
        const changed = this.activeHeaderSelectionAxis !== null
            || this.selectedRowHeaderSet.size > 0
            || this.selectedFrameColumnSet.size > 0;
        this.activeHeaderSelectionAxis = null;
        this.selectedRowHeaderSet.clear();
        this.selectedFrameColumnSet.clear();
        this.rowHeaderSelectionAnchor = null;
        this.frameColumnSelectionAnchor = null;
        if (!changed) return;
        this.scheduleStatic();
        this.scheduleOverlay();
        this.scheduleLabel();
    }

    private drawSelectedFrameColumnBands(
        ctx: CanvasRenderingContext2D,
        top: number,
        height: number,
        playheadX: number,
        visibleStart: number,
        visibleEnd: number,
    ): void {
        if (this.activeHeaderSelectionAxis !== "column" || this.selectedFrameColumnSet.size === 0) return;

        ctx.save();
        for (const frame of this.selectedFrameColumnSet) {
            if (frame < visibleStart || frame > visibleEnd) continue;
            const x = frame * PX_PER_F - this.viewOffset + playheadX;
            ctx.fillStyle = HEADER_COLUMN_SELECTION_BG;
            ctx.fillRect(x - PX_PER_F / 2, top, PX_PER_F, height);
        }
        ctx.restore();
    }

    private getStaticCanvasPoint(e: MouseEvent): { x: number; y: number } {
        const rect = this.staticCanvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }

    private drawRectangleSelection(ctx: CanvasRenderingContext2D): void {
        const selection = this.rectangleSelection;
        if (!selection) return;

        const bounds = this.getRectangleSelectionBounds(selection);
        const width = Math.max(1, bounds.right - bounds.left);
        const height = Math.max(1, bounds.bottom - bounds.top);
        ctx.save();
        ctx.fillStyle = "rgba(57,197,187,0.14)";
        ctx.strokeStyle = "rgba(125,223,216,0.82)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(bounds.left, bounds.top, width, height);
        ctx.strokeRect(bounds.left + 0.5, bounds.top + 0.5, width, height);
        ctx.restore();
    }

    private applyRectangleSelection(): void {
        const selection = this.rectangleSelection;
        if (!selection) return;

        const refs = this.getKeyRefsInRectangle(selection);
        const nextSelection = new Set(selection.baseSelection);
        for (const ref of refs) {
            nextSelection.add(createSelectionKey(ref));
        }

        this.selectedKeySet = this.createNormalizedSelectionSet(this.getSelectedKeyRefsFromSet(nextSelection));
        if (this.selectedKeySet.size > 0 || !selection.additive) {
            this.selectedBoneTrackSet.clear();
        }
        const active = refs[refs.length - 1] ?? this.getSelectedKeys()[0] ?? null;
        if (active) {
            this.applyActiveSelection(active);
            this.selectionAnchor = active;
        } else if (!selection.additive) {
            this.selectedTrackIndex = this.getRowIndexAtOffset(selection.startY, true);
            this.selectedFrame = null;
            this.selectionAnchor = null;
        }
    }

    private getKeyRefsInRectangle(selection: {
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    }): TimelineKeySelectionRef[] {
        const bounds = this.getRectangleSelectionBounds(selection);
        const firstRow = this.getRowIndexAtOffset(bounds.top, true);
        const lastRow = this.getRowIndexAtOffset(bounds.bottom, true);
        if (firstRow < 0 || lastRow < 0) return [];

        const playheadX = this.getBufferedPlayheadX();
        const leftFrame = this.frameFromCanvasX(bounds.left);
        const rightFrame = this.frameFromCanvasX(bounds.right);
        const minFrame = Math.max(0, Math.floor(Math.min(leftFrame, rightFrame)) - 1);
        const maxFrame = Math.max(0, Math.ceil(Math.max(leftFrame, rightFrame)) + 1);
        const refs: TimelineKeySelectionRef[] = [];

        for (let row = firstRow; row <= lastRow; row += 1) {
            const track = this.tracks[row];
            const midY = this.getRowTop(row) + ROW_H / 2;
            if (midY < bounds.top || midY > bounds.bottom) continue;

            const lo = lowerBound(track.frames, minFrame);
            const hi = upperBound(track.frames, maxFrame);
            for (let i = lo; i <= hi && i < track.frames.length; i += 1) {
                const frame = track.frames[i];
                const sx = frame * PX_PER_F - this.viewOffset + playheadX;
                if (sx < bounds.left || sx > bounds.right) continue;
                refs.push(this.createSelectionRef(track, frame));
            }
        }

        return refs;
    }

    private getRectangleSelectionBounds(selection: {
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    }): { left: number; right: number; top: number; bottom: number } {
        return {
            left: Math.min(selection.startX, selection.currentX),
            right: Math.max(selection.startX, selection.currentX),
            top: Math.min(selection.startY, selection.currentY),
            bottom: Math.max(selection.startY, selection.currentY),
        };
    }

    private frameFromCanvasX(x: number): number {
        return this.currentFrame + (x - this.getBufferedPlayheadX()) / PX_PER_F;
    }

    private frameFromRulerCanvasX(x: number): number {
        return this.currentFrame + (x - this.getPlayheadX()) / PX_PER_F;
    }

    private selectAllKeysOnTrack(track: KeyframeTrack, additive: boolean): void {
        const refs = Array.from(track.frames, (frame) => this.createSelectionRef(track, frame));
        if (refs.length === 0) {
            if (!additive) {
                this.selectedFrame = null;
                this.selectedKeySet.clear();
                this.selectionAnchor = null;
            }
            return;
        }

        if (!additive) {
            this.selectedKeySet = this.createNormalizedSelectionSet(refs);
            const active = refs[0] ?? null;
            this.applyActiveSelection(active);
            this.selectionAnchor = active;
            return;
        }

        const nextSelection = new Set(this.selectedKeySet);
        const allSelected = refs.every((ref) => nextSelection.has(createSelectionKey(ref)));
        for (const ref of refs) {
            const key = createSelectionKey(ref);
            if (allSelected) nextSelection.delete(key);
            else nextSelection.add(key);
        }
        this.selectedKeySet = this.createNormalizedSelectionSet(this.getSelectedKeyRefsFromSet(nextSelection));
        const active = allSelected ? this.getSelectedKeys()[0] ?? null : refs[0] ?? null;
        this.applyActiveSelection(active);
        this.selectionAnchor = active;
    }

    private selectAllKeysAtFrame(frame: number): void {
        const refs: TimelineKeySelectionRef[] = [];
        for (const track of this.tracks) {
            if (!hasFrame(track.frames, frame)) continue;
            refs.push(this.createSelectionRef(track, frame));
        }
        this.applyKeySelectionRefs(refs);
    }

    private selectAllKeysFromAllTracks(): void {
        const refs: TimelineKeySelectionRef[] = [];
        for (const track of this.tracks) {
            for (const frame of track.frames) {
                refs.push(this.createSelectionRef(track, frame));
            }
        }
        this.applyKeySelectionRefs(refs);
    }

    private applyKeySelectionRefs(refs: readonly TimelineKeySelectionRef[]): void {
        this.clearHeaderSelectionState();
        this.selectedBoneTrackSet.clear();
        this.selectedKeySet = this.createNormalizedSelectionSet(refs);
        const active = refs[0] && this.hasSelectionRef(refs[0])
            ? refs[0]
            : this.getSelectedKeys()[0] ?? null;
        this.applyActiveSelection(active);
        this.selectionAnchor = active;
        this.scheduleStatic();
        this.scheduleLabel();
        this.emitSelectionChanged();
    }

    private pickFrameOnTrackFromX(track: KeyframeTrack, localX: number): number | null {
        if (track.frames.length === 0) return null;

        const playheadX = this.getBufferedPlayheadX();
        const frameAtCursor = this.currentFrame + (localX - playheadX) / PX_PER_F;
        const nearestFrame = Math.round(frameAtCursor);
        const idx = lowerBound(track.frames, nearestFrame);

        const candidates: number[] = [];
        if (idx < track.frames.length) candidates.push(track.frames[idx]);
        if (idx > 0) candidates.push(track.frames[idx - 1]);

        let bestFrame: number | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const frame of candidates) {
            const sx = frame * PX_PER_F - this.viewOffset + playheadX;
            const dist = Math.abs(sx - localX);
            if (dist < bestDist) {
                bestDist = dist;
                bestFrame = frame;
            }
        }

        return bestDist <= 8 ? bestFrame : null;
    }

    private reconcileSelection(previousTrack: KeyframeTrack | null): void {
        if (this.tracks.length === 0) {
            this.selectedTrackIndex = -1;
            this.selectedFrame = null;
            this.selectedKeySet.clear();
            this.selectedBoneTrackSet.clear();
            this.selectionAnchor = null;
            this.clearHeaderSelectionState();
            this.emitSelectionChanged();
            return;
        }

        if (previousTrack) {
            const nextIndex = this.tracks.findIndex((track) =>
                track.name === previousTrack.name && track.category === previousTrack.category
            );
            if (nextIndex >= 0) {
                this.selectedTrackIndex = nextIndex;
            } else {
                this.selectedTrackIndex = -1;
                this.selectedFrame = null;
                this.selectedKeySet.clear();
                this.selectedBoneTrackSet.clear();
                this.selectionAnchor = null;
                this.clearHeaderSelectionState();
                this.emitSelectionChanged();
                return;
            }
        } else if (this.selectedTrackIndex < 0 || this.selectedTrackIndex >= this.tracks.length) {
            this.selectedTrackIndex = 0;
        }

        const track = this.getSelectedTrack();
        if (!track || this.selectedFrame === null || !hasFrame(track.frames, this.selectedFrame)) {
            this.selectedFrame = null;
        }
        this.selectedKeySet = this.createNormalizedSelectionSet(this.getSelectedKeys());
        this.selectedBoneTrackSet = this.createNormalizedBoneTrackSelectionSet(this.getSelectedBoneTracks());
        this.selectedRowHeaderSet = new Set(this.getSelectedRowHeaderRefs().map(createTimelineRowSelectionKey));
        if (this.activeHeaderSelectionAxis === "row" && this.selectedRowHeaderSet.size === 0) {
            this.clearHeaderSelectionState();
        }
        if (this.rowHeaderSelectionAnchor) {
            const anchorKey = createTimelineRowSelectionKey(this.rowHeaderSelectionAnchor);
            if (!this.tracks.some((candidate) => createTimelineRowSelectionKey(this.createRowSelectionRef(candidate)) === anchorKey)) {
                this.rowHeaderSelectionAnchor = null;
            }
        }
        if (this.selectionAnchor && !this.hasSelectionRef(this.selectionAnchor)) {
            this.selectionAnchor = null;
        }

        this.emitSelectionChanged();
    }

    private drawSelectedTrackRotationOverlay(
        ctx: CanvasRenderingContext2D,
        track: KeyframeTrack,
        rowTop: number,
        rowHeight: number,
        visStart: number,
        visEnd: number,
        width: number,
    ): void {
        const overlay = this.rotationOverlay;
        if (!overlay) return;
        if (overlay.trackName !== track.name || overlay.trackCategory !== track.category) return;
        if (overlay.frames.length === 0) return;

        const firstVisibleIndex = lowerBound(overlay.frames, visStart);
        const lastVisibleIndex = upperBound(overlay.frames, visEnd);
        if (firstVisibleIndex >= overlay.frames.length || lastVisibleIndex < 0) return;

        const startIndex = Math.max(0, firstVisibleIndex - 1);
        const endIndex = Math.min(overlay.frames.length - 1, Math.max(lastVisibleIndex + 1, startIndex));
        const innerHeight = Math.max(1, rowHeight - ROTATION_OVERLAY_PAD_Y * 2);
        const range = Math.max(ROTATION_OVERLAY_MIN_RANGE, overlay.maxAbsValue, 1);
        const zeroY = rowTop + ROTATION_OVERLAY_PAD_Y + innerHeight / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, rowTop, width, rowHeight);
        ctx.clip();

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, zeroY + 0.5);
        ctx.lineTo(width, zeroY + 0.5);
        ctx.stroke();

        this.drawRotationAxisPolyline(
            ctx,
            overlay.frames,
            overlay.x,
            startIndex,
            endIndex,
            rowTop,
            innerHeight,
            range,
            resolveCssVarColor("--axis-x-color", "#ff2b2b"),
        );
        this.drawRotationAxisPolyline(
            ctx,
            overlay.frames,
            overlay.y,
            startIndex,
            endIndex,
            rowTop,
            innerHeight,
            range,
            resolveCssVarColor("--axis-y-color", "#00d83a"),
        );
        this.drawRotationAxisPolyline(
            ctx,
            overlay.frames,
            overlay.z,
            startIndex,
            endIndex,
            rowTop,
            innerHeight,
            range,
            resolveCssVarColor("--axis-z-color", "#1b4dff"),
        );

        ctx.restore();
    }

    private drawRotationAxisPolyline(
        ctx: CanvasRenderingContext2D,
        frames: Uint32Array,
        values: Float32Array,
        startIndex: number,
        endIndex: number,
        rowTop: number,
        innerHeight: number,
        range: number,
        strokeStyle: string,
    ): void {
        if (startIndex > endIndex) return;

        const playheadX = this.getBufferedPlayheadX();
        const topY = rowTop + ROTATION_OVERLAY_PAD_Y;
        const bottomY = topY + innerHeight;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1.25;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();

        for (let i = startIndex; i <= endIndex; i += 1) {
            const x = frames[i] * PX_PER_F - this.viewOffset + playheadX;
            const y = this.getRotationOverlayValueY(values[i], topY, innerHeight, range);
            if (i === startIndex) {
                ctx.moveTo(x, y);
                continue;
            }

            const prevX = frames[i - 1] * PX_PER_F - this.viewOffset + playheadX;
            const prevValue = values[i - 1];
            const nextValue = values[i];

            if (!this.isRotationOverlayWrappedSegment(prevValue, nextValue)) {
                ctx.lineTo(x, y);
                continue;
            }

            const boundaryX = this.getRotationOverlayWrapBoundaryX(prevX, x, prevValue, nextValue);
            const wrapsThroughTop = nextValue < prevValue;
            ctx.lineTo(boundaryX, wrapsThroughTop ? topY : bottomY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(boundaryX, wrapsThroughTop ? bottomY : topY);
            ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.restore();
    }

    private getRotationOverlayValueY(value: number, topY: number, innerHeight: number, range: number): number {
        const normalized = (range - value) / (range * 2);
        return topY + normalized * innerHeight;
    }

    private isRotationOverlayWrappedSegment(previous: number, next: number): boolean {
        return Math.abs(next - previous) > ROTATION_OVERLAY_WRAP_THRESHOLD;
    }

    private getRotationOverlayWrapBoundaryX(
        previousX: number,
        nextX: number,
        previousValue: number,
        nextValue: number,
    ): number {
        const span = nextX - previousX;
        if (span === 0) return previousX;

        if (nextValue < previousValue) {
            const toUpper = Math.max(0, ROTATION_OVERLAY_WRAP_BOUNDARY - previousValue);
            const fromLower = Math.max(0, nextValue + ROTATION_OVERLAY_WRAP_BOUNDARY);
            const total = toUpper + fromLower;
            const t = total > 0 ? toUpper / total : 0.5;
            return previousX + span * t;
        }

        const toLower = Math.max(0, previousValue + ROTATION_OVERLAY_WRAP_BOUNDARY);
        const fromUpper = Math.max(0, ROTATION_OVERLAY_WRAP_BOUNDARY - nextValue);
        const total = toLower + fromUpper;
        const t = total > 0 ? toLower / total : 0.5;
        return previousX + span * t;
    }

    private getTrackRowsHeight(): number {
        if (this.tracks.length === 0) return ROW_H;

        let total = 0;
        for (let i = 0; i < this.tracks.length; i += 1) {
            total += ROW_H + this.getSpacerHeightAfterRow(i);
        }
        return total;
    }

    private getRowTop(index: number): number {
        if (index <= 0) return 0;

        let top = 0;
        for (let i = 0; i < index; i += 1) {
            top += ROW_H + this.getSpacerHeightAfterRow(i);
        }
        return top;
    }

    private getRowIndexAtOffset(offsetY: number, clampToRange = false): number {
        if (this.tracks.length === 0) return -1;
        if (offsetY < 0) return clampToRange ? 0 : -1;

        let top = 0;
        for (let i = 0; i < this.tracks.length; i += 1) {
            const rowH = ROW_H;
            if (offsetY < top + rowH) return i;
            top += rowH;

            const spacerH = this.getSpacerHeightAfterRow(i);
            if (offsetY < top + spacerH) return clampToRange ? i : -1;
            top += spacerH;
        }
        return clampToRange ? this.tracks.length - 1 : -1;
    }

    private getSpacerHeightAfterRow(index: number): number {
        if (index < 0 || index >= this.tracks.length - 1) return 0;
        return this.tracks[index].category === "camera" ? CAMERA_FOLLOWING_SPACER_H : 0;
    }

    private applyKeySelectionFromPointer(track: KeyframeTrack, pickedFrame: number | null, event: MouseEvent): void {
        this.clearHeaderSelectionState();
        if (pickedFrame === null) {
            this.selectedFrame = null;
            this.selectedKeySet.clear();
            this.selectionAnchor = null;
            return;
        }

        this.selectedBoneTrackSet.clear();
        const ref = this.createSelectionRef(track, pickedFrame);
        if (event.shiftKey) {
            this.applyRangeSelection(track, ref);
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            const wasSelected = this.selectedKeySet.has(createSelectionKey(ref));
            const next = toggleTimelineKeySelection(this.getSelectedKeys(), ref);
            this.selectedKeySet = this.createNormalizedSelectionSet(next);
            if (wasSelected) {
                const fallback = this.getSelectedKeys()[this.selectedKeySet.size - 1] ?? null;
                this.applyActiveSelection(fallback);
                this.selectionAnchor = fallback;
            } else {
                this.applyActiveSelection(ref);
                this.selectionAnchor = ref;
            }
            return;
        }

        this.selectedKeySet = new Set([createSelectionKey(ref)]);
        this.applyActiveSelection(ref);
        this.selectionAnchor = ref;
    }

    private applyRangeSelection(track: KeyframeTrack, clickedRef: TimelineKeySelectionRef): void {
        const anchor = this.selectionAnchor;
        const refs = createTimelineRangeSelection(track, anchor, clickedRef.frame);
        this.selectedKeySet = this.createNormalizedSelectionSet(refs);
        this.applyActiveSelection(clickedRef);
        if (!anchor || anchor.trackCategory !== clickedRef.trackCategory || anchor.trackName !== clickedRef.trackName) {
            this.selectionAnchor = clickedRef;
        }
    }

    private applyActiveSelection(ref: TimelineKeySelectionRef | null): void {
        if (!ref) {
            this.selectedFrame = null;
            return;
        }
        const index = this.tracks.findIndex((track) =>
            track.category === ref.trackCategory && track.name === ref.trackName
        );
        if (index < 0) {
            this.selectedFrame = null;
            return;
        }
        this.selectedTrackIndex = index;
        this.selectedFrame = ref.frame;
    }

    private createSelectionRef(track: KeyframeTrack, frame: number): TimelineKeySelectionRef {
        return {
            trackCategory: track.category,
            trackName: track.name,
            frame: Math.max(0, Math.floor(frame)),
        };
    }

    private hasSelectionRef(ref: TimelineKeySelectionRef): boolean {
        const track = this.tracks.find((candidate) =>
            candidate.category === ref.trackCategory && candidate.name === ref.trackName
        );
        return !!track && hasFrame(track.frames, ref.frame);
    }

    private createNormalizedSelectionSet(keys: readonly TimelineKeySelectionRef[]): Set<string> {
        return new Set(normalizeTimelineKeySelection(keys, this.tracks).map(createSelectionKey));
    }

    private getSelectedKeyRefsFromSet(source: ReadonlySet<string>): TimelineKeySelectionRef[] {
        const refs: TimelineKeySelectionRef[] = [];
        for (const track of this.tracks) {
            for (const frame of track.frames) {
                const ref = this.createSelectionRef(track, frame);
                if (source.has(createSelectionKey(ref))) refs.push(ref);
            }
        }
        return refs;
    }

    private createTrackSelectionKey(track: Pick<KeyframeTrack, "category" | "name">): string {
        return `${track.category}${SELECTION_KEY_SEPARATOR}${track.name}`;
    }

    private findBoneTrackIndexByName(name: string): number {
        const categories: TrackCategory[] = ["bone", "semi-standard", "root"];
        for (const category of categories) {
            const index = this.tracks.findIndex((track) =>
                track.name === name && track.category === category && this.isMultiSelectableBoneTrack(track)
            );
            if (index >= 0) return index;
        }
        return -1;
    }

    private isMultiSelectableBoneTrack(track: Pick<KeyframeTrack, "category" | "name">): boolean {
        return track.name !== "Camera" && isMultiSelectableBoneCategory(track.category);
    }

    private createBoneTrackSelectionRef(track: Pick<KeyframeTrack, "category" | "name">): TimelineBoneTrackSelectionRef {
        return {
            trackCategory: track.category,
            trackName: track.name,
        };
    }

    private hasBoneTrackSelectionRef(ref: TimelineBoneTrackSelectionRef): boolean {
        return this.tracks.some((track) =>
            track.category === ref.trackCategory
            && track.name === ref.trackName
            && this.isMultiSelectableBoneTrack(track)
        );
    }

    private createNormalizedBoneTrackSelectionSet(
        refs: readonly TimelineBoneTrackSelectionRef[],
    ): Set<string> {
        const normalized = new Set<string>();
        for (const ref of refs) {
            if (!this.hasBoneTrackSelectionRef(ref)) continue;
            normalized.add(createBoneTrackSelectionKey(ref));
        }
        return normalized;
    }

    private createSingleBoneTrackSelectionSet(track: Pick<KeyframeTrack, "category" | "name">): Set<string> {
        if (!this.isMultiSelectableBoneTrack(track)) return new Set<string>();
        return new Set([createBoneTrackSelectionKey(this.createBoneTrackSelectionRef(track))]);
    }

    private getSelectedBoneTrackRefsFromSet(source: ReadonlySet<string>): TimelineBoneTrackSelectionRef[] {
        const refs: TimelineBoneTrackSelectionRef[] = [];
        for (const track of this.tracks) {
            if (!this.isMultiSelectableBoneTrack(track)) continue;
            const ref = this.createBoneTrackSelectionRef(track);
            if (source.has(createBoneTrackSelectionKey(ref))) refs.push(ref);
        }
        return refs;
    }

    private findTrackIndexByBoneTrackRef(ref: TimelineBoneTrackSelectionRef): number {
        return this.tracks.findIndex((track) => track.category === ref.trackCategory && track.name === ref.trackName);
    }

    private toggleBoneTrackSelection(track: KeyframeTrack): TimelineBoneTrackSelectionRef | null {
        const ref = this.createBoneTrackSelectionRef(track);
        const key = createBoneTrackSelectionKey(ref);
        const nextSelection = new Set(this.selectedBoneTrackSet);
        const wasSelected = nextSelection.has(key);
        if (nextSelection.has(key)) {
            nextSelection.delete(key);
        } else {
            nextSelection.add(key);
        }
        this.selectedBoneTrackSet = this.createNormalizedBoneTrackSelectionSet(
            this.getSelectedBoneTrackRefsFromSet(nextSelection),
        );
        if (!wasSelected) return ref;
        return this.getSelectedBoneTracks()[0] ?? null;
    }

    private getSelectedFramesByTrackKey(): Map<string, Set<number>> {
        const result = new Map<string, Set<number>>();
        for (const ref of this.getSelectedKeys()) {
            const trackKey = `${ref.trackCategory}${SELECTION_KEY_SEPARATOR}${ref.trackName}`;
            let frames = result.get(trackKey);
            if (!frames) {
                frames = new Set<number>();
                result.set(trackKey, frames);
            }
            frames.add(ref.frame);
        }
        return result;
    }

    private emitSelectionChanged(): void {
        const activeTrack = this.getSelectedTrack();
        this.onSelectionChanged?.(activeTrack, this.selectedFrame);
        this.onKeySelectionChanged?.({
            activeTrack,
            activeFrame: this.selectedFrame,
            selectedKeys: this.getSelectedKeys(),
            selectedBoneTracks: this.getSelectedBoneTracks(),
            activeHeaderAxis: this.activeHeaderSelectionAxis,
            selectedRows: this.getSelectedRowHeaderRefs(),
            selectedFrameColumns: Array.from(this.selectedFrameColumnSet).sort((a, b) => a - b),
        });
    }
}

