# Xアクセサリの不透明PNG・Accessory ToonへのRC対応

作成日: 2026-11-01。[窓付き室内検証](./rc-window-room-verification-2026-10-31.md)で確認したXの適用漏れに対応する。対象は不透明PNGのGI・天空遮蔽と、Accessory Toonの天空遮蔽。室内GIの残留・色移り・再構成の変更は含めない。

## 変更

Xのdiffuse PNGを、材質生成前に読み込み・デコードし、すべての画素のalphaを確認する。全画素255と確認できた画像はopaque材質として作り、GIの反射入力・受光・遮蔽物、および天空遮蔽の対象にする。少しでも透明な画素がある画像、確認できなかった画像は従来のcutout扱いを保つ。材質自体のdiffuse alphaが半透明の場合はblendを優先する。

判定をtextureの非同期onLoad後に差し替えず、X loaderの返却前に完了させる。材質presetが初期の透明設定を保存するより先に確定するため、presetの切替・project復元時にも不透明PNGがcutoutへ戻らない。

天空遮蔽の受光presetに`wgsl-accessory-toon`を追加する。既存のMMD材質pluginをそのまま使い、透明材質、外部・独自shader、lightmap、diffuse Fresnel等の除外は維持する。効果はFrameGraphの既存カードから操作する。

## 負荷と境界

- PNGの解析はロード時だけ。同じロード内で同じURLを複数材質が参照しても結果を共有する。
- URLだけの永続cacheは作らず、別ロードでは再確認する。同じpathの画像を差し替えた場合に古い判定を残さない。
- 全画像を巨大なCanvasへコピーせず、原寸の行単位で全alphaを調べる。縮小・間引きで小さな透明部分を見落とす方法は使わない。
- 判定対象は各辺8192px以下、encoded bytes 64MiB以下。CanvasとImageDataは128行ずつ（各最大4MiB）だが、デコード画像本体は8K正方形なら約256MiBになり得る。5秒の待機上限はI/O・decode待ちへのfallbackで、同期の画素走査を途中中断する期限ではない。
- 解析用decodeは同一import・同一URLで1回。描画用の通常のTexture読込は別に残る。ロード時間の追加はあるが、フレームごとの解析はない。解析用Blob URLは成功・失敗・timeoutで解放し、遅れて完了したImageBitmapも閉じる。
- BMP/TGA/WebP、APNG、判定失敗等は従来の扱いを保つ。未確認を不透明と決めつけない。
- 描画中の画像走査、GPU readback、追加の描画passは導入しない。RCのgrid・方向数・三角形budgetは変えない。今まで除外されていた面が参加する分の通常のRC計算は発生する。

## 確認

