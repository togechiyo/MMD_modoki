/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "MME Time Scan",
  "description": "TIMEとELAPSEDTIMEの編集同期あり・なしを比較。MODOKI_FRAMEは独自拡張として別に示す。",
  "hooks": { "finalColor": "shadeMmeTime" },
  "inputs": {
    "TimelineTime": { "type": "f32", "semantic": "TIME", "annotations": { "SyncInEditMode": true } },
    "PreviewTime": { "type": "f32", "semantic": "TIME", "annotations": { "SyncInEditMode": false } },
    "TimelineDelta": { "type": "f32", "semantic": "ELAPSEDTIME", "annotations": { "SyncInEditMode": true } },
    "PreviewDelta": { "type": "f32", "semantic": "ELAPSEDTIME", "annotations": { "SyncInEditMode": false } },
    "Frame": { "type": "f32", "semantic": "MODOKI_FRAME" }
  },
  "parameters": {
    "Clock": { "type": "u32", "default": 0, "ui": { "label": "時計 0:タイムライン 1:停止中も進む", "min": 0, "max": 1, "step": 1 } },
    "DisplayMode": { "type": "u32", "default": 0, "ui": { "label": "表示 0:走査線 1:elapsed診断 2:フレーム縞", "min": 0, "max": 2, "step": 1 } },
    "Speed": { "type": "f32", "default": 0.7, "ui": { "label": "走査速度", "min": -3, "max": 3, "step": 0.1 } },
    "PatternScale": { "type": "f32", "default": 1, "ui": { "label": "縞の細かさ", "min": 0.05, "max": 10, "step": 0.05 } },
    "Strength": { "type": "f32", "default": 0.85, "ui": { "label": "表示の強さ", "min": 0, "max": 1, "step": 0.05 } }
  }
}
*/

// TIMEは秒。編集同期ありではframe / 30。停止中にも進めたいときだけ同期なしを選ぶ。
fn shadeMmeTime(input: ModokiFinalColor) -> vec3f {
    let live = modokiInputs.Clock == 1u;
    let time = select(modokiInputs.TimelineTime, modokiInputs.PreviewTime, live);
    let delta = select(modokiInputs.TimelineDelta, modokiInputs.PreviewDelta, live);
    let height = input.surface.positionWS.y * modokiInputs.PatternScale;
    let phase = height - time * modokiInputs.Speed;
    let distance = abs(fract(phase - 0.5) - 0.5);
    let aa = max(fwidth(phase), 0.005);
    let scan = 1.0 - smoothstep(0.06, 0.06 + aa, distance);
    let waveColour = vec3f(0.3, 0.65, 0.7) + 0.3 * cos(vec3f(time) + vec3f(0.0, 2.0, 4.0));
    var result = input.color * 0.55 + waveColour * (0.1 + scan * 0.9);
    if (modokiInputs.DisplayMode == 1u) {
        // ELAPSEDTIMEは累積時間ではない。逆シークなら負、停止なら0になり得る。
        // 値を積算せず、今回の更新量を色にするだけの診断表示。
        let directionColour = select(vec3f(0.05, 0.85, 1.0), vec3f(1.0, 0.15, 0.08), delta < 0.0);
        result = vec3f(0.04) + directionColour * clamp(abs(delta) * 30.0, 0.0, 1.0);
    } else if (modokiInputs.DisplayMode == 2u) {
        // MODOKI_FRAMEはMME互換名ではなく独自拡張。1frameずつ縞を進める。
        let stripe = step(0.5, fract(height + floor(modokiInputs.Frame) / 30.0));
        result = mix(vec3f(0.08, 0.15, 0.3), vec3f(1.0, 0.55, 0.1), stripe);
    }
    // 静止画出力では両時計とも出力frameの時刻、両deltaとも0へ固定される。
    // 動画も出力schedulerの時間を使う。実時間を積算して出力結果を変えない。
    return mix(input.color, result, modokiInputs.Strength);
}
