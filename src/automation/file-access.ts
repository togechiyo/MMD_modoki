import { AutomationError } from "./diagnostics";
import type { AutomationOutput, AutomationPermission } from "./ui-operation-schema";

export async function assertAutomationPermission(permission: AutomationPermission): Promise<void> {
    const current = await window.electronAPI.automation.getState();
    if (!current.enabled || !current.editable || current.sessionId !== permission.sessionId || current.grant !== permission.grant) throw new AutomationError("ACCESS_REVOKED");
}

export async function saveAutomationBytes(input: AutomationOutput, permission: AutomationPermission): Promise<Record<string, unknown>> {
    const result = await window.electronAPI.automation.writeOutput(input, permission);
    if (result.status !== "saved") throw new AutomationError(result.code);
    return result;
}
