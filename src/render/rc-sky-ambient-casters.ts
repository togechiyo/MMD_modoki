/** Conservative model-level selection, independent of play/pause and export frame. */
export function isRcSkyAmbientStaticModel(input: {
    animationCount: number;
    dynamicPhysics: boolean;
    externalParent: boolean;
}): boolean {
    // A skeleton alone does not make a stage dynamic. Loaded motion and dynamic
    // physics do: their meshes receive sky but must not rebuild the static field.
    return input.animationCount === 0 && !input.dynamicPhysics && !input.externalParent;
}
