# 顔まわり・透過テクスチャ調査メモ 2026-06-27

## 背景

DDS テクスチャの CPU decode fallback により、WebGPU 環境でも DDS を含むモデルを読み込めるようになった。
ただし、Tda式重音テトTypeS.pmx や別モデルで、顔、目、前髪、まつげ、目ハイライトなどの透過表現が MMD/PMXE と一致しない問題が残っている。

この現象は DDS だけではなく、BMP/TGA など別形式のテクスチャでも似た形で起きる。
そのため、単純な DDS decode 問題ではなく、PMX 材質の alpha、テクスチャ alpha、babylon-mmd の alpha evaluation、描画順の組み合わせを疑う段階に入っている。

## 重要な前提

PMX 材質の `diffuse[3]` は、材質全体にかかる非透過度/alpha と考える。
これは「その材質が透過テクスチャを使うかどうか」ではない。

したがって、`diffuse[3] === 1` の材質でも、テクスチャの alpha チャンネルで髪、まつげ、目ハイライト、顔周辺のグラデーションを抜くケースがある。
今回のログでも、`pmxDiffuseAlpha: 1` かつ `diffuseHasAlpha: true` の材質が複数あり、その一部が Babylon 側で `opaque` のままになっている。

整理:

- PMX 非透過度 < 1: 材質全体が半透明。
- PMX 非透過度 = 1 かつ texture alpha あり: UV 領域によって切り抜き/グラデーション透過が必要な場合がある。
- texture alpha なし: 原則不透明。

PMX 非透過度だけで `OPAQUE` 判定するのは危険。

## 観測している症状

- Tda式重音テトTypeS の顔、目、`eye_hi`、髪まわりで透過表現が崩れる。
- 目ハイライトやまつげで、黒い背景やアトラス内の別パーツが見えることがある。
- `ALPHATEST` 寄せでは透過グラデーションが潰れやすい。
- `ALPHABLEND` 寄せでは描画順、髪、裏面の重なりが崩れやすい。
- 別モデルでも、前髪や顔まわりの透過テクスチャで似た問題が出る。

## 現在見えているログ上の傾向

Tda式重音テトTypeS:

- `顔`, `目`, `eye_hi` が `face2+4.dds` を参照。
- `pmxDiffuseAlpha: 1` でも `diffuseHasAlpha: true`。
- 一部が `opaque` / `useAlphaFromDiffuseTexture: false` のまま残る。
- `eye_hi` は暫定ヒューリスティックで `alphatest` に寄せると改善はあるが、MMD 表示とはまだ異なる。

別モデル:

- `前髪`, `前髪横1`, `前髪横2` などが alpha ありテクスチャを参照しているのに `opaque` のまま残る例がある。
- `黒目` などは `alphablend` になる場合もあり、モデルや材質ごとに判定差がある。

## 疑っている原因

### 1. texture alpha あり材質が opaque のまま残っている

現時点で最も疑わしい。

PMX 非透過度は 1 でも、実際のテクスチャには alpha があり、UV 領域によって切り抜きやグラデーションが必要な材質がある。
この材質が Babylon 側で `opaque` のままだと、アトラス内の黒い背景や別パーツが見える。

### 2. babylon-mmd の alpha evaluation と fallback texture の噛み合わせ

babylon-mmd には、テクスチャをジオメトリ上で評価して `opaque / alphatest / alphablend` を判定する仕組みがある。
MMD_modoki 側で DDS fallback や材質補正を入れたことで、以下のいずれかが起きている可能性がある。

- fallback texture に対して alpha evaluation が正しく実行されていない。
- evaluation 後の `transparencyMode` を後段補正で上書きしている。
- ロード直後の評価結果が、モーフ後の顔まわり表示に合っていない。
- texture 全体には alpha があるが、材質 UV 領域だけ見ると不透明、またはその逆のケースを拾えていない。

### 3. 表情モーフの影響

顔、目、まつげ、目ハイライトは表情モーフで頂点位置や重なりが変わりやすい。
ロード時の初期形状だけで alpha evaluation した結果が、モーフ後の表示に合わない可能性がある。

