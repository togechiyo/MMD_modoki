---
id: experimental-settings-live-under-tools
status: decision
scope: ui/experimental-settings
confidence: high
last_verified: 2026-09-08
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/experimental-settings-popup-2026-09-08.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-08
---

# 実験設定はツールメニューにまとめる

## 適用条件

通常UIから隠した実験機能の入口を追加するとき。

## 判断

「ツール → 実験設定…」を入口とし、PBRモードに環境ライト・IBL影の詳細をまとめ、ログの場所・コピー操作を置く。当面は外部WGSLなど他機能まで広げない。

後続指示により詳細項目は常時表示する。PBR切替は次回読込だけでなく読込済みモデルへ適用する。所有者への確認で即時切替の対象はIBL影ではなく通常MMD/PBRと確定した。当初の内部再読込やUndoリセットは実装上の制約であり、所有者が制約を承認したとは扱わない。後続実装ではruntimeを維持した材質交換へ変更している。

さらに所有者は、全体モードの往復時に材質設定を退避し、未登録分を含むポーズをそのまま引き継ぐよう指定した。ポーズ・モーション・現在フレーム・物理状態はモード共通の保持対象とし、未登録変更の破棄や事前キー登録を切替仕様にしない。詳細は[全体モード設計](../../docs/project-material-mode-design-2026-09-08.md)を参照する。

後続指定「PBRモードになったときは環境ライトを自動でオンにして。暗く見える」により、PBRへ切替時の環境ライト自動ONを採用する。強度の変更や常時ON固定を要求したものではない。

2026-09-08の環境素材検討では、所有者は内蔵TrueHDRIの維持と、外部ENV / DDS読込の追加を指定した。Babylon Texture Libraryの素材は動作確認用途に使ってよいが、内蔵素材の置換を承認したものではない。詳細は[環境ライト仕様](../../docs/external-hdri-environment-lighting-2026-07-21.md)を参照する。

## 避けること

PBRを既定モードへ変更すること。UIの採用を、凍結機能の技術的問題が解消した証拠として扱うこと。

## 根拠

2026-09-08の所有者指定「PBRモードに環境ライトやIBL影も詳細項目として含む」「ログファイルへのリンクとかコピペ」「メニューバーのツールのとこに実験設定」、続く実装依頼。

## 再確認条件

所有者が実験設定に含める範囲を変更したとき。
