import type { Mesh } from "@babylonjs/core/Meshes/mesh";

// Diagnostic receivers visualize fields but must not become blockers in either RC producer.
const receivers = new WeakSet<Mesh>();
export function markRadianceDiagnosticMesh(mesh: Mesh): void { receivers.add(mesh); }
export function isRadianceDiagnosticMesh(mesh: Mesh): boolean { return receivers.has(mesh); }
