import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import type { MmdPluginMaterial } from "babylon-mmd/esm/Loader/mmdPluginMaterial";
import type { RadianceEmissionReader } from "./luminous-radiance-scene";

/** Diffuse input only. Never sample the rendered color, emission, sphere or toon light. */
export function readRcDiffuseGiReflectance(mesh: Mesh, material: Material): ReturnType<RadianceEmissionReader> {
    if (!(material instanceof MmdStandardMaterial)) return null;
    const texture = material.diffuseTexture instanceof Texture ? material.diffuseTexture : null;
    if (material.diffuseTexture && !texture) return null;
    // These inputs cannot be represented by this first static UV/texture source.
    // Keep their triangles as blockers while contributing no guessed bounce color.
    if (mesh.useVertexColors && mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) return null;
    const plugin = material.pluginManager?.getPlugin<MmdPluginMaterial>("MmdMaterial");
    if (texture && plugin?.useTextureColor) {
        const multiply = plugin.textureMultiplicativeColor, add = plugin.textureAdditiveColor;
        if (multiply.r !== 1 || multiply.g !== 1 || multiply.b !== 1 || multiply.a !== 1
            || add.r !== 0 || add.g !== 0 || add.b !== 0 || add.a !== 0) return null;
    }
    const ambient = material.getScene().ambientColor;
    const level = texture?.level ?? 1;
    const linear = (diffuse: number, materialAmbient: number, sceneAmbient: number): number => {
        const base = diffuse + (material.applyAmbientColorToDiffuse ? materialAmbient * sceneAmbient : 0);
        return Math.min(1, Math.max(0, base)) ** 2.2 * Math.max(0, level) ** 2.2;
    };
    const diffuse = material.diffuseColor, localAmbient = material.ambientColor;
    return { r: linear(diffuse.r, localAmbient.r, ambient.r),
        g: linear(diffuse.g, localAmbient.g, ambient.g), b: linear(diffuse.b, localAmbient.b, ambient.b),
        texture };
}
