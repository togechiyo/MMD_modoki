import type { MmdManager } from "./mmd-manager";
import type { Timeline } from "./timeline";
import type { BottomPanel } from "./bottom-panel";
import type { ModelInfo, MotionInfo } from "./types";

export class UIController {
    private mmdManager: MmdManager;
    private timeline: Timeline;
    private bottomPanel: BottomPanel;

    // Button elements
    private btnLoadPmx: HTMLElement;
    private btnLoadVmd: HTMLElement;
    private btnLoadMp3: HTMLElement;
    private btnPlay: HTMLElement;
    private btnPause: HTMLElement;
    private btnStop: HTMLElement;
    private btnSkipStart: HTMLElement;
    private btnSkipEnd: HTMLElement;
    private playbackSpeed: HTMLSelectElement;
    private currentFrameEl: HTMLElement;
    private totalFramesEl: HTMLElement;
    private statusText: HTMLElement;
    private statusDot: HTMLElement;
    private viewportOverlay: HTMLElement;

    // Camera controls
    private camX: HTMLInputElement;
    private camY: HTMLInputElement;
    private camZ: HTMLInputElement;
    private camFov: HTMLInputElement;
    private camFovValue: HTMLElement;

    constructor(mmdManager: MmdManager, timeline: Timeline, bottomPanel: BottomPanel) {
        this.mmdManager = mmdManager;
        this.timeline = timeline;
        this.bottomPanel = bottomPanel;

        // Get DOM elements
        this.btnLoadPmx = document.getElementById("btn-load-pmx")!;
        this.btnLoadVmd = document.getElementById("btn-load-vmd")!;
        this.btnLoadMp3 = document.getElementById("btn-load-mp3")!;
        this.btnPlay = document.getElementById("btn-play")!;
        this.btnPause = document.getElementById("btn-pause")!;
        this.btnStop = document.getElementById("btn-stop")!;
        this.btnSkipStart = document.getElementById("btn-skip-start")!;
        this.btnSkipEnd = document.getElementById("btn-skip-end")!;
        this.playbackSpeed = document.getElementById("playback-speed") as HTMLSelectElement;
        this.currentFrameEl = document.getElementById("current-frame")!;
        this.totalFramesEl = document.getElementById("total-frames")!;
        this.statusText = document.getElementById("status-text")!;
        this.statusDot = document.querySelector(".status-dot")!;
        this.viewportOverlay = document.getElementById("viewport-overlay")!;

        this.camX = document.getElementById("cam-x") as HTMLInputElement;
        this.camY = document.getElementById("cam-y") as HTMLInputElement;
        this.camZ = document.getElementById("cam-z") as HTMLInputElement;
        this.camFov = document.getElementById("cam-fov") as HTMLInputElement;
        this.camFovValue = document.getElementById("cam-fov-value")!;

        this.setupEventListeners();
        this.setupCallbacks();
        this.setupKeyboard();
        this.setupPerfDisplay();
    }

