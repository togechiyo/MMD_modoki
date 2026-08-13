# モデル外部親 仕様・実装ガイド

更新日: 2026-08-13

## 概要

モデル外部親は、あるモデルのボーンを、別モデルのボーンへ追従させる機能である。
たとえば「皿モデルのセンターボーンを動かすと、皿の上の豆腐モデルも一緒に動く」という構成を作れる。

現時点の実装範囲は次のとおり。

| 項目 | 状態 |
| --- | --- |
| モデル間のボーン外部親 | 実装済み |
| 外部親の登録・解除 | 実装済み |
| 自己参照・循環参照の拒否 | 実装済み |
| project保存・復元 | 実装済み |
| ギズモ表示・操作との同期 | 実装済み |
| カメラ外部親のUI公開 | 実装済み（カメラ専用UIとして分離） |
| フレーム単位の登録・解除・親切り替え | 実装済み |
| 外部親キーのUndo / Redo | 実装済み |
| 外部親入力を受ける動的ボーン | 実装済み（Classic Bulletで実PMX確認） |
| MMD本家の外部親キーとの入出力互換 | 未実装 |

外部親は子ボーンのキーフレームと一体で登録する。あるフレームで登録した関係は、次の外部親キーまで保持されるステップ式である。

## 用語

- **子モデル**: 外部親によって動かされるモデル。例では豆腐。
- **子ボーン**: 親の変換を受ける子モデル内のボーン。
- **親モデル**: 追従先になるモデル。例では皿。
- **親ボーン**: 子ボーンへ変換を渡す親モデル内のボーン。

## 操作方法

1. 親にするモデルと子にするモデルを読み込む。
2. モデルモードで子モデルを選択する。
3. タイムラインまたはボーン選択から子ボーンを選択する。
4. ボーン欄の「外部親」で親モデルを選択する。
5. 「親ボーン」で追従先のボーンを選択する。
6. 「登録」を押す。現在フレームへ子ボーンキーと外部親キーが登録される。

解除するときは、解除したいフレームへ移動し、「外部親」を「なし」にして「登録」を押す。解除も明示的なキーとして記録される。

たとえば0フレームで皿へ登録し、30フレームで解除すると、0～29フレームは皿へ追従し、30フレーム以降は通常のモデルローカル座標へ戻る。
別の親へ切り替える場合は、切り替えたいフレームで新しい親モデル・親ボーンを選び、同じように「登録」を押す。

### 登録時のスナップ

登録すると、子ボーンのローカル移動とローカル回転はrest poseへ戻され、現在の親ボーン位置へスナップする。
これは登録前に子側が持っていた移動・回転を親変換へ重ねる方式ではなく、親ボーンを新しい基準位置にするためである。

現在フレームに子ボーンのキーフレームがある場合も、そのposeを移動ゼロ・回転ゼロへ更新する。
キーフレームを更新しないと、次のruntime評価で登録前のオフセットが復活して親からずれてしまうためである。

解除すると外部親の変換だけが外れ、子ボーンは通常のモデルローカル座標へ戻る。登録中の親の位置へ子を固定したまま解除する「現在位置を維持」は未実装である。

## 現在の仕様

- 1モデルにつき、各フレームで有効になる外部親は1件。
- 子ボーンの変換は、その配下の子孫ボーンとメッシュへ通常どおり伝播する。
- 親ボーンの移動と回転が子側へ反映される。
- 外部親キーは、次の外部親キーまで登録状態を保持する。
- 最初の外部親キーより前は、外部親なしとして扱う。
- 自分自身を親モデルにはできない。
- モデル間で循環する関係は、各モデルのキー切り替えを含めて全フレームで検査し、登録できない。
- 親モデルを削除すると、そのモデルを参照していたキーは同フレームの解除キーへ変換される。
- 親モデルまたは親ボーンが見つからない関係は適用せず、警告を残して処理を継続する。
- 外部親キーは子ボーンキーと一体でコピー、移動、削除される。

### Auto KeyとUndo / Redo

外部親の登録時には、Auto KeyのON / OFFにかかわらず、現在フレームへ子ボーンキーを作成または更新し、子ボーンposeをゼロへ更新する。登録前のローカル値を残すと親変換へ加算されてずれるためである。

