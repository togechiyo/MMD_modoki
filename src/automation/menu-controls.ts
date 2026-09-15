import { z } from "zod";
import type { MmdManager } from "../mmd-manager";
import type { Control } from "./controls";
import { AutomationError } from "./diagnostics";

function control<T>(id: string, schema: z.ZodType<T>, read: (m: MmdManager) => T,
    write: (m: MmdManager, value: T) => void, unit: string,
    available: (m: MmdManager) => boolean = () => true): Control {
    return { id, schema, read, write: (m, value) => write(m, schema.parse(value)), unit, available };
}
const color = z.object({ r: z.number().min(0).max(1), g: z.number().min(0).max(1), b: z.number().min(0).max(1) }).strict();
const sky = z.object({ mode: z.enum(["solid", "gradient"]), topColor: color, bottomColor: color, brightness: z.number().min(0.25).max(2) }).strict();
const direction = z.object({ x: z.number().min(-100).max(100), y: z.number().min(-100).max(100), z: z.number().min(-100).max(100) }).strict();
const correctionAvailable = (m: MmdManager) => m.isPhysicsAvailable() && m.getFullyDampedRigidBodyCorrectionEnabled();

export const menuControls: readonly Control[] = [
    control("viewport.backgroundMode", z.enum(["white", "black", "checker"]), m => m.getBackgroundDisplayMode(), (m, v) => { m.setBackgroundDisplayMode(v); }, "mode"),
    control("viewport.skyStyle", sky, m => m.getSkydomeBackgroundStyle(), (m, v) => m.setSkydomeBackgroundStyle(v), "RGB 0..1; brightness multiplier"),
    control("runtime.fpsLimit", z.union([z.literal(0), z.literal(30), z.literal(60)]), m => m.getRenderFpsLimit() as 0 | 30 | 60, (m, v) => m.setRenderFpsLimit(v), "fps; 0=unlimited"),
    control("mirror.enabled", z.boolean(), m => m.mirroringFloorEnabled, (m, v) => { m.mirroringFloorEnabled = v; }, "boolean"),
    control("mirror.shape", z.enum(["square", "circle"]), m => m.mirroringFloorShape, (m, v) => { m.mirroringFloorShape = v; }, "shape"),
    control("mirror.reflectance", z.number().min(0).max(1), m => m.mirroringFloorReflectance, (m, v) => { m.mirroringFloorReflectance = v; }, "scalar"),
    control("mirror.size", z.number().int().min(1).max(500), m => m.mirroringFloorSize, (m, v) => { m.mirroringFloorSize = v; }, "meters"),
    control("mirror.height", z.number().min(-20).max(20), m => m.mirroringFloorHeight, (m, v) => { m.mirroringFloorHeight = v; }, "meters"),
    control("mirror.resolution", z.union([z.literal(256), z.literal(512), z.literal(1024), z.literal(2048)]), m => m.mirroringFloorResolution as 256 | 512 | 1024 | 2048, (m, v) => { m.mirroringFloorResolution = v; }, "pixels"),
    control("render.modelOrderMode", z.enum(["evaluated", "mmd-fixed"]), m => m.getMmdRenderOrderMode(), (m, v) => { m.setMmdRenderOrderMode(v); }, "mode", m => m.getLoadedModels().length === 0),
    control("render.coplanarCorrection", z.number().int().min(0).max(4), m => m.getMmdCoplanarDepthBiasStrength(), (m, v) => { m.setMmdCoplanarDepthBiasStrength(v); }, "level; 0=off"),
    control("shadow.mode", z.enum(["standard", "cascaded"]), m => m.shadowMode, (m, v) => {
        if (v === "cascaded" && !m.isCascadedShadowSupported()) throw new AutomationError("SETTING_UNAVAILABLE");
        m.shadowMode = v;
    }, "mode"),
    control("shadow.selfEdgeSoftness", z.number().min(0.005).max(0.1), m => m.selfShadowEdgeSoftness, (m, v) => { m.selfShadowEdgeSoftness = v; }, "scalar"),
    control("shadow.occlusionEdgeSoftness", z.number().min(0.005).max(0.1), m => m.occlusionShadowEdgeSoftness, (m, v) => { m.occlusionShadowEdgeSoftness = v; }, "scalar"),
    control("physics.gravityAcceleration", z.number().min(0).max(200), m => m.getPhysicsGravityAcceleration(), (m, v) => m.setPhysicsGravityAcceleration(v), "acceleration"),
    control("physics.gravityDirection", direction, m => m.getPhysicsGravityDirection(), (m, v) => m.setPhysicsGravityDirection(v.x, v.y, v.z), "direction"),
    control("physics.dampingCorrection", z.number().min(0).max(1), m => m.getFullyDampedRigidBodyDampingCorrectionAmount(), (m, v) => { m.setFullyDampedRigidBodyDampingCorrectionAmount(v); }, "scalar", correctionAvailable),
    control("physics.gravityCorrection", z.number().min(0).max(1), m => m.getFullyDampedRigidBodyGravityCorrectionAmount(), (m, v) => { m.setFullyDampedRigidBodyGravityCorrectionAmount(v); }, "scalar", correctionAvailable),
    control("physics.massCorrection", z.number().min(0).max(1), m => m.getAbnormalDynamicRigidBodyMassTowardUnit(), (m, v) => { m.setAbnormalDynamicRigidBodyMassTowardUnit(v); }, "scalar", correctionAvailable),
];
