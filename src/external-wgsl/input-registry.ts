import type { EffectInput } from "./contract";

/** Fixed author-facing field names; the runtime keeps its existing MME semantic resolver. */
export const effectInputRegistry: Readonly<Record<string, EffectInput>> = Object.fromEntries([
    ...["WORLD", "VIEW", "PROJECTION", "WORLDVIEW", "VIEWPROJECTION", "WORLDVIEWPROJECTION"].flatMap(base =>
        ["", "INVERSE", "TRANSPOSE", "INVERSETRANSPOSE"].map(suffix => [base + suffix,
            { type: "mat4x4f", semantic: base + suffix, annotations: { Object: base.includes("WORLD") ? "Geometry" : "Camera" } }])),
    ...([ ["DIFFUSE", "vec4f"], ["AMBIENT", "vec3f"], ["SPECULAR", "vec3f"], ["SPECULARPOWER", "f32"] ] as const)
        .map(([semantic, type]) => ["GEOMETRY_" + semantic, { type, semantic, annotations: { Object: "Geometry" } }]),
    ...["DIFFUSE", "DIRECTION"].map(semantic => ["LIGHT_" + semantic, { type: "vec3f", semantic, annotations: { Object: "Light" } }]),
    ["CAMERA_POSITION", { type: "vec3f", semantic: "POSITION", annotations: { Object: "Camera" } }],
    ...["TIME", "ELAPSEDTIME"].flatMap(semantic => [true, false].map(sync =>
        [semantic + (sync ? "" : "_UNSYNCED"), { type: "f32", semantic, annotations: { SyncInEditMode: sync } }])),
    ["MODOKI_FRAME", { type: "f32", semantic: "MODOKI_FRAME" }],
    ["VIEWPORTPIXELSIZE", { type: "vec2f", semantic: "VIEWPORTPIXELSIZE" }],
]);
