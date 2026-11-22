# macOS v0.2.5向けE2E全件実行の記録（2026年11月）

## 出典と記録の範囲

元の検証は [Test MMD_modoki on macOS for next release（検証session）](https://app.devin.ai/sessions/23877810d1ff4da8a6969f8e26917c00) による。本書はその全件実行と後続調査・修正を区別して記録する。今回の文書化に伴うE2E再実行ではない。

参照した報告は次の4件。元添付と未コミットのローカルログ全体は本書に同梱しない。添付識別子とSHA-256を残し、以下の引用・失敗IDを元報告と照合できるようにする。

| 略称 | 報告名・添付識別子 | SHA-256 |
| --- | --- | --- |
| Full | `e2e-final-report.md` / `040f6f3d-433b-46f4-a256-e723ea99cc67` | `25bdac3324509a63f01291bf350ab8c9996bfe7ec3632439bffedabbd317613b` |
| Triage | `triage-report.md` / `8c820913-8318-4109-a06c-08b8cfa1567a` | `29ed60e3af34fabbf964709e28c18104b580a14c5e84d1a6f28af2f9ca7ef147` |
| Endpoint | `endpoint-report.md` / `119c2447-045f-44f9-8be1-237b8ff6ab47` | `fe7996cf4b4dfb59376b5a34cf4f1181d8a4b162006ca7b6c2f51a735227597c` |
| Mechanism | `mechanism-report.md` / `d174dba6-2210-48b7-a7e9-27e9e3804e8f` | `b7cbfb8fceb907a01b463385892cfa9ac0a4adccdbb3c38f6dbdc056554df111` |

添付Fullは、先に提供された同名報告（添付識別子 `135b0c4e-9664-4613-9b62-d32964da47b5`）と内容が一致する。失敗分類はこれらの報告と [PR #32](https://github.com/togechiyo/MMD_modoki/pull/32) / [PR #33](https://github.com/togechiyo/MMD_modoki/pull/33) / [PR #34](https://github.com/togechiyo/MMD_modoki/pull/34) の最終内容に基づく。表のA–Hはこの集計用の区分であり、Triage原文の(a)–(d)とは別である。

報告には全件runの実行日を日付として明記した箇所がないため、ファイル名は月単位の `2026-11` とした。ログ内のtimestampや後続PRの日付から実行日を補完しない。

## 環境と対象リビジョン

FullのClassificationとTriageのEnvironment and scopeに記載された範囲を示す。

| 項目 | 報告にある内容 |
| --- | --- |
| 実行環境 | macOS arm64 VM |
| Electron | 45.3.1 |
| Babylon.js | 9.2.0 |
| babylon-mmd | 1.2.0 |
| Playwright | 1.62.1 |
| WebGL renderer | `ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version)` |
| WebGL vendor / version | `Google Inc. (Apple)` / WebGL 2.0 |
| 起動smoke | 既存smokeが `engine=WebGPU` に到達 |
| 全件実行と再実行 | 全件run完了後に個別rerunを開始。rerunは `npm run test:e2e -- <spec>` をsource-synchronized isolated build-workspaceで直列実行 |

WebGLの表示は仮想Apple/Metal backendの観測であり、物理Apple Silicon全般で同じ結果になるという証拠ではない。Fullは物理adapter・他platform・手動目視の確認を行っていないと明記している。

**元の450件runの正確なsource SHAはFullに明記されていない。** Triageは調査時のbranchを `devin/1795252934-macos-e2e-stale-tests`、HEADを `fce54336f4b702956bfc7da4d10eb5fb1a5f622d`（PR #33のcommit）と記録する。また、そのbranchのbaseを `b58b5e1` とし、selector-onlyの変更は調査対象runtimeに影響しないと説明する。これらを元runのSHAと断定しない。

Endpointでは別途、独立した `npm ci` による比較対象を `6441766c997b656e6436afcb3539320128a4ed04` と当時の `origin/main = b58b5e1159779bb49eac132df7eae74480cb5dc4` と明記している。これは全件runではなく、PNG fidelity specのendpoint比較である。

## 全件実行の結果

FullのFull suite節から逐語引用する。

```text
73 failed
80 skipped
297 passed (1.9h)
EXIT_CODE=1
```

Fullはこの直後に **“450 total.”** と記載している。297 + 73 + 80 = 450。全件runを再実行の結果で上書きしたり、focused campaignのpass数を加えたりしない。

## 最終分類と集計上の注意

以下は元runの73失敗だけを配賦した件数である。整数の配賦は正確だが、**原因帰属の確実性は区分・個別ケースによって異なる**。

| Bucket | 最終分類 | 件数 | 留意点 |
| --- | --- | ---: | --- |
| A | 古いtest前提をPR #33で修正 | 36 | singleton selector / Add一覧 / menu / preset / CSM depth bounds。10 specの元失敗数。 |
| B | Triageで古いtestと診断、#33では未修正 | 8 | 6テーマ・6 spec、8 cases。診断した後段の全assertionがpassした意味ではない。 |
| C | 製品不具合を修正（#32 PNG readiness / #34 WebGL2 uniform） | 8 | PNG family 6、WebGL2 2。PNG全6件で同一のcall traceを個別確認した意味ではない。 |
| D | test-side race（pose / multi-modelの即時assertion） | 2 | 元の最初の失敗を分類。同期後に発見した別のPNG不具合を重複加算しない。 |
| E | 既知backlog（zh-Hant 107 missing keys） | 1 | 107は不足キー数、失敗case数は1。 |
| F | RC retired-card互換、製品判断待ちで未変更 | 2 | 旧カード復元locatorで止まる2 spec。 |
| G | 未解決のrendering / backend / 実行環境候補 | 11 | 原因帰属は暫定。window寸法制約1件も含む。GPU固有bug11件と解釈しない。 |
| H | rerunで非再現・flaky候補 | 5 | 後続pass 4件と、元症状が別エラーへ変わった1件。解決数ではない。 |
| **合計** | | **73** | **38 spec、73 cases** |

- Aの修正後にPR #33が報告する **39/39 pass** は、元runの失敗36件とは母数が異なる。
- Bの6テーマはGamma drag、light mode、RC perf counter、GI auto-volume、hidden SSS presets、wide-shadow sample count。後ろの2テーマが各2 casesなので8失敗となる。wide-shadowのsample count変更と特定commitの因果関係は未bisectで、未測定領域まで影品質がpassしたとはしない。
- MCP poseは同一spec内でnormalをD、PBRをHへ分ける。normalはpose適用を待つ診断でraceを確認し、PBRは変更なしの個別rerunでpassした。
- multi-modelは元のseparation 12 / actual 0をDへ分類する。同期後に見つかったPNG-left=0は#32の対象になったが、同一の元失敗をCにも加えない。
- WebGL audioは修正前のTriageで音声付きWebMが完走したためHとする。#34の修正後campaignにも含まれるが、元失敗がuniform修正によって初めて解決したという証拠にはしない。
- luminous-hermiteは元の数値precision failureが再現せず、rerunで `Cannot read properties of undefined (reading 'computeShader')` に変わったためHとする。**passではなく、元症状の非再現**。task lifecycleと元のprecision観測は未解決である。
- Luminousのisolated-PNG emission lossはGに残す。Triageの(d)にも実出力不具合は含まれ、scene-color readinessの修正がmask readinessまで解決したとは確認されていない。
- A+Bは **44/73（約60.3%）**。元runの過半数は古いtest前提の修正対象または診断対象だったと数えられるが、44件全て修正済みではなく、後段の製品問題が存在しないという意味でもない。

## 73件の失敗一覧

ID・spec・title・errorはFullの番号付きfailure tableに対応する。Specの接頭辞は全て `test/e2e/`。titleは原文のまま、errorは短い抜粋とし、長い箇所の省略を `…` で示す。最終bucketのみ後続調査・PRで更新した。

| ID | Spec | Test title | 元runの短いerror抜粋 | Bucket |
| ---: | --- | --- | --- | :---: |
| 1 | `accessory-keyframe-output.spec.mjs` | x accessory visibility and position keys match viewport, PNG and WebM (30 fps) | Error: expect(received).toBeGreaterThan(expected) / Expected: > 50 / Received:   0 | C |
| 2 | `accessory-keyframe-output.spec.mjs` | obj accessory visibility and position keys match viewport, PNG and WebM (60 fps) | Error: expect(received).toBeGreaterThan(expected) / Expected: > 50 / Received:   0 | C |
| 3 | `camera-external-parent-output.spec.mjs` | external-parent camera output (frameGraph, keyed, no background, 60fps) | Error: {"frame":0,"output":{"count":0,"x":null,"y":null},"previews":[{"count":3888,"x":159.5,"y":116.5},{"count":3888,"x":159.5,"y":116.5},{"count":3888,"x":159.5,"y":116.5}]} / Expected: > 200 / Received:   0 | C |
| 4 | `camera-external-parent-output.spec.mjs` | external-parent camera output (classic, keyed, no background, 30fps) | Error: {"frame":0,"output":{"count":0,"x":null,"y":null},"previews":[{"count":3888,"x":159.5,"y":116.5},{"count":3888,"x":159.5,"y":116.5},{"count":3888,"x":159.5,"y":116.5}]} / Expected: > 200 / Received:   0 | C |
| 5 | `camera-external-parent-output.spec.mjs` | external-parent camera output (frameGraph, legacy static, no background, 30fps) | Error: {"frame":0,"output":{"count":0,"x":null,"y":null},"previews":[{"count":3888,"x":159.5,"y":116.5},{"count":3888,"x":159.5,"y":116.5},{"count":3888,"x":159.5,"y":116.5}]} / Expected: > 200 / Received:   0 | C |
| 6 | `effect-instances.spec.mjs` | Gamma instances: separate keys, lifecycle history, stack order, project and output | Error: expect(locator).toBeDisabled() failed / Locator:  locator('[data-effect-instance-row="fx-1fa39d72-a6dc-49ce-9050-653ed6759f86"]').locator('[data-effect-stack-drag]') / Expected: disabled / Received: enabled / - Expect "toBeDisabled" with timeout 15000ms / - waiting for locator('[data-effect-instance-row="fx-1fa39d72-a6dc-49ce-9050-653ed6759f86"]').locator('[data-effect-stack-drag]') / - unexpected value "enabled" / - unexpected v … | B |
| 7 | `effect-keyframe-boundaries.spec.mjs` | Effect key boundaries survive reverse seeks, navigation, moves, deletion, preview and reload | Error: SSAO strength at 31 / Expected: 0.8 / Received: 1 | H |
| 8 | `export-fixture-fidelity.spec.mjs` | V022-013: debug-white survives project round-trip and matches WebM | Error: expect(received).toBeGreaterThan(expected) / Expected: > 500 / Received:   0 | C |
| 9 | `frame-graph-aerial-perspective.spec.mjs` | PMXモデルで空気遠近をFrameGraph描画できる | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="aerialPerspective"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="aerialPerspective"]') | A |
| 10 | `frame-graph-directional-light-shafts.spec.mjs` | directional-light-linked two-color para flare renders without WebGPU validation errors | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="directionalLightShafts"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="directionalLightShafts"]') | A |
| 11 | `frame-graph-directional-light-shafts.spec.mjs` | para flare light side follows the source of directional light in viewport and PNG | TimeoutError: locator.evaluate: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-row="directionalLightShafts"]').locator('[data-effect-stack-control="directionalLightShaftsStrength"]') | A |
| 12 | `frame-graph-effect-controls.spec.mjs` | FrameGraph詳細操作と並べ替え後もruntimeを維持できる | Error: expect(received).toEqual(expected) // deep equality / - Expected  - 0 / + Received  + 3 / +   "rcSkyAmbient", / +   "rcDiffuseGi", / +   "luminousRadiance", / - Timeout 15000ms exceeded while waiting on the predicate | A |
| 13 | `framegraph-effect-toggle.spec.mjs` | FrameGraph warm toggles and all off: gamma | TimeoutError: locator.click: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-row="gamma"]').locator('.effect-layer-name') | A |
| 14 | `framegraph-effect-toggle.spec.mjs` | FrameGraph warm toggles and all off: ssao,ssgi,ssr,offsetShadow,offsetHighlight,aerialPerspective,directionalLightShafts | TimeoutError: locator.uncheck: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-toggle="ssao"]') | A |
| 15 | `framegraph-effect-toggle.spec.mjs` | FrameGraph warm toggles and all off: dof,luminous,bloom,lut,gamma | TimeoutError: locator.click: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-row="gamma"]').locator('.effect-layer-name') | A |
| 16 | `framegraph-effect-toggle.spec.mjs` | FrameGraph warm toggles and all off: motionBlur,distortion,ringParticles,vignette,grain,sharpen,chromatic,edgeBlur | TimeoutError: locator.uncheck: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-toggle="motionBlur"]') | A |
| 17 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: ssao | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="ssao"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="ssao"]') | A |
| 18 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: ssgi | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="ssgi"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="ssgi"]') | A |
| 19 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: dof | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="dof"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="dof"]') | A |
| 20 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: luminous | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="luminous"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="luminous"]') | A |
| 21 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: bloom | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="bloom"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="bloom"]') | A |
| 22 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: directionalLightShafts | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="directionalLightShafts"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="directionalLightShafts"]') | A |
| 23 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: lut | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="lut"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="lut"]') | A |
| 24 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: gamma | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="gamma"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="gamma"]') | A |
| 25 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: motionBlur | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="motionBlur"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="motionBlur"]') | A |
| 26 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: distortion | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="distortion"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="distortion"]') | A |
| 27 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: aerialPerspective | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="aerialPerspective"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="aerialPerspective"]') | A |
| 28 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: offsetShadow | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="offsetShadow"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="offsetShadow"]') | A |
| 29 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: offsetHighlight | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="offsetHighlight"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="offsetHighlight"]') | A |
| 30 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: vignette | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="vignette"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="vignette"]') | A |
| 31 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: grain | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="grain"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="grain"]') | A |
| 32 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: sharpen | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="sharpen"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="sharpen"]') | A |
| 33 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: chromatic | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="chromatic"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="chromatic"]') | A |
| 34 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: edgeBlur | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="edgeBlur"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="edgeBlur"]') | A |
| 35 | `framegraph-outline-audit.spec.mjs` | FrameGraph outline compatibility audit: ssr | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="ssr"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="ssr"]') | A |
| 36 | `light-color-mode.spec.mjs` | light color boost follows the loaded material mode across project restore | Error: expect(received).toBeCloseTo(expected) / Expected: 2 / Received: 1 | B |
| 37 | `luminous-hermite.spec.mjs` | Hermite receiver interpolation smooths probe crossings without changing the cascade field | Error: expect(received).toBeCloseTo(expected, precision) / Expected: 0.4910816035685704 / Received: 0.4910824386850579 | H |
| 38 | `luminous-material-conditions.spec.mjs` | 2D Luminous uses current material conditions and preserves dark occluders without widening RC sources | Error: expect(received).toBeGreaterThan(expected) / Expected: > 20 / Received:   0 | G |
| 39 | `luminous-radiance-animation-performance.spec.mjs` | RC updates only moving geometry during continuous bone and morph animation | Error: expect(received).toBe(expected) // Object.is equality / Expected: 610000 / Received: 0 | B |
| 40 | `luminous-radiance-quality.spec.mjs` | RC reconstructs smooth illumination on curved MMD receivers | Error: expect(received).toBeLessThan(expected) / Expected: < 4 / Received:   6 | G |
| 41 | `mcp-app-control.spec.mjs` | MCP app operations preserve model content boundary (classic) | Error: expect(received).not.toBe(expected) // Object.is equality / Expected: not "3b412c3e4b0fc3c0e2dc086efba2dbd56c60ca7f4152165795b3074e9e9effbb" | H |
| 42 | `mcp-pose-editing.spec.mjs` | MCP batch pose preview, history and key registration (normal) | Error: expect(received).toBeCloseTo(expected, precision) / Expected: 2 / Received: 0 | D |
| 43 | `mcp-pose-editing.spec.mjs` | MCP batch pose preview, history and key registration (PBR) | Error: expect(received).toBeCloseTo(expected, precision) / Expected: 2 / Received: 0 | H |
| 44 | `menu-organization.spec.mjs` | omits empty help entries and ends with Physics, Window, Tools | Error: expect(received).toEqual(expected) // deep equality / - Expected  - 0 / + Received  + 1 / +   "tools.radianceCascadeLab", | A |
| 45 | `multi-model-webm-export.spec.mjs` | V022-006/V022-050: two separated models survive WebM export while viewport playback pauses and recovers | Error: expect(received).toBeCloseTo(expected, precision) / Expected: 12 / Received: 0 | D |
| 46 | `multilingual-layout.spec.mjs` | supported locales keep translated labels inspectable | Error: zh-Hant dictionary keys / - Expected  - 107 / + Received  +   0 / -   "effect.rcLighting.volume", / -   "effect.rcLighting.rcSkyOcclusionNote", / -   "effect.rcLighting.rcDiffuseGiNote", / -   "effect.rcLighting.phaseNote", / -   "experiment.radianceSky.title", / -   "experiment.radianceSky.enabled", | E |
| 47 | `pbr-light-shadow-audit.spec.mjs` | directional occlusion and ambient color audit classic | Error: expect(received).toBe(expected) // Object.is equality / Expected: 0 / Received: 822 | G |
| 48 | `pbr-light-shadow-audit.spec.mjs` | directional occlusion and ambient color audit frameGraph | Error: expect(received).toBe(expected) // Object.is equality / Expected: 0 / Received: 673 | G |
| 49 | `ply-point-cloud.spec.mjs` | colored PLY points render, edit and restore in classic | Error: expect(received).toBeGreaterThan(expected) / Expected: > 150 / Received:   125 | G |
| 50 | `ply-point-cloud.spec.mjs` | colored PLY points render, edit and restore in frameGraph | Error: expect(received).toBeGreaterThan(expected) / Expected: > 150 / Received:   125 | G |
| 51 | `rc-lighting-effect-stack.spec.mjs` | RC lighting cards: singleton lifecycle, keys, legacy project and backend compatibility | Error: expect(received).toBeGreaterThan(expected) / Expected: > 0.3 / Received:   0 | B |
| 52 | `rc-sky-ambient-upper-surface.spec.mjs` | Sky Ambient upper surfaces distinguish lower geometry from an overhead roof | Error: open-top-2.000001: open upper surface / Expected: >= 0.95 / Received:    0.758544921875 | G |
| 53 | `rc-sky-occlusion-low-roof.spec.mjs` | RC sky low-roof quality: 0.2 / 0.5 / 0.9-cell gaps above a fixed receiver | Error: expect(received).toBeGreaterThan(expected) / Expected: > 30 / Received:   20.182944606413997 | G |
| 54 | `rc-sky-occlusion-motion.spec.mjs` | RC sky occlusion follows GUI bone/morph keys on the first direct PNG after manual seeks | TimeoutError: locator.getAttribute: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-row="rcSkyOcclusion"]').locator('[data-effect-stack-item="rcSkyOcclusion"]') | F |
| 55 | `rc-sky-occlusion.spec.mjs` | RC sky occlusion: normal MMD material, UI, neutral off and PNG | TimeoutError: locator.getAttribute: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-row="rcSkyOcclusion"]').locator('[data-effect-stack-item="rcSkyOcclusion"]') | F |
| 56 | `scene-slider-layout.spec.mjs` | lighting, shadow and gravity rows remain aligned across window sizes | Error: expect(received).toEqual(expected) // deep equality / - Expected  - 1 / + Received  + 1 / -   1080, / +   1056, / - Timeout 15000ms exceeded while waiting on the predicate | G |
| 57 | `shader-outline-audit.spec.mjs` | shader outline audit framegraph tofu | Error: expect(received).toBe(expected) // Object.is equality / Expected: 18 / Received: 16 | B |
| 58 | `shader-outline-audit.spec.mjs` | shader outline audit classic tofu | Error: expect(received).toBe(expected) // Object.is equality / Expected: 18 / Received: 16 | B |
| 59 | `shader-shadow-color-presets.spec.mjs` | renders the unified-shadow-color material presets | Error: expect(received).toEqual(expected) // deep equality / - Expected  - 1 / + Received  + 1 / +   "Stage Standard", / -   "Alpha Test", / - Timeout 15000ms exceeded while waiting on the predicate | A |
| 60 | `shadow-csm-tofu-fixtures.spec.mjs` | keeps cascaded shadows active after loading the tofu PMX and OBJ fixtures | Error: expect(received).toMatchObject(expected) / - Expected  - 1 / + Received  + 1 / -   "cascadedAutoCalcDepthBounds": true, / +   "cascadedAutoCalcDepthBounds": false, / - Timeout 15000ms exceeded while waiting on the predicate | A |
| 61 | `shadow-csm-tofu-fixtures.spec.mjs` | renders the tofu OBJ as the first cascaded-shadow caster | Error: expect(received).toMatchObject(expected) / - Expected  - 1 / + Received  + 1 / -   "cascadedAutoCalcDepthBounds": true, / +   "cascadedAutoCalcDepthBounds": false, | A |
| 62 | `shadow-csm-tofu-fixtures.spec.mjs` | keeps PMX meshes registered as cascaded-shadow casters and receivers | Error: expect(received).toMatchObject(expected) / - Expected  - 1 / + Received  + 1 / -   "cascadedAutoCalcDepthBounds": true, / +   "cascadedAutoCalcDepthBounds": false, | A |
| 63 | `ssao.spec.mjs` | SSAO unified simple rendering, legacy files and backend restoration (PBR=false) | TimeoutError: locator.getAttribute: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-item="ssao"]') | A |
| 64 | `ssao.spec.mjs` | SSAO unified simple rendering, legacy files and backend restoration (PBR=true) | TimeoutError: locator.getAttribute: Timeout 30000ms exceeded. / - waiting for locator('[data-effect-stack-item="ssao"]') | A |
| 65 | `stage-standard.spec.mjs` | Stage Standard GUI, persistence and stage rendering (framegraph, sss-no-toon) | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="ssao"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="ssao"]') | A |
| 66 | `stage-standard.spec.mjs` | Stage Standard GUI, persistence and stage rendering (framegraph, sss-blue-toon) | Error: expect(locator).toBeVisible() failed / Locator: locator('[data-effect-stack-row="ssao"]') / Expected: visible / - Expect "toBeVisible" with timeout 15000ms / - waiting for locator('[data-effect-stack-row="ssao"]') | A |
| 67 | `thin-translucency-shadow.spec.mjs` | thin cloth self-shadow comparison classic cascaded zero-bias | Error: expect(received).toBeLessThan(expected) / Expected: < 1000 / Received:   48460 | G |
| 68 | `thin-translucency-shadow.spec.mjs` | thin cloth self-shadow comparison frameGraph cascaded zero-bias | Error: expect(received).toBeLessThan(expected) / Expected: < 1000 / Received:   48460 | G |
| 69 | `webgl-audio-output.spec.mjs` | WebGL2 GUI WebM export preserves video timing and a 440 Hz audio track | VIDEO_EXPORT_FAILED / FrameGraph post effects were not ready for WebM capture / Expected: "completed" / Received: "failed" | H |
| 70 | `webgl-effect-compatibility.spec.mjs` | WebGL2 retains GPU-only effect instances while exporting visible 4K PNG and WebM | Error: page.evaluate: Error: Single PNG RGBA surface capture failed /  | C |
| 71 | `webgl-shadow-depth-refresh.spec.mjs` | WebGL2 retains the wall's shadow on the stage floor across a camera cut | Test timeout of 120000ms exceeded. /  | C |
| 72 | `wide-shadow-stage-travel.spec.mjs` | inspects moving-camera cascade boundaries: classic penumbra=false | Error: expect(received).toBeGreaterThan(expected) / Expected: > 500 / Received:   197 | B |
| 73 | `wide-shadow-stage-travel.spec.mjs` | inspects moving-camera cascade boundaries: frameGraph penumbra=false | Error: expect(received).toBeGreaterThan(expected) / Expected: > 500 / Received:   197 | B |

