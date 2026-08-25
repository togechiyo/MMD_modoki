# エフェクト・DoF 対象のタイムラインキー化 事前検討

更新日: 2026-08-25

## 結論

- エフェクト欄の数値スライダーは、**許可リスト方式ならタイムライン化できる**。ただし「スライダーであること」ではなく、再生中に shader compile、PostProcess の生成破棄、FrameGraph の resource / stack 再構築を起こさず値だけ更新できることを採用条件にする。
- FrameGraph の stack 順序、effect の追加 / 削除、backend 切替は、技術的に停止点で再構築することはできても、通常のタイムラインキーには向かない。現行方針どおり project 全体の静的設定に留める。
- ユーザーが必要とする effect の ON / OFF は、stack の構造的な enabled を切り替えるのではなく、**効果量を `0 / 1` にする visual bypass track** として実現できる。hard cut は step、fade は linear で扱える。OFF 中も task と resource を保持するため負荷は残るが、キー通過時の rebuild lag を避けられる。
- DoF の焦点対象を人物 A から人物 B へ切り替える機能は、**現行構造の延長で実現可能**。`modelInstanceId + boneName` を1個の step キーとして登録し、そのフレームから対象を切り替える方式が最小である。
- 操作を増やさない自動選択も実現可能である。UI は `フォーカス方式` の dropdown 1個を基本とし、現在は `オートフォーカス`、`指定対象`、`カメラ注視点` を切り替える。通常利用の既定は、MMD の model / bone identity を使う人物優先の `オートフォーカス` とする。
- 新しい実写向け autofocus / video tracking 研究は、単一フレームで最短 depth を選ぶ方式より、subject identity の維持、temporal consistency、切替の hysteresis を重視している。MMD_modoki は正確な depth、モデルID、ボーン位置を既に持つため、推論モデルを導入せず同じ設計原則をより決定的に実装できる。
- 現行 DoF は、選択したモデル / ボーンを project 保存し、毎描画フレームで対象ボーンのワールド位置から focus distance を更新している。新しく必要なのは対象選択の scene track、編集操作、project round-trip、タイムライン行であり、DoF の距離計算自体を作り直す必要はない。
- DoF 側の最初の実装候補は `DoF 対象` の step track と `DoF 前後補正` の linear track。effect ON / OFF 側は `Bloom 効果量` または `LUT 効果量` の visual bypass を最初の parameter registry PoC にするのが安全である。

## 現行実装で確認したこと

### Scene track と出力経路

照明、影欄、重力、アクセサリは、MMD_modoki が所有する scene track として登録、評価、project 保存されている。`evaluateSceneTracksAtFrame()` は通常再生だけでなく `renderOnce()` と `renderOnceForCapture()` からも呼ばれるため、同じ評価点へ effect track を追加すれば viewport と PNG / WebM 出力を共通化できる。

effect key も VMD section へ押し込まず、project 専用の `modoki-owned track` とする。

### DoF の現在地

現在の DoF 対象は次の3値を保持している。

- `dofFocusTargetModelInstanceIdValue`
- `dofFocusTargetModelPathValue`
- `dofFocusTargetBoneNameValue`

project 保存では instance ID、path、bone name を保存し、読み込みでは instance ID を優先して path を旧 project 向け fallback にしている。同じ PMX を2体読み込んでも instance ID で区別できる。

対象位置は、指定ボーンがあれば runtime bone の world matrix、ボーン指定がなければモデル bounds の中心、モデル指定がなければ camera target から取得する。auto focus は `onBeforeRenderObservable` で毎フレーム更新されるため、人物が踊っている間も指定ボーンを追従できる。

一方、右パネルの選択表示は現在 `modelPath` から対象を引き直している。同一パスのモデルを複数読み込むと最初の1体へ表示が寄るため、多人数対応の前提として UI も instance ID 優先へ直す必要がある。

### Babylon.js 9.2.0 の境界

