# MME風の自動入力を使うWGSLサンプル

更新: 2026-09-12

アプリが現在の材質・ライト・カメラ・時間から更新する値を、manifestの`inputs`で受け取る教材。値を手で設定する`parameters`と区別して使う。いずれも外部材質API v1のMMD材質向けで、テクスチャ入力は不要。

## 変数名・semantic・Objectの関係

```json
"inputs": {
  "MaterialDiffuse": {
    "type": "vec4f",
    "semantic": "DIFFUSE",
    "annotations": { "Object": "Geometry" }
  },
  "LightDiffuse": {
    "type": "vec3f",
    "semantic": "DIFFUSE",
    "annotations": { "Object": "Light" }
  }
}
```

WGSLでは`modokiInputs.MaterialDiffuse.rgb`、`modokiInputs.LightDiffuse`として読む。作者が決める変数名は`MaterialDiffuse`の部分。アプリが何を渡すかは`semantic`と`annotations.Object`で決まり、同じ`DIFFUSE`でも材質とライトで値・型が違う。予約名以外なら変数名を変更できるが、WGSL内の参照も揃える。

この教材の名前はMMEの概念に寄せた独自APIの名前であり、`.fx`本文やHLSLの宣言をそのまま読む機能ではない。binding番号、uniform構造体、エントリーポイントはアプリが用意する。

## 1. 材質・ライト・視点

[定義](../wgsl/mme-light-material/effect.modoki.json) / [WGSL](../wgsl/mme-light-material/main.wgsl)

| 変数 | semantic / Object | 実際に使うところ |
| --- | --- | --- |
| MaterialDiffuse | DIFFUSE / Geometry | 材質自身のRGBを簡易拡散色にする。RGBAのalphaはhost側で保持 |
| MaterialAmbient | AMBIENT / Geometry | 材質の環境色を暗部へ加える |
| MaterialSpecular | SPECULAR / Geometry | 光沢の色 |
| MaterialSpecularPower | SPECULARPOWER / Geometry | ハイライトの鋭さ |
| LightDiffuse | DIFFUSE / Light | 主方向ライトの現在色 |
| LightDirection | DIRECTION / Light | 法線との内積による受光量 |
| CameraPosition | POSITION / Camera | 視線ベクトル、ハイライト、リム |

「表示」を0〜4へ変えると、合成した簡易照明／材質色／ライト色／光沢／リムを個別に見られる。アプリのカメラ編に切り替え、照明欄で方向X・Y・Zや照明R・G・Bを変えると再読込なしで反映される。材質色は読み込んだ材質の値に従い、カメラを回すとハイライト・リムが変わる。教材パラメーターを編集するときはモデルを選び直し、必要ならエフェクトパネルの材質タブを開く。

`DIRECTION`は光が進むworld方向。光源へ向かうベクトルにするときは符号を反転する。材質の`DIFFUSE`はtextureを掛ける前の色、`AMBIENT`はscene環境光の強さではない。ライトの`DIFFUSE`にはintensityやshadow mapを含めない。

この例はfinalColorで簡易照明を返す教材。「教材表示の強さ」1では元の照明結果・テクスチャ・受ける影を置き換える。0なら元の最終色へ戻る。全ライトやshadowを含む通常材質の再実装ではない。光沢色が黒い材質では「光沢」表示も黒くなる。

## 2. 行列と画面サイズ

[定義](../wgsl/mme-space-grid/effect.modoki.json) / [WGSL](../wgsl/mme-space-grid/main.wgsl)

| 変数 | semantic / Object | 実際に使うところ |
| --- | --- | --- |
| World | WORLD / Geometry | transpose(World)でworld法線をlocal側へ戻す |
| WorldInverse | WORLDINVERSE / Geometry | hookのworld位置をmesh側へ戻す |
| WorldViewProjection | WORLDVIEWPROJECTION / Geometry | mesh側の位置をclip座標へ投影 |
| ViewportSize | VIEWPORTPIXELSIZE / 指定なし | 正規化した画面座標を描画pixelへ変換 |

既定は左右比較。左半分に青緑の物体格子、右半分に橙の画面格子を重ねる。「格子」0なら全体を物体格子、1なら全体を画面格子にする。カメラを回したり拡大すると、物体に付いた模様と画面に固定された模様の違いが分かる。物体格子は面の向きに応じて投影軸を切り替えるため、その境界で向きも切り替わる。

WGSLの計算順は`matrix * vector`。`WorldViewProjection`へはlocal位置を入れる。`positionWS`を直接入れるとWORLDを二重に適用してしまう。mesh側へ戻してもスキニング前のrest座標を復元するわけではない。

