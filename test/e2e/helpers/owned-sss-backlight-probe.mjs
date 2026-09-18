import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

function scene() {
    const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
    const result = handle.getScene(); handle.dispose(); return result;
}
let originalRender;
let originalPbr;
export function isolatePbrDiffuse(enabled, component = "both") {
    if (enabled) {
        const target = scene().textures.find(item => item.name === "owned-sss-position");
        const materials = [...new Set(target.renderList.flatMap(mesh => mesh.subMeshes.map(sub => sub.getMaterial())))];
        originalPbr = materials.map(material => ({ material, environmentIntensity: material.environmentIntensity, specularIntensity: material.specularIntensity }));
        for (const { material } of originalPbr) {
            if (component === "environment-quarter") material.environmentIntensity *= 0.25;
            else {
                if (component !== "specular") material.environmentIntensity = 0;
                if (component !== "environment") material.specularIntensity = 0;
            }
        }
    } else {
        for (const { material, environmentIntensity, specularIntensity } of originalPbr) { material.environmentIntensity = environmentIntensity; material.specularIntensity = specularIntensity; }
        originalPbr = undefined;
    }
}
export function setTransmissionCapture(enabled) {
    const entry = scene().textures.find(item => item.name === "owned-sss-entry");
    if (!enabled) { originalRender = entry.customRenderFunction; entry.customRenderFunction = () => {}; }
    else { entry.customRenderFunction = originalRender; originalRender = undefined; }
}

export async function inspectBacklight() {
    const current = scene();
    const target = name => current.textures.find(item => item.name === `owned-sss-${name}`);
    const position = target("position"), entry = target("entry");
    const positions = await position.readPixels(), entries = await entry.readPixels();
    const normals = await target("normal").readPixels(), signals = await target("signal").readPixels();
    const numberAt = (data, i) => {
        if (!(data instanceof Uint16Array)) return data[i];
        const h = data[i], e = (h >> 10) & 31, m = h & 1023;
        return (h & 32768 ? -1 : 1) * (e === 0 ? 2 ** -14 * m / 1024 : 2 ** (e - 15) * (1 + m / 1024));
    };
    const camera = entry.activeCamera;
    const matrix = camera.getViewMatrix().multiply(camera.getProjectionMatrix());
    const light = current.lights.find(item => item.getClassName() === "DirectionalLight");
    const direction = light.direction.normalizeToNew();
    const size = entry.getSize();
    const materials = position.renderList.map(mesh => {
        const material = mesh.subMeshes[0]?.getMaterial();
        const plugin = material?.pluginManager?.getPlugin("OwnedSss");
        return { name: material?.name, albedo: material?.albedoColor?.asArray(), emissive: material?.emissiveColor?.asArray(),
            directIntensity: material?.directIntensity, light: plugin?.runtime.lightColor.asArray(), profile: plugin?.profile,
            surfaceId: plugin?.surfaceIds.get(mesh) };
    });
    const groups = {};
    for (let i = 0; i < positions.length; i += 4) {
        const id = positions[i + 3]; if (id <= 0) continue;
        const group = groups[id] ??= { pixels: 0, entryMissing: 0, below005: 0, below05: 0, sum: 0, min: Infinity, max: 0, backFacing: 0, signalSum: [0, 0, 0], backSignalSum: [0, 0, 0] };
        group.pixels++;
        const back = numberAt(normals, i) * direction.x + numberAt(normals, i + 1) * direction.y + numberAt(normals, i + 2) * direction.z > 0.5;
        if (back) group.backFacing++;
        for (let c = 0; c < 3; c++) { group.signalSum[c] += numberAt(signals, i + c); if (back) group.backSignalSum[c] += numberAt(signals, i + c); }
        const p = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
        const clip = Vector3.TransformCoordinates(p, matrix);
        const x = Math.floor((clip.x * 0.5 + 0.5) * size.width), y = Math.floor((clip.y * 0.5 + 0.5) * size.height);
        const offset = (y * size.width + x) * 4;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height || entries[offset + 3] < 0.5) { group.entryMissing++; continue; }
        const thickness = Math.max(0, Vector3.Dot(p, direction) - entries[offset] - 0.005);
        if (thickness < 0.05) group.below005++;
        if (thickness < 0.5) group.below05++;
        group.sum += thickness; group.min = Math.min(group.min, thickness); group.max = Math.max(group.max, thickness);
    }
    return { light: { direction: direction.asArray(), rgb: light.diffuse.asArray(), intensity: light.intensity, scaledIntensity: light.getScaledIntensity() }, groups, materials,
        entryMeshes: entry.renderList.map(mesh => ({ name: mesh.name, materials: mesh.subMeshes.map(sub => sub.getMaterial()?.name) })) };
}