この repository が固定している `@babylonjs/core 9.2.0` では、DoF の `focusDistance`、`fStop`、`lensSize`、`focalLength` は既存 effect へ動的に渡せる。一方、`depthOfFieldBlurLevel` は DoF instance を作り直して pipeline を再構築する実装であり、連続キーには向かない。

FrameGraph task 自体には disabled pass があるが、MMD_modoki の stack enabled / order は resource plan と texture 接続を変える。現行実装では安全のため backend rebuild へ寄せている。したがって Babylon 側に disabled があることを、effect ON / OFF のタイムライン化が安全である根拠にはしない。

2026-08-25 の所有者実機所感では、現在の effect ON / OFF は切替時に一瞬の lag を感じる。これは stack state 変更時に FrameGraph backend を再構築する現行経路と整合する。タイムライン再生中に同じ構造切替を繰り返す方式は避け、以下の visual bypass を優先候補にする。

## ON / OFF は効果量の visual bypass として扱う

### 構造 enabled と見た目の有効量を分ける

```text
stack enabled
  = task / resource / texture接続を持つか
  = project全体の静的設定

timeline effect amount
  = 既に構築済みのeffectを画面へ何割反映するか
  = 0なら見た目上OFF、1なら設定値どおり
```

タイムライン上の hard ON / OFF は amount の step key `0 / 1`、フェードイン / アウトは同じ track の linear 補間で表せる。UI 表示は「ON / OFF」でもよいが、内部では stack entry の `enabled` と別の `amount` にする。

### effect ごとの実現方法

1. 既存の強度 `0` が厳密な neutral になる effect は、その強度 track を amount として兼用する。
   - Bloom weight
   - LUT intensity
   - SSAO / Offset Shadow / Offset Rim の strength
   - Fog opacity
   - Aerial Perspective / Directional Light Shafts の strength
2. 既存強度 `0` が neutral にならない、または複数 parameter をまとめて消したい effect は、元画像と effect 後画像を `mix(original, effected, amount)` する専用 composite を置く。
3. task が存在しない状態から有効化することはしない。再生開始前に stack entry、必要 depth / normal / velocity、shader を構築しておく。

### 利点

- キー通過時に FrameGraph rebuild や shader compile を起こさない。
- step の瞬間切替と linear のfadeを同じ仕組みで扱える。
- 元の effect parameter を保持したまま見た目だけ消せるため、ONへ戻したときの値を失わない。
- viewport、seek、PNG / WebM で同じ決定的な評価にしやすい。

### 制約

- amount が `0` でも task、depth / normal / velocity resource、GPU処理は原則残る。これは低遅延切替との交換条件である。
- 重い SSGI、Ocean、Motion Blur などを長時間 `0` にしても性能節約にはならない。編集時の完全停止は静的 stack enabled を使う。
- DoF は現行 Babylon pipeline に全体 amount がないため、単純な既存 slider だけでは厳密な visual bypass にならない。DoF output と original の composite、または両 backend で同等に働く専用 bypass 経路が必要で、最初の amount PoC には Bloom または LUT の方が向く。
- effect 固有の強度と共通 amount を掛け合わせる場合、`effectiveValue = authoredValue * timelineAmount` とし、キー評価で authored value を破壊しない。

### UI と保存

- effect row の通常 checkbox は静的 stack enabled のまま残す。
- timeline 登録対象には別名で `効果量` を出し、`0%` を見た目上OFF、`100%` を通常値とする。
- project には UI checkbox の値ではなく `effectId + amount track` を保存する。
- amount track が存在する effect を stack から無効化しようとした場合は、キーを消さず「タイムライン効果量は保持されるが再生には反映されない」と表示する。
- 再生中は通常 checkbox を切り替えず、amount の評価結果だけを readout へ反映する。評価によるUI更新から Action を再dispatchしない。

## キー化できる範囲

### 最初から扱いやすいもの