    private setupEventListeners(): void {
        // File loading
        this.btnLoadPmx.addEventListener("click", () => this.loadPMX());
        this.btnLoadVmd.addEventListener("click", () => this.loadVMD());
        this.btnLoadMp3.addEventListener("click", () => this.loadMP3());

        // Playback
        this.btnPlay.addEventListener("click", () => this.play());
        this.btnPause.addEventListener("click", () => this.pause());
        this.btnStop.addEventListener("click", () => this.stop());
        this.btnSkipStart.addEventListener("click", () => this.mmdManager.seekTo(0));
        this.btnSkipEnd.addEventListener("click", () =>
            this.mmdManager.seekTo(this.mmdManager.totalFrames)
        );

        // Speed
        this.playbackSpeed.addEventListener("change", () => {
            this.mmdManager.setPlaybackSpeed(parseFloat(this.playbackSpeed.value));
        });

        // Camera controls
        this.camFov.addEventListener("input", () => {
            const val = parseInt(this.camFov.value);
            this.camFovValue.textContent = `${val}°`;
            this.mmdManager.setCameraFov(val);
        });

        // Timeline seek
        this.timeline.onSeek = (frame) => {
            this.mmdManager.seekTo(frame);
        };

        // ── Lighting controls ───────────────────────────────────────
        const elAzimuth = document.getElementById("light-azimuth") as HTMLInputElement;
        const elElevation = document.getElementById("light-elevation") as HTMLInputElement;
        const elIntensity = document.getElementById("light-intensity") as HTMLInputElement;
        const elAmbient = document.getElementById("light-ambient") as HTMLInputElement;
        const elShadow = document.getElementById("light-shadow") as HTMLInputElement;
        const valAz = document.getElementById("light-azimuth-val")!;
        const valEl = document.getElementById("light-elevation-val")!;
        const valInt = document.getElementById("light-intensity-val")!;
        const valAmb = document.getElementById("light-ambient-val")!;
        const valSh = document.getElementById("light-shadow-val")!;

        const updateDir = () => {
            const az = Number(elAzimuth.value);
            const el = Number(elElevation.value);
            valAz.textContent = `${az}°`;
            valEl.textContent = `${el}°`;
            this.mmdManager.setLightDirection(az, el);
        };

        elAzimuth.addEventListener("input", updateDir);
        elElevation.addEventListener("input", updateDir);

        elIntensity.addEventListener("input", () => {
            const v = Number(elIntensity.value) / 100;
            valInt.textContent = v.toFixed(1);
            this.mmdManager.lightIntensity = v;
        });
        elAmbient.addEventListener("input", () => {
            const v = Number(elAmbient.value) / 100;
            valAmb.textContent = v.toFixed(1);
            this.mmdManager.ambientIntensity = v;
        });
        elShadow.addEventListener("input", () => {
            const v = Number(elShadow.value) / 100;
            valSh.textContent = v.toFixed(2);
            this.mmdManager.shadowDarkness = v;
        });

        // Initialize direction from HTML default values
        updateDir();
    }

