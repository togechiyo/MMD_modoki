# WGSL Toon Snippet Samples

このフォルダの `.wgsl` は、**シェーダー全体**ではなく、
MMD Toon の一部計算（`diffuseBase` 加算部分）を差し替えるための
**WGSLスニペット**です。

## 使い方

1. アプリの Shader パネルで `WGSL -> Load...` を押す
2. このフォルダの `.wgsl` を選ぶ
3. 見た目を確認し、必要なら `Clear` で戻す

## 注意

- WebGPU / WGSL 時のみ有効
- `#ifdef TOON_TEXTURE_COLOR` ブロックを含む形式を推奨
- `diffuseBase+=...` 相当の処理を必ず含める

## 同梱サンプル

- `toon_template.wgsl`
  - 編集用の最小テンプレート
- `toon_balanced_default.wgsl`
  - 標準寄りのバランス型
- `toon_hard_shadow.wgsl`
  - 影境界を硬くしたハイコントラスト型
- `self_shadow.wgsl`
  - Toonテクスチャを法線のライト向きで評価し、shadow map遮蔽を使わないSelf Shadowプリセット
- `sss_standard.wgsl`
  - 再設計を保留している旧SSS Standard局所近似。Toon影色、signed N dot L、world-space曲率を使う
- `sss_skin.wgsl`
  - MMD direct diffuseをBabylon PrePassへ渡し、固定赤優勢Burley profileと均一厚みの逆光透過を使うSSS Skinプリセット
- `toon_soft_pastel.wgsl`
  - 影を柔らかくしたパステル寄り
- `toon_debug_white_shadow.wgsl`
  - テクスチャ無視の白表示 + 影のみ保持（SSAO/Fog確認向け）
