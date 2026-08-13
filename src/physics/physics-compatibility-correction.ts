const FULLY_DAMPED_GRAVITY_SCALE_MIN = 0;
const DEFAULT_CORRECTION_AMOUNT = 1;

export function fullyDampedGravityScaleFromCorrectionAmount(value: number): number {
    const amount = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : DEFAULT_CORRECTION_AMOUNT;
    return 1 - amount * (1 - FULLY_DAMPED_GRAVITY_SCALE_MIN);
}
