---
id: shadow-caster-empty-list
status: observation
scope: rendering/shadow
confidence: medium
last_verified: 2026-11-21
evidence:
  - runtime-log
  - unit-test
  - electron-webgpu-e2e
  - code-inspection
source_docs:
  - ../../docs/x-accessory-alpha-coplanar-rendering-note-2026-08-20.md
  - ../../docs/csm-boundary-unshadowed-band-2026-10-17.md
superseded_by: null
---

# shadow caster が空になった後は古い map を sampling しない

## 適用条件

明示 caster list を使う shadow generator で、最後の caster を無効化または削除した直後も、receiver に直前の影が残る場合。

## 判断

caster list が空の間は方向光の shadow sampling を停止し、shadow generator の darkness を非表示側へ固定する。caster が戻ったら、全体の影設定と保存済み darkness から sampling を復帰する。

モデル削除時は、対象のメッシュを caster リストから外した直後に全リストの件数で参照状態を同期する。PMX を削除しても OBJ が残る場合がある。10/17 に確認した最後の PMX 削除後の同期漏れは 11/21 に修正した。

## 避けること

- caster list が空で更新されなくなった shadow texture を、そのまま receiver から参照し続けない。
- map の再生成を無条件に行わない。
- この現象を、別原因の通常描画 z-fighting と混同しない。

## 根拠

- `src/scene/shadow-caster-runtime-state.test.ts`
- `src/scene/shadow-caster-runtime-state.ts`
- `src/mmd-manager.ts`
- runtime log では、アクセサリの影解除後に caster list が `1` から `0` へ更新されていた。階段の縞はこの対策後も残り、別途逆向き重複 polygon が主因と判明した。
- `test/e2e/csm-boundary.spec.mjs` は通常影・CSM で最後の PMX / OBJ の削除、別 caster が残る削除、PMX 再読込、空プロジェクト復元を検査する。最後の PMX 削除直後の PNG は影 OFF の対照と全画素一致した。

## 未確認

最後の caster を外した直後の残留影だけを対象にした、ユーザー実機での独立比較はまだ行っていない。そのため policy へ昇格させない。

## 再確認条件

- standard shadow と cascaded shadow の生成・破棄経路を変更する場合。
- Babylon.js更新で空 render list 時の shadow map 更新挙動が変わった場合。
- ユーザー実機で最後の caster の ON/OFF を単独比較できた場合。
