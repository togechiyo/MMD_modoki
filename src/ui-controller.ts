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
    private btnToggleGround: HTMLElement;
    private groundToggleText: HTMLElement;
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
    private modelSelect: HTMLSelectElement;

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
        this.btnToggleGround = document.getElementById("btn-toggle-ground")!;
        this.groundToggleText = document.getElementById("ground-toggle-text")!;
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
        this.modelSelect = document.getElementById("info-model-select") as HTMLSelectElement;

        this.camX = document.getElementById("cam-x") as HTMLInputElement;
        this.camY = document.getElementById("cam-y") as HTMLInputElement;
        this.camZ = document.getElementById("cam-z") as HTMLInputElement;
        this.camFov = document.getElementById("cam-fov") as HTMLInputElement;
        this.camFovValue = document.getElementById("cam-fov-value")!;

        this.setupEventListeners();
        this.setupCallbacks();
        this.setupKeyboard();
        this.setupPerfDisplay();
        this.refreshModelSelector();
        this.updateGroundToggleButton(this.mmdManager.isGroundVisible());
    }

    private setupEventListeners(): void {
        // File loading
        this.btnLoadPmx.addEventListener("click", () => this.loadPMX());
        this.btnLoadVmd.addEventListener("click", () => this.loadVMD());
        this.btnLoadMp3.addEventListener("click", () => this.loadMP3());
        this.btnToggleGround.addEventListener("click", () => {
            const visible = this.mmdManager.toggleGroundVisible();
            this.updateGroundToggleButton(visible);
            this.showToast(visible ? "床表示: ON" : "床表示: OFF", "info");
        });

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

        // Active model selector
        this.modelSelect.addEventListener("change", () => {
            const index = Number.parseInt(this.modelSelect.value, 10);
            if (Number.isNaN(index)) return;
            const ok = this.mmdManager.setActiveModelByIndex(index);
            if (!ok) {
                this.showToast("Failed to switch active model", "error");
                return;
            }
            this.refreshModelSelector();
            this.showToast("Active model switched", "success");
        });

        // Camera controls
        this.camFov.addEventListener("input", () => {
            const val = parseInt(this.camFov.value);
            this.camFovValue.textContent = `${val} deg`;
            this.mmdManager.setCameraFov(val);
        });

        // Timeline seek
        this.timeline.onSeek = (frame) => {
            this.mmdManager.seekTo(frame);
        };

        // Lighting controls
        const elAzimuth = document.getElementById("light-azimuth") as HTMLInputElement;
        const elElevation = document.getElementById("light-elevation") as HTMLInputElement;
        const elIntensity = document.getElementById("light-intensity") as HTMLInputElement;
        const elAmbient = document.getElementById("light-ambient") as HTMLInputElement;
        const elShadow = document.getElementById("light-shadow") as HTMLInputElement;
        const elShadowSoftness = document.getElementById("light-shadow-softness") as HTMLInputElement;
        const valAz = document.getElementById("light-azimuth-val")!;
        const valEl = document.getElementById("light-elevation-val")!;
        const valInt = document.getElementById("light-intensity-val")!;
        const valAmb = document.getElementById("light-ambient-val")!;
        const valSh = document.getElementById("light-shadow-val")!;
        const valShSoftness = document.getElementById("light-shadow-softness-val")!;

        const updateDir = () => {
            const az = Number(elAzimuth.value);
            const el = Number(elElevation.value);
            valAz.textContent = `${az} deg`;
            valEl.textContent = `${el} deg`;
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
        elShadowSoftness.addEventListener("input", () => {
            const v = Number(elShadowSoftness.value) / 1000;
            valShSoftness.textContent = v.toFixed(3);
            this.mmdManager.shadowEdgeSoftness = v;
        });

        // Shadow is always enabled in UI.
        this.mmdManager.setShadowEnabled(true);
        elShadow.value = String(Math.round(this.mmdManager.shadowDarkness * 100));
        valSh.textContent = this.mmdManager.shadowDarkness.toFixed(2);
        elShadowSoftness.value = String(Math.round(this.mmdManager.shadowEdgeSoftness * 1000));
        valShSoftness.textContent = this.mmdManager.shadowEdgeSoftness.toFixed(3);

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

        // Active model changed
        this.mmdManager.onModelLoaded = (info: ModelInfo) => {
            this.setStatus("Model ready", false);
            this.viewportOverlay.classList.add("hidden");
            this.bottomPanel.updateMorphControls(info);
            this.bottomPanel.updateModelInfo(info);
            this.refreshModelSelector();
        };

        // Any model loaded into scene
        this.mmdManager.onSceneModelLoaded = (info: ModelInfo, totalCount: number, active: boolean) => {
            this.setStatus("Model loaded", false);
            this.viewportOverlay.classList.add("hidden");
            this.refreshModelSelector();
            const activeLabel = active ? " [active]" : "";
            this.showToast(`Loaded model: ${info.name} (${totalCount})${activeLabel}`, "success");
        };

        // Motion loaded
        this.mmdManager.onMotionLoaded = (info: MotionInfo) => {
            this.setStatus("Motion loaded", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.showToast(`Loaded motion: ${info.name}`, "success");
        };

        // Keyframe data loaded
        this.mmdManager.onKeyframesLoaded = (tracks) => {
            this.timeline.setKeyframeTracks(tracks);
        };

        // Audio loaded
        this.mmdManager.onAudioLoaded = (name: string) => {
            this.setStatus("Audio loaded", false);
            this.showToast(`Loaded audio: ${name}`, "success");
        };

        // Error
        this.mmdManager.onError = (message: string) => {
            this.setStatus("Error", false);
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
            fpsEl.style.color = fps >= 55 ? "var(--accent-green)"
                : fps >= 30 ? "var(--accent-amber)"
                    : "var(--accent-red)";
        }, 1000);

        // Volume fader
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
            { name: "PMX model", extensions: ["pmx", "pmd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading PMX...", true);
        await this.mmdManager.loadPMX(filePath);
    }

    private async loadVMD(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "VMD motion", extensions: ["vmd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading VMD...", true);
        await this.mmdManager.loadVMD(filePath);
    }

    private async loadMP3(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "Audio", extensions: ["mp3", "wav", "ogg"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading audio...", true);
        await this.mmdManager.loadMP3(filePath);
    }

    private refreshModelSelector(): void {
        const models = this.mmdManager.getLoadedModels();
        this.modelSelect.innerHTML = "";

        if (models.length === 0) {
            const emptyOption = document.createElement("option");
            emptyOption.value = "";
            emptyOption.textContent = "-";
            this.modelSelect.appendChild(emptyOption);
            this.modelSelect.disabled = true;
            return;
        }

        let selected = false;
        for (const model of models) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            if (model.active) {
                option.selected = true;
                selected = true;
            }
            this.modelSelect.appendChild(option);
        }

        if (!selected) {
            this.modelSelect.selectedIndex = 0;
        }
        this.modelSelect.disabled = models.length < 2;
    }

    private updateGroundToggleButton(visible: boolean): void {
        this.groundToggleText.textContent = visible ? "床表示ON" : "床表示OFF";
        this.btnToggleGround.setAttribute("aria-pressed", visible ? "true" : "false");
        this.btnToggleGround.classList.toggle("toggle-on", visible);
    }

    private play(): void {
        this.mmdManager.play();
        this.btnPlay.style.display = "none";
        this.btnPause.style.display = "flex";
        this.setStatus("Playing", false);
    }

    private pause(): void {
        this.mmdManager.pause();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("Paused", false);
    }

    private stop(): void {
        this.mmdManager.stop();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("Stopped", false);
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
