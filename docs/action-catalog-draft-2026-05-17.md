# Action Catalog Draft

更新日: 2026-05-17

## 目的

既存の keyboard / button / pointer / timeline 操作を Action として棚卸しする。

このドラフトは実装前の整理用であり、まだ source code の Action 型定義ではない。最初の PoC は [Action / Command / 入力管理 調査メモ](./action-command-input-management-note-2026-05-17.md) の方針どおり、完全自前で `keyframe.*` と `playback.*` の狭い範囲から始める。

## 棚卸し状況

2026-05-17 時点では、コード上の `addEventListener` / keyboard handler / canvas pointer handler / timeline callback を起点に、現 UI の主要操作はおおむね洗い出し済み。

洗い出し済み:

- keyboard shortcut
- toolbar / playback / current frame input
- section keyframe button
- timeline canvas / label / scroll 操作
- viewport canvas の mouse / pointer 操作
- selection 系操作
- interpolation panel
- bottom panel の bone / morph / camera 現在値編集
- camera panel / mirroring floor
- model info panel
- shader / material panel
- accessory panel
- runtime / physics / scene environment toggle
- export 設定 / PNG / WebM 出力
- Post Effect 詳細操作
- layout / panel resize / fullscreen

まだ洗い出しが粗い、または実機確認が必要:

- drag and drop 経由の file load / background media load の詳細分岐
- file dialog から複数種別を受ける `project.openFile` の分類
- Frame Graph backend 固有の LUT / SSAO / SSR / DoF / Bloom の細かい依存関係
- shader / material panel の動的生成 UI の表示条件と、material visibility / preset 適用時の差分粒度
- export 設定のうち、UI input listener ではなく export 実行時に参照されるだけの項目
- context menu / default browser behavior 抑止のような、Action 化すべきか微妙な UI event
- 実機 UI を一通り触ったときにだけ見える hidden / disabled / conditional control

進捗感としては、Action 型設計に進めるための棚卸しは 90% 前後完了。UI刷新前の完全な操作台帳としては、実機 UI を触りながら上記の未確認項目を追加確認する必要がある。

## 分類

Action type は次の namespace に分ける。

| namespace | 用途 | 初期優先度 |
| --- | --- | --- |
| `playback.*` | 再生、停止、シーク、フレーム移動 | 高 |
| `timeline.*` | timeline 上の seek / track select / frame select | 高 |
| `keyframe.*` | keyframe 追加、削除、移動、登録 | 高 |
| `interpolation.*` | 補間曲線 copy / paste / reset / preset | 中 |
| `selection.*` | active model / track / bone / morph / accessory selection | 中 |
| `viewport.*` | camera drag、表示切替、fullscreen | 中 |
| `project.*` | ファイル読み込み、保存、出力 | 中 |
| `effect.*` | light / shadow / post effect / runtime feature 設定 | 低から中 |
| `layout.*` | panel 表示、UI fullscreen、locale | 低 |
| `accessory.*` | accessory visibility / delete / parent / transform | 中 |

## 優先 PoC

最初に Action 化する候補:

| Action type | 現在の入力 | 現在の呼び出し先 | undo 対象 | 優先度 |
| --- | --- | --- | --- | --- |
| `keyframe.addCurrent` | `I` / `K` / `+` / `NumpadAdd` / `Enter`, keyframe add button, interpolation keyframe button | `UIController.addKeyframeAtCurrentFrame()` | yes | P0 |
| `keyframe.deleteSelected` | `Delete`, keyframe delete button | `UIController.deleteSelectedKeyframe()` | yes | P0 |
| `keyframe.nudgeSelected` | `Alt+ArrowLeft` / `Alt+ArrowRight` | `UIController.nudgeSelectedKeyframe()` | yes | P0 |
| `playback.toggle` | `P`, `Space` | `UIController.play()` / `pause()` | no | P0 |
| `playback.stepFrame` | `ArrowLeft` / `ArrowRight`, frame step buttons | `MmdManager.seekToBoundary()` | no | P0 |
| `playback.seekAdjacentKeyframe` | `Ctrl+ArrowLeft` / `Ctrl+ArrowUp` / `Ctrl+ArrowRight` / `Ctrl+ArrowDown`, current keyframe nudge buttons | `UIController.seekToAdjacentKeyframePoint()` | no | P0 |

