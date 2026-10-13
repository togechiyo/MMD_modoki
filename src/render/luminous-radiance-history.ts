import { RadianceInputSnapshot } from "./luminous-radiance-input-cache";

// Epochs travel in rgba32f alpha. Every integer through this ceiling is exact.
const MAX_EPOCH = 16777215;
export class LuminousRadianceHistory {
    public epoch = 0;
    public fieldIndex = 0;
    public previousFieldValid = false;
    private receiver: RadianceInputSnapshot | null = null;

    constructor(private readonly limit = MAX_EPOCH) {}

    public advanceField(): boolean {
        const reset = this.epoch >= this.limit;
        this.previousFieldValid = this.epoch > 0 && !reset;
        this.epoch = reset ? 1 : this.epoch + 1;
        this.fieldIndex = 1 - this.fieldIndex;
        if (reset) this.receiver = null;
        return reset;
    }

    public canReuseReceiver(parts: readonly ArrayLike<number>[]): boolean {
        if (this.receiver?.matches(parts)) return true;
        this.receiver = new RadianceInputSnapshot(parts);
        return false;
    }

    public reset(): void {
        this.epoch = 0; this.fieldIndex = 0; this.previousFieldValid = false; this.receiver = null;
    }
}
