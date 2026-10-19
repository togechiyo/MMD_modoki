# フィードバック再現確認用の生成fixture

`create.mjs`は、第三者素材を含まないMITの自作データを生成する。

- `createMorphVmd()`: `表情テスト`の0 / 30 frameだけを持つ、camera trackなしのVMD 2。
- `createSwatchBmp(rgb)`: 同一pathのtexture再読込を比較する2×2、24-bit BMP。

PMXは既存の自作`createTofuModel()` / `writePmx()`と組み合わせる。生成物は一時directoryまたはignoredな`artifacts/`へ置き、ユーザー所有のmodelを使用しない。

実行方法と結果は[未修正バグの再現確認](../../../docs/feedback-bug-reproduction-2026-10-19.md)を参照。
