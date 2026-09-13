# 外部WGSLのPBR接続

2026-09-13、所有者の依頼で既存の外部材質APIをPBRへ接続する。独立したShaderMaterialへ交換せず、既存PBR材質のpluginとして実行する。

- 既存の単一WGSL・`kind: mmd-material`・`surface` / `finalColor`を共用する。kindはモデル材質用APIの識別子として維持する。
- Babylon 9.2.0の配布ソースを確認。PBRの`CUSTOM_FRAGMENT_BEFORE_LIGHTS`ではテクスチャ評価後の`surfaceAlbedo`と`normalW`を変更できる。`CUSTOM_FRAGMENT_BEFORE_FOG`は`pbrBlockFinalColorComposition`内にあり、`finalColor`を変更する。Standardの同名hookとは変数が異なる。
- PBRでは`surface.baseColor`に評価済みalbedo、`surface.diffuseColor`に白を渡す。返された2色を乗算してalbedoへ戻す。法線は正規化し、alpha・粗さ・金属度は既存PBR材質が保持する。最終色hookは照明・反射・発光の合成後、fog・画像処理前。
- Geometry DIFFUSEはPBRのalbedoColorとalpha、AMBIENTはambientColor。Camera/Light/時間/行列/viewport入力は共用する。Phong固有のSPECULAR / SPECULARPOWERはPBRで明示的に非対応とし、曖昧な物理量へ変換しない。入力は適用前に診断する。
- 一覧・読込・割当ボタンは共通。通常MMDとPBRの割当は各mode bankへ保存し、自動で相互コピーしない。Undo/Redoには操作時のモードを記録し、非表示モードの操作はそのbankだけへ反映する。
- 入力上限、コンパイル期限、エラー表示、復旧時の全体無効化は既存serviceを共有する。

公式確認先: [WGSLでのシェーダー記述](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUWGSL.md)、[PBRのWGSL移行](https://forum.babylonjs.com/t/pbr-fully-ported-to-webgpu-wgsl/52350)。差し込み位置の正本は導入済み`@babylonjs/core`の`ShadersWGSL/pbr.fragment.js`および`ShadersInclude/pbrBlockFinalColorComposition.js`。バージョン更新時は再確認する。

## 確認結果

- ローカルElectron/WebGPUで外部WGSLの既存E2E2件、PBR追加E2E2件が通過。Classic / Frame Graph両方で共通一覧・適用・保存復元を確認。
- PBR Standard上でTemplateの無変更出力が元のPNGと一致（RGB差8超の画素100未満）。Moonstone Schiller / Black Opal / Prismatic Fire / Aurora Opalと、色・法線・Geometry DIFFUSEを使うsurface/finalColor確認用shaderは各1000画素超の変化を確認。PBR基準・Moonstone・表面変更の画像を目視確認した。
- PBRでのコンパイルエラーと非対応Phong入力はviewportへ通知し、直前の割当を保持。通常MMD表示中のPBR Undo/Redo、組込preset選択による解除とUndo、project復元が通過。GPU validation診断は0件。
- 材質切替の既存E2E2件も通過。初回は編集中のページ再読込で停止したため編集を止めて再確認し、Standardを省略保存する古いテスト期待値だけを現行の全材質保存に合わせた。未登録編集・物理・履歴・source欠落時の復旧を確認。
- 単体805件、lint、typecheck:critical、insights検証が通過。型検査は既存系542件の非critical診断のまま。通常MMDとPBRでは照明・色空間が異なるため、同じサンプルの見た目の完全一致は要求しない。
