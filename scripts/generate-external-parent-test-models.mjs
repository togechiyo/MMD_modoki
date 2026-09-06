import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "test", "fixtures", "external-parent");

const MATERIAL_FLAGS = {
    doubleSided: 0x01,
    groundShadow: 0x02,
    drawShadow: 0x04,
    receiveShadow: 0x08,
    toonEdge: 0x10,
};

const BONE_FLAGS = {
    rotatable: 0x0002,
    movable: 0x0004,
    visible: 0x0008,
    controllable: 0x0010,
    ik: 0x0020,
};

class PmxWriter {
    #chunks = [];

    uint8(value) {
        const buffer = Buffer.allocUnsafe(1);
        buffer.writeUInt8(value);
        this.#chunks.push(buffer);
    }

    int8(value) {
        const buffer = Buffer.allocUnsafe(1);
        buffer.writeInt8(value);
        this.#chunks.push(buffer);
    }

    uint16(value) {
        const buffer = Buffer.allocUnsafe(2);
        buffer.writeUInt16LE(value);
        this.#chunks.push(buffer);
    }

    int32(value) {
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeInt32LE(value);
        this.#chunks.push(buffer);
    }

    float32(value) {
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeFloatLE(value);
        this.#chunks.push(buffer);
    }

    bytes(values) {
        this.#chunks.push(Buffer.from(values));
    }

    vector(values) {
        for (const value of values) this.float32(value);
    }

    text(value) {
        const encoded = Buffer.from(value, "utf16le");
        this.int32(encoded.length);
        this.#chunks.push(encoded);
    }

    build() {
        return Buffer.concat(this.#chunks);
    }
}

function addFace(vertices, indices, positions, normal, uvs = [[0, 1], [1, 1], [1, 0], [0, 0]]) {
    const baseIndex = vertices.length;
    for (let index = 0; index < 4; index += 1) {
        vertices.push({ position: positions[index], normal, uv: uvs[index] });
    }
    indices.push(
        baseIndex, baseIndex + 1, baseIndex + 2,
        baseIndex, baseIndex + 2, baseIndex + 3,
    );
}

function createTofuModel() {
    const vertices = [];
    const bodyIndices = [];
    const halfWidth = 2;
    const halfDepth = 1.4;
    const height = 3;

    addFace(vertices, bodyIndices, [
        [-halfWidth, 0, halfDepth],
        [halfWidth, 0, halfDepth],
        [halfWidth, height, halfDepth],
        [-halfWidth, height, halfDepth],
    ], [0, 0, 1]);
    addFace(vertices, bodyIndices, [
        [halfWidth, 0, -halfDepth],
        [-halfWidth, 0, -halfDepth],
        [-halfWidth, height, -halfDepth],
        [halfWidth, height, -halfDepth],
    ], [0, 0, -1]);
    addFace(vertices, bodyIndices, [
        [-halfWidth, 0, -halfDepth],
        [-halfWidth, 0, halfDepth],
        [-halfWidth, height, halfDepth],
        [-halfWidth, height, -halfDepth],
    ], [-1, 0, 0]);
    addFace(vertices, bodyIndices, [
        [halfWidth, 0, halfDepth],
        [halfWidth, 0, -halfDepth],
        [halfWidth, height, -halfDepth],
        [halfWidth, height, halfDepth],
    ], [1, 0, 0]);
    addFace(vertices, bodyIndices, [
        [-halfWidth, height, halfDepth],
        [halfWidth, height, halfDepth],
        [halfWidth, height, -halfDepth],
        [-halfWidth, height, -halfDepth],
    ], [0, 1, 0]);
    addFace(vertices, bodyIndices, [
        [-halfWidth, 0, -halfDepth],
        [halfWidth, 0, -halfDepth],
        [halfWidth, 0, halfDepth],
        [-halfWidth, 0, halfDepth],
    ], [0, -1, 0]);

    const markerBaseIndex = vertices.length;
    vertices.push(
        { position: [-0.55, 1.05, halfDepth + 0.015], normal: [0, 0, 1], uv: [0, 1] },
        { position: [0.55, 1.05, halfDepth + 0.015], normal: [0, 0, 1], uv: [1, 1] },
        { position: [0, 2.15, halfDepth + 0.015], normal: [0, 0, 1], uv: [0.5, 0] },
    );
    const markerIndices = [markerBaseIndex, markerBaseIndex + 1, markerBaseIndex + 2];

    return {
        modelName: "外部親確認用・豆腐",
        englishModelName: "External Parent Test Tofu",
        comment: "外部親登録の確認用モデル。原点とセンターボーンは底面中央。正面は赤い三角側。",
        vertices,
        materialGroups: [
            {
                name: "豆腐",
                englishName: "Tofu",
                diffuse: [0.92, 0.9, 0.78, 1],
                ambient: [0.42, 0.4, 0.32],
                indices: bodyIndices,
            },
            {
                name: "正面マーカー",
                englishName: "Front Marker",
                diffuse: [0.9, 0.12, 0.08, 1],
                ambient: [0.5, 0.05, 0.03],
                indices: markerIndices,
                doubleSided: true,
                edge: false,
            },
        ],
    };
}

function createSssReferenceModel() {
    const vertices = [];
    const indices = [];
    // Closed ellipsoids: thick head and thin ears, with analytic outward normals.
    for (const [cx, cy, cz, rx, ry, rz] of [[0, 1.5, 0, 0.95, 1.05, 0.8], [-1.1, 1.6, 0, 0.4, 0.62, 0.06], [1.1, 1.6, 0, 0.4, 0.62, 0.06]]) {
        const offset = vertices.length;
        const rows = 32, columns = 64;
        for (let row = 0; row <= rows; row++) {
            const theta = row * Math.PI / rows;
            for (let col = 0; col <= columns; col++) {
                const phi = col * Math.PI * 2 / columns;
                const direction = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
                const normal = [direction[0] / rx, direction[1] / ry, direction[2] / rz];
                const length = Math.hypot(...normal);
                vertices.push({ position: [cx + rx * direction[0], cy + ry * direction[1], cz + rz * direction[2]], normal: normal.map(v => v / length), uv: [col / columns, row / rows] });
            }
        }
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const a = offset + row * (columns + 1) + col;
                const b = a + columns + 1;
                if (row > 0) indices.push(a, a + 1, b);
                if (row < rows - 1) indices.push(a + 1, b + 1, b);
            }
        }
    }
    return { modelName: "SSS厚み比較", englishModelName: "SSS thickness reference", comment: "独自生成の閉じた楕円体。厚い頭部と厚さ0.12の耳。",
        vertices, materialGroups: [
            { name: "頭", englishName: "Head", diffuse: [0.8, 0.65, 0.5, 1], ambient: [0, 0, 0], indices: indices.slice(0, indices.length / 3), edge: false },
            { name: "耳", englishName: "Ears", diffuse: [0.8, 0.65, 0.5, 1], ambient: [0, 0, 0], indices: indices.slice(indices.length / 3), edge: false },
        ] };
}

