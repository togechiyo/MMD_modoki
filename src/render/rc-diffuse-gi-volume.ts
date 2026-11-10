import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { readRcDiffuseGiReflectance } from "./rc-diffuse-gi-source";
import type { RcDiffuseGiVolume } from "./rc-diffuse-gi-settings";
import { fitRadianceReceiverVolume, getRadianceReceiverVolumeMembership } from "./radiance-receiver-volume";

function receivesDiffuseBounce(mesh: Mesh, material: Material | null, acceptsMaterial: (material: Material) => boolean): material is Material {
    if (!material || !acceptsMaterial(material)) return false;
    const reflectance = readRcDiffuseGiReflectance(mesh, material);
    // A black surface still participates in scene occlusion, but cannot
    // receive a visible diffuse bounce and need not dilute the probe grid.
    return !reflectance || reflectance.r > 0 || reflectance.g > 0 || reflectance.b > 0;
}

/** Track changes to receiving surfaces without reading vertices or following every pose. */
export function getRcDiffuseGiVolumeMembership(meshes: readonly Mesh[], acceptsMaterial: (material: Material) => boolean): string {
    return getRadianceReceiverVolumeMembership(meshes, (mesh, material) => receivesDiffuseBounce(mesh, material, acceptsMaterial));
}

/** Fit actual receiving vertices, not the loader's deliberately inflated culling bounds. */
export function fitRcDiffuseGiVolume(meshes: readonly Mesh[], acceptsMaterial: (material: Material) => boolean): RcDiffuseGiVolume | null {
    return fitRadianceReceiverVolume(meshes, (mesh, material) => receivesDiffuseBounce(mesh, material, acceptsMaterial));
}
