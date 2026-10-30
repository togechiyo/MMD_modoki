# RC GIの実ステージ監査: 見える寄与と静止時負荷

作成日: 2026-10-30。対象実装: `ee0aa7e`。状態: **小さいfixtureでは改善したが、実ステージでのGI品質は未完了**。所有者からGIのON/OFFが目視では分からず、FPSは下がるとの報告を受けた。添付の街の`.x`画像には6 FPSと46 FPSの表示がある。明示的に利用を許可された`local-references/`内のモデルでPlaywright Electron検証を行い、この作業では製品コードを変更せず、診断用test・helperと記録を追加した。

[GI実装メモ](./rc-diffuse-gi-implementation-2026-10-30.md)のfixture成功を、任意のステージで十分な見た目・負荷を得られた証拠にはしない。今回の2件のE2E成功も、読込・操作・画像取得・中立復帰が成立したことを示すもので、GIの見た目の合格ではない。

## 対象と再現条件

| 対象 | 読込経路 | ローカル配置と権利確認 |
| --- | --- | --- |
| 灯台ステージ | 通常MMDのPMX | `local-references/stage/灯台ステージ/灯台ステージ.pmx`。同梱`ReadmeJ.txt`のCC0宣言を確認。Readmeには、海面がステージを超える大きさであることも記載されている |
| PowerPlant | OBJアクセサリ | `local-references/babylonjs/powerplant/powerplant.obj`。既存の`local-references/babylonjs/README.md`に出典・固定Git blob・CC BY 4.0を記録済み。Credit: BabylonJS/Assets contributors |

asset・texture・ユーザーのスクリーンショットはGitへ追加しない。スクリーンショットの街の`.x`モデルは許可されたreference配置に存在せず、今回そのモデルの読込や同じ6 FPSへの低下は再現できていない。

Windows上のローカルElectron / WebGPU、adapter情報は`vendor=nvidia / architecture=ampere`。physicsをOFF、地面・skydomeを非表示、背景を黒に固定した。画像は本番PNG経路の640×360、GPU/CPU計測時の描画は1280×720。カメラ、GI有効・強度、固定範囲はGUIから操作する。カメラの広域配置にはworld頂点の各軸5〜95%分位を使うが、GIの自動範囲はその分位へ変更しない。

- [任意実行のE2E](../test/e2e/rc-diffuse-gi-local-reference.spec.mjs)
- [形状・材質・光場の診断helper](../test/e2e/helpers/rc-diffuse-gi-reference-probe.mjs)
- [GPU/CPU計測helper](../test/e2e/helpers/rc-diffuse-gi-performance-probe.mjs)

通常実行ではskipする。対象assetが未配置の場合もskipする。GPUを使えるローカル環境で、他のElectron/GPU検証と並列にせず実行する。

```powershell
$env:MMD_RC_GI_LOCAL_REFERENCE = "1"
npm.cmd run test:e2e -- test/e2e/rc-diffuse-gi-local-reference.spec.mjs --workers=1
```

`MMD_RC_GI_REFERENCE=lighthouse`または`powerplant`で対象を絞れる。製品コードの状態を変えるための環境変数ではない。

## 有効な比較と破棄した試行

画像の結論に使う正本は`local-references/rc-gi-real-stage-2026-10-30/controlled-images/`配下の2つの`report.json`とPNG。実行ログは`controlled.txt`で、**2件成功**。両対象ともOFFへ戻した画像との差は全画面・前景とも厳密に0、page error・console error・WebGPU validationは0件だった。

全TypeScript lint・追加MJSの対象lintも成功。任意実行を無効にした通常条件では2件ともskipすることを確認した。製品TypeScriptは変更していないため、この監査ではunit・typecheck・smokeを再実行していない。