## 原文の分類定義とendpoint比較

TriageのCategory and blocker interpretation節（原文13–16行）:

> - **(a)** real regression: requires comparable historical pass and current failure; no entry below meets that evidential bar conclusively.
> - **(b)** platform/backend difference: includes a **provisional** backend-sensitive rendering bucket where GPU/platform attribution is not yet proven. Those rows explicitly state the missing discriminator; they are not settled root-cause claims.
> - **(c)** stale test versus intentional documented behavior.
> - **(d)** test-environment/flaky/timing-sensitive; can include a real timing-sensitive product-output bug.

(d)を「環境の問題なので無害」と読み替えない。TriageはPNG correctnessを理由にrelease sign-offを保留する判断を記録し、(a)の基準を満たす新規regressionは確定していないとしている。製品bugであることと、その区間で新しく導入されたregressionであることは別である。

EndpointのResult節（原文5行、最初の2文）:

> The presumed good revision is not good under the requested dependency-faithful checks. No valid good/bad bracket exists in `6441766..origin/main`, so no `git bisect` was started and no causing commit or mechanism is claimed.

Endpointの6441766 run 1（原文22–30行）:

```text
Expected: > 500
Received:   0
Expected: > 50
Received:   0
2 failed
1 passed (3.3m)
EXIT_CODE=1
```