## 追加したログ

`src/assets/model-asset-service.ts` に、PMX 材質情報と Babylon material state を比較する診断ログを追加した。

主なログ:

- `suspicious material alpha diagnostics`
- `alpha texture kept opaque candidates`

`alpha texture kept opaque candidates` は、特に次の条件を拾う。

- `diffuseTexture.hasAlpha === true`
- `useAlphaFromDiffuseTexture !== true`
- Babylon 側の `transparencyMode` が `opaque` 相当

出力する情報:

- PMX 材質名 / index
- PMX diffuse alpha
- PMX 両面描画フラグ
- texture path
- Babylon transparency mode
- `useAlphaFromDiffuseTexture`
- `alphaCutOff`
- `forceDepthWrite`
- `mesh.alphaIndex`
- `renderingGroupId`

次の調査では、このログに出た材質を alpha evaluation 再適用や限定補正の対象候補にする。

## 暫定対応の方針

現時点では、材質名だけで大きく補正するのは危険。
モデル差が大きいため、次の順で絞る。

1. `alpha texture kept opaque candidates` で問題材質を抽出する。
2. texture alpha と材質 UV 領域の関係を確認する。
3. babylon-mmd の alpha evaluation を再利用できるか確認する。
4. 再利用できない場合だけ、MMD_modoki 側で限定的な材質補正を入れる。

補正候補:

- texture alpha あり、かつ実 UV 領域にも alpha がある材質だけ `ALPHATEST` / `ALPHABLEND` / `ALPHATESTANDBLEND` に寄せる。
- 髪やまつげなどグラデーションが必要な材質は `ALPHABLEND` 寄りを検討する。
- 目ハイライトは描画順の影響が強いため、別途 `alphaIndex` / depth write の扱いを確認する。

## 2026-06-27 暫定補正

`alpha texture kept opaque candidates` で確認できた材質に対して、限定的な後段補正を入れた。

対象条件:

- diffuse/albedo texture に alpha がある。
- `useAlphaFromDiffuseTexture` / `useAlphaFromAlbedoTexture` が有効ではない。
- Babylon 側の `transparencyMode` が `opaque` 相当。
- 材質名または texture path が顔、目、髪、まつげ、目ハイライト系に見える。
- DDS fallback 材質では `face`, `hair`, `eye`, `lash`, `HS` などの texture/material 名を補助判定に使う。

適用内容:

- `alpha = 1`
- `useAlphaFromDiffuseTexture = true`
- `useAlphaFromAlbedoTexture = true`、albedo texture がある場合のみ
- `transparencyMode = MATERIAL_ALPHATESTANDBLEND`
- `alphaCutOff = 0.02`
- `forceDepthWrite = true`

`ALPHATESTANDBLEND` に寄せた理由:

- 透過グラデーションを単純な `ALPHATEST` で切り捨てないため。
- 完全透明ピクセルが `ALPHABLEND + forceDepthWrite` で深度だけを書いて、裏の目や顔を抜いてしまうのを避けるため。
- 目ハイライト、髪、まつげのような薄いグラデーションが多い材質で破綻しにくくするため。

追加ログ:

- `opaque alpha texture material fallback applied`

このログが出た材質は、今回の後段補正が実際に適用された材質。
次の実機確認では、Tda式重音テトTypeS の `顔`, `目`, `eye_hi`, `新規材質1` と、シァンユェの前髪/後髪系を重点確認する。

### 2026-06-28 追加確認

Tda式重音テトTypeS の DDS を直接確認したところ、alpha 分布は次の通りだった。

- `face2+4.dds`: DXT3。alpha 0 から 255 まであり、透明/半透明領域を持つ。
- `hair_MikuAp2+.dds`: DXT3。alpha は全ピクセル 255 で、実質不透明。

そのため、材質名が `hair` / `HS` であることだけを理由に DDS を alpha あり扱いするのは誤り。
DDS fallback texture の metadata に `mmdModokiDecodedDdsHasAlpha` を保存し、後段補正ではこの実測値を優先するようにした。

