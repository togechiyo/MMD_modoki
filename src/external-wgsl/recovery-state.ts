export type WgslRecoveryState = { blocked: boolean };
export type WgslRecoveryApi = {
    state: () => Promise<WgslRecoveryState>;
    allow: () => Promise<void>;
    arm: () => Promise<void>;
    disarm: () => Promise<void>;
    fail: () => Promise<void>;
    onBlocked: (listener: () => void) => () => void;
};

/** Main-process state: never let closing one window clear another window's crash marker. */
export class WgslRecoveryGuard {
    private readonly active = new Set<number>();
    public blocked: boolean;
    constructor(previousMarker: boolean, private readonly persist: (unsafe: boolean) => void, private readonly forced = false) {
        this.blocked = previousMarker || forced;
    }
    public isActive(id: number): boolean { return this.active.has(id); }
    public allow(): void {
        if (this.forced) throw new Error("External WGSL is disabled by --disable-external-wgsl; restart without this option to enable it");
        this.persist(this.active.size > 0);
        this.blocked = false;
    }
    public arm(id: number): void {
        if (this.blocked) throw new Error("External WGSL is disabled after a failure; enable it again in experimental settings");
        if (this.active.has(id)) return;
        this.persist(true); // Failure to record the marker must prevent shader execution.
        this.active.add(id);
    }
    public close(id: number): void {
        this.active.delete(id);
        this.persist(this.blocked || this.active.size > 0);
    }
    public fail(): void {
        this.blocked = true;
        this.persist(true);
    }
}