| 候補 | 補間 | 判定 | 条件 |
| --- | --- | --- | --- |
| DoF 対象モデル + ボーン | step | 最優先候補 | DoF は再生前から有効。instance ID で識別する |
| DoF 前後補正 | linear | 最優先候補 | auto focus で求めた距離への signed offset として扱う |
| Effect 効果量 | step / linear | 優先 PoC | taskを事前構築し、`0=見た目上OFF`、`1=通常値` とする |
| Bloom 強度 | linear | PoC 候補 | Bloom entry を再生中ずっと有効にし、weight だけ変える |
| LUT 強度 | linear | PoC 候補 | LUT asset と entry を事前に確定し、preset / path は変えない |
| Gamma | linear | PoC 候補 | Gamma task / Classic 経路を事前に有効化し、backend 間の見た目差を確認する |

この表の数値は UI の `0..100` 操作位置ではなく、`mm`、`0..2` など manager が保持する実値を保存する。UI slider mapping を後で変更しても project の意味が変わらないようにする。

### 設計を共通化した後なら増やせるもの

- Bloom threshold / color
- Fog density / opacity / color
- Vignette weight
- Chromatic aberration、Grain、Sharpen
- DoF near suppression、lens size、lens distortion influence
- SSAO strength / radius、Offset Shadow / Rim の強度・offset・softness
- Ocean、Aerial Perspective、Directional Light Shafts など FrameGraph 固有 effect の純数値

これらは値そのものは更新可能だが、次を個別確認してから許可リストへ入れる。

- Classic / FrameGraph で同じ意味か、FrameGraph 専用であることを明示できるか
- `0` や neutral 値をまたいだときに task / resource の生成破棄が起きないか
- setter が毎フレーム PostProcess を作り直さないか
- 整数化、しきい値、他パラメータとの連動が補間結果を壊さないか
- PNG / WebM 出力も viewport と同じ値を評価するか

### 通常のタイムラインキーにしないもの

- FrameGraph stack の順序変更
- effect の追加 / 削除、stack enabled
- Classic / FrameGraph backend 切替
- DoF blur quality
- Motion Blur sample 数、SSGI sample 半径、glare count など品質・sample 構成に近い値
- LUT preset、外部 LUT path、shader path
- tone mapping operator、debug view、blend mode など shader variant / 離散実行経路へ影響する設定
- output 解像度、AA方式、depth / normal / velocity など共有 resource の必要性を変える設定

順序変更は「不可能」ではない。現在も停止中の UI 操作では backend rebuild により順序を変えられる。ただしキー通過ごとの rebuild は非同期 build、GPU resource 再確保、古い task の破棄、出力時の決定性を抱えるため、動画編集用の通常キーとしては採用しない。

## DoF 対象切替の設計案

### 1. モデルとボーンを1個のキーにする

モデル用とボーン用を別 track にすると、同じフレームで片方だけ先に評価され、存在しない組み合わせを一瞬作り得る。次の payload を atomic に扱う。

```ts
type DofFocusTargetValue = {
    modelInstanceId: string | null;
    modelPath: string | null; // 旧 project / 診断用 fallback
    boneName: string | null;
};
```

- `modelInstanceId = null` は camera target を表す。
- 補間は `step` 固定とし、キーのフレームから新対象を使う。
- `modelPath` は同一パス複製を識別できないため runtime の主キーにしない。
- localized label や model index は保存しない。index は読込順で変わり、表示名は翻訳やrenameで変わるためである。

### 2. 対象解決と欠損時の扱い

推奨する runtime 規則は次のとおり。

1. instance ID が存在し、bone name も存在するなら、その bone world position を使う。
2. model は存在するが bone がない場合、モデル bounds 中心へ fallback し、同じ欠損を毎フレーム通知しない。
3. model が存在しない場合、camera target へ fallback し、track の保存値自体は消さない。
4. 古い project で instance ID がない場合だけ path で1回解決し、保存時に instance ID を補完する。

現行 `setDofFocusTargetByInstanceId()` は解決失敗時に現在値を null へ正規化する。timeline 評価では track payload を破壊しない resolver を別に置き、missing model の一時 fallback と永続データを分離する。

