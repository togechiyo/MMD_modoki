# 窓付き部屋の RC GI / 天空遮蔽 fixture

MMD_modoki 用の自作 geometry と白画像。リポジトリと同じ MIT ライセンスで再配布可能。第三者 asset、外部 texture、remote dependency は含まない。

`node scripts/generate-rc-window-room-fixture.mjs` で全ファイルを再生成する。生成後に installed PmxReader とアプリの実際の text `.x` parser / triangulation を CPU 上で呼び、材質ごとの三角形・法線・UV・色を照合する。Electron / GPU は起動しない。PNG / JPEG は既存 Playwright 同梱 codec で生成・decode し、全画素が `[255,255,255,255]` であることを確認する。

| ファイル | 内容 |
| --- | --- |
| `window-room.pmx` | 26三角形、52頂点の部屋。textureなし、1本のセンターボーンだけ |
| `window-room-plain.x` | PMXと同じgeometry・diffuse色。textureなし |
| `window-room-opaque-png.x` | 同じ部屋、全材質に `white.png` を参照 |
| `window-room-opaque-jpg.x` | 同じ部屋、全材質に `white.jpg` を参照 |
| `window-shutter.x` / `window-shutter.pmx` | 同じ2三角形・4頂点の黒い遮光板。textureなし |
| `white.png` / `white.jpg` | 自作8×8白画像。PNGも全画素alpha255 |

## 座標と材質

- 室内は `x=[-6,6], y=[0,6], z=[-6,6]`。床・天井・4壁を持つ。単位は通常の MMD scene 単位。
- 窓は `z=6, x=(-2,2), y=(1.2,4.8)`。窓領域には頂点・面を配置しない実際の開口であり、alpha cutout ではない。壁は開口周囲の4枚に分割する。
- `RoomWhite`: diffuse `[0.8,0.8,0.8]`、24三角形。床は赤タイルを除く4枚に分割し、面積の重複をなくす。
- `RedFloorSource`: diffuse `[0.9,0.025,0.025]`、2三角形。`x=[-1.5,1.5], y=0, z=[1.5,3.5]`。白床と同じ高さで境界だけ接し、z-fightingする重複面はない。発光材質ではなく、方向光を受ける赤い反射面。
- `WindowShutter`: diffuse `[0,0,0]`、窓と同じ `z=6, x=[-2,2], y=[1.2,4.8]`。原点配置で閉鎖、非表示または削除で開口。黒により遮光板自身の色反射を加えずに比較できる。PMXと`.x`の両方を同時に配置しない。
- 全材質 alpha1、specular0、shininess0、emission0。明示法線は室内側を向く。PMXは両面のみの描画flag、toon・edge・shadow-map flag・物理・モーフなし。逆向き重複面は作らない。
- `.x` は各面のUVも持つ。text `.x` parserのV反転を考慮して出力し、読み取り後にPMXと同じUVとなる。白textureなので画像の向きによる色差は生じない。

## 推奨する比較条件

- **このアプリの`.x`読込は内部で10倍されるため、PMXと同じworld寸法にするには部屋・遮光板ともGUIの`Si`を`0.1`へ設定する。** 初期表示の`Si=1`はファイル座標の等倍ではない。テストは変換後の実頂点boundsも照合する。遮光板だけ`Si=1`のままでは窓を閉じた比較にならない。
- 窓を見る水平カメラ: position `(0,2.5,-4)`、target `(0,2.5,6)`。床の受光も見る場合は position `(0,3,-5)`、target `(0,1.5,3)`、FOVは45度程度。位置は部屋の内側。
- Babylon の方向光 `direction=(0,-1,-1)` は、光が `-Y/-Z` へ進む指定。面から光へ向かうrayは `(0,+1,+1)`。赤床の任意点から `z=6` へ進むと `y=2.5..4.5` となり、窓を通る。室内奥の床から同方向へ進むrayは上の壁・天井へ当たる。
- 赤床はGI source、窓下の垂直白壁 `z=6, y=0.2..1.0, x=-1.2..1.2` は赤床へ向くGI receiverにできる。同一平面の赤床→白床はLambertのcosが0となるため、GIの主判定に使わない。Skyは窓近くの白床 `x=-0.6..0.6, y=0, z=3.7..4.3` と奥の白床を比較できる。天井は法線が下向きなので、上向きreceiver向けSky実装の主判定に使わない。
- RC fieldの自動範囲が変化しないよう、開閉は遮光板の表示切替が扱いやすい。部屋だけの厳密boundsは `min[-6,0,-6], max[6,6,6]`。PMX loaderの保守的な追加boundsと混同しない。
- textureなし → 全白JPEG → 全白PNG の順で、同じgeometryとdiffuse色のまま loaderの材質分類を比較できる。PNGも透明画素はないが、現アプリの `.x` loader が拡張子からcutout設定を選ぶ可能性は別の検証対象。
- データを揃えても、PMXと`.x`は読み込み時の既定Toon/ambient/presetなどが異なり得る。fixture自体は既定shaderやシーン全体の影設定を変更しない。同じ受光presetで比較するか、loader既定の差を明示して観測する。

静的検証はファイル内容とgeometry一致の確認であり、GI/Skyの実描画・GUI・出力結果の合格を意味しない。それらは別のElectron/WebGPU確認で行う。
