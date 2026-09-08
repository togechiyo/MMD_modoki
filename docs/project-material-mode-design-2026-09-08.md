# プロジェクト全体の材質モードと設定退避

## 目的・状態

所有者の要望は、通常MMD/PBRをプロジェクト全体のモードとして扱い、アプリを開き直さずに往復すること。切替時間は許容される。材質設定は退避する。

所有者の追加指示により、ポーズは材質・描画モードで変わるものではなく、未登録分も含めてそのまま引き継ぐことを必須要件とする。内部再読込の都合で削除したり、キー登録を切替の条件にしたりしない。

2026-09-08に初期実装。プロジェクトの内部再読込を廃止し、モデルruntimeを維持した材質交換へ変更した。保存対象は現行UIの材質プリセット割当であり、任意の材質プロパティの汎用保存ではない。

## 旧実装からの変更

- モードをmanagerの全体設定へ集約し、`scene.materialMode`へ保存する。新規読込、光色計算、実験設定、材質UI、project経由のexportは全体設定を参照する。
- `UIController.experimentalMaterialStates`を削除。各scene model entryへ`materialSettingsByMode`を持たせ、両モードをprojectへ保存する。モデル削除・project読込で旧entryと一緒に破棄され、パスやinstanceIdの再利用による別projectへの持ち越しを防ぐ。
- 現在保存できる材質設定は主に`materialKey + presetId`。任意のBabylon材質プロパティを復元できる仕組みではない。
- 内部project再読込と履歴clearを廃止した。mesh、skeleton、runtime model、morph controller、physics、モーション、編集commandを維持する。未登録ポーズとUndoを削除する注意書きも削除した。

## 正本と保存形式

プロジェクトに一つだけ`scene.materialMode: "mmd-standard" | "pbr-standard"`を持つ。全モデルの生成、追加読込、照明計算、材質UI、exporterはここを参照する。先頭モデルからの推測を通常経路からなくす。

モデルごとに、モード別の材質設定を保存する。概念例:

```ts
scene.materialMode = "pbr-standard";
model.materialSettingsByMode = {
  "mmd-standard": { materials: [{ materialKey: "...", presetId: "wgsl-soft-lit" }] },
  "pbr-standard": { materials: [{ materialKey: "...", presetId: "pbr-skin" }] },
};
```

モデル識別はinstanceIdを使い、材質は既存materialKeyで対応付ける。同じモデルファイルを複数読み込んでも別々に保存する。パスだけをキーにしない。

片側が未作成であることと、作成済みだが全材質が既定値であることを区別する。未作成はキーなし、既定値へ戻した作成済みbankは`{ materials: [] }`。後者を古い退避で上書きしてはいけない。

新規保存では両方のbankを含める。互換用の従来`materialPipeline`と`materialShaders`は、保存時に全体モードとアクティブbankから生成する。別々に編集する正本にはしない。旧アプリで開いて保存し直した場合、非アクティブbankの維持は保証しない。

## 退避する内容

初期実装は現在UIで編集・保存できる設定に限定する。

| 設定 | 扱い |
| --- | --- |
| 通常MMDの材質プリセット割当 | 通常側bankに保持 |
| PBRの材質プリセット割当 | PBR側bankに保持 |
| 今後追加する材質個別数値 | 保存schemaを持つものだけ、該当bankに追加 |
| 元モデルのテクスチャ・元材質値 | 元ファイルから再生成。GPUオブジェクトは保存しない |
| 材質モーフによる瞬間的な変化 | bankへ焼き込まない。現在フレーム・モーフ状態から再適用 |
| 未登録を含むボーンポーズ・モーフ値 | モード共通の現在状態としてそのまま保持 |
| モーション・現在フレーム・物理状態 | モード共通として保持。物理の速度・剛体状態なども初期化しない |
| モデル表示、cast shadow、順序、親子関係、キー | 共通project状態として維持 |
| ライト方向・光色・影色、カメラ、PostFX | 共通状態。モードごとの勝手な初期化をしない |
| HDRI・IBL強度・背景 | 共通保存設定を維持。所有者の後続指定により、PBRへ切替時は環境ライトを自動ONにする。強度・参照HDRI・背景設定は変更しない |
| 外部LUT・WGSL参照 | 既存保存契約で保持。今回、新しい外部shader UIは増やさない |

