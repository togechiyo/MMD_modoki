# 窓付き室内・Xアクセサリの RC GI / 天空遮蔽検証

確認日: 2026-10-31。所有者依頼による、`.x`受光・遮蔽と室内の窓開閉の調査。アプリの描画実装はこの作業で変更しない。

## 再現入力と比較条件

- [自作fixture](../test/fixtures/rc-window-room/README.md): 同じ26三角形の部屋をPMX、textureなしX、完全不透明PNG付きX、白JPEG付きXで用意。黒い遮光板は2三角形。第三者assetなし、MIT。
- [生成器](../scripts/generate-rc-window-room-fixture.mjs): installed PmxReaderと実アプリのX parser / triangulationを使った静的照合、PNG/JPEGの全画素不透明白のdecode確認を含む。
- [Playwright spec](../test/e2e/rc-window-room.spec.mjs): 実Electron/WebGPU、FrameGraph、実験flagなし。ロードだけfixture hookを使い、カメラ、効果ON/OFF、材質preset、主光方向、X倍率、遮光板削除はGUI操作。
- [観測probe](../test/e2e/helpers/rc-window-room-probe.mjs): 材質の受光適否、透明flags、Toon有無、producer状態、BVH三角形数、変換後の実頂点boundsを読む。fieldや材質の書換え・PNG前のGPU readbackは行わない。
- 固定volume `min[-8,-2,-8], size16`、GI強度0.5、Sky強度0.5・最低残光0.2。主光強度0.6、ambient0、physics/ground/skydomeなし。fixture初期状態のraster shadowはOFF。アプリ既定のCSM選択、bias、cascade、影距離は変更しない。
- GI主光は`[0,-1,-1]`。赤床から光へ向かうrayは窓を通る。Skyは影側残光を観測できる水平主光`[0,0,-1]`。保存値と実directionの正規化を区別する。
- カメラposition概ね`[0,3,-5]`、target`[0,1.5,3]`、FOV60度、PNG640×360。
- Xの内部import scaleは10。部屋も遮光板もGUIのSiを0.1にし、world boundsが部屋`[-6,0,-6]..[6,6,6]`、遮光板`[-2,1.2,6]..[2,4.8,6]`であることをassertする。PMXのloader用bounds余白ではなく実頂点で照合する。

各状態で効果OFF→ONの差を計算する。部屋全体の画像差に加え、GIは窓下白壁、Skyは窓近くの白床と奥の白床を測る。赤床自身、窓、遮光板、輪郭はROIから外す。GIは同一平面の床同士では反射のcosが0となるため、白床を主判定にしない。

## 結果

PMX専用ではなく、**opaqueなXはGIの受光・反射入力・遮蔽物に参加した**。ただし、PNG付きXとSkyの既定presetには未対応の条件がある。

次は640×360 PNGの同一ROIのON−OFF平均差。数値は出力の0〜255階調で、物理照度ではない。R値を代表値として示す。presetごとに基礎陰影・ambientが異なるため、形式間の明るさ一致を合格条件にしていない。

| 入力・preset | GI 窓下白壁 R差 | Sky 室内奥の白床 R差 | 判定 |
| --- | ---: | ---: | --- |
| PMX・通常MMD / Toonなし | +33.96 | 0 | GIは可視。Skyは対象判定が通っても減算するToon残光がない |
| PMX・Light & Shadow | +33.96 | −38.98 | 両方可視 |
| X・textureなし・Accessory Toon | +54.90 | 0 | GI可視。Sky受光対象外 |
| X・textureなし・通常MMD | +85.76 | −32.00 | 両方可視 |
| X・全白JPEG・Accessory Toon | +54.90 | 0 | textureなしと同じ結果 |
| X・全白JPEG・通常MMD | 未計測 | −32.00 | Sky可視。GIは既定presetで確認 |
| X・全白PNG・上記両preset | 0（GIは既定presetで計測） | 0 | 全画素opaqueでもalpha-test扱いで対象外 |

PNGのGIは対象材質0・viewなし・`preparing`、Skyは固定volumeでは`ready`でも対象材質0・BVH0三角形。通常MMDへ変えても両方の材質predicateは対象外のままだった。これは未対応を再現する検査の成功であり、PNG対応の成功ではない。

### 窓を開ける・塞ぐ・戻す

窓の開閉では、同じpreset・同じ主光のまま、opaque黒X遮光板を追加・削除する。Sky受光対象外のAccessory Toonの板でも遮蔽物としては働いた。BVH入力は両効果で26→28→26三角形。閉鎖時の板の実頂点座標も検査した。