    private setupCallbacks(): void {
        // Frame update
        this.mmdManager.onFrameUpdate = (frame, total) => {
            this.currentFrameEl.textContent = String(frame);
            this.totalFramesEl.textContent = String(total);
            this.timeline.setCurrentFrame(frame);
        };

        // Model loaded
        this.mmdManager.onModelLoaded = (info: ModelInfo) => {
            this.setStatus("モデル読込完了", false);
            this.viewportOverlay.classList.add("hidden");
            this.bottomPanel.updateMorphControls(info);
            this.bottomPanel.updateModelInfo(info);
            this.showToast(`モデル「${info.name}」を読み込みました`, "success");
        };

        // Motion loaded
        this.mmdManager.onMotionLoaded = (info: MotionInfo) => {
            this.setStatus("モーション読込完了", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.showToast(`モーション「${info.name}」を読み込みました`, "success");
        };

        // Keyframe data loaded – pass to timeline
        this.mmdManager.onKeyframesLoaded = (tracks) => {
            this.timeline.setKeyframeTracks(tracks);
        };

        // Audio loaded
        this.mmdManager.onAudioLoaded = (name: string) => {
            this.setStatus("音源読込完了", false);
            this.showToast(`音源「${name}」を読み込みました`, "success");
        };

        // Error
        this.mmdManager.onError = (message: string) => {
            this.setStatus("エラー", false);
            this.showToast(message, "error");
        };
    }

    private setupKeyboard(): void {
        document.addEventListener("keydown", (e) => {
            // Don't handle keys when focused on input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    if (this.mmdManager.isPlaying) {
                        this.pause();
                    } else {
                        this.play();
                    }
                    break;
                case "Home":
                    this.mmdManager.seekTo(0);
                    break;
                case "End":
                    this.mmdManager.seekTo(this.mmdManager.totalFrames);
                    break;
                case "ArrowLeft":
                    this.mmdManager.seekTo(this.mmdManager.currentFrame - (e.shiftKey ? 10 : 1));
                    break;
                case "ArrowRight":
                    this.mmdManager.seekTo(this.mmdManager.currentFrame + (e.shiftKey ? 10 : 1));
                    break;
            }

            // Ctrl+O = open PMX
            if (e.ctrlKey && e.key === "o") {
                e.preventDefault();
                this.loadPMX();
            }

            // Ctrl+M = open VMD
            if (e.ctrlKey && e.key === "m") {
                e.preventDefault();
                this.loadVMD();
            }

            // Ctrl+Shift+A = open MP3
            if (e.ctrlKey && e.shiftKey && e.key === "A") {
                e.preventDefault();
                this.loadMP3();
            }
        });
    }

    private setupPerfDisplay(): void {
        const fpsEl = document.getElementById("fps-value")!;
        const engineEl = document.getElementById("engine-type-badge")!;

        // Engine type - detect once on startup
        const engineType = this.mmdManager.getEngineType();
        engineEl.textContent = engineType;
        // Color-code by type
        if (engineType === "WebGPU") {
            engineEl.style.background = "rgba(139,92,246,0.15)";
            engineEl.style.color = "#a78bfa";
            engineEl.style.borderColor = "rgba(139,92,246,0.3)";
        } else if (engineType === "WebGL1") {
            engineEl.style.background = "rgba(245,158,11,0.15)";
            engineEl.style.color = "#fbbf24";
            engineEl.style.borderColor = "rgba(245,158,11,0.3)";
        }

        // FPS - update every second
        setInterval(() => {
            const fps = this.mmdManager.getFps();
            fpsEl.textContent = String(fps);
            // Color by performance
            fpsEl.style.color = fps >= 55 ? "var(--accent-green)"
                : fps >= 30 ? "var(--accent-amber)"
                    : "var(--accent-red)";
        }, 1000);

        // ── Volume fader ──────────────────────────────────────────
        const slider = document.getElementById("volume-slider") as HTMLInputElement;
        const volLabel = document.getElementById("volume-value")!;
        const muteBtn = document.getElementById("btn-mute")!;
        const iconOn = document.getElementById("icon-volume-on")!;
        const iconOff = document.getElementById("icon-volume-off")!;

        const updateVolumeUI = (isMuted: boolean) => {
            const pct = Number(slider.value);
            volLabel.textContent = `${pct}%`;
            iconOn.style.display = isMuted ? "none" : "";
            iconOff.style.display = isMuted ? "" : "none";
            muteBtn.classList.toggle("muted", isMuted);
        };

        slider.addEventListener("input", () => {
            this.mmdManager.volume = Number(slider.value) / 100;
            updateVolumeUI(this.mmdManager.muted);
        });

        muteBtn.addEventListener("click", async () => {
            await this.mmdManager.toggleMute();
            updateVolumeUI(this.mmdManager.muted);
        });
    }

    private async loadPMX(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "PMXモデル", extensions: ["pmx", "pmd"] },
            { name: "すべてのファイル", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("PMX読み込み中...", true);
        await this.mmdManager.loadPMX(filePath);
    }

    private async loadVMD(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "VMDモーション", extensions: ["vmd"] },
            { name: "すべてのファイル", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("VMD読み込み中...", true);
        await this.mmdManager.loadVMD(filePath);
    }

    private async loadMP3(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "MP3音源", extensions: ["mp3", "wav", "ogg"] },
            { name: "すべてのファイル", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("音源読み込み中...", true);
        await this.mmdManager.loadMP3(filePath);
    }

    private play(): void {
        this.mmdManager.play();
        this.btnPlay.style.display = "none";
        this.btnPause.style.display = "flex";
        this.setStatus("再生中", false);
    }

    private pause(): void {
        this.mmdManager.pause();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("一時停止", false);
    }

    private stop(): void {
        this.mmdManager.stop();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("停止", false);
    }

    private setStatus(text: string, loading: boolean): void {
        this.statusText.textContent = text;
        if (loading) {
            this.statusDot.classList.add("loading");
        } else {
            this.statusDot.classList.remove("loading");
        }
    }

    private showToast(message: string, type: "success" | "error" | "info" = "info"): void {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = "slideOut 0.3s ease forwards";
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
