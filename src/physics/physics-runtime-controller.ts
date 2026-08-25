import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MmdBulletPhysics } from "babylon-mmd/esm/Runtime/Optimized/Physics/mmdBulletPhysics";
import { MultiPhysicsRuntime } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/multiPhysicsRuntime";
import { PhysicsRuntimeEvaluationType } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/physicsRuntimeEvaluationType";
import { MotionType } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/motionType";
import { PhysicsStaticPlaneShape } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/physicsShape";
import { RigidBody } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/rigidBody";
import { RigidBodyConstructionInfo } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/rigidBodyConstructionInfo";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdWasmRuntime } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime";
import type { IMmdWasmInstance } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance";
import { logError, logInfo, logWarn, toLogErrorData } from "../app-logger";

export type PhysicsSimulationRateHz = 60;
export type PhysicsBackend = "none" | "bullet-mpr" | "bullet-spr" | "wasm-mpr";
type BulletPhysicsBackend = Extract<PhysicsBackend, "bullet-mpr" | "bullet-spr">;
export type PreferredBulletPhysicsBackend = "auto" | BulletPhysicsBackend;
export type PhysicsBackendLabel = "Bullet MPR" | "Bullet SPR" | "WASM MPR" | "Off";
export type PhysicsEvaluationTypeLabel = "Immediate" | "Buffered" | "WasmImmediate";
type RuntimeMmdRuntime = MmdRuntime | MmdWasmRuntime;

type PhysicsStepTimingStats = {
    samples: number;
    totalMs: number;
    maxMs: number;
    lastMs: number | null;
};

type PhysicsDeltaTimingStats = {
    samples: number;
    rawMaxMs: number;
    usedMaxMs: number;
    lastRawMs: number | null;
    lastUsedMs: number | null;
};

export type PhysicsPerformanceSampleContext = {
    runtimeMode: "classic" | "wasm";
    engine: string;
    fps: number;
    modelCount: number;
    simulationActive: boolean;
};

export type PhysicsRuntimeControllerOptions = {
    scene: Scene;
    runtime: RuntimeMmdRuntime;
    getMprUnavailableReason: () => string | null;
    loadMprWasmInstance: () => Promise<IMmdWasmInstance>;
    loadSprWasmInstance: () => Promise<IMmdWasmInstance>;
    onStateChanged?: (enabled: boolean, available: boolean) => void;
    onError?: (message: string) => void;
};

const PHYSICS_SIMULATION_RATE_HZ: PhysicsSimulationRateHz = 60;
const PHYSICS_FIXED_TIME_STEP_SECONDS = 1 / PHYSICS_SIMULATION_RATE_HZ;
const DEFAULT_PHYSICS_MAX_SUB_STEPS = 180;
const DEFAULT_PHYSICS_DELTA_MS = 1000 / 60;
const DEFAULT_USE_BUFFERED_EVALUATION_DURING_PLAYBACK = true;
const PHYSICS_DELTA_WARNING_INTERVAL_MS = 5000;

type BulletFloorCollisionBody = {
    shape: PhysicsStaticPlaneShape;
    info: RigidBodyConstructionInfo;
    body: RigidBody;
    added: boolean;
};

