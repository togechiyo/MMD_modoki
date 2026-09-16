# 背景メディアfixture

`create.mjs`はE2E用の赤一色PNGと赤→緑→青の3秒WebMを生成する。
Canvasと導入済みmediabunny / ChromiumのVP8 encoderだけを使用する自作データで、第三者assetやネットワーク取得は不要。
生成先はテスト専用の一時directoryとし、テスト終了時に削除する。generatorはリポジトリと同じMIT license。
