import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import type { MmdWasmRuntime } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";
import type { MmdWasmModel } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmModel";
import { logDebugIfEnabled, logWarn } from "../app-logger";
import type { WebmPhysicsModelSnapshot, WebmPhysicsRigidBodySnapshot } from "../types";
import {
    collectFreeLinearSpringDynamicRigidBodyIndices,
    DEFAULT_PHYSICS_COMPATIBILITY_CORRECTION_AMOUNTS,
    fullyDampedGravityScaleFromCorrectionAmount,
} from "./physics-compatibility-correction";

const MMD_CONSTRAINT_ERP_VALUE = 0.475;
const MMD_CONSTRAINT_CFM_VALUE = 0;
const MMD_CONSTRAINT_AXIS_COUNT = 6;
const BONE_EVALUATION_ORDER_NORMALIZATION_DISABLE_KEY = "mmd_modoki.physics.disableBoneOrderNormalization";
const ZERO_LIMIT_6DOF_ERP_BOOST_VALUE_KEY = "mmd_modoki.physics.zeroLimit6DofErp";
const ABNORMAL_DYNAMIC_RIGID_BODY_MASS_LIMIT = 1000;
const RECOVERED_DYNAMIC_RIGID_BODY_MASS_LIMIT = 100;
const LOW_DECIMAL_MANTISSA_RECOVERED_MASS_LIMIT = 25;
const ABNORMAL_DYNAMIC_RIGID_BODY_UNIT_MASS = 1;
const ABNORMAL_DYNAMIC_RIGID_BODY_TINY_MASS = 0.1;
const DECIMAL_MANTISSA_RECOVERED_MASS_MAX = 10;
const ABNORMAL_DYNAMIC_RIGID_BODY_MASS_CLAMP_DISABLE_KEY = "mmd_modoki.physics.disableAbnormalMassClamp";
const ABNORMAL_DYNAMIC_RIGID_BODY_MASS_MODE_KEY = "mmd_modoki.physics.abnormalMassMode";
const ABNORMAL_DYNAMIC_RIGID_BODY_TINY_MASS_VALUE_KEY = "mmd_modoki.physics.abnormalMassTinyValue";
const ABNORMAL_DYNAMIC_RIGID_BODY_MASS_TOWARD_UNIT_KEY = "mmd_modoki.physics.abnormalMassTowardUnit";
const FOLLOW_BONE_RIGID_BODY_PHYSICS_MODE = 0;
const DEFAULT_DAMPING_CORRECTION_AMOUNT = DEFAULT_PHYSICS_COMPATIBILITY_CORRECTION_AMOUNTS.damping;
const DEFAULT_GRAVITY_CORRECTION_AMOUNT = DEFAULT_PHYSICS_COMPATIBILITY_CORRECTION_AMOUNTS.gravity;
const DEFAULT_MASS_TOWARD_UNIT_AMOUNT = DEFAULT_PHYSICS_COMPATIBILITY_CORRECTION_AMOUNTS.massTowardUnit;
const RUNTIME_RIGID_BODY_DAMPING_CAP_MIN = 0.901;
const RUNTIME_RIGID_BODY_DAMPING_CAP_MAX = 0.999;
const RUNTIME_RIGID_BODY_DAMPING_LIMIT = 0.999999;
const PHYSICS_COMPATIBILITY_CORRECTION_ENABLED_KEY = "mmd_modoki.physics.compatibilityCorrectionEnabled";
const RUNTIME_RIGID_BODY_DAMPING_CAP_DISABLE_KEY = "mmd_modoki.physics.disableDampingCap";
const RUNTIME_RIGID_BODY_DAMPING_CORRECTION_AMOUNT_KEY = "mmd_modoki.physics.dampingCorrectionAmount";
const FULLY_DAMPED_RIGID_BODY_GRAVITY_SCALE_DISABLE_KEY = "mmd_modoki.physics.disableFullyDampedGravityScale";
const FULLY_DAMPED_RIGID_BODY_GRAVITY_CORRECTION_AMOUNT_KEY = "mmd_modoki.physics.fullyDampedGravityCorrectionAmount";
const FOLLOW_BONE_VELOCITY_SYNC_DT_SECONDS = 1 / 60;
const FOLLOW_BONE_VELOCITY_SYNC_DISABLE_KEY = "mmd_modoki.physics.disableFollowBoneVelocitySync";
const externalParentResyncPhysicsModels = new WeakSet<object>();
const MMD_CONSTRAINT_PARAMETERS = [
    { id: 1, name: "ERP", value: MMD_CONSTRAINT_ERP_VALUE },
    { id: 2, name: "StopERP", value: MMD_CONSTRAINT_ERP_VALUE },
    { id: 3, name: "CFM", value: MMD_CONSTRAINT_CFM_VALUE },
    { id: 4, name: "StopCFM", value: MMD_CONSTRAINT_CFM_VALUE },
] as const;
export type PhysicsRuntimeModel = MmdModel | MmdWasmModel;
export type PhysicsMmdRuntime = MmdRuntime | MmdWasmRuntime;

type PhysicsVectorLike = {
    x: number;
    y: number;
    z: number;
};

type PhysicsBodyLike = {
    transformNode?: {
        computeWorldMatrix?: (force?: boolean) => Matrix;
        scaling?: Vector3;
        rotationQuaternion?: Quaternion | null;
        position?: Vector3;
    };
    getLinearVelocityToRef?: (target: Vector3) => void;
    getAngularVelocityToRef?: (target: Vector3) => void;
    setTargetTransform?: (position: Vector3, rotation: Quaternion) => void;
    setLinearVelocity?: (velocity: Vector3) => void;
    setAngularVelocity?: (velocity: Vector3) => void;
};

type ClassicPhysicsNodeLike = {
    scaling?: Vector3;
    rotationQuaternion?: Quaternion | null;
    position?: Vector3;
    computeWorldMatrix?: (force?: boolean) => Matrix;
    physicsBody?: PhysicsBodyLike | null;
};

type ClassicPhysicsModelLike = {
    _nodes?: Array<ClassicPhysicsNodeLike | null>;
    _bodies?: Array<PhysicsBodyLike | null>;
    _constraints?: Array<PhysicsConstraintParamContainerLike | null>;
    commitBodyStates?: (states: Uint8Array) => void;
    syncBones?: () => void;
};

type BulletPhysicsBundleLike = {
    count: number;
    rigidBodyData?: Array<{
        linkedBone?: {
            getWorldMatrixToRef?: (target: Matrix) => Matrix;
        } | null;
        bodyOffsetMatrix?: Matrix;
        physicsMode?: number;
    }>;
    getTransformMatrixToRef?: (index: number, target: Matrix) => Matrix;
    getMass?: (index: number) => number;
    getLinearDamping?: (index: number) => number;
    getAngularDamping?: (index: number) => number;
    getLocalInertia?: (index: number) => Vector3;
    setDamping?: (index: number, linearDamping: number, angularDamping: number) => void;
    setMassProps?: (index: number, mass: number, localInertia: Vector3) => void;
    setDynamicTransformMatrix?: (index: number, matrix: Matrix, fallbackToSetTransformMatrix?: boolean) => void;
    setTransformMatrix?: (index: number, matrix: Matrix) => void;
    applyCentralForce?: (index: number, force: Vector3) => void;
    getLinearVelocityToRef?: (index: number, target: Vector3) => Vector3;
    getAngularVelocityToRef?: (index: number, target: Vector3) => Vector3;
    setLinearVelocity?: (index: number, velocity: Vector3, shouldSynced: boolean) => void;
    setAngularVelocity?: (index: number, velocity: Vector3, shouldSynced: boolean) => void;
    updateBufferedMotionStates?: (forceUseFrontBuffer: boolean) => void;
    needToCommit?: boolean;
    commitToWasm?: () => void;
};

type BulletPhysicsModelLike = {
    _bundle?: BulletPhysicsBundleLike | null;
    _constraints?: Array<PhysicsConstraintParamTargetLike | null>;
    _rigidBodyIndexMap?: Int32Array | number[];
    commitBodyStates?: (states: Uint8Array) => void;
    syncBodies?: () => void;
    syncBones?: () => void;
};

type PhysicsModelInternal = {
    _physicsModel?: ClassicPhysicsModelLike | BulletPhysicsModelLike | null;
    initializePhysics?: () => void;
};

type PhysicsConstraintParamTargetLike = {
    setParam?: (num: number, value: number, axis: number) => void;
};

type PhysicsConstraintParamContainerLike = PhysicsConstraintParamTargetLike & {
    physicsJoint?: PhysicsConstraintParamTargetLike | null;
    setDamping?: (index: number, damping: number) => void;
    setStiffness?: (index: number, stiffness: number) => void;
    enableSpring?: (index: number, enabled: boolean) => void;
    useFrameOffset?: (frameOffsetOnOff: boolean) => void;
};

type ConstraintParamTargetEntry = {
    target: PhysicsConstraintParamTargetLike;
    joint: PhysicsJointDiagnosticEntry | null;
};

type RuntimeConstraintDiagnosticLike = PhysicsConstraintParamContainerLike & {
    runtime?: {
        wasmInstance?: unknown;
        constructor?: { name?: string };
    };
    ptr?: number;
    _inner?: {
        _ptr?: number;
        ptr?: number;
        _bodyReference?: unknown;
        _referenceCount?: number;
        hasReferences?: boolean;
    };
    _worldReference?: unknown;
    constructor?: { name?: string };
};

type PhysicsRuntimeInitializationSetLike = {
    clear?: () => void;
};

type PhysicsRuntimeInitializerLike = {
    initializer?: PhysicsRuntimeInitializationSetLike | null;
};

type PhysicsRuntimeWithInitializationQueues = {
    _needToInitializePhysicsModels?: PhysicsRuntimeInitializationSetLike | null;
    _needToInitializePhysicsModelsBuffer?: PhysicsRuntimeInitializationSetLike | null;
    _physicsRuntime?: PhysicsRuntimeInitializerLike | null;
};

type AbnormalMassMode = "unit" | "tiny" | "mantissa" | "clamp";

type OriginalRigidBodyMassProps = {
    mass: number;
    localInertia: Vector3;
};

export type PhysicsRigidBodyDiagnosticEntry = {
    name: string;
    boneIndex: number;
    shapeType: number;
    shapePosition: [number, number, number];
    shapeRotation: [number, number, number];
    physicsMode: number;
    mass: number;
    linearDamping: number;
    angularDamping: number;
    repulsion: number;
    friction: number;
    collisionGroup: number;
    collisionMask: number;
};

export type PhysicsJointDiagnosticEntry = {
    name: string;
    rigidbodyIndexA: number;
    rigidbodyIndexB: number;
    type: number;
    position: [number, number, number];
    rotation: [number, number, number];
    positionMin: [number, number, number];
    positionMax: [number, number, number];
    rotationMin: [number, number, number];
    rotationMax: [number, number, number];
    springPosition: [number, number, number];
    springRotation: [number, number, number];
};

export type PhysicsModelControllerOptions = {
    getRuntime: () => PhysicsMmdRuntime;
    getPhysicsEnabled: () => boolean;
    isSimulationActive: () => boolean;
    getPhysicsBackendLabel: () => string;
    getPhysicsEvaluationTypeLabel: () => string;
    isPlaybackActive: () => boolean;
    isScenePhysicsEnabled: () => boolean;
    getCurrentFrameTime: () => number | null;
    getPhysicsGravity: () => Vector3;
};

export class PhysicsModelController {
    private readonly getRuntime: () => PhysicsMmdRuntime;
    private readonly getPhysicsEnabled: () => boolean;
    private readonly isSimulationActive: () => boolean;
    private readonly getPhysicsBackendLabel: () => string;
    private readonly getPhysicsEvaluationTypeLabel: () => string;
    private readonly isPlaybackActive: () => boolean;
    private readonly isScenePhysicsEnabled: () => boolean;
    private readonly getCurrentFrameTime: () => number | null;
    private readonly getPhysicsGravity: () => Vector3;
    private readonly solverParameterConfiguredPhysicsModels = new WeakSet<object>();
    private readonly originalMassPropsByPhysicsModel = new WeakMap<object, Map<number, OriginalRigidBodyMassProps>>();
    private readonly dampingCappedPhysicsModels = new WeakSet<object>();
    private readonly dampingCapBodyIndicesByPhysicsModel = new WeakMap<object, number[]>();
    private readonly fullyDampedGravityScaledPhysicsModels = new WeakSet<object>();
    private readonly followBoneVelocitySyncedPhysicsModels = new WeakSet<object>();
    private readonly physicsChainDistanceBaselines = new WeakMap<object, Map<string, number>>();

    constructor(options: PhysicsModelControllerOptions) {
        this.getRuntime = options.getRuntime;
        this.getPhysicsEnabled = options.getPhysicsEnabled;
        this.isSimulationActive = options.isSimulationActive;
        this.getPhysicsBackendLabel = options.getPhysicsBackendLabel;
        this.getPhysicsEvaluationTypeLabel = options.getPhysicsEvaluationTypeLabel;
        this.isPlaybackActive = options.isPlaybackActive;
        this.isScenePhysicsEnabled = options.isScenePhysicsEnabled;
        this.getCurrentFrameTime = options.getCurrentFrameTime;
        this.getPhysicsGravity = options.getPhysicsGravity;
    }

    public applyPhysicsStateToModel(
        model: PhysicsRuntimeModel,
        options: {
            resetPose?: boolean;
            joints?: readonly PhysicsJointDiagnosticEntry[];
            rigidBodies?: readonly PhysicsRigidBodyDiagnosticEntry[];
        } = {},
    ): void {
        if (model.rigidBodyStates.length === 0) return;

        const shouldSimulatePhysics = this.getPhysicsEnabled() && this.isSimulationActive();
        model.rigidBodyStates.fill(shouldSimulatePhysics ? 1 : 0);
        if (shouldSimulatePhysics) {
            this.getRuntime().initializeMmdModelPhysics(model as never);
            this.installFollowBoneRigidBodyVelocitySync(model);
            this.installFullyDampedRigidBodyGravityScale(
                model,
                options.rigidBodies ?? [],
                options.joints ?? [],
            );
            this.clampAbnormalDynamicRigidBodyMasses(model, options.joints);
            this.capFullyDampedRigidBodies(model);
            if (options.resetPose) {
                this.resetPhysicsModelToCurrentPose(model);
            }
            this.applyMmdConstraintSolverParameters(model, options.joints);
        }
    }

    public applyMmdConstraintSolverParameters(
        model: PhysicsRuntimeModel,
        joints: readonly PhysicsJointDiagnosticEntry[] = [],
    ): void {
        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel || typeof physicsModel !== "object") return;

        const physicsModelObject = physicsModel as object;
        if (this.solverParameterConfiguredPhysicsModels.has(physicsModelObject)) return;

        const targets = PhysicsModelController.collectConstraintParamTargets(physicsModel, joints);
        if (targets.length === 0) return;

        let appliedCount = 0;
        let zeroLimit6DofBoostedCount = 0;
        const zeroLimit6DofErp = PhysicsModelController.getZeroLimit6DofErpBoostValue();
        for (const entry of targets) {
            const result = PhysicsModelController.applyMmdConstraintSolverParametersToTarget(
                entry.target,
                entry.joint,
                zeroLimit6DofErp,
            );
            if (result.applied) {
                appliedCount += 1;
            }
            if (result.zeroLimit6DofBoosted) zeroLimit6DofBoostedCount += 1;
        }

        if (appliedCount === 0) return;

