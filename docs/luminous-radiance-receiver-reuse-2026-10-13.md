# 3D RC の受け手照明を、変わった場所だけ再計算する

実装・確認日: 2026-10-13

[mesh単位のBVH・転送分離](./luminous-radiance-animation-performance-2026-10-13.md)の後も、所有者から「重い」と報告された。添付画面はPaused・11 FPSで、同じシーンのRC OFFについての回答は「30」。停止 / 再生それぞれの内訳は確定していない。ユーザー所有モデルは探索・読込していない。

前回はCPUの形状更新を減らしたが、receiverは毎frame、各点の半球方向を積分し短距離BVH traceを行っていた。今回はこちらの重複を減らす。probe側irradiance事前集計へ置き換える前に、既存の32方向・短距離遮蔽・合成を維持して再利用する段階とする。

## 再利用の条件

- 最内側c0 atlasを2枚保持し、更新時に新旧のRGBを、実際に保存されるhalf精度で比較する。変わったprobeへ単調増加するepochを付ける。receiverが使うのはRGBなので、alphaだけの変化は除外する。
- receiverの照明と、対応するfull-resolution geometry pixelのdepth / normalを2枚ずつ保持する。cameraのinverse view / projection、volume、強度が同じで、depth / normalが完全に同じ場合だけ再利用候補にする。
- 受け手が補間する8近傍probeの最大epochを比較する。どれか一つでも変わると、以前の最大値より新しいepochになるため再計算する。新旧のprobe集合が同じであることは、上記のposition復元条件で保証する。
- fieldが同じでも近距離遮蔽は変わり得る。変更したmeshの前後のboundsを合併し、contact rayの長さで拡張した範囲では再計算する。追加・削除・topology変更では旧scene boundsも含める。発光textureの更新ではcontact全体を無効にする。
- camera / volume / 強度の変更、resource再割当では履歴を無効にする。seekや大きなposeの移動も、前後のbounds・field比較・現在のdepth / normalで扱う。時間平均やframe間引きは追加しない。

再利用できない点では、従来と同じ方向積分・contact trace・境界減衰を実行する。RGBA32Fの照明履歴を使うが、RGBは従来のRGBA16Fと同じ丸めを残す。alphaは符号付きepoch metadataで、負値はその点で再利用したことを表す。画像合成や出力alphaには使わない。epochがf32整数の精度上限に達する前に、probe stampとreceiver履歴をリセットする。

history textureはFrame Graphへimportし、transient aliasingから保護する。全ping-pong handleをdependencyに含め、毎frame現在のhandleへbindする。RC taskのdisposeでtexture / stamp bufferを解放する。長辺640の16:9 receiverでは従来より約14 MBのGPU領域を追加する。UI、保存値、通常描画解像度、Glow、材質色を使う合成は変更していない。

## 計測

前回の静的床294,912 triangle・動的sphere 10,000 triangle・壁 / 発光面24 triangleに、自作の静的sphereを48個（480,000 triangle）追加し、合計784,936 triangleで比較した。sphereの骨・モーフを連続更新する。受け手のdispatch領域は576×328、実textureは576×324。通常アプリは停止していないので、値はこのfixture・この環境の結果である。

GPU timestamp-queryはこのengineでは利用できず、frame counterはnull。テストrendererだけを停止し、receiver単独dispatchからsubmission / GPU完了までのwall timeを、再利用なし / ありの別processで測った。CPUの設定処理・送信・待機も含み、GPU timestampやscene全体の描画時間とは区別する。

| 比較 | 再利用なし | 再利用あり |
| --- | ---: | ---: |
| receiver単独の完了時間中央値 | 6.57ms | 3.16ms |
| 停止中のreceiver探索 | 対象点を毎回計算 | 対象126,239点を全て再利用、再計算0 |
| 連続変形中の一frame | 対象点を毎回計算 | 104,175点を再利用、22,178点を再計算（約82%再利用） |

この複雑fixtureの全体frame intervalは、両方式とも再生約33.3ms・静止約16.7msで、全体FPSの上昇は確認していない。CPU prepareは約15msと約3.7msで、前回から大きく変わらない。局所的な探索削減を、実機シーンの「11 → 30 FPS」の保証へ一般化しない。

## 検証

- 複雑fixtureの停止後PNGは修正前と全画素・SHA256一致（`7B7EE8D31F9A9B962ECB7A7445C8D6C75042BFB12F2ECBF005AE09FBD47FF06E`）。
- GPU出力のepoch metadataをreadbackし、静止時に探索を省いていることと、変形中に再利用 / 再計算の両方が実行されることを確認した。
- 骨・モーフを大きく移動した直後の1frameを、同じposeで強制的に全点計算した画像と比較して全画素一致。待機frameで不備を隠さない。法線だけを反転・復元するケースも一致し、fieldが変わらないreceiver入力の変化を確認した。
- ローカルElectron / WebGPU E2Eの既存RC回帰9件が成功（多色、texture / camera / 遮蔽、材質色、曲面の段差、dense / budget復帰、PNG、master / backend / 保存値）。履歴追加テストも単独再実行で成功。WebGPU validation / page errorは0。
- unit: 184 files / 1085 tests成功。camera / volume / 強度 / resource reset、epoch精度リセット、dirty boundsの前後合併と無関係なmeshの除外を確認。
- lint成功。typecheck:critical成功。内部の通常typecheckには既知の非critical baselineが残るが、今回のRC / history / mesh BVHにエラーなし、TS2304 / TS2552なし。

最初の依存追加時にはViteの初回最適化でrendererがreloadし、計測が中断した。最適化後に再実行して成功。回帰一式の履歴テストには、前の作業のtemp PNGを指定してENOENTになったため、現存する複雑fixtureの修正前PNG比較と、履歴テスト単独再実行を使った。アプリの回帰としては扱わない。

起動導線は変更していないためstandalone smokeは追加していない。外部APIは依存中Babylon.js 9.2.0のFrameGraph compute task、uniform buffer、imported texture、WebGPU query / flush / readback実装を確認した。[公式instrumentationの入口](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/)も参照。private APIを使うtiming / readback / 強制全計算はtest helper限定。

## 残る負荷

cameraが動けば再利用条件が変わり、受け手全体を計算する。volumeや大きな光源が変わる場合も再計算が広がる。4段cascade、CPUの変形・BLAS更新、geometry capture、通常描画、既存Glowの費用は残る。再開時には、残る処理の計測に基づいて[probe側の事前集計・GPU変形等](./radiance-cascades-animation-research-2026-10-12.md)を比較する。

## 2026-10-14 実機確認と今回の区切り

所有者から「fpsはそんなに変わらないけど体感はちょっと滑らかになってるかも。まあいったんこれでいいかな」と確認結果を受けた。添付画面はPlaying・11 FPS・WebGPU / WGSL・Bullet MPR Bufferedで、RCはON。FPSの大幅な改善は確認されておらず、滑らかさは所有者の暫定的な体感評価として記録する。

前の添付画面はBullet MPR Immediate、今回はBufferedであり、同条件の修正前後比較ではない。frame timeのばらつきも実測していないため、滑らかさの変化をRC修正だけの効果と断定しない。

今回の作業はここで区切り、現在の実験実装を維持して追加の最適化をいったん保留する。残る負荷は解決済みにせず、[所有者の区切り判断](../insights/decisions/defer-further-radiance-cascade-optimization.md)に沿って、再開の依頼があった場合に次の段階を検討する。
