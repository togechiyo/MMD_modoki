# AutoLuminous 4.2 原典コード調査と Luminous / RC の互換差分

調査日: 2026-10-31。比較したアプリ: `69296cb`。今回は調査・文書化のみで、描画実装は変更していない。

後続実装: 所有者の「まず2D」の指定により、[2Dの材質発光条件・材質モーフ消灯を対応](./luminous-2d-material-conditions-2026-10-31.md)。以下の現行差分は調査時点の記録であり、RC・点滅式・追加UVは引き続き未対応。

## 1. 結論

AutoLuminous の対応資産を拾うには、**材質値による発光、名前付き制御モーフ、追加UVによる頂点発光を別々に読み、最後に組み合わせる**必要がある。通常画面の明るさを抽出するだけでは再現できない。

現行アプリとの大きな差は次のとおり。

- FrameGraph の Luminous / Luminous RC は、プリセット・名前による明示的な発光指定を優先し、本家の材質値だけの発光指定を拾わない。
- 本家の `LightBlink` / `LightBS` は値が**周期**を表す。現行はほぼ固定周期の波形に対する**点滅の混合率**として読むため、同じモーフ値で動きが違う。
- 本家の追加UV発光は、材質の shininess が低くても有効。現行は追加UV2/3の発光データを読まず、追加UVモーフも発光へ渡していない。
- 材質モーフで shininess を下げる消灯と、名前付き `LightOff` は別経路。現在値と初期値の最大値を使う現行判定は、前者の消灯を妨げる。
- 本家のREADMEと実コードには食い違いがある。負の頂点点滅周期やシーケンス識別子は、原典実機で確認してから互換方針を決める。

優先案は、発光条件と時間評価を共通の入力評価器へまとめ、2DとRCで共有すること。画面上のにじみ・白い芯・色保持と、3D空間への照り返しは別の処理として維持する。既存プロジェクトの見た目を突然置換することや、本家の不整合まで無条件に再現することは、この調査では提案しない。

## 2. 調査対象・証拠の範囲

所有者が指定した `local-references/autoluminous-original/AutoLuminous4/` の借用パッケージを読んだ。以下、原典への行番号はこのディレクトリを基準にする。ファイルはGit管理外のままとし、原典ソース、DLL、モデル、画像を本ドキュメントへ同梱しない。

| 対象 | 確認内容 |
| --- | --- |
| `Readme.txt` / `Readme上級編.txt` | 使い方、制御モーフ、追加UV、シーケンス、利用条件 |
| `AL_Object.fxsub` | 材質・頂点発光源の抽出。Ver.4.2 |
| `AutoLuminous.fx` / `AutoLuminousBasic.fx` | 全体制御、画面抽出、ぼかし、合成 |
| `Options/AL_Texture.fxsub` / `AL_BlackMask.fxsub` | 追加の抽出・遮蔽経路 |
| `AutoLuminous.xml`、Optionsの設定資料・プラグイン付属ソース | ホストの入力対応と補助ツールの仕様 |
| 作者同梱 `Samples/Sample3.pmx` / `Sample4.pmx` / `Sample6.pmx` | PMXを静的解析し、ダミーモーフ、材質モーフ、追加UVの実データを確認 |
| 現行アプリと installed `babylon-mmd 1.2.0` | 発光評価、モーフ取得、ローダー、2D / RCへの入力経路 |

Readmeとfx/fxsubはCP932、XMLと追加UV設定スクリプトはUTF-8として読んだ。XMLのVersionは4.0、Dayは2013-01-25だが、Readme / 本体コードは4.2。**XMLだけをパッケージの版の根拠にしない。** 原典の配布元URL・取得日は、このローカル配置だけからは確定できなかった。作者表記はそぼろ。利用条件は `Readme.txt:355–360` にあり、商用利用・改変・再配布を含む利用を許可する記載を確認した。

比較対象を固定するSHA-256:

| ファイル | SHA-256 |
| --- | --- |
| `AL_Object.fxsub` | `eae6bc3feec915f831f0bda8671172e8508cce65bd5c7b00b00809e79ea57c95` |
| `AutoLuminous.fx` | `d402a3340567eb94c35e05563157e67ff15f4dc0c0c1597d5a38989536d9143c` |
| `AutoLuminousBasic.fx` | `144e1b31d1ce83fdb8904ea3b7c4a74665eceb0cbefa4ed2115fb4f69ac4cfee` |
| `Options/AL_Texture.fxsub` | `45a0c494b2ce5754a36c468485061c3f857181935c6da35b8943e4f0a5690df6` |
| `Readme.txt` | `760bcaa2dc944418a330df6ddf2d4af835ae8453a0ea14249c6b3e09370d639d` |

以下はソースと同梱資料からの読解結果であり、MMD / MME / MMMで原典を実行して画素一致を確認した結果ではない。ホストが供給するsemantic値、既定blend状態、未定義入力の扱いは、その制約を個別に明記する。

## 3. 発光源と制御入力の構造

```text
モデル自身の名前付きモーフ ── 倍率・点滅・時計
材質の評価済み値 ───────── 材質発光色・shininess・alpha
頂点の追加UV1/2/3 ──────── 頂点色・個別点滅・texture指定
diffuse / sphere texture ── 模様・発光シーケンス
                  ↓ AL_Object.fxsub
             AL_EmitterRT（発光源の画面）
                  ↓
KeyColor / HDR明部 / LightSampling等を条件付きで加える
                  ↓
         多段blur・glare・残光・最終合成
```

