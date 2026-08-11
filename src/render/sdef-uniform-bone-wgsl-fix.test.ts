import { describe, expect, it } from "vitest";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import {
    fixSdefUniformBoneWgsl,
    installSdefUniformBoneWgslEngineFix,
    installSdefUniformBoneWgslFix,
    type SdefInjectorLike,
} from "./sdef-uniform-bone-wgsl-fix";

const INVALID_SDEF_UNIFORM_BONE_SOURCE = [
    "let transformMatrix0: mat4x4f=uniforms.mBones[int(vertexInputs.matricesIndices[0])];",
    "let transformMatrix1: mat4x4f=uniforms.mBones[int(vertexInputs.matricesIndices[1])];",
].join("\n");

describe("SDEF uniform-bone WGSL compatibility", () => {
    it("replaces every GLSL-style bone index cast with a WGSL i32 cast", () => {
        const fixed = fixSdefUniformBoneWgsl(
            INVALID_SDEF_UNIFORM_BONE_SOURCE,
        );

        expect(fixed).not.toContain("uniforms.mBones[int(");
        expect(fixed.match(/uniforms\.mBones\[i32\(/g)).toHaveLength(2);
    });

    it("patches injected vertex code without touching fragment code", () => {
        const injector: SdefInjectorLike = {
            ProcessSdefCode: (_shaderType, code) =>
                `${code}\n${INVALID_SDEF_UNIFORM_BONE_SOURCE}`,
        };

        expect(installSdefUniformBoneWgslFix(injector)).toBe(true);
        expect(injector.ProcessSdefCode("vertex", "fn main() {}"))
            .not.toContain("uniforms.mBones[int(");
        expect(injector.ProcessSdefCode("fragment", "fn main() {}"))
            .toContain("uniforms.mBones[int(");
        expect(installSdefUniformBoneWgslFix(injector)).toBe(false);
    });

    it("leaves already valid shader source unchanged", () => {
        const source =
            "let transformMatrix0=uniforms.mBones[i32(vertexInputs.matricesIndices[0])];";

        expect(fixSdefUniformBoneWgsl(source)).toBe(source);
    });

    it("fixes the WGSL emitted by the installed babylon-mmd SDEF injector", () => {
        installSdefUniformBoneWgslFix(SdefInjector);
        const injected = SdefInjector.ProcessSdefCode("vertex", [
            "#define CUSTOM_VERTEX_DEFINITIONS",
            "fn main() {",
            "finalWorld=finalWorld*influence;",
            "}",
        ].join("\n"));

        expect(injected).toContain("uniforms.mBones[i32(");
        expect(injected).not.toContain("uniforms.mBones[int(");
    });

    it("fixes standard-material and retained outline callbacks at the engine boundary", () => {
        const compiledSources: string[] = [];
        const engine = {
            createEffect: (_baseName: unknown, options: unknown) => {
                const processCodeAfterIncludes = (
                    options as {
                        processCodeAfterIncludes?: (
                            shaderType: string,
                            code: string,
                        ) => string;
                    }
                ).processCodeAfterIncludes;
                compiledSources.push(processCodeAfterIncludes
                    ? processCodeAfterIncludes(
                        "vertex",
                        INVALID_SDEF_UNIFORM_BONE_SOURCE,
                    )
                    : INVALID_SDEF_UNIFORM_BONE_SOURCE);
                return {};
            },
        };

        expect(installSdefUniformBoneWgslEngineFix(engine)).toBe(true);
        engine.createEffect("mmdStandard", { attributes: [] });
        engine.createEffect("mmdOutline", {
            attributes: [],
            processCodeAfterIncludes: (_shaderType: string, code: string) =>
                `${code}\n${INVALID_SDEF_UNIFORM_BONE_SOURCE}`,
        });

        expect(compiledSources).toHaveLength(2);
        for (const source of compiledSources) {
            expect(source).toContain("uniforms.mBones[i32(");
            expect(source).not.toContain("uniforms.mBones[int(");
        }
        expect(installSdefUniformBoneWgslEngineFix(engine)).toBe(false);
    });
});