run 2もdebug-whiteとXの2失敗・1 pass（2.1m）。main側も両caseがrunによってpass/failを変えた。以前の単発historical passをgood endpointとする根拠が崩れたため、この区間でbisectを開始していない。これは6441766より前に導入されたと確定した意味でも、後の変更が発生確率へ影響しなかった意味でもない。

Endpoint時点では機序は不明だった。後のMechanismは、readiness gateが復元前のactive-mesh listを見てimport済みモデルの材質を検査せずreadyとなり、capture時の材質未準備でcolor drawを省略した機序を記録する。readinessの検査中だけscene meshesを明示する反事実で画素が回復し、#32の修正へつながった。導入commitの特定とは独立した結論である。

## Skipの内訳と未確認範囲

80 skippedはFullが報告する総数。80件全てのtest名・reasonの一覧は報告にないため、以下の同定分と未確認分を分ける。

| 区分 | 件数 | 根拠 |
| --- | ---: | --- |
| 旧singleton timeline詳細UI | 28 | Gamma 6 / scalar 11 / resource 11。3 specのfile-level skipと当時の収集結果、[個体化総括](./framegraph-effect-instances-summary-2026-10-24.md) の3 spec・28件skip記録。 |
| GLB accessory output | 1 | `accessory-keyframe-output.spec.mjs` のx/obj/glb各1 caseのうちGLBだけを明示skip。GLB import UI無効、fixtureにmanaged meshesがないため。 |
| 残りのreason別配賦 | 51 | 完全な元run skip listがなく未確認。 |
| **合計** | **80** | 28 + 1 + 51。 |