export class PhysicsRuntimeController {
    private readonly scene: Scene;
    private runtime: RuntimeMmdRuntime;
    private readonly getMprUnavailableReason: () => string | null;
    private readonly loadMprWasmInstance: () => Promise<IMmdWasmInstance>;
    private readonly loadSprWasmInstance: () => Promise<IMmdWasmInstance>;
    private readonly onStateChanged?: (enabled: boolean, available: boolean) => void;
    private readonly onError?: (message: string) => void;
    private readonly wrappedWasmPhysicsClocks = new WeakSet<object>();
    private bulletPhysicsRuntime: MultiPhysicsRuntime | null = null;
    private physicsRuntime: MmdBulletPhysics | null = null;
    private floorCollisionBody: BulletFloorCollisionBody | null = null;
    private available = false;
    private backend: PhysicsBackend = "none";
    private preferredBulletBackend: PreferredBulletPhysicsBackend = "auto";
    private enabled = true;
    private floorCollisionEnabled = true;
    private bufferedEvaluationDuringPlayback = DEFAULT_USE_BUFFERED_EVALUATION_DURING_PLAYBACK;
    private simulationRateHz: PhysicsSimulationRateHz = PHYSICS_SIMULATION_RATE_HZ;
    private maxSubSteps = DEFAULT_PHYSICS_MAX_SUB_STEPS;
    private gravityAcceleration = 98;
    private gravityDirection = new Vector3(0, -100, 0);
    private bulletEvaluationType = PhysicsRuntimeEvaluationType.Immediate;
    private nextPerformanceLogMs = performance.now() + 10_000;
    private nextDeltaWarningMs = 0;
    private stepTimingStats: PhysicsStepTimingStats = {
        samples: 0,
        totalMs: 0,
        maxMs: 0,
        lastMs: null,
    };
    private deltaTimingStats: PhysicsDeltaTimingStats = {
        samples: 0,
        rawMaxMs: 0,
        usedMaxMs: 0,
        lastRawMs: null,
        lastUsedMs: null,
    };

    constructor(options: PhysicsRuntimeControllerOptions) {
        this.scene = options.scene;
        this.runtime = options.runtime;
        this.getMprUnavailableReason = options.getMprUnavailableReason;
        this.loadMprWasmInstance = options.loadMprWasmInstance;
        this.loadSprWasmInstance = options.loadSprWasmInstance;
        this.onStateChanged = options.onStateChanged;
        this.onError = options.onError;
    }

    public setRuntime(runtime: RuntimeMmdRuntime): void {
        this.runtime = runtime;
    }

    public getPreferredBulletBackend(): PreferredBulletPhysicsBackend {
        return this.preferredBulletBackend;
    }

    public setPreferredBulletBackend(backend: PreferredBulletPhysicsBackend): PreferredBulletPhysicsBackend {
        this.preferredBulletBackend = backend;
        return this.preferredBulletBackend;
    }

