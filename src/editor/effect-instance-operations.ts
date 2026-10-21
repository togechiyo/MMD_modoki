import type { FrameGraphEffectInstances } from "./frame-graph-effect-instances";

export type EffectInstanceOperation = { action: "add" } | { action: "duplicate" | "suspend" | "resume" | "delete"; instanceId: string }
    | { action: "rename"; instanceId: string; label: string } | { action: "move"; instanceId: string; delta: -1 | 1 };

export function editEffectInstances(store: FrameGraphEffectInstances, operation: EffectInstanceOperation): void {
    if (operation.action === "add") { store.add(`fx-${crypto.randomUUID()}`); return; }
    const id = operation.instanceId;
    switch (operation.action) {
        case "duplicate": store.duplicate(id, `fx-${crypto.randomUUID()}`); break;
        case "suspend": store.suspend(id); break;
        case "resume": store.resume(id); break;
        case "delete": store.delete(id); break;
        case "rename": store.rename(id, operation.label); break;
        case "move": {
            const order = store.order(), index = order.indexOf(id), target = index + operation.delta;
            if (index < 0 || target < 0 || target >= order.length) return;
            [order[index], order[target]] = [order[target], order[index]];
            store.setOrder(order);
        }
    }
}
