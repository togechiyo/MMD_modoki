# Luminousの材質条件・消灯確認fixture

リポジトリ内の自作fixture。MITライセンス。第三者モデル、texture、MMEファイルを含まない。

`node scripts/generate-luminous-material-conditions-fixture.mjs` で再生成し、installed PmxReaderで静的readbackを確認する。Electron/GPUは起動しない。

- `front.pmx`: 赤いPanel A（shininess130/specular0）、Panel C（100/0）、Panel D（130/specular長0.02）、白いReceiverの4面・8三角形。
- `rear.pmx`: 青いPanel B（130/0）の1面・2三角形。Panel Aの奥に重なる。
- 全材質は普通の名前でLuminous presetなし。texture、追加UV、物理、toon、edgeなし。
- `ShininessOff`: Panel Aだけshininessへ−50を加算。weight1で80となる。
- `AlphaOff`: Panel Aだけalphaへ−1を加算。weight1で非表示となる。
- `Alpha35`: Panel Aだけalphaへ−0.65を加算。Classicでshininess消灯とLightOff消灯を比較する。
- `FrontAway`: Panel Aの4頂点をXへ−6移動する。
- `LightOff`: ゼロ変位の頂点モーフ。前面モデルだけを消灯し、別モデルの青い板は発光を続ける。

消灯した前面が黒い遮蔽物として残る条件と、alpha0/移動により奥が見える条件を分けて確認できる。RCは普通名の材質を自動光源にしない従来条件の確認にも使う。
