# Docs

このフォルダは `MMD_modoki` の設計・実装メモを置く場所です。

## 目次

- [アーキテクチャ概要](./architecture.md)
- [MmdManager 解説](./mmd-manager.md)
- [カメラVMD対応メモ](./camera-vmd.md)
- [UI と操作フロー](./ui-flow.md)
- [影仕様と実装](./shadow-spec.md)
- [MMD基本機能チェックリスト](./mmd-basic-task-checklist.md)
- [MMDキーフレーム/ボーン/補間 調査メモ](./mmd-keyframe-bone-interpolation-research.md)
- [ボーン操作 仕様と実装メモ](./bone-operation-spec.md)
- [タイムライン 仕様と実装メモ](./timeline-spec.md)
- [編集状態遷移メモ](./edit-state-machine.md)
- [タイムライン データフロー](./data-flow-timeline.md)
- [キーフレーム保存仕様（現行）](./keyframe-storage-spec.md)
- [VMD/VPD 読み込み挙動メモ](./import-behavior-vmd-vpd.md)
- [再生・シーク・物理 ポリシー](./playback-seek-physics-policy.md)
- [手動テストチェックリスト](./manual-test-checklist.md)
- [既知課題（現行）](./known-issues.md)
- [開発メモ: 文字コードと改行](./dev-notes-encoding.md)
- [Babylon-mmd物理調査メモ](./babylon-mmd-physics-research.md)
- [物理実装仕様（現行）](./physics-runtime-spec.md)
- [物理演算タスクリスト](./physics-task-list.md)
- [トラブルシュート](./troubleshooting.md)

## 読み始めガイド

1. 全体像を知りたい: `architecture.md`
2. Babylon/babylon-mmd の中核処理を追いたい: `mmd-manager.md`
3. カメラVMDの実装を追いたい: `camera-vmd.md`
4. 画面イベントの流れを追いたい: `ui-flow.md`
5. 影挙動（PMX フラグ）を確認したい: `shadow-spec.md`
6. MMDキーフレーム/補間の仕様差分を確認したい: `mmd-keyframe-bone-interpolation-research.md`
7. ボーン編集の現行実装を確認したい: `bone-operation-spec.md`
8. タイムライン実装を確認したい: `timeline-spec.md`
9. UI/Manager/Timelineの接続を確認したい: `data-flow-timeline.md`
10. 再生/停止/シークの状態遷移を確認したい: `edit-state-machine.md`
11. キー保存の内部仕様を確認したい: `keyframe-storage-spec.md`
12. VMD/VPDの読込挙動を確認したい: `import-behavior-vmd-vpd.md`
13. 再生・シークと物理の方針を確認したい: `playback-seek-physics-policy.md`
14. 回帰確認手順を回したい: `manual-test-checklist.md`
15. 未実装/既知課題を確認したい: `known-issues.md`
16. 文字コード/改行の注意点を確認したい: `dev-notes-encoding.md`
17. Babylon-mmd 物理調査を確認したい: `babylon-mmd-physics-research.md`
18. 物理の現行仕様を確認したい: `physics-runtime-spec.md`
19. 物理演算の実装順を確認したい: `physics-task-list.md`
20. 起動時エラーを確認したい: `troubleshooting.md`
