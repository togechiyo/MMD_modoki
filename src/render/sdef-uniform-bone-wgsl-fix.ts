export type SdefInjectorLike = {
    ProcessSdefCode: (shaderType: string, code: string) => string;
};

type EffectCreationOptionsLike = {
    attributes?: unknown;
    processCodeAfterIncludes?: (shaderType: string, code: string) => string;
};

type ShaderEngineLike = {
    createEffect: (...args: unknown[]) => unknown;
};

const INVALID_UNIFORM_BONE_INDEX_CAST = "uniforms.mBones[int(";
const WGSL_UNIFORM_BONE_INDEX_CAST = "uniforms.mBones[i32(";
const installedInjectors = new WeakSet<SdefInjectorLike>();
const installedEngines = new WeakSet<object>();

/**
 * babylon-mmd 1.2.0 emits the GLSL-style `int(...)` cast in the WGSL SDEF
 * uniform-bone branch. That branch becomes active when object motion blur
 * switches eligible skeletons away from bone textures.
 */
export function fixSdefUniformBoneWgsl(source: string): string {
    return source.replaceAll(
        INVALID_UNIFORM_BONE_INDEX_CAST,
        WGSL_UNIFORM_BONE_INDEX_CAST,
    );
}

/**
 * Installs a scoped compatibility wrapper around babylon-mmd's SDEF shader
 * injection. Keep this outside node_modules so dependency reinstalls retain the
 * workaround until the upstream shader is fixed.
 */
export function installSdefUniformBoneWgslFix(
    injector: SdefInjectorLike,
): boolean {
    if (installedInjectors.has(injector)) {
        return false;
    }

    const originalProcessSdefCode = injector.ProcessSdefCode;
    injector.ProcessSdefCode = (shaderType, code) => {
        const processed = originalProcessSdefCode(shaderType, code);
        return shaderType === "vertex"
            ? fixSdefUniformBoneWgsl(processed)
            : processed;
    };
    installedInjectors.add(injector);
    return true;
}

/**
 * Applies the same fix after every effect's include/custom-code processing.
 * babylon-mmd's standard material already defines SDEF, so its engine override
 * intentionally skips ProcessSdefCode; outline rendering can also retain the
 * original callback before ProcessSdefCode is patched. The engine boundary is
 * the common path that covers both cases.
 */
export function installSdefUniformBoneWgslEngineFix(engine: object): boolean {
    if (installedEngines.has(engine)) {
        return false;
    }

    const shaderEngine = engine as ShaderEngineLike;
    const originalCreateEffect = shaderEngine.createEffect;
    shaderEngine.createEffect = function patchedCreateEffect(
        this: unknown,
        ...args: unknown[]
    ): unknown {
        const options = args[1];
        if (options && typeof options === "object") {
            const effectOptions = options as EffectCreationOptionsLike;
            if ("attributes" in effectOptions) {
                const originalProcessCodeAfterIncludes =
                    effectOptions.processCodeAfterIncludes;
                effectOptions.processCodeAfterIncludes = (shaderType, code) => {
                    const processed = originalProcessCodeAfterIncludes
                        ? originalProcessCodeAfterIncludes(shaderType, code)
                        : code;
                    return shaderType === "vertex"
                        ? fixSdefUniformBoneWgsl(processed)
                        : processed;
                };
            }
        }
        return originalCreateEffect.apply(this, args);
    };
    installedEngines.add(engine);
    return true;
}