これにより、`hair_MikuAp2+.dds` を使う髪/前髪影系を不要に透明キューへ入れる副作用を避ける。

## 非スコープ

- 透過ソートの全面再設計。
- renderingGroup の大規模整理。
- PMX 材質 UI の新設。
- モデルデータの修正。
- 材質名だけに依存した広範囲の固定プリセット化。

## メモ

今回の問題は「テクスチャを読めない」段階から、「MMD の顔まわり透過表現を Babylon/WebGPU 上でどう再現するか」の段階へ進んでいる。
v0.2 では完全解決を急ぐより、主要モデルで破綻しにくい限定補正と、原因追跡できるログを整えるのが現実的。
### 2026-06-28 32bit BMP alpha fallback

別モデルの顔まわりでも同系統の透過不具合が出たため、実ファイルを直接確認した。

- `t007.bmp`: 32bit BMP。alpha は 211-255 で、薄い前髪影/グラデーション用途と見られる。
- `t038.bmp`: 32bit BMP。alpha は 0-156 で、強い抜き/半透明用途と見られる。
- PMX 材質の非透過度が 1 でも、テクスチャ alpha で抜く MMD モデルがある。
- ブラウザ/Babylon の通常 BMP 読み込みでは、この 32bit BMP alpha が描画へ渡らない可能性が高い。

対応:

- `src/scene/bmp-texture-compat.ts` を追加し、32bit/BI_RGB BMP だけを CPU で BGRA から RGBA に展開する。
- WebGPU の MMD texture loader 経路で、alpha を持つ 32bit BMP だけ `RawTexture` に差し替える。
- alpha を持たない BMP、24bit BMP、未対応圧縮 BMP は従来の Babylon 読み込みへ戻す。
- 診断ログに `decodedBmp`、`needAlphaBlending`、`needAlphaTesting`、`alphaTestTexture` を追加した。

次の確認:

- `32-bit BMP texture decoded on CPU for WebGPU alpha` が出るか。
- `前髪` / `アイシャドウ` などで `decodedBmp: true` になるか。
- Babylon 側の `needAlphaBlending` / `needAlphaTesting` が true になり、実表示で顔まわりの白塗りや固い影が減るか。

### 2026-06-28 試行メモ: BMP alpha + forceDepthWrite=false は不採用

試したこと:

- `decodedBmp: true` になった BMP alpha 材質について、`transparencyMode = MATERIAL_ALPHABLEND` のまま `forceDepthWrite = false` に倒した。
- 対象は `前髪`, `前髪横１`, `前髪横２`, `アイシャドウ` など。
- 目的は、alpha blend は有効なのに見た目が固い原因が depth write にあるかを切り分けること。

ログ上の状態:

- `decodedBmp: true`
- `diffuseHasAlpha: true`
- `useAlphaFromDiffuseTexture: true`
- `needAlphaBlending: true`
- `needAlphaBlendingForMesh: true`

結果:

- 表示は変化したが、MMD/PMXE の見た目には近づかなかった。
- 髪や重なりが薄く抜けすぎ、半透明面の重なり順が崩れた。
- `forceDepthWrite=false` は少なくともこの系統の MMD 材質には広く適用できない。

### 2026-06-28 追加確認: alpha debug shader

確認用に `alpha_texture_debug.wgsl` を追加し、対象材質の baseColor alpha をグレースケール表示できるようにした。

呼び出し:

- `window.mmdModokiDebug.enableAlphaTextureView()`
- `window.mmdModokiDebug.disableAlphaTextureView()`

確認できたこと:

- Tda式重音テトTypeS の `目`, `eye_hi`, `hairshadow` で `face2+4.dds` の alpha が shader まで届いている。
- シァンユェ側の BMP/TGA alpha 材質でも alpha が shader まで届いている。
- したがって、少なくとも確認した範囲では「alpha チャンネルが完全に欠損している」段階ではない。

残る疑い:

- alpha を使う材質が深度を書いてしまい、後続の顔/目/ハイライト/髪影を潰している。
- 材質ごとの描画順、`forceDepthWrite`、`transparencyMode` の組み合わせが MMD の顔まわり表現と合っていない。
- 全透明材質へ一律に `forceDepthWrite=false` を入れると別の破綻が出るため、対象をかなり絞る必要がある。

