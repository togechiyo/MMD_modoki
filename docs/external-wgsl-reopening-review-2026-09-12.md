# 外部WGSL読込の再公開前レビュー 2026-09-12

## 結論と範囲

実験機能メニューで許可し、Shaderパネルで外部WGSLを使う構成は既存処理を活かせる。ただし保存と適用成功の扱いに欠落があり、UIの復元だけでは再公開できない。今回の依頼は概観レビューとして扱い、アプリの挙動は変更していない。

実装済みなのはMMD Standard材質のToon計算へ差し込むsnippet。PBR、アクセサリへの外部割当、画面全体のpost effectはこの入口の対象外。6月の[段階設計](./external-wgsl-shader-loading-concept-2026-06-12.md)のLevel 1から再開する案が妥当。

## 優先して直す箇所

### 1. 材質ごとの割当が保存で失われる

`src/scene/material-shader-service.ts` の `setExternalWgslToonShaderForModel` はモデル・材質を限定して適用する。一方、`src/types.ts` の `ProjectModelMaterialShaderState` はpresetとvisibilityだけを保存し、外部WGSL参照を持たない。

`src/ui-controller.ts` の保存は最後に選んだ1本を `effects.wgslToonShaderPath` と `wgsl/<basename>` に記録する。読込後は `setExternalWgslToonShader` が全scene modelの材質に同じsourceを設定する。したがって「モデルAの材質1だけに適用」が再読込で全モデルへ広がる経路になっている。複数ファイルの割当も維持できない。

さらに別材質を組込presetへ戻す操作でも、UIが共有しているpath/textをnullにするため、他材質に残る外部割当が次回保存から落ちる。

対処案: shader assetの一覧と、モデルinstanceId・materialKeyに対応するasset参照を分けて保存する。同内容のsourceは共有し、同名の別ファイルは区別する。旧単一path形式の移行方法も明示する。

### 2. GPUコンパイルを待たずに適用成功になる

serviceはsourceをWeakMapへ設定し、材質をdirtyにして `engine.releaseEffects()` を呼ぶとtrueを返す。UIはその時点で成功通知する。外部WGSL専用のコンパイル待機、直前の正常状態の保持、失敗時の復帰はこの経路にない。

対処案: 候補sourceを対象材質の実際のdefine条件で検証し、成功時に割当を確定する。失敗時は直前の正常な割当・presetへ戻し、対象とエラーを表示・記録する。全engineのeffect解放は既存の広域処理なので、対象材質だけの更新で足りるかも確認する。

Babylon 9.2.0の `Materials/material.js` には `forceCompilationAsync` とエラー時のreject経路がある。ただしこのアプリのMMD plugin・複数submesh・WebGPUに対する候補適用と復帰方法は、実機確認が必要。

### 3. 入力仕様とUIが古いまま分かれている

`ShaderPanelController.validateExternalWgslToonSnippet` は正規表現による事前チェックだけである。現在の関数本体を読み取り、そのまま実行した結果:

| 入力 | 結果 |
| --- | --- |
| `diffuseBase += vec3f(0.1);` | 通過 |
| `// diffuseBase += vec3f(0.1);` のみ | 通過 |
| `diffuseBase += undefinedThing;` | 通過 |
| 正常な加算に `// return to default` を付記 | 拒否 |

正規表現はWGSLコンパイル検証の代替にならない。同梱20ファイルの事前チェックでは19本が通過し、`alpha_texture_debug.wgsl` は加算条件を満たさず拒否された。19本のGPUコンパイル成功を示す結果ではない。

現在のShaderパネルは組込presetだけを選択肢に生成する。外部ファイル一覧取得と適用分岐は残るが、一覧は選択肢へ反映されず、旧Load/Clear行も現行HTMLにない。[3月の操作説明](./lut-wgsl-file-handling.md)と `wgsl/README.md` は現UIと一致しない。

差し込み自体も `MmdPluginMaterial.getCustomCode` のprototype拡張と、依存側shader文字列の置換に依存する。現行babylon-mmd 1.2.0には対象文字列が残るが、許可変数、Toon有無、`@apply-without-toon` の扱いを明文化し、外部入力の検証をUIから共通helperへ出したい。

## 再公開する場合の推奨順序

1. 上記の保存形式、snippet仕様、適用と復帰を整える。
2. ツール → 実験機能に「外部WGSL材質スニペットを許可」を追加する案。初期OFF、許可はアプリ設定として扱い、project読込だけで自動ONにしない。
3. 有効時にShaderパネルへ読込・再読込・解除・選択材質/選択モデル全材質への適用を出す。OFF時は実行停止、割当情報は保持する案。WebGL2・PBR切替でも保存情報と実行可否を分ける。
4. 最小fixtureで、複数モデル/材質/ファイルの保存復元、不正sourceからの復帰、ファイル欠落、許可OFFでの読込、backend・材質モード切替、PNG出力を確認する。UI操作はlocal Electron E2Eで確認する。

上記は実装提案であり、具体的な設定保存・OFF時挙動まで所有者が採用した記録ではない。フルWGSL module、任意resource、複数passへの拡張は別設計とする。

## 確認範囲・参照

コード経路の静的確認、実関数の事前チェック実行、installed Babylon 9.2.0 / babylon-mmd 1.2.0の差し込み対象・compile API確認を実施。GUI、GPUコンパイル、保存復元の実操作、出力比較は未実施。

公式資料: [Babylon WGSL説明の原本](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUWGSL.md)。Babylon側にもWGSL登録・前処理の仕組みがあり、アプリのsnippet仕様はそれと区別して定義する。
