# WebGPU CSM + PCF 斜め誤影 調査・暫定回避メモ 2026-08-22

## 状態

- MMD_modoki 内で再現済み
- fixture による回帰確認あり
- アプリ側の限定回避を適用済み
- Babylon.js 単体 Playground は未作成
- Babylon.js 公式フォーラム相談候補 `WEBGPU-CSM-PCF-14`

## 対象環境

- MMD_modoki `v0.2.2` 開発中
- `@babylonjs/core 9.2.0`
- Electron / WebGPU compatibility mode / WGSL-first
- reverse depth buffer 有効
- `CascadedShadowGenerator`
- 半影 OFF、`FILTER_PCF`、`QUALITY_HIGH`

## 症状

影を落とす小さな PMX または OBJ を読み込むと、本来の局所的な落ち影とは別に、
caster 付近から画面端まで続く大きな灰色の斜め領域が地面へ現れる。

広い PMX ステージでは地面・建物・既存の影が多いため目立ちにくいが、白い既定床と
豆腐 fixture の組み合わせでは明瞭に再現する。console error や WebGPU validation error は
発生しない。

期待値は、caster の形と方向光に対応する局所的な落ち影だけが表示され、shadow map の
投影範囲外は非遮蔽として扱われることである。

## 再現 fixture と E2E

ユーザー所有モデルは使わず、次の配布可能 fixture だけを使用した。

- `test/fixtures/external-parent/tofu.pmx`
- `test/fixtures/external-parent/plate.pmx`
- `test/fixtures/accessory/tofu.obj`

対象 E2E:

- `test/e2e/shadow-csm-tofu-fixtures.spec.mjs`

E2E は空 scene、豆腐 PMX、豆腐 OBJ、PMX caster / receiver、標準影への切替を
Electron の実 GUI と WebGPU renderer で確認する。調査時の比較画像は `test-results/` に
ローカル生成し、Git 管理対象にはしない。

## 切り分け結果

| 比較 | 結果 | 判断 |
|---|---|---|
| 空 scene | 斜め領域なし | 既定床や背景に固定された模様ではない |
| 豆腐 PMX | 斜め領域あり | OBJ 固有ではない |
| 豆腐 OBJ | 斜め領域あり | PMX loader / MMD 材質固有ではない |
| PMX caster 2 mesh | 斜め領域あり | caster 名と登録数は期待通りで、重複登録が主因ではない |
| OBJ caster 1 mesh | 斜め領域あり | 複数 caster の干渉ではない |
| cascade 数 `3 -> 2 -> 1` | 残る | cascade 同士の継ぎ目ではない |
| `autoCalcDepthBounds = false` | 残る | 自動 depth bounds の非同期更新だけでは説明できない |
| `depthClamp = false` | 残る | depth clamp 単独ではない |
| camera `maxZ = 100000 -> 10000` | 残る | 広域 camera far 値だけではない |
| `frustumEdgeFalloff = 0.26 -> 1.0` | 残る | 境界フェード量だけでは解消しない |
| CSM filter `PCF -> None` | 消える | WebGPU CSM の PCF comparison sampling 経路に限定できる |

`FILTER_NONE` でも正しい局所影は残った。したがって CSM の生成、caster / receiver 登録、
方向光そのものを外す必要はない。

## 現時点の原因仮説

最有力は、Babylon.js 9.2.0 の WGSL CSM PCF 関数が、cascade の UV / depth 範囲外でも
comparison sampler を読む点である。

依存 package の `ShadersWGSL/ShadersInclude/shadowsFragmentFunctions.js` を比較すると、
通常 PCF の `computeShadowWithPCF1/3/5` は UV または depth が範囲外なら `1.0` を返す
明示的な guard を持つ。一方、`computeShadowWithCSMPCF1/3/5` は座標を生成したあと
texture array の comparison sampler を直接読む。今回の斜め境界は、この範囲外 sampling が
暗い shadow factor へ評価された可能性と整合する。