| 部屋・preset | 開窓GI 白壁 R差 | 閉窓GI 白壁 R差 | 開窓Skyが閉窓より明るい量・窓近傍床R |
| --- | ---: | ---: | ---: |
| PMX・Light & Shadow | +33.96 | +1.97 | +6.14 |
| X・通常MMD | +85.76 | +4.10 | +4.66 |

GIの白壁寄与は閉窓で約94〜95%減少した。Skyも窓近傍で開窓時の方が明るく、室内奥では強い減光を維持した。遮光板削除後はGI・Skyとも開窓時のPNGへ戻った。

ただし、**閉窓でもGIは完全な0にならず、数階調の残留がある**。また今回の白壁主体の室内ではGIはほぼ白い明るさとして現れ、赤床由来の強い色移りは確認できていない。窓下壁の`redExcess = ΔR − (ΔG+ΔB)/2`は開窓PMXで約+0.35、X通常MMDで約−0.16に留まる。赤床を黒床に置き換える対照実験は未実施なので、特定sourceの寄与や残留の原因を断定しない。粗いfieldやcascade補間等の切り分けは別課題。

PNGだけでなく、対応するビューポートのON/OFF画像も保存し、XのGI・Sky双方の変化を目視確認した。GI ONでは窓下や天井との接合部に小さな明暗の筋・三角形状のむらも見える。表示が変わることと、室内照明として十分自然であることは別の判定とする。

## 分かった適用条件

### PNGのX

`src/x-file-loader.ts`の`isAlphaCapableTextureUrl()`と`resolveXMaterialRenderPolicy()`は、PNG/BMP/TGA/WebPを拡張子でcutout扱いする。画像の全alphaが255でも`needAlphaTesting()`がtrueになる。GI・Skyはalpha-test/blend材質を除外するため、このfixtureのPNG版も対象外となる。

受光だけでなくSkyのBVH入力も0三角形になる。PNG-only GIは受光材質0でfield自体を作らず`preparing`となるため、GI遮蔽物からの除外はこのcaseの画素だけからは証明しない。共通source側の透明除外predicateも根拠にする。

### presetとToon

X既定のAccessory ToonはGIの許可presetだが、Skyの受光許可presetではない。Skyは通常MMDまたはLight & Shadowへの変更が必要。対象外材質のopaque形状は、別の受光対象があれば遮蔽物に参加できる。

今回のPMXは意図的にToonなし。Skyの材質predicateは通るが、減算対象のToon影側残光がないため画像差は0だった。Light & ShadowをGUIで適用すると残光が発生し、Skyの比較が可能になる。`適用中`や対象材質数だけでは可視効果の証明にならない。

## 実行方法と証跡

```powershell
node scripts/generate-rc-window-room-fixture.mjs
$env:MMD_E2E_VITE_CACHE_DIR = Join-Path (Get-Location) 'local-references/rc-window-room-verification-2026-10-31/vite-cache'
npm.cmd run test:e2e -- rc-window-room.spec.mjs --output local-references/rc-window-room-verification-2026-10-31/final
```

Electron/WebGPUはGPUを利用できるローカルGUI権限で直列実行する。証跡のPNG、report JSON、trace、cacheはignoredな上記directoryへ置き、Gitに追加しない。

初期試行の`first-pmx`〜`third-pmx`はテストの戻り値判定・画角・Toon条件を調整した経過。`audit-1`はXの内部10倍scaleを補正する前なので、X受光差と窓開閉の結果を品質判定へ使用しない。`audit-2`では実座標をassertし4ケース成功。窓開閉の数値判定・OFF復帰・ビューポート画像を加えた`final`を最終証跡とする。

最終検証:

- `rc-window-room.spec.mjs`: **4ケース成功、約2.5分**。PNG出力48枚、ビューポート画像16枚。PNGの除外条件の再現も含む。
- GI OFF復帰の画像差は全4ケースで0。PMX/Xの遮光板削除後はGI・Skyとも画像差0。
- 全caseでpage error、console error、WebGPU validation errorは0。
- 生成器の静的parser照合・画像decode、対象MJSのESLint、`npm.cmd run lint`、Markdownリンク・`git diff --check`を確認。
- アプリのTypeScript/runtimeを変更しないため、unit全件・typecheck・別の起動smoke・動画出力は再実行していない。今回のGUI/描画確認を動画・別backendの検証へ拡張しない。

## 管理

新fixtureは[テストfixture・ローカル参照asset台帳](./test-reference-asset-ledger.md)の`F-RC-WINDOW`。既存referenceの出典・用途・検証記録も同台帳へ整理した。今回GPUで読み込んだのは自作fixtureだけで、借用モデル本体の読込はしていない。

これは小さな静的室内での確認。実ステージの巨大volume、細い開口、半透明窓ガラス、動くキャラクター、多段反射、全PCでの速度、すべてのX材質への対応を保証するものではない。
