import type { MmdManager } from "./mmd-manager";
import type { Timeline } from "./timeline";
import type { BottomPanel } from "./bottom-panel";
import type { ModelInfo, MotionInfo } from "./types";

type CameraViewPreset = "left" | "front" | "right";

export class UIController {
    private mmdManager: MmdManager;
    private timeline: Timeline;
    private bottomPanel: BottomPanel;

    // Button elements
    private btnLoadPmx: HTMLElement;
    private btnLoadVmd: HTMLElement;
    private btnLoadCameraVmd: HTMLElement;
    private btnLoadMp3: HTMLElement;
    private btnExportPng: HTMLElement;
    private btnToggleGround: HTMLElement;
    private groundToggleText: HTMLElement;
    private btnToggleSkydome: HTMLElement;
    private skydomeToggleText: HTMLElement;
    private btnTogglePhysics: HTMLElement;
    private physicsToggleText: HTMLElement;
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
    private camFovSlider: HTMLInputElement | null = null;
    private camFovValueEl: HTMLElement | null = null;
    private camDistanceSlider: HTMLInputElement | null = null;
    private camDistanceValueEl: HTMLElement | null = null;
    private camViewLeftBtn: HTMLButtonElement | null = null;
    private camViewFrontBtn: HTMLButtonElement | null = null;
    private camViewRightBtn: HTMLButtonElement | null = null;
    private physicsGravityAccelSlider: HTMLInputElement | null = null;
    private physicsGravityDirXSlider: HTMLInputElement | null = null;
    private physicsGravityDirYSlider: HTMLInputElement | null = null;
    private physicsGravityDirZSlider: HTMLInputElement | null = null;
    private dofFocusSlider: HTMLInputElement | null = null;
    private dofFocusValueEl: HTMLElement | null = null;
    private dofFStopValueEl: HTMLElement | null = null;
    private dofFocalLengthSlider: HTMLInputElement | null = null;
    private dofFocalLengthValueEl: HTMLElement | null = null;
    private lensDistortionSlider: HTMLInputElement | null = null;
    private lensDistortionValueEl: HTMLElement | null = null;

    constructor(mmdManager: MmdManager, timeline: Timeline, bottomPanel: BottomPanel) {
        this.mmdManager = mmdManager;
        this.timeline = timeline;
        this.bottomPanel = bottomPanel;

        // Get DOM elements
        this.btnLoadPmx = document.getElementById("btn-load-pmx")!;
        this.btnLoadVmd = document.getElementById("btn-load-vmd")!;
        this.btnLoadCameraVmd = document.getElementById("btn-load-camera-vmd")!;
        this.btnLoadMp3 = document.getElementById("btn-load-mp3")!;
        this.btnExportPng = document.getElementById("btn-export-png")!;
        this.btnToggleGround = document.getElementById("btn-toggle-ground")!;
        this.groundToggleText = document.getElementById("ground-toggle-text")!;
        this.btnToggleSkydome = document.getElementById("btn-toggle-skydome")!;
        this.skydomeToggleText = document.getElementById("skydome-toggle-text")!;
        this.btnTogglePhysics = document.getElementById("btn-toggle-physics")!;
        this.physicsToggleText = document.getElementById("physics-toggle-text")!;
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

        this.setupEventListeners();
        this.setupCallbacks();
        this.setupKeyboard();
        this.setupPerfDisplay();
        this.refreshModelSelector();
        this.updateGroundToggleButton(this.mmdManager.isGroundVisible());
        this.updateSkydomeToggleButton(this.mmdManager.isSkydomeVisible());
        this.updatePhysicsToggleButton(
            this.mmdManager.getPhysicsEnabled(),
            this.mmdManager.isPhysicsAvailable()
        );
    }