### 2026-06-28 暫定補正: 顔まわり overlay 材質だけ depth write を外す

広域な `forceDepthWrite=false` は不採用だったため、次の条件に絞って後段補正を追加した。

対象条件:

- diffuse/albedo texture に alpha がある。
- 材質名または texture path が `eye_hi`, `hairshadow`, `highlight`, `lash`, `アイシャドウ`, `頬紅`, `口紅`, `ハイライト`, `まつげ` などの顔まわり overlay に見える。
- または CPU decode 済み texture の alpha range が `maxAlpha <= 220` で、低 alpha の overlay 用途と見られる。

適用内容:

- `alpha = 1`
- `useAlphaFromDiffuseTexture = true`
- `useAlphaFromAlbedoTexture = true`、albedo texture がある場合のみ
- `alphaCutOff = 0.02`
- `transparencyMode = MATERIAL_ALPHABLEND`
- `forceDepthWrite = false`

追加ログ:

- `alpha overlay depth-write patch applied`

注意:

- これは根本的な透過ソート再設計ではなく、MMD の顔まわり overlay 材質に限定した暫定補正。
- 髪本体や半透明衣装などへ広げると副作用が大きい。
- 次の実機確認では、Tda式重音テトTypeS の `eye_hi` / `hairshadow` と、シァンユェの `アイシャドウ` / `頬紅` / `口紅` を重点確認する。

判断:

- この実験差分は戻した。
- MMD 寄せの描画順としては `forceDepthWrite=true` が必要なケースがある。
- 問題の主因は depth write だけではなく、BMP alpha 値の解釈、alpha 採用対象の絞り込み、または MMD 材質 shader 側の最終 alpha 計算にありそう。

次に見る候補:

- 32bit BMP の 4byte 目を常に alpha として扱うのが正しいか。
- `t007.bmp` のように alpha が 211-255 に偏る薄い影テクスチャを、MMD/PMXE がどう扱っているか。
- 32bit BMP すべてを alpha 採用すると靴などにも `decodedBmp: true` が出るため、材質名/PMX フラグ/alpha 分布で対象を絞る必要がある。
- TGA / DDS / BMP で同じ補正を使うべきか、形式ごとに分けるべきか。

### 2026-06-28 現時点の原因候補整理

今回の調査で、最初に疑っていた原因のいくつかはかなり潰せた。
ただし、Tda式重音テトTypeS の `eye_hi` / `hairshadow` や、別モデルの顔まわり透過はまだ MMD/PMXE 表示へ完全には寄っていない。

#### ほぼ潰した原因

- DDS ファイルが読めていない:
  - WebGPU では compressed DDS を CPU decode fallback するようにした。
  - `face2+4.dds`, `hair_MikuAp2+.dds`, `tdatest*.dds` などはログ上 decode できている。
- DDS の alpha が完全に欠損している:
  - alpha debug shader で `face2+4.dds` の alpha は shader まで届いている。
  - 訂正: `face2+4.dds` は実ファイル上 `minAlpha: 0, maxAlpha: 255` の alpha を持つ。以前の `238..255` は DDS/DXT decode 短絡バグによる誤った runtime metadata だった。
- 32bit BMP alpha がまったく読めていない:
  - `t007.bmp`, `t038.bmp`, `t039.bmp`, `t044.bmp` などは CPU decode できている。
  - alpha range もログに出せている。
- texture alpha が shader に渡っていない:
  - alpha debug shader で DDS/BMP/TGA の alpha 到達は確認できた。
- `forceDepthWrite=false` を全体に入れれば直る:
  - 表示は変わったが、髪や半透明面の重なりが崩れ、MMD/PMXE には近づかなかった。
  - 全透過材質へ一律適用する方針は不採用。
- モデル表示停止の主因が missing sphere texture:
  - `sph/body01_s.bmp` の missing は出ているが、スキップ後にモデルは表示される。
  - 表示崩れの主因ではなさそう。

#### まだ疑わしい原因

