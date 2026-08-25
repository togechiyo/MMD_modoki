---
id: dof-autofocus-prefers-people-over-foreground-depth
status: decision
scope: rendering/dof
confidence: high
last_verified: 2026-08-25
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-25
evidence:
  - conversation-explicit-instruction
  - implemented-focus-mode
source_docs:
  - ../../docs/effect-timeline-dof-target-keying-investigation-2026-08-25.md
  - ../../docs/camera-postfx-current-spec.md
superseded_by: null
---

# DoF autofocusは手前のsurfaceより人物を優先する

## 適用条件

DoFの自動対象選択、中央・手前depth選択、focus modeを変更するとき。

## 判断

通常の簡易autofocusは、手前depthではなく人物modelを優先する。人物は頭、首、上半身系boneの存在で判定し、画面中央度と対象lockを使って選ぶ。stage、床、accessoryを通常の人物優先modeへ混ぜない。通常UIではこのmodeを `オートフォーカス` と表記し、新規scene / projectの既定選択にする。modeを保存していない旧projectは、保存済みDoF対象があれば `指定対象`、なければ `カメラ注視点` とする従来fallbackを維持する。

## 避けること

- 最小depthや手前優先を通常autofocusの既定にする。
- センターボーンだけを人物判定の根拠にする。
- stageの床がfocusを奪う挙動を人物優先modeへ持ち込む。
- 通常UIで内部実装名の `person-auto` や補助説明の `人物優先` を選択肢名として露出する。

## 根拠

所有者が、手前優先ではstage modelの床を拾う懸念を示して人物優先autofocusの実装を明示的に選択し、その後このmodeの表示名を `オートフォーカス`、新規sceneの既定選択とするよう明示した。

## 再確認条件

人物以外を意図的に追う別mode、depth occlusion、viewport上の対象指定を追加するとき。
