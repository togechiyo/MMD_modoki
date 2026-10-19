# 未修正バグの再現確認 2026-10-19

後続作業: 再現した8件のうち7件のmain修正を[修正・検証メモ](./feedback-reproduced-bug-fixes-2026-10-19.md)へ記録した。本書の数値・集計は修正前の再現確認時点の記録として保持する。

## 対象と集計

[フィードバック台帳](./v0.2-feedback.md)の`bug`分類で、`collecting` / `investigating` / `fix planned`だった36件を棚卸しした。関連修正後の`needs retest` 15件と、不具合未確定の`investigation`分類8件は今回の36件へ含めない。

| 今回の結果 | 件数 | 意味 |
| --- | --- | --- |
| 再現 | 8 | 一部症状・条件付きの再現を含む。元報告全体の原因確定ではない |
| 限定条件で未再現 | 8 | 試したfixture・操作では報告差を確認できなかった。未確認の操作・描画経路は残る |
| 未判定 | 20 | 一般経路の対照のみ、または元素材・旧project・環境・長尺条件が不足し未試行 |

製品コードの修正は行っていない。再現した8件の状態を`investigating`へ変更し、他は既存状態を維持する。未再現を`fixed`へ変更しない。未修正bugの合計36件は変わらない。

## 確認環境と方法

- WindowsのローカルElectron / WebGPU、標準MMD材質。描画系はClassic / FrameGraphを分離。検証時のHEADは`5120fbd`。既存のSSAO・輪郭・PBR等の作業差分を保持したworktreeを実行しており、未変更の同commit単独・配布binaryとのA/Bではない。
- GPUを使えるローカル権限で1 workerの直列実行。sandbox内の起動失敗を製品の判定へ使用していない。
- 自作のtofu / body-source / expression-test PMX、simple-triangle X、生成したcamera / bone / morph motion、2×2 BMPのみ使用。第三者・ユーザー所有assetを探索・読込していない。
- fixture投入とstate観測には既存E2E hook、編集・表示・コピー・出力はGUIを使用。Classic GlowはFrameGraph用追加menuが無効なため、保存projectの既存`glowEnabled`を復元して確認する。
- generator、cascade、全体bias、影距離は変更していない。影の比較fixtureではモデルをY=4へ上げ、光源方向を`(-0.6,-1,0.4)`へ固定した。
- 成果物はignoredな`artifacts/e2e/feedback-reproduction-2026-10-19/`へ保存。JSONの`completed`は観測処理の完了であり、不具合が解消したという合格ではない。

再現collectorは[feedback-bug-reproduction.spec.mjs](../test/e2e/feedback-bug-reproduction.spec.mjs)、生成物の仕様は[fixture README](../test/fixtures/feedback-reproduction/README.md)。viewport画像の比較は選択ギズモを外し、screenshotの一時styleで通知・空scene案内を除外した高さ22〜85%を対象とし、RGB最大差8超の画素を数えた。PNGの等倍画素とCSS表示の再サンプリングは区別する。

## 再現した8件

| ID | 再現した最小条件・証拠 | 残る範囲 |
| --- | --- | --- |
| V022-065 | 自作PMXの外部Toon BMPを同一pathで赤から青へ上書き。空projectへ切替後に同じPMXを再読込してもGPU textureは`(255,0,0,255)`のまま。新しいElectron processでは`(0,0,255,255)`になる | BMP Toonでの再現。元macOSのdiffuse texture、model削除のみ、別window等は未確認。resource数増加をmemory leakと断定しない |
| V022-090 | tofu表示中のFrameGraph / 空post stackで、AA OFFでは透明チェック背景、AA ONでは白一色になる。Classicではチェックを保持 | 背景media併用・他effect・透過PNGは未確認。空sceneだけでは再現せず、modelを入れた対照で確認した |
| V022-091 | source Ry=`+π`、0 / 180fの生成cameraで、既存180fの値を変えずEnter・登録するとsourceが`-π`へ変わる。UIも`-180.0`から`180.0`へ変化 | 部分再現。毎回交互になる現象と直前0fの書換えは未再現。回転poseの同値と、キー間の回転補間は区別する |
| V022-092 | cameraのsource Ry=450度が再登録で90度、X=`1234.567871`が`1234.569946`へ変化。他channelを触らなくても表示精度で丸められる。X accessoryへ`1234.56789`をEnterするとUI / runtimeとも100、入力rangeは±100 | camera / X位置で再現。model全項目、ドラッグ後、Undo / 保存復元までの網羅は未実施 |
| V022-100 | camera modeでcamera名を含むmorph-only VMDをdropすると`This VMD has no camera track`が通知される。その後fallbackしてmorphは読み込まれる。model modeの通常名では通知なし | 条件付き再現。旧VMDの形式互換問題や最終的な読込失敗とは確認していない |
| V022-107 | source D=+12が再登録で-12へ変わる。D=0は0→-0.15→約-0.2へ変わり、UI表示も0.1→0.2となる | 部分再現。通常のsource D=-30の微小なfloat差を、報告の大きな距離変化とは数えない。Zとの因果関係は未確定 |
| V022-118 | 一定poseのcamera trackをD=-30 / 0 / +12で比較。-30ではseek / play一致。+12ではseek位置`(5.58,-0.38,-7.83)`が再生中・停止直後`(-3.58,4.38,13.83)`へ反転し、再seekで戻る。0では停止後のRy表示が22.9→179.6度、seekで戻る | 元motion・外部親・動画出力は未確認。ここでのDはsource値であり、報告者のUI表記の符号へそのまま読み替えない |
| V022-121 | 同じtofu・床・光源で斜め視点には影ON/OFF差がある一方、真上`(0,25,0)`からは床の投影影が見えず、影ON/OFFの比較でも差がなくなる。Classic / FrameGraphで確認 | 標準床・現在のCSM条件。元stage、通常shadow、PNG / WebM、原因は未確認。V022-120の影距離と統合しない |