### 3. 切替時の見え方

初期実装は hard cut とする。多人数ダンスでは camera cut と同じフレームに対象キーを置けば自然に使える。

人物 A から人物 B へ数フレームかけてピントを送る rack focus は別段階にする。対象 identity の線形補間には意味がないため、必要なら次のどちらかを追加調査する。

- A と B の world position を一定期間 blend して仮想 focus target を作る。
- auto focus を一時 override する絶対 focus distance track を用意する。

前者は移動する2人を追えるが、2 target の解決、transition duration、欠損時の規則が増える。後者は単純だが camera 移動中に人物から焦点が外れやすい。まず step 切替を実用確認してから決める。

### 4. 評価順

effect scene track の評価時には DoF target identity だけを切り替える。実際の bone world position と focus distance は、現行どおり model animation、外部親、camera 同期が反映された描画直前に計算する。

```text
frameを決定
  -> scene/effect trackを評価してDoF target identityを選ぶ
  -> scene.render()
  -> 描画直前に対象boneのworld positionを読む
  -> focus distance / F-stopを更新
  -> ClassicまたはFrameGraph DoFを実行
```

`renderOnceForCapture()` も同じ scene track 評価と `scene.render()` を通るため、別 exporter 専用ロジックは作らない。

## 複雑な操作を要求しないオートフォーカス案

### 2026-08-25 初期実装

`オートフォーカス`、`指定対象`、`カメラ注視点` の3方式を effect panel の dropdown として実装した。内部の `person-auto` mode は通常UIで `オートフォーカス` と表示し、新規sceneの既定選択にする。`指定対象` の場合だけ model / bone selector を表示し、mode は project 保存 / 読み込みへ含める。mode field のない旧 project は、保存済みDoF対象があれば `指定対象`、なければ `カメラ注視点` として復元する。

初期の `オートフォーカス` は人物優先として次の範囲に限定した。

- `頭`、`首`、`上半身2`、`上半身` と対応する英語名のいずれかを持つmodelだけを人物候補にする。`センター` だけのPMX stageは候補外である。
- 候補boneを画面へ射影し、画面中央への近さで選ぶ。同じ中央scoreならcameraからboneまでのworld距離が近い人物を選ぶ。WebGPU reverse depthと通常depthで数値方向が逆になるため、投影depthは画面内判定だけに使い、遠近の並び順には使わない。
- 現在対象より新候補のscoreが25%以上強い場合だけ切り替える。
- 人物候補がいなければcamera targetへfallbackする。
- 同じPMX pathの複数体はmodel instance IDで区別する。

pure helper、project serializer / importer、dropdown操作とproject round-tripのElectron E2Eを追加した。depth occlusion、時間dwell、focus distance smoothing、seek / capture用の生成track cacheはまだ入れていない。以下の節は、その後の拡張候補も含む設計として残す。

### UI は方式の dropdown だけを通常表示する

推奨する選択肢は次のとおり。`指定対象` を選んだときだけ既存の model / bone selector を展開し、それ以外は追加操作を要求しない。

| 表示名 | 選択規則 | 主な用途 |
| --- | --- | --- |
| オートフォーカス | 画面内の人物候補から頭 / 上半身を優先し、中央度、可視性、面積、距離で選ぶ | 多人数ダンスの通常用。新規sceneの既定 |
| 中央優先 | 中央付近で面積を持つ被写体 / depth cluster を選ぶ | カメラワークで主役を中央に置く動画 |
| 手前優先 | 中央寄りの安全領域内で、一定面積以上を占める最も手前の候補を選ぶ | 前景へピントを送りたい構図 |
| 指定対象 | model instance + bone を固定追従する | 確実に人物を指定したい場合 |
| カメラ注視点 | camera target までの距離を使う | 現行互換 |
| 手動 | 絶対 focus distance を固定する | 演出、特殊構図、調整用 |

