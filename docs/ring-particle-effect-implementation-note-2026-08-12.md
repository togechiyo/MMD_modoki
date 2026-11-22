# 環状光粒エフェクト 実装メモ（2026-08-12）

## 現行仕様（2026-11-22）

FrameGraph の追加メニューで「パーティクル」を複数回選べる。1 個につき色は 1 色で、初期値は白。異なる色を使うときは個体を重ねる。粒子数・密度・サイズ・速度・発光強度・表示の切替も個体別に調整できる。

各個体は scene color に 1 組のメッシュ・材質で描画する。保存した個体 ID から粒子の配置を決め、同じ設定の個体を追加しても別の場所に粒子が現れる。シークや再読み込みでは同じフレームの配置を再現する。個体の設定と順序は他のエフェクトと共通の `effects.frameGraphInstances` に保存する。

従来の `effects.ringParticles` は単独のエフェクトとして復元する。2 色・3 色指定で保存された場合は主色（`colorA`）を引き継ぎ、次回の保存では `color` にまとめる。

Windows の Electron E2E で、WebGPU の赤・青の個別表示、保存と再読み込み、PNG 連番と WebM の同時刻の描画を確認した。WebGL2 では旧 2 色・3 色ファイルを開き、旧主色と新しい個体の色が共存し、マスター切替で両方が消灯・復帰した。パーティクルと AA のみの状態ではカメラ FXAA が働き、全画面の FrameGraph は割り当てられなかった。

### 連番PNGとWebMの粒の位置

WebGPUで赤・青の2個体を豆腐モデルの周りに置き、個体IDを固定して320×180・30 fpsで書き出した。WebMの0・1・6・12・17・18・24フレームを静止状態で復号し、連番PNG 25枚と比較した。全画面でも、赤・青の粒が写った画素に絞っても、7枚すべてで同じフレーム番号のPNGが最も近かった。

18フレーム目で、赤または青が他の2成分より24階調を超えて強かった画素は、PNGで赤184・青682、VP8のWebMで赤152・青558。2個体をともにオフにするとPNG・動画とも該当画素は0だった。以前の比較では毎回異なる粒の配置で、再生を再開した動画の1枚を先頭と18フレーム目のPNGに照合しており、一度は先頭が近いと判定した。回帰テストでは出力用プロジェクトの粒の配置を揃え、動画の先頭と18フレーム目の両方を使って移動を検査する。[パーティクルの出力テスト](../test/e2e/ring-particles.spec.mjs)

## 目的

モデルのすぐ近くを密に覆わず、ワールド原点の周囲を薄いドーナツ状に囲う、ゆっくり漂って点滅する光粒を追加した。

海エフェクトで得た「複雑な状態更新を FrameGraph 内へ抱え込まない」「MMD のシークで同じ絵へ戻れることを優先する」という知見を転用している。

## 実装方式

初版では Babylon.js の状態依存 Particle System や Compute Shader を使わず、二枚の billboard plane を thin instance で描画する。

- 粒子ごとの固定 seed は index から生成する。
- 位置、上下動、周回、明滅、大きさを `MMD frame / 30` から直接計算する。
- 過去フレームから状態を積分しないため、`120 -> 240 -> 120` のようにシークしても同じ配置へ戻る。
- 2 色を二つの instance batch に分け、通常描画は 2 draw 程度に抑える。
- soft radial RGBA texture は起動時に生成し、外部画像 asset を増やさない。
- scene geometry と同じ depth test を使い、物体の裏側では隠れる。depth write は無効にして半透明同士の破綻を抑える。

## FrameGraph 簡易エフェクト化

独立した「粒子」タブは廃止し、FrameGraph の追加メニューとスタックへ「漂う光粒」を配置した。これはポストプロセスそのものではなく、FrameGraph の scene color より前に描く scene-space helper だが、簡易映像効果として他の FrameGraph エフェクトと同じ場所から追加、表示切替、保存できる。