cameraのJSONは各操作前後のsource animation、UI値、viewport位置・注視点を保持する。補間は非線形のbyte列を与え、画面表示だけで保持を判定していない。

影ON/OFFの差分はClassic / FrameGraphとも斜め視点21,979画素、真上0画素だった。非表示modelの追加shadow OFF、Mirrorのmodel除去対照、Luminous無効化対照は、それぞれ残留を示す差分画素0。ただし完全なbyte一致ではなく、上記のROI・閾値での比較である。

## 限定条件では未再現だった8件

| ID | 今回の確認結果 | 未確認 |
| --- | --- | --- |
| V022-055 | en / zh-Hant / zh-Hans / koへGUIで切替し、空post stackのEffect panelと上位UIを観測。確認したpanel文言はlocaleへ追従 | 材質・全popup・翻訳精度・全label overflowの監査は未実施。項目全体の解消確認ではない |
| V022-088 | FrameGraphの等倍PNGはAA OFFで2色、ONで輪郭中間画素504を確認。今回の斜め輪郭でON/OFFの逆転は確認できず | viewportのCSS再サンプリング・元scene。Classicの等倍PNGはON/OFFで同じ中間画素数となったが、報告の「逆転」とは別の観察として残す |
| V022-089 | asymmetricなセンター / 左右足IK計6キーをGUIで反転。上書きと全削除後のsource位置・回転・補間が一致。15fの描画用ボーン位置も比較 | 元motion、IK ON/OFFキーの組合せ、人体の足先の見た目は未確認 |
| V022-093 | 非線形のcamera補間を持つ既存キーへEnter・登録を3回行ってもposition / rotation / distance / FoVの補間byte列を保持 | bone、他の登録scope、新規キー、元projectでの断続条件は未確認 |
| V022-103 | model表示OFFでMirror render listが空になる。hidden modelを保持したsceneとmodelなしsceneの対象ROIに反射残留差なし | 表示キー、複数model、元project、PNG / WebMの反射は未確認 |
| V022-104 | 自作tofuへAutoluminousを適用。表示OFF後とGlow無効後の対象ROIに残留発光差なし。FrameGraphのLuminousはON状態を確認 | RC、表示キー、複数model、保存復元、PNG / WebM、元設定は未確認。Classicは保存値からGlowを復元する対照 |
| V022-106 | 同一PMX2体の間で6キーをGUIコピー・貼付後、対象2体目からVMD 740 bytes / BVMD 416 bytesの出力成功。両header正常 | motion全体コピー、片方削除、保存再読込、元motion・error本文は未確認 |
| V022-119 | model表示OFFで子meshもvisible=false / enabled=falseとなり、影チェックを追加でOFFにしても対象ROIに差なし。caster listに2mesh残っていても、今回の表示toggleでは残留影なし | 表示キー、contact shadow併用、最後のmodel削除、PNG / WebMは別条件。削除後samplingの既知残件を解消扱いにしない |

## 未判定の20件

一般経路を観測した7件も、元の発生条件の試験とは区別する。

