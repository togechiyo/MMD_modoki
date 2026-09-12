// Artistic schiller: a soft, blue subsurface-looking sheen, not volume scattering.
// No TIME input. The light follows the camera/light relationship, not a clock.
fn moonUnit(v: vec3f) -> vec3f {
    return v * inverseSqrt(max(dot(v, v), 0.000001));
}

fn shadeMoonstone(input: ModokiFinalColor) -> vec3f {
    let surface = input.surface;
    let p = (modokiInputs.WorldInverse * vec4f(surface.positionWS, 1.0)).xyz;
    let normal = moonUnit(surface.normalWS);
    let view = moonUnit(modokiInputs.CameraPosition - surface.positionWS);
    let light = moonUnit(-modokiInputs.LightDirection);
    let halfVector = moonUnit(view + light);
    let tilt = (transpose(modokiInputs.WorldInverse) * vec4f(modokiInputs.LayerTilt, 0.0)).xyz;
    let layeredNormal = moonUnit(normal + tilt);
    let facing = clamp(abs(dot(normal, view)), 0.0, 1.0);
    let ndl = max(dot(normal, light), 0.0);

    let cloud = 0.5 + 0.5 * sin(p.x * 2.3 + sin(p.y * 1.7) + p.z * 1.2);
    let body = modokiInputs.BodyColor * (0.34 + 0.48 * ndl) * mix(0.92, 1.0, cloud);
    let alignment = max(dot(layeredNormal, halfVector), 0.0);
    let broad = pow(alignment, 3.0 / modokiInputs.SheenWidth);
    let center = pow(alignment, 12.0 / modokiInputs.SheenWidth);
    let sheen = modokiInputs.SheenColor * broad + vec3f(0.45, 0.65, 0.9) * center * 0.3;
    let specular = pow(max(dot(normal, halfVector), 0.0), 90.0) * 0.32;
    let rim = pow(1.0 - facing, 3.0) * 0.16;
    let stone = body + sheen * modokiInputs.SheenStrength + vec3f(specular + rim);
    return mix(input.color, stone, modokiInputs.Coating);
}