`VIEWPORTPIXELSIZE`は幅・高さで、逆数ではない。格子の間隔32pixelはPNG出力でもその出力画像のpixel基準になる。線幅の計算には微分`fwidth`を使う。画面の左右判定をする前に、微分を含む両方の格子を評価している。

## 3. 時間とフレーム

[定義](../wgsl/mme-time-scan/effect.modoki.json) / [WGSL](../wgsl/mme-time-scan/main.wgsl)

| 変数 | semantic / 指定 | 実際に使うところ |
| --- | --- | --- |
| TimelineTime | TIME / SyncInEditMode=true | タイムラインに同期する走査線 |
| PreviewTime | TIME / SyncInEditMode=false | 停止中も進む走査線 |
| TimelineDelta | ELAPSEDTIME / SyncInEditMode=true | 編集frameの変化量を色にする |
| PreviewDelta | ELAPSEDTIME / SyncInEditMode=false | 停止中の実時間更新量を色にする |
| Frame | MODOKI_FRAME | 1frameずつ進む縞。MME互換名ではなく独自拡張 |

「時計」0では停止中に静止し、0 → 15 → 0フレームで模様が変化・復帰する。「時計」1では停止していてもviewportの走査線が進む。再生時はどちらもタイムラインに従う。

「表示」1はelapsed診断。更新量0は暗色、正は青、負は赤になる。タイムライン時計の逆シークを含む変化は短い更新なので一瞬しか見えない場合がある。`ELAPSEDTIME`は累積時間ではなく更新間隔。状態を持たないこのshaderで値を積算せず、周期的な模様には絶対時刻の`TIME`を使う。

「表示」2はフレーム縞。`MODOKI_FRAME`が0と15では縞が反転する。「時計」の選択に影響されない。

**静止画出力では両TIMEが出力frame/30、両ELAPSEDTIMEが0になる。** したがって時計1の停止中の動きを確認する場合はviewportを見る。動画も出力schedulerの時刻を使う。これは実時間の速度差で書き出し結果が変わることを防ぐための契約。

API全体は [使い方・実装範囲](./external-wgsl-material-usage.md)、他の作例は [wgsl一覧](../wgsl/README.md) を参照。

## サンプル作成で見つかった入力の修正

`VIEWPORTPIXELSIZE`を描画時の`engine.getRenderWidth()/getRenderHeight()`で取得すると、PNG出力先とは異なる中間バッファ寸法を返す場合があった。ローカルのBabylon.js 9.2.0では640×360出力中にも1152×648が渡り、32pixel指定の格子が約18pixelになっていた。

作品を描く寸法というAPI v1の契約に合わせ、hostが保持するexport surfaceの幅・高さを優先し、通常viewportではcanvas寸法を渡すように修正した。Classic / Frame Graph共通で、出力終了後はviewportへ戻る。カメラのoutputRenderTargetだけではFrame Graphの出力先を表せないため、host側で選択する。

一次情報: [Babylon.js WebGPUEngine API](https://doc.babylonjs.com/typedoc/classes/BABYLON.WebGPUEngine#getrenderwidth)。導入済み`node_modules/@babylonjs/core/Engines/webgpuEngine.js`の同メソッドも照合し、`useScreen=false`は現在のRT、`true`はcanvasを返すことを確認した。

## 確認結果（2026-09-12）

自作fixture `test/fixtures/external-parent/sss-reference.pmx`を使い、Classic / Frame GraphのローカルElectron E2Eで3本をGUIから読み込み・適用した。

- 照明方向・照明RのGUI変更、材質DIFFUSE／ライトDIFFUSEの切替による画像変化。
- 物体格子／画面格子の切替。960×640と640×360のPNGで画面格子の間隔が32pixel（画像測定の許容差±1pixel）。
- TIMEの0 → 15 → 0frameで画像変化・再現。停止中の非同期時計はviewportで進み、PNGでは同期時計と同一画像になる。
- elapsedの静止画診断を出力。MODOKI_FRAMEの0／15frameで縞が変化。
- WebGPU validation errorとpageerrorは0件。格子と走査線の出力画像も目視確認。

lint通過、単体テスト774件通過。`typecheck:critical`内の通常型検査では非criticalな既存系診断542件が残るが、TS2304/TS2552は0件。外部WGSLモジュールと今回のhost入力追加箇所に診断なし。動画実ファイル、任意モデル・全presetでの比較は未実施。

再確認: `npm.cmd run test:e2e -- external-wgsl-inputs.spec.mjs`。
