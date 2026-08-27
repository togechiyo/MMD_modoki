# ビューポート下バー シークバー化 設計メモ 2026-06-01

## 目的

v0.2.0 の MMD 寄せ UI では、ビューポート直下のバーを「現在値入力欄」から「再生位置を素早く読む / 動かすためのシークバー」へ寄せる。

直近で下バーに置いていたモデル / カメラの数値入力は、次の場所へ責務を逃がせる状態になった。

- モデル / カメラ編の切替: 上パネルの単一トグルボタン
- ボーン / カメラの数値編集: 下パネル側の数値入力欄
- ドラッグ操作: viewport 右下のハンドル

そのため、下バーの枠は再利用しつつ、動画編集ソフトや MMM に近い「再生・シークの常設導線」として再設計する。

## 現状の下バーから変えること

現在の `ViewportBottomBarController` は、次を担当している。

- mode switch
- model bone position / rotation input
- camera center / angle / distance / FoV input
- local / global / accessory 表示
- handle drag との値同期

シークバー化後は、下バーから数値編集責務を外す。

残す / 移す方針:

| 項目 | 方針 |
| --- | --- |
| モデル編 / カメラ編切替 | 上パネルを正とする。下バーには置かない |
| ボーン / カメラ数値 | 下パネルのボーン欄 / カメラ欄へ寄せる |
| local / global / accessory | viewport 右下ハンドル側へ寄せる |
| 移動 / 回転ハンドル | viewport 右下 overlay のまま |
| 下バー本体 | シークバー / 再生操作 / 範囲表示へ転用 |

## 初回スライスで入れる UI

初回は大きく作りすぎず、1段の低いバーとして開始する。

```text
#viewport-bottom-bar
  [再生/一時停止] [リピート]
  [ current frame input ]
  [ seek track -------------------------------------------------- ]
  [ playback range start handle ] [ playback range end / stop handle ]
```

優先する体験:

- 今どのフレームにいるかが、ビューポート直下だけで分かる
- 横長の seek track をドラッグしてフレーム移動できる
- 再生 / 一時停止 / 前後移動がタイムライン左上に戻らず操作できる
- フレーム範囲 start / stop をseek track上のhandleで直接調整できる

初回では waveform や key marker の詳細描画は入れない。

## レイアウト方針

下バーは canvas に重ねない。

既存の PNG 保存事故を避けるため、現在と同じく `#viewport-container` の通常レイアウト内で canvas の外側に置く。

```text
#viewport-container
  #render-canvas
  #viewport-bottom-bar
```

バー高さは 32px から 40px 程度に収める。

1080p 付近では横幅が厳しいため、次の優先順位で折りたたむ。

1. seek track を最優先で広く取る
2. ラベル文字は短くする
3. 前キー / 次キーなどは icon button 化する
4. フレーム範囲 UI は narrow 時に右端へ詰める、または 2段目候補にする
5. waveform / key marker / timecode 表示は後続扱い

## 動作方針

### クリック / ドラッグ seek

seek track のクリック / drag は既存 Action 経路へ寄せる。

- click: `timeline.seekFrame` または `playback.seekFrame`
- drag start / move / end: 既存 timeline canvas と同じく `phase` を持つ seek action へ寄せる候補

既存の timeline canvas 由来 seek は `timeline.seekFrame` に寄っている。
下バー seek も「timeline 表示上の操作」ではなく「再生ヘッド操作」なので、実装時にどちらへ寄せるかを決める。

現時点の候補:

- `playback.seekFrame`
  - 汎用 seek として自然
  - current frame input / shortcut と近い
- `timeline.seekFrame`
  - drag phase の既存設計を流用しやすい
  - timeline overlay と seek bar の挙動を揃えやすい

初回は既存 drag phase を再利用できる `timeline.seekFrame` 寄せが実装しやすい。
ただし命名上は `seekbar.seekFrame` または `playback.scrubFrame` を後で切り出す余地を残す。

### 再生中の drag

再生中に seek bar をドラッグした場合は、初回では次の方針にする。

- pointerdown で一時的に pause
- drag 中は seek を反映
- pointerup 後は、元が再生中なら再生へ戻す

物理の暴れを避けるため、既存の hard seek / normal seek の扱いを確認しながら実装する。
大きなフレームジャンプでは `seekToBoundary` 相当の安定化が必要になる可能性がある。

### Undo / Redo

seek は編集履歴に積まない。

シークバーは再生位置を変える UI であり、キーフレームや transform の編集ではないため、Undo / Redo 対象外とする。

## 既存タイムラインとの関係

左タイムラインは、引き続き次を担当する。

- track selection
- keyframe display
- keyframe selection
- detailed timeline editing