詳細 UI は用途を絞り、次の 7 項目だけを公開する。

- 粒子数
- 粒子密度
- 粒子サイズ
- 粒子速度
- 発光強度
- 主色
- 副色

密度は内部の中心半径、環の幅、上下幅をまとめて制御する。Luminous 連動チェックは廃止し、粒子を常に AutoLuminous 対象として扱う。Luminous がスタックにある場合だけ後段の発光マスクへ入り、ない場合も通常の emissive / alpha blend 粒子として描画する。

## 配置

詳細 UI はほかの FrameGraph エフェクトと同じ 0～100 の共通目盛りで表示する。初期値は次のとおり。

- 粒子数: 50（内部値 180）
- 粒子密度: 50（内部値 32.5）
- 粒子サイズ: 30（内部値 0.335）
- 粒子速度: 10（内部値 0.05）
- 明滅: 0.30（内部固定）
- 発光強度: 100（内部値 4.00）
- 主色: シアン `#00cccc`
- 副色: 白 `#ffffff`

中心半径より内側には入れず、モデル付近を空ける。公開した密度スライダーから内部の半径、環幅、上下幅をまとめて変更できる。

## Luminous 連動

粒子 material は常に既存の AutoLuminous 対象とする。FrameGraph スタックへ Luminous も追加した場合は Luminous mask を通して発光し、Luminous がない場合は emissive / alpha blend の有色コアだけを表示する。粒子側の発光強度と、Luminous 側の後段発光強度は独立して調整できる。

Luminous mask 側は粒子専用パスを追加せず、thin instance の実際の行列と soft alpha texture を既存 replacement material が利用する。このため二重描画や別 mask texture を増やしていない。

粒子は「指定色」と「発光強度」を分離して扱う。RGB へ強度を直接乗算すると、後段 Luminous の発光と重なって色相が白飛びする。また加算合成は白背景で色を表現できない。そのため粒子本体の RGB は指定色の 0..1 を保持した alpha blend の有色コアとし、強度は alpha と後段 Luminous で表現する。粒子の Luminous core も白へ寄せず、指定した主色 / 副色の色相を維持する。

## UI と保存

- Effect panel の独立した「粒子」タブは使わず、FrameGraph の追加メニューとスタックへ統合した。
- 粒子数、密度、サイズ、速度、発光強度、2 色を編集できる。
- `effects.ringParticles` として project 保存 / 読み込み対象にした。
- 古い project に設定がない場合は無効状態の初期値へ戻す。
- 粒子 runtime は scene-space のまま維持し、FrameGraph の Luminous を追加した場合だけ既存 mask 経路へ参加する。

## 確認結果

- pure helper unit test
  - 同じ index / frame で同じ位置へ戻る。
  - 粒子が中心半径より内側へ入らない。
  - seed hash が固定かつ十分に分散する。
  - 発光強度を最大にしても指定色の色相が白へ潰れない。
  - FrameGraph Luminous mask へ通しても粒子の色相を維持する。
- project serializer / importer test: 37 tests pass
- lint: pass
- Electron Playwright / WebGPU
  - 豆腐 PMX を読み込める。
  - 粒子 ON / OFF で export surface checksum が変わる。
  - Luminous を FrameGraph stack へ追加した状態で描画できる。
  - frame 120 と 240 で描画結果が変化する。
  - WebGPU validation warning は 0 件。

`smoke:launch` は sandbox 内では GPU process / log file access が拒否され失敗したが、同じ WebGPU 起動を権限制限外の Electron Playwright で確認している。

## 今後の候補

- model / bone 追従 emitter
- camera-relative dust preset
- depth fade と DoF 順序の追加評価
- 粒子数がさらに多い場合の Compute Shader ping-pong buffer
- turbulence / collision が必要になった時点で Compute 方式へ移行

Compute 化する場合も、fixed step、seed、seek reset、project 保存を先に仕様化し、単純な漂いまで状態依存にしない。
