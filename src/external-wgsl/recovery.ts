import type { WgslRecoveryApi } from "./recovery-state";

export const wgslPermissionKey = "mmd_modoki.externalWgsl";
export const wgslRecoveryApi = (): WgslRecoveryApi | undefined => globalThis.window?.electronAPI?.wgslRecovery;
let blocked = false;
export function isWgslRecoveryBlocked(): boolean { return blocked; }
export function setWgslRecoveryBlocked(value: boolean): void {
    blocked = value;
    if (value) {
        try { localStorage.setItem(wgslPermissionKey, "false"); } catch { /* The in-memory latch still forbids execution. */ }
    }
}
/** Must run before editor/exporter managers restore any project assets. */
export async function initializeWgslRecovery(): Promise<boolean> {
    try { setWgslRecoveryBlocked((await wgslRecoveryApi()?.state())?.blocked ?? true); }
    catch { setWgslRecoveryBlocked(true); }
    return blocked;
}
