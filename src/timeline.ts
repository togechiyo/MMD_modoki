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
import type { KeyframeTrack, TrackCategory } from "./types";

// ── Layout ─────────────────────────────────────────────────────────
const RULER_H = 20;
const ROW_H = 18;
const PX_PER_F = 6;
const PLAYHEAD_X = 24;

// ── Category palette ───────────────────────────────────────────────
const CAT = {
    root: { bg: "rgba(236,72,153,0.12)", kf: "#ec4899", text: "#f472b6", bar: "#ec4899" },
    camera: { bg: "rgba(34,211,238,0.10)", kf: "#22d3ee", text: "#67e8f9", bar: "#22d3ee" },
    "semi-standard": { bg: "rgba(99,102,241,0.08)", kf: "#818cf8", text: "#a5b4fc", bar: "" },
    bone: { bg: "rgba(255,255,255,0.02)", kf: "#4ade80", text: "#86efac", bar: "" },
    morph: { bg: "rgba(251,191,36,0.07)", kf: "#fbbf24", text: "#fcd34d", bar: "" },
} as const;

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

export class Timeline {
    // DOM
    private staticCanvas: HTMLCanvasElement;
    private staticCtx: CanvasRenderingContext2D;
    private overlayCanvas: HTMLCanvasElement;
    private overlayCtx: CanvasRenderingContext2D;
    private labelCanvas: HTMLCanvasElement;
    private labelCtx: CanvasRenderingContext2D;
    private labelsEl: HTMLElement;
    private trackScrollEl: HTMLElement;

    // State
    private currentFrame = 0;
    private totalFrames = 300;
    private tracks: KeyframeTrack[] = [];
    private viewOffset = 0;   // currentFrame * PX_PER_F
    private selectedTrackIndex = -1;
    private selectedFrame: number | null = null;

    // Drag-seek
    private isDragging = false;
    private dragBaseFrame = 0;
    private dragBaseX = 0;

    // RAF
    private staticRaf: number | null = null;
    private overlayRaf: number | null = null;
    private labelRaf: number | null = null;

    // Scroll sync guard
    private syncingScroll = false;

    public onSeek: ((frame: number) => void) | null = null;
    public onSelectionChanged: ((track: KeyframeTrack | null, frame: number | null) => void) | null = null;

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
        this.labelsEl = document.getElementById(labelsElId) as HTMLElement;

        this.staticCtx = this.staticCanvas.getContext("2d")!;
        this.overlayCtx = this.overlayCanvas.getContext("2d")!;
        this.labelCtx = this.labelCanvas.getContext("2d")!;

        this.setupEvents();
        this.resize();

