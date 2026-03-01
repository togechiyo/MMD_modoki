# 現行MMD ショートカットキー調査メモ

調査日: 2026-02-27

## 0. 前提
- 本メモの「現行MMD」は、公式配布の `MikuMikuDance_v932x64`（Ver.9.32）を前提にする。
- 一覧は以下の2系統を突き合わせて整理した。
  - 公式配布物の `readme.txt`（バージョン履歴内のショートカット関連記述）
  - VPVP wiki の「ショートカットキー一覧」（操作一覧としてまとまっているページ）
- キー名は日本語キーボード依存の差があるため、`ろ` / `む` は英字配列で別キー位置になる場合がある。

## 1. 優先実装すべきショートカット（MMDもどき向け）

| 分類 | キー | 動作 | 根拠 |
| --- | --- | --- | --- |
| 再生 | `P` | 再生/停止 | VPVP wiki 一覧、公式 readme |
| フレーム移動 | `→` / `←` | 1フレーム進む / 戻る | VPVP wiki 一覧 |
| タイムライン移動 | `Ctrl + ↑` / `Ctrl + ↓` | 次ポイント / 前ポイントへ移動 | VPVP wiki 一覧、公式 readme |
| キー登録 | `Enter` | 現在値をフレーム登録 | VPVP wiki 一覧、公式 readme |
| コピー/貼り付け | `Ctrl + C` / `Ctrl + V` | 選択フレームのコピー/ペースト | VPVP wiki 一覧、公式 readme |
| Undo | `Ctrl + Z` | 元に戻す | VPVP wiki 一覧 |
| モデル切替 | `Tab` / `Shift + Tab` | 次モデル / 前モデルを選択 | VPVP wiki 一覧、公式 readme |
| 補間自動設定 | `む`（US配列では `]` 位置相当） | 補間曲線自動設定 ON/OFF | VPVP wiki 一覧、公式 readme |
| 操作軸切替 | `R` | XYZ軸切替 | VPVP wiki 一覧 |
| 表示切替 | `G` / `E` / `H` | 地面影 / エッジ / 座標軸 の表示ON/OFF | VPVP wiki 一覧 |
| 背景表示 | `B` | 背景を黒に切替 | VPVP wiki 一覧、公式 readme |
| モデル表示 | `Space` / `Ctrl + Space` | 選択モデルのみ表示 / 全モデル表示 | VPVP wiki 一覧 |
| 画面モード | `Alt + Enter` / `Esc` | フルスクリーン切替 / 解除 | VPVP wiki 一覧、公式 readme |
| カメラ平行移動 | `Shift + 左ドラッグ` | 視点を平行移動 | VPVP wiki 一覧 |

## 1.1 マウス操作（VPVP wiki 由来）

| 操作 | 動作 |
| --- | --- |
| `右ドラッグ` | 視点回転 |
| `Shift + 右ドラッグ` | 視点平行移動 |
| `Ctrl + 右ドラッグ` | 視点ズーム |
| `ホイールドラッグ`（中ボタンドラッグ） | 視点平行移動 |
| `マウスホイール回転` | 視点ズーム |

## 2. 現行版で押さえるべき差分（公式readme由来）

- Ver.9.23（2014-10-03）
  - `む` キーで「補間曲線 自動設定」の ON/OFF
  - `Tab` に加えて `ろ` キーでもモデル切替
- Ver.9.07（2014-03-18）
  - `Ctrl + C` / `Ctrl + V` でフレーム操作のコピー/ペースト対応
- Ver.9.05（2014-03-17）
  - `Shift + Tab` で前モデル選択
- Ver.7.39（2011-04-30）
  - `G` は Go（フレーム移動）へ割り当て変更
  - Global/Local 切替は `L` へ変更

## 3. 実装時の注意

- `Ctrl + X`（Redo）表記は、コミュニティ一覧に記載はあるが、公式readmeで直接確認できる記述を見つけられていない。  
  実装時は `Ctrl + Y` 互換も含めて実機確認推奨。
- 日本語配列依存キー（`ろ` / `む`）は、物理キー基準で扱うか、文字キー基準で扱うかをUI仕様として固定する。

## 4. 参照元

- 公式配布サイト（VPVP）  
  https://sites.google.com/view/vpvp/
- 公式配布物 `MikuMikuDance_v932x64/readme.txt`（ローカル抽出: `tmp_mmd_readme_v932.txt`）
- VPVP wiki（初心者向けアドバイス内「ショートカットキー一覧」節）  
  https://w.atwiki.jp/vpvpwiki/pages/12.html
- VPVP wiki（操作方法・カメラ操作のショートカット）  
  https://w.atwiki.jp/vpvpwiki/pages/149.html