    private setupEventListeners(): void {
        // File loading
        this.btnLoadPmx.addEventListener("click", () => this.loadPMX());
        this.btnLoadVmd.addEventListener("click", () => this.loadVMD());
        this.btnLoadCameraVmd.addEventListener("click", () => this.loadCameraVMD());
        this.btnLoadMp3.addEventListener("click", () => this.loadMP3());
        this.btnExportPng.addEventListener("click", () => this.exportPNG());
        this.btnToggleGround.addEventListener("click", () => {
            const visible = this.mmdManager.toggleGroundVisible();
            this.updateGroundToggleButton(visible);
            this.showToast(visible ? "床表示: ON" : "床表示: OFF", "info");
        });
        this.btnToggleSkydome.addEventListener("click", () => {
            const visible = this.mmdManager.toggleSkydomeVisible();
            this.updateSkydomeToggleButton(visible);
            this.showToast(visible ? "Sky dome: ON" : "Sky dome: OFF", "info");
        });
        const btnToggleAa = document.getElementById("btn-toggle-aa") as HTMLButtonElement | null;
        const aaToggleText = document.getElementById("aa-toggle-text");
        if (btnToggleAa && aaToggleText) {
            const updateAaButton = () => {
                const enabled = this.mmdManager.antialiasEnabled;
                aaToggleText.textContent = enabled ? "AA ON" : "AA OFF";
                btnToggleAa.setAttribute("aria-pressed", enabled ? "true" : "false");
                btnToggleAa.classList.toggle("toggle-on", enabled);
            };
            updateAaButton();
            btnToggleAa.addEventListener("click", () => {
                this.mmdManager.antialiasEnabled = !this.mmdManager.antialiasEnabled;
                updateAaButton();
                this.showToast(this.mmdManager.antialiasEnabled ? "AA: ON" : "AA: OFF", "info");
            });
        }
        this.btnTogglePhysics.addEventListener("click", () => {
            if (!this.mmdManager.isPhysicsAvailable()) {
                this.updatePhysicsToggleButton(false, false);
                this.showToast("Physics is unavailable in this environment", "error");
                return;
            }

            const enabled = this.mmdManager.togglePhysicsEnabled();
            this.updatePhysicsToggleButton(enabled, true);
            this.showToast(enabled ? "Physics: ON" : "Physics: OFF", "info");
        });
        const physicsGravityAccel = document.getElementById("physics-gravity-accel") as HTMLInputElement | null;
        const physicsGravityAccelVal = document.getElementById("physics-gravity-accel-val");
        const physicsGravityDirX = document.getElementById("physics-gravity-dir-x") as HTMLInputElement | null;
        const physicsGravityDirXVal = document.getElementById("physics-gravity-dir-x-val");
        const physicsGravityDirY = document.getElementById("physics-gravity-dir-y") as HTMLInputElement | null;
        const physicsGravityDirYVal = document.getElementById("physics-gravity-dir-y-val");
        const physicsGravityDirZ = document.getElementById("physics-gravity-dir-z") as HTMLInputElement | null;
        const physicsGravityDirZVal = document.getElementById("physics-gravity-dir-z-val");
        this.physicsGravityAccelSlider = physicsGravityAccel;
        this.physicsGravityDirXSlider = physicsGravityDirX;
        this.physicsGravityDirYSlider = physicsGravityDirY;
        this.physicsGravityDirZSlider = physicsGravityDirZ;

        if (physicsGravityAccel && physicsGravityAccelVal) {
            const initialAccel = Math.round(this.mmdManager.getPhysicsGravityAcceleration());
            physicsGravityAccel.value = String(initialAccel);
            physicsGravityAccelVal.textContent = String(initialAccel);
            physicsGravityAccel.addEventListener("input", () => {
                const next = Number(physicsGravityAccel.value);
                this.mmdManager.setPhysicsGravityAcceleration(next);
                physicsGravityAccelVal.textContent = String(Math.round(next));
            });
        }

        if (
            physicsGravityDirX &&
            physicsGravityDirXVal &&
            physicsGravityDirY &&
            physicsGravityDirYVal &&
            physicsGravityDirZ &&
            physicsGravityDirZVal
        ) {
            const initialDir = this.mmdManager.getPhysicsGravityDirection();
            physicsGravityDirX.value = String(Math.round(initialDir.x));
            physicsGravityDirY.value = String(Math.round(initialDir.y));
            physicsGravityDirZ.value = String(Math.round(initialDir.z));
            physicsGravityDirXVal.textContent = String(Math.round(initialDir.x));
            physicsGravityDirYVal.textContent = String(Math.round(initialDir.y));
            physicsGravityDirZVal.textContent = String(Math.round(initialDir.z));

            const applyGravityDirection = () => {
                const x = Number(physicsGravityDirX.value);
                const y = Number(physicsGravityDirY.value);
                const z = Number(physicsGravityDirZ.value);
                this.mmdManager.setPhysicsGravityDirection(x, y, z);
                physicsGravityDirXVal.textContent = String(Math.round(x));
                physicsGravityDirYVal.textContent = String(Math.round(y));
                physicsGravityDirZVal.textContent = String(Math.round(z));
            };

            physicsGravityDirX.addEventListener("input", applyGravityDirection);
            physicsGravityDirY.addEventListener("input", applyGravityDirection);
            physicsGravityDirZ.addEventListener("input", applyGravityDirection);
        }
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
        const btnCamLeft = document.getElementById("btn-cam-left") as HTMLButtonElement | null;
        const btnCamFront = document.getElementById("btn-cam-front") as HTMLButtonElement | null;
        const btnCamRight = document.getElementById("btn-cam-right") as HTMLButtonElement | null;
        const camFov = document.getElementById("cam-fov") as HTMLInputElement;
        const camDistance = document.getElementById("cam-distance") as HTMLInputElement | null;
        const camFovVal = document.getElementById("cam-fov-value")!;
        const camDistanceVal = document.getElementById("cam-distance-value");
        this.camViewLeftBtn = btnCamLeft;
        this.camViewFrontBtn = btnCamFront;
        this.camViewRightBtn = btnCamRight;
        this.camFovSlider = camFov;
        this.camFovValueEl = camFovVal;
        this.camDistanceSlider = camDistance;
        this.camDistanceValueEl = camDistanceVal;
        const switchCameraView = (view: CameraViewPreset) => {
            this.mmdManager.setCameraView(view);
            this.updateCameraViewButtons(view);
        };
        btnCamLeft?.addEventListener("click", () => switchCameraView("left"));
        btnCamFront?.addEventListener("click", () => switchCameraView("front"));
        btnCamRight?.addEventListener("click", () => switchCameraView("right"));
        camFov.addEventListener("input", () => {
            const val = Number(camFov.value);
            camFovVal.textContent = `${Math.round(val)} deg`;
            this.mmdManager.setCameraFov(val);
            this.refreshDofAutoFocusReadout();
            this.refreshLensDistortionAutoReadout();
        });
        if (camDistance && camDistanceVal) {
            camDistance.addEventListener("input", () => {
                const val = Number(camDistance.value);
                this.mmdManager.setCameraDistance(val);
                camDistanceVal.textContent = `${this.mmdManager.getCameraDistance().toFixed(1)}m`;
                this.refreshDofAutoFocusReadout();
            });
        }
        // Initialize camera UI from runtime values
        this.updateCameraViewButtons("front");
        const initialFov = this.mmdManager.getCameraFov();
        camFov.value = String(Math.round(initialFov));
        camFovVal.textContent = `${Math.round(initialFov)} deg`;
        if (camDistance && camDistanceVal) {
            const initialDistance = this.mmdManager.getCameraDistance();
            const min = Number(camDistance.min);
            const max = Number(camDistance.max);
            const clamped = Math.max(min, Math.min(max, initialDistance));
            camDistance.value = String(Math.round(clamped));
            camDistanceVal.textContent = `${initialDistance.toFixed(1)}m`;
        }

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
        const elEffectColorTemp = document.getElementById("effect-color-temp") as HTMLInputElement | null;
        const valEffectColorTemp = document.getElementById("effect-color-temp-val");
        const elEffectContrast = document.getElementById("effect-contrast") as HTMLInputElement | null;
        const valEffectContrast = document.getElementById("effect-contrast-val");
        const elEffectGamma = document.getElementById("effect-gamma") as HTMLInputElement | null;
        const valEffectGamma = document.getElementById("effect-gamma-val");
        const elEffectLensDistortion = document.getElementById("effect-lens-distortion") as HTMLInputElement | null;
        const valEffectLensDistortion = document.getElementById("effect-lens-distortion-val");
        const elEffectLensDistortionInfluence = document.getElementById("effect-lens-distortion-influence") as HTMLInputElement | null;
        const valEffectLensDistortionInfluence = document.getElementById("effect-lens-distortion-influence-val");
        const elEffectLensEdgeBlur = document.getElementById("effect-lens-edge-blur") as HTMLInputElement | null;
        const valEffectLensEdgeBlur = document.getElementById("effect-lens-edge-blur-val");
        const elEffectDofEnabled = document.getElementById("effect-dof-enabled") as HTMLInputElement | null;
        const valEffectDofEnabled = document.getElementById("effect-dof-enabled-val");
        const elEffectDofQuality = document.getElementById("effect-dof-quality") as HTMLSelectElement | null;
        const valEffectDofQuality = document.getElementById("effect-dof-quality-val");
        const elEffectDofFocus = document.getElementById("effect-dof-focus") as HTMLInputElement | null;
        const valEffectDofFocus = document.getElementById("effect-dof-focus-val");
        const elEffectDofFocusOffset = document.getElementById("effect-dof-focus-offset") as HTMLInputElement | null;
        const valEffectDofFocusOffset = document.getElementById("effect-dof-focus-offset-val");
        const elEffectDofFStop = document.getElementById("effect-dof-fstop") as HTMLInputElement | null;
        const valEffectDofFStop = document.getElementById("effect-dof-fstop-val");
        const elEffectDofNearSuppression = document.getElementById("effect-dof-near-suppression") as HTMLInputElement | null;
        const valEffectDofNearSuppression = document.getElementById("effect-dof-near-suppression-val");
        const elEffectDofFocalInvert = document.getElementById("effect-dof-focal-invert") as HTMLInputElement | null;
        const valEffectDofFocalInvert = document.getElementById("effect-dof-focal-invert-val");
        const elEffectDofLensBlur = document.getElementById("effect-dof-lens-blur") as HTMLInputElement | null;
        const valEffectDofLensBlur = document.getElementById("effect-dof-lens-blur-val");
        const elEffectDofLensSize = document.getElementById("effect-dof-lens-size") as HTMLInputElement | null;
        const valEffectDofLensSize = document.getElementById("effect-dof-lens-size-val");
        const elEffectDofFocalLength = document.getElementById("effect-dof-focal-length") as HTMLInputElement | null;
        const valEffectDofFocalLength = document.getElementById("effect-dof-focal-length-val");
        const elEffectEdgeWidth = document.getElementById("effect-edge-width") as HTMLInputElement | null;
        const valEffectEdgeWidth = document.getElementById("effect-edge-width-val");

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

        if (elEffectColorTemp && valEffectColorTemp) {
            const applyColorTemperature = () => {
                const kelvin = Number(elEffectColorTemp.value);
                this.mmdManager.lightColorTemperature = kelvin;
                valEffectColorTemp.textContent = `${Math.round(this.mmdManager.lightColorTemperature)} K`;
            };
            elEffectColorTemp.value = String(Math.round(this.mmdManager.lightColorTemperature));
            applyColorTemperature();
            elEffectColorTemp.addEventListener("input", applyColorTemperature);
        }

        if (elEffectContrast && valEffectContrast) {
            const applyContrast = () => {
                const offsetPercent = Number(elEffectContrast.value);
                const contrast = 1 + offsetPercent / 100;
                this.mmdManager.postEffectContrast = contrast;
                const roundedOffset = Math.round((this.mmdManager.postEffectContrast - 1) * 100);
                valEffectContrast.textContent = `${roundedOffset}%`;
            };
            elEffectContrast.value = String(Math.round((this.mmdManager.postEffectContrast - 1) * 100));
            applyContrast();
            elEffectContrast.addEventListener("input", applyContrast);
        }

        if (elEffectGamma && valEffectGamma) {
            const applyGamma = () => {
                const offsetPercent = Number(elEffectGamma.value);
                // 0% keeps the current baseline gamma (2.0), then adjusts within +/-50%.
                const gammaPower = Math.pow(2, 1 - offsetPercent / 100);
                this.mmdManager.postEffectGamma = gammaPower;
                const roundedOffset = Math.round((1 - Math.log2(this.mmdManager.postEffectGamma)) * 100);
                valEffectGamma.textContent = `${roundedOffset}%`;
            };
            elEffectGamma.value = String(Math.round((1 - Math.log2(this.mmdManager.postEffectGamma)) * 100));
            applyGamma();
            elEffectGamma.addEventListener("input", applyGamma);
        }

        if (elEffectLensDistortion && valEffectLensDistortion) {
            const distortionLinkedToFov = this.mmdManager.dofLensDistortionLinkedToCameraFov;
            this.lensDistortionSlider = elEffectLensDistortion;
            this.lensDistortionValueEl = valEffectLensDistortion;
            const applyLensDistortion = () => {
                if (distortionLinkedToFov) {
                    this.refreshLensDistortionAutoReadout();
                    return;
                }
                const scale = Number(elEffectLensDistortion.value) / 100;
                this.mmdManager.dofLensDistortion = scale;
                valEffectLensDistortion.textContent = `${Math.round(this.mmdManager.dofLensDistortion * 100)}%`;
            };
            elEffectLensDistortion.value = String(Math.round(this.mmdManager.dofLensDistortion * 100));
            if (distortionLinkedToFov) {
                elEffectLensDistortion.disabled = true;
                elEffectLensDistortion.title = "Auto distortion (linked to camera FoV; 30deg = 0%)";
            }
            applyLensDistortion();
            if (!distortionLinkedToFov) {
                elEffectLensDistortion.addEventListener("input", applyLensDistortion);
            }
        }

        if (elEffectLensDistortionInfluence && valEffectLensDistortionInfluence) {
            const applyLensDistortionInfluence = () => {
                const scale = Number(elEffectLensDistortionInfluence.value) / 100;
                this.mmdManager.dofLensDistortionInfluence = scale;
                valEffectLensDistortionInfluence.textContent = `${Math.round(this.mmdManager.dofLensDistortionInfluence * 100)}%`;
                this.refreshLensDistortionAutoReadout();
            };
            elEffectLensDistortionInfluence.value = String(
                Math.round(this.mmdManager.dofLensDistortionInfluence * 100)
            );
            applyLensDistortionInfluence();
            elEffectLensDistortionInfluence.addEventListener("input", applyLensDistortionInfluence);
        }

        if (elEffectLensEdgeBlur && valEffectLensEdgeBlur) {
            const applyLensEdgeBlur = () => {
                const scale = Number(elEffectLensEdgeBlur.value) / 100;
                this.mmdManager.dofLensEdgeBlur = scale;
                valEffectLensEdgeBlur.textContent = `${Math.round(this.mmdManager.dofLensEdgeBlur * 100)}%`;
            };
            elEffectLensEdgeBlur.value = String(Math.round(this.mmdManager.dofLensEdgeBlur * 100));
            applyLensEdgeBlur();
            elEffectLensEdgeBlur.addEventListener("input", applyLensEdgeBlur);
        }

        if (
            elEffectDofEnabled &&
            valEffectDofEnabled &&
            elEffectDofQuality &&
            valEffectDofQuality &&
            elEffectDofFocus &&
            valEffectDofFocus &&
            elEffectDofFocusOffset &&
            valEffectDofFocusOffset &&
            elEffectDofFStop &&
            valEffectDofFStop &&
            elEffectDofNearSuppression &&
            valEffectDofNearSuppression &&
            elEffectDofFocalInvert &&
            valEffectDofFocalInvert &&
            elEffectDofLensBlur &&
            valEffectDofLensBlur &&
            elEffectDofLensSize &&
            valEffectDofLensSize &&
            elEffectDofFocalLength &&
            valEffectDofFocalLength
        ) {
            const blurLabels = ["Low", "Medium", "High"];
            const autoFocusEnabled = this.mmdManager.dofAutoFocusEnabled;
            const focalLengthLinkedToFov = this.mmdManager.dofFocalLengthLinkedToCameraFov;
            this.dofFocusSlider = elEffectDofFocus;
            this.dofFocusValueEl = valEffectDofFocus;
            this.dofFStopValueEl = valEffectDofFStop;
            this.dofFocalLengthSlider = elEffectDofFocalLength;
            this.dofFocalLengthValueEl = valEffectDofFocalLength;

            const applyDofEnabled = () => {
                this.mmdManager.dofEnabled = elEffectDofEnabled.checked;
                valEffectDofEnabled.textContent = this.mmdManager.dofEnabled ? "ON" : "OFF";
            };
            const applyDofQuality = () => {
                const level = Number(elEffectDofQuality.value);
                this.mmdManager.dofBlurLevel = level;
                valEffectDofQuality.textContent = blurLabels[this.mmdManager.dofBlurLevel] ?? "High";
            };
            const applyDofFocus = () => {
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                    return;
                }
                const mm = Number(elEffectDofFocus.value);
                this.mmdManager.dofFocusDistanceMm = mm;
                valEffectDofFocus.textContent = `${(this.mmdManager.dofFocusDistanceMm / 1000).toFixed(1)}m`;
            };
            const applyDofFocusOffset = () => {
                const mm = Number(elEffectDofFocusOffset.value);
                this.mmdManager.dofAutoFocusNearOffsetMm = mm;
                valEffectDofFocusOffset.textContent = `${(this.mmdManager.dofAutoFocusNearOffsetMm / 1000).toFixed(1)}m`;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                }
            };
            const applyDofFStop = () => {
                const fStop = Number(elEffectDofFStop.value) / 100;
                this.mmdManager.dofFStop = fStop;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                    return;
                }
                valEffectDofFStop.textContent = this.mmdManager.dofFStop.toFixed(2);
            };
            const applyDofNearSuppression = () => {
                const scale = Number(elEffectDofNearSuppression.value) / 100;
                this.mmdManager.dofNearSuppressionScale = scale;
                valEffectDofNearSuppression.textContent = `${Math.round(this.mmdManager.dofNearSuppressionScale * 100)}%`;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                }
            };
            const applyDofFocalInvert = () => {
                this.mmdManager.dofFocalLengthDistanceInverted = elEffectDofFocalInvert.checked;
                valEffectDofFocalInvert.textContent = this.mmdManager.dofFocalLengthDistanceInverted ? "ON" : "OFF";
                if (focalLengthLinkedToFov) {
                    elEffectDofFocalLength.title = this.mmdManager.dofFocalLengthDistanceInverted
                        ? "Auto focal length (linked to camera FoV, inverted)"
                        : "Auto focal length (linked to camera FoV)";
                    this.refreshDofAutoFocusReadout();
                }
            };
            const applyDofLensBlur = () => {
                const strength = Number(elEffectDofLensBlur.value) / 100;
                this.mmdManager.dofLensBlurStrength = strength;
                valEffectDofLensBlur.textContent = `${Math.round(this.mmdManager.dofLensBlurStrength * 100)}%`;
            };
            const applyDofLensSize = () => {
                const lensSize = Number(elEffectDofLensSize.value);
                this.mmdManager.dofLensSize = lensSize;
                valEffectDofLensSize.textContent = `${Math.round(this.mmdManager.dofLensSize)}`;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                }
            };
            const applyDofFocalLength = () => {
                if (focalLengthLinkedToFov) {
                    this.refreshDofAutoFocusReadout();
                    return;
                }
                const focalLength = Number(elEffectDofFocalLength.value);
                this.mmdManager.dofFocalLength = focalLength;
                valEffectDofFocalLength.textContent = `${Math.round(this.mmdManager.dofFocalLength)}`;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                }
            };

            elEffectDofEnabled.checked = this.mmdManager.dofEnabled;
            elEffectDofQuality.value = String(this.mmdManager.dofBlurLevel);
            elEffectDofFocus.value = String(Math.round(this.mmdManager.dofFocusDistanceMm));
            elEffectDofFocusOffset.value = String(Math.round(this.mmdManager.dofAutoFocusNearOffsetMm));
            elEffectDofFStop.value = String(Math.round(this.mmdManager.dofFStop * 100));
            elEffectDofNearSuppression.value = String(Math.round(this.mmdManager.dofNearSuppressionScale * 100));
            elEffectDofFocalInvert.checked = this.mmdManager.dofFocalLengthDistanceInverted;
            elEffectDofLensBlur.value = String(Math.round(this.mmdManager.dofLensBlurStrength * 100));
            elEffectDofLensSize.value = String(Math.round(this.mmdManager.dofLensSize));
            elEffectDofFocalLength.value = String(Math.round(this.mmdManager.dofFocalLength));
            if (autoFocusEnabled) {
                elEffectDofFocus.disabled = true;
                elEffectDofFocus.title = `Auto focus (camera target, ${this.mmdManager.dofAutoFocusRangeMeters.toFixed(1)}m radius in focus)`;
            }
            if (focalLengthLinkedToFov) {
                elEffectDofFocalLength.disabled = true;
                elEffectDofFocalLength.title = "Auto focal length (linked to camera FoV)";
            }

            applyDofEnabled();
            applyDofQuality();
            applyDofFocus();
            applyDofFocusOffset();
            applyDofFStop();
            applyDofNearSuppression();
            applyDofFocalInvert();
            applyDofLensBlur();
            applyDofLensSize();
            applyDofFocalLength();
            this.refreshDofAutoFocusReadout();

            elEffectDofEnabled.addEventListener("change", applyDofEnabled);
            elEffectDofQuality.addEventListener("change", applyDofQuality);
            if (!autoFocusEnabled) {
                elEffectDofFocus.addEventListener("input", applyDofFocus);
            }
            elEffectDofFocusOffset.addEventListener("input", applyDofFocusOffset);
            elEffectDofFStop.addEventListener("input", applyDofFStop);
            elEffectDofNearSuppression.addEventListener("input", applyDofNearSuppression);
            elEffectDofFocalInvert.addEventListener("change", applyDofFocalInvert);
            elEffectDofLensBlur.addEventListener("input", applyDofLensBlur);
            elEffectDofLensSize.addEventListener("input", applyDofLensSize);
            if (!focalLengthLinkedToFov) {
                elEffectDofFocalLength.addEventListener("input", applyDofFocalLength);
            }
        }

        if (elEffectEdgeWidth && valEffectEdgeWidth) {
            const applyEdgeWidth = () => {
                const sliderValue = Number(elEffectEdgeWidth.value);
                const scale = sliderValue / 100;
                this.mmdManager.modelEdgeWidth = scale;
                valEffectEdgeWidth.textContent = `${Math.round(this.mmdManager.modelEdgeWidth * 100)}%`;
            };
            elEffectEdgeWidth.value = String(Math.round(this.mmdManager.modelEdgeWidth * 100));
            applyEdgeWidth();
            elEffectEdgeWidth.addEventListener("input", applyEdgeWidth);
        }

        // Initialize direction from HTML default values
        updateDir();
    }

    private setupCallbacks(): void {
        // Frame update
        this.mmdManager.onFrameUpdate = (frame, total) => {
            this.currentFrameEl.textContent = String(frame);
            this.totalFramesEl.textContent = String(total);
            this.timeline.setCurrentFrame(frame);

            // Reflect runtime camera FOV (e.g. camera VMD playback) in the camera panel.
            if (this.camFovSlider && this.camFovValueEl && document.activeElement !== this.camFovSlider) {
                const fovDeg = this.mmdManager.getCameraFov();
                const clamped = Math.max(Number(this.camFovSlider.min), Math.min(Number(this.camFovSlider.max), fovDeg));
                this.camFovSlider.value = String(Math.round(clamped));
                this.camFovValueEl.textContent = `${Math.round(fovDeg)} deg`;
            }
            if (this.camDistanceSlider && this.camDistanceValueEl && document.activeElement !== this.camDistanceSlider) {
                const distance = this.mmdManager.getCameraDistance();
                const clamped = Math.max(Number(this.camDistanceSlider.min), Math.min(Number(this.camDistanceSlider.max), distance));
                this.camDistanceSlider.value = String(Math.round(clamped));
                this.camDistanceValueEl.textContent = `${distance.toFixed(1)}m`;
            }
            this.refreshDofAutoFocusReadout();
            this.refreshLensDistortionAutoReadout();
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

        this.mmdManager.onCameraMotionLoaded = (info: MotionInfo) => {
            this.setStatus("Camera motion loaded", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.showToast(`Loaded camera motion: ${info.name}`, "success");
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

        this.mmdManager.onPhysicsStateChanged = (enabled: boolean, available: boolean) => {
            this.updatePhysicsToggleButton(enabled, available);
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

            // Ctrl+Shift+M = open camera VMD
            if (e.ctrlKey && e.shiftKey && (e.key === "M" || e.key === "m")) {
                e.preventDefault();
                this.loadCameraVMD();
            }

            // Ctrl+Shift+A = open MP3
            if (e.ctrlKey && e.shiftKey && e.key === "A") {
                e.preventDefault();
                this.loadMP3();
            }

            // Ctrl+Shift+S = export PNG
            if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
                e.preventDefault();
                void this.exportPNG();
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
            this.refreshDofAutoFocusReadout();
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

    private async loadCameraVMD(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "VMD camera motion", extensions: ["vmd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading camera VMD...", true);
        await this.mmdManager.loadCameraVMD(filePath);
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

    private async exportPNG(): Promise<void> {
        this.setStatus("Exporting PNG...", true);

        const dataUrl = await this.mmdManager.capturePngDataUrl(1);
        if (!dataUrl) {
            this.setStatus("PNG export failed", false);
            return;
        }

        const now = new Date();
        const pad = (v: number) => String(v).padStart(2, "0");
        const fileName = `mmd_capture_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

        const savedPath = await window.electronAPI.savePngFile(dataUrl, fileName);
        if (!savedPath) {
            this.setStatus("Ready", false);
            this.showToast("PNG export canceled", "info");
            return;
        }

        const basename = savedPath.replace(/^.*[\\/]/, "");
        this.setStatus("PNG saved", false);
        this.showToast(`Saved PNG: ${basename}`, "success");
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

    private updateSkydomeToggleButton(visible: boolean): void {
        this.skydomeToggleText.textContent = visible ? "空表示ON" : "空表示OFF";
        this.btnToggleSkydome.setAttribute("aria-pressed", visible ? "true" : "false");
        this.btnToggleSkydome.classList.toggle("toggle-on", visible);
    }

    private updatePhysicsToggleButton(enabled: boolean, available: boolean): void {
        const active = available && enabled;
        this.physicsToggleText.textContent = available ? (active ? "物理ON" : "物理OFF") : "物理不可";
        this.btnTogglePhysics.setAttribute("aria-pressed", active ? "true" : "false");
        this.btnTogglePhysics.classList.toggle("toggle-on", active);
        (this.btnTogglePhysics as HTMLButtonElement).disabled = !available;
        if (this.physicsGravityAccelSlider) {
            this.physicsGravityAccelSlider.disabled = !available;
        }
        if (this.physicsGravityDirXSlider) this.physicsGravityDirXSlider.disabled = !available;
        if (this.physicsGravityDirYSlider) this.physicsGravityDirYSlider.disabled = !available;
        if (this.physicsGravityDirZSlider) this.physicsGravityDirZSlider.disabled = !available;
    }

    private updateCameraViewButtons(active: CameraViewPreset): void {
        const left = active === "left";
        const front = active === "front";
        const right = active === "right";
        this.camViewLeftBtn?.classList.toggle("camera-view-btn--active", left);
        this.camViewFrontBtn?.classList.toggle("camera-view-btn--active", front);
        this.camViewRightBtn?.classList.toggle("camera-view-btn--active", right);
        this.camViewLeftBtn?.setAttribute("aria-pressed", left ? "true" : "false");
        this.camViewFrontBtn?.setAttribute("aria-pressed", front ? "true" : "false");
        this.camViewRightBtn?.setAttribute("aria-pressed", right ? "true" : "false");
    }

    private refreshDofAutoFocusReadout(): void {
        if (!this.mmdManager.dofAutoFocusEnabled) return;

        if (this.dofFocusSlider && this.dofFocusValueEl) {
            const focusMm = this.mmdManager.dofFocusDistanceMm;
            const sliderMin = Number(this.dofFocusSlider.min);
            const sliderMax = Number(this.dofFocusSlider.max);
            const clamped = Math.max(sliderMin, Math.min(sliderMax, focusMm));
            this.dofFocusSlider.value = String(Math.round(clamped));
            this.dofFocusValueEl.textContent = `${(focusMm / 1000).toFixed(1)}m (auto)`;
        }

        if (this.dofFStopValueEl) {
            const baseFStop = this.mmdManager.dofFStop;
            const effectiveFStop = this.mmdManager.dofEffectiveFStop;
            const hasCompensation = effectiveFStop > baseFStop + 0.01;
            this.dofFStopValueEl.textContent = hasCompensation
                ? `${baseFStop.toFixed(2)} -> ${effectiveFStop.toFixed(2)}`
                : effectiveFStop.toFixed(2);
        }

        if (
            this.mmdManager.dofFocalLengthLinkedToCameraFov &&
            this.dofFocalLengthSlider &&
            this.dofFocalLengthValueEl
        ) {
            const focalLength = this.mmdManager.dofFocalLength;
            const sliderMin = Number(this.dofFocalLengthSlider.min);
            const sliderMax = Number(this.dofFocalLengthSlider.max);
            const clamped = Math.max(sliderMin, Math.min(sliderMax, focalLength));
            this.dofFocalLengthSlider.value = String(Math.round(clamped));
            this.dofFocalLengthValueEl.textContent = this.mmdManager.dofFocalLengthDistanceInverted
                ? `${Math.round(focalLength)} (auto, inv)`
                : `${Math.round(focalLength)} (auto)`;
        }
    }

    private refreshLensDistortionAutoReadout(): void {
        if (!this.mmdManager.dofLensDistortionLinkedToCameraFov) return;
        if (!this.lensDistortionSlider || !this.lensDistortionValueEl) return;
        const distortionPercent = this.mmdManager.dofLensDistortion * 100;
        const sliderMin = Number(this.lensDistortionSlider.min);
        const sliderMax = Number(this.lensDistortionSlider.max);
        const clamped = Math.max(sliderMin, Math.min(sliderMax, distortionPercent));
        this.lensDistortionSlider.value = String(Math.round(clamped));
        this.lensDistortionValueEl.textContent = `${Math.round(distortionPercent)}% (auto)`;
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
