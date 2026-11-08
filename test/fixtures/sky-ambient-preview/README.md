# Sky Ambient 比較用fixture

自作の手続き生成scene・checker texture・テスト専用material plugin。repositoryのMIT条件で扱う。第三者assetは不要。

- `scene.ts`: 庇付き店舗、開口した室内、床、小物、移動する受け手。固定casterは15mesh / 180三角形。E2E modeのWebGPU sceneのみで起動可能。
- `material.ts`: 通常MMD材質へ独立した空照明を加える比較用plugin。通常アプリへは未接続。
- `../../e2e/sky-ambient-preview.spec.mjs`: 遮蔽の有無、色・texture、移動時の更新抑止、caster変更、強度0。

GPUを利用できるローカル環境で実行する。

```powershell
npm.cmd run test:e2e -- sky-ambient-preview.spec.mjs
```

実行中はsource・docsを編集しない。撮影のためモデル未読込の案内だけを一時的に非表示にする。通常UI、保存、出力経路の完成を検証するfixtureではない。

[実装・結果・制約](../../../docs/sky-ambient-preview-2026-11-08.md)、[fixture台帳](../../../docs/test-reference-asset-ledger.md)
