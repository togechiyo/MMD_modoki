# Stage Standard 背景材質プリセット

更新日: 2026-09-07

## 目的・使い方

背景の壁・床・柱などへ使うマットな汎用プリセット。材質パネルで対象を選択し、
`Stage Standard` を選んで「選択へ割り当て」または「全材質へ割り当て」を使う。
内部IDは `wgsl-stage-standard`。既存の材質割り当て保存・復元経路を使う。

MMD Standard材質のWGSL経路へ追加する。PBR専用のroughness材質ではない。

## 見た目

- テクスチャ・diffuse・ambient・emissive・alpha・sphereは元のMMD材質合成を維持する。
- 正規化済みの受光量 `n = clamp(N dot L, 0, 1)` に対し、`n * (1.5 - 0.5 * n)` で
  正面から斜めの面を滑らかに明るく保つ。段階的なToon境界や画面上のブラーは足さない。
- 主陰影へ最大8%の副陰影を重ねる。減光量は
  `mix(0.03, 0.08, shadowVisibility) * (1 - smoothstep(-1, 0.85, signedNdl))`。
  正面側で消え、横・裏側へ滑らかに効く。完全な落ち影でも最大3%を残し、面の向きを表す。
  Stageの直射/spot照明に限り符号付きN dot Lを保持し、主陰影では従来どおり0〜1へclampする。
- その受光量へ既存シャドウマップのvisibilityを掛け、共通影色と明部を補間する。
  shadow generator、CSM、bias、影距離、filterには変更を加えない。
- Toonありでは `mix(UI影色, Toon左下1px, Toon影響度)` を使う。
  Toonなしでは、所有者指定の `src/assets/textures/toon/toon_30gray.bmp` を補う。
  影側はRGB 179（約0.702）、明側は白。初期実装の固定0.5より影を明るくする。
  UIのToon影響度を下げるとUI影色へ寄る。
- specularColorは元の12%、specularPowerは16。鏡面の強い印象を抑える。
- 半球光などToon計算対象外の照明は、元の拡散光計算を維持する。
- 照明色・強度・attenuationは既存の `info.diffuse` から受け取る。

元のToon影色が白なら、Toon影響度100%で明暗差が小さくなる。影色を変えるときは
UIのToon影響度と影RGBを使う。背景テクスチャ自体に描かれた陰影やsphereの反射も残る。
材質ごとの見た目を上書きしすぎないことを優先し、発光や全体露出の追加補正は行わない。

## SSAO・負荷

所有者は2026-09-07に、事前計算が必要なAO案を却下し、リアルタイム描画に限定すると明示した。
採用した代案は、主陰影を維持し、法線と照明方向から最大8%の薄く広い副陰影を重ねる方式。
これは面の向きに基づく演出的な陰影であり、橋や建物による形状の遮蔽判定は行わない。

独自のAO、GI、反射、空・地面色の近似は追加しない。接地や隅の陰影は既存SSAOへ任せる。
追加RTT、履歴バッファ、深度読み取り、ぼかしパスはない。通常の材質パス内で計算する。
ToonなしではStage Standard専用fallbackを使ってMMDの照明経路を有効にする。
`preset:stage_toon_30gray` をsceneごとに共有し、モデルToonと同じ左下1px参照で影色を読む。
他のプリセットのfallbackや影色は変更しない。

## 実装・一次情報

- `src/scene/shaders/builtin-toon/stage_standard.wgsl`: 受光曲線と影色の合成（2026-09-12に旧`wgsl/`から移動）。
- `src/scene/material-shader-service.ts`: 元材質の復元、マット化、Toonなしの基準色。
- `src/mmd-manager.ts`: カタログ・表示名。
- インストール済みbabylon-mmd 1.2.0の
  `esm/Loader/ShadersWGSL/mmdStandard.js`で、Toon対象の `info.diffuse` がN dot L適用前であり、
  `info.isToon` で非Toon照明と区別されることを確認した。

## 検証

- 単体テスト: 再適用時にspecular減衰が累積しない、元材質へ戻せる、割り当ての保存復元。
- ローカルPlaywright Electron / WebGPU: 材質GUIからの割り当て、表示ラベル、project state復元、
  Classic / Frame Graph、Toonなし材質、既存落ち影の有無による画像差。
- 青いToonテクスチャを持つfixtureでも影色の反映と保存復元を確認。画像を目視確認した。
- 自作の壁・床・柱・球とリポジトリfixtureを使用。ユーザー所有の背景assetは使用していない。
- Frame GraphのSSAOをGUIから追加し、描画の継続とPNG出力を確認。
- Stage Standard / MMD Standard切替でRTT一覧が増えず、実コンパイルされたWGSLが切り替わる。
- lint成功、unit 103ファイル / 599件成功、E2E 3件成功、WebGPU validation error 0。
- critical typecheck成功。内部実行する通常typecheckは既存539件で失敗し、TS2304 / TS2552は0件。
- 画像は `test-results/stage-standard-framegraph/`、`stage-standard-classic/`、
  `stage-standard-framegraph-blue-toon/` に生成する（次回E2Eで再生成）。

2026-09-07、所有者が実ステージで確認し「まあいったんいいかなあ。なんか物足りない感じはあるけど」
として現状で区切る判断をした。暫定的な仕上がりとして保存し、完成形の承認とは区別する。
実ステージでの定量的な性能比較は未実施。
