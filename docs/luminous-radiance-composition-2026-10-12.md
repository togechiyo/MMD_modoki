# 3D RC の材質色を使う照明合成

実装・確認日: 2026-10-12

所有者から、RC 範囲の操作値30付近がよさそうだが、白くかすみがちという実機報告があった。既存の平面 Luminous の合成を参考に調整する依頼を受け、Frame Graph の RC 合成を変更した。範囲・強度の保存値と既存 Glow 自身は変更しない。

## 既存 Glow との関係

平面 Luminous は core / halo を合計して `color / (1 + color)` で圧縮し、スクリーン合成と `base + glow * 0.78` の加算を `0.48` で混ぜている。これは発光のにじみとして扱う合成である。

以前の RC は圧縮した光を表示色へスクリーン合成していた。受け手の材質色を使わず、黒い材質にも白い光を足せるため、材質のコントラストを弱める原因になる。画像だけから、実機のかすみの全原因をこの式だと確定したものではない。

新しい RC は Glow の圧縮と加算係数 `0.78` を参考に、次の順で合成する。

1. 線形 RGB の到来光 `L` を、RGB共通の `1 / (1 + max(L))` で圧縮する。チャンネルごとの圧縮で発光色が白へ寄ることを抑える。
2. 圧縮後の光へ線形の材質色 `A` と `0.78` を掛ける。強度を上げても、黒い材質と白い材質の反射率の差を残す。
3. 現行 scene color を局所的に `pow(base, 2.2)` で線形化し、上記の寄与を加算する。暗い影の画素へも材質色の光が入る。
4. ハイライトの上限を超えるときだけRGB共通の係数で圧縮し、表示色へ戻す。背景・寄与ゼロ・alpha は維持する。

概略は `added = A * L / (1 + max(L)) * 0.78`。receiver gather の `4 / 32` は Lambertian の正規化を含むため、合成側でさらに `1 / π` を掛けない。

RC 合成の後に従来の Glow を実行する。Glow 強度0でRCだけを確認でき、Glowの白い芯やにじみは引き続き別の寄与として調整できる。

## 受け手の材質色

RC ON のときだけ、共有 geometry renderer に全解像度のRGBA16F albedo attachmentを追加する。資源計画では通常の色RTと分けて `radianceAlbedo` とする。RC OFF / 全体 OFF / backend変更の既存再構築で、この資源とRC task群を解放する。

Babylon.js 9.2.0 の Standard / MMD Standard の標準albedo出力は `baseColor` であり、材質の `diffuseColor` を含まない。これをそのまま使うと、テクスチャを持たない赤・青・黒の材質も白い受け手になる。そのため WGSL MaterialPlugin で、この出力だけを `toLinearSpace(baseColor * vDiffuseColor)` に置き換える。テクスチャ・頂点色も `baseColor` を通じて含まれる。

置換はRC geometry passのrenderPassIdへ限定し、他のpassでは元の出力を使う。passごとのuniformは `hardBindForSubMesh` で更新する。extra event登録を有効にしてからpluginをactivateし、graph破棄でpass登録と新規材質observerを外す。pluginはWeakMapに保持して再利用し、projectや材質へserializeしない。材質追加の通知はbase constructor内で発火するため、Standard / MMDの初期化が終わるmicrotaskまで待つ。

PBRは既存の `surfaceAlbedo` が線形の材質色を含むので、その出力を使う。metalness・roughness・Toon・鏡面BRDFを再評価する処理は追加しない。

## fixture での確認

ユーザー所有assetは使わず、GUIからLuminousを割り当てた配布可能なtofu材質と自作geometryを使った。

- 従来の黒い床材質と既存照明を混ぜた検証から、反射率0.6の床を通常照明なしで置く条件へ変更。RC OFFで黒く、赤・青の二光源で床が照らされることを確認する。
- RC動作中に暖色・青のMMD材質、黒・白のStandard材質を追加。白い光、RC強度の操作値100で、床と箱の色が保たれることを確認した。
- 箱の上面の平均RGBは暖色 `(178, 89, 44)`、青 `(22, 67, 178.2)`、黒 `(7, 7, 7)`、白 `(178, 178, 178)`。geometry readbackも `diffuseColor^2.2` と一致する。通常照明を併用した場合も暖色・青の優位性と黒/白の差を確認する。
- 赤・青同時発光、色変更の独立性、画面外光源、遮蔽、カメラ移動後の同じ床位置、発光textureのUV変更、PNG、Glow併用、stack並べ替え、RC OFF/ONを確認する。
- 境界の残光は、表示色の絶対差から、線形化した光量が内部の10%未満という判定へ変更。材質反射率と表示曲線が変わるため、以前の画素値そのものを新しい明るさの期待値にしない。
- 保存読込、全体OFF/ON、Classic / Frame Graph往復の既存E2Eも対象にする。

実行結果:

- `npm.cmd run test:e2e -- luminous-radiance.spec.mjs`: ローカルElectron / WebGPUで5件中4件成功。texture / 境界の1件は旧表示色の絶対差 `< 15` に対して `24.5` となり、判定だけを上記の線形光量比へ修正してfocused再実行で成功。全5シナリオを確認済み。WebGPU validation / page errorは0。
- `npm.cmd run test:unit`: 180 files / 1073 tests成功。式の黒反射率・寄与ゼロ・暗い影への照明・色相・強い光での黒/白の差と、installed shaderの置換対象を確認。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: 成功。内側のtypecheckには非criticalの既存baselineが残る。新規RC合成・albedo・resource plan部分に型エラーなし、`TS2304` / `TS2552`なし。
- `npm.cmd run smoke:launch`: ローカルElectronのWebGPU初期化と安定性確認に成功。

## 制約と一次情報

現行のscene colorを局所的にガンマ2.2で線形化する近似であり、scene全体のHDR・色管理・tone mappingを作り直したものではない。Luminousより前にGamma等を並べた場合は、その加工後の色を入力として使う。Toonの照明・PBRの完全なBRDFと同じ計算にはならない。SSGI等を併用すると間接光の寄与も重なる。

albedo attachmentの追加と初回plugin追加にはGPUメモリ・shader準備の費用がある。実ステージでの見た目と負荷は所有者の再確認待ち。PBR専用の実描画比較は未実施。有限の格子や方向数による光漏れ・段差の制約も残る。

[公式 MaterialPlugin 文書](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/) と [Frame Graph task一覧](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList/) を、依存中の `MaterialPluginManager`、`geometryRendererTask`、Standard `default.fragment`、PBR `pbrBlockPrePass` のWGSL sourceと照合した。Standardの材質色が標準albedoに含まれない点と、pluginのextra eventの登録順はinstalled sourceおよびローカルGPUで確認している。
