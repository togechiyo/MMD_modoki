# 外部親登録確認用PMX

`MMD_modoki`で外部親登録を実装・確認するための自作テストモデル。
第三者モデルやテクスチャには依存しない。

## モデル

- `sss-reference.pmx`: 独自生成のSSS比較fixture。厚い頭部と薄い耳の閉じた楕円体、頭・耳の2材質。外部asset依存なし。形状生成元は同じ再生成script。

- `plate.pmx`: 水色の皿。原点と`センター`ボーンは皿上面の中央
- `tofu.pmx`: クリーム色の直方体。原点と`センター`ボーンは底面の中央
- `dynamic-follower.pmx`: `Physics Input`剛体へ外部親入力を渡し、バネ接続した動的な`Camera Output`で水平遅延を再現する最小モデル
- 両モデルの赤い三角が正面（+Z）の目印
- 材質は本体と正面マーカーの2個
- `plate.pmx`と`tofu.pmx`のボーンは移動・回転可能な`センター`1本で、剛体とジョイントはなし
- `dynamic-follower.pmx`は3ボーン、2剛体、1ジョイント
- `body-source.pmx` / `body-target.pmx` は左右の足IKを含む体格差・Propertyキー確認用モデル
- モーフとテクスチャはなし
- 文字列エンコードはUTF-16LE

## 既知の互換性

- `MMD_modoki`: 読み込み可能
- `PMXEditor`: 異常なし
- 本家`MikuMikuDance`: UTF-16LE化後も読み込み時にクラッシュする

この2体は当面、`MMD_modoki`におけるモデル外部親の実装確認専用とする。
PMXの構造は`babylon-mmd`の`PmxReader`による再読込とPMXEditorで確認できているため、
本家MMD固有の互換性問題は外部親実装と分離して保留する。

## 想定する確認手順

1. `plate.pmx`と`tofu.pmx`を読み込む。
2. 豆腐モデルの`センター`を、皿モデルの`センター`へ外部親登録する。
3. 皿の`センター`を移動し、豆腐が同じ量だけ追従することを確認する。
4. 皿の`センター`を回転し、豆腐の位置・向きと赤い正面マーカーが追従することを確認する。
5. 外部親登録を解除し、豆腐が独立した変換へ戻ることを確認する。

動的ボーンの確認では、`dynamic-follower.pmx`の`External Parent Root`を
`plate.pmx`の`センター`へ外部親登録し、カメラを`Camera Output`へ外部親登録する。
皿をX方向へ移動すると`Physics Input`は即座に追従し、`Camera Output`とカメラは
途中値を通って遅れて追従する。

両モデルとも接触位置をY=0に揃えているため、初期状態では豆腐の底面が皿の中央へ載る。

## 再生成

```powershell
npm.cmd run generate:test-models
```

生成スクリプトは、出力したPMXを現在の`babylon-mmd`の`PmxReader`で再読込し、
モデル名、ボーン・剛体・ジョイント数、頂点・面・材質数の整合を検証する。
