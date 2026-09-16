# 外部WGSL材質サンプル（API v2）

このフォルダは、外部WGSL読込で実際に選べる単一ファイルのサンプルです。**`prismatic-fire.wgsl`** などを選びます。JSONを使わず、冒頭の`const`で調整値、`EffectInputs`で動的入力、所定の関数で処理を宣言します。旧JSON混在形式との互換はありません。

自分で作成・改造する場合は **[カスタムWGSLシェーダーの作り方](./AUTHORING.md)** を参照してください。最小コード、入力一覧、MMD／PBRの違い、色の合成、読込・エラー確認を説明しています。

開発時の型・変数名・入力宣言・座標・時刻の正確な仕様は **[カスタムWGSL開発リファレンス](./REFERENCE.md)** にまとめています。固定の入力名と作者が命名する調整定数を分け、行列24種とコピー用の入力辞書を掲載しています。

## 配布アプリでの場所

このフォルダはビルド時に`app.asar`の外へ自動同梱します。Windows／Linuxではアプリの`resources/wgsl`、macOSではアプリの`Contents/Resources/wgsl`にあります。

改造するときは`wgsl`フォルダを自分の作業フォルダへコピーしてください。アプリ更新による上書きを避けられ、インストール先の書込権限やmacOSのアプリ署名にも影響しません。サンプルとこのフォルダ内の説明書はオフラインで利用できます。開発ソース・補足資料へのGitHubリンクはオンラインの開発版を参照します。

## 使い方

1. 設定 → 実験機能 →「外部WGSL材質を有効にする」をON。
2. モデルを選び、エフェクトパネル → 材質 →「外部WGSL読込…」。
3. 以下の定義を読むと「種類」の既存一覧に追加されます。共通の「選択へ割り当て」または「全材質へ割り当て」で適用。
4. 調整はテキストエディタで冒頭の`const`やWGSL本文を編集し、同じボタンで読み直して再適用します。以下の調整名は冒頭の定数を指し、画面に色・数値入力欄はありません。組込プリセットを割り当てると外部WGSLを解除します。

| サンプル | 内容 |
| --- | --- |
| [Aurora Opal](./aurora-opal.wgsl) | 元の色に、時間で移り変わる柔らかな虹色のグラデーションを加算。 |
| [Moonstone Schiller](./moonstone-schiller.wgsl) | 元の色に、角度で浮かぶ柔らかな青いシラーを重ねる。 |
| [White Opal](./white-opal.wgsl) | 元の色に、角度に応じて光るかけらを加算する明るい遊色風。 |
| [Black Opal](./black-opal.wgsl) | 同じかけら模様を乗算して暗い遊色を重ね、光沢だけ少量加算。 |
| [Prismatic Fire](./prismatic-fire.wgsl) | 元の色に、ときどき鮮やかなきらめきが現れる分散風。 |
| [Soft Pastel](./soft-pastel.wgsl) | 元の照明・影の位置を保ったパステル調の色仕上げ。 |
| [Template](./template.wgsl) | 色乗算だけの編集開始用。既定値は元の見た目を保持。 |
| [BLEND Modes](./blend-modes.wgsl) | 元の色を下地に、通常・加算・乗算・スクリーン・オーバーレイの5モードを比較。 |
| [MME入力：材質・ライト・視点](./mme-light-material.wgsl) | GEOMETRY_DIFFUSEとLIGHT_DIFFUSE、材質の光沢、ライト方向、カメラ位置を使った簡易照明教材。 |
| [MME入力：行列・画面サイズ](./mme-space-grid.wgsl) | 物体に付く格子と画面に付く格子を比較。WORLD・逆行列・WVP・viewportの実用例。 |
| [MME入力：時間・フレーム](./mme-time-scan.wgsl) | 編集同期あり／なしのTIME・ELAPSEDTIMEと独自のMODOKI_FRAMEを可視化。 |