function createPlateModel(segmentCount = 16) {
    const vertices = [];
    const bodyIndices = [];
    const innerRadius = 3.4;
    const outerRadius = 5.2;
    const outerTopY = 0.38;
    const bottomY = -0.22;

    function addRing(radius, y, normalFactory) {
        const start = vertices.length;
        for (let index = 0; index < segmentCount; index += 1) {
            const angle = (index / segmentCount) * Math.PI * 2;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            vertices.push({
                position: [cosine * radius, y, sine * radius],
                normal: normalFactory(cosine, sine),
                uv: [(cosine + 1) / 2, (sine + 1) / 2],
            });
        }
        return start;
    }

    function addRingStrip(innerStart, outerStart, reverse = false) {
        for (let index = 0; index < segmentCount; index += 1) {
            const next = (index + 1) % segmentCount;
            const quad = reverse
                ? [innerStart + index, outerStart + index, outerStart + next, innerStart + next]
                : [innerStart + index, innerStart + next, outerStart + next, outerStart + index];
            bodyIndices.push(quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]);
        }
    }

    const topCenter = vertices.length;
    vertices.push({ position: [0, 0, 0], normal: [0, 1, 0], uv: [0.5, 0.5] });
    const innerTop = addRing(innerRadius, 0, () => [0, 1, 0]);
    for (let index = 0; index < segmentCount; index += 1) {
        const next = (index + 1) % segmentCount;
        bodyIndices.push(topCenter, innerTop + next, innerTop + index);
    }

    const slope = outerTopY / (outerRadius - innerRadius);
    const slopeNormalY = 1 / Math.sqrt(1 + slope * slope);
    const slopeNormalRadius = -slope * slopeNormalY;
    const innerRim = addRing(innerRadius, 0, (x, z) => [x * slopeNormalRadius, slopeNormalY, z * slopeNormalRadius]);
    const outerRim = addRing(outerRadius, outerTopY, (x, z) => [x * slopeNormalRadius, slopeNormalY, z * slopeNormalRadius]);
    addRingStrip(innerRim, outerRim);

    const outerSideTop = addRing(outerRadius, outerTopY, (x, z) => [x, 0, z]);
    const outerSideBottom = addRing(outerRadius, bottomY, (x, z) => [x, 0, z]);
    addRingStrip(outerSideTop, outerSideBottom);

    const bottomRing = addRing(outerRadius, bottomY, () => [0, -1, 0]);
    const bottomCenter = vertices.length;
    vertices.push({ position: [0, bottomY, 0], normal: [0, -1, 0], uv: [0.5, 0.5] });
    for (let index = 0; index < segmentCount; index += 1) {
        const next = (index + 1) % segmentCount;
        bodyIndices.push(bottomCenter, bottomRing + index, bottomRing + next);
    }

    const markerBaseIndex = vertices.length;
    vertices.push(
        { position: [-0.5, outerTopY + 0.015, 4.2], normal: [0, 1, 0], uv: [0, 1] },
        { position: [0.5, outerTopY + 0.015, 4.2], normal: [0, 1, 0], uv: [1, 1] },
        { position: [0, outerTopY + 0.015, 5.0], normal: [0, 1, 0], uv: [0.5, 0] },
    );
    const markerIndices = [markerBaseIndex, markerBaseIndex + 2, markerBaseIndex + 1];

    return {
        modelName: "外部親確認用・皿",
        englishModelName: "External Parent Test Plate",
        comment: "外部親登録の確認用モデル。原点とセンターボーンは皿の上面中央。正面は赤い三角側。",
        vertices,
        materialGroups: [
            {
                name: "皿",
                englishName: "Plate",
                diffuse: [0.62, 0.78, 0.92, 1],
                ambient: [0.22, 0.35, 0.5],
                indices: bodyIndices,
            },
            {
                name: "正面マーカー",
                englishName: "Front Marker",
                diffuse: [0.9, 0.12, 0.08, 1],
                ambient: [0.5, 0.05, 0.03],
                indices: markerIndices,
                doubleSided: true,
                edge: false,
            },
        ],
    };
}

