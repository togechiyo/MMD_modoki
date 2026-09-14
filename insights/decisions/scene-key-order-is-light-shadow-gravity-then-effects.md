---
id: scene-key-order-is-light-shadow-gravity-then-effects
status: decision
scope: roadmap/scene-keys
confidence: high
last_verified: 2026-09-14
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-14
evidence:
  - conversation-explicit-instruction
  - conversation-owner-confirmation
  - roadmap-document
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
  - ../../docs/gamma-timeline-key-experiment-2026-09-14.md
  - ../../docs/effect-timeline-common-foundation-design-2026-09-14.md
  - ../../docs/scalar-effect-timeline-2026-09-14.md
  - ../../docs/resource-effect-timeline-2026-09-14.md
  - ../../docs/effect-shape-keyframes-and-lut-selection-2026-09-14.md
superseded_by: null
---

# Scene keyはLight、Shadow、Gravity、Effectの順で進める

## 適用条件

modoki-owned trackの実装順を決めるとき。

## 判断

最初はMMD照明に対応しやすい色RGBと方向XYZ。次に既存UIの影欄、gravityを扱い、effect keyは安定した少数値の実験へ限定する。影欄キーは影色、Toon影響度、影描画範囲、照度を対象にし、MMDのself-shadow modeは採用しない。gravityキーは下パネルに表示している加速度と方向XYZだけを対象にする。

2026-09-14、最初のeffect key実験はガンマだけとする指定を受けた。カメラモードのtimelineへ「ガンマ」行を追加し、ON / OFFとスライダー値を同じキーへ登録する。その他effectのキー化はこの指定から採用済みと推定しない。

同日のガンマ実装後、所有者は海を除く全エフェクトのキー化を希望し、「エフェクトごとのキーでいい」と登録単位を指定した。以後の拡張設計は1エフェクト単位を前提にする。ただし全パラメータの補間仕様、準備案、金曜までの全件実装完了は未確定であり、採用済みと推定しない。

共通基盤の設計後、所有者はガンマキーがまだ開発環境でのみ動作していることを理由に旧形式の互換対応を不要とし、新形式だけでよいと指定した。旧`gammaAnimation`の変換・派生出力・gamma専用キー入力aliasは作らない。既存project全体や静的ガンマ設定の互換廃止へ拡大解釈しない。

同日、所有者が「下準備すすめてほしい」と共通基盤の着手を依頼した。設計の下準備範囲（ガンマ移植＋グレインを第二実装にした共通化）を進める。全20種のadapter実装や全パラメータ対応まで完了したという意味には広げない。

共通基盤の完了後、所有者が「複数パラメーターの場合としてブルームでの実装も」と追加を指定した。強度＋しきい値をON / OFFと同じキーへ登録する次段階を進める。カーネル・色のキー化や、他の全effect対応まで採用済みとは扱わない。

ブルームの確認後、所有者が「移行できそうなものの対応」を依頼した。共通方式へ移せる効果の追加を進める。今回の実装対象・検証結果は数値5種のメモを参照し、未対応の効果や全パラメータまで完了と推定しない。

数値5種の追加後、所有者が「進められそうなやつ進めてください」と継続を依頼した。個別の準備を含めて進められる範囲を追加し、今回のLUT・ルミナスの対応範囲と制約は実装メモへ記録する。これを残る全設定の仕様確定へ広げない。

さらに所有者はスライダー項目のキー化を優先すると指定し、LUT選択も希望した。LUT選択は難しければ後回しでよいという条件。前回の固定設定扱いを恒久的な却下にせず、スライダーの描画上の制約を解消して順次進める。LUT全ファイル対応やクロスフェードまで採用済みとはしない。

## 避けること

- effect keyをlightより先に進める。
- MMDのself-shadow modeを影欄trackへ持ち込む。
- 非表示のshadow品質、bias、cascade、PostFXを影欄trackへ混ぜる。
- 物理ON/OFF、simulation rate、床衝突、ノイズ、backend固有値をgravity trackへ混ぜる。
- gravity/effectをVMD出力の必須条件にする。

## 根拠

所有者が照明、影、重力、effectのkey登録を挙げ、timelineを主題にする順序を承認した。影については、既存の影欄をタイムラインで動かす意図であり、MMDのself-shadow modeはMMD_modokiで採用しないと明示した。重力についても下パネルのUIに出している分だけでよいと明示し、照明・影欄・重力の初期実装後に現在の範囲でよいことを確認した。

## 再確認条件

light track完了後にrelease boundaryを再評価するとき。
ガンマ実験の検証結果が出たとき、または対象effect・操作範囲の追加指定があったとき。