| ID | 今回の対照・不足している条件 |
| --- | --- |
| V022-026 | tofu / body-source / expression-testの読込・GUI操作は進行した。Windows 11 Enterprise、GPU / driver、停止操作・logが不足 |
| V022-040 | 既存Issue #24の平行移動・接近30条件を再実行。原点・X=40・Z=40等の既修正条件では表示。camera cut中や人体の部位別消失を起こすmotion・frameが必要 |
| V022-041 | 一般PNG / WebMとmodel描画の対照を確認しただけ。部位消失するcamera / model / frame / effect条件が必要。V022-118の再現を原因一致にしない |
| V022-061 | 自作PMXは読込・操作可能。元環境、v0.2.0 / v0.2.1の同一条件A/B、crash logが必要。今回の成功でP0を引き下げない |
| V022-064 | simple-triangle Xのproject復元・PNG / WebM画素一致E2Eが成功。報告X・透過・可視設定・出力操作が必要 |
| V022-066 | 内蔵groundの斜め視点で影を確認。影が出ないstage自身の床geometry / material・backendが必要 |
| V022-115 | 一般XのPNG / WebMは成功。元skydomeの形式・材質・PNG経路が不明で、skydome欠落は未判定 |

次の13件は今回runtimeでの再現試行を行っていない。

| ID | 未試行の理由・次に必要なもの |
| --- | --- |
| V022-004 | macOSの配置先・権限差。元環境で同じmodelを移した前後のresolved path / file read結果 |
| V022-014 | 元材質・鏡面の比較画像、Standard / PBR / sphere map / lightの条件 |
| V022-022 | 元Toonと期待する明暗の比較、lighting / sampler条件 |
| V022-024 | 瞳欠落するmodelの利用許可済み最小asset、texture形式・alpha・材質順 |
| V022-025 | 透ける材質の利用許可済み最小asset、両面・alpha・描画順 |
| V022-042 | 黒化するmaterial morphの最小offset / operationと材質値。別の表情fixtureの読込成功では判定しない |
| V022-056 | 実在する旧projectとshadow保存値・元backend。現在schemaのfixtureだけでは同じmigrationを構成できない |
| V022-057 | 同じ旧project、髪等の物理挙動・UIで復帰不能になる手順 |
| V022-058 | 暗転を保持したprojectまたは発生前後のeffect / morph / log |
| V022-063 | 最初の異常から別projectへ移る操作、window / process / 再起動の境界とlog |
| V022-072 | 元Luminous設定・解像度・codec・6000frame超の素材と16 GB Macでのprocess別測定。短い出力から長尺のmemory leak有無を推定しない |
| V022-094 | 透明部分が抜けないstageの利用許可済み最小texture / material / geometry |
| V022-114 | 分割開始frame、開始時物理snapshot、連続出力の対照、破綻する剛体構成。単純な剛体fixtureだけでskirt破綻を非再現扱いにしない |

## 実行と検証

```powershell
$env:MMD_MODOKI_FEEDBACK_REPRO='1'
npm.cmd run test:e2e -- feedback-bug-reproduction.spec.mjs
npm.cmd run test:e2e -- export-fixture-fidelity.spec.mjs -g 'X fixture'
$env:MMD_MODOKI_ISSUE24_REPRO='1'
npm.cmd run test:e2e -- issue-24-reproduction.spec.mjs -g 'camera translation'
```

最終のまとめ実行は**12 passed（4.7分）**。新規collector 10件と、既存X復元・PNG/WebM画素比較1件、Issue #24の移動・接近30条件を採取する1件を確認した。collectorのpage error / WebGPU validationはすべて0件。生成cameraの全channelの補間byte列保持、反転2手順のsource値と15f描画用位置の一致、新規processでの青texture反映も採取JSONで再照合した。

`npm.cmd run lint`はerror / warningとも0。新規MJS3fileの`node --check`、台帳122行中の状態変更が上記8件だけであること、未修正36件と本メモのIDが重複・不足なく一致すること、追加リンク、`git diff --check`も確認した。今回の変更はMarkdownとtest用MJSだけのため、unit / typecheck / 単独smokeは再実行していない。

初回のcollectorでは再生ボタンのlocator、E2E固定の出力先、材質対象選択、Classicで無効なFrameGraph追加menuを誤って使う試験側の失敗があった。比較画像へ通知の影・空scene案内が混ざる問題も除外後に再採取した。これらは製品バグの再現件数へ含めず、最終12条件の実行には残っていない。

次に修正へ進める候補は、条件を縮小できたcameraのsource値保持・seek / play差、同一path texture更新、FrameGraphのAA背景合成。真上の影は描画経路を独立して調査し、全体の影設定を個別症状の回避として変更しない。