材質の可視性など、現在のproject保存に不足があるものを「退避済み」とは呼ばない。切替で変わる編集項目を実装時に一覧化し、保存対象に追加するか制約として明示する。特に異なる材質方式のroughnessとToon値を自動変換して対応付けない。

## 往復の動作

1. 通常で肌・髪へプリセットを割り当てる。
2. PBRへ切り替える直前に、通常側の現在の割当をbankへ保存する。
3. PBR側bankがなければ、PBR標準設定で初期化する。通常側のプリセットIDをPBRへ渡さない。
4. PBRで調整して通常へ戻る際、PBR側を保存して通常側bankを復元する。
5. どちらのモードでprojectを保存しても、次回読込後にもう片側へ戻れる。

追加モデルは現在の全体モードで生成する。逆側は初回切替時に初期化する。モデル削除ではそのモデルのbankも削除する。初回の材質再生成で材質数・順序・名前が元の対応と異なる場合は、切替を中止して元のモデルと設定を維持する。保存済み割当を適用できない場合も切替は失敗として扱う。

## 切替処理と失敗時

UIは切替要求と進捗表示だけを担当する。bank変換は`project/material-mode-state.ts`、材質準備・交換・rollbackは`assets/model-material-switch.ts`、全モデルのトランザクションと描画同期はmanagerの`switchMaterialMode`へまとめた。

1. 描画loopとruntimeの再生を一時停止する。managerのplay/pauseはseekや物理設定同期を伴うため呼ばない。二重切替、保存・export用snapshot作成、新規モデル・project読込、ショートカットを抑止する。
2. 現材質の参照とbankを退避する。未登録ポーズ・モーフ・物理状態は既存オブジェクトをそのまま維持する。
3. 未作成モードだけ`LoadAssetContainerAsync`と既存material builderで材質を準備する。この一時containerはsceneへ追加せず、MMD runtime/physicsも作成しない。材質・textureだけを引き取り、一時mesh/skeleton/geometryを破棄する。元ファイルがない場合は現シーンを交換する前に失敗する。
4. 全モデルの準備成功後、mesh/MultiMaterialとmorph proxyの接続先を交換する。既定プリセットへ戻してから切替先bankを適用し、モーフのない基準値でproxyを更新する。可視性、通常側のPMX受影flag、PBR側の受影、edge等の既存材質補正とPostFXを同期する。シーン全体のshadow generator設定は変更しない。
5. 材質コンパイルを待ち、全体モード・次回新規project用opt-inを確定する。再生を再開する際はフレーム0の自動物理初期化を一時的に抑止し、現在状態から継続する。
6. 失敗時は旧材質参照・proxy・bank・受影状態へ戻し、新規資源を破棄する。旧runtimeを破壊していないのでproject再読込による復旧は不要。UIへ失敗を通知する。

PBRへ切替時は暗く見えることを避けるため環境ライトを自動ONにし、開いている詳細フォームにも即時反映する。通常へ戻すときは自動OFFにしない。切替後の手動OFFと保存projectの明示OFFは尊重し、常時ONへ固定しない。切替が失敗した場合は元の環境ライト状態へ戻す。

材質はモデルごとに両モードをcacheし、二度目以降の往復では元ファイルを再読込しない。待避材質は`scene.materials`から外し、SSSなどの全材質走査へ混入させない。cacheはroot meshのdisposeに追従して解放する。初回の一時geometryと両モードの材質・texture分だけメモリ使用量が増える。元ファイルの変更を毎回追跡する機能ではない。

## 未登録編集とUndo

材質bankを保存しても、未登録ポーズやUndoは自動で守られない。登録済みキーの保持だけを「編集状態を完全保持」と表現しない。

