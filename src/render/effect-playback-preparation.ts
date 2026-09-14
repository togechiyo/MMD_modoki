/** Cancels a delayed start when pause, stop or project import supersedes it. */
export class EffectPlaybackPreparation {
    private revision = 0;
    public pending = false;

    cancel(): void {
        this.revision++;
        this.pending = false;
    }

    run(wait: () => Promise<boolean>, start: () => void, failed: () => void): void {
        const revision = ++this.revision;
        this.pending = true;
        const finish = (ready: boolean): void => {
            if (revision !== this.revision) return;
            this.pending = false;
            if (ready) start();
            else failed();
        };
        void wait().then(finish, () => finish(false));
    }
}