旧UIの根拠は [gamma-keyframe](../test/e2e/gamma-keyframe.spec.mjs) / [scalar-effect-keyframe](../test/e2e/scalar-effect-keyframe.spec.mjs) / [resource-effect-keyframe](../test/e2e/resource-effect-keyframe.spec.mjs) のskip、GLBの根拠は [accessory-keyframe-output](../test/e2e/accessory-keyframe-output.spec.mjs) の条件分岐。当時の収集対象にも各caseが存在することを照合した。

Mechanismの修正後campaignにある **5 pre-existing disabled-GLB skips** は、同じGLB caseを5回のrunでskipした延べ件数であり、元の80にGLBが5件ある意味ではない。Fullはshader-outlineの個別rerunでoptional 2 skippedも報告するが、これを元runの残り51へ一意に配賦できる完全な一覧はない。

Triageの `rc-sky-occlusion` / `rc-sky-occlusion-motion` の “Skipped as requested” は後続調査の対象外という意味。元runではID 54/55として失敗しており、80 skippedへ移動しない。

## 後続修正と残る確認範囲

- [PR #33: 古いFrameGraph E2E期待値の更新](https://github.com/togechiyo/MMD_modoki/pull/33): 唯一のsrc変更は個体の論理typeを示すDOM属性追加。描画の合否閾値を緩めず、macOS arm64 / WebGPUで対象10 spec・39/39 passを報告。RC retired-card互換は製品判断待ちで未変更。
- [PR #32: 復元meshのcapture材質readiness](https://github.com/togechiyo/MMD_modoki/pull/32): PNG製品不具合と、multi-model testの別の早期assertion同期を分離して修正。[PNG readinessの機序メモ](./png-export-capture-readiness-2026-11-21.md) も参照。Mechanismは4 specを各5回連続、計50 passed / 5 GLB skips / 0 failedと報告するが、全450件の再検証ではない。
- [PR #34: WebGL2 non-UBOのCSM uniform宣言](https://github.com/togechiyo/MMD_modoki/pull/34): GLSL fragment宣言を補い、WGSLは維持。macOS arm64でWebGL2関連6/6、WebGPU CSM関連4/4 passを報告。

Bの8件は診断のみであり、Gのrendering/backend候補、Hの未解決な再現性、Fの互換方針は別に残る。focused成功を元run全件のgreen化や配布版・物理adapterの確認として扱わない。本書の追加では製品・testコードを変更せず、lint・unit・smoke・package build・目視検証を再実行していない。
