# 3D RC の形状上限による消灯の修正

実装・確認日: 2026-10-12

所有者から「光回らなくなってる。平面の既存ルミナスだけ光る」と報告された。添付画像はFrame Graph / WebGPU、RC ON、RC強度の操作値100、範囲30、Glow強度25、18 FPS。ユーザー所有のモデルは探索・読込せず、既存app logのrender warningだけを確認した。

## 原因

16:21〜16:24のログに`3D RC supports at most 100000 opaque triangles`があり、RC形状収集が上限超過として拒否されていた。従来の実験用上限はmesh単体とscene合計の両方にあり、超えると入力を空にしてRCのreceiver / compositeを停止する。既存Glowは独立しているため、そのまま看板等が発光する。

この報告で確認できた停止原因は形状数の上限である。直前の4点補間や合成の明るさは変更しない。既存E2Eの最大約3.3万三角形ではこの条件を網羅していなかった。

## 修正

- RC形状の上限を最大100万三角形へ拡張する。1三角形は24個のf32（96 bytes）なので、最大のtriangle storage bufferは96,000,000 bytes。
- Babylon.js 9.2.0の公開`WebGPUEngine.currentLimits`で実行deviceの`maxStorageBufferBindingSize`と`maxBufferSize`を取得し、小さい方の制約に収まる三角形数へ制限する。adapterだけが対応している未要求の上限は使わない。
- 有効・表示中のindexed Meshと`alpha >= 0.99`のsubmeshを先に数え、超過時はCPU骨変形、triangle展開、emission texture準備より前に拒否する。繰り返し大きな配列を作ることを避ける。総数と上限をerror診断と既存warnへ残す。
- 展開先を最初からFloat32Arrayで確保し、大きなJavaScript number配列からのコピーを省く。必要な量だけ確保し、100万分のbufferを常時予約しない。
- 形状、発光色、UV、遮蔽を間引かない。input snapshot、静止field cache、強度0での停止、半解像度・長辺640以内のreceiverを維持する。

100万三角形でBVHのleafは最大8三角形、均等分割の深さは17以下。GPU traceの32要素stack内に収まり、node bufferもtriangle bufferより小さい。WebGPU仕様の標準storage binding limitは128 MiBで、triangle bufferの上限をこれより低く置いた。

一次情報は[WebGPU仕様のlimits](https://www.w3.org/TR/webgpu/#limits)と、依存中9.2.0の`webgpuEngine.js` / `.d.ts`を照合した。`currentLimits`は実行deviceのlimitsを返す。

## 確認

配布可能なtofu材質へGUIからAutoLuminousを割り当て、自作の赤い発光面、床、壁で確認する。通常照明・Glowは0、RCだけで周囲への光を比較する。

修正前は、単体では各7.4万三角形の床を二つ配置した合計147,480三角形のシーンで、実機ログと同じ10万上限エラー・消灯を再現した。修正後は同じ条件と、単体の床が294,912三角形の合計294,936三角形で、RCの赤い光が床・壁へ届くことをPNGと画素値で確認した。床中央の13×13領域の平均RGBはOFFで`(0,0,0)`、両密度ともONで約`(106.5,8.4,3.0)`。形状数を増やしても同じ面の照明は維持される。

初回の静止10frame計測で、両密度ともcascade dispatchは0、receiverは11回。prepare CPU中央値はそれぞれ約6.7 / 13.8ms。これは生成した平面形状での短い計測であり、実キャラクターの変形時や元のステージのFPSを保証しない。

さらに1,179,672三角形で上限超過による停止、約30万へ戻したときの自動復帰を確認した。超過中はcascade / receiverのdispatchがともに0、prepare CPU中央値は約0.09ms。元の床中央の照明は復帰後も同じRGBになる。

実行結果:

- `npm.cmd run test:e2e -- luminous-radiance-budget.spec.mjs luminous-radiance-quality.spec.mjs luminous-radiance-performance.spec.mjs luminous-radiance.spec.mjs`: ローカルElectron / WebGPUで8件成功（3.0m）。密度・超過・復帰、新材質、多色、カメラ、texture、境界、PNG、保存、backend往復、静止cache、強度0を確認。WebGPU validation / page errorは0。曲面の隣接画素の最大R差は3で、補間修正も維持された。
- `npm.cmd run test:unit`: 181 files / 1077 tests成功。deviceの二つのbuffer制約と固定上限、従来のBVH拒否・refitを含む。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: 成功。内部で実行する通常typecheckの非critical baselineは残るが、今回のRC / BVH部分に新規エラーなし、`TS2304` / `TS2552`なし。
- 起動導線・WebGPU起動条件は変更していないためstandalone smokeは追加実行していない。全E2EはローカルのWebGPU renderer readyへ到達している。

## 所有者の後続確認（17:43 / 17:50）

二つの実機画像と「まあいい感じかな？」という暫定的な見た目の評価が届いた。正式採用の判断や、全ての不具合の解消確認には扱わない。両方Frame Graph / WebGPU、RC ON、強度の操作値100。下表の設定値はUI操作値。

| 場面 | Glow強度 | RC範囲 | 通常照明の強度 | 表示FPS |
| --- | ---: | ---: | ---: | ---: |
| 街・17:43 | 4 | 100 | 46 | 21 |
| 城・17:50 | 40 | 21 | 57 | 4 |

添付画像ではキャラの肌・服が読め、黒い材質の締まりも残る。城の暖色寄りの見え方は紫の背景に調和し、以前の広い白いかすみは目立たない。ただし通常照明・Glowも有効で、RC OFFの同条件比較ではないため、明るさのどこまでがRC由来か、上限拒否が確実に解除されたかを画像だけで定量判定しない。カメラ追従・細い輪郭・動作中のちらつきも静止画像では未確認。

城の表示4 FPSは負荷の課題として残る。街とステージ・カメラ・設定が異なるので、21→4 FPSをRCの速度差とは扱わない。ユーザー所有assetの探索・読込や、新たなコード調整は行わず、実機評価として記録した。

## 制約

最大100万を超えるsceneは引き続きRCを停止し、geometryを無断で間引くfallbackは行わない。多い形状を許容してもCPU snapshot比較・変形・BVH更新、GPU trace、メモリの負担は残る。100万上限での描画品質・速度は未確認で、実描画の密度確認は約30万まで。

agent自身によるユーザー所有モデルの読込は行っていない。所有者からの後続確認は上記の範囲で、モデル固有の負荷、特殊変形、透明体等の従来の未確認事項は別途残る。
