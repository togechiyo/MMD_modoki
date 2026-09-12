export class WgslTimeoutError extends Error {
    constructor() { super("WGSL compilation timed out; external WGSL has been disabled"); }
}

/** The underlying GPU operation cannot be cancelled; only our wait is bounded. */
export async function beforeDeadline<T>(operation: Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
    if (performance.now() >= deadline) {
        void operation.catch(() => undefined); // A native promise can reject after we have stopped waiting.
        throw new WgslTimeoutError();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
        return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
            onAbort = () => reject(signal?.reason ?? new Error("WGSL compilation cancelled"));
            signal?.addEventListener("abort", onAbort, { once: true });
            if (signal?.aborted) onAbort();
            timer = setTimeout(() => reject(new WgslTimeoutError()), Math.max(0, deadline - performance.now()));
        })]);
    } finally {
        clearTimeout(timer);
        if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
}