本家は `AL_EmitterRT` へモデルを別描画する。一方、Full版には通常画面のHDR明部抽出もある。この**別々の入口**を一括して「画面の明るい所を光らせる」と説明すると、材質指定やモーフの実装を誤る。

原典 `AL_Object.fxsub` は、材質名に `AutoLuminous` / `AL` / `Light` が含まれるかを調べない。名前で読むのは後述の制御モーフ。現行アプリの材質名判定は、手軽に発光指定するための独自拡張である。

## 4. 材質発光の条件・色・alpha

### 4.1 判定と倍率

`AL_Object.fxsub:53–65,99–101,367–379,453` の条件を整理すると、次のようになる。

| 入力・計算 | 原典の意味 |
| --- | --- |
| shininess | `SpecularPower > 100`。100ちょうどは材質発光しない |
| specular色 | RGBの長さが `0.01` 未満。各成分を個別に比較する判定ではない |
| shininessの上限 | 上限200の条件はコメントアウト。実際の上限判定はない |
| 材質由来RGB | 条件成立時 `0.5 × DIFFUSE.rgb + 0.25 × EMISSIVE.rgb`、不成立時は黒 |
| 基本倍率 `G0` | 材質発光時 `(shininess − 100) / 7`、それ以外は1 |
| モーフ込み倍率 `G1` | `G0 × (1 + 2×LightUp) × 400^LightUpE × (1 − LightOff)` |
| 最終倍率 | `use_toon` が真なら `G1`、偽なら `G0`。RGBだけに掛ける |

Readmeはshininess「100以上」、推奨110と説明するが、実コードは厳密な `> 100`。105ならG0≈0.714、107なら1、110なら≈1.429、130なら≈4.286となる。発光量の単位はこの抽出・後段合成に依存するので、アプリのスライダー値へ無変換で当てはめない。

`MaterialAmbient : AMBIENT` は宣言されているが抽出に使われない。Readmeの「ディフューズとアンビエントから決定」と、コードの `MaterialEmmisive : EMISSIVE` のホスト側対応は別途確認が必要。Babylonの `ambientColor` / `emissiveColor` と語だけで同一視しない。法線とライト方向から通常の拡散照明を算出して抽出する処理でもない。

追加UV由来RGBは材質由来RGBへ加算される。その後のG0/G1は**両方へ掛かる**。追加UV発光はshininess条件を必要としないが、両経路が有効ならshininess倍率も受ける。

### 4.2 材質モーフとalpha

| ホスト | shininess入力 | alpha入力 |
| --- | --- | --- |
| MMD / MME側の分岐 | `SpcColor.a` | `EgColor.a` |
| `MIKUMIKUMOVING` 分岐 | `SPECULARPOWER` semantic | `MaterialDiffuse.a` |

`Readme.txt:243–246,292–294,317–318` は、MMEでは材質モーフ後の色の取得に制約があり、shininessとalphaは対応、MMMでは材質モーフが使えると説明する。したがって、**名前付きモーフの読取りと、材質モーフで変わった材質値の読取りを区別する**。

消灯・点滅・追加UV2.w・G0/G1はRGBを変える。出力alphaはこれらの発光量と別に保持され、通常textureを使う分岐ではtexture alphaと掛かる。後段での消費もFull / Basicで異なるため、RGBにalphaを掛ける場所を想像で増やさない（§8）。

## 5. 名前付きモーフと点滅

### 5.1 何を、どのモデルから読むか

`AL_Object.fxsub:79–90` は `CONTROLOBJECT` の `name="(self)"`、`item=モーフ名` で値を取得する。独自の `MORPH` semanticを宣言しているわけではない。発光元モデルの値であり、現在選択中のモデルやシーン全モデルの合計ではない。

| 正式なitem名 | 役割 | 標準の0〜1範囲での意味 |
| --- | --- | --- |
| `LightUp` | 線形増光 | 0で1倍、1で3倍 |
| `LightUpE` | 指数増光 | 0で1倍、0.5で20倍、1で400倍 |
| `LightOff` | 消灯 | 0で維持、1で消灯 |
| `LightBlink` | 滑らかな点滅の周期 | 0以下なら無効。正なら `10×値` 秒 |
| `LightBS` | 矩形点滅の周期 | 0以下なら無効。正なら `10×値` 秒 |
| `LightDuty` | 波形の時間配分 | 0以下は0.5。正なら値をそのまま使用 |
| `LightMin` | 点滅中の最低輝度 | 点滅結果を `b×(1−値)+値` へ変換 |
| `LClockUp` | 追加UV / sequenceを高速化 | 1で周期を1/6にする（Down=0） |
| `LClockDown` | 追加UV / sequenceを低速化 | 1で周期を6倍にする（Up=0） |

原典のitem名は `LightMin` であり、内部変数名 `BlinkMin` をモーフ名と取り違えない。`BMin`、`ClockUp`、`ClockDown` はこのコードのitem名ではない。`LightBlinkS` はReadme更新履歴338行にある旧名で、4.2は `LightBS` のみを宣言する。別名対応を追加する場合はアプリ拡張として扱う。