function createDynamicFollowerModel() {
    const base = createTofuModel();
    return {
        ...base,
        modelName: "Dynamic External Parent Follower",
        englishModelName: "Dynamic External Parent Follower",
        comment: "Generated physics follower for external-parent E2E coverage",
        bones: [
            { name: "External Parent Root", englishName: "External Parent Root", parentBoneIndex: -1 },
            { name: "Physics Input", englishName: "Physics Input", parentBoneIndex: 0 },
            { name: "Camera Output", englishName: "Camera Output", parentBoneIndex: 1 },
        ],
        rigidBodies: [
            { name: "Physics Input", boneIndex: 1, physicsMode: 0 },
            { name: "Camera Output", boneIndex: 2, physicsMode: 1 },
        ],
        joints: [{
            name: "Horizontal Delay",
            rigidbodyIndexA: 0,
            rigidbodyIndexB: 1,
            positionMin: [-1000, -1000, -1000],
            positionMax: [1000, 1000, 1000],
            springPosition: [388, 388, 388],
        }],
    };
}

function createBodyCorrectionModel(scale, label) {
    const base = createTofuModel();
    const bone = (name, englishName, parentBoneIndex, position, options = {}) => ({
        name,
        englishName,
        parentBoneIndex,
        position: position.map((value) => value * scale),
        ...options,
    });
    return {
        ...base,
        modelName: `体格補正確認用・${label}`,
        englishModelName: `Body Correction ${label}`,
        comment: "PMX bind pose based body proportion correction E2E fixture",
        bones: [
            bone("センター", "Center", -1, [0, 10, 0]),
            bone("左足", "Left Leg", 0, [2, 10, 0]),
            bone("左ひざ", "Left Knee", 1, [2, 5, 0]),
            bone("左足首", "Left Ankle", 2, [2, 0, 0]),
            bone("左足ＩＫ", "Left Leg IK", 0, [2, 0, 0], {
                ik: { targetBoneIndex: 3, linkBoneIndices: [2, 1] },
            }),
            bone("右足", "Right Leg", 0, [-2, 10, 0]),
            bone("右ひざ", "Right Knee", 5, [-2, 5, 0]),
            bone("右足首", "Right Ankle", 6, [-2, 0, 0]),
            bone("右足ＩＫ", "Right Leg IK", 0, [-2, 0, 0], {
                ik: { targetBoneIndex: 7, linkBoneIndices: [6, 5] },
            }),
            bone("左腕", "Left Arm", 0, [3, 15, 0]),
            bone("左ひじ", "Left Elbow", 9, [7, 15, 0]),
            bone("左手首", "Left Wrist", 10, [10, 15, 0]),
            bone("右腕", "Right Arm", 0, [-3, 15, 0]),
            bone("右ひじ", "Right Elbow", 12, [-7, 15, 0]),
            bone("右手首", "Right Wrist", 13, [-10, 15, 0]),
        ],
    };
}

