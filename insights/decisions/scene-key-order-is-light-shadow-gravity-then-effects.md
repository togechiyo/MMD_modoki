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