        const ro = new ResizeObserver(() => this.resize());
        ro.observe(this.trackScrollEl);
        ro.observe(this.labelsEl);
    }

    // ── Events ──────────────────────────────────────────────────────

    private setupEvents(): void {
        // Seek and select: static layer
        this.staticCanvas.style.pointerEvents = "auto";
        this.staticCanvas.addEventListener("mousedown", (e) => {
            this.selectTrackFromStaticEvent(e);
            this.isDragging = true;
            this.dragBaseFrame = this.currentFrame;
            this.dragBaseX = e.clientX;
            this.seekFromEvent(e, this.staticCanvas);
        });

        // Seek only: overlay layer
        this.overlayCanvas.style.pointerEvents = "auto";
        this.overlayCanvas.addEventListener("mousedown", (e) => {
            this.isDragging = true;
            this.dragBaseFrame = this.currentFrame;
            this.dragBaseX = e.clientX;
            this.seekFromEvent(e, this.overlayCanvas);
        });

        // Select from labels
        this.labelCanvas.style.pointerEvents = "auto";
        this.labelCanvas.addEventListener("mousedown", (e) => {
            this.selectTrackFromLabelEvent(e);
        });
        window.addEventListener("mousemove", (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.dragBaseX;
            const delta = Math.round(-dx / PX_PER_F);
            const frame = Math.max(0, this.dragBaseFrame + delta);
            if (frame !== this.currentFrame) {
                this.currentFrame = frame;
                this.viewOffset = frame * PX_PER_F;
                this.onSeek?.(frame);
                this.scheduleOverlay();
                this.scheduleStatic();
            }
        });
        window.addEventListener("mouseup", () => { this.isDragging = false; });

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

    private seekFromEvent(e: MouseEvent, canvas: HTMLCanvasElement): void {
        const rect = canvas.getBoundingClientRect();
        const frame = Math.max(
            0,
            Math.round(this.currentFrame + (e.clientX - rect.left - PLAYHEAD_X) / PX_PER_F)
        );
        this.currentFrame = frame;
        this.viewOffset = frame * PX_PER_F;
        this.onSeek?.(frame);
        this.scheduleOverlay();
        this.scheduleStatic();
    }

    // ── Public API ───────────────────────────────────────────────────

    setCurrentFrame(frame: number): void {
        const normalized = Math.max(0, Math.floor(frame));
        if (this.currentFrame === normalized) return;
        this.currentFrame = normalized;
        this.viewOffset = normalized * PX_PER_F;
        this.scheduleOverlay(); // ruler + playhead
        this.scheduleStatic();  // keyframe dots scroll with playhead
    }

    setTotalFrames(total: number): void {
        const normalized = Math.max(0, Math.floor(total));
        if (this.totalFrames === normalized) return;
        this.totalFrames = normalized;
        this.scheduleOverlay();
    }

    setKeyframeTracks(tracks: KeyframeTrack[]): void {
        const prevSelectedTrack = this.getSelectedTrack();
        this.tracks = tracks;
        this.reconcileSelection(prevSelectedTrack);
        this.resize();
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

    setSelectedFrame(frame: number | null): void {
        const track = this.getSelectedTrack();
        if (!track) {
            this.selectedFrame = null;
            this.emitSelectionChanged();
            return;
        }

        const normalizedFrame = frame === null ? null : Math.max(0, Math.floor(frame));
        if (normalizedFrame === null || !hasFrame(track.frames, normalizedFrame)) {
            this.selectedFrame = null;
        } else {
            this.selectedFrame = normalizedFrame;
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
        this.scheduleStatic();
        this.scheduleLabel();
        if (changed) {
            this.emitSelectionChanged();
        }
        return true;
    }

    // ── Resize ───────────────────────────────────────────────────────

    resize(): void {
        const dpr = window.devicePixelRatio || 1;
        const trackRowsH = Math.max(1, this.tracks.length) * ROW_H;
        const tw = this.trackScrollEl.clientWidth || 400;

        // Static canvas (track rows only – no ruler height added)
        this.staticCanvas.width = tw * dpr;
        this.staticCanvas.height = trackRowsH * dpr;
        this.staticCanvas.style.width = `${tw}px`;
        this.staticCanvas.style.height = `${trackRowsH}px`;
        this.staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

        this.scheduleStatic();
        this.scheduleOverlay();
        this.scheduleLabel();
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

    // ── Static layer: track row bgs + keyframe dots ──────────────────

    private drawStatic(): void {
        const ctx = this.staticCtx;
        const w = this.staticCanvas.width / (window.devicePixelRatio || 1);
        const h = this.staticCanvas.height / (window.devicePixelRatio || 1);

        ctx.fillStyle = "#12121a";
        ctx.fillRect(0, 0, w, h);

        if (this.tracks.length === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.03)";
            ctx.fillRect(0, 0, w, ROW_H);
            return;
        }

        const visStart = Math.max(0, Math.floor((this.viewOffset - PLAYHEAD_X) / PX_PER_F));
        const visEnd = Math.min(this.totalFrames, visStart + Math.ceil(w / PX_PER_F) + 2);

        // Vertical culling: only draw rows visible in the scroll viewport
        const scrollTop = this.trackScrollEl.scrollTop;
        const viewH = this.trackScrollEl.clientHeight || h;
        const firstRow = Math.max(0, Math.floor(scrollTop / ROW_H) - 1);
        const lastRow = Math.min(this.tracks.length - 1, Math.ceil((scrollTop + viewH) / ROW_H) + 1);

        for (let i = firstRow; i <= lastRow; i++) {
            const track = this.tracks[i];
            const ry = i * ROW_H;   // NO ruler offset – ruler is outside scroll
            const col = CAT[track.category];
            const isSelectedRow = i === this.selectedTrackIndex;

            ctx.fillStyle = col.bg;
            ctx.fillRect(0, ry, w, ROW_H);

            if (isSelectedRow) {
                ctx.fillStyle = "rgba(99,102,241,0.18)";
                ctx.fillRect(0, ry, w, ROW_H);
            }

            if (col.bar) {
                ctx.fillStyle = col.bar;
                ctx.fillRect(0, ry, 2, ROW_H);
            }

            // Row separator
            ctx.fillStyle = "rgba(255,255,255,0.04)";
            ctx.fillRect(0, ry + ROW_H - 1, w, 1);

            // Keyframe dots (binary search)
            const frames = track.frames;
            const lo = lowerBound(frames, visStart);
            const hi = upperBound(frames, visEnd);
            const dotR = track.category === "root" ? 4 : track.category === "camera" ? 3.5 : 2.5;
            const midY = ry + ROW_H / 2;

            ctx.fillStyle = col.kf;
            for (let k = lo; k <= hi && k < frames.length; k++) {
                const sx = frames[k] * PX_PER_F - this.viewOffset + PLAYHEAD_X;
                if (sx < -dotR * 2 || sx > w + dotR * 2) continue;
                ctx.beginPath();
                ctx.arc(sx, midY, dotR, 0, Math.PI * 2);
                ctx.fill();

                if (isSelectedRow && this.selectedFrame !== null && frames[k] === this.selectedFrame) {
                    ctx.save();
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(sx, midY, dotR + 2, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // Major frame vertical grid
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        for (let f = Math.ceil(visStart / 10) * 10; f <= visEnd; f += 10) {
            const sx = f * PX_PER_F - this.viewOffset + PLAYHEAD_X;
            ctx.fillRect(sx, 0, 1, h);
        }

        // Playhead continuation line (into track area)
        ctx.save();
        ctx.shadowColor = "rgba(99,102,241,0.4)";
        ctx.shadowBlur = 6;
        ctx.strokeStyle = "rgba(99,102,241,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PLAYHEAD_X, 0);
        ctx.lineTo(PLAYHEAD_X, h);
        ctx.stroke();
        ctx.restore();
    }

    // ── Overlay layer: ruler + playhead diamond ──────────────────────

    private drawOverlay(): void {
        const ctx = this.overlayCtx;
        const w = this.overlayCanvas.width / (window.devicePixelRatio || 1);

        ctx.fillStyle = "#0e0e1a";
        ctx.fillRect(0, 0, w, RULER_H);

        // Bottom border
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, RULER_H - 1, w, 1);

        const visStart = Math.max(0, Math.floor((this.viewOffset - PLAYHEAD_X) / PX_PER_F));
        const visEnd = Math.min(this.totalFrames, visStart + Math.ceil(w / PX_PER_F) + 2);

        // Ruler ticks + labels
        for (let f = visStart; f <= visEnd; f++) {
            const sx = f * PX_PER_F - this.viewOffset + PLAYHEAD_X;
            const isMajor = f % 10 === 0;
            const isMid = f % 5 === 0 && !isMajor;

            const tickH = isMajor ? 9 : isMid ? 5 : 3;
            ctx.fillStyle = isMajor ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)";
            ctx.fillRect(sx, RULER_H - tickH, 1, tickH);

            if (isMajor) {
                ctx.font = "500 9px 'Inter', sans-serif";
                ctx.fillStyle = "#6b7280";
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                ctx.fillText(String(f), sx + 2, 2);
            }
        }

        // Playhead diamond
        const px = PLAYHEAD_X;
        ctx.fillStyle = "#6366f1";
        ctx.beginPath();
        ctx.moveTo(px - 6, 0);
        ctx.lineTo(px + 6, 0);
        ctx.lineTo(px + 6, RULER_H - 6);
        ctx.lineTo(px, RULER_H);
        ctx.lineTo(px - 6, RULER_H - 6);
        ctx.closePath();
        ctx.fill();

        // Frame number
        ctx.font = "600 8px 'Inter', sans-serif";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(String(this.currentFrame), px, 3);
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
            ctx.font = "500 10px 'Inter', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("F", w / 2, RULER_H + ROW_H / 2);
            return;
        }

        for (let i = 0; i < this.tracks.length; i++) {
            const track = this.tracks[i];
            const y = RULER_H + i * ROW_H;
            const col = CAT[track.category];
            const isSelectedRow = i === this.selectedTrackIndex;

            ctx.fillStyle = col.bg;
            ctx.fillRect(0, y, w, ROW_H);

            if (isSelectedRow) {
                ctx.fillStyle = "rgba(99,102,241,0.18)";
                ctx.fillRect(0, y, w, ROW_H);
            }

            if (col.bar) {
                ctx.fillStyle = col.bar;
                ctx.fillRect(0, y, 2, ROW_H);
            }

            ctx.save();
            ctx.beginPath();
            ctx.rect(4, y, w - 6, ROW_H);
            ctx.clip();
            ctx.font = (track.category === "root" || track.category === "camera")
                ? "600 10px 'Inter', sans-serif"
                : "400 9px 'Inter', sans-serif";
            ctx.fillStyle = col.text;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(track.name, 6, y + ROW_H / 2);
            ctx.restore();

            ctx.fillStyle = "rgba(255,255,255,0.04)";
            ctx.fillRect(0, y + ROW_H - 1, w, 1);
        }
    }

    private selectTrackFromStaticEvent(e: MouseEvent): void {
        const rect = this.staticCanvas.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const y = localY + this.trackScrollEl.scrollTop;
        const row = Math.floor(y / ROW_H);
        if (row < 0 || row >= this.tracks.length) return;

        this.selectedTrackIndex = row;
        const pickedFrame = this.pickFrameOnTrackFromX(this.tracks[row], localX);
        this.selectedFrame = pickedFrame;
        this.scheduleStatic();
        this.scheduleLabel();
        this.emitSelectionChanged();
    }

    private selectTrackFromLabelEvent(e: MouseEvent): void {
        const rect = this.labelCanvas.getBoundingClientRect();
        const localY = e.clientY - rect.top;
        const y = localY - RULER_H + this.labelsEl.scrollTop;
        const row = Math.floor(y / ROW_H);
        if (row < 0 || row >= this.tracks.length) return;

        this.selectedTrackIndex = row;
        this.selectedFrame = null;
        this.scheduleStatic();
        this.scheduleLabel();
        this.emitSelectionChanged();
    }

    private pickFrameOnTrackFromX(track: KeyframeTrack, localX: number): number | null {
        if (track.frames.length === 0) return null;

        const frameAtCursor = this.currentFrame + (localX - PLAYHEAD_X) / PX_PER_F;
        const nearestFrame = Math.round(frameAtCursor);
        const idx = lowerBound(track.frames, nearestFrame);

        const candidates: number[] = [];
        if (idx < track.frames.length) candidates.push(track.frames[idx]);
        if (idx > 0) candidates.push(track.frames[idx - 1]);

        let bestFrame: number | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const frame of candidates) {
            const sx = frame * PX_PER_F - this.viewOffset + PLAYHEAD_X;
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
            this.emitSelectionChanged();
            return;
        }

        if (previousTrack) {
            const nextIndex = this.tracks.findIndex((track) =>
                track.name === previousTrack.name && track.category === previousTrack.category
            );
            if (nextIndex >= 0) {
                this.selectedTrackIndex = nextIndex;
            } else if (this.selectedTrackIndex < 0 || this.selectedTrackIndex >= this.tracks.length) {
                this.selectedTrackIndex = 0;
            }
        } else if (this.selectedTrackIndex < 0 || this.selectedTrackIndex >= this.tracks.length) {
            this.selectedTrackIndex = 0;
        }

        const track = this.getSelectedTrack();
        if (!track || this.selectedFrame === null || !hasFrame(track.frames, this.selectedFrame)) {
            this.selectedFrame = null;
        }

        this.emitSelectionChanged();
    }

    private emitSelectionChanged(): void {
        this.onSelectionChanged?.(this.getSelectedTrack(), this.selectedFrame);
    }
}

