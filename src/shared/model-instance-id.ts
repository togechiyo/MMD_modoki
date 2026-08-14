export type ModelInstanceId = string;

const MODEL_INSTANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function normalizeModelInstanceId(value: unknown): ModelInstanceId | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return MODEL_INSTANCE_ID_PATTERN.test(normalized) ? normalized : null;
}

export function createModelInstanceId(): ModelInstanceId {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    if (randomUuid) return randomUuid;
    return `model-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createUniqueModelInstanceId(existingIds: ReadonlySet<string>): ModelInstanceId {
    let candidate = createModelInstanceId();
    while (existingIds.has(candidate)) candidate = createModelInstanceId();
    return candidate;
}
