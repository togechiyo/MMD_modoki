# Electron 起動確認の自動化調査

更新日: 2026-04-15

## 背景

GitHub Copilot coding agent はモバイルアプリからも指示を出せるようになった。しかし、コード変更後に「アプリが起動するか」をエージェント側で確認する手段がなく、ビルドが通っても実際の起動でクラッシュするリスクを検知できない。

Playwright 等を導入して、起動確認程度の E2E テストをエージェントが実行できるようにしたい、というのが動機。

---

## 結論（先に要約）

**Playwright で Electron の起動確認テストを書くことは技術的に可能だが、GitHub Copilot coding agent の実行環境で動かすには制約がある。** 段階的に進めるなら以下の順が現実的:

1. **まず `electron-forge package` の成功をビルド確認として CI に組み込む**（ローリスク・確実）
2. **Playwright の Electron 対応で最小限の起動テストを書く**（ローカル・CI では有効）
3. **Copilot coding agent 環境で動かすには `copilot-setup-steps.yml` でのセットアップが必要**（要検証）

---

## 1. Playwright で Electron を起動テストする方法

Playwright は `electron` クラスを提供しており、Electron アプリを直接起動してテストできる。

### 基本的な起動テストの例

```ts
// e2e/launch.test.ts
import { test, expect, _electron as electron } from "@playwright/test";

test("アプリが起動してメインウィンドウが表示される", async () => {
  const electronApp = await electron.launch({
    args: [".vite/build/main.js"],
    env: {
      ...process.env,
      // WebGPU 関連のフラグは CI では不要（起動確認だけなら）
      ELECTRON_DISABLE_GPU: "1",
    },
  });

  // メインウィンドウが開くのを待つ
  const window = await electronApp.firstWindow();

  // ウィンドウタイトルの確認
  const title = await window.title();
  expect(title).toContain("MMD modoki");

  // レンダラープロセスでクラッシュしていないことの確認
  // （Canvas が見つかるかどうかで判定）
  const canvas = await window.locator("#render-canvas");
  await expect(canvas).toBeVisible({ timeout: 15000 });

  await electronApp.close();
});
```

### セットアップ

```bash
npm install -D @playwright/test
```

```json
{
  "scripts": {
    "test:e2e": "npx playwright test --config=e2e/playwright.config.ts"
  }
}
```

```ts
// e2e/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
});
```

### 起動テストで確認できること

| 確認項目 | 方法 |
|---|---|
| main プロセスがクラッシュしない | `electron.launch()` が reject しないこと |
| ウィンドウが開く | `firstWindow()` が返ること |
| レンダラーが初期化される | `#render-canvas` が表示されること |
| コンソールエラーの検出 | `page.on("console")` で `error` レベルを収集 |
| 致命的例外の検出 | `page.on("pageerror")` でキャッチ |

### 起動テストでは確認できないこと

| 確認できない項目 | 理由 |
|---|---|
| Babylon.js のレンダリング結果 | GPU が必要。CI 環境では WebGL2/WebGPU が使えないことが多い |
| モデル読み込みの成否 | PMX/VMD ファイルをテストに含める必要がある |
| 物理シミュレーション | Ammo.js wasm の初期化と GPU 依存 |
| シェーダーコンパイル | GPU バックエンド依存 |

---

## 2. Copilot Coding Agent 環境での制約

### 実行環境の特徴

Copilot coding agent は **Ubuntu ベースの GitHub Actions ランナー**上で動作する。

- **GPU なし:** WebGPU / WebGL2 が動かない可能性が高い
- **ディスプレイなし:** ヘッドレスで Electron を起動する必要がある（Playwright がこれを処理する）
- **Xvfb が必要:** Electron はたとえヘッドレスでも X11 ディスプレイサーバーが必要な場合がある
- **`copilot-setup-steps.yml` でカスタマイズ可能:** 依存関係のインストールやビルドを事前に実行できる

### `copilot-setup-steps.yml` に必要な設定

```yaml
# .github/copilot-setup-steps.yml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
      cache: npm
  - run: npm ci
  - run: npx playwright install --with-deps chromium
  # Electron の起動テスト用に Xvfb をインストール
  - run: sudo apt-get update && sudo apt-get install -y xvfb
  # ビルド（起動テストの前提）
  - run: npm run make:zip -- --platform=linux --arch=x64 || true
```

### 問題点と対応案

| 問題 | 影響 | 対応案 |
|---|---|---|
| GPU がない | Babylon.js の Engine 初期化で WebGPU / WebGL2 がフォールバックし、NullEngine になるか、エラーで止まる | `ELECTRON_DISABLE_GPU=1` + Babylon.js 側のフォールバック確認 |
| Xvfb が必要 | Electron が起動しない | `xvfb-run` でラップするか、`copilot-setup-steps.yml` で Xvfb をインストール |
| ビルド時間 | `electron-forge package` に数分かかる | `copilot-setup-steps.yml` でビルド済みにしておく |
| Electron バイナリサイズ | `npm ci` で Electron をダウンロードするのに時間がかかる | `copilot-setup-steps.yml` で事前にキャッシュ |

