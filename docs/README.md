# Docs

このフォルダは `MMD_modoki` の設計・実装メモを置く場所です。

## 目次

- [アーキテクチャ概要](./architecture.md)
- [MmdManager 解説](./mmd-manager.md)
- [カメラVMD対応メモ](./camera-vmd.md)
- [UI と操作フロー](./ui-flow.md)
- [影仕様と実装](./shadow-spec.md)
- [MMD基本機能チェックリスト](./mmd-basic-task-checklist.md)
- [WebGPU/WGSL 調査と実装方針（現行）](./webgpu-wgsl-feasibility.md)
- [MMDキーフレーム/ボーン/補間 調査メモ](./mmd-keyframe-bone-interpolation-research.md)
- [現行MMD 補間曲線の扱い調査メモ](./mmd-interpolation-curve-research.md)
- [補間曲線 仕様と実装まとめ（現行）](./interpolation-curve-spec-implementation.md)
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
7. 現行MMDの補間曲線仕様を確認したい: `mmd-interpolation-curve-research.md`
8. 補間曲線の現行実装を確認したい: `interpolation-curve-spec-implementation.md`
9. ボーン編集の現行実装を確認したい: `bone-operation-spec.md`
10. タイムライン実装を確認したい: `timeline-spec.md`
11. UI/Manager/Timelineの接続を確認したい: `data-flow-timeline.md`
12. 再生/停止/シークの状態遷移を確認したい: `edit-state-machine.md`
13. キー保存の内部仕様を確認したい: `keyframe-storage-spec.md`
14. VMD/VPDの読込挙動を確認したい: `import-behavior-vmd-vpd.md`
15. 再生・シークと物理の方針を確認したい: `playback-seek-physics-policy.md`
16. 回帰確認手順を回したい: `manual-test-checklist.md`
17. 未実装/既知課題を確認したい: `known-issues.md`
18. 文字コード/改行の注意点を確認したい: `dev-notes-encoding.md`
19. Babylon-mmd 物理調査を確認したい: `babylon-mmd-physics-research.md`
20. 物理の現行仕様を確認したい: `physics-runtime-spec.md`
21. 物理演算の実装順を確認したい: `physics-task-list.md`
22. 起動時エラーを確認したい: `troubleshooting.md`
23. WebGPU/WGSL 導入方針を確認したい: `webgpu-wgsl-feasibility.md`
