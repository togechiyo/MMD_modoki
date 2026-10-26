# Frame Graph の通常 Luminous と Luminous RC の分離

実装日: 2026-10-25。所有者の「最適化の前に、通常のルミナスとルミナス RC に分ける」という依頼に対応する。

同日後続: 分離後に [遮蔽時の不要な補間・発光色評価を削減](./luminous-radiance-occluded-work-optimization-2026-10-25.md)し、画像一致と小さい部品時間の差、全体 FPS が変わらないことを確認した。

## 操作と責務

PostFX の追加メニューを「ルミナス」「ルミナス RC」の2項目に分けた。

| 項目 | ID | 計算・調整値 |
| --- | --- | --- |
| ルミナス | `luminous` | 発光マスク、core / halo blur、glare、合成。強度・しきい値・半径 |
| ルミナス RC | `luminousRadiance` | 世界座標の発光面 / BVH、4段 cascade、receiver、材質色を使う照明合成。RC 強度・範囲・[柔らかさ](./luminous-radiance-softness-2026-10-26.md) |

各個体の ON/OFF、並び順、削除、Undo/Redo、enabled キーは独立する。RC 強度・範囲は従来どおり固定設定で、キーに含めない。新しい RC 個体は ON / 強度1 / 範囲12で追加する。通常 Luminous の詳細に RC の選択欄を残さない。

発光する材質の判定・色・LightOff / LightUp 等は同じ material reader を使う。RC は通常 Luminous のスタック登録や Glow 強度を必要としない。複数の RC を追加した場合は、それぞれの照明を意図どおり重ねる。通常側の個体には RC task を作らず、隠れた親 RC の二重適用を防ぐ。

Classic では RC 個体の設定を保持して実行を休止し、Frame Graph へ戻すと復元する。全体 OFF は資源を解放する。確保済み個体の ON/OFF とキー評価では rebuild せず、追加・削除・並べ替え等の構造変更で再構築する。

## 資源と実行経路

[resource plan](../src/render/frame-graph-resource-plan.ts)は、通常側だけに `luminousMask`、RC だけに `viewDepth / viewNormal / radianceAlbedo` を要求する。RC 単独なら通常 Glow のマスク・抽出・ぼかしを生成しない。キーで初期 OFF の RC も必要資源を準備し、ON へ切り替わる前から依存関係を固定する。

[controller](../src/render/frame-graph-post-effects-controller.ts)は通常側と RC 側を別の task group / composite として接続する。旧 singleton 経路も別 ID に分けた。geometry capture の実行要否は RC の値と他の consumer から判断する。RC の imported history、BVH、storage buffer、albedo capture は従来の所有・解放契約を維持する。

利用中 Babylon.js 9.2.0 の既存 FrameGraph task / disabled pass / dispose 経路を使用した。新しい外部 API や依存は導入していない。共有資源の意味・format を変えず、今回に無関係な影設定・材質プリセット・SSAO 変更を含めない。

## 保存形式と旧プロジェクトの移行

[移行 helper](../src/editor/luminous-radiance-split.ts)を pure な変換として分離し、元データを変更しない。

- 旧個体の `luminous.fixedSettings.radiance` が ON、または調整済みの場合、直前の位置へ独立した RC 個体を生成する。ID の衝突を避け、休止中の個体は RC も休止のままにする。
- 旧 Luminous の enabled base / keys / preview のみ RC へコピーする。Glow の強度等は移さない。旧 RC 自体が OFF なら生成した RC の enabled も OFF に保つ。未使用の OFF / 1 / 12 から余分な RC 行は増やさない。
- 元の通常個体から RC 固定設定を取り除き、新しい個体は `fixedSettings.radiance` に強度・範囲を持つ。RC の実行 ON/OFF は独立した `settings.enabled` / animation で管理する。
- 旧 singleton の `effects.luminousRadiance` は残し、独立した stack entry と enabled track へ移行する。元の Luminous より前に配置し、旧 stack の OFF を維持する。既存の独立 RC track は上書きしない。
- 新しい保存は `effects.luminousRadianceEncodingVersion = 2` を記録する。削除した singleton RC を次の読込で復活させない。新形式の個体と Undo snapshot に再移行を掛けても増殖しない。

旧 [接続メモ](./luminous-radiance-integration-2026-10-11.md)の「Luminous 内に RC」「Luminous のキーで両方を制御」は導入時の仕様。現在の操作・保存は本メモを正本とする。

## 検証

- unit: 200 files / 1,255 tests 成功。個体・singleton の移行、ID 衝突、休止、enabled キー、OFF で調整済みの値、再読込、削除後の保持、資源分離、固定設定の Undo を含む。
- lint 成功。
- 型検査は compiler API で HEAD と現在の同じ設定を比較し、548 diagnostics で一致、新規0件。通常 typecheck の既知 baseline は残る。`typecheck:critical` 成功、TS2304 / TS2552 は0件。
- ローカル Electron / WebGPU E2E 計7件成功。個体の独立動作、多色発光、texture UV、材質色、旧形式を読込メニューから移行、PNG、保存読込・backend 往復を確認。WebGPU validation / page error は0。
- `smoke:launch` 成功。renderer が WebGPU で初期化され、安定性確認まで通過した。
- 最適化前の連続変形・全 receiver 再計算の fixture も独立 process で成功し、比較用 PNG と計測結果を `local-references/luminous-rc-before-optimization/` に保存した。

E2E の初回は実行中にソース修正が入り Vite が renderer を reload したため、当該1件を安定したソースで再実行した。旧テストの slider 操作値と実値の混同も修正し、両方を確認する。sandbox の Vitest cache rename は EPERM だったため、単体テストはローカル実行した。これらを描画回帰として扱わない。

旧形式の UI 移行は manager だけを呼ぶ test hook ではパネル更新を観測できなかったため、生成した旧形式ファイルを実際の読込メニューから開いて確認した。fixture の供給だけ dialog stub とし、最終行とキー操作は GUI で検証した。

配布可能な tofu と既存の自作 RC fixture を使用した。ユーザー所有モデルは探索・読込していない。RC 自身の ray / gather 削減や速度改善は、[最適化調査](./luminous-radiance-webgpu-optimization-research-2026-10-25.md)を基に別の検証単位で扱う。分離だけから全体 FPS の向上を主張しない。
