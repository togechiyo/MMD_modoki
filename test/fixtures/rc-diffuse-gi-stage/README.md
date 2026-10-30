# RC拡散GI fixture

このrepositoryで作成した再配布可能な単純箱モデル。第三者asset・画像・物理は使わない。

- `rc-diffuse-gi-red.pmx`: 白い受光床、赤いsource壁、黒い可動遮光板。
- `rc-diffuse-gi-black.pmx`: geometryは同じで、sourceのdiffuseだけ黒。
- `rc-diffuse-gi-textured-red.pmx`: sourceのdiffuseは白、自作2×2の `source-red.bmp` だけが赤い。GIのtexture samplingを検証する。
- 各36三角形。receiver bounds `[-2,-.2,-3]..[2,0,3]`、source `[-3.2,0,-3]..[-3,4,3]`。
- 光direction `[-1,-1,0]` のとき、source内向面のnormal `+X` が直接光を受ける。
- `光遮蔽板` の `tx=-20` で遮光板を `[-3,5,-4]..[5,5.2,4]` へ移動する。source→lightを覆い、receiver→sourceは覆わない。
- shared toonを使わず、diffuse反射の色を独立に比較する。発光は初期状態に含まない。texture版以外は画像を参照しない。

再生成: `node scripts/generate-rc-diffuse-gi-fixture.mjs`
