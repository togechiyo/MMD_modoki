import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { describe, expect, it } from "vitest";
import { SwitchableMaterialProxy } from "./switchable-material-proxy";

describe("switchable material morph bridge", () => {
    it("retargets a retained proxy and restores each material's unmorphed baseline", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const a = new PBRMaterial("a", scene);
            const b = new PBRMaterial("b", scene);
            a.albedoColor.set(0.2, 0.3, 0.4);
            b.albedoColor.set(0.7, 0.8, 0.9);
            const bridge = new SwitchableMaterialProxy(a, []);
            bridge.diffuse[0] = 0.5;
            bridge.applyChanges();
            SwitchableMaterialProxy.retarget(a, b);
            bridge.diffuse[0] += 0.1;
            bridge.applyChanges();
            expect(a.albedoColor.r).toBe(0.5);
            expect(b.albedoColor.r).toBeCloseTo(0.8);
            SwitchableMaterialProxy.retarget(b, a);
            bridge.reset();
            bridge.applyChanges();
            expect(a.albedoColor.r).toBe(0.2);
            expect(b.albedoColor.r).toBeCloseTo(0.8);
        } finally { scene.dispose(); engine.dispose(); }
    });
});