作者同梱Sample3では上表の最初の7個、Sample6では `LClockUp/Down` が、**頂点0への変位が全て0の頂点モーフ**として格納されていた。形状を動かさず名前とweightを供給するダミーモーフである。名前付き制御を「材質モーフ型だけ」に限定してはいけない。

### 5.2 モデル点滅の式

`t` は原典TIME、`d = LightDuty > 0 ? LightDuty : 0.5` とする。通常の正周期について、以下はソースを整理した数式である。

```text
F(t, P, d) = (1 − cos(2π × saturate(frac(t/P) / (2d)))) / 2
Q(t, P, d) = frac(t/P) < d なら1、それ以外は0

b = (LightBlink > 0 ? F(t, 10×LightBlink, d) : 1)
  × (LightBS    > 0 ? Q(t, 10×LightBS,    d) : 1)
bModel = b × (1 − LightMin) + LightMin
```

根拠: `AL_Object.fxsub:92–95`。両モーフを有効にすると**別周期の波形を掛けた後で**LightMinを適用する。LightMinを各波形へ別々に適用してから掛けるのとは違う。両波形が0の場合、LightMin=0.2なら本家の結果は0.2であり、0.04にはならない。

Duty=0.5ならFは開始時0、半周期で1、一周期で0へ戻る。Duty<0.5では短い点灯区間と消灯区間になる。Duty>0.5では一周期内にcosの全区間を走り切らないため、周期境界で値が飛ぶ場合がある。一般的な「明るさ一定のON時間比」と同じ説明をしない。

例: `LightBlink=0.1` は1秒周期、`0.5`は5秒周期、`1`は10秒周期。値を小さくしたら弱く点滅する、という仕様ではない。`LightBS=0.2, LightDuty=0.25` なら2秒中の最初の0.5秒がONになる。

### 5.3 時計・クランプ・適用範囲

`ClockShift = (1 + 5×LClockDown) / (1 + 5×LClockUp)`（97行）は、追加UVの周期・位相とsphere sequence周期に使われる。**モデルの `LightBlink/LightBS` の式には入らない。** 全体アクセサリRzの点滅とも独立している。

原典は上表の値すべてを一律0〜1にクランプせず、G1にも32倍上限はない。範囲外のモーフ値や不正な周期には安全性の問題があるため、アプリ側で有限値チェック等を設けるなら「本家と同じ」とは区別する。`use_toon` によるG1のゲートはホストの入力条件も含むので、「全アクセサリに必ずLightOffが効く」とまではこの静的読解から断言しない。

## 6. 追加UVによる頂点発光

### 6.1 チャンネル対応

`AL_Object.fxsub:314–324,351–392` の追加UVは次の配置。以下のUV1は**追加UV1**であり、通常のtexture UVではない。

| チャンネル | 意味 |
| --- | --- |
| UV1.x / y | AL識別: `.199 < x < .201` かつ `.699 < y < .701`。標準値0.2 / 0.7 |
| UV1.z | 頂点点滅の周期指定。正は滑らかな波、負は矩形、0は個別点滅なし |
| UV1.wの1の桁 | 0: texture乗算、1: texture無視、2: textureの明部抽出 |
| UV1.wの10の桁 | 0: RGB指定、1: HSV指定 |
| UV2.xyz | 発光色RGB、またはHSV |
| UV2.w | 発光RGBの強度。透明度ではない |
| UV3.x | texture RGBから減算する値 |
| UV3.y | 頂点点滅の位相（時間へ加算） |
| UV3.z | 発光源描画用の法線方向への押し出し |
| UV3.w / UV4 | 当該抽出コードでは不使用 |

フラグは**十進数の各桁**で、bit maskではない。W=12ならHSV＋texture明部抽出。100/1000の桁も復号するが、このコードで使用しない。規定外の桁を独自bit列として解釈しない。

UV2の色は、HSV指定ならRGBへ変換し、UV2.wを掛け、材質発光色へ加算する。Hは `frac` で折り返すが、S/Vの一律クランプはない。10の桁が0/1以外だと変換前後のlerpが外挿になるため、規定値の範囲と区別する。

Readme上級編105行は同じ面の各頂点でフラグを揃えるよう指示する。色・モードは頂点処理後にピクセルへ補間される。CPUで三角形を代表色一つに潰すだけでは、色のグラデーションや境界を再現できない。

### 6.2 頂点の点滅とモデル点滅の関係

`Tv = UV1.z×ClockShift`、`Ph = UV3.y×ClockShift` とすると、正のTvは `F(t+Ph,Tv,d)`。負のTvは、実コードでは `Q(t+Ph,−Tv/π×180,d)` を使う。LightMinを適用後、頂点RGBへ掛ける。

AL識別が成立しUV1.z≠0なら、モデルのLightBlink/LightBSの波形は掛からず、頂点点滅が優先される。z=0ならモデル点滅を使う。LightUp/LightUpE/LightOffの最終倍率は別なので、個別点滅中でもゲート条件を満たすモデルのLightOffで消灯できる。

留意点:

- Readme上級編99–101行は正負とも周期を秒として説明するが、負のコードだけ度換算がある。UV1.z=−1、ClockShift=1ならコード上の周期は約57.2958秒。Setter付属ソースも符号を反転するだけでこの換算を補償しない。原典実機での確認事項とする。
- 386行の「z≠0ならモデル点滅を掛けない」条件にはAL識別が入っていない。無関係な追加UV1.zでも影響する可能性がある。これも互換の正常仕様とはまだ決めない。
- 位相は正周期で `t+Ph` へ加算されるため正の値で進む。周期と位相の両方にClockShiftが掛かる。
- 法線押し出しは発光用の位置変更である。これを通常モデルやRCの遮蔽形状まで移動する指示として扱わない。

### 6.3 textureの選び方

`AL_Object.fxsub:271–276,432–447` は、まず `T.rgb = saturate(texture.rgb − UV3.x)` を求める。

| textureモード | RGBへの作用 | alphaへの作用 |
| --- | --- | --- |
| 0 | 発光色 × T.rgb | 材質alpha × texture alpha |
| 1 | 発光色のまま | 材質alphaのまま。texture alphaも無視 |
| 2 | 発光色 × T.rgb × h(T.rgb) | 材質alpha × texture alpha |

`h(c) = 0.2 × saturate(3 × (length(c) − 0.9))`。これは知覚輝度の加重和ではなく、RGBベクトル長である。均一グレーは約0.5196より明るいと抽出され、白ではh=0.2、純赤ではh=0.06。texture自体がない場合、この分岐は実行しない。

当該抽出コードに明示的なsRGB→linear変換は見当たらない。互換色を調べる際は、単に同じRGB式を書くのに加え、サンプラとホストの色空間を固定して比較する必要がある。

### 6.4 実際の追加UVモーフ

作者Sample4には `色相` という追加UV2モーフ（PMX type 5）があり、対象4頂点のUV2.xへ−1を加算する。Light系の名前ではなくても、追加UVの評価後の値を読むことで色が変わる。Sample4には別に、材質index 3のshininessへ+25する加算材質モーフもあり、base105をweight1で130にする。

このため「Lightで始まるモーフだけ見ればよい」「UV2の初期値だけ保存すればよい」は不十分。必要なのは、識別子・色・周期・位相・強度を含む**モーフ適用後の追加UV**である。

## 7. sphere textureの発光シーケンス

`AL_Object.fxsub:205–222,328–332,412–427` は、sphere textureを通常の反射模様とは別の、時間制御データとして読む。

| 位置 | 解釈 |
| --- | --- |
| 右下 `(1,1)` | sequence識別子と補間モード |
| 左下 `(0,1)` | 周期。RGBを `255×60×R + 255×G + 2.55×B` 秒に復号 |
| 上端の左1/4 | 時間で走査するRGB列 |

周期へClockShiftを掛け、`phase = frac(t / period)` として上端の `(phase×0.25,0)` を読む。そのRGBを、既存の材質・頂点発光RGBへ乗算する。alphaは変えず、**それだけで非発光材質を発光させる入口ではない**。4.2では頂点位相をsequence時間へ加える項が外されている（Readme.txt:277–279、コード421行）。

POINT / LINEARの2サンプラを用意し、どちらもCLAMP、mipなし。Readme上級編166–170行は識別色 `(255,127,0)` をPOINT、`(255,127,255)` をLINEARと説明する。しかし実際の識別条件は `r>.99 && abs(g−.5)<.02 && (b<.01 || g>.99)`。g≈.5とg>.99が両立しないので、**記載どおりのLINEAR識別色は、この式では認識されない**。誤記に見えるが、修正版の公式配布や原典実行を確認したわけではない。

作者Sample6は追加UV数0、shininess150、sphere texture参照ありで、LClockUp/Downのダミーモーフを持つ。この例からも、sequenceは追加UV発光がなくても使う機能と分かる。

RCへ導入する場合、識別子と周期を一般の発光画像と一緒に64×64へ縮小・色変換しない。制御データは元texelから読み、時刻ごとのRGBだけを発光評価へ渡す構成が適している。動画texture全体の毎frame readbackは必要ない。

## 8. エフェクト全体の制御と画面処理

### 8.1 AutoLuminous.x側の操作

`AutoLuminous.fx:298–355` と `Readme.txt:59–119` の全体制御は、モデルのLight系モーフと別の段階にある。

| 操作 | 作用 |
| --- | --- |
| Si / Z | 全体発光量。内部ではself scalar×0.1と `(1+Z/100)` を組み合わせる |
| Tr | blurの幅 |
| X | glareの方向数。1方向につき反対側にも伸びる |
| Y | 元画像の明るさ。係数 `(Y+100)/100` |
| Rx | glare角度 |
| Ry | glare長さ |
| Rz | 全体点滅の周期。正はcos、負は矩形、0は停止 |

世界行列のY/Zも読むためダミーボーン経由の操作を想定する。Rzは内部の角度値を度へ戻して周期秒として使う。正周期の波形は `0.6 + 0.4×cos(...)` で**0.2〜1**、負は50% dutyの0/1。モデルLightBlinkの波形は0〜1かつ開始時0なので、同じ「正弦点滅」でも一致しない。

原典TIME宣言は `SyncInEditMode=SYNC`、既定SYNCはfalse。編集停止中・シーク・動画出力のTIMEの供給法はMMEホスト側の実測が必要であり、これをアプリのwall clock利用の根拠にはしない。