function writePmx(model) {
    const writer = new PmxWriter();
    const vertexIndexSize = model.vertices.length <= 255 ? 1 : 2;

    writer.bytes([0x50, 0x4d, 0x58, 0x20]);
    writer.float32(2.0);
    writer.uint8(8);
    writer.uint8(0); // UTF-16LE (required by the original MikuMikuDance)
    writer.uint8(0); // additional UV count
    writer.uint8(vertexIndexSize);
    writer.uint8(1); // texture index size
    writer.uint8(1); // material index size
    writer.uint8(1); // bone index size
    writer.uint8(1); // morph index size
    writer.uint8(1); // rigid body index size
    writer.text(model.modelName);
    writer.text(model.englishModelName);
    writer.text(model.comment);
    writer.text("Generated by MMD_modoki scripts/generate-external-parent-test-models.mjs");

    writer.int32(model.vertices.length);
    for (const vertex of model.vertices) {
        writer.vector(vertex.position);
        writer.vector(vertex.normal);
        writer.vector(vertex.uv);
        writer.uint8(0); // BDEF1
        writer.int8(0); // center bone
        writer.float32(1); // edge scale
    }

    const allIndices = model.materialGroups.flatMap((material) => material.indices);
    writer.int32(allIndices.length);
    for (const index of allIndices) {
        if (vertexIndexSize === 1) writer.uint8(index);
        else writer.uint16(index);
    }

    writer.int32(0); // textures
    writer.int32(model.materialGroups.length);
    for (const material of model.materialGroups) {
        writer.text(material.name);
        writer.text(material.englishName);
        writer.vector(material.diffuse);
        writer.vector([0.08, 0.08, 0.08]);
        writer.float32(12);
        writer.vector(material.ambient);
        let flags = MATERIAL_FLAGS.groundShadow | MATERIAL_FLAGS.drawShadow | MATERIAL_FLAGS.receiveShadow;
        if (material.doubleSided) flags |= MATERIAL_FLAGS.doubleSided;
        if (material.edge !== false) flags |= MATERIAL_FLAGS.toonEdge;
        writer.uint8(flags);
        writer.vector([0.08, 0.08, 0.08, 1]);
        writer.float32(material.edge === false ? 0 : 0.25);
        writer.int8(-1); // texture
        writer.int8(-1); // sphere texture
        writer.uint8(0); // sphere mode off
        writer.uint8(1); // shared toon
        writer.uint8(0); // toon01.bmp
        writer.text("Generated test material");
        writer.int32(material.indices.length);
    }

    const bones = model.bones ?? [
        { name: "センター", englishName: "Center", parentBoneIndex: -1 },
    ];
    writer.int32(bones.length);
    for (const bone of bones) {
        writer.text(bone.name);
        writer.text(bone.englishName);
        writer.vector(bone.position ?? [0, 0, 0]);
        writer.int8(bone.parentBoneIndex);
        writer.int32(0);
        const boneFlags = BONE_FLAGS.rotatable
            | BONE_FLAGS.movable
            | BONE_FLAGS.visible
            | BONE_FLAGS.controllable
            | (bone.ik ? BONE_FLAGS.ik : 0);
        writer.uint16(boneFlags);
        writer.vector([0, 1, 0]);
        if (bone.ik) {
            writer.int8(bone.ik.targetBoneIndex);
            writer.int32(40);
            writer.float32(4 * Math.PI / 180);
            writer.int32(bone.ik.linkBoneIndices.length);
            for (const linkBoneIndex of bone.ik.linkBoneIndices) {
                writer.int8(linkBoneIndex);
                writer.uint8(0);
            }
        }
    }

    writer.int32(0); // morphs
    writer.int32(1); // display frames
    writer.text("Root");
    writer.text("Root");
    writer.uint8(1);
    writer.int32(bones.length);
    for (let boneIndex = 0; boneIndex < bones.length; boneIndex += 1) {
        writer.uint8(0); // bone frame
        writer.int8(boneIndex);
    }

    const rigidBodies = model.rigidBodies ?? [];
    writer.int32(rigidBodies.length);
    for (const rigidBody of rigidBodies) {
        writer.text(rigidBody.name);
        writer.text(rigidBody.name);
        writer.int8(rigidBody.boneIndex);
        writer.uint8(0); // collision group
        writer.uint16(0); // keep overlapping control bodies from colliding
        writer.uint8(0); // sphere
        writer.vector([2, 0, 0]);
        writer.vector([0, 0, 0]);
        writer.vector([0, 0, 0]);
        writer.float32(1);
        writer.float32(1); // linear damping
        writer.float32(1); // angular damping
        writer.float32(0); // restitution
        writer.float32(0.5); // friction
        writer.uint8(rigidBody.physicsMode);
    }

    const joints = model.joints ?? [];
    writer.int32(joints.length);
    for (const joint of joints) {
        writer.text(joint.name);
        writer.text(joint.name);
        writer.uint8(0); // spring 6DoF
        writer.int8(joint.rigidbodyIndexA);
        writer.int8(joint.rigidbodyIndexB);
        writer.vector([0, 0, 0]);
        writer.vector([0, 0, 0]);
        writer.vector(joint.positionMin);
        writer.vector(joint.positionMax);
        writer.vector([Math.PI / 180, Math.PI / 180, Math.PI / 180]);
        writer.vector([0, 0, 0]);
        writer.vector(joint.springPosition);
        writer.vector([0, 0, 0]);
    }

    return writer.build();
}

