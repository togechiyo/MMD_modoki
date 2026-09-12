// Internal built-in Toon fragment; not an external material API v1 sample.
// @apply-without-toon
// Debug snippet: visualize the sampled diffuse texture alpha as grayscale.
// White = alpha 1, black = alpha 0. The output alpha is forced opaque so the
// mask itself can be inspected without transparent sorting hiding the result.

{
let debugAlpha=clamp(baseColor.a,0.0,1.0);
baseColor=vec4f(baseColor.rgb,1.0);
alpha=1.0;
toonFinalOverrideMix=1.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=vec3f(debugAlpha);
}
