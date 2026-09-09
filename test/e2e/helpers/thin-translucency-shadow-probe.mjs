import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { applyPbrMaterialShaderPreset } from "/src/render/pbr-mmd-like-toon-settings.ts";

export async function probeThinShadow(capture, zeroDepthBias = false) {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4),1,1,undefined,false,false);
  const scene = handle.getScene(); handle.dispose();
  const hidden = scene.meshes.filter(mesh => mesh.isEnabled() && mesh.getTotalVertices() > 0);
  const generators = scene.lights.flatMap(light => Array.from(light.getShadowGenerators()?.values() ?? []));
  const biases=generators.map(g=>g.bias);
  if(zeroDepthBias) generators.forEach(g=>{g.bias=0;});
  let mesh = CreateGround("thin-cloth-fixture", {width:4,height:4,subdivisions:64,updatable:true},scene);
  const p = mesh.getVerticesData("position"), normals = [];
  for(let i=0;i<p.length;i+=3) p[i+1]=0.15*Math.sin(p[i]*3)+0.08*Math.cos(p[i+2]*4);
  VertexData.ComputeNormals(p,mesh.getIndices(),normals);
  mesh.updateVerticesData("position",p); mesh.updateVerticesData("normal",normals);
  mesh.rotation.x=-Math.PI/2; mesh.position.y=1.5; mesh.receiveShadows=true;
  const material = new PBRMaterial("thin-cloth-fixture",scene);
  material.backFaceCulling=false; mesh.material=material;
  const other = mesh.clone("other-cloth");
  other.position.x=5;
  const otherMaterial = new PBRMaterial("other-cloth",scene);
  otherMaterial.backFaceCulling=false;
  applyPbrMaterialShaderPreset(otherMaterial,"pbr-cotton");
  other.material=otherMaterial;
  mesh = Mesh.MergeMeshes([mesh,other],true,true,undefined,false,true);
  mesh.receiveShadows=true;
  const multiMaterial = mesh.material;
  const captures=[];
  const blocker = CreateBox("thin-cloth-blocker", {width:1,height:1,depth:0.1},scene);
  blocker.position.set(0,1.5,0.8); blocker.setEnabled(false);
  try {
    hidden.forEach(mesh=>mesh.setEnabled(false));
    for(const preset of ["pbr-thin-translucent","pbr-cotton"]) {
      applyPbrMaterialShaderPreset(material,preset);
      for(const caster of [true,false]) {
        generators.forEach(g=>caster?g.addShadowCaster(mesh):g.removeShadowCaster(mesh));
        await scene.whenReadyAsync();
        for(let i=0;i<12;i++) await new Promise(r=>requestAnimationFrame(r));
        captures.push(await capture(`${preset}-${caster?"self-shadow":"no-self-shadow"}`));
      }
    }
    applyPbrMaterialShaderPreset(material,"pbr-thin-translucent");
    blocker.setEnabled(true);
    generators.forEach(g=>{ g.addShadowCaster(mesh); g.addShadowCaster(blocker); });
    await scene.whenReadyAsync();
    for(let i=0;i<12;i++) await new Promise(r=>requestAnimationFrame(r));
    captures.push(await capture("thin-external-shadow"));
    return captures;
  } finally {
    generators.forEach(g=>{g.removeShadowCaster(mesh);g.removeShadowCaster(blocker);});
    otherMaterial.dispose(); multiMaterial.dispose();
    generators.forEach((g,i)=>{g.bias=biases[i];});
    blocker.dispose();
    mesh.dispose(); material.dispose(); hidden.forEach(mesh=>mesh.setEnabled(true));
  }
}