通常表示には現在の判断を読むだけの `対象: モデル名 / 頭  6.2 m` 程度を添える。感度、領域幅、切替待ち時間などを通常 UI へ並べず、まず mode ごとの preset に固定する。将来必要になった場合だけ Advanced に `追従: なめらか / 標準 / 機敏` の1項目を追加する。

### 実写向けの新しい手法から採る部分

- Apple の Cinematic Video API は、検出した subject ID を時系列で追跡し、`strong` focus は対象を固定、`weak` focus は適切な場面で自動 rack を許す。点指定から salient object を選ぶ経路も持つ。MMD_modoki では model instance ID を subject ID、中央領域を暗黙の点指定として使える。
- Apple の Cinematic mode は face、head、torso を同一人物の detection group として扱い、focus pull の keyframe を先読みして滑らかな遷移を作る。MMD では `頭 -> 上半身 -> センター / bounds中心` の fallback group を明示的に組める。
- Sony の subject recognition AF は、人で眼を検出できない場合に顔 / 頭 / 胴体へ fallback し、姿勢推定で後ろ向きでも人物を維持する。また tracking persistence と subject shift sensitivity を別に扱う。これは、多人数で一瞬交差しただけでは別人へ飛ばさない設計に対応する。
- 2025年の video depth / video entity segmentation 研究は、per-frame 推定を独立に行うとちらつきや scale jump が出るため、temporal consistency と entity tracking を重視している。MMD_modoki では video model を動かすより、既知のモデルIDと前フレームの lock state を利用する方が軽く、再現性も高い。
- 学習型 autofocus は画像から depth / focus distance を推定できるが、MMD_modoki には scene depth と object identity がある。AI 推論は追加依存、GPU負荷、誤認識、offline package size を増やすため、少なくとも第一段階では採用しない。

### 候補抽出

人物候補は renderer が既に持つ情報から作る。

1. 可視 model ごとに `頭`、`上半身`、`センター`、bounds中心の順で利用可能な anchor を取得する。
2. anchor を viewport 座標へ射影し、camera 背面、画面外、depth buffer に対して遮蔽されている候補を除外する。
3. 同じ model instance の複数 anchor は1 subject group とし、stable ID は `modelInstanceId` にする。
4. `.x` / OBJ、ステージ、小物も対象にする mode では、低解像度 depth から面積を持つ depth cluster を追加候補にする。

髪、腕、粒子などの1 pixelだけが近いケースへ飛ばないよう、**最小 depth は使わない**。depth cluster は中央寄りの領域に重みを付けた histogram / quantile で作り、一定の weighted coverage を持たない近距離 outlier を捨てる。

### mode ごとの score

候補 `c` の基本 score を次の要素から作り、mode ごとに重みだけ変える。

```text
score(c)
  = subjectKindWeight
  * centerWeight
  * visibilityConfidence
  * coverageWeight
  * distanceWeight
```

- `オートフォーカス`（人物優先）: 人物 / 頭の優先度を最大にし、中央度を次に置く。距離は僅差の tie-break 程度にする。
- `中央優先`: 画面中央からの距離を楕円 Gaussian で減衰させ、中央領域内で支持面積が大きい候補を選ぶ。中央1 pixelの depth へ固定しない。
- `手前優先`: 近さを主にするが、画面端を除いた safe region と最小 coverage を必須にする。これにより手前を横切る細い腕や particle が focus を奪いにくい。

初期値のたたき台は、中央 safe region を画面幅 / 高さの各60%、depth cluster の最小 weighted coverage を5〜8%とする。これは仕様値ではなく、豆腐モデル2〜3体とステージ fixture で調整する。

### focus hunting を止める状態機械

候補選択は各 frame の最大 score へ即時切替しない。

```text
候補を評価
  -> 現対象が有効なら維持を優先
  -> 挑戦候補が現対象を十分上回る状態が一定時間続いたら切替
  -> 一時遮蔽では最後の対象 / 距離を保持
  -> camera cut / seekでは待ちを解除して再取得
  -> focus distanceだけ滑らかに追従
```

