const FULLY_DAMPED_GRAVITY_SCALE_MIN = 0;
const EFFECTIVELY_FREE_LINEAR_AXIS_LIMIT = 100;

export const DEFAULT_PHYSICS_COMPATIBILITY_CORRECTION_AMOUNTS = {
    damping: 0,
    gravity: 1,
    massTowardUnit: 0,
} as const;

export type GravityCorrectionRigidBody = {
    physicsMode: number;
};

export type GravityCorrectionJoint = {
    type: number;
    rigidbodyIndexA: number;
    rigidbodyIndexB: number;
    positionMin: readonly [number, number, number];
    positionMax: readonly [number, number, number];
    springPosition: readonly [number, number, number];
};

export function fullyDampedGravityScaleFromCorrectionAmount(value: number): number {
    const amount = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : DEFAULT_PHYSICS_COMPATIBILITY_CORRECTION_AMOUNTS.gravity;
    return 1 - amount * (1 - FULLY_DAMPED_GRAVITY_SCALE_MIN);
}

export function collectFreeLinearSpringDynamicRigidBodyIndices(
    rigidBodies: readonly GravityCorrectionRigidBody[],
    joints: readonly GravityCorrectionJoint[],
    gravityAxis = 1,
): Set<number> {
    if (!Number.isInteger(gravityAxis) || gravityAxis < 0 || gravityAxis >= 3) return new Set<number>();
    const candidates = new Set<number>();
    for (const joint of joints) {
        if (joint.type !== 0) continue;
        const bodyA = rigidBodies[joint.rigidbodyIndexA];
        const bodyB = rigidBodies[joint.rigidbodyIndexB];
        if (!bodyA || !bodyB) continue;

        const dynamicBodyIndex = bodyA.physicsMode === 0 && bodyB.physicsMode !== 0
            ? joint.rigidbodyIndexB
            : bodyB.physicsMode === 0 && bodyA.physicsMode !== 0
                ? joint.rigidbodyIndexA
                : -1;
        if (dynamicBodyIndex < 0) continue;

        const lower = joint.positionMin[gravityAxis];
        const upper = joint.positionMax[gravityAxis];
        const spring = joint.springPosition[gravityAxis];
        if (
            Number.isFinite(lower)
            && Number.isFinite(upper)
            && Number.isFinite(spring)
            && lower <= -EFFECTIVELY_FREE_LINEAR_AXIS_LIMIT
            && upper >= EFFECTIVELY_FREE_LINEAR_AXIS_LIMIT
            && Math.abs(spring) > 1e-6
        ) {
            candidates.add(dynamicBodyIndex);
        }
    }
    return candidates;
}
