import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import type { IMmdMaterialProxy } from "babylon-mmd/esm/Runtime/IMmdMaterialProxy";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import { PbrMaterialProxy } from "./pbr-material-proxy";

// The runtime retains this bridge for its entire lifetime. Only its material
// delegate changes; bone/morph controllers and physics objects stay untouched.
const bridges = new WeakMap<Material, SwitchableMaterialProxy>();
export class SwitchableMaterialProxy implements IMmdMaterialProxy {
    private delegate: IMmdMaterialProxy;
    private readonly delegates = new WeakMap<Material, IMmdMaterialProxy>();

    constructor(material: Material, private readonly meshes: readonly Mesh[]) {
        this.delegate = this.createDelegate(material);
        bridges.set(material, this);
    }

    private createDelegate(material: Material): IMmdMaterialProxy {
        const delegate = material instanceof PBRMaterial
            ? new PbrMaterialProxy(material, this.meshes)
            : new MmdStandardMaterialProxy(material as MmdStandardMaterial, this.meshes);
        this.delegates.set(material, delegate);
        return delegate;
    }

    public static retarget(source: Material, target: Material, reset = true): void {
        const bridge = bridges.get(source);
        if (!bridge) throw new Error("Material morph bridge unavailable");
        bridge.delegate = bridge.delegates.get(target) ?? bridge.createDelegate(target);
        if (reset) {
            bridge.delegate.reset();
            bridge.delegate.applyChanges();
        }
        bridges.set(target, bridge);
    }

    public static rebase(material: Material): void {
        const bridge = bridges.get(material);
        if (bridge) bridge.delegate = bridge.createDelegate(material);
    }

    public static has(material: Material): boolean { return bridges.has(material); }
    public reset(): void { this.delegate.reset(); }
    public applyChanges(): void { this.delegate.applyChanges(); }
    public get diffuse() { return this.delegate.diffuse; }
    public get specular() { return this.delegate.specular; }
    public get ambient() { return this.delegate.ambient; }
    public get edgeColor() { return this.delegate.edgeColor; }
    public get shininess() { return this.delegate.shininess; }
    public set shininess(value: number) { this.delegate.shininess = value; }
    public get edgeSize() { return this.delegate.edgeSize; }
    public set edgeSize(value: number) { this.delegate.edgeSize = value; }
    public get textureMultiplicativeColor() { return this.delegate.textureMultiplicativeColor; }
    public get textureAdditiveColor() { return this.delegate.textureAdditiveColor; }
    public get sphereTextureMultiplicativeColor() { return this.delegate.sphereTextureMultiplicativeColor; }
    public get sphereTextureAdditiveColor() { return this.delegate.sphereTextureAdditiveColor; }
    public get toonTextureMultiplicativeColor() { return this.delegate.toonTextureMultiplicativeColor; }
    public get toonTextureAdditiveColor() { return this.delegate.toonTextureAdditiveColor; }
}
