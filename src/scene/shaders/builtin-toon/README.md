# 組込Toonプリセット用WGSL

`material-shader-service.ts`がraw importする内部fragmentです。外部材質API v1のサンプルではありません。

旧`wgsl/`にあった使用中の13ファイルを2026-09-12に移動しました。先頭の説明コメントとimport先以外は変更していません。Toonテクスチャ、ライト、shadow、SSS等の内部変数・前処理に依存します。

外部読込用のサンプルは [wgsl/](../../../../wgsl/README.md) を参照。