いずれも外部テクスチャ・UV必須条件なし、追加render targetなし。WebGPUの通常MMD・PBR両モードで利用できます。ただしPhongの光沢値を読む`mme-light-material.wgsl`は通常MMD専用です。元のテクスチャを含む色への合成方法はサンプルごとに異なります。PBRでの色・入力の意味は[PBR接続仕様](https://github.com/togechiyo/MMD_modoki/blob/main/docs/external-wgsl-pbr-adapter.md)を参照してください。

MME風の自動入力を学ぶ場合は [入力サンプルの解説](https://github.com/togechiyo/MMD_modoki/blob/main/docs/external-wgsl-mme-inputs-examples.md) から始めてください。材質・ライトの教材は入力を単独表示するため、強さ1では元の材質の照明・テクスチャを置き換えます。

## 宝石の下地と効果（2026-09-13）

宝石5種はモデルのテクスチャ・材質色・陰影を含む`input.color`を下地にします。固定の`BodyColor`は撤去しました。COATING=1でも下地を参照し、0なら元の描画色へ戻ります。

White Opal・Aurora Opal・Moonstone Schiller・Prismatic Fireは`input.color + effect * COATING`の加算です。Black Opalは`input.color * mix(1, tint, strength)`で下地を暗く色付けし、表面の白い光沢だけ少量加算します。`strength`はCOLOR_STRENGTH×COATINGを0～1に収めた値です。White / Blackは同じかけら配置と角度応答を使うため、加算／乗算の比較例にもなります。乗算では元の色にない成分を増やせず、黒い下地から遊色は出せません。

明るい下地では加算光が白く見えやすいため、`COATING`や各効果の強さを下げて調整します。HDR値はサンプル内でclampせず、後段の画像処理へ渡します。通常MMD・PBRで同じ合成を使いますが、照明と色空間が違うため見た目は一致しません。保存済みプロジェクトの旧シェーダーは自動更新されないので、新しいサンプルを読み直して適用してください。

## BLEND Modesの調整

元のテクスチャ・材質色・照明を含む `input.color` を下地に、`LAYER_COLOR` を重ねる教材です。`OPACITY`（0～1）は色を混ぜる量で、モデルの透明度は変えません。冒頭の `BLEND_MODE` の値を書き換えて再読込・適用してください。

| BLEND_MODE | 方式 | 使いどころ・変化しない重ね色 |
| --- | --- | --- |
| 0 | 通常 | 色の置き換え。OPACITY=1では下地の模様・陰影も置き換わる。 |
| 1 | 加算 | 光・きらめき。黒で変化なし。1を超える明るさも後段へ渡す。 |
| 2 | 乗算 | 陰影・着色。白で変化なし。黒い下地は明るくならない。 |
| 3 | スクリーン | 明るい色を重ねる。黒で変化なし。 |
| 4 | オーバーレイ | 下地の明暗を活かす着色。0.5グレーで変化なし。既定値。 |

どの方式もOPACITY=0で元の描画を保持します。`blendLayer` のlayer引数を単色から模様や宝石の効果色へ変えれば、他の作例へ移植できます。地色と光を分ける場合は、地色を通常／乗算／オーバーレイで合成してから、きらめきを加算／スクリーンで重ねる構成が考えられます。

通常・乗算・スクリーン・オーバーレイの0～1 RGBの式は [W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/#blending) を参考にしています。GPUの材質RGBへ直接適用する教材で、画像編集ソフトの色空間・透明レイヤー合成との完全一致は意図しません。スクリーン／オーバーレイでは0～1外の下地を失わない独自の拡張をコメントに明記しています。加算は飽和させず `base + layer` とします。追加のテクスチャ・描画passは不要です。

検証（2026-09-12）：自作SSS fixtureでClassic／Frame GraphのGUI読込・5モードのPNG描画を確認。全モードのOPACITY=0、加算・乗算・スクリーン・オーバーレイの中立色で元画像を保持し、色を重ねた5モード間には描画差があることを画像比較で確認しました。GPU validation errorは0件、lint通過。`npm.cmd run test:e2e -- external-wgsl-blend.spec.mjs` で再確認できます。任意のテクスチャ・HDR値・他アプリとの画素一致を網羅した検証ではありません。

## Aurora Opalの調整

- タイムラインを再生するか、0 → 90フレームへ移動すると模様が流れます。停止中は静止し、同じフレームへ戻ると同じ模様になります。
- `模様の細かさ`を上げると細かくなります。既定値0.65は数MMD単位の形状向け。大きいモデルで細かすぎる場合は0.1〜0.3程度から調整。
- `流れる速さ`を0にすると静止。負数は逆方向。
- `コーティングの強さ`が0なら元の最終色、1なら元の色に効果を全量加算。顔全体より衣装・小物の一部から試すと調整しやすいです。
- `発光色`、`発光の強さ`で印象を調整。

3段の固定noiseによる連続した色の変化、簡易干渉色、Fresnel風の縁取りとハイライトを重ねています。周期的な縞・細い発光帯と`RibbonWidth`は撤去しました。物理的な薄膜・屈折・SSSではなく、透明度や形状は変更しません。発光は表面への色加算で、周囲の空間へ光をにじませる処理は含みません。

模様の座標はworld行列の逆変換後の位置です。モデル全体の移動・回転には追従しますが、スキニング前の静止座標ではないため、ボーン変形時に模様が変化します。遠景では`PATTERN_SCALE`を下げて調整してください。

## 角度で光る宝石4種

Moonstone Schiller / White Opal / Black Opal / Prismatic Fireは見た目を優先した近似です。カメラを回したりライトの向きを変えると光が移ります。TIMEを使わないため、モデル・カメラ・ライトが静止したまま時間だけ進めても変化しません。

- **シラー**: `光の層の傾き`で光る位置、`シラーの広がり`でぼかし、`シラーの強さ`で青い光の量を調整。
- **遊色**: `かけらの細かさ`で模様の大きさ、`光る角度の広さ`で点灯範囲、`遊色の強さ`で鮮やかさを調整。
- **分散風**: `色の分かれ幅`でRGBのきらめきの間隔、`きらめきの鋭さ`で光る角度の狭さ、`色のきらめきの強さ`で色の量を調整。幅0なら色分かれなし、強さ0なら通常の無彩色寄りの光沢になります。

遊色・分散風の細かさの既定値は小さな比較fixture向けです。大きな衣装へ適用して細かすぎる場合は0.3〜1程度から調整してください。27個の近傍候補を使う固定回数の3D区画計算を行います。追加の画像や描画passは不要ですが、最小テンプレートよりfragment計算量は増えます。遠景の細かな模様・鋭いきらめきはちらつくことがあるため、模様を粗くし、鋭さを下げて調整します。

シラーは表面への色加算、遊色は区画ごとの角度応答、分散風はRGBの光沢方向をずらした表現です。内部構造・波長別屈折・背景の歪み・床への虹色投影は計算しません。透明度は元の材質のままで、透明な宝石へ自動変換するものではありません。

## 旧サンプルの整理（2026-09-12の履歴）

旧`diffuseBase`差替えsnippetはこのフォルダから撤去しました。テンプレート・パステル・装飾系は当時のAPI v1作例へ置き換えています。旧コードとの描画互換はありません。

組込プリセットが使用中の13ファイルは [src/scene/shaders/builtin-toon](https://github.com/togechiyo/MMD_modoki/tree/main/src/scene/shaders/builtin-toon/) へ移しました。こちらは内部専用のToon処理であり、外部読込の対象ではありません。使用されていなかった旧template、balanced default、soft pastel、poster pop、cyber neon、luminous、light and shadowの7ファイルは削除しました。過去の調査メモにある`wgsl/*.wgsl`は当時のパスです。

API・保存の説明は [外部WGSL材質の使い方](https://github.com/togechiyo/MMD_modoki/blob/main/docs/external-wgsl-material-usage.md) を参照。

## 下地変更の確認結果（2026-09-13）

加算／乗算分離・グラデーション変更後は`npm.cmd run test:e2e -- external-wgsl-gem-base.spec.mjs external-wgsl-samples.spec.mjs`の4件とlintが通過。追加したWhite Opalを含む5種について、通常MMD・PBRで下地色の差とCOATING=0を確認しました。Classic / Frame Graphでコンパイル、静止・時間応答も確認し、白黒の明暗差とAuroraの縞がないグラデーションは出力PNGを目視確認しました。WebGPU validation errorは0件です。

自作fixtureの材質色を赤・青にした2種で、宝石4種の適用後も下地色による描画差が残り、COATING=0では元の画像を保持することを通常MMD・PBRのGUI読込とPNG比較で確認しました。専用のテクスチャ模様fixtureでの比較は未実施です。

`npm.cmd run test:e2e -- external-wgsl-gem-base.spec.mjs external-wgsl-samples.spec.mjs external-wgsl-pbr.spec.mjs` は6件通過。既存のClassic / Frame Graphでのコンパイル、角度・時間応答、PBRへの接続も再確認し、WebGPU validation errorは0件でした。関連unit 44件、lintも通過しています。

## 確認結果（2026-09-12）

自作の`sss-reference.pmx`でClassic / Frame GraphのローカルElectron E2Eを実施。装飾・テンプレートの6パッケージをGUIから読み込み、実GPUでのコンパイルとPNG描画を確認しました。テンプレートの既定値が元の画像を保持すること、装飾5種で色が変わること、Aurora Opalの0 → 90 → 0フレームで変化・再現すること、強さの編集が反映されることを画像のRGB差分で確認しています。角度依存の宝石3種は、カメラを固定した0・90フレームの画像が一致し、各効果の強さを0にした材質で描画が変わることも確認しました。WebGPU validation errorは0件。新作の画像と角度を変えた比較画像を出力して目視確認しています。

lint通過。組込13本は移動前後で説明コメント以外の本文一致を確認しています。任意のモデル・全材質プリセットとの組合せや動画ファイル出力の比較は未実施です。再確認コマンド: `npm.cmd run test:e2e -- external-wgsl-samples.spec.mjs`。

追加のMME入力教材3本も、両経路でGUI読込・ライト変更・格子の座標切替・時間同期を確認しました。サンプルで見つかった出力時の画面サイズ入力を修正し、960×640／640×360 PNGで32pixelの格子間隔を画像測定しています。詳細・確認範囲は [入力サンプルの解説](https://github.com/togechiyo/MMD_modoki/blob/main/docs/external-wgsl-mme-inputs-examples.md) を参照。再確認コマンド: `npm.cmd run test:e2e -- external-wgsl-inputs.spec.mjs`。
