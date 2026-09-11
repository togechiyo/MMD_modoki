import { z } from "zod";

export const webmFailureStageSchema = z.enum(["initializing", "loading-project", "checking-codec", "opening-output", "encoding", "closing-track", "finalizing", "finishing-job"]);
export const webmExportFailureSchema = z.object({
    code: z.enum(["VIDEO_EXPORT_FAILED", "VIDEO_ENCODER_UNAVAILABLE", "VIDEO_CODEC_UNSUPPORTED"]),
    details: z.object({ stage: webmFailureStageSchema, secureContext: z.boolean(), videoEncoderAvailable: z.boolean() }).strict(),
}).strict();
export type WebmExportFailure = z.infer<typeof webmExportFailureSchema>;

export class WebmCapabilityError extends Error {
    constructor(public readonly code: "VIDEO_ENCODER_UNAVAILABLE" | "VIDEO_CODEC_UNSUPPORTED") { super(code); }
}

/** Only fixed classifications and capability flags cross IPC/MCP; never exception text. */
export function describeWebmExportFailure(error: unknown, stage: string, secureContext: boolean, videoEncoderAvailable: boolean): WebmExportFailure {
    const parsed = webmFailureStageSchema.safeParse(stage);
    return { code: error instanceof WebmCapabilityError ? error.code : "VIDEO_EXPORT_FAILED",
        details: { stage: parsed.success ? parsed.data : "initializing", secureContext, videoEncoderAvailable } };
}