- challenger は current score を15〜25%上回ることを要求する。
- 6〜12 frame（30 fpsで0.2〜0.4秒）持続してから切り替える。
- 一時遮蔽や一瞬の画面外では10〜20 frameは最後の focus distance を保持する。
- 対象を完全に失った場合も、即座に無限遠 / 背景へ飛ばさず hold してから camera target へ fallback する。Unreal VCam が tracking target の frame-out 時に manual focus へ移して距離を安定させる挙動と同じ意図である。
- camera cut は別 shot とみなし、hysteresis を解除して最初の有効 frame で再取得する。

距離追従は raw distance の単純な frame 固定割合ではなく、実時間ベースの critically damped spring または exponential half-life を使う。まず0.15〜0.35秒相当を標準 preset とし、大きな subject 切替では0.2〜0.5秒程度の rack focus として目視評価する。近距離と遠距離の遷移感を揃えるため、`1 / distance` の optical power 空間で平滑化する案も fixture 比較の対象にし、採用前に現在の Babylon DoF の見え方で確認する。

### depth の読み方と backend 境界

- 人物 mode は model / bone の CPU 側 anchor を主経路にできるため、GPU readback を毎 frame行わずに始められる。
- 中央 / 手前 mode で scene depth を使う場合、full-size depth texture の同期 readback は避ける。GPU 上で低解像度 histogram / summaryへ縮約し、非同期に10〜15 Hz程度で読むか、FrameGraph 内で選択結果まで作る。
- Classic と FrameGraph で depth source が異なるため、最初の PoC は人物 anchor 方式を両 backend 共通にし、depth cluster は FrameGraph 先行の Experimental として隔離するのが安全である。
- 透明髪、alpha blend、particle は depthを書かない、または代表 depth と合わない場合がある。人物 anchor と depth occlusion test を組み合わせ、depthだけを唯一の正解にしない。

### viewport、seek、WebM を同じ結果にする

temporal autofocus は過去の lock state と smoothing state を持つため、単純に `現在 frameだけ評価` すると、同じ frameでも再生、seek、途中frameからのWebM出力で結果が変わる。この点を未定義のまま実装しない。

推奨案は autofocus の判断を小さな生成 track として cache する方式である。

1. scene / motion / camera の更新世代に対して、subject ID と target focus distance の frame列を決定的に評価する。
2. camera cut、mode変更、model / motion / camera変更で該当範囲を invalidation する。
3. viewport seek と capture は同じ cache を参照し、focus distance track の補間だけを行う。
4. depth cluster のように render が必要な mode は、capture 前 prepass または短い look-back 付き checkpoint を使う。

初期実装で precompute を入れない場合でも、export は開始frameより前から autofocus state を warm-upし、seek時は一定の look-back から再評価する必要がある。現在の「動画出力開始位置で物理結果が変わる」MMD寄せ仕様とは分離し、同じ物理状態・同じ frameなら autofocus 自体は同じ判断を返すことを目標にする。

### 実装順の提案

1. `フォーカス方式` の保存型と、`オートフォーカス`（人物優先）の候補 / score / hysteresis を pure helper として作る。画面内に人物がいなければ camera target を hold付きで使う。
2. model instance ID、頭 / 上半身 fallback、複数人物の交差、遮蔽、camera cutを豆腐 fixtureで確認する。
3. `中央優先` を人物 anchor候補だけで追加する。これだけでも多人数ダンスの主要要望をかなり満たせる。
4. GPU depth縮約が安定してから、stage / accessoryも拾う `中央優先` と `手前優先` を Experimental で追加する。
5. project round-trip、seek、PNG / WebM decoded frameで同一focus判断になることを確認して通常機能へ上げる。

第一段階では、最新の認識AIを導入することよりも **MMD固有の既知情報を使った subject-aware + sticky autofocus** の方が、軽量、offline-first、説明可能、project / export再現性の面で適している。

## effect parameter track の共通設計案

全 `ProjectEffectState` を1キーへ丸ごと保存しない。数十項目の古い値が、ユーザーが触っていない effect や backend 設定を巻き戻すためである。parameter ごとの小さい track と、許可リスト registry を使う。