### 8.2 Full版の抽出と合成順

根拠: `AutoLuminous.fx:135,180,194–220,703–736,746–775,863–933,1080–1143`。

1. モデルの `AL_EmitterRT` と、有効時のKeyColorの発光成分を加える。KeyColorの既定数は0。KeyColorの芯色は別のMRT出力から元画像へ描き戻すため、以下の点滅・scalingの対象外（721、972–976行）。
2. この部分へRzの全体点滅を掛ける。
3. 通常画面から各RGB成分の `max(scene×OverLight−0.98,0)` を取り、ToneCurveを通した明部、またはLightSampling由来の外部明部を加える。
4. 全体scalingを掛け、抽出RTのalphaを1へ上書きする。
5. 5段階の解像度で横・縦のblur。比率は1、1/2、1/4、1/8、1/16で、HALF_DRAW時はさらに半分。各方向13tap、mip/scaleは0、2、4、5、7。
6. 5段を1、1、1、1、0.8の重みで合成。glare有効時はこの合成を0.7倍にしてglareを加える。
7. maskと任意の残光を処理し、元画像と合成。通常はglowをToneCurve処理してから、元画像RGBにOverLightを掛けてsaturateした色を足す。続いてOverExposureによる他チャンネルへの白とびを処理する。ToneCurve.x有効時はglow単独のToneCurveを省き、この合成・白とびの後へToneCurveを掛ける（919–927行）。

HDR_RENDERは既定1。明部抽出の実閾値は1ではなく0.98で、知覚輝度ではなく成分ごとの処理である。**Rz点滅は、後から加えるHDR明部 / LightSampling部分には掛からない。** Si/Zはこれらの加算後の発光全体に効くが、元画像へ描き戻すKeyColorの芯色とは別。モデルをLightOffで消しても、通常描画のHDR明部が残ればFull版の光が完全には消えない場合がある。

残光AFTERGLOWは既定0で無効。非0の分岐では過去frameの5tap平均を `(1−1/N)` で減衰させ、現在glowとのmaxを取る。dt補正ではなくframe依存（863–880、909–911行）。Readme上級編の「0以上で有効」という説明とは区別する。

### 8.3 alpha・Basic・Optionsの違い

Full版のEmitter RTはRGBA16F、clear alpha1。抽出後はalphaを1へ上書きし、最終合成では元画像alphaとRGB長からalphaを作りRGBを割り戻す（929–931行）。一方、Basic版は最終RGBへEmitter alphaを掛ける。AL_Object側のDrawObjectにはblend/depth状態を網羅した指定がないので、**透過材質がEmitter RGBにどう描かれたかを含む画素互換は、原典実機の確認対象**である。

| 機能・ファイル | 原典コード上の内容 |
| --- | --- |
| `AutoLuminousBasic.fx` | AL_Objectによる発光源は共通。半解像度8bit、軽い9近傍抽出→各15tapのmax拡張X/Y→Gaussian X/Y、最後はOne/One加算。独自HDR/KeyColor/glare/ToneCurve/LightSamplingは持たない |
| BasicのInterval | 30fps基準のframe数。0は停止。正の点滅は0.2〜1で、強度だけでなくblur幅にも掛かる。FullのRzやLightBlinkと単位を混同しない |
| `Options/AL_Texture.fxsub` | Ver.3.15の別経路。textureありでは頂点側のRGBAをtexture RGBAで置き換え、h(texture.rgb)を掛ける。材質条件なしでも抽出するが、置換により材質色・追加UV色・頂点側の点滅・材質alphaは失われる。最後の発光倍率は残る |
| `Options/AL_BlackMask.fxsub` | RGBを黒にし、材質alpha×texture alphaを出す。非発光とモデル非表示は違う |
| `Options/full_saturate.fx` | 通常画面の色をsaturateし、加算sphere等によるHDR明部の発光を抑える |
| `Options/LightSampling.fx` | Trで抽出閾値、scalarで強度を操作してsharedな外部明部へ加算。AL材質コードとは別の画面抽出 |

Basicの根拠は63–83、123–139、157–175、229–355、361–430行。AL_Textureは17、372–381行、BlackMaskは50–53行、LightSamplingは32–45、134–145、170–199行。AL_Textureには本体4.2のLClock、sphere sequence、MMD alpha修正がないため、単に本体のdefineを変えたものとして扱わない。

### 8.4 モーフを作る補助ツール

`Options/AutoLuminousSetter.zip` を展開実行せず、zip内のテキストとソースを読んだ。

- **ALMorphMaker**: 付属ReadmeはVer.1.0のダミーモーフ追加ツールと説明する。生成コードのソースはなくDLLのみ。DLLの静的文字列には§5の9名が存在する。DLLを実行して生成結果を確認したわけではない。ゼロ変位の実例は作者同梱Sample3/6で別途確認した。
- **AutoLuminousSetter**: 頂点発光値の設定と、任意名の追加UV2モーフの生成。付属 `Form1.cs:502–509,646–655` はUV2のRGB/強度について、指定後と指定前の差分をモーフoffsetにする。Light系ダミーモーフとは別物。
- Setterの材質選択は頂点を選ぶ手段であり、共有頂点を材質別に別データとして保持する仕組みではない。付属Readme206–212行も共有頂点は後勝ちになると説明する。

