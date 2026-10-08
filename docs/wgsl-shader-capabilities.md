# WGSL シェーダーでできること / できないこと

更新日: 2026-10-08

第1〜7節は2026-03-13時点のToon差し込み基盤についての記録。現在の外部材質WGSLは[v2作者形式](./external-wgsl-authoring-v2-design-2026-09-16.md)を参照する。以下の「できない」は当時の材質接続APIの制約であり、WGSL言語やBabylon.js全体の制約ではない。カスタムポストエフェクトの確認結果は第8節。

## 1. 前提

このプロジェクトの WGSL シェーダー差し替えは、現状では

- Babylon MMD Toon 系マテリアルの一部差し替え
- `diffuseBase` まわりの見た目変更
- 追加の最終色加算

を行う仕組みです。

つまり「任意の独立したフルスクリーンポストエフェクト」ではなく、
**材質シェーダーの差し込み / 置換** と考えるのが正確です。

## 2. できること

### 2.1 材質ごとの陰影の作り替え

- Toon 段の位置調整
- 影色 / 光色の解釈変更
- ハイライトの出方の変更
- rim light 風の縁取り
- 影を浅くする / flat に寄せる

### 2.2 材質色ベースの疑似発光

- 材質の `diffuse` 色を読んで光らせる
- 一定以上の明るさだけを拾って発光させる
- 発光色を材質色寄り / 光色寄りに寄せる
- ベース面を self-lit 風に持ち上げる

`luminous.wgsl` や `Luminous` プリセットはこの方向です。

### 2.3 最終色への追加加算

差し込み基盤では `toonFlatLightMask` / `toonFlatLightColor` を使って、
材質の最終色へ追加の発光色を乗せられます。

現在は toon 色指定の有無に関係なくこの最終加算が有効です。

### 2.4 built-in プリセットで材質プロパティも同時変更

WGSL プリセットとして実装する場合は、シェーダー差し替えだけでなく

- `emissiveColor`
- `disableLighting`
- `specularPower`

のような Babylon 側の材質プロパティも同時に変えられます。

外部 `.wgsl` ファイル読み込みだけではここまではできません。

## 3. できないこと

### 3.1 本物の AutoLuminous / Bloom

現行の外部 WGSL 差し込みだけでは、MME の `AutoLuminous` と同じ

- 画面全体の輝度抽出
- しきい値で抽出
- 近傍ピクセルぼかし
- 元画像への加算合成

はできません。

理由:

- 材質 WGSL はそのピクセル時点の計算しか持たない
- 画面全体や周辺ピクセルへのアクセスがない
- フルスクリーン後段ブラーではない

そのため再現できるのは **AutoLuminous 風の疑似発光** までです。

### 3.2 画面全体依存のポストエフェクト

現行の材質 WGSL だけでは、次は不可です。

- SSR
- SSAO
- 本物の bloom
- 被写界深度
- カラーバッファ全体を使う色収差
- 画面全体のグレア

これらは別途ポストプロセス実装が必要です。

### 3.3 HDR 出力

WGSL を `VP9` で書き出していても、それだけで HDR にはなりません。

不足しているもの:

- 10bit 以上の出力経路
- HDR transfer function
- BT.2020 系の色空間メタデータ
- HDR 前提の post / tone mapping

現状の WGSL は SDR 前提です。

### 3.4 材質単位のぼかし

「この材質だけ輪郭の外側へふわっとにじませる」は、
材質 WGSL 単体では基本的に困難です。

できるのは

- rim を広めに見せる
- ハロー風の色を追加する

までで、実際の blur ではありません。

## 4. 外部 `.wgsl` と built-in プリセットの違い

### 外部 `.wgsl`

できる:

- 既存 Toon 差し込みブロックの差し替え
- 材質ごとの色味 / 陰影 / 疑似発光調整

できない:

- `emissiveColor` など Babylon 側材質値の同時変更
- 専用の材質初期化ロジック

### built-in WGSL プリセット

できる:

- 外部 `.wgsl` と同じ差し替え
- `emissiveColor` / `specularPower` / `disableLighting` の同時制御
- プリセットとして安定運用

## 5. AutoLuminous 風表現の現実的な方針

現行構成で一番破綻しにくいのは次です。