ただし、これは MMD_modoki 上の比較結果と shader source からの推定である。
Babylon.js 側の不具合と確定するには、MMD、Electron、独自床材質を外した最小 Playground と、
WebGPU / WebGL2 の比較が必要である。

## 採用した暫定回避

次の条件だけ `ShadowGenerator.FILTER_NONE` を使う。

```text
WebGPU
  + CascadedShadowGenerator
  + 半影 OFF
  -> FILTER_NONE
```

維持する経路:

- 通常 `ShadowGenerator`: 従来どおり PCF
- WebGL CSM: 従来どおり PCF
- 半影 ON: 実験用 PCSS 経路を維持
- cascade 数、lambda、blend、depth bounds、reverse depth: 変更しない

この限定回避により、PMX / OBJ fixture の斜め誤影は消え、局所的な落ち影と
標準影切替後の遮蔽影は維持された。

## 代償と制約

- WebGPU CSM の通常影は PCF の 5x5 filtering を失い、輪郭が硬くなる。
- PCSS には別の半影ずれ・過剰ぼけの既知事象があるため、代替の既定にはしない。
- shader include の文字列置換や `node_modules` patch は、Babylon.js 更新に弱く影響範囲も
  広いため採用しない。
- 広い PMX ステージで問題が目立たないことは、問題が存在しない証拠にはしない。

## 検証結果

2026-08-22:

- `npm.cmd run test:unit -- src/scene/light-shadow-controller.test.ts`: 15 tests passed
- `npm.cmd run lint`: passed
- `npm.cmd run typecheck:critical`: critical `TS2304 / TS2552` なし
- `npm.cmd run test:e2e -- shadow-csm-tofu-fixtures.spec.mjs`: 4 tests passed
- `npm.cmd run smoke:launch`: WebGPU renderer ready、安定監視 passed
- E2E screenshot 目視:
  - 豆腐 PMX: 大きな斜め領域なし、局所影あり
  - 豆腐 OBJ: 大きな斜め領域なし、局所影あり
  - PMX plate receiver: 遮蔽影あり
  - 標準影切替後: 遮蔽影あり

E2E の成功は shader の見た目を自動判定するものではないため、画像の目視確認も
完了条件に含める。

## 公式相談前に作る最小再現

1. Babylon.js Playground で box、ground、directional light、camera だけを作る。
2. `CascadedShadowGenerator` と PCF を有効にする。
3. camera を斜め上方から ground 全体が見える位置へ固定する。
4. `FILTER_PCF` と `FILTER_NONE` を同一 scene で切り替える。
5. WebGPU / WebGL2 を比較する。
6. reverse depth ON / OFF を比較する。
7. cascade 数 1 / 3、auto depth bounds ON / OFF を比較する。
8. Babylon.js 9.2.0 と相談時点の現行版を比較する。

最小再現でも WebGPU + CSM + PCF だけ斜め領域が出る場合、shader guard の不足を
不具合候補として質問する。

## 回避を外す条件

- Babylon.js 更新版で CSM PCF の UV / depth 範囲外 guard が追加された。
- または公式回答で正しい設定方法が示された。
- 豆腐 PMX / OBJ E2E と最小 Playground の両方で斜め誤影が再発しない。
- WebGPU CSM の PCF を戻しても標準影、PCSS、広域ステージに回帰がない。

## 関連資料

- [影仕様と実装](./shadow-spec.md)
- [Babylon.js 公式相談候補台帳](./babylon-official-consultation-candidates-2026-07-29.md)
- [Babylon.js Playground / 公式フォーラム投稿手順書](./babylon-forum-reporting-runbook.md)
- [Babylon.js 公式 WGSL ガイド](https://doc.babylonjs.com/setup/support/webGPU/webGPUWGSL/)
- [Babylon.js 公式リポジトリ](https://github.com/BabylonJS/Babylon.js)
- [@babylonjs/core 9.2.0 WGSL shadow include](https://unpkg.com/@babylonjs/core@9.2.0/ShadersWGSL/ShadersInclude/shadowsFragmentFunctions.js)