    public async initializeClassic(): Promise<boolean> {
        try {
            await this.initializeBulletPhysicsBackend();
            this.available = true;
            logInfo("physics", "physics backend initialized", {
                backend: this.getBackendLabel(),
                preferredBulletBackend: this.preferredBulletBackend,
                fallback: this.backend === "bullet-spr",
                simulationRateHz: this.simulationRateHz,
                maxSubSteps: this.maxSubSteps,
                fixedTimeStepMs: this.formatStepTimingValue(PHYSICS_FIXED_TIME_STEP_SECONDS * 1000),
                bufferedEvaluationDuringPlayback: this.bufferedEvaluationDuringPlayback,
                evaluationType: this.getEvaluationTypeLabel(),
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn("Bullet physics initialization failed:", message);
            logError("physics", "Bullet physics initialization failed; physics disabled", toLogErrorData(err));
            this.available = false;
            this.enabled = false;
            this.backend = "none";
            this.syncScenePhysicsSimulationState(false);
            this.onStateChanged?.(false, false);
            this.onError?.(`Physics init warning: Bullet=${message}`);
            return false;
        }

        this.available = true;
        this.applyGravity();
        this.onStateChanged?.(this.enabled, true);
        return true;
    }

    public useWasmRuntime(runtime: MmdWasmRuntime): void {
        this.disposeClassicResources();
        this.runtime = runtime;
        this.backend = "wasm-mpr";
        this.available = true;
        this.enabled = true;
        this.installWasmPhysicsDeltaClamp(runtime);
        this.applySimulationRate();
        this.applyGravity();
        this.onStateChanged?.(this.enabled, true);
    }

    public dispose(): void {
        this.disposeClassicResources();
        this.available = false;
        this.enabled = false;
        this.backend = "none";
    }

    public isAvailable(): boolean {
        return this.available;
    }

    public getEnabled(): boolean {
        return this.available && this.enabled;
    }

    public isFloorCollisionAvailable(): boolean {
        return this.available && this.bulletPhysicsRuntime !== null;
    }

    public getFloorCollisionEnabled(): boolean {
        return this.floorCollisionEnabled;
    }

    public setFloorCollisionEnabled(enabled: boolean): boolean {
        this.floorCollisionEnabled = Boolean(enabled);
        this.syncFloorCollisionBody();
        return this.getFloorCollisionEnabled();
    }

    public toggleFloorCollisionEnabled(): boolean {
        return this.setFloorCollisionEnabled(!this.floorCollisionEnabled);
    }

    public setEnabled(enabled: boolean, simulationActive: boolean, playbackActive = false): boolean {
        if (!this.available) {
            this.enabled = false;
            this.syncScenePhysicsSimulationState(simulationActive);
            this.onStateChanged?.(false, false);
            return false;
        }

        this.enabled = enabled;
        this.syncBulletEvaluationTypeForPlayback(playbackActive);
        this.syncScenePhysicsSimulationState(simulationActive);
        this.onStateChanged?.(this.enabled, true);
        return this.enabled;
    }

    public getSimulationRateHz(): PhysicsSimulationRateHz {
        return this.simulationRateHz;
    }

    public getMaxSubSteps(): number {
        return this.maxSubSteps;
    }

    public setMaxSubSteps(value: number): number {
        this.maxSubSteps = PhysicsRuntimeController.normalizeMaxSubSteps(value);
        this.applySimulationRate();
        logInfo("physics", "physics max substeps changed", {
            maxSubSteps: this.maxSubSteps,
            simulationRateHz: this.simulationRateHz,
            fixedTimeStepMs: this.formatStepTimingValue(PHYSICS_FIXED_TIME_STEP_SECONDS * 1000),
        });
        return this.maxSubSteps;
    }

    public setSimulationRateHz(value: number): PhysicsSimulationRateHz {
        const normalized = PhysicsRuntimeController.normalizeSimulationRate(value);
        this.simulationRateHz = normalized;
        this.applySimulationRate();
        return normalized;
    }

    public getGravityAcceleration(): number {
        return this.gravityAcceleration;
    }

    public setGravityAcceleration(value: number): void {
        this.gravityAcceleration = Math.max(0, Math.min(200, value));
        this.applyGravity();
    }

    public getGravityDirection(): { x: number; y: number; z: number } {
        return {
            x: this.gravityDirection.x,
            y: this.gravityDirection.y,
            z: this.gravityDirection.z,
        };
    }

    public setGravityDirection(x: number, y: number, z: number): void {
        this.gravityDirection.x = Math.max(-100, Math.min(100, x));
        this.gravityDirection.y = Math.max(-100, Math.min(100, y));
        this.gravityDirection.z = Math.max(-100, Math.min(100, z));
        this.applyGravity();
    }

    public getBufferedEvaluationDuringPlayback(): boolean {
        return this.bufferedEvaluationDuringPlayback;
    }

    public setBufferedEvaluationDuringPlayback(enabled: boolean, playbackActive = false): boolean {
        this.bufferedEvaluationDuringPlayback = Boolean(enabled);
        this.syncBulletEvaluationTypeForPlayback(playbackActive);
        return this.bufferedEvaluationDuringPlayback;
    }

    public syncScenePhysicsSimulationState(simulationActive: boolean): void {
        this.scene.physicsEnabled = this.getEnabled() && simulationActive;
    }

    public syncBulletEvaluationTypeForPlayback(playbackActive = false): void {
        const useBuffered = this.bufferedEvaluationDuringPlayback
            && playbackActive
            && this.getEnabled()
            && this.bulletPhysicsRuntime !== null;
        this.setBulletEvaluationType(
            useBuffered ? PhysicsRuntimeEvaluationType.Buffered : PhysicsRuntimeEvaluationType.Immediate,
            playbackActive ? "playback active" : "playback inactive",
        );
    }

    public syncBulletEvaluationTypeForSeek(): void {
        this.setBulletEvaluationType(PhysicsRuntimeEvaluationType.Immediate, "seek");
    }

    public getBackendLabel(): PhysicsBackendLabel {
        if (!this.available) {
            return "Off";
        }
        return PhysicsRuntimeController.getBackendLabelForBackend(this.backend);
    }

    public getEvaluationTypeLabel(): PhysicsEvaluationTypeLabel {
        if (this.backend === "wasm-mpr" || this.runtime instanceof MmdWasmRuntime) {
            return "WasmImmediate";
        }
        return this.bulletEvaluationType === PhysicsRuntimeEvaluationType.Buffered ? "Buffered" : "Immediate";
    }

    public logPerformanceSample(nowMs: number, context: PhysicsPerformanceSampleContext): void {
        if (nowMs < this.nextPerformanceLogMs) {
            return;
        }
        this.nextPerformanceLogMs = nowMs + 10_000;
        const physicsStepTiming = this.consumeStepTimingStats();
        const physicsDeltaTiming = this.consumeDeltaTimingStats();
        logInfo("physics", "physics performance sample", {
            backend: this.getBackendLabel(),
            runtimeMode: context.runtimeMode,
            engine: context.engine,
            fps: context.fps,
            modelCount: context.modelCount,
            physicsAvailable: this.available,
            physicsEnabled: this.getEnabled(),
            simulationActive: context.simulationActive,
            simulationRateHz: this.simulationRateHz,
            evaluationType: this.getEvaluationTypeLabel(),
            physicsStepSamples: physicsStepTiming.samples,
            physicsStepAvgMs: this.formatStepTimingValue(physicsStepTiming.avgMs),
            physicsStepMaxMs: this.formatStepTimingValue(physicsStepTiming.maxMs),
            physicsStepLastMs: this.formatStepTimingValue(physicsStepTiming.lastMs),
            physicsFixedTimeStepMs: this.formatStepTimingValue(PHYSICS_FIXED_TIME_STEP_SECONDS * 1000),
            physicsMaxSubSteps: this.maxSubSteps,
            physicsDeltaSamples: physicsDeltaTiming.samples,
            physicsDeltaRawMaxMs: this.formatStepTimingValue(physicsDeltaTiming.rawMaxMs),
            physicsDeltaUsedMaxMs: this.formatStepTimingValue(physicsDeltaTiming.usedMaxMs),
            physicsDeltaLastRawMs: this.formatStepTimingValue(physicsDeltaTiming.lastRawMs),
            physicsDeltaLastUsedMs: this.formatStepTimingValue(physicsDeltaTiming.lastUsedMs),
            crossOriginIsolated: globalThis.crossOriginIsolated,
            sharedArrayBufferAvailable: typeof SharedArrayBuffer !== "undefined",
        });
    }

    private async initializeBulletPhysicsBackend(): Promise<void> {
        if (this.preferredBulletBackend === "bullet-spr") {
            await this.initializeBulletSprPhysicsBackend();
            return;
        }

        const mprUnavailableReason = this.getMprUnavailableReason();
        if (mprUnavailableReason === null) {
            try {
                await this.initializeBulletMprPhysicsBackend();
                return;
            } catch (err: unknown) {
                if (this.preferredBulletBackend === "bullet-mpr") {
                    throw err;
                }
                const message = err instanceof Error ? err.message : String(err);
                console.warn("Bullet MPR physics initialization failed. Falling back to SPR:", message);
                logWarn("physics", "Bullet MPR physics initialization failed; falling back to SPR", toLogErrorData(err));
            }
        } else {
            if (this.preferredBulletBackend === "bullet-mpr") {
                throw new Error(mprUnavailableReason);
            }
            logWarn("physics", "Bullet MPR physics skipped; falling back to SPR", {
                reason: mprUnavailableReason,
            });
        }

        await this.initializeBulletSprPhysicsBackend();
    }

    private initializeBulletPhysicsBackendWithWasmInstance(
        backend: BulletPhysicsBackend,
        wasmInstance: IMmdWasmInstance,
    ): void {
        // A scene cannot safely retain two registered MultiPhysicsRuntime instances.
        // Dispose the previous runtime before registering its replacement.
        this.disposeClassicResources();
        const runtime = new MultiPhysicsRuntime(wasmInstance);
        this.installBulletStepTiming(runtime);
        runtime.register(this.scene);

        this.bulletPhysicsRuntime = runtime;
        this.physicsRuntime = new MmdBulletPhysics(runtime);
        (this.runtime as unknown as { _physics: MmdBulletPhysics | null })._physics = this.physicsRuntime;
        this.backend = backend;
        this.bulletEvaluationType = PhysicsRuntimeEvaluationType.Immediate;
        runtime.evaluationType = this.bulletEvaluationType;
        this.applySimulationRate();
        this.syncFloorCollisionBody();
    }

    private async initializeBulletMprPhysicsBackend(): Promise<void> {
        this.initializeBulletPhysicsBackendWithWasmInstance("bullet-mpr", await this.loadMprWasmInstance());
    }

    private async initializeBulletSprPhysicsBackend(): Promise<void> {
        this.initializeBulletPhysicsBackendWithWasmInstance("bullet-spr", await this.loadSprWasmInstance());
    }

    private applySimulationRate(): void {
        if (this.bulletPhysicsRuntime) {
            this.bulletPhysicsRuntime.fixedTimeStep = PHYSICS_FIXED_TIME_STEP_SECONDS;
            this.bulletPhysicsRuntime.maxSubSteps = this.maxSubSteps;
        }
        if (this.runtime instanceof MmdWasmRuntime) {
            const wasmPhysics = this.runtime.physics;
            if (wasmPhysics) {
                wasmPhysics.fixedTimeStep = PHYSICS_FIXED_TIME_STEP_SECONDS;
                wasmPhysics.maxSubSteps = this.maxSubSteps;
            }
        }
    }

    private applyGravity(): void {
        const direction = this.gravityDirection.clone();
        if (direction.lengthSquared() < 1e-6) {
            direction.set(0, -1, 0);
        } else {
            direction.normalize();
        }
        const gravity = direction.scale(this.gravityAcceleration);
        if (this.bulletPhysicsRuntime) {
            this.bulletPhysicsRuntime.setGravity(gravity);
            return;
        }
        if (this.runtime instanceof MmdWasmRuntime) {
            this.runtime.physics?.setGravity(gravity);
            return;
        }
    }

    private syncFloorCollisionBody(): void {
        if (!this.bulletPhysicsRuntime || !this.floorCollisionEnabled) {
            this.disposeFloorCollisionBody();
            return;
        }
        if (this.floorCollisionBody?.added) return;

        let shape: PhysicsStaticPlaneShape | null = null;
        let info: RigidBodyConstructionInfo | null = null;
        let body: RigidBody | null = null;
        try {
            shape = new PhysicsStaticPlaneShape(this.bulletPhysicsRuntime, new Vector3(0, 1, 0), 0);
            info = new RigidBodyConstructionInfo(this.bulletPhysicsRuntime.wasmInstance);
            info.shape = shape;
            info.motionType = MotionType.Static;
            info.mass = 0;
            info.friction = 1;
            info.restitution = 0;

            body = new RigidBody(this.bulletPhysicsRuntime, info);
            const added = this.bulletPhysicsRuntime.addRigidBodyToGlobal(body);
            if (!added) {
                body.dispose();
                info.dispose();
                shape.dispose();
                body = null;
                info = null;
                shape = null;
                logWarn("physics", "Failed to add floor collision rigid body");
                return;
            }

            this.floorCollisionBody = { shape, info, body, added };
            logInfo("physics", "floor collision rigid body enabled", {
                backend: this.getBackendLabel(),
                plane: "Y=0",
            });
        } catch (err: unknown) {
            try {
                body?.dispose();
                info?.dispose();
                shape?.dispose();
            } catch (disposeErr: unknown) {
                logWarn("physics", "Failed to clean up partial floor collision rigid body", toLogErrorData(disposeErr));
            }
            logWarn("physics", "Failed to enable floor collision rigid body", toLogErrorData(err));
            this.floorCollisionBody = null;
        }
    }

    private disposeFloorCollisionBody(): void {
        const floor = this.floorCollisionBody;
        if (!floor) return;
        this.floorCollisionBody = null;

        try {
            if (floor.added && this.bulletPhysicsRuntime) {
                this.bulletPhysicsRuntime.removeRigidBodyFromGlobal(floor.body);
            }
            floor.body.dispose();
            floor.info.dispose();
            floor.shape.dispose();
            logInfo("physics", "floor collision rigid body disabled", {
                backend: this.getBackendLabel(),
            });
        } catch (err: unknown) {
            logWarn("physics", "Failed to dispose floor collision rigid body", toLogErrorData(err));
        }
    }

    private installBulletStepTiming(runtime: MultiPhysicsRuntime): void {
        const originalAfterAnimations = runtime.afterAnimations.bind(runtime);
        runtime.afterAnimations = (deltaTime: number): void => {
            const delta = this.normalizePhysicsDeltaMs(deltaTime);
            const startMs = performance.now();
            try {
                originalAfterAnimations(delta.usedMs);
            } finally {
                this.recordStepDuration(performance.now() - startMs);
            }
        };
    }

    private installWasmPhysicsDeltaClamp(runtime: MmdWasmRuntime): void {
        const runtimeWithClock = runtime as unknown as {
            _physicsClock?: {
                getDeltaTime: () => number | undefined;
            };
        };
        const originalClock = runtimeWithClock._physicsClock;
        if (!originalClock || this.wrappedWasmPhysicsClocks.has(originalClock)) return;

        const wrappedClock = {
            getDeltaTime: (): number | undefined => {
                const deltaSeconds = originalClock.getDeltaTime();
                if (deltaSeconds === undefined) return undefined;

                const delta = this.normalizePhysicsDeltaMs(deltaSeconds * 1000);
                return delta.usedMs / 1000;
            },
        };
        this.wrappedWasmPhysicsClocks.add(wrappedClock);
        runtimeWithClock._physicsClock = wrappedClock;
    }

    private normalizePhysicsDeltaMs(deltaTimeMs: number): { rawMs: number; usedMs: number } {
        const rawMs = Number.isFinite(deltaTimeMs) && deltaTimeMs > 0
            ? deltaTimeMs
            : DEFAULT_PHYSICS_DELTA_MS;
        const usedMs = rawMs;
        this.recordPhysicsDelta(rawMs, usedMs);
        return { rawMs, usedMs };
    }

    private recordPhysicsDelta(rawMs: number, usedMs: number): void {
        this.deltaTimingStats.samples += 1;
        this.deltaTimingStats.rawMaxMs = Math.max(this.deltaTimingStats.rawMaxMs, rawMs);
        this.deltaTimingStats.usedMaxMs = Math.max(this.deltaTimingStats.usedMaxMs, usedMs);
        this.deltaTimingStats.lastRawMs = rawMs;
        this.deltaTimingStats.lastUsedMs = usedMs;
        this.logDeltaSubstepWarningIfNeeded(rawMs, usedMs);
    }

    private recordStepDuration(durationMs: number): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) return;

        this.stepTimingStats.samples += 1;
        this.stepTimingStats.totalMs += durationMs;
        this.stepTimingStats.maxMs = Math.max(this.stepTimingStats.maxMs, durationMs);
        this.stepTimingStats.lastMs = durationMs;
    }