```ts
type KeyableEffectParameterDescriptor = {
    id: string;
    effectId: string;
    valueKind: "number" | "rgb" | "step-target";
    interpolation: "linear" | "step";
    backend: "shared" | "frameGraph" | "classic";
    runtimeCost: "value-only" | "reconfigure" | "rebuild";
    readCurrent: () => unknown;
    applyEvaluated: (value: unknown) => void;
};
```

通常機能へ出せるのは原則 `runtimeCost = value-only` だけとする。`reconfigure` は Experimental、`rebuild` は timeline 非対応にする。

track は既存 scene track と同じ責務を持つ。

- base value と frame / value
- 同一フレーム上書き
- linear / step 評価
- Action -> Command -> 最小差分
- undo / redo
- project の optional field と旧 project fallback
- 通常再生、seek、PNG / WebM capture の共通評価

タイムラインへ全 slider 行を常時並べると行数が増えすぎる。右 effect panel で対象 parameter を選んで登録し、Effect カテゴリには「キーが存在する parameter」と「現在編集対象」だけを出す方式がよい。

## 段階案

### Phase 0: 前提修正と pure logic

- DoF target panel の選択復元を path ではなく instance ID 優先にする。
- `DofFocusTargetValue` の normalize / resolve / step evaluate を pure helper にする。
- 同じ PMX path を2体読み込んだ fixture で identity を区別する。

### Phase 1: 多人数 DoF の最小実装

- `DoF 対象` の step track を追加する。
- camera target、人物 A の頭、人物 B の頭をキーで切り替える。
- 登録、上書き、削除、移動、copy / paste、undo / redo、project round-trip を既存 scene track と同じ操作へ接続する。
- viewport と WebM capture で切替フレームが一致することを確認する。

`DoF 前後補正` も同時に入れる場合は linear track として分離する。対象 identity と数値 offset を同じ補間方式へ押し込まない。

### Phase 2: 数値 parameter の PoC

- descriptor registry を追加する。
- `Bloom 効果量` か `LUT 効果量` のどちらか1項目を選び、step `0 / 1` と linear fade の両方を確認する。
- effect entry は開始前から存在・enabled、stack order は固定、という実行条件を UI に明示する。
- 通常 checkbox の構造 enabled と timeline amount が互いの保存値を上書きしないことを確認する。
- Classic / FrameGraph、seek、project round-trip、PNG / WebM を比較する。

### Phase 3: 許可リスト拡張

- setter / resource plan を棚卸しし、`value-only` と確認できた項目だけ追加する。
- backend 固有 parameter は timeline 上でも backend 名を表示する。
- enable / order のアニメーションは、FrameGraph の構造変更方式が変わるまで対象外を維持する。

## 必要な自動確認

- pure unit: step 境界、frame 0 より前、同一 frame 上書き、欠損 model / bone fallback
- project unit: instance ID、path fallback、未知 parameter ID、旧 project の round-trip
- Command unit: 登録、削除、移動、copy / paste、undo / redo
- Electron E2E: 同一 PMX path の2体を対象 A / B として選び分け、seek と再生で selector と focus target が一致する
- capture E2E: 2体をカメラから異なる距離へ置き、切替前後の PNG と WebM decoded frame で近側 / 遠側の sharpness が入れ替わる
- backend: Classic / FrameGraph の二重適用がなく、切替中に rebuild が発生しない
- amount bypass: `0 -> 1 -> 0` のstep切替とfadeで rebuild countが増えず、通常checkboxの値も変わらない
- missing reference: 対象モデルを外した project でも crash せず camera target fallback と警告が1回だけ出る

実描画 fixture はユーザー所有モデルを使わず、配布可能な豆腐モデル2体と単純な頭相当ボーンで構成する。

## 採用判断として残るもの

