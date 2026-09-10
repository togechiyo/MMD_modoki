import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";

type MaskedMesh = { source: SubMesh[]; hidden: SubMesh[] };

/** Exclude hidden draw ranges without changing geometry, alpha, or morph state. */
export class MaterialVisibilityController {
    private readonly masked = new WeakMap<AbstractMesh, MaskedMesh>();
    private readonly observed = new WeakSet<AbstractMesh>();

    public sync(meshes: readonly AbstractMesh[], isVisible: (material: object) => boolean): void {
        for (const mesh of meshes) {
            if (mesh.isDisposed()) continue;
            const previous = this.masked.get(mesh);
            const source = previous?.source ?? mesh.subMeshes;
            if (!source?.length) continue;
            const material = mesh.material;
            const visible = source.filter(subMesh => {
                const target = material instanceof MultiMaterial
                    ? material.subMaterials[subMesh.materialIndex] : material;
                return !target || isVisible(target);
            });
            // Preset/pipeline changes while hidden did not visit these ranges.
            // Reset each range when it returns, including a partial restoration.
            for (const subMesh of previous?.hidden ?? []) {
                if (visible.includes(subMesh)) subMesh.resetDrawCache();
            }
            if (visible.length === source.length) {
                if (previous) {
                    mesh.subMeshes = source;
                    this.masked.delete(mesh);
                }
            } else {
                mesh.subMeshes = visible;
                this.masked.set(mesh, { source, hidden: source.filter(subMesh => !visible.includes(subMesh)) });
                if (!this.observed.has(mesh)) {
                    this.observed.add(mesh);
                    mesh.onDisposeObservable.addOnce(() => {
                        const state = this.masked.get(mesh);
                        if (!state) return;
                        // Mesh.dispose releases the visible ranges before this callback.
                        // Reattach each excluded range before SubMesh.dispose removes it.
                        for (const subMesh of state.hidden) {
                            mesh.subMeshes.push(subMesh);
                            subMesh.dispose(true);
                        }
                        this.masked.delete(mesh);
                    });
                }
            }
        }
    }
}
