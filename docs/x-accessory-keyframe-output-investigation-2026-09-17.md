# Xアクセサリの後続キーが動画へ反映されない報告の調査

## 報告と確認範囲

2026-09-17に所有者から、`.x`アクセサリの2番目以降のキー（表示・座標）が
ビューポート再生では反映されるが、動画では0フレーム目の状態になるとの報告を受領。
報告者のOS、配布版、動画設定、元素材・projectは未提供。
ユーザー所有モデルは探索・読込せず、リポジトリのMIT fixtureを使う。

## コード・履歴上の原因候補

- `v0.2.3` tag（`763f20f`、2026-08-28）のWebM出力は、開始時にmanagerをpauseし、
  以後はBabylon MMD runtimeだけを再生してフレームを進める。
- アクセサリの変形キーを含むscene trackは、managerが停止中なら`_currentFrame`で評価する。
  旧WebMループはこの値を更新しないため、開始フレームで固定される。
- 2026-09-03の`b6d76bf`（ring particleのWebM修正）で、各出力フレームに
  `setExternalPlaybackFrame(frame)`を追加している。アクセサリも同じフレーム番号を使う。
- 配布tagそのものの実行再現は行っていない。旧版の原因判断はソースと差分の照合による。
- PNG連番は各フレームで`seekTo(frame)`するため、上記の固定原因を共有しない。
- 現行・v0.2.3のアクセサリキーが保存する値は位置・回転・倍率。
  調査開始時の表示ON/OFFは静的設定のみだった。同日の後続修正V022-086で共通表示キーを追加した（[現行仕様](./accessory-timeline-spec.md)）。
  報告の「表示」がチェックボックスか、座標移動による画面内外への出入りかは別途確認する。

## 再現試験

`test/e2e/accessory-keyframe-output.spec.mjs`を追加。
`test/fixtures/accessory/tofu.x`をGUIで0 / 15 / 30フレームへX座標 -1 / 0 / 1として登録する。
カメラの自動配置を分離するため、非表示の`external-parent/tofu.pmx`も併用する。
viewport capture、PNG連番、実WebMファイルを320×180で比較し、
明画素の重心が各キーへ移動することを確認する。30 / 60fpsの2条件。
viewportと出力では構図の差があったため、両者の絶対座標一致は判定せず、各系列で
3キーの移動量・中間位置を判定し、出力PNGとWebMでは重心差3px以内を判定する。

30fps・60fpsの実測（両条件で同じ横方向重心、px）:

| timeline frame | viewport | PNG | WebM |
| --- | ---: | ---: | ---: |
| 0 | 94.78 | 117.97 | 118.48 |
| 15 | 137.00 | 145.50 | 145.50 |
| 30 | 182.00 | 173.00 | 173.50 |

現行開発版では後続キーの座標移動が実WebMに入り、開始キーへの固定は見られない。
台帳は元環境未確認のため`needs retest`とする。表示ON/OFFキーの保存漏れは別問題として後続修正した。

## 調査中に見つけたHDR初期化の別不具合

直前の`5f8d667`で追加したプリセット復元が、出力専用rendererの起動中にも
同じURLの`HDRCubeTexture`を重複生成し、project読込待ちになる場合があった。
installed Babylon.js 9.2の`envCubeTexture.js`は未readyのcache hitを
`InternalTexture.onLoadedObservable`で待つが、WebGPUの`engine.rawTexture.js`の
`createRawCubeTextureFromUrl`はload callbackを呼ぶだけで、このobservableを通知しない。

同じプリセットのtextureが既に存在する場合は、読込中もそのinstanceを再利用する。
異なるプリセットやtextureがない場合だけ新しく読む。これは今回報告の「動画自体は完成するが
0フレームで固定」とは別の不具合であり、原因を混同しない。

## 検証結果

- ローカルGPU環境のElectron E2E: アクセサリ出力30fps / 60fps、HDRプリセット復元の3件が成功。
- `smoke:launch`: WebGPU / Bullet MPRで起動・安定化し、環境光probeも成功。
- `lint`: 成功。
- アクセサリ変形track / 環境光presetの関連unit: 2ファイル4件成功。
- `typecheck:critical`: 成功。通常の型検査は既存の非criticalエラー542件を報告し、
  未定義名参照`TS2304` / `TS2552`は0件。