- babylon-mmd の PMX material builder と MMD 本体の材質解釈差:
  - PMX の非透過度、texture alpha、sphere/toon、セルフ影、エッジ、両面描画の組み合わせが MMD と一致していない可能性がある。
- 描画順 / transparent queue / `meshAlphaIndex`:
  - 顔、目、目ハイライト、髪影は重なり順の影響が強い。
  - `ALPHABLEND`, `ALPHATESTANDBLEND`, `forceDepthWrite` の組み合わせだけでは MMD と同じ見た目にならない。
- DDS/DXT3 の色側 decode または MMD/DirectX との差:
  - 訂正: `face2+4.dds` の alpha はほぼ不透明ではなく、DXT3 alpha を持つ。黒や白の出方の主因候補は RGB 側ではなく、DDS/DXT decode 短絡バグだった。
  - premultiplied alpha 的な扱い、sRGB/linear、DXT 展開差も未確認。
- texture alpha の「ファイル全体」ではなく「材質 UV 領域」での評価:
  - texture 全体に alpha があっても、該当材質の UV 領域ではほぼ不透明/半透明/完全透明が異なる。
  - babylon-mmd の alpha evaluation が fallback texture やモーフ後形状と噛み合っていない可能性がある。
- 表情モーフ・頂点移動による顔まわりの重なり変化:
  - 目、まつげ、目ハイライト、前髪影はモーフや頂点順で見た目が変わりやすい。
  - ロード時の材質判定だけでは不十分な可能性がある。
- 32bit BMP alpha の扱い:
  - 4 byte 目を alpha として読めるケースは確認した。
  - ただし MMD/PMXE がその alpha をどの材質でどう使っているかはまだ未確定。
  - `t007.bmp` のような 211-255 の薄い alpha をそのまま blend してよいかは要検証。

#### 次に見るなら

- `eye_hi` と `hairshadow` だけに対象を絞り、PMX 材質値、texture sample、Babylon material state、MMD/PMXE 表示を横並びで比較する。
- `face2+4.dds` の該当 UV 領域を抽出し、実際に読んでいる RGB/alpha を確認する。
- `meshAlphaIndex` / rendering order / transparent queue の実順序をログ化する。
- babylon-mmd の material builder / alpha evaluation の実装を、該当材質だけ一次情報として追う。
- 暫定補正を増やす前に、問題材質 1 つだけの再現 shader / debug view を作る。

### 2026-06-28 babylon-mmd material builder の確認

`babylon-mmd@1.2.0` の `MmdStandardMaterialBuilder` / `StandardMaterialBuilderBase` / `TextureAlphaChecker` を確認した。

重要な実装:

- `MmdStandardMaterialBuilder` は `StandardMaterialBuilderBase` を継承している。
- MMD_modoki では `MmdModelLoader.SharedMaterialBuilder.renderMethod` を `DepthWriteAlphaBlendingWithEvaluation` に設定している。
- `DepthWriteAlphaBlendingWithEvaluation` は、texture alpha evaluation で不透明かどうかを判定し、不透明でない場合だけ `MATERIAL_ALPHABLEND` と `forceDepthWrite=true` にする。
- `DepthWriteAlphaBlending` は全材質を `ALPHABLEND + forceDepthWrite=true` に寄せる。コメント上は「MMD と同じ結果に近いが draw order 管理が必要」とされている。
- `AlphaEvaluation` は `opaque / alphatest / alphablend` を評価するが、`forceDepthWrite` を使わないため MMD と違う結果になる可能性がある、とコメントされている。

気になる点:

- `TextureAlphaChecker` は render target に対象 geometry の texture alpha を描画し、`readPixels` の結果で透明度を判定している。
- WebGPU、RawTexture fallback、DDS/BMP CPU decode texture、RTT/readPixels の組み合わせで、alpha evaluation が MMD 想定とズレる可能性がある。
- `DepthWriteAlphaBlendingWithEvaluation` の設計自体は MMD 寄せだが、評価がズレると「本来 alpha/depth 対象にしたい材質が opaque 扱い」またはその逆になり得る。
- MMD_modoki 側の後段補正で `forceDepthWrite=false` を入れると、babylon-mmd が MMD 寄せのために選んだ `forceDepthWrite=true` 方針と衝突する可能性がある。