最初の Vitest 対象:

- `keyframe.addCurrent -> canExecute`
- `keyframe.deleteSelected -> canExecute`
- `keyframe.nudgeSelected -> CommandDiff`
- `keyframe.nudgeSelected -> mergeKey`
- `HistoryManager.push / undo / redo / canUndo / canRedo`

## Keyboard Shortcuts

`src/ui-controller.ts` の `setupKeyboard()` 由来。

| 現在の入力 | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| `Escape` when UI fullscreen | `layout.fullscreen.exit` | `layoutUiController.exitUiFullscreenMode()` | no | fullscreen 中のみ |
| `Alt+Enter` | `layout.fullscreen.toggle` | `layoutUiController.toggleUiFullscreenMode()` | no | MMD-like fullscreen |
| `Ctrl+S` | `project.save` | `saveProject()` | no | overwrite when possible |
| `Ctrl+Alt+S` | `project.saveAs` | `saveProject(true)` | no | save as |
| `Ctrl+Alt+O` | `project.load` | `loadProject()` | no | history は保持 |
| `Ctrl+O` | `project.openModel` | `loadPMX()` | no | PMX / PMD |
| `Ctrl+M` | `project.openMotion` | `loadVMD()` | no | VMD / VPD |
| `Ctrl+Shift+M` | `project.openCameraMotion` | `loadCameraVMD()` | no | camera VMD |
| `Ctrl+Shift+A` | `project.openAudio` | `loadMP3()` | no | audio |
| `Ctrl+Shift+S` | `project.exportPng` | `exportUiController.exportPNG()` | no | export |
| `P` | `playback.toggle` | `play()` / `pause()` | no | button と統合候補 |
| `Space` | `playback.toggle` | `play()` / `pause()` | no | `P` と同義 |
| `Home` | `playback.seekStart` | `seekToBoundary(startFrame)` | no | playback range start |
| `End` | `playback.seekEnd` | `seekToBoundary(endFrame)` | no | playback range end |
| `ArrowLeft` | `playback.stepFrame` | `seekToBoundary(currentFrame - 1)` | no | `Shift` で 10 frame |
| `ArrowRight` | `playback.stepFrame` | `seekToBoundary(currentFrame + 1)` | no | `Shift` で 10 frame |
| `Ctrl+ArrowLeft` / `Ctrl+ArrowUp` | `playback.seekAdjacentKeyframe` | `seekToAdjacentKeyframePoint(-1)` | no | selected track の前 key |
| `Ctrl+ArrowRight` / `Ctrl+ArrowDown` | `playback.seekAdjacentKeyframe` | `seekToAdjacentKeyframePoint(1)` | no | selected track の次 key |
| `I` / `K` / `+` / `NumpadAdd` / `Enter` | `keyframe.addCurrent` | `addKeyframeAtCurrentFrame()` | yes | selected track 必須 |
| `Delete` | `keyframe.deleteSelected` | `deleteSelectedKeyframe()` | yes | selected track / frame |
| `Alt+ArrowLeft` | `keyframe.nudgeSelected` | `nudgeSelectedKeyframe(-1)` | yes | frame selected 時は move、未選択時は seek |
| `Alt+ArrowRight` | `keyframe.nudgeSelected` | `nudgeSelectedKeyframe(1)` | yes | frame selected 時は move、未選択時は seek |
| `Tab` / `Shift+Tab` / `IntlRo` | `selection.cycleActiveModel` | `cycleActiveModelByShortcut()` | no | model target へ切替 |
| `G` | `viewport.toggleGround` | `sceneEnvironmentUiController.toggleGround()` | no | 表示切替 |
| `E` | `viewport.toggleEdge` | `toggleEdgeWidthByShortcut()` | no | model edge width |
| `B` | `viewport.toggleBackgroundBlack` | `sceneEnvironmentUiController.toggleBackgroundBlack()` | no | 背景黒 |

未実装だが近い将来候補:

| Action type 案 | 入力候補 | メモ |
| --- | --- | --- |
| `history.undo` | `Ctrl+Z` | 実装済み |
| `history.redo` | `Ctrl+Y` | 実装済み。`Ctrl+Shift+Z` は redo として扱わない |
| `keyframe.copySelected` | `Ctrl+C` | 既存 MMD shortcut 調査に候補あり |
| `keyframe.paste` | `Ctrl+V` | 既存 MMD shortcut 調査に候補あり |

