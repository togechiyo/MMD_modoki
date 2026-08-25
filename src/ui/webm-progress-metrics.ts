export type WebmProgressSample = {
    encoded: number;
    total: number;
    timestampMs: number;
};

export type WebmProgressMetricsState = {
    jobId: string;
    samples: WebmProgressSample[];
};

export type WebmProgressMetrics = {
    state: WebmProgressMetricsState;
    framesPerSecond: number | null;
    etaSeconds: number | null;
};

const normalizeSample = (sample: WebmProgressSample): WebmProgressSample => ({
    encoded: Math.max(0, Math.floor(Number.isFinite(sample.encoded) ? sample.encoded : 0)),
    total: Math.max(0, Math.floor(Number.isFinite(sample.total) ? sample.total : 0)),
    timestampMs: Number.isFinite(sample.timestampMs) ? sample.timestampMs : Date.now(),
});

export function advanceWebmProgressMetrics(
    previous: WebmProgressMetricsState | null,
    jobId: string,
    nextSample: WebmProgressSample,
): WebmProgressMetrics {
    const sample = normalizeSample(nextSample);
    const existing = previous?.jobId === jobId ? previous.samples : [];
    const last = existing.at(-1);
    const samples = last?.encoded === sample.encoded
        ? [...existing.slice(0, -1), sample]
        : [...existing, sample];
    const windowStartMs = sample.timestampMs - 10_000;
    const recentSamples = samples
        .filter((entry) => entry.timestampMs >= windowStartMs)
        .slice(-12);
    const first = recentSamples[0];
    const elapsedSeconds = first ? (sample.timestampMs - first.timestampMs) / 1000 : 0;
    const encodedDelta = first ? sample.encoded - first.encoded : 0;
    const framesPerSecond = elapsedSeconds >= 0.25 && encodedDelta > 0
        ? encodedDelta / elapsedSeconds
        : null;
    const remainingFrames = Math.max(0, sample.total - sample.encoded);
    const etaSeconds = framesPerSecond && framesPerSecond > 0
        ? remainingFrames / framesPerSecond
        : null;

    return {
        state: { jobId, samples: recentSamples },
        framesPerSecond,
        etaSeconds,
    };
}

export function formatEtaSeconds(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "--";
    const rounded = Math.max(0, Math.round(seconds));
    if (rounded < 60) return `${rounded}s`;
    const minutes = Math.floor(rounded / 60);
    const remainingSeconds = rounded % 60;
    if (minutes < 60) return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}