先行した`baseline-images/`では、OFF画像取得後のperformance準備によるresizeを比較の間に挟み、textureの状態差やノイズを含む画像になった。また、固定範囲の初回入力は数値欄のstepに合わない小数値を使っていた。これらの画像MAEや範囲比較はGIの改善・回帰の根拠から除外する。controlled版では計測準備と画像比較の順序を揃え、範囲入力を0.1単位に丸め、保存された値を確認した。

## GUIから切り替えた画像の差

下表は元の8bit RGB（0〜255）の前景MAE。黒背景を除き、OFF/ONのどちらかでRGB最大値が3を超える画素を前景とする。放射量・照度・物理的なGI精度の指標ではない。強度25は保存値0.5、100は保存値2に対応する。

| 比較 | 灯台ステージ | PowerPlant |
| --- | ---: | ---: |
| 広域表示・自動範囲・強度25 | 0.0281 | 0.6018 |
| 広域表示・自動範囲・強度100 | 0.1000 | 2.1589 |
| 広域表示・カメラ用分位から固定範囲・強度25 | 0.0100 | 0.5210 |
| 接近表示・自動範囲・強度25 | 0.0272 | 0.7157 |
| 接近表示・局所固定範囲・強度25 | 0.0803 | 0.2216 |

接近表示のカメラtarget/距離は灯台が`[0,40,0] / 450`、PowerPlantが`[0,8,0] / 160`。局所固定範囲の一辺はそれぞれ200と80。灯台は範囲を狭めると差が増えたが、PowerPlantは小さくなった。**手動で範囲を狭めるだけでは、一般的な解決になっていない。** 強度100で差が増えることも、近似や範囲の問題が解決した証拠ではない。

灯台の全前景には広い海面が含まれ、全前景平均は壁など局所的な寄与を薄める。そこで接近表示も確認したが、今回の見た目の確認では依然として弱い。平均値だけを理由に「全画素で無効」とはせず、実際に見たい受光面の領域を次の比較対象にする。`auto-25-difference-x16.png`は差を16倍した診断画像であり、通常表示の見た目として扱わない。

## 光場は生成されているが、受光位置への寄与が不足する

| 自動範囲の観測 | 灯台ステージ | PowerPlant |
| --- | ---: | ---: |
| volumeの一辺 | 21,600.0023 | 294.3384 |
| 最細16³格子のセル幅 | 1,350.0001 | 18.3962 |
| BVHの三角形数 | 92,809 | 113,937 |
| 反射率texture cache数 | 13 | 79 |
| baseの非ゼロ方向サンプル | 16,684 / 131,072 | 16,631 / 131,072 |
| 6軸照度atlasの非ゼロtexel | 10,204 / 24,576 | 13,704 / 24,576 |
| +Y軸の非ゼロprobe | 6 / 4,096 | 1,401 / 4,096 |

非ゼロはRGBのいずれかが`1e-8`を超えること。両方ともbaseと6軸atlasの全サンプルがvalidで、nearest情報も4,096 probeすべてvalid、三角形IDの範囲外参照は0だった。packed材質RGBは全入力三角形で非ゼロ、textureの未準備slotも0。これはfield生成全体が停止していない証拠であり、最終画素で十分な反射光を受け取れることの保証ではない。texture cacheの128枚上限にも達していない。

特に灯台は海面を含む実形状の横幅が約18,000あり、正しい頂点boundsを使っても全体を一つの立方体16³へ収めるとセルが大きい。床の上側probeが近隣の壁より高い位置へ置かれると、その壁はprobeから見て下側にある。床法線が読む+Yの光場には入りにくく、床より下のprobeは受光面前方の重み付けで抑えられる。この仕組みは寄与の消失候補だが、今回の統計だけで全画像の主因を一つに確定しない。

近傍2三角形の接続遮蔽も、遮られたprobeの重みを分母へ残すため、細い通路・壁際で過小な寄与を作り得る。現時点では受光点ごとの遮蔽前後の重みを測っておらず、nearest guardが支配的だったとは断定しない。

## 静止状態でも残る負荷