下バー seekbar は、次だけを担当する。

- current frame の大まかな把握
- 再生位置の移動
- 再生範囲 start / stop の軽い操作

つまり、下バーは「動画プレイヤーの scrubber」、左タイムラインは「編集用 timeline」として分ける。

## Controller 案

既存 `ViewportBottomBarController` をそのまま肥大化させず、シークバー責務を別 controller に寄せる。

候補:

```ts
type ViewportSeekBarControllerOptions = {
    root: HTMLElement;
    getCurrentFrame(): number;
    getTotalFrames(): number;
    getPlaybackRange(): { start: number; end: number; useStart: boolean; useEnd: boolean };
    onSeek(frame: number, phase: "dragStart" | "dragMove" | "dragEnd" | "commit"): void;
    onStep(delta: number): void;
    onSeekBoundary(boundary: "start" | "end"): void;
    onTogglePlayback(): void;
    onPlaybackRangeChange(range: Partial<PlaybackRangeState>): void;
};
```

`UIController` 側は以下だけを担当する。

- MmdManager / Timeline state から表示値を渡す
- ActionDispatcher へ seek / playback / range action を流す
- playback state 変更時に controller を refresh する

将来的には `ViewportBottomBarController` を `ViewportSeekBarController` に置き換えるか、薄い wrapper にする。

## 実装スライス案

### Slice 1: 表示と seek track

- 下バー DOM を seekbar 用に置き換える
- current frame / total frames を表示
- seek track click / drag で frame 移動
- PNG 保存に映り込まないことを確認
- 既存の下パネル / timeline seek は維持

### Slice 2: 再生操作の集約

- play / pause / step / boundary ボタンを下バーへ追加
- repeat buttonは下段の再生button隣へ置き、ON時はstart / end範囲をloopする
- 左タイムライン上部の再生ボタンを整理候補にする
- keyboard shortcut と同じ Action 経路へ寄せる

### Slice 3: 再生範囲 UI

- start / end handle
- end handleを常時の自動停止位置として扱う
- WebM 出力 popup と同じ playback range state を参照
- 既存の表示欄側 range UI と重複しないよう整理

### Slice 4: 追加表現

- key marker の薄い表示
- audio waveform の簡易表示
- loaded motion / audio 長に応じた total range 表示
- 2段 UI への拡張可否を判断

## 注意点

- 下バーを canvas overlay に戻さない。PNG 保存に映り込む事故を避ける。
- seekbar drag 中の高頻度更新で timeline 全体を重くしない。
- `Timeline` 実装のように、表示更新要求と実 seek 実行を分ける。
- 物理 ON 時の大きな seek は安定化処理の対象にする。
- UI 非表示 / exporter mode / png capture mode では、下バーは既存方針どおり非表示または capture 範囲外にする。
- シークは Undo / Redo に積まない。

## 確認項目

- 下バーの seek track クリックで現在フレームが移動する。
- drag 中に current frame 表示、timeline playhead、viewport が追従する。
- 再生中 drag 後に、元の再生状態へ戻る。
- start / end frame と total frame の境界で clamp される。
- PNG 保存に下バーが映り込まない。
- 1080p 付近で seek track が十分な横幅を保つ。
- 日本語 / 英語でラベルが溢れない。

## 後続で決めること

- 1段のまま維持するか、2段 seekbar にするか。
- waveform を下バーに載せるか、既存タイムライン波形行を強化するか。
- key marker を下バーに表示する場合、どの track / target を対象にするか。
- 左タイムラインの再生欄をどこまで削るか。
- `timeline.seekFrame` と `playback.seekFrame` の Action 境界をどう命名整理するか。

## 2026-06-01 実装メモ

- `ViewportSeekBarController` を追加し、ビューポート下バーを current frame / seek track / transport / 再生範囲 UI に置き換えた。
- 既存の下バー数値入力とハンドル drag の結合を外し、右下ハンドルは `ViewportAxisHandleController` に分離した。
- 下バー seek track の drag は `timeline.seekFrame` の `dragStart / dragMove / dragEnd` に流す。
- current frame input は `playback.seekFrame`、transport button は既存 playback / keyframe seek Action を使う。
- 再生範囲 start / end は `ExportUiController` の既存 state を正とし、新しい保存項目は増やさない。
- 2026-08-27: 重複した「フレ・ストップ」checkboxを削除し、seekbarのend handleを常時停止位置とした。既存project schemaの`frameStopEnabled`は互換用に`true`で保存する。
- 2026-08-27: 下段の再生button隣へrepeat toggleを追加した。OFFではend停止、ONではend到達時にstartへ戻って再生を継続し、状態はprojectへ保存する。