## 9. 現行アプリとの差分

### 9.1 発光条件とモーフ式

正本: [material-shader-service.ts](../src/scene/material-shader-service.ts) の214–240、762–925、952–1088行。

| 項目 | 原典4.2 | 現行アプリ |
| --- | --- | --- |
| 通常材質の自動発光 | shininess>100、specular長<0.01 | FrameGraph / RCではheuristic無効。Classicの手動Glowのみ追加判定 |
| 材質名 / preset | 当該抽出コードでは判定なし | Luminous preset、AL系・Light系単語、日本語の発光/ライト等で明示指定 |
| 材質値の境界 | 現在のshininess、>100、specular長<0.01 | Classic heuristicはmax(現在,初期)、>=100、specular長<=0.02 |
| 材質の基本色 | `0.5 DIFFUSE + 0.25 EMISSIVE` | 通常はdiffuse+ambient。色保持指定時はemissive |
| 材質の倍率 | `(shininess−100)/7`、上限なし | 明示指定は1.25固定。Classic heuristicは0.5〜16に制限 |
| LightUp / UpE / Off | `(1+2Up)×400^UpE×(1−Off)` | 基本式は同じだが、入力0〜1・最終倍率0〜32に制限 |
| LightBlink / LightBS | 各値から別々の周期を作る | 共通30frame周期にClockShiftを掛け、各weightは波形と1の混合率 |
| LightDuty | 0以下なら0.5、他はそのまま | 小値なら0.5、他は0.05〜0.95に制限 |
| LightMin | 2波形の積に一度適用 | 各波形へ先に適用してから混合・乗算 |
| ClockUp/Down相当 | LClockUp/Down。追加UV / sequenceのみ | 同じLClock名だが、モデル点滅の共通周期へ適用 |
| 追加UV発光 / sequence | 対応 | 未対応 |

例として `LightBlink=1, LightDuty=0.5, Clock=0` では、本家は10秒周期、現行は30frame（MMD時間で1秒）周期。LightBlink=0.1は本家なら完全な0〜1点滅、現行なら波形を10%だけ混ぜるため最低値が約0.9となる。現行の「効きが弱い」は強度設定だけでなく、入力の意味の違いでも起こり得る。

名前判定は材質objectのname/idと同じ材質に対応する登録名/keyを読む。`highlight`を含む名前は除外する。モデルのファイル名を本家の発光条件として使ってはいない。ring particle等も独自の明示発光を使うので、互換導入時に既存の発光指定を消さない。

### 9.2 モーフの検索対象とgroup

現行はmeshまたは最上位親meshから所属モデルを見つけ、その `getMorphWeight(名前)` を呼ぶ。英語名を別名として検索せず、別モデルの同名モーフも参照しない。

installed `MmdMorphControllerBase` は、日本語名側の `name` をMapに登録し、同名が複数なら先頭の生 `_morphWeights` を返す。group経由では子の更新処理へ `親weight×ratio` を渡すが、子の生weightは書き換えない。このため**group経由のLightOff等は、現在の独自発光倍率取得に反映されない**。空groupそのものにLightOffという名前を付けて直接操作するケースとは異なる。

根拠: installed `node_modules/babylon-mmd/esm/Runtime/mmdMorphControllerBase.js:50–80,245–257,297–299`。これは現行取得経路の制約であって、MMEで同名・group・英語名をどう解決するかまで確認した結果ではない。groupの実効weightを互換用に扱う場合も、ホスト比較と循環・重複加算の規則を決める必要がある。

### 9.3 材質・UV・geometryの経路

| 入力 | 2D / Classic側 | Luminous RC側 |
| --- | --- | --- |
| diffuse / ambient材質モーフ | 現在値を読む | 現在値を読む |
| alpha材質モーフ | 読むが発光stateは最低0.05。alpha0によるmesh非表示は別経路 | 材質alpha<0.99のsurfaceは形状ごと除外 |
| shininess低下による消灯 | Classic heuristicの初期値下限に阻まれる。明示指定の倍率も固定 | 発光倍率へ使わない |
| textureの乗算 / 加算材質モーフ | 通常MMD描画にはあるが発光passへ係数を移送しない | 係数を移送しない |
| 通常UVモーフ | UV MorphTargetを描画shaderが処理する経路あり | 生UV配列を読むため未反映 |
| 追加UVモーフ | loaderは描画用MorphTargetを作らず、発光も未対応 | 同左 |
| 骨 / 頂点位置モーフ | mesh描画で追従 | CPUの位置変形cacheで追従。UV対応を意味しない |
| 動画 / canvas texture | 通常のGPU texture更新経路 | object単位の初回readback / 64×64縮小cacheのため同一textureの更新に追従しない |

根拠:

- [model-asset-service.ts](../src/assets/model-asset-service.ts):1251,1422 と [switchable-material-proxy.ts](../src/runtime/switchable-material-proxy.ts):21 — loader / 材質proxy。
- [mmd-manager.ts](../src/mmd-manager.ts):11782–11865 — FrameGraph maskへStandardMaterialを割り当て、color / alpha / textureを移送する。
- [luminous-radiance-scene.ts](../src/render/luminous-radiance-scene.ts):77–103 — opaque surface選択と生UV取得。
- [luminous-radiance-textures.ts](../src/render/luminous-radiance-textures.ts):33以降、[luminous-radiance-shaders.ts](../src/render/luminous-radiance-shaders.ts):39,97 — texture cache / 発光サンプル。
- installed `pmLoader.js:377–393,840–849,902–990` — 追加Vec4の保持と通常UV / 追加UVモーフの処理差。

**PMXの追加UV2（`additionalUv2`, Vec4）と、Babylonの第2texture座標（`UV2Kind`, Vec2）は別物**である。RCがUV2Kindを読むことを、ALの追加UV2発光へ対応済みという根拠にしてはいけない。アプリは `preserveSerializationData:true` なので、追加UV元データとモーフoffsetは保持されるが、使用経路を追加する必要がある。

材質モーフはruntimeの加算・乗算、材質index / −1の全材質適用を通じて通常材質へ反映される。名前付きダミーモーフを読むだけの処理とまとめない。RCのtexture alphaは発光RGBを減らすが、その穴をrayが通り抜ける実装ではない。なおGIの非identity textureモーフ時に反射sourceを外す扱いは、Luminous RCとは別の制約である。

もう一つの確認候補として、現行2D maskはLightOff等で倍率がほぼ0になるとstate=nullを返し、そのsubmeshを描かない（material service:914–916、manager:11782–11785）。原典は消灯時もRGB黒の形状を描く。**消灯と遮蔽物の消失が混ざる可能性**があるため、奥に別の発光体を置くfixtureで確認する。今回は描画再現までは行っていない。

### 9.4 時間、シーク、出力、cache

現行の点滅時間は `mmdRuntime.currentFrameTime`、なければ `currentFrame`。モデルごとに `(frame, luminousGlowMorphRevision)` をキーに倍率をcacheする。GUI手動モーフ変更はrevisionを進める。同じframeで外部経路が生weightだけ変える場合は無効化漏れの余地があるが、今回その不具合を実機再現したわけではない。

seekはruntimeを強制評価し、通常描画のmorph.update、PNGの準備待ち→capture描画、WebMの開始seek→固定刻みのcaptureへつながる。対応箇所は [mmd-manager.ts](../src/mmd-manager.ts):10256,12612,14914,15294,16601 と [webm-exporter.ts](../src/webm-exporter.ts):770,1036。互換式を追加しても、ブラウザの経過時間へ独立した時計を増やさず、同一frameから決定的に評価するのがよい。

RCの色は現在、2D maskのhalo / core・白い芯・clamp後の色比を基準に線形化し、RC独立の光量へ正規化する。2DのON/OFF・強度は混ぜない。この現行方針は [2026-10-25色合わせ](./luminous-radiance-2d-color-match-2026-10-25.md) に従う。旧RC導入時の「補正前の色」は現在の仕様ではない。

## 10. 挙動を寄せるための実装案

以下は調査からの提案であり、採用・実装済みではない。所有者の希望は「通常LuminousとLuminous RCをできるだけ本家の挙動へ寄せる」ことであり、MME全体の互換レイヤーを実装する依頼ではない。

### 段階1: 材質指定と名前付きモーフ

- 純粋な共通評価器で、モデル時間・モーフ値・評価済み材質を入力し、発光RGB / alpha / sourceの種類を返す。2DとRCで式を二重に持たない。
- 原典の材質判定を現在値で評価する。プリセットや材質名の明示発光は独立の指定として残し、既存保存値を壊さない移行方法を先に決める。
- LightBlink / BSを周期指定へ、LightMinを波形の積の後へ合わせる。LClockの適用対象を分離する。
- 非発光・消灯・モデル非表示・透過を別の状態にし、発光0でも遮蔽物は維持する。
- モデルのモーフ名→indexはload時に解決し、frameごとの文字列検索・全モデル走査を減らす。raw / group実効weightのどちらを取得したかを明示する。

最初の目視ポイントは、名前にALを含まない材質、LightOff、1秒/5秒点滅、LightMin付き同時点滅、2モデル別々の制御。2D単独 / RC単独 / 併用で同じ発光元が切り替わるところまでを一単位にする。

### 段階2: 追加UV発光・UVモーフ

- まず静的な追加UV1/2/3を読み、shininessの低い材質でも指定した頂点だけを発光させる。
- 発光に必要な追加UVモーフだけを評価し、色・強度・周期・位相・textureモードを更新する。モデルの全頂点全モーフを毎frame無条件に再展開しない。
- 2Dは頂点色→ピクセル補間、RCはhit位置の重心補間を含め、少なくとも三角形の頂点別の色/強度を維持する。三角形全体を一色にする近似を採るなら制限を明記する。
- RCの通常UVモーフも合わせ、2Dだけ模様が動く状態を解消する。発光属性 / UV変更はgeometry変形・BVH再構築と別revisionにする。
- 原典の押し出しやPOPUP_LIGHTは、発光の見せ方に関する機能として別評価する。通常meshやGI/天空遮蔽の共有geometryを動かさない。

### 段階3: sphere sequenceと必要な特殊入力