## Toolbar / Button Actions

`src/ui-controller.ts` の `setupEventListeners()` 由来。

| 現在の UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| load file button | `project.openFile` | `loadFileFromDialog()` | no | model / motion / audio 等の入口 |
| save project button | `project.saveAs` | `saveProject(true)` | no | button は save as |
| load project button | `project.load` | `loadProject()` | no | history は保持 |
| export PNG button | `project.exportPng` | `exportPNG()` | no | background export lock あり |
| export PNG sequence button | `project.exportPngSequence` | `exportPNGSequence()` | no | 出力系 |
| export WebM button | `project.exportWebm` | `exportWebm()` | no | 出力系 |
| locale select | `layout.setLocale` | `setLocale()` | no | UI state |
| runtime mode select | `runtime.setMode` | localStorage 保存 + reload | no | side effect 大 |
| play button | `playback.play` | `play()` | no | toggle ではなく明示 play |
| pause button | `playback.pause` | `pause()` | no | 明示 pause |
| stop button | `playback.stop` | `stop()` | no | start frame へ戻る場合あり |
| skip start button | `playback.seekStart` | `seekToBoundary(startFrame)` | no | shortcut Home と統合 |
| skip end button | `playback.seekEnd` | `seekToBoundary(endFrame)` | no | shortcut End と統合 |
| current frame input Enter / blur | `playback.seekFrame` | `commitCurrentFrameInput()` | no | text input 内なので shortcut とは別 |
| keyframe add button | `keyframe.addCurrent` | `addKeyframeAtCurrentFrame()` | yes | shortcut と統合 |
| keyframe delete button | `keyframe.deleteSelected` | `deleteSelectedKeyframe()` | yes | shortcut と統合 |
| keyframe nudge left/right buttons | `playback.seekAdjacentKeyframe` | `seekToAdjacentKeyframePoint()` | no | 名前は nudge だが現在は seek |
| frame step left/right buttons | `playback.stepFrame` | `seekToBoundary(currentFrame +/- 1)` | no | shortcut と統合 |
| frame range start/end buttons | `playback.seekStart` / `playback.seekEnd` | `seekToBoundary(0 / totalFrames)` | no | playback range ではなく total range |

## Section Keyframe Actions

| 現在の UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| info keyframe button | `keyframe.registerInfo` | `registerInfoKeyframe()` | yes | model info |
| interpolation keyframe button | `keyframe.addCurrent` | `addKeyframeAtCurrentFrame()` | yes | selected track |
| bone keyframe button | `keyframe.registerBone` | `registerBoneKeyframeAtCurrentFrame()` | yes | bottom panel selected bone |
| morph keyframe button | `keyframe.registerMorph` | `registerMorphKeyframesAtCurrentFrame()` | yes | selected morph frame の全 morph |
| accessory keyframe button | `keyframe.registerAccessoryTransform` | `registerAccessoryTransformKeyframe()` | yes | selected accessory |

PoC では `keyframe.registerBone` / `registerMorph` / `registerAccessoryTransform` は後回し。まず `keyframe.addCurrent` の CommandDiff を固める。

## Timeline Actions

`src/timeline.ts` 由来。

| 現在の入力 | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| static canvas mousedown | `timeline.selectTrackAtPointer` + `playback.seekFrame` | `selectTrackFromStaticEvent()` + `seekFromEvent()` | no | selection と seek が同時発生 |
| overlay canvas mousedown | `playback.seekFrame` | `seekFromEvent()` | no | ruler / overlay seek |
| mousemove during drag | `playback.scrubFrame` | `onSeek(frame)` | no | high frequency、history 不可 |
| label canvas mousedown | `timeline.selectTrackAtPointer` | `selectTrackFromLabelEvent()` | no | track selection |
| track scroll | `timeline.scrollTracks` | scroll sync + redraw | no | Action catalog には入れない可能性あり |
| label scroll | `timeline.scrollLabels` | scroll sync + redraw | no | internal UI event |

Timeline は `timeline.*` と `playback.*` が混ざりやすい。`seek` は playback 側、track/frame selection は timeline 側に寄せる。