        this.solverParameterConfiguredPhysicsModels.add(physicsModelObject);
        logDebugIfEnabled("physics", "physics", "MMD constraint solver parameters applied", {
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            constraintCount: appliedCount,
            erp: MMD_CONSTRAINT_ERP_VALUE,
            cfm: MMD_CONSTRAINT_CFM_VALUE,
            zeroLimit6DofErp,
            zeroLimit6DofBoostedCount,
            zeroLimit6DofErpKey: ZERO_LIMIT_6DOF_ERP_BOOST_VALUE_KEY,
            zeroLimit6DofErpDefault: "disabled",
            params: MMD_CONSTRAINT_PARAMETERS.map((param) => param.name),
            axisCount: MMD_CONSTRAINT_AXIS_COUNT,
        });
    }

    public capFullyDampedRigidBodies(model: PhysicsRuntimeModel): void {
        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel || typeof physicsModel !== "object") return;

        const physicsModelObject = physicsModel as object;

        const bundle = PhysicsModelController.getBulletPhysicsBundle(physicsModel);
        if (
            !bundle
            || typeof bundle.getLinearDamping !== "function"
            || typeof bundle.getAngularDamping !== "function"
            || typeof bundle.setDamping !== "function"
        ) {
            return;
        }

        let bodyIndices = this.dampingCapBodyIndicesByPhysicsModel.get(physicsModelObject);
        if (!bodyIndices) {
            bodyIndices = PhysicsModelController.collectFullyDampedDynamicRigidBodyIndices(bundle);
            this.dampingCapBodyIndicesByPhysicsModel.set(physicsModelObject, bodyIndices);
        }
        if (bodyIndices.length === 0) return;

        const dampingCap = PhysicsModelController.isDampingCapDisabled()
            ? 1
            : PhysicsModelController.getFullyDampedRigidBodyDampingCap();
        const samples: Array<Record<string, unknown>> = [];
        let adjustedCount = 0;
        let linearAdjustedCount = 0;
        let angularAdjustedCount = 0;
        for (const index of bodyIndices) {
            let originalLinearDamping: number;
            let originalAngularDamping: number;
            try {
                originalLinearDamping = bundle.getLinearDamping(index);
                originalAngularDamping = bundle.getAngularDamping(index);
            } catch {
                continue;
            }
            if (!Number.isFinite(originalLinearDamping) || !Number.isFinite(originalAngularDamping)) continue;

            const adjustedLinearDamping = dampingCap;
            const adjustedAngularDamping = dampingCap;
            if (
                adjustedLinearDamping === originalLinearDamping
                && adjustedAngularDamping === originalAngularDamping
            ) {
                continue;
            }

            try {
                bundle.setDamping(index, adjustedLinearDamping, adjustedAngularDamping);
            } catch {
                continue;
            }

            adjustedCount += 1;
            if (adjustedLinearDamping !== originalLinearDamping) linearAdjustedCount += 1;
            if (adjustedAngularDamping !== originalAngularDamping) angularAdjustedCount += 1;
            if (samples.length < 12) {
                samples.push({
                    index,
            originalLinearDamping: PhysicsModelController.roundDiagnosticNumber(originalLinearDamping),
                    originalAngularDamping: PhysicsModelController.roundDiagnosticNumber(originalAngularDamping),
                    adjustedLinearDamping: PhysicsModelController.roundDiagnosticNumber(adjustedLinearDamping),
                    adjustedAngularDamping: PhysicsModelController.roundDiagnosticNumber(adjustedAngularDamping),
                    physicsMode: bundle.rigidBodyData?.[index]?.physicsMode ?? null,
                });
            }
        }

        this.dampingCappedPhysicsModels.add(physicsModelObject);
        if (adjustedCount === 0) return;

        logWarn("physics", "fully damped rigid bodies capped", {
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            limit: RUNTIME_RIGID_BODY_DAMPING_LIMIT,
            cap: dampingCap,
            correctionAmount: PhysicsModelController.getFullyDampedRigidBodyDampingCorrectionAmount(),
            valueKey: RUNTIME_RIGID_BODY_DAMPING_CORRECTION_AMOUNT_KEY,
            adjustedCount,
            linearAdjustedCount,
            angularAdjustedCount,
            disableKey: RUNTIME_RIGID_BODY_DAMPING_CAP_DISABLE_KEY,
            samples,
        });
    }

    private installFullyDampedRigidBodyGravityScale(
        model: PhysicsRuntimeModel,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        joints: readonly PhysicsJointDiagnosticEntry[],
    ): void {
        if (PhysicsModelController.isFullyDampedGravityScaleDisabled()) return;

        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel || typeof physicsModel !== "object") return;

        const physicsModelObject = physicsModel as object;
        if (this.fullyDampedGravityScaledPhysicsModels.has(physicsModelObject)) return;

        const bundle = PhysicsModelController.getBulletPhysicsBundle(physicsModel);
        if (
            !bundle
            || typeof physicsModel.syncBodies !== "function"
            || typeof bundle.getLinearDamping !== "function"
            || typeof bundle.getAngularDamping !== "function"
            || typeof bundle.getMass !== "function"
            || typeof bundle.applyCentralForce !== "function"
        ) {
            return;
        }

        const candidateRigidBodyIndices = collectFreeLinearSpringDynamicRigidBodyIndices(rigidBodies, joints);
        const rigidBodyIndexMap = PhysicsModelController.getRigidBodyIndexMap(physicsModel);
        if (candidateRigidBodyIndices.size === 0 || !rigidBodyIndexMap) return;

        const candidateBundleBodyIndices = new Set<number>();
        for (const rigidBodyIndex of candidateRigidBodyIndices) {
            const bundleBodyIndex = rigidBodyIndexMap[rigidBodyIndex];
            if (Number.isInteger(bundleBodyIndex) && bundleBodyIndex >= 0 && bundleBodyIndex < bundle.count) {
                candidateBundleBodyIndices.add(bundleBodyIndex);
            }
        }
        const bodyIndices = PhysicsModelController.collectFullyDampedDynamicRigidBodyIndices(bundle)
            .filter((index) => candidateBundleBodyIndices.has(index));

        if (bodyIndices.length === 0) return;

        const originalSyncBodies = physicsModel.syncBodies.bind(physicsModel);
        const compensationForce = Vector3.Zero();
        let sampleLogged = false;

        physicsModel.syncBodies = (): void => {
            originalSyncBodies();

            if (externalParentResyncPhysicsModels.has(physicsModelObject)) return;
            if (PhysicsModelController.isFullyDampedGravityScaleDisabled()) return;
            const gravityScale = PhysicsModelController.getFullyDampedGravityScale();
            if (gravityScale >= 0.999999) return;
            const gravity = this.getPhysicsGravity();
            if (!PhysicsModelController.isFiniteVector(gravity)) return;
            for (const index of bodyIndices) {
                const mass = PhysicsModelController.safeGetRuntimeBodyMass(bundle, index);
                if (!Number.isFinite(mass) || mass <= 0) continue;
                compensationForce.copyFrom(gravity).scaleInPlace((gravityScale - 1) * mass);
                if (!PhysicsModelController.isFiniteVector(compensationForce)) continue;
                try {
                    bundle.applyCentralForce?.(index, compensationForce);
                } catch {
                    continue;
                }
            }

            if (!sampleLogged) {
                sampleLogged = true;
                logWarn("physics", "fully damped rigid body gravity scaled", {
                    backend: this.getPhysicsBackendLabel(),
                    evaluationType: this.getPhysicsEvaluationTypeLabel(),
                    gravityScale,
                    correctionAmount: PhysicsModelController.getFullyDampedGravityCorrectionAmount(),
                    bodyCount: bodyIndices.length,
                    sampleIndices: bodyIndices.slice(0, 16),
                    disableKey: FULLY_DAMPED_RIGID_BODY_GRAVITY_SCALE_DISABLE_KEY,
                    valueKey: FULLY_DAMPED_RIGID_BODY_GRAVITY_CORRECTION_AMOUNT_KEY,
                });
            }
        };

        this.fullyDampedGravityScaledPhysicsModels.add(physicsModelObject);
    }

    private installFollowBoneRigidBodyVelocitySync(model: PhysicsRuntimeModel): void {
        if (PhysicsModelController.isFollowBoneVelocitySyncDisabled()) return;

        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel || typeof physicsModel !== "object") return;

        const physicsModelObject = physicsModel as object;
        if (this.followBoneVelocitySyncedPhysicsModels.has(physicsModelObject)) return;

        const bundle = PhysicsModelController.getBulletPhysicsBundle(physicsModel);
        if (
            !bundle
            || typeof physicsModel.syncBodies !== "function"
            || typeof bundle.getTransformMatrixToRef !== "function"
            || typeof bundle.setLinearVelocity !== "function"
        ) {
            return;
        }

        const originalSyncBodies = physicsModel.syncBodies.bind(physicsModel);
        const previousTransforms = new Map<number, Matrix>();
        let firstVelocitySampleLogged = false;

        physicsModel.syncBodies = (): void => {
            originalSyncBodies();
            const result = PhysicsModelController.syncFollowBoneRigidBodyVelocities(bundle, previousTransforms);
            if (result.updatedCount > 0 && !firstVelocitySampleLogged) {
                firstVelocitySampleLogged = true;
                logWarn("physics", "follow bone rigid body velocity sync active", {
                    backend: this.getPhysicsBackendLabel(),
                    evaluationType: this.getPhysicsEvaluationTypeLabel(),
                    updatedCount: result.updatedCount,
                    sample: result.sample,
                    disableKey: FOLLOW_BONE_VELOCITY_SYNC_DISABLE_KEY,
                });
            }
        };

        this.followBoneVelocitySyncedPhysicsModels.add(physicsModelObject);
        logDebugIfEnabled("physics", "physics", "follow bone rigid body velocity sync installed", {
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            rigidBodyCount: bundle.count,
            disableKey: FOLLOW_BONE_VELOCITY_SYNC_DISABLE_KEY,
        });
    }

    private static syncFollowBoneRigidBodyVelocities(
        bundle: BulletPhysicsBundleLike,
        previousTransforms: Map<number, Matrix>,
    ): {
        updatedCount: number;
        sample: Record<string, unknown> | null;
    } {
        const rigidBodyData = bundle.rigidBodyData;
        if (!Array.isArray(rigidBodyData) || typeof bundle.getTransformMatrixToRef !== "function") {
            return { updatedCount: 0, sample: null };
        }

        const currentTransform = Matrix.Identity();
        const previousScaling = Vector3.One();
        const currentScaling = Vector3.One();
        const previousRotation = Quaternion.Identity();
        const currentRotation = Quaternion.Identity();
        const previousPosition = Vector3.Zero();
        const currentPosition = Vector3.Zero();
        const deltaRotation = Quaternion.Identity();
        const angularEuler = Vector3.Zero();
        let updatedCount = 0;
        let sample: Record<string, unknown> | null = null;

        for (let index = 0; index < bundle.count; index += 1) {
            if (rigidBodyData[index]?.physicsMode !== FOLLOW_BONE_RIGID_BODY_PHYSICS_MODE) continue;

            bundle.getTransformMatrixToRef(index, currentTransform);
            const previousTransform = previousTransforms.get(index);
            previousTransforms.set(index, currentTransform.clone());
            if (!previousTransform) continue;

            previousTransform.decompose(previousScaling, previousRotation, previousPosition);
            currentTransform.decompose(currentScaling, currentRotation, currentPosition);

            const linearVelocity = currentPosition
                .subtract(previousPosition)
                .scale(1 / FOLLOW_BONE_VELOCITY_SYNC_DT_SECONDS);
            if (!PhysicsModelController.isFiniteVector(linearVelocity)) continue;

            try {
                bundle.setLinearVelocity?.(index, linearVelocity, false);
                if (typeof bundle.setAngularVelocity === "function") {
                    const previousRotationInverse = previousRotation.conjugate();
                    currentRotation.multiplyToRef(previousRotationInverse, deltaRotation);
                    deltaRotation.normalize();
                    deltaRotation.toEulerAnglesToRef(angularEuler);
                    const angularVelocity = angularEuler.scale(1 / FOLLOW_BONE_VELOCITY_SYNC_DT_SECONDS);
                    if (PhysicsModelController.isFiniteVector(angularVelocity)) {
                        bundle.setAngularVelocity(index, angularVelocity, false);
                    }
                }
            } catch {
                continue;
            }

            updatedCount += 1;
            if (!sample) {
                sample = {
                    index,
                    linearVelocity: PhysicsModelController.formatVector3(linearVelocity),
                };
            }
        }

        return { updatedCount, sample };
    }

    public clampAbnormalDynamicRigidBodyMasses(
        model: PhysicsRuntimeModel,
        joints: readonly PhysicsJointDiagnosticEntry[] = [],
    ): void {
        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel || typeof physicsModel !== "object") return;

        const physicsModelObject = physicsModel as object;
        const bundle = PhysicsModelController.getBulletPhysicsBundle(physicsModel);
        if (
            !bundle
            || typeof bundle.getMass !== "function"
            || typeof bundle.getLocalInertia !== "function"
            || typeof bundle.setMassProps !== "function"
        ) {
            return;
        }

        if (
            PhysicsModelController.isAbnormalMassClampDisabled()
            || !PhysicsModelController.getFullyDampedRigidBodyCorrectionEnabled()
            || PhysicsModelController.getAbnormalDynamicRigidBodyMassTowardUnit() <= 0
        ) {
            this.restoreOriginalRigidBodyMassProps(physicsModelObject, bundle);
            return;
        }

        const adjustedSamples: Array<Record<string, unknown>> = [];
        const abnormalMassMode = PhysicsModelController.getAbnormalMassMode();
        const massEligibleRigidBodyIndices = PhysicsModelController.collectZeroLimit6DofRigidBodyIndices(joints);
        if (massEligibleRigidBodyIndices.size === 0) return;

        let originalMassProps = this.originalMassPropsByPhysicsModel.get(physicsModelObject);
        if (!originalMassProps) {
            originalMassProps = new Map<number, OriginalRigidBodyMassProps>();
            this.originalMassPropsByPhysicsModel.set(physicsModelObject, originalMassProps);
        }

        let adjustedCount = 0;
        let recoveredCount = 0;
        let unitAdjustedCount = 0;
        let clampedFallbackCount = 0;
        let maxOriginalMass = 0;
        for (const index of massEligibleRigidBodyIndices) {
            if (bundle.rigidBodyData?.[index]?.physicsMode === FOLLOW_BONE_RIGID_BODY_PHYSICS_MODE) continue;
            const existingOriginal = originalMassProps.get(index);
            const originalMass = existingOriginal?.mass ?? PhysicsModelController.safeGetRuntimeBodyMass(bundle, index);
            if (!Number.isFinite(originalMass) || originalMass <= 0) continue;

            let originalInertia = existingOriginal?.localInertia.clone() ?? null;
            if (!originalInertia) {
                originalInertia = PhysicsModelController.safeGetRuntimeBodyLocalInertia(bundle, index);
            }
            if (!originalInertia) continue;
            if (!existingOriginal) {
                originalMassProps.set(index, {
                    mass: originalMass,
                    localInertia: originalInertia.clone(),
                });
            }

            const adjustedMassResult = PhysicsModelController.resolveAbnormalDynamicRigidBodyMass(
                originalMass,
                abnormalMassMode,
                { recoverLowMass: true },
            );
            if (!adjustedMassResult) continue;

            const adjustedMass = PhysicsModelController.moveMassTowardUnit(
                adjustedMassResult.mass,
                PhysicsModelController.getAbnormalDynamicRigidBodyMassTowardUnit(),
            );
            const scale = adjustedMass / originalMass;
            const adjustedInertia = originalInertia.scale(scale);
            try {
                bundle.setMassProps(index, adjustedMass, adjustedInertia);
            } catch {
                continue;
            }

            adjustedCount += 1;
            if (adjustedMassResult.mode === "decimal-mantissa-recovered") {
                recoveredCount += 1;
            } else if (adjustedMassResult.mode === "unit") {
                unitAdjustedCount += 1;
            } else if (adjustedMassResult.mode === "clamped") {
                clampedFallbackCount += 1;
            }
            maxOriginalMass = Math.max(maxOriginalMass, originalMass);
            if (adjustedSamples.length < 12) {
                adjustedSamples.push({
                    index,
                    originalMass: PhysicsModelController.roundDiagnosticNumber(originalMass),
                    adjustedMass: PhysicsModelController.roundDiagnosticNumber(adjustedMass),
                    mode: adjustedMassResult.mode,
                    reason: originalMass <= RECOVERED_DYNAMIC_RIGID_BODY_MASS_LIMIT
                        ? "zero-limit-6dof-low-mass-series"
                        : "high-abnormal-mass",
                    originalLocalInertia: PhysicsModelController.formatVector3(originalInertia),
                    adjustedLocalInertia: PhysicsModelController.formatVector3(adjustedInertia),
                });
            }
        }

        if (adjustedCount === 0) return;

        logWarn("physics", "abnormal dynamic rigid body masses adjusted", {
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            limit: ABNORMAL_DYNAMIC_RIGID_BODY_MASS_LIMIT,
            recoveredLimit: RECOVERED_DYNAMIC_RIGID_BODY_MASS_LIMIT,
            lowMassLimit: LOW_DECIMAL_MANTISSA_RECOVERED_MASS_LIMIT,
            lowMassEligibility: "zero-limit-6dof-joint-only",
            lowMassEligibilityBehavior: "zero-limit 6DOF dynamic bodies recover decimal mantissa for 0<mass<=100",
            lowMassEligibleRigidBodyCount: massEligibleRigidBodyIndices.size,
            mode: abnormalMassMode,
            modeKey: ABNORMAL_DYNAMIC_RIGID_BODY_MASS_MODE_KEY,
            tinyMass: PhysicsModelController.getAbnormalTinyMassValue(),
            tinyMassValueKey: ABNORMAL_DYNAMIC_RIGID_BODY_TINY_MASS_VALUE_KEY,
            massTowardUnit: PhysicsModelController.getAbnormalDynamicRigidBodyMassTowardUnit(),
            massTowardUnitKey: ABNORMAL_DYNAMIC_RIGID_BODY_MASS_TOWARD_UNIT_KEY,
            adjustedCount,
            recoveredCount,
            unitAdjustedCount,
            clampedFallbackCount,
            maxOriginalMass: PhysicsModelController.roundDiagnosticNumber(maxOriginalMass),
            disableKey: ABNORMAL_DYNAMIC_RIGID_BODY_MASS_CLAMP_DISABLE_KEY,
            samples: adjustedSamples,
        });
    }

    private restoreOriginalRigidBodyMassProps(
        physicsModelObject: object,
        bundle: BulletPhysicsBundleLike,
    ): void {
        const originalMassProps = this.originalMassPropsByPhysicsModel.get(physicsModelObject);
        if (!originalMassProps || originalMassProps.size === 0 || typeof bundle.setMassProps !== "function") return;

        let restoredCount = 0;
        const samples: Array<Record<string, unknown>> = [];
        for (const [index, original] of originalMassProps) {
            try {
                bundle.setMassProps(index, original.mass, original.localInertia);
            } catch {
                continue;
            }
            restoredCount += 1;
            if (samples.length < 12) {
                samples.push({
                    index,
                    restoredMass: PhysicsModelController.roundDiagnosticNumber(original.mass),
                    restoredLocalInertia: PhysicsModelController.formatVector3(original.localInertia),
                });
            }
        }

        if (restoredCount === 0) return;
        logWarn("physics", "abnormal dynamic rigid body masses restored", {
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            restoredCount,
            samples,
        });
    }

    public logPhysicsStateApplication(
        model: PhysicsRuntimeModel,
        modelName: string,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        reason: string,
    ): void {
        if (model.rigidBodyStates.length === 0) return;

        const stateCounts = PhysicsModelController.countRigidBodyStates(model.rigidBodyStates);
        logDebugIfEnabled("physics", "physics", "physics state applied to model", {
            reason,
            modelName,
            rigidBodyCount: model.rigidBodyStates.length,
            stateOnCount: stateCounts.on,
            stateOffCount: stateCounts.off,
            physicsEnabled: this.getPhysicsEnabled(),
            simulationActive: this.isSimulationActive(),
            playbackActive: this.isPlaybackActive(),
            scenePhysicsEnabled: this.isScenePhysicsEnabled(),
            currentFrameTime: this.getCurrentFrameTime(),
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            hasPhysicsModel: PhysicsModelController.hasPhysicsModel(model, model.rigidBodyStates.length),
            rigidBodyModes: PhysicsModelController.countRigidBodyModes(rigidBodies),
            diagnosticRigidBodies: PhysicsModelController.pickDiagnosticRigidBodies(rigidBodies),
        });
    }

    public logModelPhysicsMetadata(
        model: PhysicsRuntimeModel,
        modelName: string,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        reason: string,
    ): void {
        if (rigidBodies.length === 0 && model.rigidBodyStates.length === 0) return;

        logDebugIfEnabled("physics", "physics", "model physics metadata", {
            reason,
            modelName,
            rigidBodyCount: rigidBodies.length,
            runtimeRigidBodyStateCount: model.rigidBodyStates.length,
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            playbackActive: this.isPlaybackActive(),
            scenePhysicsEnabled: this.isScenePhysicsEnabled(),
            currentFrameTime: this.getCurrentFrameTime(),
            hasPhysicsModel: PhysicsModelController.hasPhysicsModel(model, model.rigidBodyStates.length),
            rigidBodyModes: PhysicsModelController.countRigidBodyModes(rigidBodies),
            shapeTypes: PhysicsModelController.countRigidBodyShapeTypes(rigidBodies),
            diagnosticRigidBodies: PhysicsModelController.pickDiagnosticRigidBodies(rigidBodies),
        });
    }

    public logPhysicsChainDistanceDiagnostics(
        model: PhysicsRuntimeModel,
        modelName: string,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        joints: readonly PhysicsJointDiagnosticEntry[] = [],
    ): void {
        if (rigidBodies.length === 0 || model.rigidBodyStates.length === 0) {
            this.logPhysicsChainDistanceDiagnosticsSkipped(modelName, rigidBodies, "no-rigid-body-state");
            return;
        }

        const snapshot = PhysicsModelController.captureWebmPhysicsModelSnapshot(model, 0, modelName);
        if (!snapshot) {
            this.logPhysicsChainDistanceDiagnosticsSkipped(modelName, rigidBodies, "no-physics-snapshot");
            return;
        }

        const baselineMap = this.getPhysicsChainDistanceBaselineMap(model);
        const chains: Array<Record<string, unknown>> = [];
        const jointGraphChains = PhysicsModelController.collectJointGraphChainDiagnostics(
            snapshot,
            rigidBodies,
            joints,
            baselineMap,
        );
        const jointEdges = PhysicsModelController.collectJointEdgeDistanceDiagnostics(
            snapshot,
            rigidBodies,
            joints,
            baselineMap,
        );
        const runtimeConstraints = PhysicsModelController.collectRuntimeConstraintDiagnostics(
            model,
            snapshot,
            rigidBodies,
            joints,
            jointEdges,
        );
        const constraintDriftSummary = PhysicsModelController.collectConstraintDriftSummary(runtimeConstraints);
        for (const category of ["hair", "cloth", "soft-body"]) {
            const samples = PhysicsModelController.collectPhysicsChainSamples(snapshot, rigidBodies, category);
            if (samples.length < 2) continue;

            const summary = PhysicsModelController.summarizePhysicsChainSamples(samples);
            const baselineKey = `${category}:${samples[0].rigidBodyIndex}:${samples[samples.length - 1].rigidBodyIndex}`;
            let baselineTotalDistance = baselineMap.get(baselineKey);
            if (baselineTotalDistance === undefined || baselineTotalDistance <= 1e-6) {
                baselineTotalDistance = summary.totalDistance;
                baselineMap.set(baselineKey, baselineTotalDistance);
            }

            chains.push({
                category,
                count: samples.length,
                firstIndex: samples[0].rigidBodyIndex,
                lastIndex: samples[samples.length - 1].rigidBodyIndex,
                totalDistance: PhysicsModelController.roundDiagnosticNumber(summary.totalDistance),
                rootTipDistance: PhysicsModelController.roundDiagnosticNumber(summary.rootTipDistance),
                baselineTotalDistance: PhysicsModelController.roundDiagnosticNumber(baselineTotalDistance),
                totalDistanceRatio: baselineTotalDistance > 1e-6
                    ? PhysicsModelController.roundDiagnosticNumber(summary.totalDistance / baselineTotalDistance)
                    : null,
                minY: PhysicsModelController.roundDiagnosticNumber(summary.minY),
                maxY: PhysicsModelController.roundDiagnosticNumber(summary.maxY),
                maxSegmentDistance: PhysicsModelController.roundDiagnosticNumber(summary.maxSegmentDistance),
                maxSegment: PhysicsModelController.formatSegmentDiagnostic(summary.maxSegment),
            });
        }

        if (chains.length === 0 && jointGraphChains.length === 0) {
            this.logPhysicsChainDistanceDiagnosticsSkipped(modelName, rigidBodies, "no-chain-samples");
            return;
        }

        logDebugIfEnabled("physics", "physics", "physics chain distance diagnostics", {
            modelName,
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            physicsEnabled: this.getPhysicsEnabled(),
            simulationActive: this.isSimulationActive(),
            playbackActive: this.isPlaybackActive(),
            scenePhysicsEnabled: this.isScenePhysicsEnabled(),
            currentFrameTime: this.getCurrentFrameTime(),
            chains,
            jointGraphChains,
            jointEdges,
            constraintDriftSummary,
            runtimeConstraints,
        });
    }

    private logPhysicsChainDistanceDiagnosticsSkipped(
        modelName: string,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        reason: string,
    ): void {
        logDebugIfEnabled("physics", "physics", "physics chain distance diagnostics skipped", {
            modelName,
            reason,
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            physicsEnabled: this.getPhysicsEnabled(),
            simulationActive: this.isSimulationActive(),
            rigidBodyCount: rigidBodies.length,
            rigidBodyModes: PhysicsModelController.countRigidBodyModes(rigidBodies),
            diagnosticRigidBodies: PhysicsModelController.pickDiagnosticRigidBodies(rigidBodies),
        });
    }

    public normalizeRuntimeBoneEvaluationOrder(
        model: PhysicsRuntimeModel,
        options: {
            physicsBoneNames?: readonly string[];
        } = {},
    ): void {
        if (PhysicsModelController.isBoneEvaluationOrderNormalizationDisabled()) {
            logWarn("physics", "runtime bone evaluation order normalization skipped", {
                model: typeof model.mesh?.name === "string" ? model.mesh.name : "model",
                disableKey: BONE_EVALUATION_ORDER_NORMALIZATION_DISABLE_KEY,
            });
            return;
        }

        const modelInternal = model as unknown as {
            _sortedRuntimeBones?: Array<{
                name?: string;
                parentBone?: object | null;
                transformAfterPhysics?: boolean;
            }>;
        };

        const sortedRuntimeBones = modelInternal._sortedRuntimeBones;
        if (!Array.isArray(sortedRuntimeBones) || sortedRuntimeBones.length === 0) {
            return;
        }

        const originalOrderIndex = new Map<object, number>();
        for (let index = 0; index < sortedRuntimeBones.length; index += 1) {
            originalOrderIndex.set(sortedRuntimeBones[index] as unknown as object, index);
        }

        const sortGroupParentFirst = (afterPhysicsStage: boolean): Array<{
            name?: string;
            parentBone?: object | null;
            transformAfterPhysics?: boolean;
        }> => {
            const groupBones = sortedRuntimeBones.filter((bone) => bone.transformAfterPhysics === afterPhysicsStage);
            if (groupBones.length <= 1) {
                return groupBones;
            }

            const groupSet = new Set<object>(groupBones.map((bone) => bone as unknown as object));
            const indegree = new Map<object, number>();
            const childMap = new Map<object, Array<{
                name?: string;
                parentBone?: object | null;
                transformAfterPhysics?: boolean;
            }>>();
            for (const bone of groupBones) {
                const boneObject = bone as unknown as object;
                indegree.set(boneObject, 0);
                childMap.set(boneObject, []);
            }

            for (const bone of groupBones) {
                const parentBone = bone.parentBone;
                if (!parentBone || !groupSet.has(parentBone as object)) {
                    continue;
                }
                const boneObject = bone as unknown as object;
                indegree.set(boneObject, (indegree.get(boneObject) ?? 0) + 1);
                childMap.get(parentBone as object)?.push(bone);
            }

            const available = groupBones
                .filter((bone) => (indegree.get(bone as unknown as object) ?? 0) === 0)
                .sort((a, b) => (originalOrderIndex.get(a as unknown as object) ?? 0) - (originalOrderIndex.get(b as unknown as object) ?? 0));
            const reorderedGroup: typeof groupBones = [];
            const enqueueAvailable = (bone: typeof groupBones[number]): void => {
                available.push(bone);
                available.sort((a, b) => (originalOrderIndex.get(a as unknown as object) ?? 0) - (originalOrderIndex.get(b as unknown as object) ?? 0));
            };

            while (available.length > 0) {
                const bone = available.shift();
                if (!bone) {
                    break;
                }
                reorderedGroup.push(bone);

                for (const childBone of childMap.get(bone as unknown as object) ?? []) {
                    const childObject = childBone as unknown as object;
                    const nextIndegree = (indegree.get(childObject) ?? 0) - 1;
                    indegree.set(childObject, nextIndegree);
                    if (nextIndegree === 0) {
                        enqueueAvailable(childBone);
                    }
                }
            }

            if (reorderedGroup.length !== groupBones.length) {
                return groupBones;
            }
            return reorderedGroup;
        };

        const reorderedBones = [
            ...sortGroupParentFirst(false),
            ...sortGroupParentFirst(true),
        ];

        let changed = false;
        for (let index = 0; index < sortedRuntimeBones.length; index += 1) {
            if (sortedRuntimeBones[index] !== reorderedBones[index]) {
                changed = true;
                break;
            }
        }
        if (!changed) {
            logDebugIfEnabled("physics", "physics", "runtime bone evaluation order already parent-first", {
                model: typeof model.mesh?.name === "string" ? model.mesh.name : "model",
                runtimeBoneCount: sortedRuntimeBones.length,
                ...PhysicsModelController.summarizeRuntimeBoneEvaluationOrder(
                    sortedRuntimeBones,
                    options.physicsBoneNames ?? [],
                ),
            });
            return;
        }

        sortedRuntimeBones.splice(0, sortedRuntimeBones.length, ...reorderedBones);
        const modelName = typeof model.mesh?.name === "string" ? model.mesh.name : "model";
        logWarn("physics", "runtime bone evaluation order normalized", {
            model: modelName,
            runtimeBoneCount: sortedRuntimeBones.length,
            disableKey: BONE_EVALUATION_ORDER_NORMALIZATION_DISABLE_KEY,
            ...PhysicsModelController.summarizeRuntimeBoneEvaluationOrder(
                sortedRuntimeBones,
                options.physicsBoneNames ?? [],
            ),
        });
    }

    public static hasPhysicsModel(model: PhysicsRuntimeModel, rigidBodyCount: number): boolean {
        const modelInternal = model as unknown as { _physicsModel?: unknown } | null;
        return Boolean(modelInternal?._physicsModel && rigidBodyCount > 0);
    }

    private static collectConstraintParamTargets(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        joints: readonly PhysicsJointDiagnosticEntry[] = [],
    ): ConstraintParamTargetEntry[] {
        const targets: ConstraintParamTargetEntry[] = [];

        const constraints = physicsModel._constraints;
        if (Array.isArray(constraints)) {
            for (let index = 0; index < constraints.length; index += 1) {
                PhysicsModelController.appendConstraintParamTarget(
                    targets,
                    constraints[index],
                    joints[index] ?? null,
                );
            }
        }

        return targets;
    }

    private resetPhysicsModelToCurrentPose(model: PhysicsRuntimeModel): void {
        const modelInternal = model as unknown as PhysicsModelInternal;
        const physicsModel = modelInternal._physicsModel;
        if (!physicsModel || typeof physicsModel !== "object") return;

        modelInternal.initializePhysics?.();
        physicsModel.commitBodyStates?.(model.rigidBodyStates);
        PhysicsModelController.clearPhysicsModelVelocities(physicsModel);
        PhysicsModelController.commitBufferedPhysicsModelState(physicsModel);
        logDebugIfEnabled("physics", "physics", "physics model reset to current pose", {
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            rigidBodyCount: model.rigidBodyStates.length,
        });
    }

    private static clearPhysicsModelVelocities(physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike): void {
        const zero = Vector3.Zero();
        const bundle = (physicsModel as BulletPhysicsModelLike)._bundle;
        if (bundle) {
            for (let index = 0; index < bundle.count; index += 1) {
                bundle.setLinearVelocity?.(index, zero, true);
                bundle.setAngularVelocity?.(index, zero, true);
            }
            return;
        }

        const bodies = (physicsModel as ClassicPhysicsModelLike)._bodies;
        if (!Array.isArray(bodies)) return;
        for (const body of bodies) {
            body?.setLinearVelocity?.(zero);
            body?.setAngularVelocity?.(zero);
        }
    }

    private static commitBufferedPhysicsModelState(physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike): void {
        const bundle = (physicsModel as BulletPhysicsModelLike)._bundle;
        if (!bundle) return;
        if (bundle.needToCommit === true) {
            bundle.commitToWasm?.();
        }
        bundle.updateBufferedMotionStates?.(true);
    }

    private static appendConstraintParamTarget(
        targets: ConstraintParamTargetEntry[],
        constraint: PhysicsConstraintParamContainerLike | null | undefined,
        joint: PhysicsJointDiagnosticEntry | null,
    ): void {
        if (!constraint) return;
        if (typeof constraint.setParam === "function") {
            targets.push({ target: constraint, joint });
            return;
        }
        if (constraint.physicsJoint && typeof constraint.physicsJoint.setParam === "function") {
            targets.push({ target: constraint.physicsJoint, joint });
        }
    }

    private static applyMmdConstraintSolverParametersToTarget(
        target: PhysicsConstraintParamTargetLike,
        joint: PhysicsJointDiagnosticEntry | null,
        zeroLimit6DofErp: number | null,
    ): { applied: boolean; zeroLimit6DofBoosted: boolean } {
        if (typeof target.setParam !== "function") {
            return { applied: false, zeroLimit6DofBoosted: false };
        }

        const shouldBoostZeroLimit6Dof = zeroLimit6DofErp !== null
            && joint !== null
            && PhysicsModelController.shouldBoostZeroLimit6DofErp(joint);

        for (let axis = 0; axis < MMD_CONSTRAINT_AXIS_COUNT; axis += 1) {
            for (const param of MMD_CONSTRAINT_PARAMETERS) {
                const value = shouldBoostZeroLimit6Dof && (param.name === "ERP" || param.name === "StopERP")
                    ? zeroLimit6DofErp
                    : param.value;
                target.setParam(param.id, value, axis);
            }
        }
        return { applied: true, zeroLimit6DofBoosted: shouldBoostZeroLimit6Dof };
    }

    private static countRigidBodyStates(states: Uint8Array): { on: number; off: number } {
        let on = 0;
        let off = 0;
        for (const state of states) {
            if (state) on += 1;
            else off += 1;
        }
        return { on, off };
    }

    private static countRigidBodyModes(
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
    ): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const rigidBody of rigidBodies) {
            const key = String(rigidBody.physicsMode);
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
    }

    private static countRigidBodyShapeTypes(
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
    ): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const rigidBody of rigidBodies) {
            const key = String(rigidBody.shapeType);
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
    }

    private static pickDiagnosticRigidBodies(
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
    ): Array<{ index: number; name: string; boneIndex: number; physicsMode: number; shapeType: number; category: string }> {
        const picked: Array<{
            index: number;
            name: string;
            boneIndex: number;
            physicsMode: number;
            shapeType: number;
            category: string;
        }> = [];
        for (let index = 0; index < rigidBodies.length; index += 1) {
            const rigidBody = rigidBodies[index];
            const category = PhysicsModelController.classifyRigidBodyName(rigidBody.name);
            if (category === "other" && picked.length >= 12) continue;
            if (category !== "other" || picked.length < 6) {
                picked.push({
                    index,
                    name: rigidBody.name,
                    boneIndex: rigidBody.boneIndex,
                    physicsMode: rigidBody.physicsMode,
                    shapeType: rigidBody.shapeType,
                    category,
                });
            }
            if (picked.length >= 24) break;
        }
        return picked;
    }

    private static classifyRigidBodyName(name: string): string {
        const normalized = name.toLowerCase();
        if (/髪|前髪|後髪|横髪|毛|hair|bang|tail|braid|pony/.test(normalized)) return "hair";
        if (/スカート|袖|裾|布|cloth|skirt|sleeve|ribbon/.test(normalized)) return "cloth";
        if (/胸|乳|breast/.test(normalized)) return "soft-body";
        return "other";
    }

    private getPhysicsChainDistanceBaselineMap(model: PhysicsRuntimeModel): Map<string, number> {
        const modelObject = model as unknown as object;
        let baselineMap = this.physicsChainDistanceBaselines.get(modelObject);
        if (!baselineMap) {
            baselineMap = new Map();
            this.physicsChainDistanceBaselines.set(modelObject, baselineMap);
        }
        return baselineMap;
    }

    private static collectPhysicsChainSamples(
        snapshot: WebmPhysicsModelSnapshot,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        category: string,
    ): Array<{ rigidBodyIndex: number; name: string; position: Vector3 }> {
        const samples: Array<{ rigidBodyIndex: number; name: string; position: Vector3 }> = [];
        const limit = Math.min(rigidBodies.length, snapshot.rigidBodies.length);
        for (let index = 0; index < limit; index += 1) {
            const rigidBody = rigidBodies[index];
            if (!rigidBody || rigidBody.physicsMode === 0) continue;
            if (PhysicsModelController.classifyRigidBodyName(rigidBody.name) !== category) continue;

            const bodySnapshot = snapshot.rigidBodies[index];
            if (!bodySnapshot) continue;
            const matrix = bodySnapshot.transformMatrix;
            if (matrix.length < 15) continue;

            samples.push({
                rigidBodyIndex: index,
                name: rigidBody.name,
                position: new Vector3(matrix[12], matrix[13], matrix[14]),
            });
        }
        return samples;
    }

    private static collectJointGraphChainDiagnostics(
        snapshot: WebmPhysicsModelSnapshot,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        joints: readonly PhysicsJointDiagnosticEntry[],
        baselineMap: Map<string, number>,
    ): Array<Record<string, unknown>> {
        if (joints.length === 0) return [];

        const diagnostics: Array<Record<string, unknown>> = [];
        for (const category of ["hair", "cloth", "soft-body"]) {
            const chains = PhysicsModelController.collectJointGraphChains(snapshot, rigidBodies, joints, category);
            for (const chain of chains) {
                if (chain.samples.length < 2) continue;

                const summary = PhysicsModelController.summarizePhysicsChainSamples(chain.samples);
                const baselineKey = `joint:${category}:${chain.rigidBodyIndices.join("-")}`;
                let baselineTotalDistance = baselineMap.get(baselineKey);
                if (baselineTotalDistance === undefined || baselineTotalDistance <= 1e-6) {
                    baselineTotalDistance = summary.totalDistance;
                    baselineMap.set(baselineKey, baselineTotalDistance);
                }

                diagnostics.push({
                    category,
                    count: chain.samples.length,
                    jointCount: chain.jointNames.length,
                    firstIndex: chain.samples[0].rigidBodyIndex,
                    firstName: chain.samples[0].name,
                    lastIndex: chain.samples[chain.samples.length - 1].rigidBodyIndex,
                    lastName: chain.samples[chain.samples.length - 1].name,
                    totalDistance: PhysicsModelController.roundDiagnosticNumber(summary.totalDistance),
                    rootTipDistance: PhysicsModelController.roundDiagnosticNumber(summary.rootTipDistance),
                    baselineTotalDistance: PhysicsModelController.roundDiagnosticNumber(baselineTotalDistance),
                    totalDistanceRatio: baselineTotalDistance > 1e-6
                        ? PhysicsModelController.roundDiagnosticNumber(summary.totalDistance / baselineTotalDistance)
                        : null,
                    minY: PhysicsModelController.roundDiagnosticNumber(summary.minY),
                    maxY: PhysicsModelController.roundDiagnosticNumber(summary.maxY),
                    maxSegmentDistance: PhysicsModelController.roundDiagnosticNumber(summary.maxSegmentDistance),
                    maxSegment: PhysicsModelController.formatSegmentDiagnostic(summary.maxSegment),
                    joints: chain.jointNames.slice(0, 12).join(", "),
                    jointNameCount: chain.jointNames.length,
                    jointNamesTruncated: chain.jointNames.length > 12,
                });
            }
        }

        diagnostics.sort((a, b) => {
            const ratioA = typeof a.totalDistanceRatio === "number" ? a.totalDistanceRatio : 0;
            const ratioB = typeof b.totalDistanceRatio === "number" ? b.totalDistanceRatio : 0;
            if (ratioB !== ratioA) return ratioB - ratioA;
            const minYA = typeof a.minY === "number" ? a.minY : 0;
            const minYB = typeof b.minY === "number" ? b.minY : 0;
            return minYA - minYB;
        });
        return diagnostics.slice(0, 8);
    }

    private static collectJointEdgeDistanceDiagnostics(
        snapshot: WebmPhysicsModelSnapshot,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        joints: readonly PhysicsJointDiagnosticEntry[],
        baselineMap: Map<string, number>,
    ): Array<Record<string, unknown>> {
        if (joints.length === 0) return [];

        const diagnostics: Array<Record<string, unknown>> = [];
        const validBodyLimit = Math.min(rigidBodies.length, snapshot.rigidBodies.length);
        for (const joint of joints) {
            const indexA = joint.rigidbodyIndexA;
            const indexB = joint.rigidbodyIndexB;
            if (indexA < 0 || indexB < 0 || indexA >= validBodyLimit || indexB >= validBodyLimit) continue;

            const bodyA = rigidBodies[indexA];
            const bodyB = rigidBodies[indexB];
            if (!bodyA || !bodyB) continue;

            const categoryA = PhysicsModelController.classifyRigidBodyName(bodyA.name);
            const categoryB = PhysicsModelController.classifyRigidBodyName(bodyB.name);
            const category = categoryA !== "other" ? categoryA : categoryB;
            if (category === "other") continue;

            const positionA = PhysicsModelController.getSnapshotRigidBodyPosition(snapshot, indexA);
            const positionB = PhysicsModelController.getSnapshotRigidBodyPosition(snapshot, indexB);
            if (!positionA || !positionB) continue;

            const distance = Vector3.Distance(positionA, positionB);
            const baselineKey = `joint-edge:${category}:${joint.name}:${indexA}:${indexB}`;
            let baselineDistance = baselineMap.get(baselineKey);
            if (baselineDistance === undefined || baselineDistance <= 1e-6) {
                baselineDistance = distance;
                baselineMap.set(baselineKey, baselineDistance);
            }

            diagnostics.push({
                category,
                joint: joint.name,
                type: joint.type,
                bodyA: `${bodyA.name}(${indexA})`,
                bodyB: `${bodyB.name}(${indexB})`,
                distance: PhysicsModelController.roundDiagnosticNumber(distance),
                baselineDistance: PhysicsModelController.roundDiagnosticNumber(baselineDistance),
                distanceRatio: baselineDistance > 1e-6
                    ? PhysicsModelController.roundDiagnosticNumber(distance / baselineDistance)
                    : null,
                positionLimit: PhysicsModelController.formatJointVectorRange(joint.positionMin, joint.positionMax),
                rotationLimit: PhysicsModelController.formatJointVectorRange(joint.rotationMin, joint.rotationMax),
                springPosition: PhysicsModelController.formatJointVector(joint.springPosition),
                springRotation: PhysicsModelController.formatJointVector(joint.springRotation),
            });
        }

        diagnostics.sort((a, b) => {
            const ratioA = typeof a.distanceRatio === "number" ? a.distanceRatio : 0;
            const ratioB = typeof b.distanceRatio === "number" ? b.distanceRatio : 0;
            if (ratioB !== ratioA) return ratioB - ratioA;
            const distanceA = typeof a.distance === "number" ? a.distance : 0;
            const distanceB = typeof b.distance === "number" ? b.distance : 0;
            return distanceB - distanceA;
        });
        return diagnostics.slice(0, 12);
    }

    private static collectRuntimeConstraintDiagnostics(
        model: PhysicsRuntimeModel,
        snapshot: WebmPhysicsModelSnapshot,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        joints: readonly PhysicsJointDiagnosticEntry[],
        jointEdges: readonly Record<string, unknown>[],
    ): Array<Record<string, unknown>> {
        if (joints.length === 0 || jointEdges.length === 0) return [];

        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        const constraints = physicsModel?._constraints;
        if (!Array.isArray(constraints)) {
            return [{
                reason: "no-runtime-constraints-array",
                hasPhysicsModel: !!physicsModel,
            }];
        }

        const rigidBodyIndexMap = PhysicsModelController.getRigidBodyIndexMap(physicsModel);
        const bundle = PhysicsModelController.getBulletPhysicsBundle(physicsModel);
        const scalingFactor = PhysicsModelController.getModelPhysicsScalingFactor(model);
        const targetJointNames = new Set(
            jointEdges
                .map((edge) => typeof edge.joint === "string" ? edge.joint : null)
                .filter((name): name is string => name !== null)
                .slice(0, 8),
        );
        const diagnostics: Array<Record<string, unknown>> = [];
        for (let jointIndex = 0; jointIndex < joints.length; jointIndex += 1) {
            const joint = joints[jointIndex];
            if (!targetJointNames.has(joint.name)) continue;

            const bodyA = rigidBodies[joint.rigidbodyIndexA];
            const bodyB = rigidBodies[joint.rigidbodyIndexB];
            const bundleBodyIndexA = rigidBodyIndexMap?.[joint.rigidbodyIndexA] ?? null;
            const bundleBodyIndexB = rigidBodyIndexMap?.[joint.rigidbodyIndexB] ?? null;
            const runtimeBodyA = PhysicsModelController.captureRuntimeBundleRigidBodyDiagnostics(bundle, bundleBodyIndexA);
            const runtimeBodyB = PhysicsModelController.captureRuntimeBundleRigidBodyDiagnostics(bundle, bundleBodyIndexB);
            const constraint = constraints[jointIndex] as RuntimeConstraintDiagnosticLike | null | undefined;
            const frameDiagnostics = bodyA && bodyB
                ? PhysicsModelController.calculateConstraintFrameDiagnostics(joint, bodyA, bodyB, scalingFactor)
                : null;
            const anchorDiagnostics = bodyA && bodyB
                ? PhysicsModelController.calculateRuntimeConstraintAnchorDiagnostics(
                    snapshot,
                    joint,
                    bodyA,
                    bodyB,
                    scalingFactor,
                )
                : null;
            const velocityDiagnostics = PhysicsModelController.calculateRuntimeConstraintVelocityDiagnostics(
                snapshot,
                joint,
                anchorDiagnostics,
            );
            const restoringDiagnostics = PhysicsModelController.describeJointRestoringForceDiagnostics(joint, constraint);
            const solverErp = PhysicsModelController.shouldBoostZeroLimit6DofErp(joint)
                ? PhysicsModelController.getZeroLimit6DofErpBoostValue()
                : MMD_CONSTRAINT_ERP_VALUE;
            diagnostics.push({
                jointIndex,
                joint: joint.name,
                constraintExists: !!constraint,
                constraintKind: PhysicsModelController.describeRuntimeConstraintKind(constraint),
                constraintPtr: PhysicsModelController.getRuntimeConstraintPtr(constraint),
                hasWorldReference: PhysicsModelController.hasRuntimeConstraintWorldReference(constraint),
                innerReferenceCount: PhysicsModelController.getRuntimeConstraintReferenceCount(constraint),
                bodyReference: PhysicsModelController.describeRuntimeConstraintBodyReference(constraint),
                rigidbodyIndexA: joint.rigidbodyIndexA,
                rigidbodyIndexB: joint.rigidbodyIndexB,
                bundleBodyIndexA,
                bundleBodyIndexB,
                bodyA: bodyA ? `${bodyA.name}(${joint.rigidbodyIndexA})` : null,
                bodyB: bodyB ? `${bodyB.name}(${joint.rigidbodyIndexB})` : null,
                bodyAPhysicsMode: bodyA?.physicsMode ?? null,
                bodyBPhysicsMode: bodyB?.physicsMode ?? null,
                bodyAMass: bodyA?.mass ?? null,
                bodyBMass: bodyB?.mass ?? null,
                runtimeBodyAMass: runtimeBodyA?.mass ?? null,
                runtimeBodyBMass: runtimeBodyB?.mass ?? null,
                bodyADamping: bodyA ? `${PhysicsModelController.roundDiagnosticNumber(bodyA.linearDamping)}/${PhysicsModelController.roundDiagnosticNumber(bodyA.angularDamping)}` : null,
                bodyBDamping: bodyB ? `${PhysicsModelController.roundDiagnosticNumber(bodyB.linearDamping)}/${PhysicsModelController.roundDiagnosticNumber(bodyB.angularDamping)}` : null,
                runtimeBodyADamping: runtimeBodyA ? `${runtimeBodyA.linearDamping}/${runtimeBodyA.angularDamping}` : null,
                runtimeBodyBDamping: runtimeBodyB ? `${runtimeBodyB.linearDamping}/${runtimeBodyB.angularDamping}` : null,
                runtimeBodyALocalInertia: runtimeBodyA?.localInertia ?? null,
                runtimeBodyBLocalInertia: runtimeBodyB?.localInertia ?? null,
                bodyAFriction: bodyA?.friction ?? null,
                bodyBFriction: bodyB?.friction ?? null,
                bodyARepulsion: bodyA?.repulsion ?? null,
                bodyBRepulsion: bodyB?.repulsion ?? null,
                bodyACollision: bodyA ? `group=${bodyA.collisionGroup} mask=${bodyA.collisionMask}` : null,
                bodyBCollision: bodyB ? `group=${bodyB.collisionGroup} mask=${bodyB.collisionMask}` : null,
                jointPosition: PhysicsModelController.formatJointVector(joint.position),
                jointRotation: PhysicsModelController.formatJointVector(joint.rotation),
                bodyAShapePosition: bodyA ? PhysicsModelController.formatJointVector(bodyA.shapePosition) : null,
                bodyBShapePosition: bodyB ? PhysicsModelController.formatJointVector(bodyB.shapePosition) : null,
                bodyAShapeRotation: bodyA ? PhysicsModelController.formatJointVector(bodyA.shapeRotation) : null,
                bodyBShapeRotation: bodyB ? PhysicsModelController.formatJointVector(bodyB.shapeRotation) : null,
                scalingFactor: PhysicsModelController.roundDiagnosticNumber(scalingFactor),
                frameA: frameDiagnostics?.frameA ?? null,
                frameB: frameDiagnostics?.frameB ?? null,
                framePivotDistance: frameDiagnostics?.framePivotDistance ?? null,
                jointToBodyDistanceA: frameDiagnostics?.jointToBodyDistanceA ?? null,
                jointToBodyDistanceB: frameDiagnostics?.jointToBodyDistanceB ?? null,
                anchorWorldA: anchorDiagnostics?.anchorWorldA ?? null,
                anchorWorldB: anchorDiagnostics?.anchorWorldB ?? null,
                anchorWorldDistance: anchorDiagnostics?.anchorWorldDistance ?? null,
                anchorSeparation: anchorDiagnostics?.anchorSeparation ?? null,
                bodyOriginDistance: anchorDiagnostics?.bodyOriginDistance ?? null,
                bodyALinearVelocity: velocityDiagnostics?.bodyALinearVelocity ?? null,
                bodyBLinearVelocity: velocityDiagnostics?.bodyBLinearVelocity ?? null,
                relativeLinearVelocity: velocityDiagnostics?.relativeLinearVelocity ?? null,
                bodyASpeed: velocityDiagnostics?.bodyASpeed ?? null,
                bodyBSpeed: velocityDiagnostics?.bodyBSpeed ?? null,
                relativeSpeed: velocityDiagnostics?.relativeSpeed ?? null,
                relativeVelocityAlongAnchor: velocityDiagnostics?.relativeVelocityAlongAnchor ?? null,
                relativeVelocityVsAnchor: velocityDiagnostics?.relativeVelocityVsAnchor ?? null,
                positionLimit: PhysicsModelController.formatJointVectorRange(joint.positionMin, joint.positionMax),
                rotationLimit: PhysicsModelController.formatJointVectorRange(joint.rotationMin, joint.rotationMax),
                springPosition: PhysicsModelController.formatJointVector(joint.springPosition),
                springRotation: PhysicsModelController.formatJointVector(joint.springRotation),
                solverERP: solverErp,
                solverCFM: MMD_CONSTRAINT_CFM_VALUE,
                solverParamsAppliedByModoki: true,
                zeroLimit6DofErpBoosted: solverErp !== MMD_CONSTRAINT_ERP_VALUE,
                zeroLimit6DofErpKey: ZERO_LIMIT_6DOF_ERP_BOOST_VALUE_KEY,
                frameOffsetExpected: "disabled-by-disableOffsetForConstraintFrame",
                frameOffsetSetterAvailable: PhysicsModelController.hasRuntimeConstraintUseFrameOffsetSetter(constraint),
                frameOffsetReadable: false,
                frameOffsetReadNote: "babylon-mmd exposes useFrameOffset(setter) but no public getter",
                wasmConstraintUseFrameOffsetAvailable: PhysicsModelController.hasRuntimeConstraintWasmFunction(
                    constraint,
                    "constraintUseFrameOffset",
                ),
                wasmConstraintSetParamAvailable: PhysicsModelController.hasRuntimeConstraintWasmFunction(
                    constraint,
                    "constraintSetParam",
                ),
                solverIterationApiCandidates: PhysicsModelController.collectRuntimeConstraintWasmFunctionNames(
                    constraint,
                    /solver|iteration/i,
                ),
                suspiciousMassScale: PhysicsModelController.describeSuspiciousMassScale(runtimeBodyA, runtimeBodyB),
                zeroLinearLimitAxes: restoringDiagnostics.zeroLinearLimitAxes,
                zeroAngularLimitAxes: restoringDiagnostics.zeroAngularLimitAxes,
                fixedAxisCount: restoringDiagnostics.fixedAxisCount,
                linearSpringEnabledAxes: restoringDiagnostics.linearSpringEnabledAxes,
                angularSpringEnabledAxes: restoringDiagnostics.angularSpringEnabledAxes,
                springMode: restoringDiagnostics.springMode,
                constraintSupportsSpringDamping: restoringDiagnostics.constraintSupportsSpringDamping,
                constraintSupportsSpringStiffness: restoringDiagnostics.constraintSupportsSpringStiffness,
                note: restoringDiagnostics.note,
            });
        }
        return diagnostics;
    }

    private static collectConstraintDriftSummary(
        runtimeConstraints: readonly Record<string, unknown>[],
    ): Array<Record<string, unknown>> {
        const summaries: Array<Record<string, unknown>> = [];
        for (const constraint of runtimeConstraints) {
            const anchorWorldDistance = typeof constraint.anchorWorldDistance === "number"
                ? constraint.anchorWorldDistance
                : null;
            const bodyOriginDistance = typeof constraint.bodyOriginDistance === "number"
                ? constraint.bodyOriginDistance
                : null;
            const relativeVelocityAlongAnchor = typeof constraint.relativeVelocityAlongAnchor === "number"
                ? constraint.relativeVelocityAlongAnchor
                : null;
            const relativeVelocityVsAnchor = typeof constraint.relativeVelocityVsAnchor === "string"
                ? constraint.relativeVelocityVsAnchor
                : null;
            const fixedAxisCount = typeof constraint.fixedAxisCount === "number"
                ? constraint.fixedAxisCount
                : null;

            summaries.push({
                joint: constraint.joint ?? null,
                constraintKind: constraint.constraintKind ?? null,
                bodyA: constraint.bodyA ?? null,
                bodyB: constraint.bodyB ?? null,
                anchorWorldDistance,
                bodyOriginDistance,
                relativeVelocityAlongAnchor,
                relativeVelocityVsAnchor,
                relativeSpeed: constraint.relativeSpeed ?? null,
                bodyASpeed: constraint.bodyASpeed ?? null,
                bodyBSpeed: constraint.bodyBSpeed ?? null,
                massA: constraint.runtimeBodyAMass ?? null,
                massB: constraint.runtimeBodyBMass ?? null,
                dampingA: constraint.runtimeBodyADamping ?? null,
                dampingB: constraint.runtimeBodyBDamping ?? null,
                fixedAxisCount,
                zeroLinearLimitAxes: constraint.zeroLinearLimitAxes ?? null,
                zeroAngularLimitAxes: constraint.zeroAngularLimitAxes ?? null,
                linearSpringEnabledAxes: constraint.linearSpringEnabledAxes ?? null,
                angularSpringEnabledAxes: constraint.angularSpringEnabledAxes ?? null,
                solverERP: constraint.solverERP ?? null,
                solverCFM: constraint.solverCFM ?? null,
                solverParamsAppliedByModoki: constraint.solverParamsAppliedByModoki ?? null,
                frameOffsetExpected: constraint.frameOffsetExpected ?? null,
                frameOffsetSetterAvailable: constraint.frameOffsetSetterAvailable ?? null,
                wasmConstraintUseFrameOffsetAvailable: constraint.wasmConstraintUseFrameOffsetAvailable ?? null,
                solverIterationApiCandidates: constraint.solverIterationApiCandidates ?? null,
                suspiciousMassScale: constraint.suspiciousMassScale ?? null,
                diagnosisHint: PhysicsModelController.describeConstraintDriftHint(
                    anchorWorldDistance,
                    relativeVelocityAlongAnchor,
                    relativeVelocityVsAnchor,
                    fixedAxisCount,
                ),
            });
        }

        summaries.sort((a, b) => {
            const distanceA = typeof a.anchorWorldDistance === "number" ? a.anchorWorldDistance : 0;
            const distanceB = typeof b.anchorWorldDistance === "number" ? b.anchorWorldDistance : 0;
            return distanceB - distanceA;
        });
        return summaries.slice(0, 8);
    }

    private static describeConstraintDriftHint(
        anchorWorldDistance: number | null,
        relativeVelocityAlongAnchor: number | null,
        relativeVelocityVsAnchor: string | null,
        fixedAxisCount: number | null,
    ): string {
        if (anchorWorldDistance === null) return "anchor-distance-unavailable";
        if (anchorWorldDistance <= 0.02) return "constraint-anchor-close";
        if (relativeVelocityVsAnchor === "separating") return "constraint-anchors-still-separating";
        if (relativeVelocityVsAnchor === "closing") return "constraint-anchors-closing-but-not-settled";
        if (relativeVelocityVsAnchor === "neutral" && fixedAxisCount === 6) {
            return "zero-limit-6dof-drift-without-closing-velocity";
        }
        if (relativeVelocityAlongAnchor === null) return "constraint-drift-velocity-unavailable";
        return "constraint-drift-unclassified";
    }

    private static getBulletPhysicsBundle(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike | null | undefined,
    ): BulletPhysicsBundleLike | null {
        if (!physicsModel || !("_bundle" in physicsModel)) return null;
        return physicsModel._bundle ?? null;
    }

    private static hasRuntimeConstraintUseFrameOffsetSetter(
        constraint: RuntimeConstraintDiagnosticLike | null | undefined,
    ): boolean | null {
        if (!constraint) return null;
        if (typeof constraint.useFrameOffset === "function") return true;
        const physicsJoint = constraint.physicsJoint as RuntimeConstraintDiagnosticLike | null | undefined;
        if (physicsJoint && physicsJoint !== constraint) {
            return PhysicsModelController.hasRuntimeConstraintUseFrameOffsetSetter(physicsJoint);
        }
        return false;
    }

    private static hasRuntimeConstraintWasmFunction(
        constraint: RuntimeConstraintDiagnosticLike | null | undefined,
        functionName: string,
    ): boolean | null {
        if (!constraint) return null;
        const wasmInstance = PhysicsModelController.getRuntimeConstraintWasmInstance(constraint);
        if (!wasmInstance) return null;
        return typeof (wasmInstance as Record<string, unknown>)[functionName] === "function";
    }

    private static collectRuntimeConstraintWasmFunctionNames(
        constraint: RuntimeConstraintDiagnosticLike | null | undefined,
        pattern: RegExp,
    ): string[] | null {
        const wasmInstance = PhysicsModelController.getRuntimeConstraintWasmInstance(constraint);
        if (!wasmInstance) return null;
        const names = new Set<string>();
        let current: object | null = wasmInstance as object;
        let depth = 0;
        while (current && depth < 4) {
            for (const name of Object.getOwnPropertyNames(current)) {
                if (!pattern.test(name)) continue;
                const value = (wasmInstance as Record<string, unknown>)[name];
                if (typeof value === "function") names.add(name);
            }
            current = Object.getPrototypeOf(current);
            depth += 1;
        }
        return Array.from(names).sort().slice(0, 24);
    }

    private static getRuntimeConstraintWasmInstance(
        constraint: RuntimeConstraintDiagnosticLike | null | undefined,
    ): unknown | null {
        if (!constraint) return null;
        if (constraint.runtime?.wasmInstance) return constraint.runtime.wasmInstance;
        const physicsJoint = constraint.physicsJoint as RuntimeConstraintDiagnosticLike | null | undefined;
        if (physicsJoint && physicsJoint !== constraint) {
            return PhysicsModelController.getRuntimeConstraintWasmInstance(physicsJoint);
        }
        return null;
    }

    private static describeSuspiciousMassScale(
        runtimeBodyA: ReturnType<typeof PhysicsModelController.captureRuntimeBundleRigidBodyDiagnostics>,
        runtimeBodyB: ReturnType<typeof PhysicsModelController.captureRuntimeBundleRigidBodyDiagnostics>,
    ): string {
        const massA = runtimeBodyA?.mass;
        const massB = runtimeBodyB?.mass;
        if (typeof massA !== "number" || typeof massB !== "number") return "unavailable";
        const maxMass = Math.max(massA, massB);
        const minMass = Math.min(massA, massB);
        if (maxMass <= 0 || minMass <= 0) return "non-positive";
        const ratio = maxMass / minMass;
        if (maxMass >= 50) return `large-mass>=50 ratio=${PhysicsModelController.roundDiagnosticNumber(ratio)}`;
        if (ratio >= 20) return `large-ratio>=20 ratio=${PhysicsModelController.roundDiagnosticNumber(ratio)}`;
        return "normal";
    }

    private static describeJointRestoringForceDiagnostics(
        joint: PhysicsJointDiagnosticEntry,
        constraint: RuntimeConstraintDiagnosticLike | null | undefined,
    ): {
        zeroLinearLimitAxes: string;
        zeroAngularLimitAxes: string;
        fixedAxisCount: number;
        linearSpringEnabledAxes: string;
        angularSpringEnabledAxes: string;
        springMode: string;
        constraintSupportsSpringDamping: boolean;
        constraintSupportsSpringStiffness: boolean;
        note: string;
    } {
        const zeroLinearLimitAxes = PhysicsModelController.collectZeroLimitAxes(
            joint.positionMin,
            joint.positionMax,
            ["x", "y", "z"],
        );
        const zeroAngularLimitAxes = PhysicsModelController.collectZeroLimitAxes(
            joint.rotationMin,
            joint.rotationMax,
            ["rx", "ry", "rz"],
        );
        const linearSpringEnabledAxes = PhysicsModelController.collectNonZeroAxes(
            joint.springPosition,
            ["x", "y", "z"],
        );
        const angularSpringValueAxes = PhysicsModelController.collectNonZeroAxes(
            joint.springRotation,
            ["rx", "ry", "rz"],
        );

        const hasLinearSpring = linearSpringEnabledAxes.length > 0;
        const hasAngularSpringValue = angularSpringValueAxes.length > 0;
        const fixedAxisCount = zeroLinearLimitAxes.length + zeroAngularLimitAxes.length;
        const springMode = hasLinearSpring || hasAngularSpringValue
            ? "metadata-spring"
            : fixedAxisCount === MMD_CONSTRAINT_AXIS_COUNT
                ? "zero-limit-fixed-only"
                : "limit-only";

        return {
            zeroLinearLimitAxes: zeroLinearLimitAxes.join(",") || "none",
            zeroAngularLimitAxes: zeroAngularLimitAxes.join(",") || "none",
            fixedAxisCount,
            linearSpringEnabledAxes: linearSpringEnabledAxes.join(",") || "none",
            angularSpringEnabledAxes: hasAngularSpringValue
                ? angularSpringValueAxes.join(",")
                : "rx,ry,rz(babylon-mmd enables angular spring even when stiffness is 0)",
            springMode,
            constraintSupportsSpringDamping: typeof constraint?.setDamping === "function",
            constraintSupportsSpringStiffness: typeof constraint?.setStiffness === "function",
            note: springMode === "zero-limit-fixed-only"
                ? "restoring force depends on 6DoF limits/ERP, not metadata spring stiffness"
                : "metadata spring stiffness may contribute to restoring force",
        };
    }

    private static collectZeroLimitAxes(
        minValues: readonly [number, number, number],
        maxValues: readonly [number, number, number],
        axisNames: readonly [string, string, string],
    ): string[] {
        const axes: string[] = [];
        for (let index = 0; index < axisNames.length; index += 1) {
            if (Math.abs(minValues[index]) <= 1e-6 && Math.abs(maxValues[index]) <= 1e-6) {
                axes.push(axisNames[index]);
            }
        }
        return axes;
    }

    private static collectNonZeroAxes(
        values: readonly [number, number, number],
        axisNames: readonly [string, string, string],
    ): string[] {
        const axes: string[] = [];
        for (let index = 0; index < axisNames.length; index += 1) {
            if (Math.abs(values[index]) > 1e-6) {
                axes.push(axisNames[index]);
            }
        }
        return axes;
    }

    private static isAbnormalMassClampDisabled(): boolean {
        try {
            const storage = globalThis.localStorage;
            return storage?.getItem(ABNORMAL_DYNAMIC_RIGID_BODY_MASS_CLAMP_DISABLE_KEY) === "1";
        } catch {
            return false;
        }
    }

    private static isFollowBoneVelocitySyncDisabled(): boolean {
        try {
            const storage = globalThis.localStorage;
            return storage?.getItem(FOLLOW_BONE_VELOCITY_SYNC_DISABLE_KEY) === "1";
        } catch {
            return false;
        }
    }

    private static isDampingCapDisabled(): boolean {
        try {
            const storage = globalThis.localStorage;
            return !PhysicsModelController.readCompatibilityCorrectionEnabled()
                || storage?.getItem(RUNTIME_RIGID_BODY_DAMPING_CAP_DISABLE_KEY) === "1";
        } catch {
            return true;
        }
    }

    public static getFullyDampedRigidBodyDampingCap(): number {
        return PhysicsModelController.convertDampingCorrectionAmountToCap(
            PhysicsModelController.getFullyDampedRigidBodyDampingCorrectionAmount(),
        );
    }

    public static getFullyDampedRigidBodyDampingCorrectionAmount(): number {
        try {
            const rawValue = globalThis.localStorage?.getItem(RUNTIME_RIGID_BODY_DAMPING_CORRECTION_AMOUNT_KEY);
            if (rawValue !== null && rawValue !== undefined && rawValue.trim() !== "") {
                return PhysicsModelController.normalizeCorrectionAmountValue(
                    Number(rawValue),
                    DEFAULT_DAMPING_CORRECTION_AMOUNT,
                );
            }
        } catch {
            // fall through to default
        }
        return DEFAULT_DAMPING_CORRECTION_AMOUNT;
    }

    public static setFullyDampedRigidBodyDampingCorrectionAmount(value: number): number {
        const normalized = PhysicsModelController.normalizeCorrectionAmountValue(
            value,
            DEFAULT_DAMPING_CORRECTION_AMOUNT,
        );
        try {
            globalThis.localStorage?.setItem(RUNTIME_RIGID_BODY_DAMPING_CORRECTION_AMOUNT_KEY, String(normalized));
        } catch {
            // UI can still use the normalized value for the current session.
        }
        return normalized;
    }

    public static getFullyDampedRigidBodyCorrectionEnabled(): boolean {
        return PhysicsModelController.readCompatibilityCorrectionEnabled()
            && !PhysicsModelController.isDampingCapDisabled()
            && !PhysicsModelController.isFullyDampedGravityScaleDisabled();
    }

    private static readCompatibilityCorrectionEnabled(): boolean {
        try {
            const rawValue = globalThis.localStorage?.getItem(PHYSICS_COMPATIBILITY_CORRECTION_ENABLED_KEY);
            if (rawValue === "1") return true;
            if (rawValue === "0") return false;
        } catch {
            // Fall through to the safe default.
        }
        return false;
    }

    public static setFullyDampedRigidBodyCorrectionEnabled(enabled: boolean): boolean {
        const next = Boolean(enabled);
        try {
            globalThis.localStorage?.setItem(PHYSICS_COMPATIBILITY_CORRECTION_ENABLED_KEY, next ? "1" : "0");
            if (next) {
                globalThis.localStorage?.removeItem(RUNTIME_RIGID_BODY_DAMPING_CAP_DISABLE_KEY);
                globalThis.localStorage?.removeItem(FULLY_DAMPED_RIGID_BODY_GRAVITY_SCALE_DISABLE_KEY);
            } else {
                globalThis.localStorage?.setItem(RUNTIME_RIGID_BODY_DAMPING_CAP_DISABLE_KEY, "1");
                globalThis.localStorage?.setItem(FULLY_DAMPED_RIGID_BODY_GRAVITY_SCALE_DISABLE_KEY, "1");
            }
        } catch {
            // Current session still observes the returned state where possible.
        }
        return next;
    }

    private static convertDampingCorrectionAmountToCap(value: number): number {
        const amount = PhysicsModelController.normalizeCorrectionAmountValue(
            value,
            DEFAULT_DAMPING_CORRECTION_AMOUNT,
        );
        if (amount <= 0) return 1;
        return RUNTIME_RIGID_BODY_DAMPING_CAP_MAX
            - amount * (RUNTIME_RIGID_BODY_DAMPING_CAP_MAX - RUNTIME_RIGID_BODY_DAMPING_CAP_MIN);
    }

    private static isFullyDampedGravityScaleDisabled(): boolean {
        try {
            const storage = globalThis.localStorage;
            return !PhysicsModelController.readCompatibilityCorrectionEnabled()
                || storage?.getItem(FULLY_DAMPED_RIGID_BODY_GRAVITY_SCALE_DISABLE_KEY) === "1";
        } catch {
            return true;
        }
    }

    public static getFullyDampedGravityScale(): number {
        return fullyDampedGravityScaleFromCorrectionAmount(
            PhysicsModelController.getFullyDampedGravityCorrectionAmount(),
        );
    }

    public static getFullyDampedGravityCorrectionAmount(): number {
        try {
            const rawValue = globalThis.localStorage?.getItem(FULLY_DAMPED_RIGID_BODY_GRAVITY_CORRECTION_AMOUNT_KEY);
            if (rawValue !== null && rawValue !== undefined && rawValue.trim() !== "") {
                return PhysicsModelController.normalizeCorrectionAmountValue(
                    Number(rawValue),
                    DEFAULT_GRAVITY_CORRECTION_AMOUNT,
                );
            }
        } catch {
            // fall through to default
        }
        return DEFAULT_GRAVITY_CORRECTION_AMOUNT;
    }

    public static setFullyDampedGravityCorrectionAmount(value: number): number {
        const normalized = PhysicsModelController.normalizeCorrectionAmountValue(
            value,
            DEFAULT_GRAVITY_CORRECTION_AMOUNT,
        );
        try {
            globalThis.localStorage?.setItem(FULLY_DAMPED_RIGID_BODY_GRAVITY_CORRECTION_AMOUNT_KEY, String(normalized));
        } catch {
            // UI can still use the normalized value for the current session.
        }
        return normalized;
    }

    private static normalizeCorrectionAmountValue(value: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        return Math.max(0, Math.min(1, value));
    }

    private static isBoneEvaluationOrderNormalizationDisabled(): boolean {
        try {
            return globalThis.localStorage?.getItem(BONE_EVALUATION_ORDER_NORMALIZATION_DISABLE_KEY) === "1";
        } catch {
            return false;
        }
    }

    private static summarizeRuntimeBoneEvaluationOrder(
        sortedRuntimeBones: readonly Array<{
            name?: string;
            parentBone?: object | null;
            transformAfterPhysics?: boolean;
        }>,
        physicsBoneNames: readonly string[],
    ): Record<string, unknown> {
        const orderByBone = new Map<object, number>();
        const nameByBone = new Map<object, string>();
        const boneByName = new Map<string, {
            name?: string;
            parentBone?: object | null;
            transformAfterPhysics?: boolean;
        }>();
        let beforePhysicsCount = 0;
        let afterPhysicsCount = 0;
        for (let index = 0; index < sortedRuntimeBones.length; index += 1) {
            const bone = sortedRuntimeBones[index];
            orderByBone.set(bone as unknown as object, index);
            if (bone.transformAfterPhysics) afterPhysicsCount += 1;
            else beforePhysicsCount += 1;
            if (typeof bone.name === "string" && bone.name.length > 0) {
                nameByBone.set(bone as unknown as object, bone.name);
                if (!boneByName.has(bone.name)) {
                    boneByName.set(bone.name, bone);
                }
            }
        }

        let parentOrderViolationCount = 0;
        const parentOrderViolationSamples: Array<Record<string, unknown>> = [];
        for (let index = 0; index < sortedRuntimeBones.length; index += 1) {
            const bone = sortedRuntimeBones[index];
            const parentBone = bone.parentBone as object | null | undefined;
            if (!parentBone) continue;
            const parentIndex = orderByBone.get(parentBone);
            if (parentIndex === undefined || parentIndex < index) continue;
            parentOrderViolationCount += 1;
            if (parentOrderViolationSamples.length < 8) {
                parentOrderViolationSamples.push({
                    bone: bone.name ?? null,
                    index,
                    parentIndex,
                    transformAfterPhysics: Boolean(bone.transformAfterPhysics),
                });
            }
        }

        const physicsBoneSamples: Array<Record<string, unknown>> = [];
        const physicsBoneParentOrderViolationSamples: Array<Record<string, unknown>> = [];
        let physicsBoneMissingRuntimeCount = 0;
        let physicsBoneParentOrderViolationCount = 0;
        let physicsBoneParentStageMismatchCount = 0;
        for (const boneName of physicsBoneNames) {
            const bone = boneByName.get(boneName);
            if (!bone) {
                physicsBoneMissingRuntimeCount += 1;
                continue;
            }
            const sortedIndex = orderByBone.get(bone as unknown as object) ?? null;
            const parentBone = bone.parentBone as object | null | undefined;
            const parentSortedIndex = parentBone ? orderByBone.get(parentBone) ?? null : null;
            const parentTransformAfterPhysics = parentBone
                ? Boolean((parentBone as { transformAfterPhysics?: boolean }).transformAfterPhysics)
                : null;
            const parentBeforeChild = sortedIndex !== null && parentSortedIndex !== null
                ? parentSortedIndex < sortedIndex
                : null;
            const stageMismatch = parentTransformAfterPhysics !== null
                && parentTransformAfterPhysics !== Boolean(bone.transformAfterPhysics);
            if (parentBeforeChild === false) {
                physicsBoneParentOrderViolationCount += 1;
                if (physicsBoneParentOrderViolationSamples.length < 12) {
                    physicsBoneParentOrderViolationSamples.push({
                        name: boneName,
                        sortedIndex,
                        parentName: parentBone ? nameByBone.get(parentBone) ?? null : null,
                        parentSortedIndex,
                        transformAfterPhysics: Boolean(bone.transformAfterPhysics),
                        parentTransformAfterPhysics,
                    });
                }
            }
            if (stageMismatch) physicsBoneParentStageMismatchCount += 1;
            physicsBoneSamples.push({
                name: boneName,
                sortedIndex,
                parentName: parentBone ? nameByBone.get(parentBone) ?? null : null,
                parentSortedIndex,
                parentBeforeChild,
                transformAfterPhysics: Boolean(bone.transformAfterPhysics),
                parentTransformAfterPhysics,
                parentStageMismatch: stageMismatch,
            });
            if (physicsBoneSamples.length >= 16) break;
        }

        return {
            beforePhysicsBoneCount: beforePhysicsCount,
            afterPhysicsBoneCount: afterPhysicsCount,
            physicsBoneNameCount: physicsBoneNames.length,
            physicsBoneMissingRuntimeCount,
            physicsBoneParentOrderViolationCount,
            physicsBoneParentStageMismatchCount,
            physicsBoneSamples,
            physicsBoneParentOrderViolationSamples,
            parentOrderViolationCount,
            parentOrderViolationSamples,
        };
    }

    private static getZeroLimit6DofErpBoostValue(): number | null {
        try {
            const storage = globalThis.localStorage;
            const rawValue = storage?.getItem(ZERO_LIMIT_6DOF_ERP_BOOST_VALUE_KEY);
            if (rawValue !== null && rawValue !== undefined && rawValue.trim() !== "") {
                const parsedValue = Number(rawValue);
                if (Number.isFinite(parsedValue) && parsedValue >= 0 && parsedValue <= 1) {
                    return parsedValue;
                }
            }
        } catch {
            return null;
        }
        return null;
    }

    private static getAbnormalMassMode(): AbnormalMassMode {
        try {
            const value = globalThis.localStorage?.getItem(ABNORMAL_DYNAMIC_RIGID_BODY_MASS_MODE_KEY);
            if (value === "unit" || value === "tiny" || value === "clamp") return value;
        } catch {
            // fall through to the current best experiment default
        }
        return "mantissa";
    }

    private static getAbnormalTinyMassValue(): number {
        try {
            const value = globalThis.localStorage?.getItem(ABNORMAL_DYNAMIC_RIGID_BODY_TINY_MASS_VALUE_KEY);
            const parsedValue = value !== null && value !== undefined ? Number(value) : Number.NaN;
            if (Number.isFinite(parsedValue) && parsedValue > 0 && parsedValue <= 1) {
                return parsedValue;
            }
        } catch {
            // fall through to default tiny mass
        }
        return ABNORMAL_DYNAMIC_RIGID_BODY_TINY_MASS;
    }

    private static collectFullyDampedDynamicRigidBodyIndices(bundle: BulletPhysicsBundleLike): number[] {
        if (
            typeof bundle.getLinearDamping !== "function"
            || typeof bundle.getAngularDamping !== "function"
        ) {
            return [];
        }

        const indices: number[] = [];
        for (let index = 0; index < bundle.count; index += 1) {
            if (bundle.rigidBodyData?.[index]?.physicsMode === FOLLOW_BONE_RIGID_BODY_PHYSICS_MODE) continue;

            let linearDamping: number;
            let angularDamping: number;
            try {
                linearDamping = bundle.getLinearDamping(index);
                angularDamping = bundle.getAngularDamping(index);
            } catch {
                continue;
            }
            if (!Number.isFinite(linearDamping) || !Number.isFinite(angularDamping)) continue;
            if (
                linearDamping >= RUNTIME_RIGID_BODY_DAMPING_LIMIT
                && angularDamping >= RUNTIME_RIGID_BODY_DAMPING_LIMIT
            ) {
                indices.push(index);
            }
        }
        return indices;
    }

    private static collectZeroLimit6DofRigidBodyIndices(
        joints: readonly PhysicsJointDiagnosticEntry[],
    ): Set<number> {
        const indices = new Set<number>();
        for (const joint of joints) {
            if (!PhysicsModelController.isZeroLimit6DofWithoutSpring(joint)) continue;
            if (joint.rigidbodyIndexA >= 0) indices.add(joint.rigidbodyIndexA);
            if (joint.rigidbodyIndexB >= 0) indices.add(joint.rigidbodyIndexB);
        }
        return indices;
    }

    public static getAbnormalDynamicRigidBodyMassTowardUnit(): number {
        try {
            const rawValue = globalThis.localStorage?.getItem(ABNORMAL_DYNAMIC_RIGID_BODY_MASS_TOWARD_UNIT_KEY);
            if (rawValue !== null && rawValue !== undefined && rawValue.trim() !== "") {
                return PhysicsModelController.normalizeMassTowardUnitValue(Number(rawValue));
            }
        } catch {
            // fall through to default
        }
        return DEFAULT_MASS_TOWARD_UNIT_AMOUNT;
    }

    public static setAbnormalDynamicRigidBodyMassTowardUnit(value: number): number {
        const normalized = PhysicsModelController.normalizeMassTowardUnitValue(value);
        try {
            globalThis.localStorage?.setItem(ABNORMAL_DYNAMIC_RIGID_BODY_MASS_TOWARD_UNIT_KEY, String(normalized));
        } catch {
            // UI can still use the normalized value for the current session.
        }
        return normalized;
    }

    private static normalizeMassTowardUnitValue(value: number): number {
        if (!Number.isFinite(value)) return DEFAULT_MASS_TOWARD_UNIT_AMOUNT;
        return Math.max(0, Math.min(1, value));
    }

    private static moveMassTowardUnit(mass: number, strength: number): number {
        if (!Number.isFinite(mass) || mass <= 0) return mass;
        const normalizedStrength = PhysicsModelController.normalizeMassTowardUnitValue(strength);
        if (normalizedStrength <= 0) return mass;
        if (normalizedStrength >= 1) return ABNORMAL_DYNAMIC_RIGID_BODY_UNIT_MASS;
        return Math.exp(Math.log(mass) * (1 - normalizedStrength));
    }

    private static shouldBoostZeroLimit6DofErp(joint: PhysicsJointDiagnosticEntry): boolean {
        if (PhysicsModelController.getZeroLimit6DofErpBoostValue() === null) return false;
        return PhysicsModelController.isZeroLimit6DofWithoutSpring(joint);
    }

    private static isZeroLimit6DofWithoutSpring(joint: PhysicsJointDiagnosticEntry): boolean {
        const fixedAxisCount = PhysicsModelController.collectZeroLimitAxes(
            joint.positionMin,
            joint.positionMax,
            ["x", "y", "z"],
        ).length + PhysicsModelController.collectZeroLimitAxes(
            joint.rotationMin,
            joint.rotationMax,
            ["rx", "ry", "rz"],
        ).length;
        if (fixedAxisCount !== MMD_CONSTRAINT_AXIS_COUNT) return false;

        const springAxisCount = PhysicsModelController.collectNonZeroAxes(
            joint.springPosition,
            ["x", "y", "z"],
        ).length + PhysicsModelController.collectNonZeroAxes(
            joint.springRotation,
            ["rx", "ry", "rz"],
        ).length;
        return springAxisCount === 0;
    }

    private static isFiniteVector(value: PhysicsVectorLike): boolean {
        return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
    }

    private static safeGetRuntimeBodyMass(bundle: BulletPhysicsBundleLike, bundleBodyIndex: number): number {
        try {
            return typeof bundle.getMass === "function" ? bundle.getMass(bundleBodyIndex) : Number.NaN;
        } catch {
            return Number.NaN;
        }
    }

    private static resolveAbnormalDynamicRigidBodyMass(
        originalMass: number,
        mode: AbnormalMassMode,
        options: { recoverLowMass?: boolean } = {},
    ): { mass: number; mode: "unit" | "tiny" | "decimal-mantissa-recovered" | "clamped" } | null {
        const recoverLowMass = options.recoverLowMass === true;
        if (
            !Number.isFinite(originalMass)
            || originalMass <= 0
            || (!recoverLowMass && originalMass <= LOW_DECIMAL_MANTISSA_RECOVERED_MASS_LIMIT)
        ) {
            return null;
        }

        if (mode === "unit") {
            return { mass: ABNORMAL_DYNAMIC_RIGID_BODY_UNIT_MASS, mode: "unit" };
        }

        if (mode === "tiny") {
            return { mass: PhysicsModelController.getAbnormalTinyMassValue(), mode: "tiny" };
        }

        if (mode === "mantissa") {
            const recoveredMass = PhysicsModelController.tryRecoverAbnormalFloat32Mass(originalMass, recoverLowMass);
            if (recoveredMass !== null) {
                return { mass: recoveredMass, mode: "decimal-mantissa-recovered" };
            }
            if (originalMass <= ABNORMAL_DYNAMIC_RIGID_BODY_MASS_LIMIT) return null;
            return { mass: ABNORMAL_DYNAMIC_RIGID_BODY_MASS_LIMIT, mode: "clamped" };
        }

        if (originalMass <= ABNORMAL_DYNAMIC_RIGID_BODY_MASS_LIMIT) return null;
        return { mass: ABNORMAL_DYNAMIC_RIGID_BODY_MASS_LIMIT, mode: "clamped" };
    }

    private static tryRecoverAbnormalFloat32Mass(value: number, recoverLowMass = false): number | null {
        if (
            !Number.isFinite(value)
            || value <= 0
            || (!recoverLowMass && value <= LOW_DECIMAL_MANTISSA_RECOVERED_MASS_LIMIT)
        ) {
            return null;
        }

        if (value <= RECOVERED_DYNAMIC_RIGID_BODY_MASS_LIMIT) {
            const lowMassCandidate = value / 100;
            return lowMassCandidate > 0 ? lowMassCandidate : null;
        }

        let candidate = Math.abs(value);
        while (candidate > DECIMAL_MANTISSA_RECOVERED_MASS_MAX) {
            candidate /= 10;
        }

        if (
            Number.isFinite(candidate)
            && candidate > 0
            && candidate <= DECIMAL_MANTISSA_RECOVERED_MASS_MAX
        ) {
            return candidate;
        }

        return null;
    }

    private static safeGetRuntimeBodyLocalInertia(bundle: BulletPhysicsBundleLike, bundleBodyIndex: number): Vector3 | null {
        try {
            return typeof bundle.getLocalInertia === "function" ? bundle.getLocalInertia(bundleBodyIndex) : null;
        } catch {
            return null;
        }
    }

    private static captureRuntimeBundleRigidBodyDiagnostics(
        bundle: BulletPhysicsBundleLike | null,
        bundleBodyIndex: number | null,
    ): {
        mass: number;
        linearDamping: number;
        angularDamping: number;
        localInertia: string;
    } | null {
        if (!bundle || bundleBodyIndex === null) return null;
        if (bundleBodyIndex < 0 || bundleBodyIndex >= bundle.count) return null;
        if (
            typeof bundle.getMass !== "function"
            || typeof bundle.getLinearDamping !== "function"
            || typeof bundle.getAngularDamping !== "function"
            || typeof bundle.getLocalInertia !== "function"
        ) {
            return null;
        }

        try {
            return {
                mass: PhysicsModelController.roundDiagnosticNumber(bundle.getMass(bundleBodyIndex)),
                linearDamping: PhysicsModelController.roundDiagnosticNumber(bundle.getLinearDamping(bundleBodyIndex)),
                angularDamping: PhysicsModelController.roundDiagnosticNumber(bundle.getAngularDamping(bundleBodyIndex)),
                localInertia: PhysicsModelController.formatVector3(bundle.getLocalInertia(bundleBodyIndex)),
            };
        } catch {
            return null;
        }
    }

    private static getModelPhysicsScalingFactor(model: PhysicsRuntimeModel): number {
        const mesh = model.mesh as unknown as {
            computeWorldMatrix?: (force?: boolean) => Matrix;
            getWorldMatrix?: () => Matrix;
        } | undefined;
        try {
            mesh?.computeWorldMatrix?.(true);
            const worldMatrix = mesh?.getWorldMatrix?.();
            if (!worldMatrix) return 1;

            const worldScale = new Vector3();
            const worldRotation = new Quaternion();
            worldMatrix.decompose(worldScale, worldRotation);
            if (
                Math.abs(worldScale.x - worldScale.y) < 0.0001
                && Math.abs(worldScale.y - worldScale.z) < 0.0001
            ) {
                return Math.abs(worldScale.x) > 0.0001 ? worldScale.x : 1;
            }
            return Math.max(worldScale.x, worldScale.y, worldScale.z);
        }
        catch {
            return 1;
        }
    }

    private static calculateConstraintFrameDiagnostics(
        joint: PhysicsJointDiagnosticEntry,
        bodyA: PhysicsRigidBodyDiagnosticEntry,
        bodyB: PhysicsRigidBodyDiagnosticEntry,
        scalingFactor: number,
    ): {
        frameA: string;
        frameB: string;
        framePivotDistance: number;
        jointToBodyDistanceA: number;
        jointToBodyDistanceB: number;
    } {
        const frameA = PhysicsModelController.calculateConstraintFrameMatrix(joint, bodyA, scalingFactor);
        const frameB = PhysicsModelController.calculateConstraintFrameMatrix(joint, bodyB, scalingFactor);

        const frameAPivot = frameA.getTranslation();
        const frameBPivot = frameB.getTranslation();
        const jointPosition = PhysicsModelController.vectorFromTuple(joint.position, scalingFactor);
        const bodyAPosition = PhysicsModelController.vectorFromTuple(bodyA.shapePosition, scalingFactor);
        const bodyBPosition = PhysicsModelController.vectorFromTuple(bodyB.shapePosition, scalingFactor);

        return {
            frameA: PhysicsModelController.formatConstraintFrame(frameA),
            frameB: PhysicsModelController.formatConstraintFrame(frameB),
            framePivotDistance: PhysicsModelController.roundDiagnosticNumber(Vector3.Distance(frameAPivot, frameBPivot)),
            jointToBodyDistanceA: PhysicsModelController.roundDiagnosticNumber(Vector3.Distance(jointPosition, bodyAPosition)),
            jointToBodyDistanceB: PhysicsModelController.roundDiagnosticNumber(Vector3.Distance(jointPosition, bodyBPosition)),
        };
    }

    private static calculateRuntimeConstraintAnchorDiagnostics(
        snapshot: WebmPhysicsModelSnapshot,
        joint: PhysicsJointDiagnosticEntry,
        bodyA: PhysicsRigidBodyDiagnosticEntry,
        bodyB: PhysicsRigidBodyDiagnosticEntry,
        scalingFactor: number,
    ): {
        anchorWorldA: string;
        anchorWorldB: string;
        anchorSeparation: [number, number, number];
        anchorWorldDistance: number;
        bodyOriginDistance: number;
    } | null {
        const bodySnapshotA = snapshot.rigidBodies[joint.rigidbodyIndexA];
        const bodySnapshotB = snapshot.rigidBodies[joint.rigidbodyIndexB];
        if (!bodySnapshotA || !bodySnapshotB) return null;
        if (bodySnapshotA.transformMatrix.length < 16 || bodySnapshotB.transformMatrix.length < 16) return null;

        const frameA = PhysicsModelController.calculateConstraintFrameMatrix(joint, bodyA, scalingFactor);
        const frameB = PhysicsModelController.calculateConstraintFrameMatrix(joint, bodyB, scalingFactor);
        const bodyWorldA = Matrix.Identity();
        const bodyWorldB = Matrix.Identity();
        Matrix.FromArrayToRef(bodySnapshotA.transformMatrix, 0, bodyWorldA);
        Matrix.FromArrayToRef(bodySnapshotB.transformMatrix, 0, bodyWorldB);

        const anchorWorldA = Vector3.TransformCoordinates(frameA.getTranslation(), bodyWorldA);
        const anchorWorldB = Vector3.TransformCoordinates(frameB.getTranslation(), bodyWorldB);
        const anchorSeparation = anchorWorldB.subtract(anchorWorldA);
        const bodyOriginA = bodyWorldA.getTranslation();
        const bodyOriginB = bodyWorldB.getTranslation();
        return {
            anchorWorldA: PhysicsModelController.formatVector3(anchorWorldA),
            anchorWorldB: PhysicsModelController.formatVector3(anchorWorldB),
            anchorSeparation: PhysicsModelController.vectorToTuple(anchorSeparation),
            anchorWorldDistance: PhysicsModelController.roundDiagnosticNumber(Vector3.Distance(anchorWorldA, anchorWorldB)),
            bodyOriginDistance: PhysicsModelController.roundDiagnosticNumber(Vector3.Distance(bodyOriginA, bodyOriginB)),
        };
    }

    private static calculateRuntimeConstraintVelocityDiagnostics(
        snapshot: WebmPhysicsModelSnapshot,
        joint: PhysicsJointDiagnosticEntry,
        anchorDiagnostics: { anchorSeparation: [number, number, number]; anchorWorldDistance: number } | null,
    ): {
        bodyALinearVelocity: string;
        bodyBLinearVelocity: string;
        relativeLinearVelocity: string;
        bodyASpeed: number;
        bodyBSpeed: number;
        relativeSpeed: number;
        relativeVelocityAlongAnchor: number | null;
        relativeVelocityVsAnchor: string | null;
    } | null {
        const bodySnapshotA = snapshot.rigidBodies[joint.rigidbodyIndexA];
        const bodySnapshotB = snapshot.rigidBodies[joint.rigidbodyIndexB];
        if (!bodySnapshotA || !bodySnapshotB) return null;

        const velocityA = Vector3.Zero();
        const velocityB = Vector3.Zero();
        PhysicsModelController.tupleToVector(bodySnapshotA.linearVelocity, velocityA);
        PhysicsModelController.tupleToVector(bodySnapshotB.linearVelocity, velocityB);
        const relativeVelocity = velocityB.subtract(velocityA);
        const relativeSpeed = relativeVelocity.length();
        let relativeVelocityAlongAnchor: number | null = null;
        let relativeVelocityVsAnchor: string | null = null;
        if (anchorDiagnostics && anchorDiagnostics.anchorWorldDistance > 1e-6) {
            const separation = Vector3.Zero();
            PhysicsModelController.tupleToVector(anchorDiagnostics.anchorSeparation, separation);
            const separationLength = separation.length();
            if (separationLength > 1e-6) {
                separation.scaleInPlace(1 / separationLength);
                relativeVelocityAlongAnchor = PhysicsModelController.roundDiagnosticNumber(
                    Vector3.Dot(relativeVelocity, separation),
                );
                relativeVelocityVsAnchor = relativeVelocityAlongAnchor > 1e-4
                    ? "separating"
                    : relativeVelocityAlongAnchor < -1e-4
                        ? "closing"
                        : "neutral";
            }
        }

        return {
            bodyALinearVelocity: PhysicsModelController.formatVector3(velocityA),
            bodyBLinearVelocity: PhysicsModelController.formatVector3(velocityB),
            relativeLinearVelocity: PhysicsModelController.formatVector3(relativeVelocity),
            bodyASpeed: PhysicsModelController.roundDiagnosticNumber(velocityA.length()),
            bodyBSpeed: PhysicsModelController.roundDiagnosticNumber(velocityB.length()),
            relativeSpeed: PhysicsModelController.roundDiagnosticNumber(relativeSpeed),
            relativeVelocityAlongAnchor,
            relativeVelocityVsAnchor,
        };
    }

    private static calculateConstraintFrameMatrix(
        joint: PhysicsJointDiagnosticEntry,
        body: PhysicsRigidBodyDiagnosticEntry,
        scalingFactor: number,
    ): Matrix {
        const one = Vector3.One();
        const jointTransform = PhysicsModelController.composePhysicsTransform(
            joint.position,
            joint.rotation,
            scalingFactor,
            one,
        );
        const bodyTransformInverse = PhysicsModelController.composePhysicsTransform(
            body.shapePosition,
            body.shapeRotation,
            scalingFactor,
            one,
        ).invert();

        const frame = new Matrix();
        jointTransform.multiplyToRef(bodyTransformInverse, frame);
        return frame;
    }

    private static composePhysicsTransform(
        position: readonly [number, number, number],
        rotation: readonly [number, number, number],
        scalingFactor: number,
        scale: Vector3,
    ): Matrix {
        const quaternion = Quaternion.FromEulerAngles(rotation[0], rotation[1], rotation[2]);
        const translation = PhysicsModelController.vectorFromTuple(position, scalingFactor);
        return Matrix.Compose(scale, quaternion, translation);
    }

    private static vectorFromTuple(value: readonly [number, number, number], scalingFactor: number): Vector3 {
        return new Vector3(
            value[0] * scalingFactor,
            value[1] * scalingFactor,
            value[2] * scalingFactor,
        );
    }

    private static formatConstraintFrame(frame: Matrix): string {
        return [
            `pivot=${PhysicsModelController.formatVector3(frame.getTranslation())}`,
            `axisX=${PhysicsModelController.formatVector3(new Vector3(frame.m[0], frame.m[1], frame.m[2]))}`,
            `axisY=${PhysicsModelController.formatVector3(new Vector3(frame.m[4], frame.m[5], frame.m[6]))}`,
            `axisZ=${PhysicsModelController.formatVector3(new Vector3(frame.m[8], frame.m[9], frame.m[10]))}`,
        ].join(" ");
    }

    private static getRigidBodyIndexMap(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike | null | undefined,
    ): Int32Array | number[] | null {
        if (!physicsModel || !("_rigidBodyIndexMap" in physicsModel)) return null;
        return physicsModel._rigidBodyIndexMap ?? null;
    }

    private static describeRuntimeConstraintKind(constraint: RuntimeConstraintDiagnosticLike | null | undefined): string | null {
        if (!constraint) return null;
        const names: string[] = [];
        const constructorName = constraint.constructor?.name;
        if (constructorName) names.push(constructorName);
        const physicsJoint = constraint.physicsJoint as RuntimeConstraintDiagnosticLike | null | undefined;
        const physicsJointConstructorName = physicsJoint?.constructor?.name;
        if (physicsJointConstructorName && physicsJointConstructorName !== constructorName) {
            names.push(`physicsJoint:${physicsJointConstructorName}`);
        }
        return names.length > 0 ? names.join("/") : "unknown";
    }

    private static getRuntimeConstraintPtr(constraint: RuntimeConstraintDiagnosticLike | null | undefined): number | null {
        if (!constraint) return null;
        const directPtr = typeof constraint.ptr === "number" ? constraint.ptr : null;
        if (directPtr !== null) return directPtr;
        const innerPtr = typeof constraint._inner?.ptr === "number"
            ? constraint._inner.ptr
            : typeof constraint._inner?._ptr === "number"
                ? constraint._inner._ptr
                : null;
        if (innerPtr !== null) return innerPtr;
        const physicsJoint = constraint.physicsJoint as RuntimeConstraintDiagnosticLike | null | undefined;
        if (physicsJoint && physicsJoint !== constraint) {
            return PhysicsModelController.getRuntimeConstraintPtr(physicsJoint);
        }
        return null;
    }

    private static hasRuntimeConstraintWorldReference(constraint: RuntimeConstraintDiagnosticLike | null | undefined): boolean | null {
        if (!constraint) return null;
        if ("_worldReference" in constraint) return constraint._worldReference !== null && constraint._worldReference !== undefined;
        const physicsJoint = constraint.physicsJoint as RuntimeConstraintDiagnosticLike | null | undefined;
        if (physicsJoint && physicsJoint !== constraint) {
            return PhysicsModelController.hasRuntimeConstraintWorldReference(physicsJoint);
        }
        return null;
    }

    private static getRuntimeConstraintReferenceCount(constraint: RuntimeConstraintDiagnosticLike | null | undefined): number | null {
        if (!constraint) return null;
        if (typeof constraint._inner?._referenceCount === "number") return constraint._inner._referenceCount;
        const physicsJoint = constraint.physicsJoint as RuntimeConstraintDiagnosticLike | null | undefined;
        if (physicsJoint && physicsJoint !== constraint) {
            return PhysicsModelController.getRuntimeConstraintReferenceCount(physicsJoint);
        }
        return null;
    }

    private static describeRuntimeConstraintBodyReference(constraint: RuntimeConstraintDiagnosticLike | null | undefined): string | null {
        if (!constraint) return null;
        const reference = constraint._inner?._bodyReference;
        if (reference !== undefined && reference !== null) {
            if (Array.isArray(reference)) return `array:${reference.length}`;
            if (typeof reference === "object") {
                const maybeBundle = reference as { count?: unknown; constructor?: { name?: string } };
                const constructorName = maybeBundle.constructor?.name ?? "object";
                return typeof maybeBundle.count === "number"
                    ? `${constructorName}:count=${maybeBundle.count}`
                    : constructorName;
            }
            return typeof reference;
        }
        const physicsJoint = constraint.physicsJoint as RuntimeConstraintDiagnosticLike | null | undefined;
        if (physicsJoint && physicsJoint !== constraint) {
            return PhysicsModelController.describeRuntimeConstraintBodyReference(physicsJoint);
        }
        return null;
    }

    private static collectJointGraphChains(
        snapshot: WebmPhysicsModelSnapshot,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        joints: readonly PhysicsJointDiagnosticEntry[],
        category: string,
    ): Array<{
        rigidBodyIndices: number[];
        jointNames: string[];
        samples: Array<{ rigidBodyIndex: number; name: string; position: Vector3 }>;
    }> {
        const adjacency = new Map<number, Array<{ to: number; jointName: string }>>();
        const jointNamesByEdge = new Map<string, string[]>();
        const validBodyLimit = Math.min(rigidBodies.length, snapshot.rigidBodies.length);

        for (const joint of joints) {
            const indexA = joint.rigidbodyIndexA;
            const indexB = joint.rigidbodyIndexB;
            if (indexA < 0 || indexB < 0 || indexA >= validBodyLimit || indexB >= validBodyLimit) continue;

            const bodyA = rigidBodies[indexA];
            const bodyB = rigidBodies[indexB];
            if (!bodyA || !bodyB) continue;
            if (
                PhysicsModelController.classifyRigidBodyName(bodyA.name) !== category
                && PhysicsModelController.classifyRigidBodyName(bodyB.name) !== category
            ) {
                continue;
            }

            PhysicsModelController.pushJointGraphEdge(adjacency, indexA, indexB, joint.name);
            PhysicsModelController.pushJointGraphEdge(adjacency, indexB, indexA, joint.name);
            const edgeKey = PhysicsModelController.getJointGraphEdgeKey(indexA, indexB);
            const edgeJointNames = jointNamesByEdge.get(edgeKey) ?? [];
            edgeJointNames.push(joint.name);
            jointNamesByEdge.set(edgeKey, edgeJointNames);
        }

        const chains: Array<{
            rigidBodyIndices: number[];
            jointNames: string[];
            samples: Array<{ rigidBodyIndex: number; name: string; position: Vector3 }>;
        }> = [];
        const visited = new Set<number>();
        for (const startIndex of adjacency.keys()) {
            if (visited.has(startIndex)) continue;

            const component = PhysicsModelController.collectJointGraphComponent(startIndex, adjacency, visited);
            if (component.length < 2) continue;

            const orderedIndices = PhysicsModelController.orderJointGraphComponent(component, adjacency);
            const samples: Array<{ rigidBodyIndex: number; name: string; position: Vector3 }> = [];
            for (const rigidBodyIndex of orderedIndices) {
                const bodySnapshot = snapshot.rigidBodies[rigidBodyIndex];
                const rigidBody = rigidBodies[rigidBodyIndex];
                if (!bodySnapshot || !rigidBody) continue;
                const matrix = bodySnapshot.transformMatrix;
                if (matrix.length < 15) continue;
                samples.push({
                    rigidBodyIndex,
                    name: rigidBody.name,
                    position: new Vector3(matrix[12], matrix[13], matrix[14]),
                });
            }
            if (samples.length < 2) continue;

            const jointNames = PhysicsModelController.collectJointGraphPathJointNames(orderedIndices, jointNamesByEdge);
            chains.push({
                rigidBodyIndices: orderedIndices,
                jointNames,
                samples,
            });
        }

        return chains;
    }

    private static pushJointGraphEdge(
        adjacency: Map<number, Array<{ to: number; jointName: string }>>,
        from: number,
        to: number,
        jointName: string,
    ): void {
        const edges = adjacency.get(from) ?? [];
        edges.push({ to, jointName });
        adjacency.set(from, edges);
    }

    private static collectJointGraphComponent(
        startIndex: number,
        adjacency: Map<number, Array<{ to: number; jointName: string }>>,
        visited: Set<number>,
    ): number[] {
        const component: number[] = [];
        const stack = [startIndex];
        visited.add(startIndex);
        while (stack.length > 0) {
            const current = stack.pop();
            if (current === undefined) continue;
            component.push(current);
            for (const edge of adjacency.get(current) ?? []) {
                if (visited.has(edge.to)) continue;
                visited.add(edge.to);
                stack.push(edge.to);
            }
        }
        return component;
    }

    private static orderJointGraphComponent(
        component: readonly number[],
        adjacency: Map<number, Array<{ to: number; jointName: string }>>,
    ): number[] {
        const componentSet = new Set(component);
        const endpoints = component.filter((index) => {
            return (adjacency.get(index) ?? []).filter((edge) => componentSet.has(edge.to)).length <= 1;
        });
        const startIndex = endpoints.length > 0
            ? endpoints.slice().sort((a, b) => a - b)[0]
            : component.slice().sort((a, b) => a - b)[0];

        const ordered: number[] = [];
        const visited = new Set<number>();
        const walk = (index: number): void => {
            visited.add(index);
            ordered.push(index);
            const nextEdges = (adjacency.get(index) ?? [])
                .filter((edge) => componentSet.has(edge.to) && !visited.has(edge.to))
                .sort((a, b) => a.to - b.to);
            for (const edge of nextEdges) {
                walk(edge.to);
            }
        };
        walk(startIndex);

        for (const index of component.slice().sort((a, b) => a - b)) {
            if (!visited.has(index)) ordered.push(index);
        }
        return ordered;
    }

    private static collectJointGraphPathJointNames(
        orderedIndices: readonly number[],
        jointNamesByEdge: Map<string, string[]>,
    ): string[] {
        const jointNames: string[] = [];
        for (let index = 1; index < orderedIndices.length; index += 1) {
            const edgeKey = PhysicsModelController.getJointGraphEdgeKey(orderedIndices[index - 1], orderedIndices[index]);
            jointNames.push(...(jointNamesByEdge.get(edgeKey) ?? []));
        }
        return jointNames;
    }

    private static getJointGraphEdgeKey(indexA: number, indexB: number): string {
        return indexA < indexB ? `${indexA}:${indexB}` : `${indexB}:${indexA}`;
    }

    private static getSnapshotRigidBodyPosition(snapshot: WebmPhysicsModelSnapshot, rigidBodyIndex: number): Vector3 | null {
        const bodySnapshot = snapshot.rigidBodies[rigidBodyIndex];
        if (!bodySnapshot) return null;
        const matrix = bodySnapshot.transformMatrix;
        if (matrix.length < 15) return null;
        return new Vector3(matrix[12], matrix[13], matrix[14]);
    }

    private static summarizePhysicsChainSamples(
        samples: Array<{ rigidBodyIndex: number; name: string; position: Vector3 }>,
    ): {
        totalDistance: number;
        rootTipDistance: number;
        minY: number;
        maxY: number;
        maxSegmentDistance: number;
        maxSegment: {
            fromIndex: number;
            fromName: string;
            toIndex: number;
            toName: string;
        } | null;
    } {
        let totalDistance = 0;
        let maxSegmentDistance = 0;
        let maxSegment: {
            fromIndex: number;
            fromName: string;
            toIndex: number;
            toName: string;
        } | null = null;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (let index = 0; index < samples.length; index += 1) {
            const position = samples[index].position;
            minY = Math.min(minY, position.y);
            maxY = Math.max(maxY, position.y);

            if (index === 0) continue;
            const segmentDistance = Vector3.Distance(samples[index - 1].position, position);
            totalDistance += segmentDistance;
            if (segmentDistance > maxSegmentDistance) {
                const previousSample = samples[index - 1];
                const currentSample = samples[index];
                maxSegmentDistance = segmentDistance;
                maxSegment = {
                    fromIndex: previousSample.rigidBodyIndex,
                    fromName: previousSample.name,
                    toIndex: currentSample.rigidBodyIndex,
                    toName: currentSample.name,
                };
            }
        }

        return {
            totalDistance,
            rootTipDistance: Vector3.Distance(samples[0].position, samples[samples.length - 1].position),
            minY,
            maxY,
            maxSegmentDistance,
            maxSegment,
        };
    }

    private static roundDiagnosticNumber(value: number): number {
        if (!Number.isFinite(value)) return value;
        return Math.round(value * 1000) / 1000;
    }

    private static formatSegmentDiagnostic(segment: {
        fromIndex: number;
        fromName: string;
        toIndex: number;
        toName: string;
    } | null): string | null {
        if (!segment) return null;
        return `${segment.fromName}(${segment.fromIndex}) -> ${segment.toName}(${segment.toIndex})`;
    }

    private static formatJointVector(value: readonly [number, number, number]): string {
        return `[${value.map((component) => PhysicsModelController.roundDiagnosticNumber(component)).join(", ")}]`;
    }

    private static formatVector3(value: Vector3): string {
        return `[${[
            PhysicsModelController.roundDiagnosticNumber(value.x),
            PhysicsModelController.roundDiagnosticNumber(value.y),
            PhysicsModelController.roundDiagnosticNumber(value.z),
        ].join(", ")}]`;
    }

    private static formatJointVectorRange(
        min: readonly [number, number, number],
        max: readonly [number, number, number],
    ): string {
        return `${PhysicsModelController.formatJointVector(min)}..${PhysicsModelController.formatJointVector(max)}`;
    }

    public static captureWebmPhysicsModelSnapshot(
        model: PhysicsRuntimeModel,
        modelIndex: number,
        modelName: string,
    ): WebmPhysicsModelSnapshot | null {
        const rigidBodyCount = model.rigidBodyStates.length;
        if (rigidBodyCount === 0) return null;

        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel) return null;

        const rigidBodies = PhysicsModelController.captureBulletRigidBodies(physicsModel, rigidBodyCount)
            ?? PhysicsModelController.captureClassicRigidBodies(physicsModel, rigidBodyCount);
        if (!rigidBodies) return null;

        return {
            modelIndex,
            modelName,
            rigidBodyStates: Array.from(model.rigidBodyStates),
            rigidBodies,
        };
    }

    public static applyWebmPhysicsModelSnapshot(
        model: PhysicsRuntimeModel,
        snapshot: WebmPhysicsModelSnapshot,
    ): boolean {
        if (model.rigidBodyStates.length === 0) return false;
        if (snapshot.rigidBodyStates.length !== model.rigidBodyStates.length) return false;

        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel) return false;

        model.rigidBodyStates.set(snapshot.rigidBodyStates.map((state) => state ? 1 : 0));
        physicsModel.commitBodyStates?.(model.rigidBodyStates);

        const restored = PhysicsModelController.applyBulletRigidBodies(physicsModel, snapshot)
            || PhysicsModelController.applyClassicRigidBodies(physicsModel, snapshot);
        if (!restored) return false;

        physicsModel.syncBones?.();
        return true;
    }

    public static clearPendingPhysicsInitializations(runtime: PhysicsMmdRuntime): boolean {
        const runtimeInternal = runtime as unknown as PhysicsRuntimeWithInitializationQueues;
        let cleared = false;

        const clearSet = (setLike: PhysicsRuntimeInitializationSetLike | null | undefined): void => {
            if (typeof setLike?.clear !== "function") return;
            setLike.clear();
            cleared = true;
        };

        clearSet(runtimeInternal._needToInitializePhysicsModels);
        clearSet(runtimeInternal._needToInitializePhysicsModelsBuffer);
        clearSet(runtimeInternal._physicsRuntime?.initializer);
        return cleared;
    }

    private static captureBulletRigidBodies(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        rigidBodyCount: number,
    ): Array<WebmPhysicsRigidBodySnapshot | null> | null {
        const bulletModel = physicsModel as BulletPhysicsModelLike;
        const bundle = bulletModel._bundle;
        const indexMap = bulletModel._rigidBodyIndexMap;
        if (!bundle || !indexMap || typeof bundle.getTransformMatrixToRef !== "function") {
            return null;
        }

        const transform = Matrix.Identity();
        const linearVelocity = Vector3.Zero();
        const angularVelocity = Vector3.Zero();
        const rigidBodies: Array<WebmPhysicsRigidBodySnapshot | null> = [];
        for (let rigidBodyIndex = 0; rigidBodyIndex < rigidBodyCount; rigidBodyIndex += 1) {
            const mappedIndex = indexMap[rigidBodyIndex];
            if (!Number.isInteger(mappedIndex) || mappedIndex < 0 || mappedIndex >= bundle.count) {
                rigidBodies.push(null);
                continue;
            }

            bundle.getTransformMatrixToRef(mappedIndex, transform);
            linearVelocity.set(0, 0, 0);
            angularVelocity.set(0, 0, 0);
            bundle.getLinearVelocityToRef?.(mappedIndex, linearVelocity);
            bundle.getAngularVelocityToRef?.(mappedIndex, angularVelocity);
            rigidBodies.push({
                transformMatrix: Array.from(transform.m),
                linearVelocity: PhysicsModelController.vectorToTuple(linearVelocity),
                angularVelocity: PhysicsModelController.vectorToTuple(angularVelocity),
            });
        }
        return rigidBodies;
    }

    private static captureClassicRigidBodies(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        rigidBodyCount: number,
    ): Array<WebmPhysicsRigidBodySnapshot | null> | null {
        const classicModel = physicsModel as ClassicPhysicsModelLike;
        const nodes = classicModel._nodes;
        const bodies = classicModel._bodies;
        if (!Array.isArray(nodes) || !Array.isArray(bodies)) {
            return null;
        }

        const transform = Matrix.Identity();
        const linearVelocity = Vector3.Zero();
        const angularVelocity = Vector3.Zero();
        const rigidBodies: Array<WebmPhysicsRigidBodySnapshot | null> = [];
        for (let rigidBodyIndex = 0; rigidBodyIndex < rigidBodyCount; rigidBodyIndex += 1) {
            const node = nodes[rigidBodyIndex] ?? null;
            const body = bodies[rigidBodyIndex] ?? node?.physicsBody ?? null;
            if (!node || !body) {
                rigidBodies.push(null);
                continue;
            }

            const nodeTransform = node.computeWorldMatrix?.(true)
                ?? body.transformNode?.computeWorldMatrix?.(true)
                ?? null;
            if (!nodeTransform) {
                rigidBodies.push(null);
                continue;
            }

            transform.copyFrom(nodeTransform);
            linearVelocity.set(0, 0, 0);
            angularVelocity.set(0, 0, 0);
            body.getLinearVelocityToRef?.(linearVelocity);
            body.getAngularVelocityToRef?.(angularVelocity);
            rigidBodies.push({
                transformMatrix: Array.from(transform.m),
                linearVelocity: PhysicsModelController.vectorToTuple(linearVelocity),
                angularVelocity: PhysicsModelController.vectorToTuple(angularVelocity),
            });
        }
        return rigidBodies;
    }

    private static applyBulletRigidBodies(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        snapshot: WebmPhysicsModelSnapshot,
    ): boolean {
        const bulletModel = physicsModel as BulletPhysicsModelLike;
        const bundle = bulletModel._bundle;
        const indexMap = bulletModel._rigidBodyIndexMap;
        if (!bundle || !indexMap) return false;

        const transform = Matrix.Identity();
        const linearVelocity = Vector3.Zero();
        const angularVelocity = Vector3.Zero();
        let restoredCount = 0;
        for (let rigidBodyIndex = 0; rigidBodyIndex < snapshot.rigidBodies.length; rigidBodyIndex += 1) {
            const bodySnapshot = snapshot.rigidBodies[rigidBodyIndex];
            const mappedIndex = indexMap[rigidBodyIndex];
            if (!bodySnapshot || !Number.isInteger(mappedIndex) || mappedIndex < 0 || mappedIndex >= bundle.count) {
                continue;
            }

            Matrix.FromArrayToRef(bodySnapshot.transformMatrix, 0, transform);
            if (typeof bundle.setDynamicTransformMatrix === "function") {
                bundle.setDynamicTransformMatrix(mappedIndex, transform, true);
            } else {
                bundle.setTransformMatrix?.(mappedIndex, transform);
            }
            bundle.setTransformMatrix?.(mappedIndex, transform);
            PhysicsModelController.tupleToVector(bodySnapshot.linearVelocity, linearVelocity);
            PhysicsModelController.tupleToVector(bodySnapshot.angularVelocity, angularVelocity);
            bundle.setLinearVelocity?.(mappedIndex, linearVelocity, true);
            bundle.setAngularVelocity?.(mappedIndex, angularVelocity, true);
            restoredCount += 1;
        }
        if (bundle.needToCommit === true) {
            bundle.commitToWasm?.();
        }
        bundle.updateBufferedMotionStates?.(true);
        return restoredCount > 0;
    }

    private static applyClassicRigidBodies(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        snapshot: WebmPhysicsModelSnapshot,
    ): boolean {
        const classicModel = physicsModel as ClassicPhysicsModelLike;
        const nodes = classicModel._nodes;
        const bodies = classicModel._bodies;
        if (!Array.isArray(nodes) || !Array.isArray(bodies)) return false;

        const transform = Matrix.Identity();
        const scaling = Vector3.One();
        const rotation = Quaternion.Identity();
        const position = Vector3.Zero();
        const linearVelocity = Vector3.Zero();
        const angularVelocity = Vector3.Zero();
        let restoredCount = 0;
        for (let rigidBodyIndex = 0; rigidBodyIndex < snapshot.rigidBodies.length; rigidBodyIndex += 1) {
            const bodySnapshot = snapshot.rigidBodies[rigidBodyIndex];
            const node = nodes[rigidBodyIndex] ?? null;
            const body = bodies[rigidBodyIndex] ?? node?.physicsBody ?? null;
            if (!bodySnapshot || !node || !body) {
                continue;
            }

            Matrix.FromArrayToRef(bodySnapshot.transformMatrix, 0, transform);
            transform.decompose(scaling, rotation, position);
            node.scaling?.copyFrom(scaling);
            if (node.rotationQuaternion) {
                node.rotationQuaternion.copyFrom(rotation);
            } else {
                node.rotationQuaternion = rotation.clone();
            }
            node.position?.copyFrom(position);
            body.setTargetTransform?.(position, rotation);
            PhysicsModelController.tupleToVector(bodySnapshot.linearVelocity, linearVelocity);
            PhysicsModelController.tupleToVector(bodySnapshot.angularVelocity, angularVelocity);
            body.setLinearVelocity?.(linearVelocity);
            body.setAngularVelocity?.(angularVelocity);
            restoredCount += 1;
        }
        return restoredCount > 0;
    }

    private static vectorToTuple(value: PhysicsVectorLike): [number, number, number] {
        return [value.x, value.y, value.z];
    }

    private static tupleToVector(value: [number, number, number], target: Vector3): Vector3 {
        target.set(value[0], value[1], value[2]);
        return target;
    }

    public static beforeAndAfterPhysics(model: PhysicsRuntimeModel): void {
        const modelInternal = model as unknown as {
            beforePhysics?: (frameTime: number | null) => void;
            afterPhysics?: () => void;
        };
        modelInternal.beforePhysics?.(null);
        modelInternal.afterPhysics?.();
    }

    public static syncBodiesAfterExternalParent(model: PhysicsRuntimeModel): boolean {
        const modelInternal = model as unknown as {
            _physicsModel?: {
                syncBodies?: () => void;
            } | null;
        };
        const physicsModel = modelInternal._physicsModel;
        if (!physicsModel?.syncBodies) return false;
        const physicsModelObject = physicsModel as object;
        externalParentResyncPhysicsModels.add(physicsModelObject);
        try {
            physicsModel.syncBodies();
        } finally {
            externalParentResyncPhysicsModels.delete(physicsModelObject);
        }
        return true;
    }

    public static collectMeshesForCpuMorphSync(model: PhysicsRuntimeModel): readonly Mesh[] {
        const metadataMeshes = (model.mesh.metadata as { meshes?: readonly Mesh[] } | null)?.meshes;
        return Array.isArray(metadataMeshes)
            ? metadataMeshes
            : ([model.mesh, ...model.mesh.getChildMeshes()] as Mesh[]);
    }
}
