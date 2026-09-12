// MME風の行列入力でも、WGSLでは行列 * 列ベクトルの順で計算する。
fn mmeGridLine(cell: vec2f) -> f32 {
    let distance = abs(fract(cell - vec2f(0.5)) - vec2f(0.5));
    // cell内の距離を描画pixelの距離へ変換。斜面の線幅もおおむね揃う。
    let pixelDistance = distance / max(fwidth(cell), vec2f(0.00001));
    return 1.0 - smoothstep(modokiInputs.LineWidth * 0.5 - 0.5,
        modokiInputs.LineWidth * 0.5 + 0.5, min(pixelDistance.x, pixelDistance.y));
}

fn shadeMmeGrid(input: ModokiFinalColor) -> vec3f {
    // hookのpositionWSはworld座標。inverse WORLDでmesh側へ戻す。
    // スキニング前のrest座標ではなく、変形後のmesh座標になる。
    let local = modokiInputs.WorldInverse * vec4f(input.surface.positionWS, 1.0);
    // 法線をworld -> localへ戻す場合は、逆変換の逆転置 = transpose(World)。
    let localNormal = abs((transpose(modokiInputs.World) * vec4f(input.surface.normalWS, 0.0)).xyz);
    // 面に沿う2軸を選ぶ。UVがないモデルにも格子を描ける。
    var plane = local.xy;
    if (localNormal.x >= localNormal.y && localNormal.x >= localNormal.z) { plane = local.yz; }
    else if (localNormal.y >= localNormal.z) { plane = local.xz; }

    // WVPに入れるのはlocal座標。positionWSへそのまま掛けるとWORLDが二重になる。
    let clip = modokiInputs.WorldViewProjection * local;
    let ndc = clip.xy / max(abs(clip.w), 0.00001);
    // NDCのYは上向き、画像のYは下向き。VIEWPORTPIXELSIZEは幅・高さであり逆数ではない。
    let pixel = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * modokiInputs.ViewportSize;
    // fwidthを含む関数はpixel依存分岐の外で両方評価する。
    let objectLine = mmeGridLine(plane / modokiInputs.ObjectSpacing);
    let screenLine = mmeGridLine(pixel / modokiInputs.PixelSpacing);
    let screenSide = modokiInputs.DisplayMode == 1u
        || (modokiInputs.DisplayMode == 2u && pixel.x >= modokiInputs.ViewportSize.x * 0.5);
    let line = select(objectLine, screenLine, screenSide);
    let colour = select(vec3f(0.05, 0.95, 0.85), vec3f(1.0, 0.45, 0.1), screenSide);
    return mix(input.color, colour, line * modokiInputs.Strength);
}