2026-05-18: timeline canvas 由来の seek は `timeline.seekFrame` に寄せた。`phase` は `dragStart` / `dragMove` / `dragEnd` を持つ。current frame input / shortcut などの汎用 seek は `playback.seekFrame` のまま分けて扱う。

## Viewport / Canvas Actions

`src/mmd-manager.ts` の canvas event 由来。

| 現在の入力 | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| left click on canvas | `selection.pickBone` | `tryPickBoneVisualizerAtClientPosition()` | no | moved distance <= 6 |
| right drag | `viewport.cameraRotate` | `applyCameraMouseDrag("rotate")` | no | camera animation 再生中は無効 |
| `Shift+right drag` | `viewport.cameraPan` | `applyCameraMouseDrag("pan")` | no | MMD-like |
| `Ctrl+right drag` / `Meta+right drag` | `viewport.cameraZoom` | `applyCameraMouseDrag("zoom")` | no | MMD-like |
| middle drag | `viewport.cameraPan` | `applyCameraMouseDrag("pan")` | no | Chromium autoscroll 抑制 |
| contextmenu | `viewport.suppressContextMenu` | `preventDefault()` | no | Action 化しない可能性あり |
| auxclick middle | `viewport.suppressAuxClick` | `preventDefault()` | no | Action 化しない可能性あり |

Viewport camera 操作は将来 Gamepad stick / MIDI knob と対応しやすい。ただし初期 undo 対象にはしない。カメラ keyframe 登録時に `keyframe.registerCamera` / `registerBone` 側で履歴化する。

2026-05-18: viewport bone pick は `selection.pickBone` に接続済み。camera drag / gizmo drag は begin/change/commit 設計後に扱う。

## Selection Actions

| 入力 / UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| timeline track click | `selection.setTimelineTrack` | `timeline.onSelectionChanged` 経由で UI 同期 | no | selected frame も含む |
| bottom bone select change | `selection.setBone` | `syncTimelineBoneSelectionFromBottomPanel()` | no | bottom panel |
| morph frame select change | `selection.setMorphFrame` | `updateSectionKeyframeButtons()` | no | bottom panel |
| Tab / Shift+Tab | `selection.cycleActiveModel` | `cycleActiveModelByShortcut()` | no | keyboard |
| accessory select change | `selection.setAccessory` | accessory panel refresh / callbacks | no | accessory panel |

Selection は undo 対象外から始める。将来「選択状態も undo したい」要件が出たら別 history として検討する。

## Interpolation Actions

| 現在の入力 | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| interpolation type select change | `interpolation.setType` | `updateTimelineEditState()` | no / later | 現状は UI state 更新 |
| copy button | `interpolation.copy` | `copyInterpolationCurves()` | no | clipboard 的操作 |
| paste button | `interpolation.paste` | `pasteInterpolationCurves()` | yes | 差分対象 |
| linear button | `interpolation.applyLinear` | `resetInterpolationCurvesToLinear()` | yes | 差分対象 |
| interpolation handle drag | `interpolation.updateHandle` / `interpolation.finishHandleDrag` | SVG pointer handlers -> Action | yes | pointer lifecycle は UI 内、値更新と確定処理を Action 化 |

初期 PoC では後回し。`keyframe.addCurrent` 時に補間 snapshot が関係するため、CommandDiff 設計時に参照は必要。

## Effect / Runtime / Scene Actions

多数の slider / toggle があるため、初期は詳細 Action type を増やしすぎない。

| 領域 | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| light direction / intensity / color | `effect.light.setValue` | `mmdManager` light setters | later | slider drag merge 必須 |
| shadow settings | `effect.shadow.setValue` | shadow setters | later | slider drag merge 必須 |
| post effect sliders | `effect.post.setValue` | post effect setters | later | `effectId` + `property` payload |
| physics toggle | `runtime.togglePhysics` | `togglePhysicsEnabled()` | no | runtime side effect |
| AA toggle | `runtime.toggleAntialias` | runtime feature controller | no | 表示系 |
| rigid body visualizer toggle | `runtime.toggleRigidBodyVisualizer` | `toggleRigidBodyVisualizerEnabled()` | no | 表示系 |
| GI toggle | `runtime.toggleGlobalIllumination` | `toggleGlobalIlluminationEnabled()` | no | 重い side effect |
| ground toggle | `viewport.toggleGround` | `toggleGroundVisible()` | no | shortcut `G` と統合 |
| background media toggle | `viewport.toggleBackgroundMedia` | `toggleBackgroundMediaVisible()` | no | scene environment |
| skydome toggle | `viewport.toggleSkydome` | `toggleSkydomeVisible()` | no | scene environment |
| active model visibility | `selection.toggleActiveModelVisibility` | `toggleActiveModelVisibility()` | no / later | model info panel |

