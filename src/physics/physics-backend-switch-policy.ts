export function shouldDeferBulletBackendSwitch(
    runtimeMode: "classic" | "wasm",
    loadedModelCount: number,
): boolean {
    return runtimeMode === "classic" && loadedModelCount > 0;
}
