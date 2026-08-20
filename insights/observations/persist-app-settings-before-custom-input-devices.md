---
id: persist-app-settings-before-custom-input-devices
status: observation
priority: low
scope: experiments/input
confidence: medium
last_verified: null
evidence:
  - design-investigation
source_docs:
  - ../../docs/input-and-app-settings-concept-2026-08-05.md
superseded_by: null
---

# 入力デバイス拡張より先にアプリ設定の永続化を決める

## 適用条件

カスタムshortcut、Gamepad、MIDI、Stream Deck、自動backupを実装するとき。

## 判断

既存localStorageを棚卸しし、project設定とapp設定を分ける。app設定はユーザー意図の `settings` と消えてもよい `state` を分離し、version、atomic write、破損時fallback、debounceを最初から持たせる。入力sourceはinterface越しに正規化してhardwareなしでもテストする。

## 避けること

- key bindingをprojectへ保存する。
- 設定破損でアプリを起動不能にする。
- WebSocket / local serverを入力導線として開く。
- 需要確認前に専用plugin配布物を増やす。

## 根拠

保存場所やversionを後から変えると移行経路が恒久化する。入力割当は作品データではなく利用者の環境設定である。

## 再確認条件

永続データ棚卸しとportable/userData要件が確定したとき。