- 最初の visual bypass PoC を `Bloom 効果量` と `LUT 効果量` のどちらにするか。
- DoF 対象 track を Effect カテゴリへ置くか、Camera カテゴリ内の modoki 独自行として見せるか。保存上は camera VMD と分離する。
- hard cut だけで十分か、後続で rack focus transition を設けるか。
- effect が disabled のとき、キー登録を拒否するか、登録は許可して「再生前に有効化が必要」と表示するか。

## 参照

- [v0.2.3 タイムライン / シーンキー編集 計画](./v0.2.3-timeline-scene-key-editing-plan.md)
- [タイムライン仕様](./timeline-spec.md)
- [カメラ用ポストエフェクト現行仕様](./camera-postfx-current-spec.md)
- [FrameGraph Post Stack 現行仕様](./framegraph-post-stack-current-spec-2026-07-01.md)
- [Babylon.js Editor DoF 調査](./babylon-editor-dof-research.md)
- [Babylon.js 9.2.0 DepthOfFieldEffect source](https://github.com/BabylonJS/Babylon.js/blob/9.2.0/packages/dev/core/src/PostProcesses/depthOfFieldEffect.ts)
- [Babylon.js 9.2.0 DefaultRenderingPipeline source](https://github.com/BabylonJS/Babylon.js/blob/9.2.0/packages/dev/core/src/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.ts)
- [Babylon.js 9.2.0 FrameGraphTask source](https://github.com/BabylonJS/Babylon.js/blob/9.2.0/packages/dev/core/src/FrameGraph/frameGraphTask.ts)
- [Apple: Cinematic Video API — automatic focus decisions, detected object tracking, strong / weak focus (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/319/)
- [Apple: Support Cinematic mode videos — detection groups and focus-decision smoothing (WWDC23)](https://developer.apple.com/videos/play/wwdc2023/10137/)
- [Unreal Engine: Cine Camera — manual / tracking focus and focus smoothing](https://dev.epicgames.com/documentation/unreal-engine/cinematic-cameras-in-unreal-engine)
- [Unreal Engine: Virtual Camera — tracking target frame-out fallback](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-vcam-virtual-camera-settings)
- [Sony: Subject recognition AF — eye / head / body fallback](https://www.sony.com/electronics/support/articles/00355735)
- [Sony: Tracking subject shift range and tracking persistence](https://www.sony.com/electronics/support/articles/DITU26200108)
- [Sony: AI processing unit with human pose estimation (2023 press release)](https://www.sony.com.hk/press/pdf/20230330_e.pdf)
- [Google Research / CVPR 2020: Learning to Autofocus](https://research.google/pubs/learning-to-autofocus/)
- [Google Research / SIGGRAPH 2018: Synthetic Depth-of-Field with a Single-Camera Mobile Phone](https://research.google/pubs/synthetic-depth-of-field-with-a-single-camera-mobile-phone/)
- [CVPR 2025: Video Depth Anything — temporal consistency for long videos](https://openaccess.thecvf.com/content/CVPR2025/html/Chen_Video_Depth_Anything_Consistent_Depth_Estimation_for_Super-Long_Videos_CVPR_2025_paper.html)
- [CVPR 2025: RollingDepth — avoiding per-frame depth flicker and scale jumps](https://openaccess.thecvf.com/content/CVPR2025/html/Ke_Video_Depth_without_Video_Models_CVPR_2025_paper.html)
- [CVPR 2025: EntitySAM — video entity segmentation and tracking](https://openaccess.thecvf.com/content/CVPR2025/html/Ye_EntitySAM_Segment_Everything_in_Video_CVPR_2025_paper.html)
- [CVPR 2025: Tracktention — point tracking for temporal alignment](https://openaccess.thecvf.com/content/CVPR2025/html/Lai_Tracktention_Leveraging_Point_Tracking_to_Attend_Videos_Faster_and_Better_CVPR_2025_paper.html)
- [ICCV 2025: Spatially-Varying Autofocus](https://openaccess.thecvf.com/content/ICCV2025/html/Qin_Spatially-Varying_Autofocus_ICCV_2025_paper.html)