未登録のボーン・モーフ変更は、登録済みキーとは独立した共通状態として必ず保持する。物理演算結果を編集値へ焼き込まず、剛体位置・速度などの物理状態も別に維持する。未登録変更を捨てる、キー登録を要求する、未登録変更があることだけを理由に切替を止める、という仕様にはしない。

Undoはruntimeと編集対象の同一性を維持し、履歴clearを呼ばない。モード切替自体をUndo commandへ追加するものではない。ポーズ保持とUndo履歴保持は別々に検証する。

## 旧projectとの互換

- 全体モードがない旧projectは、全モデルがPBRならPBR、それ以外で全モデルが通常なら通常へ移行する。空projectは通常を既定とする。
- 混在旧projectは通常へ統一し、読込warningを返す。元のモデル別presetは元モードbankに残す。これは互換読込の実装規則であり、混在編集UIは追加しない。
- 新規projectの既定モードと、既存projectの全体モードは分離する。アプリの設定だけで保存projectの方式を上書きしない。

## 実装順と検証

下記の4段階を実装した。配布可能な自作`material-switch.pmx`（材質モーフ1個、剛体2個）で通常→PBR→通常、未登録ボーン移動・回転、モーフ値、runtime ID・ボーン行列・剛体位置と速度の一致、Undo件数、両bankの保存読込、モーフを0に戻した場合の残留防止を確認する。描画品質全般や第三者モデルの互換性を保証するテストではない。

実行結果: unit 106ファイル612件、lint、typecheck:critical、WebGPU smokeが通過。通常typecheckは既存の非criticalエラーが残る。GUIでは`experimental-settings.spec.mjs`と`material-mode-switch.spec.mjs`を実施。後者では切替後のUndo/Redoの実行、途中フレームでの再生停止と継続、2体目source欠落時の無変更、復旧後の再試行も通過した。最終表示のスクリーンショットでモデルと復元したFull Light割当を確認した。

1. pure helperでbankのcapture/restore、未作成と空、旧schema移行を実装する。
2. 全体モードと両bankをserializer/importerへ接続する。
3. 共通runtime状態を維持できる切替方式を検証し、切替serviceで現在のUI内Mapを置き換える。
4. 未登録ポーズ・モーフ・物理状態の保持と失敗時復元を確認してUIへ接続する。

テストは通常→PBR→通常で異なるプリセットが戻ること、PBRのまま保存・読込後に通常へ戻れること、既定値へのリセットが古い設定に戻らないことを優先する。同一ファイルの複数instance、追加・削除、再生フレーム・キー保持、外部asset、モデルsource欠落時の無変更も確認する。GUIは配布fixtureだけを使う。

未登録のボーン移動・回転、モーフ値、途中フレームのポーズ、物理が動いている状態を用意し、往復直後に維持されることを必須の完了条件にする。切替中の一時停止時間を除き、物理の再初期化やジャンプがないことも確認する。

関連: [実験設定の現状](./experimental-settings-popup-2026-09-08.md)、[光色モード分岐](./light-color-above-default-history-2026-09-08.md)。

## 一次情報と現行実装の照合

- [babylon-mmd公式 MMD Runtime](https://noname0310.github.io/babylon-mmd/docs/reference/runtime/mmd-runtime/)の`materialProxyConstructor`を拡張点として使用した。
- installed babylon-mmd 1.2.0の`mmdMorphControllerBase.js`ではproxyをcontroller生成時に保持する。privateフィールドを入れ替えず、アプリ側の`SwitchableMaterialProxy`で委譲先だけを変更する。
- Babylon 9.2.0の`AssetContainer.dispose`は列挙した材質とtextureも破棄するため、所有権を引き取った配列をcontainerから外してから一時geometryを破棄する。
- babylon-mmdの`playAnimation`はフレーム0で物理初期化を予約するため、切替後の再開だけ`autoPhysicsInitialization`を一時OFFにする。通常の再生操作の仕様は維持する。
