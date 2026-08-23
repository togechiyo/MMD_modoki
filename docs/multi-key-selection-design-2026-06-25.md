# 複数キー選択 設計メモ 2026-06-25

> **状態: 履歴設計。** 2026-08-23時点の実装では矩形選択に加えてExcel的な行・列見出し選択を採用した。行または列をクリックで選び、`Shift` は連続範囲、`Ctrl` / `Cmd` は個別追加・解除、ダブルクリックは見出し範囲を実キーへ変換する。行と列は排他で、和集合は矩形キー選択を使う。現行仕様は [タイムライン仕様](./timeline-spec.md#5-2-選択) を正本とする。

## 目的

v0.2 では、キー登録まわりを仕上げる前提として、タイムライン上の複数キー選択を先に整理する。

複数キー選択は単独機能ではなく、以下の後続機能の土台になる。

- 複数キーの delete / move / copy / paste
- 反転ペースト
- 外部親、物理オンオフ、照明、影、重力、アクセサリなど新しいキー種別の編集
- VMD / VPD 書き出し前の編集結果整理

このメモでは、まず実装対象をタイムライン上の既存 keyframe 操作に絞り、MMD 編集体験として破綻しにくい選択モデルを決める。

関連:

- [キー登録 v0.2 リリース前集中メモ 2026-06-25](./key-registration-v0.2-release-focus-2026-06-25.md)
- [キー登録再設計メモ 2026-06-16](./keyframe-registration-redesign-plan-2026-06-16.md)
- [タイムライン 仕様と実装メモ](./timeline-spec.md)

## 現状

`src/timeline.ts` の選択状態は単一選択である。

```ts
private selectedTrackIndex = -1;
private selectedFrame: number | null = null;
```

`Timeline.onSelectionChanged` も `track + frame` だけを通知する。

```ts
public onSelectionChanged: ((track: KeyframeTrack | null, frame: number | null) => void) | null = null;
```

`src/ui-controller.ts` の既存操作も、基本的に単一選択を前提にしている。

- `copySelectedKeyframe()`
- `pasteKeyframeClipboard()`
- `deleteSelectedKeyframe()`
- `nudgeSelectedKeyframe()`
- `updateTimelineEditState()`

このため、複数キー選択を単に `selectedFrame[]` として足すだけでは足りない。
選択対象、表示、CommandDiff、clipboard、undo / redo の単位を同時に決める必要がある。

## 基本方針

### 初期対象は bone / morph / camera

v0.2 の最初の実装対象は、既存 timeline に出ている主要 MMD track のうち、次に絞る。

- bone
- morph
- camera

accessory transform は既存経路があるが、複数キー選択の初期実装には含めない。
照明、影、重力、物理オンオフ、外部親などの scene/property 系 key は、選択モデルが固まった後で追加する。

### 単一選択は残す

既存の `selectedTrackIndex + selectedFrame` は、互換用の「アクティブキー」として残す。

用途:

- 下パネルの補間表示
- 選択中トラックの回転 overlay
- 既存 shortcut の fallback
- 1 キーだけ選んだときの既存操作互換

複数キー選択は、これとは別に `selectedKeys` として持つ。
単一選択は `selectedKeys` のうち最後にクリックした key、または inspector 対象の key として扱う。

### 選択単位は `track + frame + key kind`

選択 ID は、最低限次の情報を持つ。

```ts
export type TimelineKeySelectionRef = {
  target: "model" | "camera";
  trackCategory: TrackCategory;
  trackName: string;
  frame: number;
};
```

現行 `KeyframeTrack` は `category + name + frames` なので、まずは `trackCategory + trackName + frame` で十分。
将来、同じ track / frame に複数 payload を持つ scene/property 系 key を入れる場合は、`keyKind` を追加する。

```ts
keyKind?: "bone" | "morph" | "camera" | "property" | "accessory" | "light" | "shadow" | "gravity" | "physics";
```

### データの正規化

`selectedKeys` は Set で保持するが、外部 API では配列で返す。

```ts
type TimelineSelectionKey = string;

function createTimelineSelectionKey(ref: TimelineKeySelectionRef): TimelineSelectionKey {
  return `${ref.target}:${ref.trackCategory}:${ref.trackName}:${ref.frame}`;
}
```

注意:

- `trackName` に区切り文字が入る可能性を考えるなら、実装では JSON tuple または escape helper を使う。
- 操作前には必ず現行 `tracks` に存在する key だけへ正規化する。
- timeline target が model / camera で切り替わるときは、原則として選択をクリアする。

## UI 操作仕様

### クリック

- キー点クリック: そのキーだけを選択し、アクティブキーにする。
- 行クリックで key に当たらない場合: track 選択のみ。複数キー選択はクリアする。
- label クリック: track 選択のみ。複数キー選択はクリアする。

### Ctrl / Cmd + クリック

- キー点クリック: 選択状態を toggle する。
- toggle 後に選択された場合、その key をアクティブキーにする。
- toggle 後に外れた場合、残り selection の最後の key をアクティブキーにする。残りがなければ `selectedFrame = null`。

### Shift + クリック

候補は 2 つある。

1. 同一 track 内で anchor から clicked key までの範囲選択
2. 矩形選択導入まで Shift は使わない

v0.2 では 1 を採用する。

- selection anchor が同一 track にある場合、anchor frame から clicked frame までの既存 key を選択する。
- anchor がない、または別 track の場合は、clicked key を単一選択して anchor にする。
- 追加選択ではなく、範囲 selection に置き換える。

### ドラッグ範囲選択

v0.2 の最初の実装では必須にしない。
ただし設計上は入れられるようにしておく。

将来仕様:

- timeline static canvas 上で空白から drag すると矩形範囲選択。
- Ctrl / Cmd + drag は既存 selection に追加。
- Alt + drag は既存 selection から除外。
- drag 中の preview は overlay layer で描く。

### キーボード

- Delete: `selectedKeys` があれば複数削除。なければ従来通り selectedFrame / currentFrame 削除。
- Alt + ArrowLeft / ArrowRight: `selectedKeys` があれば複数移動。なければ従来通り selectedFrame 移動または seek。
- Ctrl / Cmd + C: `selectedKeys` があれば複数コピー。なければ従来通り単一コピー。
- Ctrl / Cmd + V: clipboard が複数なら複数 paste。単一なら従来通り。
- Escape: 複数キー選択をクリアし、track 選択は残す。

## 補間表示

複数キー選択中でも、補間パネルは「現在フレーム」を基準に表示する。

方針:

- 現在フレームに active track の key があれば、その key の補間を表示する。
- 現在フレームに key がない場合は、従来どおり current frame 登録時の補間状態を表示する。
- 複数ボーン / 複数 track をまたぐ選択では、補間一括編集は行わずグレーアウトする。
- 複数キー選択中でも、単一 track かつ current frame の key が明確な場合だけ編集可能にする。

複数キーの補間一括編集は別タスクにする。

## 表示仕様

キー点表示は 3 状態に分ける。

- 通常 key
- selected key
- active key

表示案:

- selected key: 既存 diamond / marker の外側に薄い stroke
- active key: selected stroke に加え、内側を強調
- selected row: 既存と同じ row highlight

注意:

- 全 selected key のために毎回全 track を重く走査しない。
- `selectedKeysByTrackKey: Map<string, Set<number>>` を描画前に作り、可視範囲だけ照合する。
- `src/timeline.ts` の既存方針どおり、static layer の再描画に閉じる。

## API 案

`Timeline` に次を追加する。

```ts
export type TimelineKeySelectionRef = {
  target: "model" | "camera";
  trackCategory: TrackCategory;
  trackName: string;
  frame: number;
};

export type TimelineSelectionChange = {
  activeTrack: KeyframeTrack | null;
  activeFrame: number | null;
  selectedKeys: TimelineKeySelectionRef[];
};
```

```ts
getSelectedKeys(): TimelineKeySelectionRef[];
setSelectedKeys(keys: readonly TimelineKeySelectionRef[], activeKey?: TimelineKeySelectionRef | null): void;
clearSelectedKeys(options?: { keepActiveTrack?: boolean }): void;
hasMultipleSelectedKeys(): boolean;
```

既存 callback は互換のため残す。
新 callback を追加するか、既存 callback の payload を拡張する。

```ts
public onSelectionChanged:
  ((track: KeyframeTrack | null, frame: number | null) => void) | null = null;

public onKeySelectionChanged:
  ((change: TimelineSelectionChange) => void) | null = null;
```

v0.2 では既存 callback を壊さず、新 callback を足す方が安全。

## CommandDiff 案

現行の `KeyframeCommandDiff` は 1 track / 1 frame 前提である。

```ts
type KeyframeCommandDiff =
  | { type: "keyframe.delete"; track; frame; beforeFrames; afterFrames }
  | { type: "keyframe.move"; track; fromFrame; toFrame; beforeFrames; afterFrames }
  | { type: "keyframe.paste"; track; frame; before; after };
```

複数操作は、既存 diff を配列にするより、専用 diff を足す方がわかりやすい。

```ts
type KeyframeBatchDeleteDiff = {
  type: "keyframe.batchDelete";
  items: {
    track: CommandTrackRef;
    frame: number;
    before: TimelineKeyframePayload;
  }[];
};

type KeyframeBatchMoveDiff = {
  type: "keyframe.batchMove";
  deltaFrames: number;
  items: {
    track: CommandTrackRef;
    fromFrame: number;
    toFrame: number;
    before: TimelineKeyframePayload;
    overwritten: TimelineKeyframePayload | null;
  }[];
};

type KeyframeBatchPasteDiff = {
  type: "keyframe.batchPaste";
  pasteBaseFrame: number;
  items: {
    track: CommandTrackRef;
    sourceFrame: number;
    targetFrame: number;
    before: TimelineKeyframePayload | null;
    after: TimelineKeyframePayload;
  }[];
};
```

重要:

- batch 操作は payload を持つ。
- frame list だけの diff にしない。
- undo は payload を戻す。
- move 先が既存 key を上書きする場合は `overwritten` を必ず持つ。
- 上書きが発生しても、Ctrl+Z で移動前の selected key と上書きされた key の両方を戻せることを必須条件にする。
- 同一 batch 内で衝突する場合は、実行前に正規化する。

## 複数移動の衝突ルール

移動は単純に `frame + delta` では済まない。
同一 track 内の key が互いに衝突する可能性がある。

ルール案:

- `toFrame < 0` になる key が 1 つでもあれば、操作全体を失敗させる。
- 同一 track 内で複数 selected key が同じ `toFrame` になる場合は、操作全体を失敗させる。
- selected key 同士の入れ替わりは許可する。
- unselected key に衝突した場合は上書きし、undo 用に `overwritten` を保持する。

適用順:

- delta が正なら、同一 track 内では frame の大きい順に処理する。
- delta が負なら、frame の小さい順に処理する。

ただし payload diff に寄せるなら、実処理順に依存しない pure helper で `before -> after` を作る方が安全。

## Clipboard 案

単一 clipboard は残す。
複数コピー時は新形式を使う。

```ts
type KeyframeClipboard =
  | {
      version: 1;
      mode: "single";
      sourceTarget: "model" | "camera";
      sourceFrame: number;
      track: CommandTrackRef;
      payload: TimelineKeyframePayload;
    }
  | {
      version: 2;
      mode: "batch";
      sourceTarget: "model" | "camera";
      sourceBaseFrame: number;
      items: {
        track: CommandTrackRef;
        sourceFrame: number;
        frameOffset: number;
        payload: TimelineKeyframePayload;
      }[];
    };
```

`sourceBaseFrame` は selection 内の最小 frame にする。
これは MMD の「現在フレームを基準に貼り付ける」挙動に寄せるためである。

paste 時は `currentFrame + frameOffset` に貼る。

例:

- 10f / 20f / 40f をコピーする
- `sourceBaseFrame = 10`
- 30f に paste する
- 30f / 40f / 60f に貼られる

互換性:

- 単一コピーは従来の UX を維持する。
- selection が 1 つだけでも、内部的には single clipboard にしてよい。

## 反転ペーストとの関係

反転ペーストは、複数キー selection / batch clipboard の派生として扱う。

最初は次に絞る。

- bone / movableBone のみ
- morph / camera / accessory / scene key は対象外
- 左右ボーン名の変換に失敗した item は paste しない、または操作全体を失敗させる

複数キー選択側では、反転の詳細を持たない。
batch paste 前に payload と track を変換する helper を別に置く。

## 実装ステップ

### Step 1: selection model だけ足す

対象:

- `src/timeline.ts`
- `src/types.ts` または timeline 専用型
- timeline selection helper の unit test

内容:

- `TimelineKeySelectionRef`
- `getSelectedKeys()`
- `setSelectedKeys()`
- Ctrl / Cmd + click toggle
- Shift + click same-track range
- 選択表示

この段階では delete / copy / paste / move は単一操作のままでよい。

### Step 2: UIController が複数選択を読めるようにする

対象:

- `src/ui-controller.ts`
- `src/actions/action-availability.ts`

内容:

- `updateTimelineEditState()` の表示文言を複数選択対応にする。
- `collectKeyframeCommandSnapshot()` に `selectedKeys` を追加する。
- 複数選択時の button enabled / disabled を定義する。

### Step 3: batch delete / move

対象:

- `src/actions/command-types.ts`
- `src/actions/keyframe-command-builder.ts`
- `src/actions/command-executor.ts`
- unit test

内容:

- `keyframe.batchDelete`
- `keyframe.batchMove`
- payload based undo
- collision rule test

### Step 4: batch copy / paste

対象:

- `src/ui-controller.ts`
- command diff / executor
- unit test

内容:

- batch clipboard
- relative frame paste
- compatible target check
- paste 後の selectedKeys 更新

### Step 5: 反転ペーストへ接続

対象:

- mirror paste helper
- UI / shortcut は後続

内容:

- batch clipboard を変換して paste できる形にする。
- bone 限定で pure helper から始める。

## テスト観点

pure helper:

- selection key の正規化
- track 更新後に消えた key が selection から外れる
- Ctrl click で toggle できる
- Shift click で同一 track の範囲 key だけ選ばれる
- timeline target 切替で selection が消える

command:

- 複数 delete が payload を保持して undo できる
- 複数 move が delta を保持して redo できる
- `toFrame < 0` を含む move は失敗する
- selected key 同士の移動は衝突扱いにしない
- unselected key 上書き時に undo で元に戻る
- batch paste が `sourceBaseFrame` からの offset を保ち、現在フレームを貼り付け基準にする

UI / manual:

- クリックで単一選択
- Ctrl click で複数選択
- Shift click で同一 track 範囲選択
- Delete で選択 key がまとめて消える
- Alt + Arrow で選択 key がまとめて移動する
- copy / paste 後に相対間隔が保たれる
- project 保存 / 読み込み後、選択状態は復元しないが keyframe は残る

## v0.2 の完了条件

最低ライン:

- 複数キーを選択できる
- 複数キーを削除できる
- 複数キーを 1 frame 単位で移動できる
- 複数キーを copy / paste できる
- undo / redo で batch 操作が壊れない

やらないこと:

- 矩形選択
- 複数 track をまたぐ Shift 範囲選択
- scene/property 系 key の完全対応
- 反転ペーストの完成
- 選択状態の project 保存

## 判断

複数キー選択は `Timeline` の UI だけで完結させない。
後続の反転ペースト、外部親、物理オンオフ、scene key を考えると、選択状態は CommandDiff と clipboard の入力として扱える形にする必要がある。

最初の実装では、単一選択互換を残しながら `selectedKeys` を横に足す。
その後、delete / move / copy / paste を batch diff へ移す。
この順番なら、既存のキー登録経路を壊しにくく、v0.2 の残タスクを順番に載せられる。