現時点の見立て:

- material builder はかなり疑わしい。
- ただし builder が単純に間違っているというより、fallback texture と alpha evaluation の組み合わせ、または MMD_modoki 側の後段補正との干渉が疑わしい。
- 次は `eye_hi` / `hairshadow` の builder 評価結果、`evaluatedTransparency`、`TextureAlphaChecker` の判定結果を直接ログ化するのがよい。
### 2026-06-28 追記: DDS/DXT デコード短絡バグを確認

ユーザー確認では `face2+4.dds` 単体に明らかなアルファが見えていたが、MMD_modoki のログでは `minAlpha: 238, maxAlpha: 255` と出ており、実質ほぼ不透明として扱われていた。

実ファイルを直接スキャンした結果:

- `face2+4.dds` は DXT3 / 1024x1024 / mipmap 11。
- base mip の DXT3 alpha block には `minAlpha: 0, maxAlpha: 255` が存在する。
- つまり「テクスチャにアルファがない」のではなく、MMD_modoki 側の DDS fallback decode 結果が間違っていた。

原因:

- `decodeDxt1`, `decodeDxt3`, `decodeDxt5` のブロックループで `hasAlpha ||= decode...()` を使っていた。
- JavaScript/TypeScript の `||=` は左辺が truthy になると右辺を評価しない。
- そのため、最初に alpha を検出した後のブロックでは `applyDxt3Alpha` / `applyDxt5Alpha` / `decodeDxtColorBlock` 自体が呼ばれず、後続ブロックの alpha 適用がスキップされていた。
- Tda式重音テトTypeS の `face2+4.dds` ではこの影響で後続ブロックの透明 alpha が反映されず、ログ上 `238..255` のような誤った alpha range になっていた。

修正:

- 各ブロックの decode/apply 関数は必ず呼び出し、その戻り値だけを `hasAlpha = hasAlpha || blockHasAlpha` で集約するように変更。
- 複数 DXT3 ブロックで、最初のブロックが半透明、後続ブロックが完全透明のケースを単体テストに追加。

確認:

- 修正後に `face2+4.dds` を現行 decoder で直接読むと `minAlpha: 0, maxAlpha: 255` になる。
- `npm.cmd run test:unit` 成功。
- `npm.cmd run lint` 成功。

注意:

- これは「DDS alpha が欠損していた」問題の根本原因候補としてかなり強い。
- ただし MMD/PMXE と完全に同じ見た目になるかは、babylon-mmd material builder の alpha 判定、描画順、`forceDepthWrite`、face/eye/hairshadow の material state も引き続き確認が必要。
- 次回実機確認では、`compressed DDS texture decoded on CPU for WebGPU` の `face2+4.dds` が `minAlpha: 0, maxAlpha: 255` になること、`MMD texture alpha evaluation result` が `opaque` から変わるかを確認する。
## 解決サマリ 2026-06-28

Tda式重音テトTypeS.pmx の顔まわり、目ハイライト、前髪影などで透過テクスチャが正しく抜けず、不透明な板や黒い影のように見えていた問題は、DDS/DXT の CPU decode fallback の不具合が主因だった。

ユーザー確認では `face2+4.dds` 単体に明らかな alpha が見えていた。一方、MMD_modoki のログでは `minAlpha: 238, maxAlpha: 255` と出ており、実質ほぼ不透明として扱われていた。実ファイルを直接スキャンすると `face2+4.dds` は DXT3 / 1024x1024 で、base mip に `minAlpha: 0, maxAlpha: 255` の alpha が存在した。

原因:

- `decodeDxt1`, `decodeDxt3`, `decodeDxt5` のブロックループで `hasAlpha ||= decode...()` / `hasAlpha ||= apply...()` を使っていた。
- JavaScript/TypeScript の `||=` は左辺が truthy になると右辺を評価しない。
- そのため、最初に alpha を検出した後のブロックでは decode/apply 関数自体が呼ばれず、後続ブロックの alpha 適用がスキップされていた。
- `face2+4.dds` ではこの影響で透明部分が反映されず、MMD_modoki 側の decoded texture metadata が誤って `238..255` のように記録されていた。

