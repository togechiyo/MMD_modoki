// External material API v1 final-colour treatment; retains the host's shadow placement.
fn pastelFinish(input: ModokiFinalColor) -> vec3f {
    let color = max(input.color, vec3f(0.0));
    let luminance = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    let softColor = mix(vec3f(luminance), color, 0.72);
    let wash = mix(modokiInputs.ShadowColor, modokiInputs.PaperColor, smoothstep(0.02, 0.95, luminance));
    let pastel = softColor * 0.72 + wash * 0.28;
    return mix(input.color, pastel, modokiInputs.Strength);
}
