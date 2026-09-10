import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AutomationDiagnosticHistory, AutomationError, automationFailureSchema, createAutomationDiagnostic, describeAutomationFailure, toAutomationFailure, validationDetails } from "../../src/automation/diagnostics";
import { buildAutomationTimelineTransform } from "../../src/automation/timeline-transform";

describe("MCP diagnostic boundary", () => {
    it.each(["EDITOR_TIMEOUT", "OPERATION_FAILED", "ACCESS_REVOKED", "UNDO_CONFLICT"])("does not claim unchanged state for %s", code => {
        const result = describeAutomationFailure(toAutomationFailure(new AutomationError(code)));
        expect(result.effects.state).toBe("unknown");
        expect(result.recovery.retrySameInput).toBe(false);
    });
    it("reports validation conflicts without exposing raw exceptions or unexpected fields", () => {
        const secret = "private model bytes and Bearer SECRET";
        expect(JSON.stringify(toAutomationFailure(new Error(secret)))).not.toContain(secret);
        const failure = toAutomationFailure(new AutomationError("KEY_COLLISION", { operationIndex: 2, frame: 30 }));
        expect(describeAutomationFailure(failure)).toMatchObject({ effects: { state: "none" }, error: { details: { operationIndex: 2, frame: 30 } }, recovery: { strategy: "correct_input" } });
        expect(automationFailureSchema.safeParse({ ...failure, details: { ...failure.details, model: secret } }).success).toBe(false);
        expect(toAutomationFailure(new AutomationError(secret)).code).toBe("OPERATION_FAILED");
    });
    it("returns bounded field diagnostics and numeric bounds without echoing strings or payloads", () => {
        const schema = z.object({ weight: z.number().max(1), name: z.string().max(1) }).strict();
        const value = { weight: 1.4, name: "SECRET" };
        const parsed = schema.safeParse(value);
        if (parsed.success) throw new Error("Expected validation error");
        const details = validationDetails(parsed.error, value);
        expect(details).toMatchObject({ field: "weight", actual: 1.4, maximum: 1 });
        expect(JSON.stringify(details)).not.toContain("SECRET");
        const tooMany = z.array(z.number()).safeParse(Array.from({ length: 50 }, () => "SECRET"));
        if (tooMany.success) throw new Error("Expected validation error");
        expect(toAutomationFailure(tooMany.error).details.issues).toHaveLength(16);
    });
    it("locates a failed correction before changing the source", () => {
        const track = { category: "morph" as const, name: "smile", frames: [10] };
        const payload = { kind: "morph" as const, weights: [0.7] };
        try {
            buildAutomationTimelineTransform({ kind: "model", modelInstanceId: "fixture" }, { action: "correct", keys: [{ track: { category: track.category, name: track.name }, frame: 10 }], correction: { kind: "morph", weight: { multiply: 2, add: 0 } } }, [track], () => payload);
            throw new Error("Expected refusal");
        } catch (error) {
            expect(toAutomationFailure(error)).toMatchObject({ code: "KEY_VALUE_OUT_OF_RANGE", details: { operationIndex: 0, frame: 10, field: "weights.0", actual: 1.4, maximum: 1 } });
        }
        expect(payload.weights).toEqual([0.7]);
    });
    it("bounds retained records, separates scenes and filters operations, and clears on revocation", () => {
        const history = new AutomationDiagnosticHistory();
        for (let i = 0; i < 60; i++) history.add(i < 30 ? 1 : 2, createAutomationDiagnostic(new AutomationError("EDITOR_BUSY"), { diagnosticId: String(i), tool: "mmd_set_camera", operationId: String(i % 2), timestamp: "time" }));
        expect(history.read(1, 50).items).toHaveLength(20);
        expect(history.read(2, 5, "1")).toMatchObject({ retainedMatchingCount: 15, truncated: true, capacity: 50 });
        expect(history.read(2, 5, "1").items[0].diagnosticId).toBe("59");
        history.clear();
        expect(history.read(2, 50).items).toEqual([]);
    });
});