Effect 系は Action 化する価値はあるが、undo 対象にすると設定保存 / runtime反映 / slider merge の設計が必要。v0.2 初期では keyframe 系より後。

## Bottom Panel / Bone / Morph Actions

`src/bottom-panel.ts` 由来。UI刷新時に編集体験の中心になるため、keyframe 登録とは別に「現在値を編集する Action」として扱う。

| 現在の入力 / UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| bone select change | `selection.setBone` | `onBoneSelectionChanged` 経由で timeline / gizmo 同期 | no | timeline track selection と相互同期 |
| morph frame select change | `selection.setMorphFrame` | morph controls 切替 | no | 表示対象の morph group |
| bone transform slider input | `edit.bone.setTransformValue` | `applyBoneTransformFromSliders()` | later / yes | tx/ty/tz/rx/ry/rz。drag merge 必須 |
| camera slider input in bottom panel | `edit.camera.setTransformValue` | `applyBoneTransformFromSliders()` の camera 分岐 | later / yes | distance / fov も含む |
| morph weight slider input | `edit.morph.setWeight` | `setMorphWeight()` 相当 | later / yes | keyframe 登録前の現在値編集 |

Bone / Morph は「現在値編集」と「keyframe 登録」を分ける。undo は最初から全 slider を対象にすると重いので、PoC では keyframe Command を先に作り、slider は後続で `begin/change/commit` に分ける。

## Camera Panel Actions

`src/ui/camera-panel-controller.ts` 由来。

| 現在の入力 / UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| left/front/right/top/back/bottom buttons | `viewport.setCameraViewPreset` | `setCameraView()` + camera edited callback | later | camera keyframe 化するなら command 対象 |
| camera distance slider | `viewport.setCameraDistance` | `setCameraDistance()` | later | viewport 操作と同じ camera 現在値編集 |
| mirroring floor enabled | `effect.mirroringFloor.setEnabled` | mirroring floor state update | later | project save/load 済み |
| mirroring floor reflectance | `effect.mirroringFloor.setReflectance` | slider update | later | slider merge 候補 |
| mirroring floor size | `effect.mirroringFloor.setSize` | slider update | later | slider merge 候補 |
| mirroring floor height | `effect.mirroringFloor.setHeight` | slider update | later | slider merge 候補 |
| mirroring floor resolution | `effect.mirroringFloor.setResolution` | select update | later | render target 再生成の可能性 |

## Model / Material / Shader Actions

`src/ui/model-info-panel-controller.ts` と `src/ui/shader-panel-controller.ts` 由来。

| 現在の入力 / UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| info model select | `selection.setActiveModel` | active model target sync | no | Tab shortcut と統合 |
| model visibility button | `model.toggleVisibility` | model visibility update | later | project state なら undo 対象候補 |
| model shadow checkbox | `effect.shadow.setModelCaster` | shadow caster update | later | model 単位の描画設定 |
| model delete button | `project.deleteModel` | confirm 後に remove | yes / later | destructive。undo 対象にするなら asset/state 復元が必要 |
| shader model select | `selection.setShaderModel` | shader target selection | no | active model と分けるか要検討 |
| material list item click | `selection.setMaterial` | material target selection | no | shader panel 内 selection |
| material visibility toggle | `material.toggleVisibility` | material visibility update | later | 表示状態を project state にするか要検討 |
| apply selected shader preset | `material.shader.applyPresetSelected` | selected material へ preset 適用 | yes / later | material state diff |
| apply all shader preset | `material.shader.applyPresetAll` | model materials へ preset 適用 | yes / later | bulk command |
| reset shader preset | `material.shader.resetPreset` | preset reset | yes / later | external WGSL preset も考慮 |