修正:

- 各 DXT ブロックの decode/apply 関数は必ず呼び出す。
- その戻り値だけを `hasAlpha = hasAlpha || blockHasAlpha` で集約する。
- 複数 DXT3 ブロックで後続ブロックの alpha が 0 まで反映される単体テストを追加した。

確認結果:

- 修正後、実 `face2+4.dds` を現行 decoder で直接読むと `minAlpha: 0, maxAlpha: 255` になる。
- ユーザー実機確認で Tda式重音テトTypeS の顔まわり透過が改善した。
- `npm.cmd run test:unit` 成功。
- `npm.cmd run lint` 成功。

再発リスク:

- DDS/DXT1/DXT3/DXT5 については今回の短絡バグを修正したため、同じ原因での再発リスクは下がった。
- ただし画像形式ごとに読み込み経路が異なるため、別形式では別原因で再発する可能性がある。
- PNG/JPEG は基本的にブラウザ/Babylon の標準画像デコードに寄るため、今回のような自前 DXT decode バグは起きにくい。
- DDS は WebGPU + S3TC 非対応環境で MMD_modoki の CPU fallback を通るため、今後も DXT mipmap、DX10 header、BC 系形式などで追加確認が必要。
- 32bit BMP は MMD_modoki 側の fallback decode を追加しているため、BMP header、BGRA/RGBA、alpha 有無判定で別問題が出る可能性がある。
- TGA は形式差、上下反転、alpha depth、RLE 圧縮などの確認余地が残る。
- 形式横断で見るべき観点は「実ファイルの alpha range」「fallback decode 後の metadata」「babylon-mmd material builder の alpha evaluation」「最終 material state」「描画順 / depth write」。
## 2026-06-28 追記: 32bit BMP の白にじみ対策

シァンユェ(香月) Ver1.05 軽量版の `頬紅` 材質で、`t044.bmp` の透過グラデーションが MMD/PMXE と違って白っぽく見える問題を確認した。

確認結果:

- `t044.bmp` は 32bit BMP / 512x512 / BI_RGB。
- 実ファイルおよび fallback decode 後の alpha range は `minAlpha: 0, maxAlpha: 255`。
- `頬紅` 材質には `t044.bmp` が割り当たっている。
- material builder 後および後段補正後、最終的に `alphablend`, `useAlphaFromDiffuseTexture: true`, `forceDepthWrite: false` まで入っている。
- したがって「BMP alpha が読めていない」「材質が opaque のまま」という問題ではなさそう。

追加で実ファイルの RGB/alpha 分布を確認したところ、`alpha=0` のピクセルは平均 RGB `[255,255,255]` で、透明領域が真っ白だった。さらに `alpha=1..16` の低アルファ帯もほぼ白だった。

このようなテクスチャでは、GPU の bilinear filtering 時に透明側の白 RGB と頬色 RGB が補間され、alpha は効いていても境界に白っぽいにじみが出る。これは alpha 欠損ではなく、透明ピクセル側 RGB の bleed 問題と見なす。

対応:

- 32bit BMP fallback decode 後、alpha 値は変更せず、低アルファピクセルの RGB だけを近傍の高アルファピクセル色で補う処理を追加。
- さらに、透明領域と低アルファ領域が白い BMP は、白背景へ合成済みの straight alpha 画像と見なし、RGB だけを white matte 解除する。
- 対象は `alpha < 128` のピクセル。
- 補色元は `alpha >= 128` のピクセル。
- 最大 16 iteration の局所的な色拡張で、遠い完全透明背景全体を塗りつぶすのではなく、境界付近の白にじみを抑える目的。

確認:

- `t044.bmp` の `alpha=1..16` 帯の平均 RGB は、補正前のほぼ白から、より頬色に近い値へ寄った。
- `npm.cmd run test:unit` 成功。
- `npm.cmd run lint` 成功。

注意:

- alpha 値は変えていないため、透過グラデーション形状そのものは保持される。
- ただし 32bit BMP 全般へ効く補正なので、透明領域の RGB を意図的に使う特殊テクスチャがあれば見た目が変わる可能性がある。
- 実機では `頬紅` / `アイシャドウ` / 前髪影など、白背景 alpha BMP の境界に白にじみが減るか確認する。

2026-06-29 追記:

- シァンユェ(香月) Ver1.05 軽量版で、顔まわりの白っぽいフチが大きく改善したことをユーザー実機で確認した。
- 対応は顔材質名の個別対応ではなく、32bit BMP fallback decode の共通処理として整理した。
- 詳細は [BMP alpha transparency investigation 2026-06-28](./bmp-alpha-transparency-investigation-2026-06-28.md) に分離する。

## 2026-08-24 babylon-mmd 標準 alpha 評価への整理

`babylon-mmd@1.2.0` の公式ドキュメントと同梱実装を再確認し、PMX / PMD の透過分類は material builder の結果を正本とするよう整理した。

### 採用する標準経路

- 通常の「評価方式」は `MmdMaterialRenderMethod.DepthWriteAlphaBlendingWithEvaluation` を使う。
- 「MMD固定順（実験）」は `MmdMaterialRenderMethod.DepthWriteAlphaBlending` を使う。
- `TextureAlphaChecker` は材質が参照するジオメトリを UV 空間へ描画し、実際に使う texture alpha から opaque / transparent を判定する。
- 32bit BMP は `RegisterDxBmpTextureLoader()` を登録し、babylon-mmd の DirectX 互換 BMP loader を第一経路とする。

### 撤去した後段補正

material builder の判定後に、材質名または texture 名の `face`、`eye`、`hair`、`頬紅`、`まつげ` などを使って次を再設定していた処理を撤去した。

- `transparencyMode` の `ALPHATESTANDBLEND` / `ALPHABLEND` への変更
- `forceDepthWrite` の強制 ON / OFF
- decoded DDS 材質の一律両面化
- 顔 overlay と推測した材質の shadow caster / receiver 除外
- PMX の材質 alpha が `0` の場合の一律復元

これらはモデルの意味をファイル名・材質名から推測しており、babylon-mmd の UV 領域評価や PMX の材質・影フラグを上書きするため、別モデルへ副作用を広げる可能性があった。

### 維持する互換処理

- DDS は Babylon.js 標準 loader を第一経路とし、S3TC / BC 圧縮を GPU が利用できる場合は自前処理へ入らない。
- S3TC 非対応時だけ DDS header を確認し、既存 decoder が対応する DXT1 / DXT3 / DXT5 を CPU decode fallback する。
- 非圧縮 DDS、DXT1 / DXT3 / DXT5 以外、header 読み取り・fallback decode に失敗した DDS は Babylon.js 標準経路へ戻す。
- Babylon.js 標準 DDS 経路では汎用画像向けの `noMipmap` 判定を適用せず、DDS 内蔵 mip chain と loader の既定判定を保持する。
- 公式 BMP loader が失敗した場合だけ、既存の CPU BMP decode fallback を使う。
- CPU BMP fallback の white matte 解除、透明境界 RGB bleed、alpha range 診断 metadata は fallback 時だけ維持する。
- `.x` アクセサリは babylon-mmd の PMX material builder を通らないため、`.x` 用の Opaque / Alpha Test / Alpha Blend 分類を維持する。
- PMX 材質へ残存する `zOffset` / `zOffsetUnits` と全体 logarithmic depth の解除は、alpha 分類とは独立した従来互換処理として維持する。

### 残る確認

- PNG / TGA / BMP / DDS の cutout、グラデーション透過、不透明 texture を同じ配布可能 fixture で比較する。
- WebGPU / WebGL2 で「評価方式」と「MMD固定順」を比較する。
- 顔、目ハイライト、前髪、衣装透過、両面材質、self shadow をユーザー実機で確認する。
- 公式評価でも外れる材質がある場合は、材質名 heuristic を戻さず、材質単位の明示 override と診断表示を検討する。
