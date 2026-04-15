# テスト導入提案

更新日: 2026-04-15

## 概要

このドキュメントでは、MMD modoki にテストを段階的に導入するための方針・優先順位・具体的な進め方をまとめる。

現状このリポジトリにはテストが存在しない。品質チェック手段は ESLint による静的解析と、CI（`build-zips.yml`）での lint + ビルド確認のみ。手動テストについては `docs/manual-test-checklist.md` にチェックリストがある。

プロジェクトの位置づけが「技術的試作 / 実験機」であることを踏まえ、テスト導入は **小さく始めて、効果の高い部分から段階的に広げる** 方針とする。

---

## 推奨フレームワーク

### Vitest を推奨する理由

- Vite ベースのプロジェクトと相性がよい（既に Vite を使用中）
- TypeScript をそのままテストでき、追加設定が少ない
- Jest 互換の API で学習コストが低い
- `--ui` モードでブラウザ上のテストビューアが使える
- ウォッチモードが高速

### 導入手順（最小構成）

```bash
npm install -D vitest
```

`package.json` に追加:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`vitest.config.ts` の例:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

---

## コードのテスト可能性分類

ソースコードを「テストしやすさ」で 3 段階に分類した。

### テスト容易（純粋関数・ユーティリティ）

Babylon.js や Electron に依存せず、入力→出力が明確な関数群。**最初にテストを書くべき対象**。

| ファイル | 主な関数 / ロジック | 内容 |
|---|---|---|
| `src/project/project-codec.ts` | `encodeUint8ToBase64`, `decodeBase64ToUint8`, `packFloat32Array`, `packUint8Array`, `packFrameNumbers` など | Base64 + varint によるバイナリ圧縮・展開 |
| `src/shared/timeline-helpers.ts` | `mergeFrameNumbers`, `hasFrameNumber`, `addFrameNumber`, `removeFrameNumber` | ソート済み Uint32Array のマージ・検索・挿入・削除 |
| `src/shared/timeline-helpers.ts` | `classifyBone`, `createTrackKey`, `parseTrackKey` | ボーン名分類（正規表現）、トラックキー文字列のパース |
| `src/editor/timeline-edit-service.ts` | `createFrameIndexMap`, `copyFloatFrameBlock`, `copyUint8FrameBlock` | 配列コピー・インデックスマッピング |

### テスト中程度（Babylon.js 依存あり）

Babylon.js のオブジェクト（Scene, Material, MmdAnimation 等）に依存するが、ロジック自体は検証可能。モックやミニマルなシーンフィクスチャを使えばテストできる。

| ファイル | 主な関数 / ロジック | 依存度 |
|---|---|---|
| `src/project/project-serializer.ts` | `exportProjectState` | MmdManager の状態オブジェクトに依存 |
| `src/project/project-importer.ts` | `importProjectState` | Scene セットアップが必要 |
| `src/scene/material-shader-service.ts` | シェーダープリセット適用 | Babylon.js Material クラスに依存 |
| `src/editor/timeline-edit-service.ts` | `getOrCreateModelTrackFrameMap`, `getCurrentModelAnimation` | MmdAnimation クラスに依存 |

### テスト困難（UI / 描画 / Electron 密結合）

DOM 操作、Canvas 描画、Electron IPC、WebGPU レンダリングなどに強く依存。自動テストのコストが高い。

| ファイル | 理由 |
|---|---|
| `src/ui-controller.ts` | DOM 操作・イベントハンドラ・electronAPI 依存 |
| `src/timeline.ts` | Canvas 描画・マウス/キーボード入力 |
| `src/mmd-manager.ts` | Babylon.js Engine/Scene 作成・アニメーション再生・物理 |
| `src/render/` 配下 | ポストプロセス・レンダリングパイプライン |

---

## 段階的な導入計画

### Phase 1: 純粋関数のユニットテスト（最初にやるべき）

**目的:** テスト基盤の構築と、最も効果の高い部分のカバー

**対象:**

1. **`project-codec.ts` のエンコード / デコード**
   - `encodeUint8ToBase64` ↔ `decodeBase64ToUint8` のラウンドトリップ
   - `packFloat32Array` / `packUint8Array` の圧縮・展開
   - `packFrameNumbers` の delta + varint エンコード
   - 空配列、大きな配列、境界値のエッジケース
   - `isPackedProjectArray` / `getProjectArrayLength` の型ガード

2. **`timeline-helpers.ts` のフレーム操作**
   - `mergeFrameNumbers`: 2 つのソート済み配列のマージ
   - `addFrameNumber` / `removeFrameNumber`: 挿入・削除後のソート維持
   - `hasFrameNumber`: バイナリサーチの正しさ
   - `classifyBone`: 各種ボーン名の分類結果
   - `createTrackKey` / `parseTrackKey`: ラウンドトリップ