Shader / Material 系は見た目の UI刷新対象として重要だが、Action PoC の最初に入れると diff が大きい。まず catalog に残し、undo は keyframe / interpolation の後に回す。

## Output / Export Setting Actions

`src/ui/export-ui-controller.ts` 由来。export 実行 Action と、出力設定 Action を分ける。

| 現在の入力 / UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| aspect select | `export.setAspect` | preset apply / dimension sync | no | settings state |
| size preset select | `export.setSizePreset` | width / height sync | no | custom size と排他 |
| width input | `export.setWidth` | lock aspect 時は height sync | no | validation 必須 |
| height input | `export.setHeight` | lock aspect 時は width sync | no | validation 必須 |
| lock aspect checkbox | `export.setLockAspect` | dimension sync | no | settings state |
| quality select | `export.setQuality` | export 時に参照 | no | PNG/WebM 共通か確認 |
| fps select | `export.setFps` | sequence / WebM export 時に参照 | no | playback fps とは別 |
| WebM codec select | `export.setWebmCodec` | WebM export 時に参照 | no | support check あり |
| WebM capture mode select | `export.setWebmCaptureMode` | WebM export 時に参照 | no | capture 経路差 |
| include audio checkbox | `export.setIncludeAudio` | WebM export 時に参照 | no | audio loaded 条件 |
| use playback range checkbox | `export.setUsePlaybackRange` | frame range sync | no | range source |
| start / end frame input | `export.setFrameRange` | customized range update | no | validation 必須 |
| playback frame start / stop toggles | `playback.setRangeEnabled` | playback range state | no | export range と関係あり |
| export PNG / sequence / WebM buttons | `project.exportPng` / `project.exportPngSequence` / `project.exportWebm` | export execution | no | command history には積まない |

Export 設定は undo より settings persistence / validation を優先する。Action 化する価値は、UI刷新後にボタン・ショートカット・将来 preset から同じ経路を通せる点。

## Post Effect Detail Actions

`src/ui/bloom-tone-map-controller.ts`、`src/ui/color-postfx-controller.ts`、`src/ui/dof-panel-controller.ts`、`src/ui/lens-effect-controller.ts`、`src/ui/model-edge-controller.ts` 由来。

| 領域 | Action type 案 | 現在の入力 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| tone mapping | `effect.toneMapping.setType` | tone mapping type select | later | backend 差分注意 |
| bloom | `effect.bloom.setValue` | enabled / weight / threshold / kernel sliders | later | Classic / Frame Graph 両方あり |
| glow | `effect.glow.setIntensity` | glow intensity slider | later | model outline と別 |
| color correction | `effect.color.setValue` | contrast / gamma / exposure / saturation | later | Frame Graph 版 input あり |
| dithering | `effect.dithering.setValue` | dithering slider | later | postfx |
| vignette | `effect.vignette.setValue` | vignette slider | later | backend 差分注意 |
| grain / sharpen | `effect.grain.setIntensity` / `effect.sharpen.setEdge` | sliders | later | Frame Graph 版 input あり |
| edge width | `effect.edge.setWidth` | shortcut `E` / edge width slider | later | shortcut と slider を統合 |
| lens chromatic aberration | `effect.lens.setChromaticAberration` | slider | later | Frame Graph 版 input あり |
| lens distortion influence | `effect.lens.setDistortionInfluence` | slider | later | DoF lens distortion と近い |
| lens edge blur | `effect.lens.setEdgeBlur` | slider | later | Frame Graph |
| DoF enabled / quality | `effect.dof.setEnabled` / `effect.dof.setQuality` | checkbox / select | later | camera controls との同期 |
| DoF focus | `effect.dof.setFocusDistance` | focus slider | later | target follow と排他 |
| DoF target model / bone | `effect.dof.setFocusTarget` | model / bone select | later | selection ではなく effect target |
| DoF focus offset / f-stop / near suppression | `effect.dof.setValue` | sliders | later | slider merge |
| DoF focal invert | `effect.dof.setFocalInvert` | checkbox | later | boolean setting |
| DoF lens blur / size / focal length | `effect.dof.setLensValue` | sliders | later | slider merge |
| SSAO / SSR / LUT / postfx backend | `effect.frameGraph.setValue` | backend-specific controls | later | Frame Graph backend の catalog は別途深掘り候補 |

