import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Scene } from "@babylonjs/core/scene";
import { registerPbrPresetToonTexture } from "../render/pbr-mmd-like-toon-settings";
import { retainModelTextures } from "./model-resource-lifetime";

it("releases cached model textures after the last material bank, including a dormant PBR toon", () => {
    const engine = new NullEngine();
    try {
        const scene = new Scene(engine);
        const texture = () => RawTexture.CreateRGBATexture(new Uint8Array([32, 64, 128, 255]), 1, 1, scene);
        const shared = texture();
        const globalOverride = texture();
        const normal = new StandardMaterial("normal", scene);
        normal.diffuseTexture = shared;
        const releaseNormal = retainModelTextures([normal]);
        const pbr = new PBRMaterial("pbr", scene);
        registerPbrPresetToonTexture(pbr, shared);
        const releasePbr = retainModelTextures([pbr]);
        normal.diffuseTexture = globalOverride;
        releaseNormal();
        releaseNormal();
        expect(scene.textures).toContain(shared);
        releasePbr();
        expect(scene.textures).not.toContain(shared);
        expect(scene.textures).toContain(globalOverride);
    } finally {
        engine.dispose();
    }
});
