// MME Time Scan
// TIMEとELAPSEDTIMEの編集同期あり・なしを比較。MODOKI_FRAMEは独自拡張として別に示す。

// ---- ここを編集: 見た目の調整 ----
// 時計 0:タイムライン 1:停止中も進む。目安0〜1。0u:タイムライン、1u:停止中も実時間。出力時はどちらも同期。
const CLOCK: u32 = 0u;
// 表示 0:走査線 1:elapsed診断 2:フレーム縞。目安0〜2。
const DISPLAY_MODE: u32 = 0u;
// 走査速度。目安-3〜3。秒あたりの位相量。0で停止、負数で逆方向。
const SPEED: f32 = 0.7;
// 縞の細かさ。目安0.05〜10。座標への倍率。大きいほど細かい。
const PATTERN_SCALE: f32 = 1.0;
// 表示の強さ。目安0〜1。0で元の色。
const STRENGTH: f32 = 0.85;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- アプリから受け取る入力（必要な項目だけ宣言） ----
struct EffectInputs {
    TIME: f32,
    TIME_UNSYNCED: f32,
    ELAPSEDTIME: f32,
    ELAPSEDTIME_UNSYNCED: f32,
    MODOKI_FRAME: f32,
};
var<uniform> effectInputs: EffectInputs;

// ---- 計算処理 ----
// TIMEは秒。編集同期ありではframe / 30。停止中にも進めたいときだけ同期なしを選ぶ。
fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    let live = CLOCK == 1u;
    let time = select(effectInputs.TIME, effectInputs.TIME_UNSYNCED, live);
    let delta = select(effectInputs.ELAPSEDTIME, effectInputs.ELAPSEDTIME_UNSYNCED, live);
    let height = input.surface.positionWS.y * PATTERN_SCALE;
    let phase = height - time * SPEED;
    let distance = abs(fract(phase - 0.5) - 0.5);
    let aa = max(fwidth(phase), 0.005);
    let scan = 1.0 - smoothstep(0.06, 0.06 + aa, distance);
    let waveColour = vec3f(0.3, 0.65, 0.7) + 0.3 * cos(vec3f(time) + vec3f(0.0, 2.0, 4.0));
    var result = input.color * 0.55 + waveColour * (0.1 + scan * 0.9);
    if (DISPLAY_MODE == 1u) {
        // ELAPSEDTIMEは累積時間ではない。逆シークなら負、停止なら0になり得る。
        // 値を積算せず、今回の更新量を色にするだけの診断表示。
        let directionColour = select(vec3f(0.05, 0.85, 1.0), vec3f(1.0, 0.15, 0.08), delta < 0.0);
        result = vec3f(0.04) + directionColour * clamp(abs(delta) * 30.0, 0.0, 1.0);
    } else if (DISPLAY_MODE == 2u) {
        // MODOKI_FRAMEはMME互換名ではなく独自拡張。1frameずつ縞を進める。
        let stripe = step(0.5, fract(height + floor(effectInputs.MODOKI_FRAME) / 30.0));
        result = mix(vec3f(0.08, 0.15, 0.3), vec3f(1.0, 0.55, 0.1), stripe);
    }
    // 静止画出力では両時計とも出力frameの時刻、両deltaとも0へ固定される。
    // 動画も出力schedulerの時間を使う。実時間を積算して出力結果を変えない。
    return mix(input.color, result, STRENGTH);
}