8 frameのwarm-up後に24 frameを同じprocessでOFF/ON計測した。下表は平均値で、GPU render pass合計とCPU時間を分ける。CPU controller時間はsource更新を内包するため、両者を足さない。

| 指標 | 灯台ステージ | PowerPlant |
| --- | ---: | ---: |
| GPU render OFF | 1.0764 ms | 1.5087 ms |
| GPU render ON | 1.8471 ms | 2.6648 ms |
| ON時のCPU source更新 | 4.0404 ms | 2.7954 ms |
| ON時のCPU controller全体 | 4.4015 ms | 3.1827 ms |
| ON時のfield更新 / 計測frame | 0 / 24 | 0 / 24 |
| ON時のcompute dispatch | 0 | 0 |

静止fieldの再利用は動いている。今回の定常窓ではproducerを毎frame再実行しておらず、それでも材質参照のGPU費用とCPU source検査が残る。これは同一processの診断で、独立processの速度比較や低性能PCのFPS保証ではない。GPU pass合計をframe全体の時間と同一視せず、所有者の46→6 FPSという倍率にも換算しない。

sourceは静止時も位置・index・UVなどの値を比較する。[入力snapshot](../src/render/luminous-radiance-input-cache.ts)と[scene source](../src/render/luminous-radiance-scene.ts)の経路から、データ量に応じたCPU走査が残ることを確認した。灯台ではGIへ入る三角形が0の7 mesh、計33,780頂点もsource snapshotに残り、不要なpose/頂点処理を避ける余地がある。一方、今回の両assetは各meshのsubMeshが最大1個であり、同じUV列を多数のsubMeshごとに重複走査するケースは再現していない。一般的なコード上の費用候補と、この2対象で確認した原因を混同しない。

## 所有者のスクリーンショットとの関係

`screenshot-comparison.json`は、所有者が提示した画像を元の8bit RGBのまま比較した別の証拠である。ファイル名からON/OFFを推定しておらず、controlled版のasset・カメラ・設定と同一条件でもない。

- ステージ画像の幾何領域MAEは9.8128、左壁は20.3333、右壁は10.3234。局所的には明確な差があり、「完全に何も変わらない」とは言えない。
- 街の画像の前景領域MAEは0.4068、中央道路は0.3359、右道路は0.4577。道路の変化はおおむね8bitの1段階以下という観測と整合する。
- 両比較の背景control領域は差0。選んだ矩形と画像差の説明であり、GIの物理的な正しさやFPSを測ったものではない。

`.x` loaderはPNG/BMP/TGA/WebPなどの拡張子をalpha対応と判定し、材質alphaが1でもalpha-testへ設定する。現GIはalpha-test面を受光・反射元・BVH入力から除くため、完全不透明なtextureでも対象外になる可能性がある。**スクリーンショットの街の材質情報は取得しておらず、その原因とするのは仮説に留まる。** PMX/OBJで確認した結果を、そのまま`.x`の互換性確認へ代用しない。

## 次の改善候補

以下は今回の観測からの候補であり、所有者が採用済みの新方針ではない。追加gainや格子数の一律増加を先に行わず、軽い既定を保つ条件で比較する。

1. 見たい受光領域へprobeを配分する局所volumeや、高さ方向を含む配置・再構成を比較する。範囲を外れた受光面と、場には光があるのに受け取れない面を区別する。単なる手動縮小の今回の値を解決策として固定しない。
2. 空のsource meshを早期に除き、geometry・UV・材質・poseの変更条件に応じたcacheを検討する。静止時の毎frame全量比較を減らす場合も、材質編集・読込途中・骨/モーフ・seek・出力で古い入力を使わない契約を保つ。
3. 同じ受光面の領域で、光場の寄与、前方重み、近傍guard前後、最終8bit差を分けて観測する。広域平均だけで見た目を合格にせず、実ステージの接近表示と静止/変形時の負荷を一組として再確認する。

製品実装はこの監査では変更していない。今回の実ステージ品質は未完了のまま、上記の根拠を次の実装・検証の開始点とする。