- 元textureから識別子・周期・色列を一度読み、共有時計で評価した色だけを更新する。追加UV位相からsequence時間を切り離す4.2の仕様に合わせる。
- LINEAR識別の不整合、負周期の度換算、未知の桁の扱いは、小さい原典比較fixtureで方針を決める。
- AL_Texture相当のtexture明部選択は通常のAL_Object経路と区別する。HDRの画面抽出、glare、残光は必要性を見て2D側で個別に検討する。

### 負荷と既存ルックを保つ境界

共通化するものは「何が、何色で、いつ、どの程度発光するか」の入力評価。Full版のblur・glare・画面HDR抽出・残光をRC光源へ戻すと、カメラ依存や光の再注入が起きるため共有しない。2Dの画面輝度やGIで明るくなった結果を、新しい物理的発光の条件にしない。

材質色・点滅・sequenceだけの変更で、前回最適化したCPU skinning、world頂点変換、BVH refitを再実行しない。RCの発光属性だけを更新し、消灯時も必要な遮蔽データは残す。静止・停止時のcache、同frame手動変更、capture直前の更新を同時に満たす。

上限32などの現在の演出・安全制限は、互換の入力式と表示側の露出・tonemapを分けて再検討する。原典400倍をそのまま8bitへclampして白飛びさせることは、望む互換性や「推しモデルを映えさせる」目的の代わりにならない。

## 11. 実装時の確認項目

自動テストは自作の配布可能fixtureを使う。原典同梱サンプルは今回の静的読解の証拠であり、CIへコピーしない。原典比較を追加するlocal testは未配置環境でskipする。

| 項目 | 最低限のケース |
| --- | --- |
| 材質の境界 | shininess99.9 / 100 / 100.1 / 110、specular長0.009 / 0.01 / 0.011 |
| 材質モーフ | 加算・乗算で110→100以下→110、alpha1→0→1、対象−1全材質 |
| 明示指定との共存 | preset / 名前による既存発光、名前のない本家形式、通常shiny材質の非発光 |
| モーフ名とscope | 2モデル同名、ゼロ変位頂点、空group、子group経由、同名重複、英語名のみ |
| 増光・消灯 | Up=0/1、UpE=0/0.5/1、Off=1、同時指定、範囲外値の安全な扱い |
| 点滅 | Blink=0/0.1/0.5/1、BS別周期、Duty=0/0.25/0.5/1、Min付き同時指定 |
| 時計 | モデル点滅と追加UV / sequenceのLClock適用差、停止、逆seek、再生速度変更 |
| 追加UV | 識別境界、RGB/HSV、UV2.w=0、W=0/1/2/10/12、材質光との加算 |
| 頂点モーフ | UV2色/強度、UV1周期、UV3位相、通常UVのアニメーション、groupからの変更 |
| texture | 有無、減色、RGB長による抽出、透明texel、mode1のalpha無視、texture係数モーフ |
| sequence | POINT識別、LINEAR不整合の方針、周期のRGB復号、LClock、追加UVなし、位相から独立 |
| 遮蔽 | 消灯した板の奥に別発光体、透明材質、2DとRCの遮蔽ポリシー差 |
| ライフサイクル | 保存/復元、Undo/Redo、同frame手動変更、backend往復、エフェクト個体別ON/OFF |
| 出力 | 停止中viewportと同frame PNG一致、30/60fps動画で同じ時刻の点滅一致 |
| 負荷 | 静止時の再計算なし、発光だけ変更時のgeometry再変形なし、複数RC consumerの共有維持 |

既存 [material-shader-service.test.ts](../src/scene/material-shader-service.test.ts):528–709はLightUp/Off/UpE、Blink/Min、材質名などを検証するが、現行の近似式のテストであり原典互換の証明ではない。[luminous-radiance-scene.test.ts](../src/render/luminous-radiance-scene.test.ts):185のUV変更も生配列の書換えで、PMX UVモーフの反映確認とは異なる。

## 12. 未確定事項と今回の確認範囲

- 原典のMMD / MME / MMM実行での画素比較は未実施。とくにEMISSIVEとMMD材質ambientの対応、use_toonの供給条件、blend/depthの既定状態、TIMEの編集時動作が残る。
- READMEとの不整合は「コードを読むとこうなる」と「作者が意図した仕様」を区別した。修正方針の採用や完全互換の達成は主張しない。
- 同名モーフ、group、英語名の原典ホストの解決法は未確認。現行アプリのgetter制約だけを確定事項として記録した。
- 原典の外部連携・特殊オプションは主要な入口を整理したが、MMEの割当UIや全パスのホスト状態を再実装する調査ではない。
- 作者同梱3つの小型PMXをinstalled `PmxReader` で静的parseした。ユーザーの別モデルは探索・読込していない。ZIP内のDLL、補助exe、設定スクリプトは実行していない。
- 文書のローカルリンク25件、insights検証（116 cards / 71 decisions）、`git diff --check`を確認した。runtime変更がないため、今回のためのlint / unit / Electron E2E / 性能測定は実行していない。

関連: [Luminous再設計](./luminous-frame-graph-redesign-plan-2026-06-13.md)、[2D / RC分離](./framegraph-luminous-rc-separation-2026-10-25.md)、[RC色合わせ](./luminous-radiance-2d-color-match-2026-10-25.md)、[3効果の最適化](./radiance-cascades-performance-2026-10-31.md)。
