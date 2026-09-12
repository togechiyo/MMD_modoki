# MMEを参考にした外部WGSLの入力設計 2026-09-12

## 目的と資料

所有者は上級者向けの表現の自由度を重視し、MMEの変数名・用途・設計へ寄せられる部分を調査するよう指示した。本稿はその調査と設計案。書式・対応範囲は未確定で、実装変更はない。

同日の後続判断でBabylonのWGSL基盤とMME風semanticを組み合わせる方向を採用。[材質API v1 詳細設計](./external-wgsl-material-api-v1-design.md)を現在の実装提案の正本とし、本稿の宣言例・入力候補は調査時点の案として残す。

MME仕様の参照先は、配布版v0.37のREFERENCE.txtを移植したと明記する[MME Reference](https://kamedesuyo.github.io/MME_REFERENCE/)。作者配布アーカイブとのバイト一致は未確認。仕様本文の転載として参照し、他アプリ独自の拡張をMME仕様へ混ぜない。基礎となるFXの仕組みは[MicrosoftのEffect資料](https://learn.microsoft.com/en-us/windows/win32/direct3d9/using-an-effect)で照合した。

## 参考にする仕組み

FXでは作者の変数に意味を示すsemanticと補助情報のannotationを付け、ホストが対応する値を設定する。変数名そのものを固定する必要はない。[Microsoftの説明](https://learn.microsoft.com/en-us/windows/win32/direct3d9/using-an-effect#use-semantics-to-find-effect-parameters)

MME側の代表的な対応は以下。[パラメータ仕様](https://kamedesuyo.github.io/MME_REFERENCE/sections/section2.html)

| Semantic | 意味・補助指定 |
| --- | --- |
| `WORLD` / `VIEW` / `PROJECTION` / `WORLDVIEWPROJECTION` | 座標変換。逆行列・転置の派生もある |
| `DIFFUSE` / `AMBIENT` / `SPECULAR` | `Object`でGeometryとLightを区別 |
| `POSITION` / `DIRECTION` | `Object`でCameraとLightを区別 |
| `MATERIALTEXTURE` / `MATERIALSPHEREMAP` / `MATERIALTOONTEXTURE` | 材質の各texture |
| `TIME` / `ELAPSEDTIME` | 秒単位の時刻・描画間隔 |
| `VIEWPORTPIXELSIZE` | 画面の幅・高さ。逆数ではない |
| `CONTROLOBJECT` | `name`、`item`、型に応じたオブジェクト・ボーン・表情の参照 |

時間には `SyncInEditMode` があり、既定falseでは編集中に実時間を使う。trueのelapsedはシークで負にもなる。viewportサイズはScriptでの描画先変更には追従しない。これらを別の意味で実装する場合は差分を明記する。[同仕様](https://kamedesuyo.github.io/MME_REFERENCE/sections/section2.html)

`MMDPass`は `object` / `object_ss` / `edge` / `shadow` / `zplot` の描画用途を選ぶ。`shadow`は地面影、`zplot`はセルフシャドウ用である。`Subset`は材質番号等の対象条件、techniqueは条件に応じたpassの集合。[Technique仕様](https://kamedesuyo.github.io/MME_REFERENCE/sections/section1.html)

複数passの順序、描画先、クリア、Geometry/Buffer描画はScriptで制御する。入力変数を供給するだけでは、この描画機構まで互換にはならない。[Script仕様](https://kamedesuyo.github.io/MME_REFERENCE/sections/section3.html)

## MMD_modoki向けの提案

### 作者の名前とsemanticを分ける

作者は任意のWGSL識別子を付け、MMEに馴染みのあるsemanticを添付JSONで指定する。以下は新規提案であり、既存MME/WGSLの書式ではない。

```json
{
  "apiVersion": 1,
  "inputs": {
    "MaterialDiffuse": {
      "type": "vec4f", "semantic": "DIFFUSE",
      "annotations": { "Object": "Geometry" }
    },
    "CameraPosition": {
      "type": "vec3f", "semantic": "POSITION",
      "annotations": { "Object": "Camera" }
    },
    "Time": {
      "type": "f32", "semantic": "TIME",
      "annotations": { "SyncInEditMode": true }
    }
  }
}
```

アプリが生成する入力structの `inputs.MaterialDiffuse` 等を作者コードが参照する案。最初は入力structと出力structを受け渡す関数として組み立て、内部のuniform配置・binding番号はadapterが管理する。texture/samplerは別resourceとして生成し、structへ直接格納しない。[WGSLのresource interface](https://www.w3.org/TR/WGSL/#resource-interface)

Babylonの内部変数を公開名の正本にしない。既存Toon文字列置換はadapterの実装候補として扱い、APIの用途を固定する根拠にはしない。WGSLの関数やreturnを一律禁止する現在のvalidatorは新形式には引き継がない。

### 入力の意味を仕様化する

- 型、単位、座標系、方向の正負、色空間、alpha、モーフ適用前後、利用できる描画段階を一覧にする。行列は格納順だけでなく乗算方向とclip/depth規約まで決め、点・法線を使ったfixtureで照合する。
- `TIME`はMMEの明示指定を受けられる形を検討する。再現用templateでは `SyncInEditMode=true` を明記する案。既定値変更を採用する場合は互換差分とする。elapsedはpassごとに進めず、出力fps・シーク・停止の扱いを揃える。
- カメラviewportと作業用RTのサイズを区別する。新しい「現在のpassのサイズ」が必要なら独自semanticを追加し、MME名へ違う意味を与えない。
- `CONTROLOBJECT`に相当する接続は、宣言をロード時に解決し、projectにはinstanceId等で選択先を保存する案。同名モデルが複数ある場合の選択、削除後の未解決状態、評価タイミングを仕様化する。骨・モーフ更新後に値を採取できるか確認する。
- 独自semanticは名前空間で分ける。対応していないsemantic・不正な型・足りないresourceは明示エラーにする。

### 描画用途と差し込み位置を分ける

MMEの `MMDPass` と、現在の「ライトごとのToon計算位置」は別の軸である。描画用途、材質内の呼出位置、入力resourceを分離する案。材質編集、発光、post effectへ拡張できる形を先に整理する。

`RENDERCOLORTARGET`等を参照名に採る場合も、実際のresource作成・依存関係はFrameGraph側へ接続する必要がある。MMEの命令列をそのまま走らせる方針は未採用。shadow関連passの公開も、既存の全体影設定を変更する許可にはならない。

### チェックと作者支援

宣言の構造・型・semantic対応・resource依存を先に確認し、組立済みWGSLは実コンパイルする。エラー位置を作者ファイルへ対応付け、適用失敗時は直前の正常状態へ戻す。生成後sourceの閲覧も用意したい。

初期成果物は入力対応表、MMEとの差分表、最小template、材質色/時刻/操作対象参照のsampleを想定する。実装順は既存の[保存と復帰の課題](./external-wgsl-reopening-review-2026-09-12.md)と合わせて決める。仕様の段階導入は用途の恒久的な制限と区別する。

## 外部ツールとの接続

外部ツールからの持込候補として、[NMEのJSONと生成WGSLを調査](./node-material-editor-wgsl-import-review-2026-09-12.md)した。NMEは別adapterで受け、MME風入力とは明示的に対応付ける案。生成shaderの内部変数名を共通APIへ固定しない。

## 未確認

MME本体との実行比較、行列・光色の数値一致、出力時刻、GPUコンパイル、提案形式のGUIは未確認。本稿は仕様調査であり、MME互換や既存fxの読込対応を保証するものではない。