Post Effect は現在の UI 操作数が多い。v0.2 の Action 実装では全てを最初に command 化せず、`effect.post.setValue({ effectId, property, value })` のような汎用 Action 型で受けられる余地だけ残す。

## Runtime / Physics / Scene Actions

`src/ui/runtime-feature-ui-controller.ts` と `src/ui/scene-environment-ui-controller.ts` 由来。

| 現在の入力 / UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| AA toggle | `runtime.toggleAntialias` | antialias state update | no | runtime setting |
| physics toggle | `runtime.togglePhysics` | physics enabled update | no | simulation side effect |
| shadow toggle | `runtime.toggleShadow` | shadow enabled update | no | effect.shadow と統合要検討 |
| rigid body visualizer toggle | `runtime.toggleRigidBodyVisualizer` | debug visualizer update | no | debug display |
| GI toggle | `runtime.toggleGlobalIllumination` | GI update | no | heavy side effect |
| physics simulation rate select | `runtime.physics.setSimulationRate` | rate update | no | physics runtime setting |
| gravity acceleration slider | `runtime.physics.setGravityAcceleration` | gravity update | no | slider merge 不要寄り |
| gravity direction sliders | `runtime.physics.setGravityDirection` | direction vector update | no | x/y/z をまとめて扱う |
| ground toggle | `viewport.toggleGround` | ground visible update | no | shortcut `G` と統合 |
| background media toggle | `viewport.toggleBackgroundMedia` | background media visible update | no | file load と別 |
| skydome toggle | `viewport.toggleSkydome` | skydome visible update | no | scene environment |
| background image/video apply | `project.openBackgroundMedia` | file route から background update | no | drag/drop 入口も catalog 対象 |

Runtime / Physics は undo ではなく「入力経路の統一」が主目的。将来 gamepad / MIDI で runtime toggle を触る可能性は低いが、keyboard custom との整合を考えると Action として定義する価値はある。

## Layout / Panel Actions

`src/ui/layout-ui-controller.ts` 由来。UI刷新では特に見落としやすいが、編集 command ではなく layout state。

| 現在の入力 / UI | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| shader panel toggle button | `layout.toggleShaderPanel` | shader panel collapsed state update | no | panel visibility |
| UI fullscreen button / `Alt+Enter` | `layout.fullscreen.toggle` | fullscreen class / resize | no | shortcut と統合 |
| `Escape` in fullscreen | `layout.fullscreen.exit` | fullscreen exit | no | focus guard |
| timeline resizer drag | `layout.resizeTimeline` | panel height update | no | high frequency UI state |
| shader resizer drag | `layout.resizeShaderPanel` | panel width update | no | high frequency UI state |
| bottom panel resizer drag | `layout.resizeBottomPanel` | panel height update | no | high frequency UI state |
| window resize | `layout.handleWindowResize` | canvas / layout resize | no | user Action ではなく system event |

Layout 系は Action Catalog に入れるが、Command / History には入れない。Tailwind CSS 導入後の UI再構成では、この領域を layout state として分離する。

## Accessory Actions

`src/ui/accessory-panel-controller.ts` 由来。

| 現在の入力 | Action type 案 | 現在の処理 | undo 対象 | メモ |
| --- | --- | --- | --- | --- |
| accessory select change | `selection.setAccessory` | `syncTransformSlidersFromSelection()` | no | selection |
| parent model select change | `accessory.setParentModel` | `setAccessoryParent()` | later | project state 変更 |
| parent bone select change | `accessory.setParentBone` | `setAccessoryParent()` | later | project state 変更 |
| visibility checkbox | `accessory.setVisibility` | `setAccessoryVisibility()` | later | project 保存 / 復元対象 |
| shadow checkbox | `accessory.setShadow` | `setAccessoryCastsShadow()` | later | project 保存 / 復元対象 |
| delete button | `accessory.delete` | `removeAccessory()` | yes / later | 確認 dialog あり |
| transform sliders | `accessory.setTransform` | `setAccessoryTransform()` | yes / later | drag merge 必須 |
| accessory keyframe button | `keyframe.registerAccessoryTransform` | `registerAccessoryTransformKeyframe()` | yes | keyframe 側 |

Accessory は keyframe と project state の両方に関わるため、初期 PoC では `keyframe.registerAccessoryTransform` 以外は後回し。

