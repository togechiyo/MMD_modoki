// Play-of-colour approximation: stable 3D domains with different angular responses.
// Independent from TIME; a stationary camera/light leaves the stone stationary.
fn blackOpalUnit(v: vec3f) -> vec3f {
    return v * inverseSqrt(max(dot(v, v), 0.000001));
}

fn blackOpalHash(point: vec3f) -> vec3f {
    var p = fract(point * vec3f(0.1031, 0.1030, 0.0973));
    p += vec3f(dot(p, p.yxz + vec3f(33.33)));
    return fract((p.xxy + p.yzz) * p.zyx);
}

// Fixed 27-cell nearest-site search. xyz = seed, w = gap to the next domain.
fn blackOpalDomain(p: vec3f) -> vec4f {
    let cell = floor(p);
    var nearest = 100.0;
    var second = 100.0;
    var seed = vec3f(0.0);
    for (var z = -1; z <= 1; z++) {
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let id = cell + vec3f(f32(x), f32(y), f32(z));
                let candidate = blackOpalHash(id);
                let delta = id + vec3f(0.15) + candidate * 0.7 - p;
                let distance = dot(delta, delta);
                if (distance < nearest) { second = nearest; nearest = distance; seed = candidate; }
                else { second = min(second, distance); }
            }
        }
    }
    return vec4f(seed, sqrt(second) - sqrt(nearest));
}

fn shadeBlackOpal(input: ModokiFinalColor) -> vec3f {
    let s = input.surface;
    let local = (modokiInputs.WorldInverse * vec4f(s.positionWS, 1.0)).xyz;
    let domain = blackOpalDomain(local * modokiInputs.FlakeScale * vec3f(1.0, 1.45, 1.0));
    let normal = blackOpalUnit(s.normalWS);
    let view = blackOpalUnit(modokiInputs.CameraPosition - s.positionWS);
    let light = blackOpalUnit(-modokiInputs.LightDirection);
    let halfVector = blackOpalUnit(view + light);
    let axis = blackOpalUnit((transpose(modokiInputs.WorldInverse) * vec4f(domain.xyz * 2.0 - vec3f(1.0), 0.0)).xyz);
    let phase = dot(view, axis) * 0.9 + dot(light, axis) * 0.35 + domain.y * 2.0;
    let window = 0.5 + 0.5 * cos(phase * 6.2831853);
    let flash = pow(window, 2.0 / modokiInputs.FlashWidth);
    let hue = domain.x + dot(view, axis) * 0.28;
    let rainbow = vec3f(0.5) + 0.5 * cos(6.2831853 * (vec3f(hue) + vec3f(0.0, 0.3333, 0.6667)));
    let saturated = rainbow * rainbow;
    let aa = min(max(fwidth(domain.w), 0.01), 0.2);
    let flake = smoothstep(0.015, 0.07 + aa, domain.w);
    let body = modokiInputs.BodyColor * (0.5 + 0.5 * max(dot(normal, light), 0.0));
    let colour = saturated * flake * flash * modokiInputs.ColorStrength;
    let gloss = pow(max(dot(normal, halfVector), 0.0), 100.0) * 0.55;
    let rim = pow(1.0 - clamp(abs(dot(normal, view)), 0.0, 1.0), 4.0) * 0.12;
    return mix(input.color, body + colour + vec3f(gloss + rim), modokiInputs.Coating);
}
