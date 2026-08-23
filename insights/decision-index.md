# Human Decisions

プロジェクト所有者が明示した採用・却下・保留を、技術的な知見とは別に参照するための索引です。

外部から届いた要望や不具合報告は、それ自体ではロードマップ上の決定ではありません。所有者が会話または文書で採用したものだけを `decision` として扱います。

## 採用・条件付き採用

| Outcome | Decision | Use when |
| --- | --- | --- |
| adopted | [AI 向け知見層の名前は `insights` とする](./decisions/ai-knowledge-layer-is-named-insights.md) | AI が再利用する判断記録の配置を決める |
| adopted | [v0.2.3 の主題はタイムラインとシーンキー編集](./decisions/v023-theme-is-timeline-and-scene-key-editing.md) | v0.2.3 の実装範囲や優先順位を決める |
| adopted | [v0.2.3 はキー機能追加より UI 整理を先行する](./decisions/v023-moves-ui-before-adding-key-functions.md) | タイムライン機能の実装順を決める |
| adopted | [アクセサリ欄はモデルに近い構成にする](./decisions/accessories-use-a-model-like-panel-layout.md) | `.x` の下部パネルを変更する |
| adopted | [アクセサリはモデル編集モードへ置く](./decisions/accessories-belong-to-model-edit-mode.md) | `.x` の編集モードや操作表示を変更する |
| adopted | [街モデルを扱える広域描画を支援する](./decisions/support-city-scale-wide-area-rendering.md) | far、空ドーム、影距離を変更する |
| accepted-with-constraints | [シーン全体の影設定変更には所有者の許可を必要とする](./decisions/scene-wide-shadow-settings-require-owner-approval.md) | CSM、ShadowGenerator、cascade、全体bias、影距離を変更する |
| accepted-with-constraints | [選択キーの一括補正を v0.2.3 で扱う](./decisions/adopt-selected-key-batch-correction-for-v023.md) | XYZ 補正や複数キー編集を設計する |
| adopted | [シーンキーは照明、影、重力、エフェクトの順で進める](./decisions/scene-key-order-is-light-shadow-gravity-then-effects.md) | シーン項目のキー登録順を決める |
| adopted | [再生中の編集権限はカテゴリごとのキー有無で決める](./decisions/playback-ownership-follows-category-key-presence.md) | camera / light / shadow / gravity の再生中評価とUIロックを変更する |
| adopted | [タイムラインの行高は選択状態で変えない](./decisions/timeline-rows-stay-uniform-height.md) | timelineの行レイアウトやGraph表示を変更する |
| adopted | [タイムラインの行・列見出し選択は片方の軸だけを保持する](./decisions/timeline-header-selection-is-axis-exclusive.md) | timelineの見出し選択や修飾キー操作を変更する |
| adopted | [報告された要望をそのままロードマップ確約にしない](./decisions/reported-requests-are-not-roadmap-commitments.md) | Issue や外部報告を実装計画へ昇格するか判断する |
| accepted-with-constraints | [配布アプリはoffline-first、開発作業はfixture中心でGUI確認する](./decisions/keep-agent-work-local-fixture-driven-and-gui-verified.md) | branch、runtime通信、開発時network、local reference配置、model asset、UI検証の安全境界を決める |

## 却下

| Outcome | Decision | Use when |
| --- | --- | --- |
| rejected | [アセット名に依存する描画補正は入れない](./decisions/reject-asset-name-specific-rendering-fixes.md) | 特定モデルだけの描画崩れへ対応する |
| rejected | [v0.2.3 で全エフェクトをキー化しない](./decisions/reject-universal-effect-keyframing-in-v023.md) | エフェクトのキー登録範囲を決める |
| rejected | [PBR を通常 UI に出さない](./decisions/keep-pbr-out-of-normal-ui.md) | PBR 実験の公開導線を変更する |
| rejected | [品質が戻るまで海面エフェクトを通常 UI に出さない](./decisions/reject-ocean-effect-from-normal-ui-until-quality-recovers.md) | 海面エフェクトを再利用・再公開する |
| rejected | [独自 VP8 と無圧縮 AVI は当面採用しない](./decisions/reject-custom-vp8-and-uncompressed-avi-for-now.md) | 動画出力方式を追加する |

## 保留

| Outcome | Decision | Use when |
| --- | --- | --- |
| deferred | [汎用オブジェクト形式の拡張は v0.2.3 より後へ送る](./decisions/defer-generic-object-format-expansion-beyond-v023.md) | OBJ、PLY、glTF 等の対応を提案する |
| deferred | [IBL Shadows は保留する](./decisions/defer-ibl-shadows.md) | IBL Shadows の調査・再実装を検討する |
| deferred | [VMDU は VMD 出力要件が固まるまで保留する](./decisions/defer-vmdu-until-vmd-export-proves-requirements.md) | VMDU や VMD 差分形式を検討する |