## Project Actions

| Action type 案 | 現在の入口 | undo 対象 | History への影響 |
| --- | --- | --- | --- |
| `project.openFile` | load file button | no | history は保持 |
| `project.dropFiles` | drag drop | no | drop 順序を拡張子 priority で並べて `loadFileByPath(..., "drop")` |
| `project.openModel` | `Ctrl+O` | no | history は保持 |
| `project.openMotion` | `Ctrl+M` | no | history は保持 |
| `project.openCameraMotion` | `Ctrl+Shift+M` | no | history は保持 |
| `project.openAudio` | `Ctrl+Shift+A` | no | history は保持 |
| `project.save` | `Ctrl+S` | no | なし |
| `project.saveAs` | button / `Ctrl+Alt+S` | no | なし |
| `project.load` | button / `Ctrl+Alt+O` | no | history は保持 |
| `project.exportPng` | button / `Ctrl+Shift+S` | no | なし |
| `project.exportPngSequence` | button | no | なし |
| `project.exportWebm` | button | no | なし |

Project 系 Action は command history に積まない。load / open 系でも、アプリ起動中は command history を保持する。

## Action 型の初期イメージ

```ts
type ActionSource = "button" | "shortcut" | "timeline" | "viewport" | "panel" | "gamepad" | "midi";

type EditorAction =
  | { type: "keyframe.addCurrent"; source: ActionSource }
  | { type: "keyframe.deleteSelected"; source: ActionSource }
  | { type: "keyframe.nudgeSelected"; source: ActionSource; deltaFrames: -1 | 1 }
  | { type: "playback.toggle"; source: ActionSource }
  | { type: "playback.stepFrame"; source: ActionSource; deltaFrames: number }
  | { type: "playback.seekFrame"; source: ActionSource; frame: number }
  | { type: "playback.seekAdjacentKeyframe"; source: ActionSource; direction: -1 | 1 }
  | { type: "selection.cycleActiveModel"; source: ActionSource; direction: -1 | 1 }
  | { type: "viewport.toggleGround"; source: ActionSource }
  | { type: "viewport.toggleEdge"; source: ActionSource }
  | { type: "viewport.toggleBackgroundBlack"; source: ActionSource }
  | { type: "project.save"; source: ActionSource; forceChoosePath?: boolean };
```

## 実装順案

1. `src/actions/types.ts`
   - `ActionSource`
   - `EditorAction`
   - `ActionCategory`
2. `src/actions/action-catalog.ts`
   - P0 Action の definition だけ
   - default keyboard binding
3. `src/actions/keyframe-command-builder.ts`
   - `keyframe.nudgeSelected` から開始
4. `src/actions/history-manager.ts`
   - in-memory stack
5. `src/actions/*.test.ts`
   - Vitest で pure helper を確認
6. `UIController.setupKeyboard()`
   - P0 shortcut だけ ActionDispatcher 経由へ差し替え
7. keyframe buttons
   - shortcut と同じ Action へ差し替え

## 未決事項

- `btnKeyframeNudgeLeft/Right` は現在 `seekToAdjacentKeyframePoint()` なので、Action 名を `keyframe.nudgeSelected` にしない。
- `nudgeSelectedKeyframe()` は selected frame がない場合 seek に fallback する。Action 化時は `keyframe.nudgeSelected` と `playback.stepFrame` / `seekFrame` を分けるべき。
- `Enter` は text input 内では current frame commit、通常時は keyframe add。InputBinding で focus guard が必要。
- `Space` は playback toggle だが、button focus 中や text input 中の扱いを明確にする。
- `project.openModel` / `openMotion` 後も HistoryManager は clear しない。対象 track がなくなった command は executor 失敗として扱う。
- Effect / Accessory の slider は drag start / change / commit の分離が必要。
- Viewport camera drag は将来 Gamepad / MIDI と同じ `viewport.camera*` Action に寄せられるが、初期は runtime 操作のままでもよい。

## 次にやること

- P0 Action の型を `src/actions/types.ts` に定義する。
- `keyframe.nudgeSelected` の `CommandDiff` を設計する。
- `HistoryManager` の最小 test を書く。
- `UIController.setupKeyboard()` の P0 分岐を ActionDispatcher 経由にする範囲を決める。