    private consumeStepTimingStats(): {
        samples: number;
        avgMs: number | null;
        maxMs: number | null;
        lastMs: number | null;
    } {
        const { samples, totalMs, maxMs, lastMs } = this.stepTimingStats;
        this.stepTimingStats = {
            samples: 0,
            totalMs: 0,
            maxMs: 0,
            lastMs,
        };
        return {
            samples,
            avgMs: samples > 0 ? totalMs / samples : null,
            maxMs: samples > 0 ? maxMs : null,
            lastMs,
        };
    }

    private consumeDeltaTimingStats(): PhysicsDeltaTimingStats {
        const stats = this.deltaTimingStats;
        this.deltaTimingStats = {
            samples: 0,
            rawMaxMs: 0,
            usedMaxMs: 0,
            lastRawMs: stats.lastRawMs,
            lastUsedMs: stats.lastUsedMs,
        };
        return stats;
    }

    private formatStepTimingValue(valueMs: number | null): number | null {
        if (valueMs === null || !Number.isFinite(valueMs)) return null;
        return Math.round(valueMs * 1000) / 1000;
    }

    private setBulletEvaluationType(evaluationType: PhysicsRuntimeEvaluationType, reason: string): void {
        if (!this.bulletPhysicsRuntime) return;
        if (this.bulletEvaluationType === evaluationType && this.bulletPhysicsRuntime.evaluationType === evaluationType) {
            return;
        }

        try {
            this.bulletPhysicsRuntime.evaluationType = evaluationType;
            this.bulletEvaluationType = evaluationType;
            const label = this.getEvaluationTypeLabel();
            logInfo("physics", "Bullet physics evaluation type changed", {
                backend: this.getBackendLabel(),
                evaluationType: label,
                reason,
                bufferedEvaluationDuringPlayback: this.bufferedEvaluationDuringPlayback,
            });
        } catch (err: unknown) {
            logWarn("physics", "Failed to change Bullet physics evaluation type", {
                evaluationType: evaluationType === PhysicsRuntimeEvaluationType.Buffered ? "Buffered" : "Immediate",
                reason,
                ...toLogErrorData(err),
            });
        }
    }