`test/e2e/rc-window-room.spec.mjs`の7条件を、sandbox外のローカルElectron / WebGPUで直列実行した。全ケース成功（plainは再実行）。第三者モデルは使わず、自作の同一26三角形の窓付き部屋を使用する。XはGUIのSiを0.1にしてPMXと実頂点のworld寸法を揃える。固定volume・光・カメラ・ROIは[前回の比較条件](./rc-window-room-verification-2026-10-31.md#再現入力と比較条件)を継続した。

以下は640×360 PNGのON−OFF差、代表R成分の0〜255階調。GIとSkyは異なる主光方向で各々を比較する。物理照度やFPSではない。

| 入力・既定preset | GI 窓下白壁 | Sky 室内奥の白床 | 結果 |
| --- | ---: | ---: | --- |
| X・textureなし・Accessory Toon | +54.90 | −38.45 | 両効果が可視 |
| X・不透明PNG・Accessory Toon | +54.90 | −38.45 | JPEG / textureなしと同じROI値。両効果が可視 |
| X・不透明JPEG・Accessory Toon | +54.90 | −38.45 | 既存のGIと追加したSkyが可視 |
| PMX・通常MMD / Toonなし | +33.96 | 0 | 従来どおり。Skyが減らすToon残光を持たないfixture |

PMXをLight & Shadowへ変更したSkyと、Xを通常MMDへ変更したSkyも確認した。PMX / textureなしXは窓の遮光板追加・削除を通し、RC入力三角形数26→28→26、閉窓時のGI低下、再開口後の画像差0を確認した。室内GIの小さな残留や色移りの弱さ、面境界のむらは前回からの残件で、この対応で品質問題全般が解消したとはしない。

透明対照は次の3条件を追加した。すべてGI反射入力・受光、Sky受光の対象外を維持し、効果ON/OFFで画像は中立だった。

- 最後の1画素だけalpha254: Cutoutを維持。残りの不透明な面は表示される。
- 左半分alpha0のPNG: Cutoutを維持。壁の透明側ROIは黒背景、不透明側はR平均121で、実際の抜けを画像でも確認した。PNG出力は背景合成済みなので、出力alphaが0になることを合格条件にしない。
- 材質alpha0.5・textureなし: Blendを維持。同一プロセスでGUIから読み直した不透明対照は壁R平均121、半透明側は60となり、半透明の表示を確認した。

この透明対照は部屋全体が同じ透明条件のため、透明・不透明が混在するsceneでの他材質への遮蔽影響までは画像比較していない。

不透明PNGではGI＋Sky同時ONのproject保存・読み込み、Classic→FrameGraph往復後の設定・Accessory Toon・不透明設定の維持を確認。復元後PNGの平均絶対差はどちらも0。Classicではカード非表示と保存値維持を確認し、Classic描画中のRC残留を別途画像検証したとはしない。描画を安定させた後の30実フレームで、GI / Skyともsource revisionとfield revisionが変化せず、静止中の更新再利用を維持した。低性能PCや大規模sceneのFPS測定は今回行っていない。

比較画像は目視でも確認し、不透明PNGのGI明化・Accessory ToonのSky暗化・透明PNGの抜け・Blend表示を確認した。全成功ケースでWebGPU validation / page error / console errorは0件。

| 確認 | 結果 |
| --- | --- |
| fixture生成器の実parser・画像decode照合 | 成功。透明3variantを追加し、alpha分布も検査 |
| 全unit | 229ファイル、1,443件成功 |
| 全lint | 成功 |
| `typecheck:critical`（通常typecheckも内包） | critical 0件。通常typecheckは既存547件、今回のloader/helperに新規エラーなし |
| ローカルElectron E2E | 対象7条件成功。初回6成功、plainは全編集停止で通常cache / 新規cacheの各1回成功 |

出力はignoredな`local-references/rc-x-support-2026-11-01/final/`、plain再確認は`plain-recheck/` / `plain-cold-recheck/`。各`report.json`と比較PNGを保持する。初回typecheckはVite cache生成と競合して一時ファイル未検出となったため、cache安定後に再実行して547件のbaselineを確認した。

初回plainは途中で部屋・カード・照明・物理が初期状態へ戻り、GIのready待機が失敗した。traceの初期化区間19:05:19.992〜19:05:26.680 JSTと、作業中の文書更新19:05:20が一致する。installed Tailwind Vite pluginにはscan対象asset変更からfull reloadする経路があり、文書編集による開発サーバー再読込の干渉と推定する（navigation event自体はtrace未収録）。コード・テストを変えず、文書も含めた全編集停止で通常cache / 新規cacheとも完走した。GPU検証中はsource以外の監視対象も編集しない。

## 参照

- [fixtureと読込倍率](../test/fixtures/rc-window-room/README.md)
- [fixture/reference台帳](./test-reference-asset-ledger.md)
- [材質alphaの分類方針](./material-alpha-coplanar-rendering-policy-2026-08-20.md)
- [W3C PNG: alpha representation](https://www.w3.org/TR/png-3/#6AlphaRepresentation) / [tRNS](https://www.w3.org/TR/png-3/#11tRNS): alpha channelの有無と実透明度は異なり、palette/truecolorにも透明指定がある。
- [WHATWG Canvas pixel manipulation](https://html.spec.whatwg.org/multipage/canvas.html#pixel-manipulation): `getImageData`にはorigin-clean等の失敗条件がある。取得できない場合の保守的fallbackを維持する。
- Babylonの`LoadImage`/`LoadFile`はinstalled 9.2.0の`Misc/fileTools.js`と[一次source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Misc/fileTools.pure.ts)を照合する。明示的に対象sceneのengineを渡し、別のengineを暗黙選択させない。masterのfile分割後のsourceを9.2.0そのものとは扱わない。