3. **`timeline-edit-service.ts` の配列操作**
   - `createFrameIndexMap`: インデックスマッピングの正しさ
   - `copyFloatFrameBlock` / `copyUint8FrameBlock`: コピーの整合性

**想定テスト数:** 50〜100 件  
**想定工数:** 小（1〜2 セッション）

**テストファイル配置例:**

```
src/
├── project/
│   ├── project-codec.ts
│   └── project-codec.test.ts
├── shared/
│   ├── timeline-helpers.ts
│   └── timeline-helpers.test.ts
├── editor/
│   ├── timeline-edit-service.ts
│   └── timeline-edit-service.test.ts
```

### Phase 2: プロジェクト保存/読み込みの結合テスト

**目的:** データの永続化まわりの回帰防止。プロジェクトファイル形式の変更時に壊れにくくする。

**対象:**

1. **シリアライズ → デシリアライズのラウンドトリップ**
   - プロジェクト JSON を作成 → インポート → 再エクスポート → 比較
   - 旧形式（number 配列）の互換読み込み
   - 300f 超のキーフレームを含むプロジェクト

2. **テストフィクスチャの整備**
   - 小規模（キー数件）・中規模（300f 超）・大規模のプロジェクト JSON
   - 旧形式と新形式の両方

**制約:**

- `project-serializer.ts` と `project-importer.ts` は MmdManager の状態オブジェクトに依存するため、最低限のモックが必要
- Babylon.js の MmdAnimation 型のモックを用意する必要がある

**想定工数:** 中（モック設計を含めて 2〜3 セッション）

### Phase 3: CI への組み込み

**目的:** テストをマージゲートとして機能させる

**対応内容:**

1. `build-zips.yml` の lint ステップの後に `npm test` を追加
2. または、テスト専用の軽量ワークフローを別途作成（push / PR 時に実行）

**ワークフロー例（テスト専用）:**

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

### Phase 4（将来）: 結合テスト・E2E の拡充

Phase 1〜3 が安定してから検討する領域。

- **Babylon.js シーンを使った結合テスト:** ヘッドレスの NullEngine でシーンを構築し、マテリアル適用やアニメーショントラック生成をテスト
- **Electron E2E テスト:** Playwright や Spectron による UI 操作テスト（コスト高）
- **ビジュアルリグレッション:** スクリーンショット比較による描画の回帰検出（さらにコスト高）

これらは現時点ではコスト対効果が低いため、プロジェクトが安定期に入ったタイミングで改めて検討する。

---

## 手動テストとの棲み分け

既存の `docs/manual-test-checklist.md` は引き続き有効。自動テストでカバーしにくい以下の領域は手動テストに頼る:

| 自動テスト向き | 手動テスト向き |
|---|---|
| データ変換のラウンドトリップ | 描画結果の見た目の正しさ |
| 配列操作の正確性 | UI 操作の手触り・レスポンス |
| プロジェクトファイルの互換性 | 物理の暴走・破綻 |
| 補間計算の数値精度 | WebGPU / WebGL2 間の見た目差異 |

手動テストチェックリストの項目のうち、データ系の検証（セクション 10「プロジェクト保存/読み込み」など）は将来的に自動テストへ移行できる可能性がある。

---

## テスト導入時の注意点

### やりすぎない

- このプロジェクトは実験機であり、網羅的なテストカバレッジを目指す必要はない
- 変更頻度が高く壊れやすい部分に集中する
- テストのメンテナンスコストがテスト対象の価値を上回らないようにする

### テスト対象のコードを先にリファクタリングしない

- テストを書きたいがためにコードを大きく書き換えるのは本末転倒
- 今のコード構造のまま書けるテストから始める
- リファクタリングが必要になった場合は、テストを書いてからリファクタリングする順序が望ましい

### フィクスチャの管理

- テスト用のプロジェクト JSON やバイナリデータは `src/__fixtures__/` または各テストファイルの隣に配置
- 大きなバイナリファイル（PMX, VMD 等）はリポジトリに含めず、テストではインラインの最小データを使う

---

## まとめ

| Phase | 内容 | 工数 | 効果 |
|---|---|---|---|
| **1** | 純粋関数のユニットテスト + Vitest 導入 | 小 | 高（データ破壊の防止） |
| **2** | プロジェクト保存/読み込みの結合テスト | 中 | 高（互換性の回帰防止） |
| **3** | CI への組み込み | 小 | 中（マージゲート化） |
| **4** | Babylon.js 結合テスト・E2E | 大 | 低〜中（現時点ではコスト高） |

まずは Phase 1 の Vitest 導入 + `project-codec.ts` / `timeline-helpers.ts` のテストから始めるのが最もコスト対効果が高い。

---

## 関連ドキュメント

- [手動テストチェックリスト](manual-test-checklist.md)
- [MMD 基本機能タスクチェックリスト](mmd-basic-task-checklist.md)
- [プロジェクト位置づけメモ](mmd-project-positioning-note.md)