function validateSourceGeometry(model) {
    for (const material of model.materialGroups) {
        assert.equal(material.indices.length % 3, 0, `${material.name}: index count must form triangles`);
        for (let index = 0; index < material.indices.length; index += 3) {
            const triangle = material.indices.slice(index, index + 3).map((vertexIndex) => {
                assert.ok(vertexIndex >= 0 && vertexIndex < model.vertices.length);
                return model.vertices[vertexIndex];
            });
            const [a, b, c] = triangle.map((vertex) => vertex.position);
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            const faceNormal = [
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0],
            ];
            const vertexNormal = triangle.reduce(
                (sum, vertex) => [
                    sum[0] + vertex.normal[0],
                    sum[1] + vertex.normal[1],
                    sum[2] + vertex.normal[2],
                ],
                [0, 0, 0],
            );
            const facing = faceNormal[0] * vertexNormal[0]
                + faceNormal[1] * vertexNormal[1]
                + faceNormal[2] * vertexNormal[2];
            assert.ok(facing > 0, `${model.englishModelName}/${material.englishName}: reversed triangle ${index / 3}`);
        }
    }
}

async function validateModel(PmxReader, filePath, model) {
    const data = await readFile(filePath);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const parsed = await PmxReader.ParseAsync(arrayBuffer);
    assert.equal(parsed.header.version, 2);
    assert.equal(parsed.header.encoding, 0);
    const expectedBones = model.bones ?? [{ name: "センター" }];
    assert.equal(parsed.header.modelName, model.modelName);
    assert.equal(parsed.bones.length, expectedBones.length);
    assert.deepEqual(parsed.bones.map((bone) => bone.name), expectedBones.map((bone) => bone.name));
    assert.deepEqual(parsed.bones[0].position, expectedBones[0].position ?? [0, 0, 0]);
    assert.equal(parsed.rigidBodies.length, model.rigidBodies?.length ?? 0);
    assert.equal(parsed.joints.length, model.joints?.length ?? 0);
    assert.ok(parsed.vertices.length > 0);
    assert.ok(parsed.indices.length > 0);
    assert.equal(
        parsed.materials.reduce((total, material) => total + material.indexCount, 0),
        parsed.indices.length,
    );
}

async function main() {
    await mkdir(outputDirectory, { recursive: true });
    const models = [
        ["tofu.pmx", createTofuModel()],
        ["sss-reference.pmx", createSssReferenceModel()],
        ["plate.pmx", createPlateModel()],
        ["dynamic-follower.pmx", createDynamicFollowerModel()],
        ["body-source.pmx", createBodyCorrectionModel(1, "Source")],
        ["body-target.pmx", createBodyCorrectionModel(2, "Target")],
    ];

    const vite = await createServer({
        root: repositoryRoot,
        appType: "custom",
        logLevel: "silent",
        server: { middlewareMode: true },
    });
    try {
        const { PmxReader } = await vite.ssrLoadModule(
            "/node_modules/babylon-mmd/esm/Loader/Parser/pmxReader.js",
        );
        for (const [fileName, model] of models) {
            validateSourceGeometry(model);
            const outputPath = path.join(outputDirectory, fileName);
            await writeFile(outputPath, writePmx(model));
            await validateModel(PmxReader, outputPath, model);
            console.log(`[test-model] generated and validated: ${path.relative(repositoryRoot, outputPath)}`);
        }
    } finally {
        await vite.close();
    }
}

await main();