    private disposeClassicResources(): void {
        this.disposeFloorCollisionBody();
        if (this.bulletPhysicsRuntime) {
            this.bulletPhysicsRuntime.unregister();
            this.bulletPhysicsRuntime.dispose();
            this.bulletPhysicsRuntime = null;
        }
        if (this.scene.getPhysicsEngine()) {
            this.scene.disablePhysicsEngine();
        }
        if (!(this.runtime instanceof MmdWasmRuntime)) {
            (this.runtime as unknown as { _physics: MmdBulletPhysics | null })._physics = null;
        }
        this.physicsRuntime = null;
        if (this.backend !== "wasm-mpr") {
            this.backend = "none";
        }
    }

    public static normalizeSimulationRate(value: number): PhysicsSimulationRateHz {
        void value;
        return PHYSICS_SIMULATION_RATE_HZ;
    }

    public static normalizeMaxSubSteps(value: number): number {
        void value;
        return DEFAULT_PHYSICS_MAX_SUB_STEPS;
    }

    private logDeltaSubstepWarningIfNeeded(rawMs: number, usedMs: number): void {
        const maxStepMs = PHYSICS_FIXED_TIME_STEP_SECONDS * this.maxSubSteps * 1000;
        if (usedMs <= maxStepMs + 0.01) return;

        const nowMs = performance.now();
        if (nowMs < this.nextDeltaWarningMs) return;
        this.nextDeltaWarningMs = nowMs + PHYSICS_DELTA_WARNING_INTERVAL_MS;

        const requiredSubSteps = Math.ceil(rawMs / (PHYSICS_FIXED_TIME_STEP_SECONDS * 1000));
        const data = {
            backend: this.getBackendLabel(),
            evaluationType: this.getEvaluationTypeLabel(),
            rawDeltaMs: this.formatStepTimingValue(rawMs),
            usedDeltaMs: this.formatStepTimingValue(usedMs),
            fixedTimeStepMs: this.formatStepTimingValue(PHYSICS_FIXED_TIME_STEP_SECONDS * 1000),
            maxSubSteps: this.maxSubSteps,
            requiredSubSteps,
        };
        logWarn("physics", "physics delta exceeds max substeps; cloth/constraints may lag or stretch", data);
    }

    public static getBackendLabelForBackend(backend: PhysicsBackend): PhysicsBackendLabel {
        if (backend === "bullet-mpr") {
            return "Bullet MPR";
        }
        if (backend === "bullet-spr") {
            return "Bullet SPR";
        }
        if (backend === "wasm-mpr") {
            return "WASM MPR";
        }
        return "Off";
    }
}
