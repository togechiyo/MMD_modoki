# エフェクトキー機能の一時休止

更新日: 2026-09-15

所有者が「次バージョンに乗せるには重いかも。いったんしまえるかな」と指定したため、17種のエフェクトキーを標準UIと再生経路から一時的に外す。実装・テストは残し、後で再開できるようにする。描画負荷を実測した結果による性能判断ではなく、次版の機能範囲を抑える判断。

## 標準の動作

- タイムラインのエフェクト17行とキー操作パネルを表示しない。照明・影・重力のキーは従来どおり。
- 通常のエフェクトパネルは使用できる。スライダーは静的な効果設定を変更する。
- 保存済みeffectAnimationsはキーやpreviewを評価せず、未認識の追加フィールドも含め、そのまま保管する。保存・再読込・backend変更で消さない。
- 保管中のキーを通常のスライダーで書き換えない。キーによる描画資源の事前確保、再生待ち、タイムラインの長さへの追加を行わない。
- キーを持つ既存プロジェクトも、休止中は静的なeffectsの値で表示・出力する。キーを打った時点の見た目を固定する処理ではない。

## 実装と再開方法

`src/editor/effect-timeline-availability.ts`のEFFECT_TIMELINE_ENABLEDをUIとmanagerの入口で共有する。標準はOFF。開発起動かつVITE_MMD_EFFECT_TIMELINE=1のときだけ有効。配布用production buildではこの環境変数だけで有効にならない。

開発時に試す場合は、Vite/Electronを再起動する前に次を指定する。

```powershell
$env:VITE_MMD_EFFECT_TIMELINE = "1"
npm.cmd start
```

通常へ戻すときは環境変数を解除して再起動する。アプリ設定・プロジェクトデータから自動で有効化する入口は追加しない。標準ONへ戻す時期は所有者の再開判断を待つ。

EffectSceneTrackStoreは無効モードでは保存ブロックをopaqueな値としてcloneし、activeなentryを生成しない。このため既存のhas/evaluate/framesを使う描画・UI・編集経路がキー所有中と誤認しない。編集要求も保管ブロックを変更しない。通常プロジェクトへの切替はrestore(null)で保管状態をリセットする。

既存のキーE2EはlaunchMmdModokiのeffectTimelineオプションを明示的に有効化する。一般E2Eは通常起動と同様にOFF。コードを削除せず、再開時の検証を保つ。

## 検証

- unit: 153 files / 862 tests PASS。無効時の非評価・編集不可・キー/preview/未知フィールドの往復保持、再有効化後の評価、productionではopt-inしても無効になることを確認。
- lint / typecheck:critical: PASS。通常型検査は既存542件から診断の増減なし。
- 通常モードのローカルElectron E2E: PASS。キー行・パネルが非表示、照明/影/重力行が残ること、通常ガンマ調整、0/20のPNG一致、再生・保存・Classic往復でもキーを保持することを確認。WebGPU validation error / renderer pageerrorは0。最終UIも目視確認。
- 開発用opt-inのガンマE2E: PASS。登録・再生・保存・PNG/WebMを確認し、復帰経路を維持。
- smoke:launch: 通常モードでWebGPU / Bullet MPR初期化・安定待機・環境光probeまでPASS。
