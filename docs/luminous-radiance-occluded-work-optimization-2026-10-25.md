# Luminous RC の遮蔽時の補間と発光色評価の削減

実装・比較日: 2026-10-25。[通常 Luminous / Luminous RC の分離](./framegraph-luminous-rc-separation-2026-10-25.md)（`2a95bd5`）を先に完了し、[最適化調査](./luminous-radiance-webgpu-optimization-research-2026-10-25.md)の小さい候補を実装した。

## 変更した処理

[WGSL](../src/render/luminous-radiance-shaders.ts)の3か所を変更した。

1. **receiver は contact trace の後に遠方 field を読む。** 近距離 hit の場合は、その RGB が最終的に使われるため、捨てていた 8 点補間を行わない。hit しない方向だけ従来の field を補間する。
2. **cascade の local hit が不透明なら親 field を読まない。** `local.a == 0` では遠方の寄与が 0 なので、角度 4 点 × 空間 8 点の補間を省く。透過率が正の場合は従来どおり合成する。出力・epoch 更新は維持する。
3. **BVH の最終 nearest hit で発光色を1回だけ評価する。** 探索中は triangle index と barycentric UV を保持し、後からもっと近い面に置き換わる候補の色を読まない。発光 texture の 4 texel 補間も最終面だけで行う。最初の hit で探索を打ち切る方式にはしない。

三角形、BVH の探索順、ray 数、方向数、距離区間、半精度の保存、receiver cache、更新頻度、合成の係数を保つ。現在の不透明 trace の hit / miss の意味と有限の入力を前提に、不要な仕事を省く変更である。

8 / 32 という数はソース上の論理的な load 数。実際の GPU memory transaction・compiler の分岐生成・cache hit を計測した数ではない。近距離 hit が少ないシーンでは receiver 側の削減も小さくなる。

## 比較条件

配布可能な tofu と既存の自作 fixture を使い、変更前 / 後を別 Electron process で実行した。`MMD_RC_COMPLEX_FIXTURE=1` で床 294,912 triangle、骨・morph で変形する球 10,000 triangle、静的な球48個等を配置する。physics は OFF。ユーザー所有モデルは探索・読込しない。

`MMD_RC_FULL_RECEIVER=1` で receiver の再利用を止め、補間削減自体を比較する。dispatch は576×328、静止時の対象126,239点を毎回計算する。通常実行時の cache を無効化する変更ではなく、test helper の指定である。

連続変形の warmup を15 frame、計測を60 frame、静止計測を20 frameとする。receiver 単独は test renderer を停止し、3回 warmup 後の15回から中央値を取る。submission / GPU 完了待ちまでの **wall time** であり、GPU timestamp ではない。GPU counter は N/A のまま。完了待ちを使う処理は test helper 限定で、本体 frame loop に導入しない。

| 指標 | 分離直後・最適化前 | 最適化後 |
| --- | ---: | ---: |
| receiver 単独の完了 wall time 中央値 | 6.11 ms | 5.99 ms |
| 連続変形中の全体 frame interval 中央値 | 33.335 ms | 33.340 ms |
| 静止中の全体 frame interval 中央値 | 16.680 ms | 16.675 ms |
| 連続変形中の CPU prepare 中央値 | 14.995 ms | 14.550 ms |

receiver の差は約0.12 msで小さく、各方式1 process の比較から再現性のある改善率と断定しない。全体 FPS の改善は確認されなかった。CPU prepare の小差も、CPU 経路を変更していない今回の shader 修正の成果とは扱わない。

両方式とも計測区間の geometry 更新61回、cascade dispatch 244回、receiver dispatch 61回で一致する。動的 mesh の refit 610,000 triangle / upload 70,699,488 bytes も一致し、仕事を frame 間引きで減らした結果ではない。

比較用 PNG と JSON は top-level の ignored directory `local-references/luminous-rc-before-optimization/` と `local-references/luminous-rc-final-optimization/` に保存した。renderer 以外のユーザーのアプリを停止して測定環境を占有したわけではなく、所有者の実シーンの FPS へ換算しない。

## 画像・回帰の確認

- 最適化前後の停止後 PNG は全画素・ファイル SHA256 が一致した。`91F37B89A2E68F9644C3F23817EE2549AFC31E7822755A0793B47779BFB655F1`。
- 同じ連続変形テストで、6種類の pose / 法線変更直後を cache あり / 強制全再計算で比較し、全画素一致を確認した。変更後の温まった frame だけで履歴の不備を隠さない。
- 複数の Luminous RC、通常 Glow との独立、旧形式の移行、texture UV、多色、材質色、曲面、強度0・静止再利用、PNG・保存・backend 往復のローカル Electron / WebGPU 回帰10件が成功（4.7分）。WebGPU validation / page error は0。
- lint と `typecheck:critical` 成功。通常 typecheck の既知548 diagnostics が残るが、TS2304 / TS2552 は0件。単体 200 files / 1,255 tests と WebGPU smoke は分離作業で確認済み。今回の WGSL 計算変更は GPU の画像比較・実行で検証した。

## 残る負荷

受け手の方向ごとの ray 数、camera 移動時の全再計算、CPU の shape snapshot / 変形 / triangle pack / refit、geometry capture は残る。今回の小さい削減で重さが解決したとは判断しない。

次に比較するなら、CPU prepare の内訳と GPU の各 pass を測れる診断を先に揃える。probe 側 irradiance の共有は受け手の積分を大きく変え得るが、近距離の方向別 visibility と色を保つ設計が必要。発光変更と形状更新の分離、信頼できる変更 revision、GPU 変形 / refit も別の実装単位で扱う。
