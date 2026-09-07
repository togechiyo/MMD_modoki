type OutlineMaterial = { renderOutline: boolean };

/** Keep MMD's after-mesh outline pass out of geometry data captures. */
export function withoutMmdOutlines<T>(materials: readonly object[], render: () => T): T {
    const restored: OutlineMaterial[] = [];
    try {
        for (const material of materials) {
            if (!("renderOutline" in material) || material.renderOutline !== true) continue;
            const outlined = material as OutlineMaterial;
            restored.push(outlined);
            outlined.renderOutline = false;
        }
        return render();
    } finally {
        for (const material of restored) material.renderOutline = true;
    }
}
