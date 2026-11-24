# language

UI 多言語辞書を置くフォルダです。

- `ja.json` 日本語
- `en.json` English
- `zh-Hant.json` 繁體中文
- `zh-Hans.json` 简体中文
- `ko.json` 한국어

`src/shared/ui-locales.ts` で5辞書を登録し、画面表示と出力時のネイティブダイアログで共有します。画面の文言は `src/i18n.ts` から `i18next` を通して取得します。

## 文言を追加・変更するとき

- 新しいキーは5辞書すべてに追加する。`{name}` などの差し込み変数の名前を揃え、語順は各言語に合わせる。
- DOM 反映は `data-i18n*` 属性経由を優先する
- 辞書の整合は `npm run test:unit -- src/i18n-dictionaries.test.ts`、ツールバーで言語を切り替えた後の表示は `npm run test:e2e -- multilingual-layout.spec.mjs` で確認する。
