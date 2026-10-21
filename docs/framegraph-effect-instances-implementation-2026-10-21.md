# FrameGraph Gammaの複数配置とタイムライン連携

更新日: 2026-10-21
状態: 第一段階を実装。対象は新規Gamma個体。配布版への収録時期は未決定。

## 範囲と使い方

[共同設計](./framegraph-effect-instances-and-timeline-design-2026-10-21.md)の照合後、Gammaを最初の対象として実装する提案に対して、所有者が「では実装よろしく」と指定した。

Frame Graphのポストエフェクト追加からGammaを何度でも追加できる。それぞれ初期値はON・Gamma 1.0で、独立した設定・名前・キーを持つ。例えば `Gamma A → Bloom → Gamma B` と並べ、AとBを別々に時間変化させられる。行の名前を押すと対応するタイムライン行と登録パネルを選ぶ。

- 名前変更、複製、上下ボタンによる順序変更、休止・復帰、完全削除を追加。構造操作とキー操作は既存のCommand履歴に入り、Undo / Redoで元のID・位置・キーを復元する。
- 休止は描画順から外して個体・キーを残す。完全削除は個体・キーをまとめて消す。複製は設定・登録キー・baseを新IDへコピーし、未登録previewをコピーしない。
- キーなしのスライダー変更は静的設定を変更し、操作終了時に1履歴として記録する。キーありの調整はpreviewに留め、登録ボタンでキーへ反映する。enabledも同じ扱い。
- 値の数値補間・enabledのstep評価・空trackのbase保持は既存のGamma実装を流用。seek・再生開始でpreviewを破棄し、PNG / WebMは登録済みの評価値を使う。
- タイムラインの行順は描画順に追従し、休止個体は末尾に表示する。選択やキーの識別は名前・配列位置ではなく固定の個体IDを使う。
- Classicへ切り替えた場合はデータを保持し、新しい個体の描画・値編集を停止する。Frame Graphへ戻すと復元する。全体OFFでも個体設定は保持し、既存の全体OFF処理で描画資源を解放する。

## 保存と互換性

新しい保存ブロックは `effects.frameGraphInstances`。内部versionは1で、`instances`と`order`を持つ。個体は `instanceId / type / label / settings / animation`。IDは `fx-` で始まるUUID、typeは今回はgammaのみ。animationは個体専用の既存EffectSceneTrackStoreへ保存する。

orderには新個体IDと既存効果の種類名を混在させる段階的なadapterを使う。既存効果のsingleton設定・保存形式・taskを全面置換しない。新個体が1件以上あるprojectは、休止中だけの場合も含めてproject本体をversion 2で保存する。新個体がなければversion 1を維持する。読込・backend reload・PNG / WebM別プロセス入口・外部WGSL asset保存は両versionに対応する。古いアプリではversion 2を読めない。

読込時は個体ブロックをシーン変更前に検証し、storeも一時状態へ復元してから置換する。構造Commandは変更した個体と順序のbefore / afterを保持し、適用前に該当fieldを検査する。名称変更のUndoで後から編集したキーを巻き戻さない。

既存の `keyframes.effectAnimations` 17種は従来どおり標準OFFのままopaqueに保持する。古いsingleton Gammaや保管中のキーから新個体への自動移行はしない。新個体のキーpayloadには `instanceId` を追加し、`category: effect, name: instanceId` で対象を指定する。単一キーを同種の別個体へ貼るときだけ明示的にIDを付け替え、batch貼付けでは各キーの元IDを保持する。

## 実装の境界

[個体store](../src/editor/frame-graph-effect-instances.ts)、[構造操作](../src/editor/effect-instance-operations.ts)、[Command差分](../src/actions/effect-instance-command.ts)、[行UI](../src/ui/frame-graph-instance-controller.ts)を分離した。managerはキー・保存・描画との接続を担う。個体ごとにGamma task / EffectWrapperを所有し、個体の追加・削除・描画順変更時にgraphを再構築する。毎frameは評価値・enabledだけを渡し、キー全体のserializeやgraph再構築を行わない。最初にOFFの個体もtaskを確保し、後のONキーに対応する。

MCPのtrack一覧へ種類・表示名・休止状態を追加し、既存のキー参照・登録・編集で個体IDと種類を検証する。個体の作成・複製等の専用MCP操作は未追加で、helpのeffect-instances項目はpartialとして案内する。

VMDがなく個体キーだけの場合も再生が進むよう、再生長を持つ小さなanimatableをruntimeへ登録する。個体キーがある間だけ編集タイムラインの長さを寄与し、最後のキー削除やprojectクリアで0へ戻す。他のモデル・camera・音源の再生長を手動上書きしない。公式の[IMmdRuntimeAnimatable拡張](https://noname0310.github.io/babylon-mmd/docs/reference/runtime/mmd-runtime/#animatable)と、使用中のbabylon-mmd 1.2.0のinterface / addAnimatable / removeAnimatable / duration再計算を照合し、実runtimeを使うunitとWASM runtimeのGUI再生で確認した。

残る範囲は、他効果の個体化、既存singletonからの移行、全効果のキー公開、個体行へのdrag操作、個体構造のMCP操作。今回の順序操作は上下ボタンで、既存効果同士のdragは既存実装を維持する。色調補正・線画 / pencil系の新効果は別件。

## 確認結果

配布可能な豆腐PMX fixtureを使い、ローカルGPUのPlaywright Electronで確認した。所有者モデルは使用していない。

- unit: 191 files / 1122 tests PASS。個体store・field単位の差分・Undo / Redo・serializer / importer / backend reload・runtime再生長の追加テストを含む。
- lint: PASS。typecheck:critical: PASS。通常typecheckの既存548診断は件数・診断内容とも増減なし。
- 新個体のGUI E2E: 複数追加、数値入力のEnter確定とUndo、別々のキー、enabledのstep評価、再生中の編集ロック、同種へのコピー、名称変更、複製、休止・復帰、削除とUndo / Redo、描画順変更、version 2保存復元、Classic往復、PNGのframe差と順序差、未登録previewの出力除外、デコードしたWebMのframe比較、5言語の行表示がPASS。WebGPU validation / renderer pageerrorは0。
- AAなし・Gamma単独のE2E: 値の反映、個別OFF、全体OFF / ONと保存値保持がPASS。全体OFFのPNGは効果追加前と一致。個別OFFはGamma 1.0と同じ中間テクスチャ経路に戻る。中間テクスチャを使わない全体OFFとの比較には、8bit値の平均差1未満の描画差がある。
- 既存17種のキー休止E2Eと、開発opt-inの旧Gamma登録・再生・保存・出力E2EもPASS。
- smoke:launch: Electronのrenderer初期化、WebGPU / Bullet MPR、安定待機、環境光probeがPASS。

自動確認はfixtureの範囲で、任意モデルの見栄えや長尺・高解像度出力の品質保証ではない。全効果の復帰やRelease公開の完了として扱わない。
