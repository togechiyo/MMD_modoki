# 空気遠近のタイムラインキー

更新日: 2026-09-14

所有者の「他エフェクトも随時進めて欲しい」に対し、次の小さな区切りとして空気遠近を追加した。海を除く対応済み効果は11種。残り全効果の完了を意味しない。

## 対応範囲

カメラモードのタイムラインに「空気遠近」を追加し、1効果1キーでON/OFF・強度・開始距離・広がりを保存する。数値は実値で線形補間、ON/OFFはキー位置でstep切替。色は固定設定のまま。

- 強度: 0〜0.6。
- 開始距離: 通常スライダーは0〜500。既存の保存値・数値APIに合わせ、キー値は0〜2000まで保持する。
- 広がり: 通常スライダーは20〜1000を対数配置。既存の保存値・数値APIに合わせ、キー値は1〜4000まで保持する。時間方向の補間は実距離の線形で、スライダー配置とは別。

補間途中に他の項目を編集しても、未編集項目をスライダー位置へ丸め直さない。共通の登録・Undo/Redo・停止preview・保存読込・右パネル同期を利用する。serializerは評価値でなく静的な設定値を保存し、キーとpreviewはeffectAnimationsへ分離する。

## 描画とbackend

空気遠近は既存どおりFrame Graphでのみ描画する。Classicに変更してもキーは保持し、Frame Graphへ戻すと再び評価する。下パネルの説明にも対象backendと固定色を明記した。

既存のFrameGraphAerialPerspectiveTaskは描画ごとにstrength・startDistance・transitionRangeをuniformへ渡しているため、シェーダーの変更は不要だった。

キー所有中かつスタック内にある場合は、初期OFFでもtaskとviewDepthを確保する。OFFではstrengthだけ0とし、距離値と依存textureを保持する。以後のシークや補間でgraphを再構築しない。スタック除外は共通の休止扱い、全体OFFは既存どおり資源解放となる。

## 次の候補

- オフセット影／ハイライト: 数値uniformをキーへ接続し、初期OFF時の深度準備を今回と同様に固定する方針が候補。通常パネルの全スライダーとClassic側の実装差を確認してから追加する。
- 光芒: 深度準備に加え、光源位置・サンプル処理と数値更新の関係を確認する。
- SSAO / SSGI / SSR: 品質やサンプル数がシェーダー再コンパイルへ達する設定を切り分ける。
- DoF: 対象選択・autofocusと手動焦点値の優先順位が必要。
- モーションブラー／粒子: 逆シーク・動画出力での時間履歴の再現性を先に定義する。
- LUT選択: [前回の内蔵preset IDと事前読込の設計](./effect-shape-keyframes-and-lut-selection-2026-09-14.md)を継続する。

## 検証

- unit: 152 files / 840 tests PASS。空気遠近の補間・往復評価・保存読込・payload検証、静的値と評価値の保存分離、深度resourceの保持を追加確認。
- lint / typecheck:critical: PASS。通常型検査は既存542件で、前回ログとの診断比較で増減なし。TS2304 / TS2552は0。
- ローカルGPUのElectron E2E: 空気遠近の1ケースPASS。初期OFF、キー登録、3項目補間、OFF中の右パネル編集、Undo/Redo、preview保存と出力時の除外、再生中ロック、スタック除外/復帰、全体ON/OFF、Classicとの往復切替を確認。
- 保存読込後の通常シークでbuild generation不変。強度固定で開始距離・広がりを変えたPNGはRGB平均差がそれぞれ約8.185 / 8.185、逆シークの差は0。画像も目視し、霞の適用差を確認した。
- WebMの0/20/40フレームをデコードし、対応するPNGとの差は約0.69〜0.77、反対状態のPNGとの差は約8.39〜8.62。ON/OFF・強度の動画反映を確認。形状項目の独立比較はPNGで行った。
- WebGPU validation error / renderer pageerror: 0。自作の配布可能なtofu fixtureのみを使用。
- 最初のE2Eは存在しないresourcePlan観測プロパティを参照して失敗。既存のruntime stack観測へ修正し、深度資源はunitと実描画で検証した。アプリの変更は不要だった。
- smoke:launch: PASS。WebGPU / Bullet MPRの初期化・安定待機・環境照明probeを確認。5言語JSONとgit diff --checkもPASS。
