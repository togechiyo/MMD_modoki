# RC共通基盤の段階B: 同条件の光場計算共有

作成日: 2026-10-28。

[段階A](./radiance-cascades-shared-scene-implementation-2026-10-28.md)のscene/BVH共有に続き、同じ範囲のLuminous RC間でemission fieldの計算と参照を共有した。RC個体の設定・合成順・保存形式は維持する。GI・天空遮蔽は[実装案](./radiance-cascades-lighting-implementation-plan-2026-10-28.md)の段階C以降。

## 共有条件と固定資源

共有条件は同一FrameGraph・同一scene source（共有BVHのidentity）・正規化後の同一range。現行のcascade配置、形式、方向解像度、source方式は固定なので、この条件でfield入力が一致する。今後これらを個体別に可変化する場合は共有キーにも含める。強度はreceiver、softnessは後段フィルタへ適用するため、fieldの共有条件には含めない。

各RCには従来どおりbase fieldの2面、probe epoch buffer、upper cascade用textureを確保する。各graph実行で、同条件の最初のactive consumerが自分のslotをproducerとして使い、後続のconsumerはそのfieldとepoch bufferを読む。同条件の更新は一組のcascade列だけが実行する。最初の個体がOFFなら後続のactive個体がproducerになる。全OFFでは実行しない。

**今回は光場計算と参照の共有であり、確保するfieldメモリは削減していない。** 固定の予備slotを残すことで、rangeの分離・再共有をgraph rebuildや実行中の新規GPU確保なしで扱う。range履歴ごとの無制限なpoolも作らない。メモリまで減らす場合は、range groupの構造変更によるrebuildなど別の契約と検証が必要になる。

各receiverは、同sourceの全候補slotのbase field handlesをbuild前にdependenciesへ追加する。実行時はその固定集合内からfieldを選び、field textureとprobe epoch bufferを両方bindし直す。共有するbase fieldsはimport済みの永続資源で、transient textureの寿命に依存しない。各cascadeは自分のslotへ書き、先行producerの完了後に後続receiverが読む。

## 履歴と破棄

field slotがfield revision、range、ping-pong index、epoch、wrap/reset generationを所有する。receiverはcamera・volume・strength等のsnapshot、最後に読んだslot/generation、source revision、geometry updates、texture revisionを個別に保持する。

- producer交代・generation変更ではreceiver reuseを止める。epoch wrapのgenerationは永続値なので、休止中にwrapを見逃しても復帰時に無効化できる。
- cascade dispatchの有無と、各receiverのcontact dirtyは分ける。後続receiverも自身が最後に受け取ったsource状態からの変更を検出する。field RGBが半精度で同じ値でも、近接遮蔽の変化を取りこぼさない。
- 複数のgeometry更新を休止中に見逃した場合は、段階Aの全volume contact dirtyを維持する。
- receiver出力、GI/geometry/near履歴、ぼかし、非線形compositeは個体別。fieldだけ共有して強度を混ぜたり、合成回数を減らしたりしない。
- 個体削除・並び替えは既存のgraph rebuildを使用する。slot資源は確保した個体が破棄し、最後の登録解除でpoolのsource/graph登録も削除する。receiverの通常resetから他slotの履歴を変更しない。

## 検証結果

同GPUの小型fixtureで、同range・異なるstrength/softnessのRCを2個配置し、発光meshを4フレーム動かした。

| 観測値 | 段階A | 段階B |
| --- | ---: | ---: |
| 同rangeでのcascade dispatch | 32回 | 16回 |
| 異なるrangeでのcascade dispatch | 32回 | 32回 |
| receiver dispatch | 8回 | 8回 |
| 同rangeのactive receiverが参照するfield / epoch実体 | 各2 | 各1 |
| 個体別receiver履歴の実体 | 各2 | 各2 |
| 全OFF時のcascade / receiver dispatch | 0 | 0 |

新規field共有の比較画像15枚（640×360 PNGを含む）と、既存scene共有の比較画像10枚は、照明領域のRGB平均絶対差がすべて0。右下のeditor gizmo領域のみ統計から除き、全面PNGを保持する。速度・FPSの改善率はdispatch数から推定しない。

- `npm.cmd run test:unit`: 205 files / 1,285 tests成功。候補依存の宣言、range分離/再共有、実行順のproducer選択、全OFF、graph/source隔離、小さいepoch上限を使ったwrapと休止後復帰を含む。
- `npm.cmd run lint`: エラー・warningなし。
- `npm.cmd run typecheck`: 既存547件。変更前後で位置情報を除くdiagnostic内容が一致。
- `npm.cmd run typecheck:critical`: 成功、TS2304/TS2552なし。
- ローカルElectron/WebGPU E2Eは3ケース成功。新規`luminous-shared-field.spec.mjs`、既存`luminous-shared-scene.spec.mjs`、`luminous-effect-instances.spec.mjs`のenabled-keyケースをsandbox外で直列実行。
- range分離/再共有でbuild generation不変、先頭OFF、全OFF復帰、producer削除/Undo、順序変更/Undo、初期OFFキー、GUI保存読込・backend復帰の既存回帰、640×360 PNGとviewport復帰を確認。WebGPU validation error・pageerrorは0。

ローカル資料は`local-references/luminous-rc-shared-field-before/`と`local-references/luminous-rc-shared-field-after/`、検証ログは`local-references/rc-shared-field-verification/`へ保存し、Gitには含めない。新specは通常実行でも同run内の復帰画像とdispatch数を検証する。旧画像比較を明示assertする場合は`MMD_RC_SHARED_FIELD_COMPARE_BASELINE=1`を指定する。任意baseline未配置時は旧画像比較を省略し、通常runでviewportサイズが違う場合は比較だけskipする。

## 主な実装

- [field poolと固定slot選択](../src/render/luminous-radiance-field-pool.ts)、[単体テスト](../src/render/luminous-radiance-field-pool.test.ts)
- [field/receiverの履歴分離とbinding](../src/render/frame-graph-luminous-radiance.ts)、[graph実行境界](../src/render/luminous-radiance-scene-pool.ts)
- [GUI・GPU比較](../test/e2e/luminous-shared-field.spec.mjs)