---

## 3. 段階的な導入の提案

### Step 1: ビルド確認の強化（最小工数）

現在の CI（`build-zips.yml`）は `lint` + `make:zip` を行っている。これだけでも「ビルドが壊れていないか」は確認できる。

Copilot coding agent でも `npm run lint` は AGENTS.md で確認コマンドとして指定されているため、最低限の品質ゲートは機能している。

追加で `npm run make:zip -- --platform=linux --arch=x64` をエージェントに実行させれば、パッケージングまでの整合性を確認できる。ただしビルド時間が長い（数分）ため、毎回実行するのは非現実的。

### Step 2: Playwright で最小限の起動テスト（ローカル・CI 用）

```
e2e/
├── launch.test.ts       # 起動してウィンドウが出るか
├── no-crash.test.ts     # コンソールに致命的エラーがないか
└── playwright.config.ts
```

この 2 ファイル程度の E2E テストを書き、CI で `xvfb-run npx playwright test` として実行する。GPU 関連の初期化エラーは許容し、「main プロセスが死なない」「ウィンドウが開く」だけを確認する。

### Step 3: Copilot coding agent で実行可能にする

`copilot-setup-steps.yml` でビルドと依存関係を事前にセットアップし、エージェントが `npm run test:e2e` を実行できるようにする。

**ただし、現実的な注意点:**

- エージェントの実行時間に制約があるため、起動テストは **5〜10 秒以内** に収まる必要がある
- GPU なし環境で Babylon.js が致命的エラーを出す場合、テストが false negative になる可能性がある
- エージェントにテスト実行を**強制**するには、AGENTS.md の確認コマンドに追記する必要がある

---

## 4. Babylon.js の GPU なし環境での挙動

このプロジェクトの `MmdManager.create()` は `WebGPUEngine` を試み、失敗時に `Engine`（WebGL2）にフォールバックする。CI 環境ではどちらも使えない可能性がある。

### 起動テストでの回避策

起動テストの目的が「main プロセスの起動確認」なら、Babylon.js の初期化失敗は **許容** してよい。

```ts
test("アプリが起動してメインウィンドウが表示される", async () => {
  const electronApp = await electron.launch({
    args: [".vite/build/main.js"],
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: "1",
    },
  });

  const window = await electronApp.firstWindow();
  const title = await window.title();
  expect(title).toContain("MMD modoki");

  // Babylon.js の初期化エラーは GPU なし環境では想定内
  // ウィンドウが開いてクラッシュしていなければ OK
  const crashed = await window.evaluate(() => {
    // renderer.ts の initializeApp がエラーを出してもウィンドウは生きている
    return document.title.includes("crashed") || document.title.includes("error");
  });
  expect(crashed).toBe(false);

  await electronApp.close();
});
```

---

## 5. 代替案: Electron を使わない起動確認

Playwright で Electron を直接操作するのが難しい場合、より軽量な代替もある。

### main プロセスの構文・モジュール解決チェック

```bash
# main.js がモジュールとして読み込めるかだけ確認
node -e "require('./.vite/build/main.js')" 2>&1 | head -20
```

これは Electron API に依存しているため実際には失敗するが、構文エラーやモジュール解決の問題は検出できる。

### TypeScript のビルド確認

```bash
npx tsc --noEmit
```

型チェックだけなら Electron なしで実行でき、多くの回帰を検出できる。

---

## まとめ

| アプローチ | 工数 | 確認できる範囲 | Copilot agent で実行可能か |
|---|---|---|---|
| `npm run lint` | なし（現状で動作中） | 静的解析 | ✅ 可能 |
| `npx tsc --noEmit` | 小 | 型チェック | ✅ 可能 |
| `npm run make:zip` | 小 | パッケージングまでの整合性 | ⚠️ 可能だが時間がかかる |
| Playwright 起動テスト（CI） | 中 | ウィンドウが開くか | ✅ CI では可能 |
| Playwright 起動テスト（agent） | 中〜大 | ウィンドウが開くか | ⚠️ 要 `copilot-setup-steps.yml` 設定 |
| Babylon.js 描画確認 | 大 | レンダリング結果 | ❌ GPU が必要 |

**現実的な最初のステップ:**

1. AGENTS.md の確認コマンドに `npx tsc --noEmit` を追加する（すぐできる）
2. Playwright の起動テストを書いて CI に組み込む（Step 2）
3. `copilot-setup-steps.yml` を整備してエージェントでも実行可能にする（Step 3）

---

## 関連ドキュメント

- [テスト導入提案](testing-strategy-proposal.md)
- [手動テストチェックリスト](manual-test-checklist.md)
- [MMD 基本機能タスクチェックリスト](mmd-basic-task-checklist.md)
