---
id: csm-final-distance-cutoff-is-not-cascade-blending
status: verified
priority: normal
scope: rendering/shadows
confidence: high
last_verified: 2026-11-12
evidence:
  - local-electron-webgpu-diagnostic
  - babylon-primary-source
source_docs:
  - ../../docs/csm-wall-band-investigation-2026-11-11.md
  - ../../docs/csm-boundary-unshadowed-band-2026-10-17.md
superseded_by: null
---

# CSMの中間境界と影距離終端を分ける

## 適用条件

壁・床などの連続面に、カスケード境界らしい帯や明るさの段差が見える場合。

## 判断

実際の `viewFrustumZ` と観測点のview depthを比べ、中間blend帯と最終splitを分ける。
Babylon.js 9.2.0標準では最終splitの外で影samplingを止め、終端の距離fadeはない。
自作PMXの壁に屋根の影を落としたWebGPU/FrameGraphでは、半影OFF/ONとも終端で段差が出た。
半影OFFで診断用の影距離を1000から1500へ変えると段差も移動した。

後続の所有者の修正依頼により、共有lightFragmentへ終端fadeを追加した。
設定した影距離の手前10%（最終cascade長の半分以下）で薄め、設定距離・bias・filterは維持する。
初回の実最終split基準は、見下ろし時の画面上端に影抜けを生む回帰だった。auto depth boundsが画面内の最遠面へ範囲を絞っても、影の表示距離には使わない。
MMD Standardの通常陰影ではraw shadowをToonマスクにした後にfadeし、面の向きによるselfMaskは保つ。

## 避けること

- `cascadeBlendPercentage` の増加を終端fadeの代用にする。
- 自動depth boundsで短縮された最終splitをfade終端にする。`SHADOWCSMUSESHADOWMAXZ` だけで自動短縮と設定距離到達を区別する。
- 遠方の壁だけで検証を終える。近景を見下ろす条件と、設定距離でfadeする条件を両方確認する。
- CSMの `frustumEdgeFalloff` を戻し、修正済みの中間境界の影抜けを再発させる。
- 画面外の境界を「帯なし」と判定する、明度比の固定閾値だけで影の有無を決める。
- 屋根による全面遮蔽の再現を、元sceneの自己影や全backendの品質保証に広げる。

## 根拠

[調査記録](../../docs/csm-wall-band-investigation-2026-11-11.md)に、比較条件、画像run、集計、9.2.0のshader分岐、検証結果を記載した。
所有者の「影が終わる所の1本に近い」という報告とも整合するが、元sceneとの直接比較は未実施。
通常MMD以外の独自Toon / external WGSLがshadowを再量子化する条件は、共有fadeだけで同じ遷移幅になるとは扱わない。
修正後はClassic/FrameGraph・半影OFF/ON・PNGを確認した。1フレームWebMでは修正前にも同じ影欠落があり、動画のfade確認済みとはしない。
11/12の上端回帰を自作床で再現し、設定距離基準への訂正後は25/35/45度・両backend・Standard/MMDで上端と中央の影濃度が一致。既存の遠方終端fadeも維持した。

## 再確認条件

Babylon.js更新、影shader・Toon合成・depth boundsの変更、終端fadeの実装時。
元sceneとの比較で帯が最終splitと一致しない場合は、中間境界・自己影・深度精度を別に調査する。
