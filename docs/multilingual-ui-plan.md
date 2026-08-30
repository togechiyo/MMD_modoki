# 多言語UI対応メモ

この文書は、MMD modoki の UI 多言語化方針と、実際に入れた実装内容をまとめたメモです。

## 対応言語

- `ja`
- `en`
- `zh-Hant`
- `zh-Hans`
- `ko`

MMD ユーザーが多い地域を優先し、中国語は繁体字と簡体字を分けて扱う。

## 方針

- 既存の Electron + DOM 構成を維持する
- React 前提の i18n は入れない
- 翻訳辞書は `language/` 配下に言語ごとの JSON として置く
- 言語切替は上部ツールバーのドロップダウンで行う
- UI フォントはアプリ同梱の CJK フォントを使う

## 実装済み

### i18n 基盤

- `src/i18n.ts` で `i18next` を使う構成にした
- locale は `ja / en / zh-Hant / zh-Hans / ko` の 5 言語に対応した
- `localStorage` と `navigator.languages` を使って初期言語を決める
- `document.documentElement.lang` を locale に同期する
- `window.mmdI18n` から現在 locale の取得と切替ができる

### 言語ドロップダウン

- 上部ツールバーに `toolbar-locale-select` を追加した
- 言語選択は `日本語 / English / 繁體中文 / 简体中文 / 한국어` の固定表記にした
- 切替時は即座に UI を再描画し、設定を保存する

### 翻訳辞書

以下の JSON を `language/` 配下に置いた。

- `language/ja.json`
- `language/en.json`
- `language/zh-Hant.json`
- `language/zh-Hans.json`
- `language/ko.json`

内容は、少なくとも次をカバーしている。

- ツールバー
- 再生操作
- タイムライン
- エフェクト
- 情報表示
- 補間
- ボーン
- モーフ
- カメラ
- 物理
- 照明
- アクセサリー
- 出力
- toast / busy / error のメッセージ

### 画面文言の置換

- `index.html` の主要なラベルに `data-i18n` 系属性を付けた
- `src/ui-controller.ts` の一部の固定文言を `t(...)` に置き換えた
- `src/renderer.ts` の初期化失敗メッセージを辞書参照にした

### フォント

- UI 用フォントとして `src/assets/fonts/NotoSansCJK-Regular.ttc` を同梱した
- 等幅表示用に `src/assets/fonts/NotoSansMonoCJKjp-Regular.otf` を同梱した
- `src/index.css` で `Noto Sans CJK OTC` を UI の優先フォントにした
- `--font-mono` では `Noto Sans Mono CJK JP` を優先するようにした
- `button`, `input`, `select`, `textarea` を `font: inherit` にして UI 全体へ反映した
- 下パネルや各種ドロップダウンのフォントも、基本的に同梱フォントへ統一した

### 画面内の表示確認

- タイムラインの canvas 文字は `src/timeline.ts` 側で UI フォントスタックに寄せた
- モデル名、ボーン名、モーフ名などのマルチバイト文字もそのまま扱う前提で進めている

## いまの構成

- UI 表示用フォント: `Noto Sans CJK OTC`
- 等幅用フォント: `Noto Sans Mono CJK JP`
- locale: `ja / en / zh-Hant / zh-Hans / ko`
- 翻訳辞書: `language/*.json`
- 切替 UI: 上部ツールバーのドロップダウン

## 補足

- 文字コードは UTF-8 前提
- `zh-Hant.json` / `zh-Hans.json` / `ko.json` は一度壊れたが、UTF-8 の JSON として復旧済み
- `npm run lint` は通過確認済み

## リリース前確認

release tagを作る前に、`ja / en / zh-Hant / zh-Hans / ko`の5辞書についてJSON構文、キー集合、空文字を確認する。非英語辞書では英語辞書と同じ値も抽出し、技術用語・固有名詞として意図したものと、未翻訳の人間向け文言を分ける。あわせてアプリの言語選択から5モードへ実際に切り替え、共通画面とreleaseで変更した画面に、翻訳キーの露出、意図しない英語fallback、文字化け、空欄、操作を妨げる文言切れがないことを確認する。

