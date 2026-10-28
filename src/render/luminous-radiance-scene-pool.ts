import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { Scene } from "@babylonjs/core/scene";
import { LuminousRadianceScene, LuminousRadianceSceneSource, type RadianceEmissionReader } from "./luminous-radiance-scene";
import { beginLuminousRadianceFields } from "./luminous-radiance-field-pool";

type Entry = { source: LuminousRadianceSceneSource; consumers: number; lastExecution: number };
type GraphInputs = { execution: number; scenes: WeakMap<Scene, Map<RadianceEmissionReader, Entry>> };
const graphs = new WeakMap<FrameGraph, GraphInputs>();

function inputsFor(graph: FrameGraph): GraphInputs {
    let inputs = graphs.get(graph);
    if (!inputs) { inputs = { execution: 0, scenes: new WeakMap() }; graphs.set(graph, inputs); }
    return inputs;
}

// Scene/engine render IDs also change inside RTT and object-renderer tasks. Advance explicitly
// at the controller's graph boundary, including exports and multiple executions in one scene frame.
export function beginLuminousRadianceFrame(graph: FrameGraph): void {
    const inputs = graphs.get(graph);
    if (inputs) inputs.execution++;
    beginLuminousRadianceFields(graph);
}

export function acquireLuminousRadianceScene(graph: FrameGraph, scene: Scene, readEmission: RadianceEmissionReader): LuminousRadianceScene {
    const inputs = inputsFor(graph);
    let entries = inputs.scenes.get(scene);
    if (!entries) { entries = new Map(); inputs.scenes.set(scene, entries); }
    let entry = entries.get(readEmission);
    if (!entry) {
        entry = { source: new LuminousRadianceSceneSource(scene, readEmission), consumers: 0, lastExecution: -1 };
        entries.set(readEmission, entry);
    }
    const shared = entry, owners = entries;
    shared.consumers++;
    let released = false;
    return new LuminousRadianceScene(scene, readEmission, {
        source: shared.source,
        update: () => {
            if (released || shared.lastExecution === inputs.execution) return;
            // Execution zero primes texture readback before buildAsync. All-OFF execution epochs
            // do no work; the first active consumer prepares the current scene on demand.
            shared.source.update(); shared.lastExecution = inputs.execution;
        },
        release: () => {
            if (released) return;
            released = true;
            if (--shared.consumers === 0) {
                shared.source.dispose(); owners.delete(readEmission);
                if (owners.size === 0) inputs.scenes.delete(scene);
            }
        },
    });
}