1. 材質側で「光らせたい部分」を明るく / 高彩度に作る
2. WGSL でしきい値抽出風の疑似発光を足す
3. 必要ならプリセット側で `emissiveColor` も上げる
4. 本物の bloom が必要なら別途ポストエフェクトで実装する

## 6. 使い分けの目安

### WGSL だけで十分

- Toon の段調整
- 影色の雰囲気変更
- rim light
- neon 風の自己発光
- 材質ごとの look dev

### 別機能が必要

- AutoLuminous をそのまま再現したい
- bloom / glare を欲しい
- カメラ全体にかかる映像エフェクトを作りたい
- HDR にしたい

## 7. 現状の結論

このプロジェクトの WGSL 差し替えは、

- 材質 look の作り込みには強い
- 疑似発光までは十分実用
- ただし本物のポスト bloom / AutoLuminous は別物

という整理になる。

## 8. カスタムポストエフェクトの実現性 — 2026-10-08確認

WGSLでカスタムポストエフェクトを作ることは可能。材質WGSLがモデルの各材質へ差し込まれるのに対し、ポストエフェクトは描画済みの画面画像を入力として別の画像を出力する。Babylon公式も[独自PostProcessと複数段の連結](https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/postProcesses/usePostProcesses.md)を説明し、[Frame Graphでは独自taskと画像の入出力・履歴を扱える](https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphClassOverview.md)。公式PostProcessの作例はGLSLであり、WGSL対応は下記の導入済み実装も照合した。

- Babylon.js 9.2.0の`PostProcess`と`EffectWrapper`は`shaderLanguage`指定を持つ。`EffectWrapper`の`useAsPostProcess`は画面画像用の`textureSampler`を用意し、`FrameGraphPostProcessTask`へ接続できる。
- 本リポジトリの`src/render/frame-graph-post-effects-controller.ts`でも`EffectWrapper`へ`ShaderLanguage.WGSL`を指定した内蔵効果がある。一方、現在の外部`.wgsl`ローダーは材質用であり、カスタムPostFXの読込・割当は未実装。この確認では新しい外部WGSLのGPU実行は検証していない。
- 画面の色画像を入力にした1段の処理から、色補正、ビネット、粒子ノイズ、色収差、画面歪み、モザイクなどを扱える。ブラーは近傍サンプリングを使い、Bloomの抽出・ぼかし・合成や被写界深度、SSRなどは効果に応じて複数段・深度・法線などの入力が必要になる。残像などは前フレーム画像の管理も必要。

将来の外部PostFX設計では、次を材質用APIとは別の接続契約として検討する。ここでは実装や次版への採用を決定していない。

1. 最初は画面色画像を受け取る1段の処理に絞り、入力画像、UV、解像度、タイムライン由来の時刻をアプリが供給する。LUTやノイズ画像は[WGSL＋ローカル画像参照の方向](./wgsl-pbr-texture-material-package-investigation-2026-10-08.md)を応用できるが、読込と保存は別途実装が必要。
2. 材質用 / ポストエフェクト用の識別は、提案中のPBR必須フラグと分ける。画面効果は通常MMD / PBRの両方へ適用できる。具体的な識別子・関数名は未定。
3. 入出力の色空間、tone mappingやAAに対する挿入位置、alphaの扱いを定義する。プレビューと画像・動画出力で順序と時刻を揃える。
4. Classic / Frame Graphの実行経路を分け、二重適用を避ける。Frame Graphの段構成・画像入出力を変更する際は[既存の再build方針](./framegraph-postfx-risk-note-2026-07-01.md)に従い、実行中に依存を付け替えない。

### 8.1 フラグと内部形式からFrame Graphへ接続する案

作者の`.wgsl`にポスト用の識別宣言を置き、アプリが内部descriptorへ変換すれば、既存Frame Graphへカスタムのポスト処理taskとして載せられる。フラグ例は`const MODOKI_POST_PROCESS: bool = true;`だが、名前・API番号・呼出関数は未確定。これはアプリ用の宣言でありWGSL標準の機能ではない。現行v2の宣言readerは未知の`MODOKI_`名を拒否するため、今のローダーへこの例を渡しても使用できない。

