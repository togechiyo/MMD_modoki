# FrameGraph stack 並べ替え安定化メモ 2026-08-11

## 症状

FrameGraph effect stack の順番をドラッグ変更した後、一部または全部のエフェクトが消え、手動再読み込みを行うまで戻らないことがあった。特に、固定のtask生成順では後段にあったLuminousを、先に生成されるSSGIより前へ移動する組み合わせで再現した。

## 原因

従来はtaskを固定順でFrameGraphへ登録した後、`sourceTexture`だけをUIのstack順へつなぎ替えていた。Babylon.jsのFrameGraphはtaskを登録順にrecordし、その時点でproducerのdangling texture handleが解決済みであることを前提にする。このため、登録順では後ろにあるproducerを前のconsumerへ接続すると、build中に未解決textureの`creationOptions`を参照して失敗した。

さらに、build済みFrameGraphに対して毎フレーム`sourceTexture`を再接続しており、WebGPUで固定されるべきtexture依存関係を実行中に変更していた。短時間に複数回再構築すると、破棄済みgraphの非同期build callbackが現在のbackendをclassicへ戻す競合もあった。

## 修正

- resource producerをprelude、各effectのtask群をstack順、color correction / FXAA / outputをpostludeとして登録する
- effect内部の複数passは同じgroup内でproducerからconsumerの順に登録する
- `sourceTexture`の接続は`buildAsync()`前の一度だけ行い、`execute()`中は変更しない
- parameter変更によるON/OFFはFrameGraph taskのdisabled passで素通しする
- 連続するstack変更は、現在の非同期buildがreadyになってから最新順序で一度だけ再構築する
- 破棄済みcontrollerから遅れて届いたbuild callbackは無視する
- 右端の手動再読み込みボタンは、予期しないruntime failure向けの復旧手段として残す

projectのstack保存形式と各effectの設定値は変更しない。

## 確認

Electron E2EでSSGIとLuminousを追加し、表示順を`Luminous / SSGI`から`SSGI / Luminous`へドラッグ変更した。内部stackが`luminous,ssgi`へ更新された後、FrameGraph backendがreadyへ戻り、フレーム実行が再開することを確認した。
