# 光色100%超過時のv0.2.0比較

## 調査対象

所有者の「デフォルト値以上で照明の加算方式が変わった気がする」という報告を受け、`v0.2.0`（`83e749c`、2026-07-06）と`80eb731`を比較した。コード・履歴の調査であり、所有者モデルの読込や旧版との実画像比較は行っていない。調査後の所有者指示による修正は末尾に記す。以下の「現行」は修正前の`80eb731`を指す。

## 確定した変更

`84afdf4`（2026-07-20、Add experimental PBR materials and environment lighting）が、`src/scene/light-shadow-controller.ts`の`applyLightColorTemperature`を変更している。

- v0.2.0: `dirLight.diffuse = 色温度RGB × min(1, 光色RGB)`。
- 現行: `dirLight.diffuse = 色温度RGB × clamp(光色RGB, 0, 2)`。

PBR導入時の拡張が共通方向ライトに適用されており、PBR限定の分岐はない。100%以下の通常入力は同じだが、100%超過分は現在、通常の直接照明にも入る。

一方、`src/mmd-manager.ts`の標準Toon補正と`wgsl/toon_balanced_default.wgsl`の超過分加算は残っている。後者はv0.2.0から差分なし。前者の`lightBoost = max(lightTint - 1, 0)`、加算mask・加算色の係数、最終色への加算式も一致し、既定のflatStrength=0、colorInfluence=0.35も同じ。

したがって、このToon加算を使う経路では、RGBを150%にしたとき「通常光100%相当＋超過分加算」だった構造が「通常光150%相当＋同じ超過分加算」になった。実際の最終画素は材質・影・clamp・PostFXに依存するが、100%超過時の明るさや色の乗り方が変わる有力な原因である。加算mask外でも直接照明の増分は影響し得る。

この差は直前の全体ON/OFF実装より前から存在し、v0.2.1タグ（2026-07-17）時点ではまだ入っていない。

## 「照度」スライダーの場合

照度は光色RGBと別である。v0.2.0も現行も通常の有限値は0..2、既定1で、方向ライトへ乗算される。PBR導入時に上限4へ拡張されたが、`8fc06d3`（2026-08-02）で2へ戻った。光色の100%clampは戻っていない。

現行ではメイン照度がPBRの環境光にも乗算される。`combineEnvironmentLightingAndIlluminance`と`MmdManager.lightIntensity` setterを参照。PBRでは影側の明るさも同時に変わる追加要因となる。

## 比較の境界と次の切り分け

- lockfileのBabylon.js coreは両方9.2.0、babylon-mmdは両方1.2.0。今回見つかった差は依存更新ではなくアプリ側の処理変更。
- 異なる材質プリセットのシェーダー、露出・Gamma・全体OFF、影設定が異なる場合は、同一の画像差とは断定しない。
- 旧挙動へ戻すなら、まずMMD材質の100%超過分を通常光へ入れるかを決める。共通方向ライトを一律に戻すとPBRにも影響するため、PBRとの分離を含めた修正範囲の検討が必要。

関連: [PBR導入メモ](./pbr-material-mode-experiment-2026-07-20.md)、[環境光と照度](./external-hdri-environment-lighting-2026-07-21.md)。

## 採用した修正

所有者は「影側に加算が乗るのは避けたい、影色は別に指定している」とし、材質単位の大きな分離ではなく、当面はモードごとの切替を指定した。混合モードの個別補償は実装しない。

- 通常MMD: 方向ライトへ渡すRGBを各チャンネル最大1に戻す。入力・保存値は0..2を維持し、従来の明部マスク付き超過分加算も維持する。
- PBR: 方向ライトRGBは最大2のまま。
- 既存のpipeline設定は次回import用であり、projectはモデルごとにpipelineを保存する。そのためシーン先頭モデルの保存済みpipelineを優先し、空シーンでは次回import設定を使う。混在時もシーン全体は先頭モデルの方式で統一する。
- モード設定変更、モデル読込完了、モデル削除時に光色を再適用。project読込末尾の既存再適用経路も利用する。新規の保存項目や材質shader分岐は追加しない。

検証: unit 104ファイル607件通過。`light-color-mode.spec.mjs`ではGUIの光色RGB 200%入力で通常光が100%に留まり、PBR保存projectの読込で200%、MMDへの再読込で100%へ戻ることと入力保存値200%の維持を確認。`scene-light-keyframe.spec.mjs`で登録・補間・保存復元も通過。両E2EはローカルElectron/WebGPUで実行した。

lint、typecheck:critical、WebGPU `smoke:launch`も通過。通常typecheckは既存の非criticalエラー538件が残る（変更前539件、新しいtestのhost型指定で1件減少）。実モデルでの最終的な見え方は所有者確認が残る。