外部親情報は子ボーンキーフレームpayloadへ含め、既存のキーフレームCommand経路を通す。登録・解除、コピー、移動、削除、Undo / Redoで、子ボーンposeと外部親関係が同時に更新される。

## 変換の評価順

babylon-mmd runtimeは、アニメーションと物理評価のたびにボーンのworld行列を更新する。外部親を通常の`onBeforeRender`へ置くと、後から実行されるWASM runtimeのafter-physics処理に上書きされる場合がある。

非物理モデルの外部親合成は`scene.onBeforeActiveMeshesEvaluationObservable`で行い、runtime評価の完了後かつactive mesh / skeleton評価の前に差し込む。

```text
animation / physics runtime evaluation
  -> external parent composition
  -> bone gizmo synchronization
  -> active mesh / skeleton evaluation
  -> rendering
```

合成するworld行列は次の関係になる。

```text
childWorldAfterExternalParent = childWorld * parentWorld
```

親側にも外部親がある場合は、最上位の親から再帰的に適用する。登録時の循環拒否に加えて、runtime側にも訪問中モデル集合を持たせ、破損データによる無限再帰を防ぐ。

### 動的ボーンへ外部親入力を渡す場合

外部親対象ボーンの配下に物理モード1または2の剛体があるモデルは、描画直前だけでは間に合わない。
babylon-mmdは`beforePhysics`でボーン追従剛体を同期した後に物理stepを行うため、従来の描画直前合成では
入力剛体が親モデルの移動を受け取れず、動的な出力ボーンとカメラが遅延せずに一括移動していた。

この場合だけ、次の順序で評価する。

```text
runtime beforePhysics（通常の剛体同期）
  -> 外部親を入力ボーンへ合成
  -> 対象モデルのボーン追従剛体を再同期
  -> Bullet physics step / afterPhysics
  -> カメラ外部親を動的出力ボーンへ同期
  -> active mesh / skeleton evaluation
```

動的剛体を持たない通常モデルは従来どおり描画直前に処理する。物理前に処理したモデルと、その外部親依存として
先に処理されたモデルは同じフレームの描画直前処理から除外し、親変換の二重適用を防ぐ。

剛体再同期は現行babylon-mmdのruntime model内部にある`_physicsModel.syncBodies()`を互換境界として
`PhysicsModelController`へ隔離している。public APIではないため、babylon-mmd更新時は実PMX試験とE2Eを必ず再確認する。

## ギズモとの同期

外部親合成より前にギズモを同期すると、ギズモだけが合成前の子ボーン位置へ取り残される。このため通常時は、外部親を適用した後のfinal matrixを使ってギズモを同期する。

ギズモから子ボーンを編集するときは、ギズモのworld変換から外部親world行列を逆変換で除き、子ボーン本来のローカルposeへ戻して保存する。

ドラッグ中は次の順序にする。

```text
gizmo edit -> raw child pose -> external parent composition（1回だけ）
```

先に外部親を合成してからギズモ編集を反映し、同じフレームでもう一度外部親を合成すると、親変換が二重適用されて子モデルが一瞬飛ぶ。そのためドラッグ中と非ドラッグ時で順序を分け、1フレームにつき外部親の適用を1回に限定している。

## project保存・復元

フレーム単位の情報は`ProjectKeyframeBundle.modelExternalParents`へ保存する。

```ts
modelExternalParents: Array<{
  modelPath: string;
  frameNumbers: ProjectNumberArray;
  childBoneNames: string[];
  parentModelPaths: Array<string | null>;
  parentBoneNames: Array<string | null>;
}>;
```

`null`の親モデル・親ボーンは解除キーを表す。親モデルは配列番号ではなく正規化したモデルパスで参照する。復元は全モデルを読み込んだ後に行い、保存時と読み込み時でモデル順が変わっても親を解決できるようにする。

旧形式の`scene.models[].externalParent`しか持たないprojectは、読み込み時に0フレームの外部親キーへ変換する。保存時には、旧バージョン向けの現在状態も`scene.models[].externalParent`へ残す。

次のような復元不能データは警告として扱い、project全体の読み込みは継続する。

- 親モデルが存在しない。
- 子ボーンまたは親ボーンが存在しない。
- 自己参照または循環参照になる。