詳細な合格条件と記録方法は[リリース手順メモ](./release-process.md#各言語モードの確認)を正本とする。

## 2026-08-28 v0.2.3 release後の実画面確認

project ownerがv0.2.3配布後に、English、繁體中文、简体中文、한국어へ切り替えた実画面を確認した。辞書は5言語とも904キーで集合が一致し空文字もなかったが、次の表示問題が残っていた。

- EnglishでもEffect panelの`効果 / 材質`、補間欄の`コピー / ペースト / 線形`、外部親の`なし`など、日本語の固定文言が残る。
- 繁體中文、简体中文、한국어では上位menu、読込button、空状態message、項目名などに英語が広く残り、日本語の固定文言も混在する。
- 下部の照明、影、重力などは列幅が日本語表示を前提としており、英語を中心にlabelが`Ligh...`、`Sha...`、`Grav...`のように意味を判別しにくい長さまで省略される。
- Effect panelのtabなど、一部の固定HTML文言には`data-i18n`属性がなく、locale切替の対象外になっている。
- 非英語辞書には英語辞書と同値の項目が多数ある。2026-08-28時点の単純比較では`zh-Hant`と`zh-Hans`が各379件、`ko`が363件で、技術用語や固有名詞を差し引いた人間向け文言の棚卸しが必要である。

この問題は[v0.2.x feedback V022-055](./v0.2-feedback.md#v022-055-各言語uiで翻訳精度不足文言混在label-overflowが多発する)として追跡し、v0.2.3を差し替えず次versionで修正する。完了条件は、辞書の完全翻訳だけでなく、動的UIのlocale再反映と、5言語それぞれで意味を判別できるlayoutを含む。

## 2026-08-30 所有者追加確認

project ownerが、各言語の翻訳精度が不十分で、labelが表示領域からはみ出す箇所も多発していることを追加確認し、対応対象とするよう明示した。

V022-055は固定文言と未翻訳だけの問題ではなく、次の2軸を同時に完了させる。

- 翻訳品質: 意味の正確さ、MMD / 3D編集用語の一貫性、不自然な直訳や別言語混在の解消
- 表示品質: labelの枠外へのはみ出し、clipping、重なり、過度なellipsis、操作対象の遮蔽の解消

機械確認はJSON構文、キー集合、空文字、英語同値候補の抽出までとし、訳語の採否は各言語の文脈レビューで確認する。GUI確認は5言語へ実際に切り替え、共通shell、timeline、下部panel、Effect panel、dialog、動的messageを対象にする。

## 2026-08-30 多言語データの入出力方針

project ownerは、多言語翻訳強化を画面文言だけに限定せず、中国語系の漢字を含む
Unicodeのモデル名、ボーン名、モーフ名、モーショントラック名をそのまま読み込み・保存できる
toolへ進める方針を明示した。

この方針では、表示言語とアセット内文字列を別の責務として扱いながら、どちらも途中で
Shift_JISへ縮退させない。

- UI: `ja / en / zh-Hant / zh-Hans / ko`の訳語とCJK layoutを正しく表示する。
- model / project: PMXとproject JSONのUnicode名を保持する。
- motion: UTF-8可変長track名を持つBVMDを、Unicodeを保てる読込・保存形式として扱う。
- VMD: 従来toolとの互換出力として残すが、Shift_JIS符号化不能、固定長超過、名前衝突を
  黙って置換・切り詰めず、現在のvalidatorで利用者へ伝える。

BVMDの形式・`babylon-mmd`対応状況・既存VMDからは失われた文字を復元できない制約は、
[BPMX / BVMD調査メモ](./bpmx-bvmd-babylon-mmd-support-research-2026-08-30.md)を参照する。

## 今後の作業候補

1. 画面内の残りの直書き文言を辞書へ寄せる
2. `en / zh-Hant / zh-Hans / ko`を中心に、5言語の訳語精度と用語一貫性をレビューする
3. labelの自動幅、折返し、最小幅、ellipsis方針を画面ごとに整理する
4. 必要なら辞書キーの命名規則を固める
5. 5言語の実画面で共通shellと主要dialogを確認する
6. Unicode名を含むPMX / BVMD / projectの読込・編集・保存round-tripを確認する