接続の流れは「WGSLの識別・検証 → 内部descriptor → フルスクリーン用WGSLを組み立てる → `FrameGraphCustomPostProcessTask` → 次段へ`outputTexture`を接続」。Babylonには[標準のカスタムPostFX task](https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList.md)があり、導入済み9.2.0にも存在する。内部の`ThinCustomPostProcess`は`EffectWrapper`を継承し、同じoptionsで`ShaderLanguage.WGSL`を指定できる。`onApplyObservable`からuniformなどを供給でき、親の`FrameGraphPostProcessTask`が入力を`textureSampler`へbindし、全画面描画と無効時の画像コピーを記録する。単一段ならこの共通taskを使い、作者ファイルごとにTypeScriptのtask classを用意する必要はない。

内部形式は次を分ける。

- **種別**: 現行の`kind: "mmd-material"`へ、例えば`kind: "post-process"`を追加し、種別ごとにhookと入力を検証する。PBR必須条件は材質側の別情報とし、ポスト用識別と混同しない。
- **資産**: source、画像参照、内容revisionなどは共有できる。作者向けJSONは追加せず、アプリがdescriptorを生成しprojectへ保存する。
- **割当**: 材質用のmodel / material targetと、ポスト用のstack内instanceを分ける。ポスト側ではinstance ID、順序、enabledなどを保存し、同じsourceの複数配置を区別できるようにする。
- **実行**: 入力色画像、画像形式・色空間、出力解像度、uniform、追加textureの依存を定義する。GPUのtexture handle、binding、資源寿命はアプリとBabylonが扱う。

1段のWGSLを差し込む範囲なら、この識別と接続契約で進められる。任意の複数段Frame Graphを作者が組む場合は、フラグに加えて各passのsource、入出力、順序、中間画像、履歴の仕様が必要になる。まず1段の形式を検証し、複数段の作者形式は別に設計する案とする。これは実装未着手の設計案であり、採用判断の記録ではない。

### 8.2 LUTに近い外部ファイル読込の導線案

2026-10-08、所有者が「LUTみたいに外部ファイル読込でさせるようにしたら便利そう」と挙げた。外部WGSL PostFXの候補として記録し、実装着手・収録時期の決定とは区別する。

同日の後続指定により、PBR条件とポスト用識別を[リリース後台帳](./v0.2.4-post-release-ledger.md)へ残し、拡張の実装はすぐに着手せず保留する。以下は再開時の設計案として保持する。

操作案は「WGSL読込ボタンで`.wgsl`を選択 → ポスト用宣言と入力を検証 → GPUのコンパイル・資源準備を確認 → 既存のエフェクト追加一覧へ登録 → stackへ追加」。ON / OFF、順序変更、削除は既存stackの操作へ揃える。数値・色はWGSLの`const`をテキストエディタで編集する方式を踏襲し、専用エディターや任意のパラメータースライダーを追加する前提にはしない。

- 既存LUTの参考箇所は`src/ui/lut-panel-controller.ts`の`chooseExternalLut` / `importExternalLutFile`と、`src/ui/lut-panel-state.ts`の選択・保存計画。LUTは検査後に一覧登録・適用するが、WGSLではGPUコンパイルの確認も必要になるため、ファイルを読めただけで成功通知しない。
- 読込・再読込失敗時は診断を表示し、直前の有効なeffectとstackを保つ。projectの欠落assetは該当effectを無効にして他の編集・読込を続ける。
- 保存は既存の外部材質WGSLの内容revisionとsnapshot同梱を参考にする。元の絶対パスだけへ依存せず、sourceとstack割当を保存して、元ファイルの移動後にも復元できるようにする。参照画像を扱う段階では画像も同梱対象に含める。
- 最初の候補範囲はFrame Graph用の1段の画面効果。明示的なClassic選択時に勝手にbackendを変えず、適用条件を表示する。新規taskの追加・削除・順序変更は再build、確保済みの入力内の個別ON / OFFは既存のdisabled pass方針を使う。

実装時は読込・再読込・削除・Undo / Redo、初期OFF、保存再読込、元source欠落、backend切替、PNG / WebMを確認する。ファイルの供給をtest hookで行っても、読込後の一覧とstackはローカルElectron E2EのGUIから検証する。候補入口は[次版メモ](./v0.2.4-next-version-candidates.md)、進捗の正本は[基本チェックリスト](./mmd-basic-task-checklist.md)。