## 確認用モデル

最小構成のPMX fixtureを同梱している。

- `test/fixtures/external-parent/tofu.pmx`: 子モデル。センターボーン1本。
- `test/fixtures/external-parent/plate.pmx`: 親モデル。センターボーン1本。
- `test/fixtures/external-parent/dynamic-follower.pmx`: ボーン追従剛体と動的剛体をバネ接続した水平遅延の最小モデル。

MMD_modokiとPMXEditorでは読み込みを確認している。本家MikuMikuDanceではクラッシュする場合があるため、現時点ではアプリ内E2E fixtureとしてのみ扱う。

## 自動テスト

純ロジックとproject round-tripはVitest、Electron上の操作と描画結果はPlaywrightで確認する。

```powershell
npm.cmd run test:unit
npm.cmd run test:e2e -- model-external-parent.spec.mjs
```

`test/e2e/model-external-parent.spec.mjs`では次を確認する。

1. E2E専用の読み込み口から豆腐と皿を読み込む。
2. 豆腐のセンターボーンに事前の移動値を与える。
3. 皿のセンターボーンへ登録し、豆腐の移動・回転入力がゼロへ戻ることを確認する。
4. 皿のセンターボーンYを`5`へ移動する。
5. 描画に使われるfinal matrixで、皿と豆腐がともにY=`5`になることを確認する。
6. 皿の回転ギズモをドラッグ中にしても、豆腐へ親変換が二重適用されないことを確認する。
7. 豆腐を再選択し、ギズモ中心と豆腐の描画ボーン位置が一致することを確認する。
8. 30フレームへ解除キーを登録し、豆腐が通常位置へ戻ることを確認する。
9. 29フレームへ戻ると皿への追従が復帰し、30フレームでは解除されることを確認する。
10. Undoで30フレームの解除キーを取り消すと追従が復帰し、Redoで再び解除されることを確認する。
11. 動的fixtureの入力ボーンは親へ即時追従し、出力ボーンとカメラは途中値を通って遅れて追従することを確認する。

WASM runtimeでは、次フレーム準備の途中でボーンworld行列がraw値へ戻る瞬間がある。E2Eでは途中の一時値ではなく、skeleton評価後に描画へ使われるfinal matrixを確認する。

### 2026-08-02 確認結果

- `npm.cmd run test:unit`: 40ファイル、289テスト成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: 未定義名参照なし。全体typecheckには既知のベースラインエラーが残る。
- `npm.cmd run test:e2e -- model-external-parent.spec.mjs`: フレーム切り替えとUndo / Redoを含めて成功。
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPRでrenderer初期化と安定待機に成功。

### 2026-08-13 動的ボーン対応の確認結果

- 実モデル`可変追従ボーン_Ver2.pmx`: Classic Bullet MPRで、親X=`10`に対して動的出力とカメラが途中値を通って追従することを確認。
- `npm.cmd run generate:test-models`: 動的fixtureを含む3モデルの生成・再読込に成功。
- `npm.cmd run test:unit`: 59ファイル、372テスト成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: 未定義名参照なし。全体typecheckには既知のベースラインエラーが残る。
- `npm.cmd run test:e2e -- model-external-parent.spec.mjs`: 通常外部親、子モデル経由のカメラ外部親、動的遅延カメラの3テスト成功。
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPRでrenderer初期化と安定待機に成功。

## 既知の制約と今後の候補

- カメラ外部親はカメラ専用UIとして公開済み。モデル用UIとはDOMとcontrollerを分離して維持する。
- 登録解除時に現在のworld位置を維持する選択肢を検討する。
- `可変追従ボーン_Ver2.pmx`では水平遅延を確認済み。Y方向の沈みは自由軸バネの静的変位であり、外部親入力の誤差ではない。詳細は[物理ジョイント沈下・伸長調査](./physics-joint-sag-stretch-investigation-2026-08-13.md)を参照する。
- WASM runtime実験経路では内部physics modelの再同期API差を追加確認する。
- 親のスケールや、複数階層の回転を含むfixtureを追加する。
- 本家MMDの外部親キー仕様と、現在のproject固有仕様との差分を整理する。
- 確認用PMX fixtureが本家MMDでクラッシュする原因を別途調査する。
